(function () {
  'use strict';

  // Account, profiles and sync with a CineFlix Sync server (see the cineflix-sync repository).
  // The app stays local-first: everything works offline and without an account ("guest"). While signed in, changes are queued,
  // sent in the background, and changes from other devices are pulled in. For a conflict the newest edit wins, per item.

  var MF = window.MF;

  var STATE_KEY = 'mfc.sync';
  var META_KEY = 'mfc.syncmeta.';
  var QUEUE_KEY = 'mfc.syncq.';
  var FLUSH_DELAY = 8000;
  var PULL_EVERY = 120000;
  var TIMEOUT = 15000;

  function readJson(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function writeJson(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* storage full */ }
  }

  // { server, token, email, profileId, rev: { profileId: n }, profiles: [cached list] }
  var state = readJson(STATE_KEY, {});
  // Version 2 added My Videos. Earlier versions skipped those items but still moved their bookmark past them,
  // so one full re-download is needed to pick up anything saved before the upgrade.
  if (state.token && (state.schema || 1) < 2) {
    state.rev = {};
    state.schema = 2;
    writeJson(STATE_KEY, state);
  }
  var meta = {};            // "kind/key" -> time of the newest edit this device knows about (for the active profile)
  var queue = {};           // "kind/key" -> change waiting to be sent (for the active profile)
  var flushTimer = null;
  var pullTimer = null;
  var busy = false;
  var info = { lastSync: 0, error: '', pending: 0 };

  function saveState() { writeJson(STATE_KEY, state); }
  function saveMeta() { if (state.profileId) writeJson(META_KEY + state.profileId, meta); }
  function saveQueue() {
    if (state.profileId) writeJson(QUEUE_KEY + state.profileId, queue);
    info.pending = Object.keys(queue).length;
  }

  function signedIn() { return !!(state.token && state.server); }
  function active() { return signedIn() && !!state.profileId; }

  function trim(url) { return String(url || '').trim().replace(/\/+$/, ''); }

  // ---- HTTP ----

  function api(method, path, body, opts) {
    opts = opts || {};
    var base = opts.server || state.server;
    var headers = { 'Content-Type': 'application/json' };
    if (!opts.anonymous && state.token) headers.Authorization = 'Bearer ' + state.token;
    var controller = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function () { if (controller) controller.abort(); }, TIMEOUT);
    return fetch(base + path, {
      method: method,
      headers: headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: controller ? controller.signal : undefined
    }).then(function (res) {
      clearTimeout(timer);
      return res.json().catch(function () { return {}; }).then(function (data) {
        if (!res.ok) {
          var err = new Error((data.error && data.error.message) || 'Request failed (' + res.status + ')');
          err.status = res.status;
          err.code = data.error && data.error.code;
          throw err;
        }
        return data;
      });
    }, function (e) {
      clearTimeout(timer);
      var err = new Error('Cannot reach the sync server');
      err.status = 0;
      err.cause = e;
      throw err;
    });
  }

  // 401 means this device was signed out (from another device, or the password changed).
  function guard(promise) {
    return promise.catch(function (e) {
      if (e.status === 401) lostSignIn();
      throw e;
    });
  }

  function lostSignIn() {
    info.error = 'Signed out. Sign in again to keep syncing.';
    state.token = null;
    saveState();
    stopTimers();
    if (MF.sync.onSignedOut) MF.sync.onSignedOut(true);
  }

  // ---- Local changes -> queue ----

  // Keep values small: the server accepts up to 2 KB per item, and long descriptions are re-fetched from TMDB anyway.
  function slim(kind, value) {
    if (!value || typeof value !== 'object') return value;
    var copy = {};
    Object.keys(value).forEach(function (k) { if (k !== 'overview') copy[k] = value[k]; });
    return copy;
  }

  function note(kind, key, value, deleted) {
    if (!active()) return;
    var k = kind + '/' + key;
    var t = Date.now();
    meta[k] = t;
    queue[k] = { kind: kind, key: key, value: deleted ? null : slim(kind, value), deleted: !!deleted, updatedAt: t };
    saveMeta();
    saveQueue();
    scheduleFlush(FLUSH_DELAY);
  }

  function scheduleFlush(delay) {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, delay);
  }

  function flush() {
    clearTimeout(flushTimer);
    var keys = Object.keys(queue);
    if (!active() || busy || !keys.length) return Promise.resolve();
    busy = true;
    var batch = keys.slice(0, 200).map(function (k) { return queue[k]; });
    var profileId = state.profileId;
    return guard(api('POST', '/v1/profiles/' + profileId + '/sync', { changes: batch })).then(function (res) {
      if (state.profileId !== profileId) return;
      batch.forEach(function (c) {
        var k = c.kind + '/' + c.key;
        // Keep the entry if it was edited again while this request was running.
        if (queue[k] && queue[k].updatedAt === c.updatedAt) delete queue[k];
      });
      saveQueue();
      info.lastSync = Date.now();
      info.error = '';
      // The server's revision moves with our own pushes, so the next pull also returns them; harmless and cheap.
      busy = false;
      if (Object.keys(queue).length) scheduleFlush(1000);
      if (res.stale && res.stale.length) return pull();
    }).catch(function (e) {
      busy = false;
      if (e.status !== 401) {
        info.error = e.status === 0 ? 'Offline. Changes will be sent when the server is reachable.' : e.message;
        scheduleFlush(60000);
      }
    });
  }

  // ---- Remote changes -> local ----

  function applyChange(c) {
    var k = c.kind + '/' + c.key;
    if (meta[k] && meta[k] > c.updatedAt) return false;       // this device has a newer edit
    MF.store.applyRemote(c.kind, c.key, c.value, c.deleted);
    meta[k] = c.updatedAt;
    if (queue[k] && queue[k].updatedAt <= c.updatedAt) delete queue[k];
    return true;
  }

  function pull() {
    if (!active()) return Promise.resolve(0);
    var profileId = state.profileId;
    var applied = 0;
    function page() {
      var since = (state.rev && state.rev[profileId]) || 0;
      return guard(api('GET', '/v1/profiles/' + profileId + '/sync?since=' + since)).then(function (res) {
        if (state.profileId !== profileId) return applied;
        res.changes.forEach(function (c) { if (applyChange(c)) applied++; });
        state.rev = state.rev || {};
        state.rev[profileId] = res.rev;
        saveState(); saveMeta(); saveQueue();
        return res.more ? page() : applied;
      });
    }
    return page().then(function (n) {
      info.lastSync = Date.now();
      info.error = '';
      if (n && MF.sync.onRemoteChange) MF.sync.onRemoteChange(n);
      return n;
    }, function (e) {
      if (e.status !== 401) info.error = e.status === 0 ? 'Offline' : e.message;
      throw e;
    });
  }

  function syncNow() {
    return flush().then(pull).then(function () { return flush(); });
  }

  function startTimers() {
    stopTimers();
    pullTimer = setInterval(function () { if (!document.hidden) pull().catch(function () { /* shown in Settings */ }); }, PULL_EVERY);
  }

  function stopTimers() {
    clearInterval(pullTimer);
    clearTimeout(flushTimer);
    pullTimer = null;
  }

  // ---- Profiles ----

  function cacheProfiles(list) {
    state.profiles = list;
    saveState();
    return list;
  }

  function profiles() {
    return guard(api('GET', '/v1/profiles')).then(function (res) { return cacheProfiles(res.profiles); }, function (e) {
      if (e.status === 0 && state.profiles) return state.profiles;      // offline: use the last known list
      throw e;
    });
  }

  function selectProfile(profileId) {
    state.profileId = profileId;
    saveState();
    MF.store.setNamespace(profileId);
    meta = readJson(META_KEY + profileId, {});
    queue = readJson(QUEUE_KEY + profileId, {});
    info.pending = Object.keys(queue).length;
    startTimers();
    return pull().then(function () { return flush(); }, function () { /* offline: local data is shown, sync retries later */ });
  }

  // ---- Sign-in (pairing) ----

  // The TV shows a code and a QR code; the user signs in on a phone and approves it. Returns { cancel }.
  function beginPairing(serverUrl, cb) {
    var server = trim(serverUrl);
    var cancelled = false;
    var timer = null;
    var deviceCode = null;

    function finish(update) {
      if (!cancelled) cb(update);
    }

    api('POST', '/v1/pair/start', { deviceName: 'LG TV', platform: 'webos' }, { server: server, anonymous: true }).then(function (res) {
      if (cancelled) return;
      deviceCode = res.deviceCode;
      var expires = Date.now() + res.expiresIn * 1000;
      finish({ status: 'code', userCode: res.userCode, qrUrl: res.qrUrl, verifyUrl: res.verifyUrl, expiresAt: expires });
      (function poll() {
        timer = setTimeout(function () {
          if (cancelled) return;
          api('POST', '/v1/pair/poll', { deviceCode: deviceCode }, { server: server, anonymous: true }).then(function (r) {
            if (cancelled) return;
            if (r.status === 'approved') {
              state = { server: server, token: r.token, email: r.account.email, rev: {}, profiles: [] };
              saveState();
              finish({ status: 'approved', email: r.account.email });
            } else {
              poll();
            }
          }, function (e) {
            if (cancelled) return;
            if (e.status === 410) finish({ status: 'expired' });
            else if (e.status === 0) poll();         // brief network trouble: keep waiting
            else finish({ status: 'error', message: e.message });
          });
        }, (res.interval || 3) * 1000);
      })();
    }, function (e) {
      finish({ status: 'error', message: e.message });
    });

    return { cancel: function () { cancelled = true; clearTimeout(timer); } };
  }

  function signOut() {
    var profileIds = (state.profiles || []).map(function (p) { return p.id; });
    if (state.profileId && profileIds.indexOf(state.profileId) < 0) profileIds.push(state.profileId);
    var done = signedIn() ? api('POST', '/v1/auth/logout', {}).catch(function () { /* already signed out */ }) : Promise.resolve();
    stopTimers();
    // A shared TV should not keep someone's data after they sign out.
    profileIds.forEach(function (id) {
      MF.store.dropData(id);
      try { localStorage.removeItem(META_KEY + id); localStorage.removeItem(QUEUE_KEY + id); } catch (e) { /* ignore */ }
    });
    MF.store.setNamespace(null);
    state = {};
    meta = {};
    queue = {};
    saveState();
    info = { lastSync: 0, error: '', pending: 0 };
    return done;
  }

  // ---- Guest data -> account ----

  function guestChanges() { return MF.store.exportData(null); }

  function importGuestData() {
    if (!active()) return Promise.resolve();
    guestChanges().forEach(function (c) {
      var k = c.kind + '/' + c.key;
      // Edits already known for this profile are newer than guest data; do not overwrite them.
      if (meta[k] && meta[k] >= c.updatedAt) return;
      MF.store.applyRemote(c.kind, c.key, c.value, false);
      meta[k] = c.updatedAt;
      queue[k] = { kind: c.kind, key: c.key, value: slim(c.kind, c.value), deleted: false, updatedAt: c.updatedAt };
    });
    saveMeta();
    saveQueue();
    return flush();
  }

  // ---- Public API ----

  MF.sync = {
    signedIn: signedIn,
    active: active,
    server: function () { return trim(MF.settings.syncServer); },
    configured: function () { return !!trim(MF.settings.syncServer); },
    account: function () { return signedIn() ? { email: state.email, server: state.server, profileId: state.profileId } : null; },
    cachedProfiles: function () { return state.profiles || []; },
    activeProfile: function () {
      var id = state.profileId;
      var list = state.profiles || [];
      for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
      return null;
    },
    status: function () { return { lastSync: info.lastSync, error: info.error, pending: Object.keys(queue).length }; },

    beginPairing: beginPairing,
    signOut: signOut,
    profiles: profiles,
    selectProfile: selectProfile,
    syncNow: syncNow,
    flush: flush,
    pull: pull,
    guestChanges: guestChanges,
    importGuestData: importGuestData,

    createProfile: function (fields) { return guard(api('POST', '/v1/profiles', fields)).then(function (p) { return profiles().then(function () { return p; }); }); },
    updateProfile: function (id, fields) { return guard(api('PATCH', '/v1/profiles/' + id, fields)).then(function (p) { return profiles().then(function () { return p; }); }); },
    deleteProfile: function (id) {
      return guard(api('DELETE', '/v1/profiles/' + id, {})).then(function () {
        MF.store.dropData(id);
        try { localStorage.removeItem(META_KEY + id); localStorage.removeItem(QUEUE_KEY + id); } catch (e) { /* ignore */ }
        return profiles();
      });
    },

    onRemoteChange: null,
    onSignedOut: null
  };

  // Local edits flow into the queue.
  MF.store.onChange = note;

  // Send changes when the app is hidden, and catch up when it comes back.
  var visEvent = 'hidden' in document ? 'visibilitychange' : 'webkitvisibilitychange';
  document.addEventListener(visEvent, function () {
    if (!active()) return;
    if (document.hidden || document.webkitHidden) flush();
    else pull().catch(function () { /* shown in Settings */ });
  });

  // Restore the active profile after the app restarts.
  if (signedIn() && state.profileId) {
    MF.store.setNamespace(state.profileId);
    meta = readJson(META_KEY + state.profileId, {});
    queue = readJson(QUEUE_KEY + state.profileId, {});
    info.pending = Object.keys(queue).length;
    startTimers();
    pull().then(function () { return flush(); }, function () { /* offline: retried by the timers */ });
  }
})();
