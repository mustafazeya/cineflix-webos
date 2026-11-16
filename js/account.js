(function () {
  'use strict';

  // Screens and flows for accounts: "Who's watching?", sign-in with a QR code, profile editing, and the Account section in Settings.

  var MF = window.MF;
  var $ = function (id) { return document.getElementById(id); };
  var ui = MF.ui;
  var el = ui.el;

  var managing = false;
  var pairing = null;
  var dialogReturn = null;
  var dialogBack = null;
  var lastExitBack = 0;

  function initial(name) {
    return String(name || '?').trim().charAt(0).toUpperCase() || '?';
  }

  function go(route, params, opts) { MF.app.go(route, params, opts); }

  // ---------- Who's watching ----------

  function tile(profile, onClick) {
    var t = el('button', 'profile-tile focusable' + (managing && profile ? ' managing' : ''));
    var face = el('div', 'profile-face avatar-box');
    if (profile) {
      MF.avatars.paint(face, profile.avatar, profile.color, profile.name);
      if (managing) {
        var veil = el('div', 'profile-veil');
        veil.appendChild(MF.iconEl('edit'));
        face.appendChild(veil);
      }
      if (profile.kids || profile.hasPin) {
        var badges = el('div', 'profile-badges');
        if (profile.kids) badges.appendChild(el('span', 'profile-kids', 'KIDS'));
        if (profile.hasPin) {
          var lock = el('span', 'profile-lock');
          lock.appendChild(MF.iconEl('lock'));
          lock.setAttribute('aria-label', 'PIN protected');
          badges.appendChild(lock);
        }
        face.appendChild(badges);
      }
    } else {
      face.classList.add('profile-add');
      face.appendChild(MF.iconEl('plus'));
    }
    t.appendChild(face);
    t.appendChild(el('div', 'profile-name', profile ? profile.name : 'Add profile'));
    t.addEventListener('click', onClick);
    return t;
  }

  function renderProfiles(list) {
    var row = $('profiles-row');
    row.innerHTML = '';
    list.forEach(function (p) {
      var t = tile(p, function () {
        if (managing) openEditor(p, list);
        else chooseProfile(p, t);
      });
      row.appendChild(t);
    });
    if (list.length < 5) row.appendChild(tile(null, function () { openEditor(null, list); }));
    $('profiles-title').textContent = managing ? 'Manage profiles' : "Who's watching?";
    $('profiles-manage').textContent = managing ? 'Done' : 'Manage profiles';
    MF.nav.focus(row.querySelector('.profile-tile'));
  }

  function showProfiles(preferCache) {
    $('profiles-status').textContent = '';
    var cached = MF.sync.cachedProfiles();
    if (cached.length) renderProfiles(cached);
    return MF.sync.profiles().then(function (list) {
      renderProfiles(list);
    }, function (e) {
      if (!cached.length) $('profiles-status').textContent = e.message;
      else if (e.status === 0) $('profiles-status').textContent = 'Offline. Showing the last known profiles.';
    });
  }

  // A profile with a PIN asks for it when it is chosen. Kids profiles open freely; their PIN is asked when leaving them.
  function chooseProfile(profile, tileEl) {
    if (profile.hasPin && !profile.kids) {
      pinDialog({
        title: 'Enter PIN',
        text: 'Enter the PIN for ' + profile.name + '.',
        submit: function (pin) { return MF.sync.verifyPin(profile.id, pin); },
        onDone: function () { enterProfile(profile); },
        returnTo: tileEl
      });
      return;
    }
    enterProfile(profile);
  }

  function enterProfile(profile) {
    $('profiles-status').textContent = 'Loading ' + profile.name + '...';
    MF.sync.selectProfile(profile.id).then(function () {
      refreshRail();
      return offerGuestImport(profile);
    }).then(function () {
      MF.app.invalidate();
      $('profiles-status').textContent = '';
      go('home', {}, { replace: true });
    });
  }

  // The first time you sign in on a device that already has a list or progress, offer to add it to the profile.
  function offerGuestImport(profile) {
    var acct = MF.sync.account();
    var asked = 'mfc.guestAsked.' + (acct ? acct.email : '');
    var n = MF.sync.guestChanges().length;
    if (!n || localStorage.getItem(asked)) return Promise.resolve();
    return new Promise(function (resolve) {
      openDialog({
        title: 'Add what is on this TV?',
        text: 'This TV already has a list and watch history from before you signed in. Add it to ' + profile.name + '?',
        actions: [
          { label: 'Add it', primary: true, onClick: function () { localStorage.setItem(asked, '1'); MF.sync.importGuestData().then(resolve, resolve); } },
          { label: 'Not now', onClick: function () { localStorage.setItem(asked, '1'); resolve(); } }
        ],
        onCancel: resolve
      });
    });
  }

  // ---------- Dialog ----------

  function openDialog(cfg) {
    var d = $('dialog');
    $('dialog-title').textContent = cfg.title;
    var body = $('dialog-body');
    body.innerHTML = '';
    if (cfg.text) body.appendChild(el('p', 'dialog-text', cfg.text));
    if (cfg.build) cfg.build(body);
    var actions = $('dialog-actions');
    actions.innerHTML = '';
    actions.classList.toggle('stack', !!cfg.stack);
    cfg.actions.forEach(function (a) {
      var b = el('button', 'btn focusable' + (a.primary ? ' btn-primary' : ''), a.label);
      b.addEventListener('click', function () { closeDialog(true); a.onClick(); });
      actions.appendChild(b);
    });
    dialogReturn = cfg.onCancel || null;
    dialogBack = cfg.returnTo || null;
    d.classList.remove('hidden');
    document.body.classList.add('dialog-open');
    MF.nav.focus(cfg.focus ? cfg.focus() : actions.querySelector('.btn'));
  }

  function closeDialog(silent) {
    $('dialog').classList.add('hidden');
    document.body.classList.remove('dialog-open');
    MF.nav.onDigit = null;
    var cb = dialogReturn;
    var back = dialogBack;
    dialogReturn = null;
    dialogBack = null;
    // Focus goes back to what opened the dialog; whatever runs next may move it on.
    if (back && document.body.contains(back)) MF.nav.focus(back, { noScroll: true });
    if (!silent && cb) cb();
    var focusTarget = document.querySelector('.screen.active .focusable');
    if (focusTarget && !silent && !back) MF.nav.focus(focusTarget);
  }

  // ---------- PIN entry ----------

  function pinError(e) {
    if (e.status === 403) return 'That PIN is not right. Try again.';
    return e.message || 'Could not check the PIN';
  }

  // On-screen number pad that also takes the remote's number keys. submit(pin) returns a promise: when it resolves the dialog
  // closes and onDone(pin) runs; when it rejects the message is shown and the PIN is cleared. Back cancels.
  function pinDialog(cfg) {
    var pin = '';
    var busy = false;
    var dots = el('div', 'pin-dots');
    var msg = el('div', 'pin-msg');
    var keys = {};
    var i;
    for (i = 0; i < 6; i++) dots.appendChild(el('span', 'pin-dot'));

    function render() {
      Array.prototype.forEach.call(dots.children, function (d, n) { d.classList.toggle('on', n < pin.length); });
    }
    function add(digit) {
      if (busy || pin.length >= 6) return;
      pin += String(digit);
      msg.textContent = '';
      render();
    }
    function submit() {
      if (busy) return;
      if (pin.length < 4) { msg.textContent = 'Enter 4 to 6 digits'; return; }
      busy = true;
      var entered = pin;
      cfg.submit(entered).then(function () {
        closeDialog(true);
        cfg.onDone(entered);
      }, function (e) {
        busy = false;
        pin = '';
        msg.textContent = pinError(e);
        render();
      });
    }

    openDialog({
      title: cfg.title,
      text: cfg.text,
      returnTo: cfg.returnTo,
      onCancel: cfg.onCancel,
      actions: [{ label: 'Cancel', onClick: function () { if (cfg.onCancel) cfg.onCancel(); } }],
      build: function (body) {
        body.appendChild(dots);
        body.appendChild(msg);
        var pad = el('div', 'pin-pad');
        ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'back', '0', 'ok'].forEach(function (k) {
          var b = el('button', 'key pin-key focusable');
          b.setAttribute('type', 'button');
          if (k === 'back') { b.innerHTML = MF.icon('backspace'); b.setAttribute('aria-label', 'Delete'); b.addEventListener('click', function () { if (!busy) { pin = pin.slice(0, -1); render(); } }); }
          else if (k === 'ok') { b.textContent = 'OK'; b.addEventListener('click', submit); }
          else { b.textContent = k; b.addEventListener('click', function () { add(k); }); }
          keys[k] = b;
          pad.appendChild(b);
        });
        body.appendChild(pad);
      },
      focus: function () { return keys['5']; }
    });
    // Remote number keys type the PIN; OK (the pad's OK key) is then one press away.
    MF.nav.onDigit = function (d) { add(d); MF.nav.focus(keys.ok, { noScroll: true }); return true; };
  }

  // Leaving a kids profile (picker, profile page, settings) needs its PIN, if it has one.
  function leaveKids(next) {
    var proceed = function () { MF.kids.unlock(); next(); };
    var from = MF.nav.current();
    var cached = MF.sync.activeProfile();
    // The PIN may have been set or removed on another device since the profile list was last loaded.
    MF.sync.profiles().then(function () {}, function () {}).then(function () {
      var p = MF.sync.activeProfile() || cached;
      if (!p || !p.hasPin) { proceed(); return; }
      pinDialog({
        title: 'Enter PIN',
        text: 'Enter the PIN for ' + p.name + ' to leave this kids profile.',
        submit: function (pin) { return MF.sync.verifyPin(p.id, pin); },
        onDone: proceed,
        returnTo: from
      });
    });
  }

  // ---------- Edit profile and choose an avatar (full-screen pages, like Netflix) ----------

  // { id, name, avatar, list, kids, maxRating, hasPin, newPin, removePin, currentPin }
  // newPin / removePin are PIN changes waiting for Save; currentPin is the verified PIN of a profile that already has one.
  var draft = null;

  function openEditor(profile, list) {
    var open = function (currentPin) {
      var used = list.map(function (p) { return p.avatar; });
      draft = {
        id: profile ? profile.id : null,
        name: profile ? profile.name : '',
        avatar: profile && MF.avatars.has(profile.avatar) ? profile.avatar : MF.avatars.nextFree(used),
        list: list,
        kids: !!(profile && profile.kids),
        maxRating: (profile && profile.maxRating) || 'PG',
        hasPin: !!(profile && profile.hasPin),
        newPin: undefined,
        removePin: false,
        currentPin: currentPin
      };
      go('profile-edit');
    };
    // Changing a profile that has a PIN needs the PIN first.
    if (profile && profile.hasPin) {
      pinDialog({
        title: 'Enter PIN',
        text: 'Enter the PIN for ' + profile.name + ' to change it.',
        submit: function (pin) { return MF.sync.verifyPin(profile.id, pin); },
        onDone: open,
        returnTo: MF.nav.current()
      });
      return;
    }
    open();
  }

  function paintDraftFace() {
    var def = MF.avatars.byId(draft.avatar);
    MF.avatars.paint($('pedit-face'), draft.avatar, def ? def.bg[0] : '#3a3a3a', draft.name);
  }

  function pinState() {
    if (draft.removePin) return 'removed';
    if (draft.newPin) return 'set';
    return draft.hasPin ? 'has' : 'none';
  }

  function renderOptions() {
    var kidsPins = pinState();
    $('pedit-kids').textContent = 'Kids profile: ' + (draft.kids ? 'On' : 'Off');
    $('pedit-rating').textContent = 'Allow up to: ' + draft.maxRating;
    $('pedit-rating').classList.toggle('hidden', !draft.kids);
    $('pedit-pin').textContent = kidsPins === 'has' || kidsPins === 'set' ? 'Change PIN' : 'Set PIN';
    $('pedit-pin-remove').classList.toggle('hidden', kidsPins !== 'has' && kidsPins !== 'set');
    var hint = {
      none: 'No PIN.',
      has: 'This profile has a PIN.',
      set: 'The new PIN is saved when you choose Save.',
      removed: 'The PIN is removed when you choose Save.'
    }[kidsPins];
    $('pedit-opts-hint').textContent = (draft.kids
      ? 'Kids profiles show only titles up to ' + draft.maxRating + ', and hide Browse, My Videos and Settings. Leaving one asks for its PIN. '
      : 'A PIN asks for a code when this profile is chosen. ') + hint;
  }

  // Two entries: the PIN, then the same PIN again.
  function choosePin() {
    pinDialog({
      title: draft.hasPin || draft.newPin ? 'New PIN' : 'Choose a PIN',
      text: 'Use 4 to 6 digits.',
      submit: function () { return Promise.resolve(); },
      returnTo: $('pedit-pin'),
      onDone: function (first) {
        pinDialog({
          title: 'Repeat the PIN',
          text: 'Enter the same PIN again.',
          submit: function (again) { return again === first ? Promise.resolve() : Promise.reject(new Error('The PINs do not match. Try again.')); },
          returnTo: $('pedit-pin'),
          onDone: function () { draft.newPin = first; draft.removePin = false; renderOptions(); }
        });
      }
    });
  }

  function saveDraft() {
    var name = $('pedit-name').value.trim();
    if (!name) { ui.toast('Enter a name'); MF.nav.focus($('pedit-name')); return; }
    var def = MF.avatars.byId(draft.avatar);
    var fields = { name: name, avatar: draft.avatar, color: def ? def.bg[0] : '#3e63dd', kids: draft.kids, maxRating: draft.kids ? draft.maxRating : null };
    var editing = !!draft.id;
    if (draft.newPin) fields.pin = draft.newPin;
    else if (draft.removePin) fields.pin = null;
    if (editing && fields.pin !== undefined && draft.currentPin) fields.currentPin = draft.currentPin;
    var p = editing ? MF.sync.updateProfile(draft.id, fields) : MF.sync.createProfile(fields);
    p.then(function () {
      var acct = MF.sync.account();
      if (editing && acct && acct.profileId === draft.id) { refreshRail(); MF.app.invalidate(); }
      MF.app.back();
    }, function (e) { ui.toast(e.message); });
  }

  function deleteDraft() {
    openDialog({
      title: 'Delete ' + draft.name + '?',
      text: 'Its list and watch history will be removed from every device. This cannot be undone.',
      actions: [
        { label: 'Delete profile', primary: true, onClick: function () { MF.sync.deleteProfile(draft.id, draft.currentPin).then(function () { MF.app.back(); }, function (e) { ui.toast(e.message); }); } },
        { label: 'Cancel', onClick: function () {} }
      ]
    });
  }

  function renderAvatarPicker() {
    var holder = $('apick-groups');
    holder.innerHTML = '';
    MF.avatars.groups.forEach(function (group) {
      holder.appendChild(el('div', 'apick-group', group));
      var row = el('div', 'apick-row');
      MF.avatars.list.filter(function (x) { return x.group === group; }).forEach(function (a) {
        var b = el('button', 'apick-item focusable' + (a.id === draft.avatar ? ' on' : ''));
        var box = el('div', 'avatar-box');
        MF.avatars.paint(box, a.id);
        b.appendChild(box);
        b.setAttribute('aria-label', a.name);
        b.setAttribute('data-avatar', a.id);
        b.addEventListener('click', function () { draft.avatar = a.id; MF.app.back(); });
        row.appendChild(b);
      });
      holder.appendChild(row);
    });
  }

  // ---------- Sign-in with a phone ----------

  function renderQr(url) {
    var img = $('signin-qr');
    try {
      var qr = window.qrcode(0, 'M');
      qr.addData(url);
      qr.make();
      img.src = qr.createDataURL(10, 3);
      img.classList.remove('hidden');
    } catch (e) {
      img.classList.add('hidden');
    }
  }

  function startSignIn() {
    var server = MF.sync.server();
    $('signin-code').textContent = '';
    $('signin-qr').classList.add('hidden');
    if (!server) {
      $('signin-status').textContent = 'Add your sync server address in Settings first.';
      return;
    }
    $('signin-status').textContent = 'Getting a code...';
    pairing = MF.sync.beginPairing(server, function (u) {
      if (u.status === 'code') {
        $('signin-code').textContent = u.userCode;
        $('signin-status').textContent = 'Waiting for you to sign in on your phone...';
        renderQr(u.qrUrl);
      } else if (u.status === 'approved') {
        $('signin-status').textContent = 'Signed in as ' + u.email;
        pairing = null;
        MF.sync.profiles().then(function (list) {
          if (list.length === 1) chooseProfileFromSignIn(list[0]);
          else go('profiles', {}, { replace: true });
        }, function () { go('profiles', {}, { replace: true }); });
      } else if (u.status === 'expired') {
        $('signin-status').textContent = 'The code expired.';
        $('signin-code').textContent = '';
        $('signin-qr').classList.add('hidden');
        MF.nav.focus($('signin-retry'));
      } else {
        $('signin-status').textContent = u.message || 'Something went wrong.';
        MF.nav.focus($('signin-retry'));
      }
    });
  }

  function chooseProfileFromSignIn(profile) {
    MF.sync.selectProfile(profile.id).then(function () { refreshRail(); return offerGuestImport(profile); }).then(function () {
      MF.app.invalidate();
      go('home', {}, { replace: true });
    });
  }

  function stopSignIn() {
    if (pairing) { pairing.cancel(); pairing = null; }
  }

  // ---------- Settings: account section ----------

  function ago(ts) {
    var s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return Math.round(s / 60) + ' min ago';
    if (s < 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' d ago';
  }

  // The Profile page: who you are signed in as and the sync controls, or how to sign in. It is separate from Settings.
  function renderAccount() {
    var acct = MF.sync.account();
    var profile = MF.sync.activeProfile();
    $('account-in').classList.toggle('hidden', !acct);
    $('account-out').classList.toggle('hidden', !!acct);
    if (!acct) {
      $('account-note').textContent = 'Using CineFlix without an account.';
      $('account-text').textContent = MF.sync.configured()
        ? 'This TV keeps its own list and watch history. Sign in to share them with your phone and your other devices, with a profile for each person.'
        : 'Syncing is not set up on this TV. Add your CineFlix Sync server address in Settings first.';
      return;
    }
    $('account-note').textContent = 'Your list and watch history are kept in step across your devices.';
    MF.avatars.paint($('account-face'), profile && profile.avatar, profile ? profile.color : '#3a3a3a', profile ? profile.name : '?');
    $('account-name').textContent = profile ? profile.name : 'No profile chosen';
    $('account-email').textContent = acct.email;
    var st = MF.sync.status();
    var line;
    if (st.error) line = st.error;
    else if (st.pending) line = st.pending + ' change' + (st.pending === 1 ? '' : 's') + ' waiting to sync';
    else if (st.lastSync) line = 'Synced ' + ago(st.lastSync);
    else line = 'Not synced yet';
    $('account-line').textContent = line;
  }

  function bind() {
    $('profiles-manage').addEventListener('click', function () {
      managing = !managing;
      renderProfiles(MF.sync.cachedProfiles());
    });
    $('signin-cancel').addEventListener('click', function () { MF.app.back(); });
    $('signin-retry').addEventListener('click', function () { stopSignIn(); startSignIn(); });
    $('account-signin').addEventListener('click', function () {
      if (!MF.sync.configured()) { ui.toast('Add the sync server address in Settings first'); return; }
      go('signin');
    });
    $('pedit-save').addEventListener('click', saveDraft);
    $('pedit-cancel').addEventListener('click', function () { MF.app.back(); });
    $('pedit-delete').addEventListener('click', deleteDraft);
    $('pedit-avatar').addEventListener('click', function () { draft.name = $('pedit-name').value; go('avatars'); });
    $('pedit-kids').addEventListener('click', function () { draft.kids = !draft.kids; renderOptions(); });
    $('pedit-rating').addEventListener('click', function () {
      var list = MF.kids.ratings;
      draft.maxRating = list[(list.indexOf(draft.maxRating) + 1) % list.length];
      renderOptions();
    });
    $('pedit-pin').addEventListener('click', choosePin);
    $('pedit-pin-remove').addEventListener('click', function () { draft.newPin = undefined; draft.removePin = draft.hasPin; renderOptions(); });
    $('pedit-name').addEventListener('input', function () { draft.name = $('pedit-name').value; paintDraftFace(); });
    $('account-switch').addEventListener('click', function () { go('profiles'); });
    $('account-manage').addEventListener('click', function () { go('profiles', { manage: true }); });
    $('account-sync').addEventListener('click', function () {
      $('account-line').textContent = 'Syncing...';
      MF.sync.syncNow().then(function () { MF.app.invalidate(); renderAccount(); ui.toast('Synced'); }, function (e) { renderAccount(); ui.toast(e.message); });
    });
    $('account-signout').addEventListener('click', function () {
      openDialog({
        title: 'Sign out?',
        text: 'This TV will stop syncing and remove the synced list and history from this TV. Your data stays on your account.',
        actions: [
          { label: 'Sign out', primary: true, onClick: function () { MF.sync.signOut().then(function () { MF.app.invalidate(); refreshRail(); renderAccount(); ui.toast('Signed out'); }); } },
          { label: 'Cancel', onClick: function () {} }
        ]
      });
    });
    MF.sync.onRemoteChange = function () { MF.app.invalidate(); if (MF.videos) MF.videos.refresh(); };
    MF.sync.onSignedOut = function () { refreshRail(); };
  }

  // ---------- Side rail: the Profile entry ----------

  // Always there. Signed out it shows a person icon; signed in it shows the current profile's initial and name.
  function refreshRail() {
    var tab = $('tab-profile');
    var profile = MF.sync.signedIn() ? MF.sync.activeProfile() : null;
    var face = tab.querySelector('.rail-avatar');
    tab.querySelector('.rail-icon').classList.toggle('hidden', !!profile);
    face.classList.toggle('hidden', !profile);
    if (profile) MF.avatars.paint(face, profile.avatar, profile.color, profile.name);
    tab.querySelector('.tab-label').textContent = profile ? profile.name : 'Profile';
    // Kids profiles lose the tabs that show adult content or lead out of the profile (see js/kids.js).
    document.body.classList.toggle('kids-mode', MF.kids.active());
  }

  // ---------- Start-up and Back ----------

  // Decides what to show first: Home with the profile used last time. "Who's watching?" only appears when this TV has no
  // remembered profile (first sign-in, or that profile was removed).
  function startup(goHome) {
    refreshRail();
    if (!MF.sync.signedIn()) { goHome(); return; }
    var remembered = MF.sync.activeProfile();
    // A profile with a PIN is not reopened on launch without it: choosing it in the picker asks for the PIN.
    if (remembered && remembered.hasPin && !remembered.kids) { go('profiles'); return; }
    if (remembered) {
      goHome();
      var before = remembered.kids + ':' + remembered.maxRating;
      // Check in the background that the remembered profile still exists; if not, ask.
      MF.sync.profiles().then(function (fresh) {
        var id = MF.sync.account().profileId;
        var now = fresh.filter(function (p) { return p.id === id; })[0];
        if (now) {
          refreshRail();
          // Kids settings changed on another device since the last launch: rebuild with the new rules.
          if (now.kids + ':' + now.maxRating !== before) { MF.app.invalidate(); go('home', {}, { replace: true }); }
          return;
        }
        if (fresh.length === 1) { MF.sync.selectProfile(fresh[0].id).then(function () { refreshRail(); MF.app.invalidate(); go('home', {}, { replace: true }); }); }
        else { MF.store.setNamespace(null); go('profiles'); }
      }, function () { /* offline: keep going with the remembered profile */ });
      return;
    }
    MF.sync.profiles().then(function (fresh) {
      if (fresh.length === 1) { MF.sync.selectProfile(fresh[0].id).then(function () { refreshRail(); goHome(); }); }
      else { MF.store.setNamespace(null); go('profiles'); }
    }, function (e) {
      if (e.status === 401) { MF.store.setNamespace(null); goHome(); return; }
      var cached = MF.sync.cachedProfiles();
      if (cached.length === 1) { MF.sync.selectProfile(cached[0].id).then(goHome); }
      else if (cached.length > 1) { MF.store.setNamespace(null); go('profiles'); }
      else goHome();
    });
  }

  function handleBack() {
    if (!$('dialog').classList.contains('hidden')) { closeDialog(false); return true; }
    var entry = MF.app.top && MF.app.top();
    if (entry && entry.route === 'profiles' && managing) {
      managing = false;
      renderProfiles(MF.sync.cachedProfiles());
      return true;
    }
    // On launch "Who's watching?" is the first screen, so Back must not skip it.
    if (entry && entry.route === 'profiles' && MF.app.depth() <= 1) {
      if (Date.now() - lastExitBack < 2500) { MF.app.exit(); return true; }
      lastExitBack = Date.now();
      ui.toast('Press Back again to exit');
      return true;
    }
    return false;
  }

  MF.account = {
    init: function () { bind(); renderAccount(); refreshRail(); },
    startup: startup,
    dialog: openDialog,
    pinDialog: pinDialog,
    leaveKids: leaveKids,
    handleBack: handleBack,
    renderAccount: renderAccount,
    refreshRail: refreshRail,
    accountScreen: {
      enter: function () { renderAccount(); refreshRail(); MF.nav.focus(document.querySelector('#screen-account .settings-group:not(.hidden) .focusable')); },
      leave: function () {}
    },
    editScreen: {
      enter: function (entry, restore) {
        var isNew = !draft.id;
        $('pedit-title').textContent = isNew ? 'Add Profile' : 'Edit Profile';
        $('pedit-name').value = draft.name;
        $('pedit-delete').classList.toggle('hidden', isNew || draft.list.length < 2);
        paintDraftFace();
        renderOptions();
        document.body.classList.add('no-nav');
        MF.nav.focus(restore ? $('pedit-avatar') : (isNew ? $('pedit-name') : $('pedit-avatar')));
      },
      leave: function () {}
    },
    avatarScreen: {
      enter: function () {
        document.body.classList.add('no-nav');
        renderAvatarPicker();
        MF.nav.focus(document.querySelector('#apick-groups .apick-item.on') || document.querySelector('#apick-groups .apick-item'));
      },
      leave: function () {}
    },
    profilesScreen: {
      enter: function (entry) {
        managing = !!(entry && entry.params && entry.params.manage);
        document.body.classList.add('no-nav');
        showProfiles();
      },
      leave: function () { managing = false; }
    },
    signinScreen: {
      enter: function () { startSignIn(); MF.nav.focus($('signin-cancel')); },
      leave: function () { stopSignIn(); renderAccount(); refreshRail(); }
    }
  };
})();
