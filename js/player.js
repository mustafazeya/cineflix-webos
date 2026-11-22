(function () {
  'use strict';

  var MF = window.MF;
  var KEY = MF.nav.KEY;
  var HLS_JS = 'js/vendor/hls.min.js';

  var video, ui, frame, state = null, hideTimer = null, hintTimer = null, hintFadeTimer = null, hls = null, hlsLoading = null, megaEngine = null, scrubbing = false;

  function $(id) { return document.getElementById(id); }

  function needsHlsJs(source) {
    return source.type === 'hls' && !video.canPlayType('application/vnd.apple.mpegurl') && !video.canPlayType('application/x-mpegURL');
  }

  // The TV's own HLS player is tried first. When it can't play a stream (for example an encrypted playlist), hls.js takes over.
  function loadHlsJs() {
    if (window.Hls) return Promise.resolve(window.Hls);
    if (hlsLoading) return hlsLoading;
    hlsLoading = new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = HLS_JS;
      s.onload = function () { resolve(window.Hls); };
      s.onerror = function () { hlsLoading = null; reject(new Error('Could not load HLS support')); };
      document.head.appendChild(s);
    });
    return hlsLoading;
  }

  function destroyHls() {
    if (hls) { hls.destroy(); hls = null; }
    if (megaEngine) { megaEngine.destroy(); megaEngine = null; }
  }

  function showUI(focusEl) {
    ui.classList.add('visible');
    if (focusEl) MF.nav.focus(focusEl);
    else if (!cardVisible() && (!MF.nav.current() || !MF.nav.current().closest('.player-ui'))) MF.nav.focus($('player-bar'));
    clearTimeout(hideTimer);
    hideTimer = setTimeout(function () {
      if (!video.paused) ui.classList.remove('visible');
    }, 4500);
  }

  function uiVisible() { return ui.classList.contains('visible'); }

  function setSpinner(on) { $('player-spinner').classList.toggle('hidden', !on); }

  function showError(msg) {
    var box = $('player-error');
    box.textContent = msg;
    box.classList.remove('hidden');
    setSpinner(false);
  }

  function setSource(index, startAt, forceHls) {
    var source = state.sources[index];
    if (!source) { showError('This title could not be played. Check your media server.'); return; }
    state.srcIndex = index;
    state.srcReady = false;
    $('pbtn-quality').textContent = 'Quality: ' + source.label;
    $('pbtn-quality').classList.toggle('hidden', state.sources.length < 2);
    $('pbtn-findsubs').classList.toggle('hidden', !subsOn());
    destroyHls();
    setSpinner(true);
    state.pendingSeek = startAt || 0;
    if (!forceHls) state.hlsTried = false;

    if (source.type === 'mega') {
      // A MEGA file streams into this very <video>, so it has the same controls and subtitles as everything else.
      megaEngine = MF.megaStream.attach(video, source.mega, { onError: function (msg) { if (state && state.srcIndex === index) showError(msg); } });
      var engine = megaEngine;
      engine.ready.catch(function (e) {
        if (!state || megaEngine !== engine) return;
        if (e && e.codecs) { showError('This TV cannot play this video (' + e.codecs.join(', ').replace(/video\/mp4; codecs=|audio\/mp4; codecs=|"/g, '') + ').'); return; }
        failover();
      });
    } else if (forceHls || needsHlsJs(source)) {
      loadHlsJs().then(function (Hls) {
        if (!state || state.srcIndex !== index) return;
        if (!Hls.isSupported()) { showError('HLS playback is not supported here.'); return; }
        hls = new Hls({ xhrSetup: authXhr, maxBufferLength: 40, backBufferLength: 30 });
        hls.loadSource(source.url);
        hls.attachMedia(video);
        if (state.pendingSeek > 1) hls.on(Hls.Events.MANIFEST_PARSED, function () { video.currentTime = state.pendingSeek; });
        hls.on(Hls.Events.ERROR, function (_, data) { if (data.fatal) failover(); });
      }, function (err) { showError(err.message); });
    } else {
      video.src = source.url;
      video.load();
    }
    var p = video.play();
    if (p && p.catch) p.catch(function () { /* autoplay may wait for metadata */ });
  }

  function authXhr(xhr, url) {
    var origins = [MF.settings.serverBase, MF.settings.streamBase].map(function (b) {
      return ((b || '').match(/^([a-z]+:\/\/[^/]+)/i) || [])[1];
    }).filter(Boolean);
    if (MF.settings.serverToken && origins.some(function (o) { return url.indexOf(o) === 0; })) {
      xhr.setRequestHeader('Authorization', 'Bearer ' + MF.settings.serverToken);
    }
  }

  function failover() {
    if (!state) return;
    var current = state.sources[state.srcIndex];
    // The TV's own player gave up on an HLS stream: try hls.js on the same stream before anything else.
    if (current && current.type === 'hls' && !hls && !state.hlsTried) {
      state.hlsTried = true;
      setSource(state.srcIndex, video.currentTime || state.pendingSeek, true);
      return;
    }
    var next = state.srcIndex + 1;
    if (next < state.sources.length) {
      MF.ui.toast('Trying ' + state.sources[next].label + '...');
      setSource(next, video.currentTime || state.pendingSeek);
    } else if (state.pageFallback) {
      openPage(state.pageFallback, video.currentTime || state.pendingSeek || state.resume || 0);
    } else {
      showError('Playback failed. The stream may be unavailable or in an unsupported format.');
    }
  }

  // -- Web page mode: the stream URL is a page with its own player --------------
  // The app keeps keyboard focus so the remote (including Back) always works, and forwards keys
  // to the page with postMessage. The page can report progress back (see tools/makeflix-page-bridge.js).

  var KEY_NAMES = {};
  KEY_NAMES[KEY.LEFT] = 'ArrowLeft'; KEY_NAMES[KEY.RIGHT] = 'ArrowRight';
  KEY_NAMES[KEY.UP] = 'ArrowUp'; KEY_NAMES[KEY.DOWN] = 'ArrowDown'; KEY_NAMES[KEY.ENTER] = 'Enter';
  KEY_NAMES[KEY.PLAY] = 'MediaPlay'; KEY_NAMES[KEY.PAUSE] = 'MediaPause'; KEY_NAMES[KEY.PLAYPAUSE] = 'MediaPlayPause';
  KEY_NAMES[KEY.FF] = 'MediaFastForward'; KEY_NAMES[KEY.RW] = 'MediaRewind';
  KEY_NAMES[KEY.RED] = 'ColorRed'; KEY_NAMES[KEY.GREEN] = 'ColorGreen'; KEY_NAMES[KEY.YELLOW] = 'ColorYellow'; KEY_NAMES[KEY.BLUE] = 'ColorBlue';

  function pageCommand(code) {
    switch (code) {
      case KEY.ENTER: case KEY.PLAYPAUSE: return { cmd: 'toggle' };
      case KEY.PLAY: return { cmd: 'play' };
      case KEY.PAUSE: return { cmd: 'pause' };
      case KEY.LEFT: return { cmd: 'seek', value: -10 };
      case KEY.RIGHT: return { cmd: 'seek', value: 10 };
      case KEY.RW: return { cmd: 'seek', value: -30 };
      case KEY.FF: return { cmd: 'seek', value: 30 };
      default: return {};
    }
  }

  function postToPage(msg) {
    msg.source = 'makeflix';
    if (frame.contentWindow) frame.contentWindow.postMessage(msg, '*');
  }

  function hideHint() {
    var hint = $('page-hint');
    clearTimeout(hintTimer);
    clearTimeout(hintFadeTimer);
    hint.classList.remove('fade');
    hint.classList.add('hidden');
  }

  function showHint() {
    var hint = $('page-hint');
    // Subtitles are only mentioned when a SubDL key is set, i.e. when the CC button exists.
    $('page-hint-subs').classList.toggle('hidden', !(subsOn()));
    $('page-hint-back').textContent = state && state.custom ? 'Press twice to leave' : 'Press twice to return to details';
    clearTimeout(hintTimer);
    clearTimeout(hintFadeTimer);
    hint.classList.remove('fade');
    hint.classList.remove('hidden');
    hintTimer = setTimeout(function () {
      hint.classList.add('fade');
      hintFadeTimer = setTimeout(hideHint, 320);
    }, 4200);
  }

  // Every playback gets a brand-new iframe. A reused one keeps the browser history of earlier movies, and the
  // Back key (a history step on webOS) would then walk the iframe back to an old movie instead of leaving.
  function freshFrame() {
    var f = document.createElement('iframe');
    f.id = 'page-frame';
    f.tabIndex = -1;
    // The wildcards matter: a bare "fullscreen" only covers the frame's first address, so a server that redirects
    // the page to another host would silently lose fullscreen.
    f.setAttribute('allow', 'autoplay *; fullscreen *; encrypted-media *; picture-in-picture *');
    f.setAttribute('allowfullscreen', '');
    frame.parentNode.replaceChild(f, frame);
    frame = f;
    return f;
  }

  function openPage(url, resume) {
    destroyHls();
    video.pause();
    video.removeAttribute('src');
    state.mode = 'page';
    markStarted();
    if (MF.subs) MF.subs.onPageMode(subsOn());
    $('pbtn-findsubs').classList.add('hidden');
    state.pageResume = resume || 0;
    state.pageReady = false;
    $('screen-player').classList.add('page-mode');
    $('player-error').classList.add('hidden');
    ui.classList.remove('visible');
    setSpinner(true);
    freshFrame();
    frame.onload = function () {
      if (!state || state.mode !== 'page') return;
      try { blockPopups(frame.contentWindow, 0); } catch (e) { /* ignore */ }
      setSpinner(false);
      focusPage();
      // Pages that don't send "ready" still get the resume position once loaded.
      if (state.pageResume) postToPage({ cmd: 'seek-to', value: state.pageResume });
    };
    state.resumed = false;
    state.endedFired = false;
    state.leaveOk = false;
    state.warnedAt = 0;
    frame.src = url;
    watchPage();
    watchPopups();
    wakeCc();
    setTimeout(focusPage, 1500);
    showHint();
  }

  // ---- Reading the page's own <video> ----
  // On webOS the app may look inside the player page's frame, so CineFlix follows the page's real video
  // (time, pause, buffering, end) without any help from the page. Where the platform blocks that (a normal
  // desktop browser), this quietly does nothing and the optional makeflix-page-bridge.js still works.
  var watchTimer = null;

  function pageVideo(doc) {
    var best = null;
    var area = -1;
    function scan(d, level) {
      var vids;
      try { vids = d.querySelectorAll('video'); } catch (e) { return; }
      Array.prototype.forEach.call(vids, function (v) {
        var r = v.getBoundingClientRect();
        var a = r.width * r.height;
        if (a > area) { area = a; best = v; }
      });
      if (level >= 3) return;
      var frames;
      try { frames = d.querySelectorAll('iframe, frame'); } catch (e) { return; }
      Array.prototype.forEach.call(frames, function (fr) {
        var inner = null;
        try { inner = fr.contentDocument; } catch (e) { inner = null; }
        if (inner) scan(inner, level + 1);
      });
    }
    scan(doc, 0);
    return best;
  }

  // The page has keyboard focus, so the yellow remote key (subtitles) is picked up from inside its document.
  function hookKeys(doc) {
    if (doc.__cfKeys) return;
    doc.__cfKeys = true;
    doc.addEventListener('keydown', function (e) {
      if (e.keyCode === KEY.YELLOW && state && state.mode === 'page' && subsOn()) {
        e.preventDefault();
        MF.subs.openPanel();
      }
    }, true);
  }

  function stopWatch() {
    if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
    if (popupTimer) { clearInterval(popupTimer); popupTimer = null; }
    clearTimeout(ccTimer);
  }

  // ---- The CC button over a player page ----
  // It shows when the page opens and whenever the viewer clicks or presses a key on the video, then fades after a
  // few seconds so it does not sit over the picture. It stays while it has focus or the subtitle panel is open.
  var ccTimer = null;
  var CC_SHOW_MS = 4000;

  function wakeCc() {
    var cc = $('subs-cc');
    cc.classList.remove('idle');
    clearTimeout(ccTimer);
    ccTimer = setTimeout(function fade() {
      if (!state || state.mode !== 'page') return;
      if (cc.classList.contains('focused') || !$('subs-panel').classList.contains('hidden')) { ccTimer = setTimeout(fade, CC_SHOW_MS); return; }
      cc.classList.add('idle');
    }, CC_SHOW_MS);
  }

  // Clicks and keys inside the page never reach the app, so they are listened for in the page's own documents.
  function hookActivity(doc) {
    if (doc.__cfWake) return;
    doc.__cfWake = true;
    ['mousedown', 'click', 'touchstart', 'keydown'].forEach(function (name) {
      doc.addEventListener(name, wakeCc, true);
    });
  }

  // ---- Pop-ups from the player page ----
  // webOS closes the whole app when a page opens a pop-up window and closes it again at once, which is what many
  // players do on the first click. A sandbox would stop that but makes some pages refuse to play, so instead the
  // page's window.open is replaced by one that opens nothing and hands back a window that is already closed. The page
  // carries on as if its pop-up had come and gone. Needs the same access to the page that pageVideo() uses.
  var popupTimer = null;
  function noPopup() {
    return { closed: true, close: function () {}, focus: function () {}, blur: function () {}, postMessage: function () {}, document: null, location: { href: 'about:blank' } };
  }

  function blockPopups(win, level) {
    if (!win || level > 3) return;
    try {
      if (win.open !== noPopup) win.open = noPopup;
      hookActivity(win.document);
      var frames = win.document.querySelectorAll('iframe, frame');
      Array.prototype.forEach.call(frames, function (fr) {
        var inner = null;
        try { inner = fr.contentWindow; } catch (e) { inner = null; }
        blockPopups(inner, level + 1);
      });
    } catch (e) { /* cross-origin without access: nothing to do */ }
  }

  function watchPopups() {
    if (popupTimer) clearInterval(popupTimer);
    popupTimer = setInterval(function () {
      if (!state || state.mode !== 'page') return;
      try { blockPopups(frame.contentWindow, 0); } catch (e) { /* ignore */ }
    }, 100);
  }

  // Leaving the player on purpose (video ended, page asked to close) skips the Back warning.
  function leave() {
    if (state) state.leaveOk = true;
    MF.app.back();
  }

  // The element the page made fullscreen, with the document it lives in (descends into a fullscreen iframe). Null when not fullscreen.
  function pageFullscreenHost(doc) {
    var d = doc;
    var host = null;
    for (var level = 0; level < 4 && d; level++) {
      var f = null;
      try { f = d.fullscreenElement; } catch (e) { break; }
      if (!f) break;
      host = { doc: d, el: f };
      if (f.tagName !== 'IFRAME' && f.tagName !== 'FRAME') break;
      var inner = null;
      try { inner = f.contentDocument; } catch (e) { inner = null; }
      if (!inner) break;
      host = { doc: inner, el: inner.fullscreenElement || inner.body || inner.documentElement };
      d = inner;
    }
    return host;
  }

  // When the page's video is fullscreen, Back first leaves fullscreen (the Back warning would be hidden behind it).
  function exitPageFullscreen() {
    var exited = false;
    function scan(d, level) {
      if (!d || level > 3) return;
      try {
        if (d.fullscreenElement && d.exitFullscreen) { d.exitFullscreen(); exited = true; }
        Array.prototype.forEach.call(d.querySelectorAll('iframe, frame'), function (fr) {
          var inner = null;
          try { inner = fr.contentDocument; } catch (e) { inner = null; }
          scan(inner, level + 1);
        });
      } catch (e) { /* cross-origin */ }
    }
    try { scan(frame.contentDocument, 0); } catch (e) { /* cross-origin */ }
    return exited;
  }

  // In page mode a stray Back press would drop the video, so the first press only warns.
  // A second press within 3 s returns to the movie or series page.
  function confirmBack() {
    // The first Back only takes the next episode card away (or, on the end card, stops its countdown).
    if (state && cardVisible()) {
      if (!state.nc.ended) { dismissCard(); return true; }
      if (state.nc.counting) { stopCount(); $('next-count').classList.add('hidden'); state.nc.dismissed = true; return true; }
      return false;
    }
    if (!state || state.mode !== 'page' || state.leaveOk) return false;
    if (exitPageFullscreen()) return true;
    if (Date.now() - (state.warnedAt || 0) < 3000) return false;
    state.warnedAt = Date.now();
    MF.ui.toast(state.custom ? 'Press Back again to leave the video' : 'Press Back again to return to the ' + (state.type === 'tv' ? 'series' : 'movie') + ' page', 3000);
    return true;
  }

  function pageEnded() {
    if (!state || state.endedFired) return;
    state.endedFired = true;
    save(true);
    handleEnded();
  }

  function watchPage() {
    stopWatch();
    watchTimer = setInterval(function () {
      if (!state || state.mode !== 'page') return;
      var doc = null;
      try { doc = frame.contentDocument; } catch (e) { doc = null; }
      if (!doc) return;
      hookKeys(doc);
      var v = pageVideo(doc);
      if (!v) return;

      var moving = !(v.paused || v.ended || v.seeking || v.readyState < 3);
      if (MF.subs) {
        MF.subs.onPageMessage({ type: 'time', position: v.currentTime, paused: !moving });
        MF.subs.pageFullscreenSync(v, pageFullscreenHost(doc));
      }

      var dur = v.duration;
      if (dur && isFinite(dur)) {
        if (state.pageResume > 5 && !state.resumed && v.readyState > 0) {
          state.resumed = true;
          try { v.currentTime = Math.min(state.pageResume, Math.max(0, dur - 3)); announceResume(); } catch (e) { /* ignore */ }
        }
        state.pagePos = v.currentTime;
        state.pageDur = dur;
        save(false);
      }
      if (v.ended) pageEnded(); else state.endedFired = false;
    }, 250);
  }

  // The page's own player handles LEFT/RIGHT/OK, so it needs keyboard focus.
  // webOS then sends Back as a history step, which app.js turns into "close the player".
  function focusPage() {
    if (!state || state.mode !== 'page') return;
    if (MF.subs && MF.subs.uiOpen()) return;
    if (cardVisible()) return;
    if (document.activeElement && document.activeElement !== frame && document.activeElement.blur) document.activeElement.blur();
    frame.focus();
    try { if (frame.contentWindow) frame.contentWindow.focus(); } catch (e) { /* cross-origin */ }
  }

  function blurPage() {
    if (document.activeElement === frame) frame.blur();
    window.focus();
  }

  function onPageMessage(e) {
    var d = e.data || {};
    if (!state || state.mode !== 'page' || d.source !== 'makeflix-page' || e.source !== frame.contentWindow) return;
    if (MF.subs) MF.subs.onPageMessage(d);
    if (d.type === 'ready') {
      state.pageReady = true;
      setSpinner(false);
      if (state.pageResume) { postToPage({ cmd: 'seek-to', value: state.pageResume }); announceResume(); }
    } else if (d.type === 'progress') {
      state.pagePos = Number(d.position) || 0;
      state.pageDur = Number(d.duration) || 0;
      save(false);
    } else if (d.type === 'ended') {
      pageEnded();
    } else if (d.type === 'back' || d.type === 'close') {
      leave();
    } else if (d.type === 'error') {
      showError(d.message || 'The player page reported an error.');
    }
  }

  function onPageKey(code) {
    if (code === KEY.STOP) { leave(); return true; }
    if (code === KEY.YELLOW && subsOn()) { MF.subs.openPanel(); return true; }
    // Focus came back to the app (e.g. pointer click): return it to the page, then forward this key.
    setTimeout(focusPage, 0);
    wakeCc();
    if (!KEY_NAMES[code]) return false;
    var msg = pageCommand(code);
    msg.type = 'key';
    msg.key = KEY_NAMES[code];
    msg.keyCode = code;
    postToPage(msg);
    showHint();
    return true;
  }

  function setupSubtitles(subs) {
    Array.prototype.slice.call(video.querySelectorAll('track')).forEach(function (t) { t.remove(); });
    subs.forEach(function (s) {
      var track = document.createElement('track');
      track.kind = 'subtitles';
      track.label = s.label;
      track.srclang = s.lang;
      track.src = s.url;
      video.appendChild(track);
    });
    $('pbtn-subs').classList.toggle('hidden', subs.length === 0);
    applySubtitle(-1);
  }

  function applySubtitle(index) {
    state.subIndex = index;
    for (var i = 0; i < video.textTracks.length; i++) {
      video.textTracks[i].mode = i === index ? 'showing' : 'disabled';
    }
    $('pbtn-subs').textContent = 'Subtitles: ' + (index < 0 ? 'Off' : state.subtitles[index].label);
  }

  // Saved links and MEGA files search by their name instead of a TMDB id.
  function subsOn() { return !!(MF.subs && MF.subs.enabled()); }

  function progressEntry(pos, dur) {
    return {
      type: state.type,
      id: state.id,
      season: state.season,
      episode: state.episode,
      position: pos,
      duration: dur,
      title: state.title,
      subtitle: state.subtitle,
      backdrop_path: state.backdrop_path,
      poster_path: state.poster_path,
      still_path: state.still_path
    };
  }

  function save(force) {
    if (!state || state.finishedMark || (state.custom && !state.resumeKey)) return;
    // Until the new source has loaded, the video element still holds the previous episode's clock.
    if (state.mode !== 'page' && !state.srcReady) return;
    var pos = state.mode === 'page' ? state.pagePos : video.currentTime;
    var dur = state.mode === 'page' ? state.pageDur : video.duration;
    if (!dur || !isFinite(dur)) return;
    if (state.custom) {
      // Saved links and MEGA files keep only their position (MF.store.setResume ignores the first 10 s and clears a finished video).
      var now = Date.now();
      if (!force && now - (state.lastResumeAt || 0) < 5000) return;
      state.lastResumeAt = now;
      MF.store.setResume(state.resumeKey, pos, dur, state.title);
      return;
    }
    if (!force && Math.abs(pos - (state.lastSaved || 0)) < 5) return;
    state.lastSaved = pos;
    MF.store.setProgress(progressEntry(pos, dur));
  }

  // Moving on to the next episode: the finished one is recorded as watched, whatever the exact position was.
  function finishCurrent() {
    if (state && state.custom) {
      if (state.resumeKey) MF.store.clearResume(state.resumeKey);
      state.finishedMark = true;
      return;
    }
    if (!state) return;
    var dur = state.mode === 'page' ? state.pageDur : video.duration;
    if (!dur || !isFinite(dur) || (state.mode !== 'page' && !state.srcReady)) { save(true); return; }
    MF.store.setProgress(progressEntry(dur, dur));
    state.finishedMark = true;
  }

  // Adds the title to Continue Watching as soon as it starts, keeping any known position for this episode.
  function markStarted() {
    if (state.custom) return;
    var prev = MF.store.getProgress(state.type, state.id);
    var same = prev && (state.type === 'movie' || (prev.season === state.season && prev.episode === state.episode));
    MF.store.setProgress(progressEntry(same ? prev.position : 0, same ? prev.duration : 0));
  }

  function announceResume() {
    if (!state || !state.resumeSaved || state.resumeToasted) return;
    state.resumeToasted = true;
    MF.ui.toast('Resuming from ' + MF.ui.fmtTime(state.resume), 3000);
  }

  function updateBar() {
    var d = video.duration;
    if (scrubbing || !d || !isFinite(d)) return;
    var pct = (video.currentTime / d * 100) + '%';
    $('bar-fill').style.width = pct;
    $('bar-knob').style.left = pct;
    $('player-time').textContent = MF.ui.fmtTime(video.currentTime);
    $('player-dur').textContent = '-' + MF.ui.fmtTime(d - video.currentTime);
    if (video.buffered.length) {
      $('bar-buf').style.width = (video.buffered.end(video.buffered.length - 1) / d * 100) + '%';
    }
  }

  function seek(delta) {
    if (!video.duration) return;
    video.currentTime = Math.max(0, Math.min(video.duration - 1, video.currentTime + delta));
    updateBar();
  }

  function toggle() {
    if (video.paused) video.play(); else video.pause();
  }

  // ---- Next episode ----
  // The next episode is resolved as soon as an episode starts (see open), so the card and the control are instant.
  var CARD_SECS = 30;      // the card appears when this much of the video is left
  var COUNT_SECS = 10;     // length of the autoplay countdown
  var MIN_LEN = 300;       // shorter videos only get the card at the end
  var countTimer = null;

  function autoplayOn() { return MF.settings.autoplayNext !== false; }
  function cardVisible() { return !$('next-card').classList.contains('hidden'); }

  function resolveNext() {
    if (!state || !state.hasNext) return Promise.resolve(null);
    var mine = state;
    if (!mine.nextPromise) {
      mine.nextPromise = Promise.resolve().then(function () { return mine.next(); }).then(function (opts) {
        mine.nextOpts = opts || null;
        mine.nextKnown = true;
        if (state === mine) onNextKnown();
        return mine.nextOpts;
      }, function () {
        mine.nextPromise = null;
        return null;
      });
    }
    return mine.nextPromise;
  }

  function nextAvailable() { return !!state && state.hasNext && (!state.nextKnown || !!state.nextOpts); }

  function cardTitle(o) {
    var name = o.episodeName || '';
    if (o.season && o.episode) return 'S' + o.season + ':E' + o.episode + '  ' + (name || 'Episode ' + o.episode);
    return o.title || '';
  }

  function onNextKnown() {
    var o = state.nextOpts;
    $('pbtn-next').classList.toggle('hidden', !o);
    if (!o) return;
    $('next-title').textContent = cardTitle(o);
    var src = MF.tmdb.img(o.still_path || o.backdrop_path, 'w780');
    $('next-thumb').classList.toggle('empty', !src);
    if (src) $('next-img').src = src; else $('next-img').removeAttribute('src');
    checkCard();
  }

  function stopCount() {
    if (countTimer) { clearInterval(countTimer); countTimer = null; }
    if (state && state.nc) state.nc.counting = false;
  }

  function paintCount() {
    var nc = state.nc;
    var secs = Math.max(0, Math.ceil(nc.msLeft / 1000));
    $('next-count-text').textContent = 'Starting in ' + secs;
    $('next-count-fill').style.width = Math.max(0, Math.min(100, nc.msLeft / nc.msTotal * 100)) + '%';
  }

  function startCount(secs) {
    var nc = state.nc;
    stopCount();
    nc.counting = true;
    nc.msTotal = nc.msLeft = secs * 1000;
    nc.last = Date.now();
    $('next-count').classList.remove('hidden');
    paintCount();
    countTimer = setInterval(function () {
      if (!state || !state.nc.counting) { stopCount(); return; }
      var now = Date.now();
      var dt = now - state.nc.last;
      state.nc.last = now;
      // A paused video holds the countdown, so someone who stopped to think is not rushed.
      if (state.mode !== 'page' && video.paused && !video.ended) return;
      state.nc.msLeft -= dt;
      paintCount();
      if (state.nc.msLeft <= 0) advance();
    }, 100);
  }

  function setCardMode(ended) {
    state.nc.ended = !!ended;
    $('next-dismiss').textContent = ended ? 'Back to details' : 'Watch credits';
  }

  function openCard(ended, secs) {
    var nc = state.nc;
    nc.shown = true;
    setCardMode(ended);
    $('next-card').classList.remove('hidden');
    $('next-count').classList.add('hidden');
    if (ended && state.mode === 'page') blurPage();
    MF.nav.focus($('next-play'));
    if (autoplayOn() && !nc.dismissed) startCount(secs);
  }

  function hideCard() {
    stopCount();
    if (state && state.nc) state.nc.shown = false;
    var card = $('next-card');
    var cur = MF.nav.current();
    card.classList.add('hidden');
    if (cur && card.contains(cur) && state && state.mode !== 'page') MF.nav.focus($('player-bar'));
  }

  function dismissCard() {
    if (!state) return;
    state.nc.dismissed = true;
    hideCard();
    showUI($('player-bar'));
  }

  // Shows the card in the last seconds; takes it away again when the video is moved back out of them.
  function checkCard() {
    var nc = state && state.nc;
    if (!nc || state.mode === 'page' || !state.srcReady || !state.nextOpts) return;
    var d = video.duration;
    if (!d || !isFinite(d) || d <= MIN_LEN || video.ended) return;
    var left = d - video.currentTime;
    if (left > CARD_SECS) {
      if (nc.shown) hideCard();
      nc.dismissed = false;
    } else if (!nc.shown && !nc.dismissed && !video.seeking) {
      openCard(false, Math.min(COUNT_SECS, Math.max(1, Math.ceil(left))));
    }
  }

  function advance() {
    stopCount();
    playNext('card');
  }

  // The video (or the web page's video) reached its end.
  function handleEnded() {
    if (!state) return;
    var mine = state;
    if (!state.hasNext) { leave(); return; }
    resolveNext().then(function (o) {
      if (state !== mine) return;
      if (!o) { leave(); return; }
      var nc = mine.nc;
      if (nc.shown && nc.counting) { advance(); return; }
      if (nc.shown) { setCardMode(true); return; }
      openCard(true, COUNT_SECS);
    });
  }

  // reason: 'card' (countdown, Play now or the end of the video), or nothing for the control and remote key.
  function playNext(reason) {
    if (!state || !state.hasNext || state.advancing) return;
    var mine = state;
    var d = mine.mode === 'page' ? mine.pageDur : video.duration;
    var left = d && isFinite(d) ? d - (mine.mode === 'page' ? mine.pagePos : video.currentTime) : Infinity;
    mine.advancing = true;
    resolveNext().then(function (opts) {
      mine.advancing = false;
      if (state !== mine) return;
      if (!opts) {
        if (reason === 'card') leave();
        return;
      }
      stopCount();
      if (reason === 'card' || mine.nc.shown || left <= CARD_SECS + 10) finishCurrent(); else save(true);
      MF.player.open(Object.assign({}, opts, { fromNext: true }));
    });
  }

  function onAction(act) {
    if (act === 'toggle') toggle();
    else if (act === 'back10') seek(-10);
    else if (act === 'fwd10') seek(10);
    else if (act === 'subs') applySubtitle(state.subIndex + 1 >= state.subtitles.length ? -1 : state.subIndex + 1);
    else if (act === 'quality') setSource((state.srcIndex + 1) % state.sources.length, video.currentTime);
    else if (act === 'next') { playNext(); return; }
    else if (act === 'findsubs') { MF.subs.openPanel(); return; }
    showUI();
  }

  // While the card is up the arrows move between its two buttons and OK presses one. Back is handled in confirmBack.
  function cardKey(code) {
    var buttons = [$('next-play'), $('next-dismiss')];
    var cur = MF.nav.current();
    var at = buttons.indexOf(cur);
    if (code === KEY.LEFT || code === KEY.RIGHT || code === KEY.UP || code === KEY.DOWN) {
      var forward = code === KEY.RIGHT || code === KEY.DOWN;
      MF.nav.focus(buttons[at < 0 ? 0 : (forward ? Math.min(1, at + 1) : Math.max(0, at - 1))]);
      return true;
    }
    if (code === KEY.ENTER) {
      (at < 0 ? buttons[0] : cur).click();
      return true;
    }
    return false;
  }

  function onKey(e, code) {
    if (!state) return false;
    if (MF.subs && MF.subs.uiOpen()) return false;
    if ((code === KEY.CH_UP || code === KEY.MEDIA_NEXT) && state.hasNext) {
      if (nextAvailable()) playNext();
      return true;
    }
    if (cardVisible() && cardKey(code)) return true;
    if (state.mode === 'page') return onPageKey(code);
    switch (code) {
      case KEY.PLAY: video.play(); showUI(); return true;
      case KEY.PAUSE: video.pause(); showUI(); return true;
      case KEY.PLAYPAUSE: toggle(); showUI(); return true;
      case KEY.STOP: hideCard(); MF.app.back(); return true;
      case KEY.FF: seek(30); showUI(); return true;
      case KEY.RW: seek(-30); showUI(); return true;
      case KEY.LEFT:
      case KEY.RIGHT:
        // Seek while the controls are hidden or the progress bar has focus; otherwise move between buttons.
        if (!uiVisible() || MF.nav.current() === $('player-bar')) {
          seek(code === KEY.LEFT ? -10 : 10);
          showUI($('player-bar'));
          return true;
        }
        // Left and Right walk the control row in order (the geometry search would jump to the progress bar instead).
        var row = Array.prototype.filter.call(document.querySelectorAll('#player-controls .pbtn'), function (b) { return !b.classList.contains('hidden'); });
        var at = row.indexOf(MF.nav.current());
        if (at >= 0) {
          var to = row[Math.max(0, Math.min(row.length - 1, at + (code === KEY.LEFT ? -1 : 1)))];
          showUI(to);
          return true;
        }
        showUI(MF.nav.current());
        return false;
      case KEY.UP:
      case KEY.DOWN:
        if (!uiVisible()) { showUI(); return true; }
        if (code === KEY.DOWN && MF.nav.current() === $('player-bar')) MF.nav.focus($('pbtn-toggle'));
        else MF.nav.move(code === KEY.UP ? 'up' : 'down');
        showUI(MF.nav.current());
        return true;
      case KEY.ENTER:
        if (!uiVisible()) { showUI(); return true; }
        if (MF.nav.current() === $('player-bar')) { toggle(); showUI($('player-bar')); return true; }
        showUI(MF.nav.current());
        return false;
      default:
        return false;
    }
  }

  function init() {
    video = $('video');
    ui = $('player-ui');
    frame = $('page-frame');
    window.addEventListener('message', onPageMessage);
    // A Magic Remote click inside the page moves keyboard focus into the iframe; take it back so
    // Back and the other remote keys keep reaching the app (they are forwarded to the page).
    // Page mode hands the remote to the page (see focusPage); Back still closes via history (app.js).

    video.addEventListener('loadedmetadata', function () {
      if (state) state.srcReady = true;
      if (state && state.pendingSeek) {
        video.currentTime = Math.min(state.pendingSeek, Math.max(0, video.duration - 10));
        state.pendingSeek = 0;
        announceResume();
      }
    });
    video.addEventListener('waiting', function () { setSpinner(true); });
    video.addEventListener('playing', function () { setSpinner(false); $('player-error').classList.add('hidden'); });
    video.addEventListener('canplay', function () { setSpinner(false); });
    video.addEventListener('timeupdate', function () { updateBar(); save(false); checkCard(); });
    video.addEventListener('seeked', checkCard);
    video.addEventListener('progress', updateBar);
    video.addEventListener('play', function () { $('pbtn-toggle').innerHTML = MF.icon('pause'); showUI(); });
    video.addEventListener('pause', function () {
      $('pbtn-toggle').innerHTML = MF.icon('play');
      showUI();
      save(true);
    });
    video.addEventListener('ended', function () {
      if (!state || (state.mode !== 'page' && !state.srcReady)) return;
      save(true);
      handleEnded();
    });
    // A still that fails to load falls back to the show's backdrop, and then to a plain block.
    $('next-img').addEventListener('error', function () {
      var o = state && state.nextOpts;
      var back = o && o.backdrop_path ? MF.tmdb.img(o.backdrop_path, 'w780') : '';
      if (back && $('next-img').getAttribute('src') !== back) $('next-img').src = back;
      else $('next-thumb').classList.add('empty');
    });
    $('next-play').addEventListener('click', advance);
    $('next-dismiss').addEventListener('click', function () {
      if (state && state.nc.ended) { stopCount(); leave(); } else dismissCard();
    });
    video.addEventListener('error', function () { if (!hls) failover(); });
    // Leaving the app (or the TV going to sleep) while a video plays must not lose its position.
    document.addEventListener('visibilitychange', function () {
      if (!document.hidden || !state) return;
      save(true);
      if (state.custom && MF.sync && MF.sync.flush) MF.sync.flush();
    });

    Array.prototype.forEach.call(document.querySelectorAll('#player-controls .pbtn'), function (btn) {
      btn.addEventListener('click', function () { onAction(btn.getAttribute('data-act')); });
    });
    $('screen-player').addEventListener('mousemove', function () { if (state && state.mode !== 'page') showUI(MF.nav.current()); });
    initBarPointer();
  }

  // Magic Remote: click anywhere on the progress bar to jump there, drag to scrub; the time under the pointer is shown.
  // While dragging only the bar moves; the video jumps once, when the button is released.
  function initBarPointer() {
    var strip = $('player-progress'), bar = $('player-bar'), tip = $('bar-tip');
    var dragging = false, frac = 0;

    function fraction(e) {
      var r = bar.getBoundingClientRect();
      return Math.max(0, Math.min(1, (e.clientX - r.left) / Math.max(1, r.width)));
    }
    function overBar(e) {
      var r = bar.getBoundingClientRect();
      return e.clientX >= r.left - 8 && e.clientX <= r.right + 8 && e.clientY >= r.top - 26 && e.clientY <= r.bottom + 26;
    }
    function usable() { var d = video.duration; return !!(state && state.mode !== 'page' && d && isFinite(d)); }
    function showTip(f) {
      var s = strip.getBoundingClientRect(), r = bar.getBoundingClientRect();
      tip.textContent = MF.ui.fmtTime(f * video.duration);
      tip.style.left = (r.left - s.left + f * r.width) + 'px';
      tip.classList.remove('hidden');
    }
    function paint(f) {
      var pct = (f * 100) + '%';
      $('bar-fill').style.width = pct;
      $('bar-knob').style.left = pct;
      $('player-time').textContent = MF.ui.fmtTime(f * video.duration);
      $('player-dur').textContent = '-' + MF.ui.fmtTime((1 - f) * video.duration);
    }

    strip.addEventListener('mousedown', function (e) {
      if (!usable() || !overBar(e)) return;
      dragging = true;
      scrubbing = true;
      frac = fraction(e);
      MF.nav.focus(bar);
      paint(frac); showTip(frac); showUI(bar);
      e.preventDefault();
    });
    document.addEventListener('mousemove', function (e) {
      if (!state) return;
      if (dragging) { frac = fraction(e); paint(frac); showTip(frac); showUI(bar); return; }
      if (usable() && ui.classList.contains('visible') && overBar(e)) showTip(fraction(e));
      else tip.classList.add('hidden');
    });
    document.addEventListener('mouseup', function () {
      if (!dragging) return;
      dragging = false;
      scrubbing = false;
      tip.classList.add('hidden');
      if (usable()) { video.currentTime = frac * video.duration; showUI(bar); }
    });
    strip.addEventListener('mouseleave', function () { if (!dragging) tip.classList.add('hidden'); });
  }

  function resetPage() {
    stopWatch();
    frame.onload = null;
    freshFrame();
    $('screen-player').classList.remove('page-mode');
    hideHint();
    if (MF.subs) MF.subs.onPageMode(false);
  }

  MF.player = {
    init: init,
    inPageMode: function () { return !!state && state.mode === 'page'; },
    focusPage: focusPage,
    blurPage: blurPage,
    confirmBack: confirmBack,
    // What is playing, for the subtitle search and its clock.
    context: function () {
      if (!state) return null;
      return { type: state.custom ? 'video' : state.type, custom: !!state.custom, id: state.id, season: state.season, episode: state.episode, title: state.title || '',
        mode: state.mode === 'page' ? 'page' : 'native', currentTime: video ? video.currentTime : 0 };
    },
    onKey: onKey,

    // opts: {type, id, title, subtitle, season, episode, backdrop_path, poster_path, still_path, resume, next}
    open: function (opts) {
      if (state) { save(true); destroyHls(); resetPage(); video.pause(); }
      hideCard();
      state = Object.assign({ srcIndex: 0, subIndex: -1, sources: [], subtitles: [], nc: {} }, opts);
      state.hasNext = typeof opts.next === 'function';
      // A saved link or MEGA file continues where it stopped, unless it is played from the start on purpose.
      var saved = state.custom && state.resumeKey && !opts.resume ? MF.store.getResume(state.resumeKey) : null;
      state.resumeSaved = !!saved;
      state.resume = saved ? saved.position : (opts.resume || 0);
      $('player-title').textContent = opts.title || '';
      $('player-sub').textContent = opts.subtitle || '';
      $('player-error').classList.add('hidden');
      $('bar-fill').style.width = '0%';
      $('bar-buf').style.width = '0%';
      $('bar-knob').style.left = '0%';
      $('pbtn-next').classList.add('hidden');
      $('next-img').removeAttribute('src');
      $('next-title').textContent = '';
      setSpinner(true);
      showUI($('player-bar'));
      if (opts.fromNext) markStarted();
      if (state.hasNext) resolveNext();

      if (MF.subs) MF.subs.onPlayerOpen({ type: opts.custom ? 'video' : opts.type, id: opts.id, season: opts.season, episode: opts.episode, title: opts.title || '', custom: !!opts.custom });
      var mine = state;
      var found = opts.mega ? MF.videos.megaStream(opts.mega) : opts.custom ? MF.server.direct(opts.url) : MF.server.streams(opts.type, opts.id, opts.season, opts.episode);
      found.then(function (data) {
        if (state !== mine) return;
        if (data.page) { openPage(data.page, state.resume); return; }
        if (!data.sources.length) { showError(opts.custom ? 'This link has no video to play.' : 'Your media server has no stream for this title.'); return; }
        state.pageFallback = data.pageFallback || null;
        state.sources = data.sources;
        state.subtitles = data.subtitles;
        setupSubtitles(data.subtitles);
        setSource(0, state.resume);
      }, function (err) {
        if (state === mine) showError(err.message);
      });
    },

    close: function () {
      save(true);
      state = null;
      hideCard();
      resetPage();
      if (MF.subs) MF.subs.onPlayerClose();
      clearTimeout(hideTimer);
      destroyHls();
      video.pause();
      video.removeAttribute('src');
      Array.prototype.slice.call(video.querySelectorAll('track')).forEach(function (t) { t.remove(); });
      video.load();
      ui.classList.remove('visible');
    }
  };
})();
