(function () {
  'use strict';

  var MF = window.MF;
  var KEY = MF.nav.KEY;
  var HLS_JS = 'https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js';

  var video, ui, frame, state = null, hideTimer = null, hintTimer = null, hls = null, hlsLoading = null;

  function $(id) { return document.getElementById(id); }

  function needsHlsJs(source) {
    return source.type === 'hls' && !video.canPlayType('application/vnd.apple.mpegurl') && !video.canPlayType('application/x-mpegURL');
  }

  // Native HLS on LG webOS; hls.js is only loaded when running in a desktop browser for development.
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
  }

  function showUI(focusEl) {
    ui.classList.add('visible');
    if (focusEl) MF.nav.focus(focusEl);
    else if (!MF.nav.current() || !MF.nav.current().closest('.player-ui')) MF.nav.focus($('player-bar'));
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

  function setSource(index, startAt) {
    var source = state.sources[index];
    if (!source) { showError('This title could not be played. Check your media server.'); return; }
    state.srcIndex = index;
    $('pbtn-quality').textContent = 'Quality: ' + source.label;
    $('pbtn-quality').classList.toggle('hidden', state.sources.length < 2);
    $('pbtn-findsubs').classList.toggle('hidden', !(MF.subs && MF.subs.enabled()));
    destroyHls();
    setSpinner(true);
    state.pendingSeek = startAt || 0;

    if (needsHlsJs(source)) {
      loadHlsJs().then(function (Hls) {
        if (!state || state.srcIndex !== index) return;
        if (!Hls.isSupported()) { showError('HLS playback is not supported here.'); return; }
        hls = new Hls({ xhrSetup: authXhr });
        hls.loadSource(source.url);
        hls.attachMedia(video);
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

  function showHint() {
    var hint = $('page-hint');
    hint.classList.remove('hidden');
    clearTimeout(hintTimer);
    hintTimer = setTimeout(function () { hint.classList.add('hidden'); }, 3500);
  }

  // Every playback gets a brand-new iframe. A reused one keeps the browser history of earlier movies, and the
  // Back key (a history step on webOS) would then walk the iframe back to an old movie instead of leaving.
  function freshFrame() {
    var f = document.createElement('iframe');
    f.id = 'page-frame';
    f.tabIndex = -1;
    f.setAttribute('allow', 'autoplay; fullscreen; encrypted-media; picture-in-picture');
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
    if (MF.subs) MF.subs.onPageMode(true);
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
      if (e.keyCode === KEY.YELLOW && state && state.mode === 'page' && MF.subs && MF.subs.enabled()) {
        e.preventDefault();
        MF.subs.openPanel();
      }
    }, true);
  }

  function stopWatch() {
    if (watchTimer) { clearInterval(watchTimer); watchTimer = null; }
  }

  // Leaving the player on purpose (video ended, page asked to close) skips the Back warning.
  function leave() {
    if (state) state.leaveOk = true;
    MF.app.back();
  }

  // In page mode a stray Back press would drop the video, so the first press only warns.
  // A second press within 3 s returns to the movie or series page.
  function confirmBack() {
    if (!state || state.mode !== 'page' || state.leaveOk) return false;
    if (Date.now() - (state.warnedAt || 0) < 3000) return false;
    state.warnedAt = Date.now();
    MF.ui.toast('Press Back again to return to the ' + (state.type === 'tv' ? 'series' : 'movie') + ' page', 3000);
    return true;
  }

  function pageEnded() {
    if (!state || state.endedFired) return;
    state.endedFired = true;
    save(true);
    if (state.hasNext) { playNext(); return; }
    leave();
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
      if (MF.subs) MF.subs.onPageMessage({ type: 'time', position: v.currentTime, paused: !moving });

      var dur = v.duration;
      if (dur && isFinite(dur)) {
        if (state.pageResume > 5 && !state.resumed && v.readyState > 0) {
          state.resumed = true;
          try { v.currentTime = Math.min(state.pageResume, Math.max(0, dur - 3)); } catch (e) { /* ignore */ }
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
      if (state.pageResume) postToPage({ cmd: 'seek-to', value: state.pageResume });
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
    if (code === KEY.YELLOW && MF.subs && MF.subs.enabled()) { MF.subs.openPanel(); return true; }
    // Focus came back to the app (e.g. pointer click): return it to the page, then forward this key.
    setTimeout(focusPage, 0);
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

  function save(force) {
    if (!state) return;
    var pos = state.mode === 'page' ? state.pagePos : video.currentTime;
    var dur = state.mode === 'page' ? state.pageDur : video.duration;
    if (!dur || !isFinite(dur)) return;
    if (!force && Math.abs(pos - (state.lastSaved || 0)) < 5) return;
    state.lastSaved = pos;
    MF.store.setProgress({
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
    });
  }

  // Adds the title to Continue Watching as soon as it starts, keeping any known position for this episode.
  function markStarted() {
    var prev = MF.store.getProgress(state.type, state.id);
    var same = prev && (state.type === 'movie' || (prev.season === state.season && prev.episode === state.episode));
    MF.store.setProgress({
      type: state.type,
      id: state.id,
      season: state.season,
      episode: state.episode,
      position: same ? prev.position : 0,
      duration: same ? prev.duration : 0,
      title: state.title,
      subtitle: state.subtitle,
      backdrop_path: state.backdrop_path,
      poster_path: state.poster_path,
      still_path: state.still_path
    });
  }

  function updateBar() {
    var d = video.duration;
    if (!d || !isFinite(d)) return;
    var pct = (video.currentTime / d * 100) + '%';
    $('bar-fill').style.width = pct;
    $('bar-knob').style.left = pct;
    $('player-time').textContent = MF.ui.fmtTime(video.currentTime);
    $('player-dur').textContent = '-' + MF.ui.fmtTime(d - video.currentTime);
    if (video.buffered.length) {
      $('bar-buf').style.width = (video.buffered.end(video.buffered.length - 1) / d * 100) + '%';
    }
    var nearEnd = d - video.currentTime < 40;
    $('pbtn-next').classList.toggle('hidden', !(state && state.hasNext && nearEnd));
  }

  function seek(delta) {
    if (!video.duration) return;
    video.currentTime = Math.max(0, Math.min(video.duration - 1, video.currentTime + delta));
    updateBar();
  }

  function toggle() {
    if (video.paused) video.play(); else video.pause();
  }

  function playNext() {
    if (!state || !state.next) return;
    var next = state.next;
    save(true);
    next().then(function (opts) {
      if (opts) MF.player.open(opts);
      else MF.app.back();
    });
  }

  function onAction(act) {
    if (act === 'toggle') toggle();
    else if (act === 'back10') seek(-10);
    else if (act === 'fwd10') seek(10);
    else if (act === 'subs') applySubtitle(state.subIndex + 1 >= state.subtitles.length ? -1 : state.subIndex + 1);
    else if (act === 'quality') setSource((state.srcIndex + 1) % state.sources.length, video.currentTime);
    else if (act === 'next') playNext();
    else if (act === 'findsubs') { MF.subs.openPanel(); return; }
    showUI();
  }

  function onKey(e, code) {
    if (!state) return false;
    if (MF.subs && MF.subs.uiOpen()) return false;
    if (state.mode === 'page') return onPageKey(code);
    switch (code) {
      case KEY.PLAY: video.play(); showUI(); return true;
      case KEY.PAUSE: video.pause(); showUI(); return true;
      case KEY.PLAYPAUSE: toggle(); showUI(); return true;
      case KEY.STOP: MF.app.back(); return true;
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
      if (state && state.pendingSeek) {
        video.currentTime = Math.min(state.pendingSeek, Math.max(0, video.duration - 10));
        state.pendingSeek = 0;
      }
    });
    video.addEventListener('waiting', function () { setSpinner(true); });
    video.addEventListener('playing', function () { setSpinner(false); $('player-error').classList.add('hidden'); });
    video.addEventListener('canplay', function () { setSpinner(false); });
    video.addEventListener('timeupdate', function () { updateBar(); save(false); });
    video.addEventListener('progress', updateBar);
    video.addEventListener('play', function () { $('pbtn-toggle').innerHTML = MF.icon('pause'); showUI(); });
    video.addEventListener('pause', function () {
      $('pbtn-toggle').innerHTML = MF.icon('play');
      showUI();
      save(true);
    });
    video.addEventListener('ended', function () {
      save(true);
      if (state && state.hasNext) playNext();
      else MF.app.back();
    });
    video.addEventListener('error', function () { if (!hls) failover(); });

    Array.prototype.forEach.call(document.querySelectorAll('#player-controls .pbtn'), function (btn) {
      btn.addEventListener('click', function () { onAction(btn.getAttribute('data-act')); });
    });
    $('screen-player').addEventListener('mousemove', function () { if (state && state.mode !== 'page') showUI(MF.nav.current()); });
  }

  function resetPage() {
    stopWatch();
    frame.onload = null;
    freshFrame();
    $('screen-player').classList.remove('page-mode');
    $('page-hint').classList.add('hidden');
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
      return { type: state.type, id: state.id, season: state.season, episode: state.episode, title: state.title || '',
        mode: state.mode === 'page' ? 'page' : 'native', currentTime: video ? video.currentTime : 0 };
    },
    onKey: onKey,

    // opts: {type, id, title, subtitle, season, episode, backdrop_path, poster_path, still_path, resume, next}
    open: function (opts) {
      if (state) { save(true); destroyHls(); resetPage(); }
      state = Object.assign({ srcIndex: 0, subIndex: -1, sources: [], subtitles: [] }, opts);
      state.hasNext = typeof opts.next === 'function';
      $('player-title').textContent = opts.title || '';
      $('player-sub').textContent = opts.subtitle || '';
      $('player-error').classList.add('hidden');
      $('bar-fill').style.width = '0%';
      $('bar-buf').style.width = '0%';
      $('bar-knob').style.left = '0%';
      $('pbtn-next').classList.add('hidden');
      setSpinner(true);
      showUI($('player-bar'));

      if (MF.subs) MF.subs.onPlayerOpen({ type: opts.type, id: opts.id, season: opts.season, episode: opts.episode, title: opts.title || '' });
      var mine = state;
      MF.server.streams(opts.type, opts.id, opts.season, opts.episode).then(function (data) {
        if (state !== mine) return;
        if (data.page) { openPage(data.page, opts.resume || 0); return; }
        if (!data.sources.length) { showError('Your media server has no stream for this title.'); return; }
        state.pageFallback = data.pageFallback || null;
        state.sources = data.sources;
        state.subtitles = data.subtitles;
        setupSubtitles(data.subtitles);
        setSource(0, opts.resume || 0);
      }, function (err) {
        if (state === mine) showError(err.message);
      });
    },

    close: function () {
      save(true);
      state = null;
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
