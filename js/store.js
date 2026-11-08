(function () {
  'use strict';

  var KEYS = {
    settings: 'mfc.settings',
    progress: 'mfc.progress',
    mylist: 'mfc.mylist',
    watched: 'mfc.watched',
    episodes: 'mfc.episodes',
    videos: 'mfc.videos'
  };

  // Watch data (progress, My List, watched marks) lives in a namespace per profile while signed in to sync.
  // Without an account it uses the plain keys above, exactly as before ("guest").
  var DATA_KEYS = [KEYS.progress, KEYS.mylist, KEYS.watched, KEYS.episodes, KEYS.videos];
  var ns = '';

  function scoped(key) {
    return DATA_KEYS.indexOf(key) >= 0 ? key + ns : key;
  }

  function readRaw(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function read(key, fallback) {
    return readRaw(scoped(key), fallback);
  }

  function write(key, value) {
    try {
      localStorage.setItem(scoped(key), JSON.stringify(value));
    } catch (e) { /* storage full or unavailable */ }
  }

  // Tells the sync layer what changed: kind ('list', 'progress', 'watched', 'episode', 'video'), key, the new value, and whether it was removed.
  function changed(kind, key, value, deleted) {
    if (MF.store.onChange) MF.store.onChange(kind, key, value, !!deleted);
  }

  function itemKey(type, id) {
    return type + ':' + id;
  }

  var MF = window.MF = window.MF || {};

  MF.settings = Object.assign({}, window.MF_DEFAULTS, read(KEYS.settings, {}));
  // Data left by the former "My Videos" feature used another format.
  try { localStorage.removeItem('mfc.custom'); } catch (e) { /* ignore */ }

  MF.store = {
    itemKey: itemKey,

    // Everything saved on the TV is stored explicitly, so it always wins over values bundled
    // in config.js / config.local.js, including after the app is reinstalled or updated.
    saveSettings: function (patch) {
      Object.assign(MF.settings, patch);
      write(KEYS.settings, Object.assign(read(KEYS.settings, {}), patch));
    },

    // Watch progress, keyed by "movie:ID" or "tv:ID". For TV the entry tracks the last episode watched.
    getProgress: function (type, id) {
      return read(KEYS.progress, {})[itemKey(type, id)] || null;
    },

    setProgress: function (entry) {
      var all = read(KEYS.progress, {});
      var key = itemKey(entry.type, entry.id);
      var finished = entry.duration > 0 && entry.position / entry.duration > 0.95;
      if (finished && entry.type === 'tv' && entry.season) {
        var eps = read(KEYS.episodes, {});
        var epKey = key + ':' + entry.season + ':' + entry.episode;
        eps[epKey] = Date.now();
        write(KEYS.episodes, eps);
        changed('episode', epKey, eps[epKey], false);
      }
      if (finished && entry.type === 'movie') {
        delete all[key];
        changed('progress', key, null, true);
        MF.store.setWatched({
          id: entry.id, media_type: 'movie', title: entry.title,
          poster_path: entry.poster_path, backdrop_path: entry.backdrop_path
        }, true);
      } else {
        entry.updatedAt = Date.now();
        entry.finished = finished;
        all[key] = entry;
        changed('progress', key, entry, false);
      }
      write(KEYS.progress, all);
    },

    // Progress worth resuming: exactly what the Continue Watching row lists.
    // Unknown duration means a web-page player without progress reporting: it was started, so keep it.
    getResumable: function (type, id) {
      var e = MF.store.getProgress(type, id);
      return e && (e.position > 30 || e.type === 'tv' || !e.duration) ? e : null;
    },

    continueWatching: function () {
      var all = read(KEYS.progress, {});
      return Object.keys(all).map(function (k) { return all[k]; })
        .filter(function (e) { return e.position > 30 || e.type === 'tv' || !e.duration; })
        .sort(function (a, b) { return b.updatedAt - a.updatedAt; })
        .slice(0, 20);
    },

    clearProgress: function () {
      Object.keys(read(KEYS.progress, {})).forEach(function (k) { changed('progress', k, null, true); });
      write(KEYS.progress, {});
    },

    myList: function () {
      return read(KEYS.mylist, []);
    },

    inMyList: function (type, id) {
      var key = itemKey(type, id);
      return read(KEYS.mylist, []).some(function (i) { return itemKey(i.media_type, i.id) === key; });
    },

    // ---- Already watched ----
    isWatched: function (type, id) {
      return !!read(KEYS.watched, {})[itemKey(type, id)];
    },

    // Newest first.
    watchedList: function () {
      var all = read(KEYS.watched, {});
      return Object.keys(all).map(function (k) { return all[k]; })
        .sort(function (a, b) { return b.watchedAt - a.watchedAt; });
    },

    setWatched: function (item, on) {
      var all = read(KEYS.watched, {});
      var key = itemKey(item.media_type, item.id);
      if (on) {
        var prev = all[key] || {};
        all[key] = {
          id: item.id,
          media_type: item.media_type,
          title: item.title || item.name || prev.title,
          poster_path: item.poster_path || prev.poster_path,
          backdrop_path: item.backdrop_path || prev.backdrop_path,
          overview: item.overview || prev.overview,
          vote_average: item.vote_average || prev.vote_average,
          release_date: item.release_date || item.first_air_date || prev.release_date,
          genre_ids: item.genre_ids || (item.genres || []).map(function (g) { return g.id; }),
          watchedAt: Date.now()
        };
        // Watched titles leave Continue Watching.
        var prog = read(KEYS.progress, {});
        if (prog[key]) { delete prog[key]; write(KEYS.progress, prog); changed('progress', key, null, true); }
        changed('watched', key, all[key], false);
      } else {
        delete all[key];
        changed('watched', key, null, true);
      }
      write(KEYS.watched, all);
      return !!on;
    },

    episodeWatched: function (id, season, episode) {
      return !!read(KEYS.episodes, {})[itemKey('tv', id) + ':' + season + ':' + episode];
    },

    toggleMyList: function (item) {
      var list = read(KEYS.mylist, []);
      var key = itemKey(item.media_type, item.id);
      var idx = -1;
      list.forEach(function (i, n) { if (itemKey(i.media_type, i.id) === key) idx = n; });
      if (idx >= 0) {
        list.splice(idx, 1);
        changed('list', key, null, true);
      } else {
        var entry = {
          id: item.id,
          media_type: item.media_type,
          title: item.title || item.name,
          poster_path: item.poster_path,
          backdrop_path: item.backdrop_path,
          overview: item.overview,
          vote_average: item.vote_average,
          release_date: item.release_date || item.first_air_date,
          addedAt: Date.now()
        };
        list.unshift(entry);
        changed('list', key, entry, false);
      }
      write(KEYS.mylist, list);
      return idx < 0;
    },

    // ---- Used by the sync layer ----

    // Switches between guest data (no id) and a signed-in profile's data.
    setNamespace: function (profileId) {
      ns = profileId ? '.' + profileId : '';
    },

    // My Videos: links the user saved by hand. { id, name, url, addedAt, type? }, newest first. type 'mega' = a MEGA folder or file link.
    getVideos: function () {
      return read(KEYS.videos, []);
    },

    saveVideo: function (v) {
      var list = read(KEYS.videos, []);
      var entry = { id: v.id || ('v' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6)), name: v.name, url: v.url, addedAt: v.addedAt || Date.now() };
      if (v.type === 'mega') entry.type = 'mega';
      var at = -1;
      list.forEach(function (x, n) { if (x.id === entry.id) at = n; });
      if (at >= 0) list[at] = entry; else list.unshift(entry);
      write(KEYS.videos, list);
      changed('video', entry.id, entry, false);
      return entry;
    },

    removeVideo: function (id) {
      write(KEYS.videos, read(KEYS.videos, []).filter(function (x) { return x.id !== id; }));
      changed('video', id, null, true);
    },

    // Applies a change that came from another device. It does not call onChange, so it is not sent back.
    applyRemote: function (kind, key, value, deleted) {
      if (kind === 'list') {
        var list = read(KEYS.mylist, []).filter(function (i) { return itemKey(i.media_type, i.id) !== key; });
        if (!deleted && value) list.push(value);
        list.sort(function (a, b) { return (b.addedAt || 0) - (a.addedAt || 0); });
        write(KEYS.mylist, list);
      } else if (kind === 'video') {
        var vids = read(KEYS.videos, []).filter(function (x) { return x.id !== key; });
        if (!deleted && value) vids.push(value);
        vids.sort(function (a, b) { return (b.addedAt || 0) - (a.addedAt || 0); });
        write(KEYS.videos, vids);
      } else if (kind === 'progress' || kind === 'watched' || kind === 'episode') {
        var name = kind === 'progress' ? KEYS.progress : kind === 'watched' ? KEYS.watched : KEYS.episodes;
        var map = read(name, {});
        if (deleted) delete map[key]; else map[key] = value;
        write(name, map);
      }
    },

    // Everything stored in one namespace (null = guest data) as sync changes, for the first upload.
    exportData: function (profileId) {
      var suffix = profileId ? '.' + profileId : '';
      var out = [];
      var now = Date.now();
      (readRaw(KEYS.mylist + suffix, []) || []).forEach(function (i, n) {
        out.push({ kind: 'list', key: itemKey(i.media_type, i.id), value: i, updatedAt: i.addedAt || (now - n) });
      });
      (readRaw(KEYS.videos + suffix, []) || []).forEach(function (v, n) {
        out.push({ kind: 'video', key: v.id, value: v, updatedAt: v.addedAt || (now - n) });
      });
      var prog = readRaw(KEYS.progress + suffix, {});
      Object.keys(prog).forEach(function (k) { out.push({ kind: 'progress', key: k, value: prog[k], updatedAt: prog[k].updatedAt || now }); });
      var watched = readRaw(KEYS.watched + suffix, {});
      Object.keys(watched).forEach(function (k) { out.push({ kind: 'watched', key: k, value: watched[k], updatedAt: watched[k].watchedAt || now }); });
      var eps = readRaw(KEYS.episodes + suffix, {});
      Object.keys(eps).forEach(function (k) { out.push({ kind: 'episode', key: k, value: eps[k], updatedAt: eps[k] || now }); });
      return out;
    },

    // Removes one profile's local copy (used when signing out of a shared TV).
    dropData: function (profileId) {
      DATA_KEYS.forEach(function (k) { try { localStorage.removeItem(k + '.' + profileId); } catch (e) { /* ignore */ } });
    },

    onChange: null
  };
})();
