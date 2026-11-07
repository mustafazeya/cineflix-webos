(function () {
  'use strict';

  // Subtitle search for the title being played (SubDL). Subtitles are drawn by CineFlix on top of the
  // player and only ever follow the REAL video clock: the native player's, or the page player's when
  // the page uses makeflix-page-bridge.js. With no clock they stay hidden instead of guessing, so they
  // can never keep running while the video is paused, stopped or somewhere else.
  var MF = window.MF;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { return MF.ui.el(tag, cls, text); }

  // ---------- settings ----------

  function apiBase() { return (MF.settings.subsApiBase || 'https://api.subdl.com').replace(/\/+$/, ''); }
  function dlBase() { return (MF.settings.subsDlBase || 'https://dl.subdl.com').replace(/\/+$/, ''); }
  function enabled() { return !!(MF.settings.subdlKey && MF.settings.subdlKey.trim()); }
  function langList() {
    var list = String(MF.settings.subLangs || 'EN').toUpperCase().split(/[,\s]+/).filter(Boolean);
    return list.length ? list : ['EN'];
  }

  // ---------- parsing ----------

  // Most subtitle files are UTF-8; older ones use a legacy code page that depends on the language.
  var LEGACY = { AR: 'windows-1256', FA: 'windows-1256', UR: 'windows-1256', TR: 'windows-1254', RU: 'windows-1251',
    UK: 'windows-1251', BG: 'windows-1251', EL: 'windows-1253', HE: 'windows-1255', PL: 'windows-1250', CS: 'windows-1250',
    SK: 'windows-1250', HU: 'windows-1250', RO: 'windows-1250', HR: 'windows-1250', SL: 'windows-1250' };

  function decode(bytes, lang) {
    var text;
    try { text = new TextDecoder('utf-8', { fatal: true }).decode(bytes); } catch (e) {
      try { text = new TextDecoder(LEGACY[lang] || 'windows-1252').decode(bytes); } catch (e2) {
        var s = '';
        for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i]);
        text = s;
      }
    }
    return text.replace(/^\uFEFF/, '');
  }

  function parseTime(s) {
    var m = String(s).trim().match(/^(?:(\d+):)?(\d+):(\d+)[,.](\d+)/);
    if (!m) return null;
    var ms = (m[4] + '00').slice(0, 3);
    return (Number(m[1] || 0) * 3600) + (Number(m[2]) * 60) + Number(m[3]) + Number(ms) / 1000;
  }

  // Works for SRT and WebVTT. Keeps italics, drops every other tag and ASS-style {...} codes.
  function parseCues(text) {
    var cues = [];
    var blocks = text.replace(/\r/g, '').split(/\n{2,}/);
    blocks.forEach(function (block) {
      var lines = block.split('\n');
      var i = 0;
      while (i < lines.length && lines[i].indexOf('-->') < 0) i++;
      if (i >= lines.length) return;
      var parts = lines[i].split('-->');
      var start = parseTime(parts[0]);
      var end = parseTime(parts[1]);
      if (start === null || end === null || end <= start) return;
      var body = lines.slice(i + 1).join('\n')
        .replace(/\{[^}]*\}/g, '')
        .replace(/<(?!\/?i>)[^>]*>/gi, '')
        .trim();
      if (body) cues.push({ start: start, end: end, text: body });
    });
    cues.sort(function (a, b) { return a.start - b.start; });
    return cues;
  }

  function findCue(cues, t) {
    var lo = 0;
    var hi = cues.length - 1;
    var idx = -1;
    while (lo <= hi) {
      var mid = (lo + hi) >> 1;
      if (cues[mid].start <= t) { idx = mid; lo = mid + 1; } else hi = mid - 1;
    }
    for (var k = idx; k >= 0 && k > idx - 4; k--) if (cues[k].end > t) return cues[k];
    return null;
  }

  // ---------- SubDL ----------

  function qs(params) {
    return Object.keys(params).filter(function (k) { return params[k] !== undefined && params[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&');
  }

  // A result is a season pack when SubDL says so, or when it is not for a range that includes this episode.
  function isPack(s, ctx) {
    if (s.full_season) return true;
    var from = Number(s.episode_from);
    var to = Number(s.episode_end);
    if (from > 0 && to >= from) return !(ctx.episode >= from && ctx.episode <= to);
    return s.episode == null;
  }

  // Finds the file for one episode inside a zip, trying the common naming styles. Null when none matches.
  function episodeFile(names, files, season, episode) {
    var S = '0*' + season;
    var E = '0*' + episode;
    var patterns = [
      new RegExp('s' + S + '[ ._-]*e(?:p|pisode)?[ ._-]*' + E + '(?!\\d)', 'i'),
      new RegExp('(?:^|[^\\d])' + S + '[x.]' + E + '(?!\\d)', 'i'),
      new RegExp('season[ ._-]*' + S + '\\D.*episode[ ._-]*' + E + '(?!\\d)', 'i'),
      new RegExp('(?:^|[^a-z0-9])e(?:p|pisode)?[ ._-]*' + E + '(?!\\d)', 'i'),
      new RegExp('^[^a-z0-9]*' + E + '(?!\\d)', 'i')
    ];
    for (var i = 0; i < patterns.length; i++) {
      var hits = names.filter(function (n) { return patterns[i].test(n.replace(/^.*[\\/]/, '').replace(/\.(srt|vtt)$/i, '')); });
      if (hits.length) {
        hits.sort(function (a, b) { return files[b].length - files[a].length; });
        return hits[0];
      }
    }
    return null;
  }

  function search(ctx, languages) {
    var q = { api_key: MF.settings.subdlKey.trim(), tmdb_id: ctx.id, type: ctx.type, languages: languages.join(','), subs_per_page: 30 };
    // No full_season filter: most episodes only exist inside season packs, which are picked apart on download.
    if (ctx.type === 'tv') { q.season_number = ctx.season; q.episode_number = ctx.episode; }
    return fetch(apiBase() + '/api/v1/subtitles?' + qs(q), { headers: { Accept: 'application/json' } }).then(function (res) {
      return res.json().catch(function () { return null; }).then(function (json) {
        if (json && json.status === false) {
          var msg = json.error || '';
          if (res.status === 401 || res.status === 403 || /api.?key|unauthor|invalid|forbidden/i.test(msg)) {
            throw new Error('SubDL did not accept your API key. Check it in Settings.');
          }
          return { subtitles: [] };
        }
        if (!res.ok || !json) throw new Error('Subtitle search failed (' + res.status + ')');
        return json;
      });
    }).then(function (json) {
      var seen = {};
      var out = [];
      (json.subtitles || []).forEach(function (s) {
        if (!s.url || seen[s.url]) return;
        seen[s.url] = true;
        out.push({
          name: s.release_name || s.name || 'Subtitle',
          lang: String(s.language || s.lang || '').toUpperCase(),
          hi: !!s.hi,
          // SubDL appends the API key to download links; downloads work without it, so drop it.
          url: String(s.url).replace(/([?&])api_key=[^&]*&?/, '$1').replace(/[?&]$/, ''),
          author: s.author || '',
          pack: ctx.type === 'tv' && isPack(s, ctx)
        });
      });
      var order = langList();
      out.forEach(function (o, i) { o._i = i; o._l = order.indexOf(o.lang) < 0 ? 99 : order.indexOf(o.lang); });
      // Preferred language first; regular subtitles before hearing-impaired ones.
      // Subtitles made for this exact episode come before season packs.
      out.sort(function (a, b) { return a._l - b._l || (a.pack ? 1 : 0) - (b.pack ? 1 : 0) || (a.hi ? 1 : 0) - (b.hi ? 1 : 0) || a._i - b._i; });
      return out;
    });
  }

  function download(item, ctx) {
    return fetch(dlBase() + item.url).then(function (res) {
      if (!res.ok) throw new Error(res.status === 429 ? 'SubDL download limit reached for today' : 'Download failed (' + res.status + ')');
      return res.arrayBuffer();
    }).then(function (buf) {
      var u8 = new Uint8Array(buf);
      var text;
      if (u8[0] === 0x50 && u8[1] === 0x4B) {
        if (!window.fflate) throw new Error('Zip support is missing');
        var files = window.fflate.unzipSync(u8);
        var names = Object.keys(files).filter(function (n) { return /\.(srt|vtt)$/i.test(n); });
        if (!names.length) throw new Error('No subtitle file inside the download');
        names.sort(function (a, b) { return files[b].length - files[a].length; });
        var pick = names[0];
        if (ctx.type === 'tv' && names.length > 1) {
          // Packs hold several episodes: take the file for this one, never a different episode.
          pick = episodeFile(names, files, ctx.season, ctx.episode);
          if (!pick) {
            if (item.pack) throw new Error('This pack has no file for episode ' + ctx.episode + '. Try another result.');
            pick = names[0];
          }
        }
        text = decode(files[pick], item.lang);
      } else {
        text = decode(u8, item.lang);
      }
      var cues = parseCues(text);
      if (!cues.length) throw new Error('This subtitle file is empty or not supported');
      return { text: text, cues: cues };
    });
  }

  // ---------- remembered choice per title ----------

  var STORE = 'mfc.subs';

  function titleKey(ctx) {
    return ctx.type + ':' + ctx.id + (ctx.type === 'tv' ? ':' + ctx.season + ':' + ctx.episode : '');
  }
  function readAll() { try { return JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { return {}; } }
  function writeAll(all) {
    try { localStorage.setItem(STORE, JSON.stringify(all)); } catch (e) { /* storage full */ }
  }
  function remember(ctx, entry) {
    var all = readAll();
    all[titleKey(ctx)] = Object.assign({ at: Date.now() }, entry);
    var keys = Object.keys(all).sort(function (a, b) { return all[b].at - all[a].at; });
    keys.slice(12).forEach(function (k) { delete all[k]; });
    writeAll(all);
  }
  function forget(ctx) {
    var all = readAll();
    delete all[titleKey(ctx)];
    writeAll(all);
  }

  // ---------- state and clock ----------

  var cur = null;                       // context of the open player
  var track = { cues: [], name: '', lang: '', text: '', offset: 0 };
  var bridge = { seen: false, pos: 0, at: 0, paused: true };
  var panelOpen = false;
  var searchLang = 'ALL';
  var searchToken = 0;
  var autoFocusResult = false;
  var tickTimer = null;
  var lastShown = null;

  function now() { return (window.performance && performance.now) ? performance.now() : Date.now(); }

  // How long after the last report the clock may keep advancing on its own. The page reports a few times
  // a second while playing, so silence means paused, stalled, buffering or closed: stop right there.
  var MAX_COAST = 1.0;

  // Returns the video position in seconds, or null when the real position is unknown.
  function clockTime(ctx) {
    if (ctx.mode === 'native') return ctx.currentTime;
    if (!bridge.seen) return null;
    var elapsed = (now() - bridge.at) / 1000;
    return bridge.pos + (bridge.paused ? 0 : Math.min(elapsed, MAX_COAST));
  }

  // Builds the subtitle rows (same markup as the CSS in css/app.css expects) in any document.
  function fillLayer(layer, cue) {
    var doc = layer.ownerDocument;
    layer.innerHTML = '';
    if (!cue) return;
    cue.text.split('\n').forEach(function (line) {
      var row = doc.createElement('div');
      row.className = 'subs-line';
      var italic = false;
      line.split(/(<\/?i>)/i).forEach(function (part) {
        if (/^<i>$/i.test(part)) { italic = true; return; }
        if (/^<\/i>$/i.test(part)) { italic = false; return; }
        if (!part) return;
        var span = doc.createElement('span');
        if (italic) span.className = 'subs-i';
        span.textContent = part;
        row.appendChild(span);
      });
      layer.appendChild(row);
    });
  }

  function renderCue(cue) {
    var key = cue ? cue.text : null;
    if (key === lastShown) return;
    lastShown = key;
    fillLayer($('subs-layer'), cue);
    if (pageLayer) fillLayer(pageLayer.el, cue);
  }

  function tick() {
    var ctx = MF.player && MF.player.context && MF.player.context();
    if (!ctx || !track.cues.length) { renderCue(null); return; }
    var t = clockTime(ctx);
    renderCue(t === null ? null : findCue(track.cues, t + track.offset));
  }

  function startTicking() {
    if (!tickTimer) tickTimer = setInterval(tick, 100);
  }

  // ---------- applying / clearing ----------

  function apply(ctx, parsed, name, lang, offset) {
    track = { cues: parsed.cues, name: name, lang: lang, text: parsed.text, offset: offset || 0 };
    lastShown = undefined;
    startTicking();
    tick();
  }

  // ---------- fullscreen ----------
  // The overlay lives in the app, and a fullscreen video is drawn over it. While the page is fullscreen, the same overlay (same CSS, same
  // font, same text) is built inside the page's fullscreen element, so it looks exactly like normal mode. If the fullscreen element
  // is the <video> itself it cannot hold children; then the cues go on the video's own text track, styled to match as far as a
  // text track allows.

  var pageLayer = null;                 // { el, host }
  var pageTT = null;                    // { video, tt, key }

  // The same rules as .subs-layer / .subs-line in css/app.css, plus Inter as a data URL, since the page cannot load the app's font files.
  function ensurePageStyle(doc) {
    if (doc.getElementById('cf-sub-style')) return;
    var face = window.MF_CUE_FONT
      ? "@font-face { font-family: 'CineFlix Inter'; font-weight: 600; src: url(" + window.MF_CUE_FONT + ") format('woff2'); } "
      : '';
    var font = "'CineFlix Inter', Inter, 'LG Smart UI', 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";
    var st = doc.createElement('style');
    st.id = 'cf-sub-style';
    st.textContent = face +
      '#cf-sub-layer { position: absolute; left: 160px; right: 160px; bottom: 110px; z-index: 2147483647; text-align: center; pointer-events: none; ' +
        'font-family: ' + font + '; font-size: 24px; font-weight: 400; -webkit-font-smoothing: antialiased; text-rendering: optimizeLegibility; } ' +
      '#cf-sub-layer .subs-line { margin-top: 6px; } ' +
      '#cf-sub-layer .subs-line span { display: inline; padding: 3px 14px; border-radius: 6px; background: rgba(0, 0, 0, .72); color: #fff; ' +
        'font-size: 46px; font-weight: 600; line-height: 1.5; -webkit-box-decoration-break: clone; box-decoration-break: clone; text-shadow: 0 2px 6px rgba(0, 0, 0, .8); } ' +
      '#cf-sub-layer .subs-i { font-style: italic; } ' +
      'video::cue { color: #fff; background-color: rgba(0, 0, 0, .72); font-family: ' + font + '; font-weight: 600; font-size: 4.26vh; line-height: 1.5; text-shadow: 0 2px 6px rgba(0, 0, 0, .8); }';
    (doc.head || doc.documentElement).appendChild(st);
  }

  function removePageLayer() {
    if (!pageLayer) return;
    try { if (pageLayer.el.parentNode) pageLayer.el.parentNode.removeChild(pageLayer.el); } catch (e) { /* page gone */ }
    pageLayer = null;
  }

  function removePageTrack() {
    if (!pageTT) return;
    try { pageTT.tt.mode = 'disabled'; } catch (e) { /* page gone */ }
    pageTT = null;
  }

  function cueMarkup(text) {
    return text.replace(/&/g, '&amp;').replace(/<(?!\/?i>)/gi, '&lt;');
  }

  function useTextTrack(video, key) {
    if (pageTT && pageTT.video === video && pageTT.key === key) {
      if (pageTT.tt.mode !== 'showing') pageTT.tt.mode = 'showing';
      return;
    }
    removePageTrack();
    try {
      var doc = video.ownerDocument;
      // A video cannot lose a text track once added, so each video keeps one CineFlix track that is refilled when needed.
      var tt = video.__cfTrack;
      if (!tt) {
        tt = video.addTextTrack('subtitles', 'CineFlix', (track.lang || 'en').toLowerCase());
        video.__cfTrack = tt;
      }
      if (video.__cfTrackKey !== key) {
        var Cue = (doc.defaultView && doc.defaultView.VTTCue) || window.VTTCue;
        tt.mode = 'hidden';
        while (tt.cues && tt.cues.length) tt.removeCue(tt.cues[0]);
        track.cues.forEach(function (c) {
          // The overlay shows a cue when videoTime + offset is inside it, so the cue sits at start - offset.
          var start = c.start - track.offset;
          var end = c.end - track.offset;
          if (end <= 0) return;
          var cue = new Cue(Math.max(0, start), end, cueMarkup(c.text));
          cue.align = 'center';
          cue.size = 83;                // the overlay leaves 160px on each side of 1920px
          cue.line = -2;                // sits a little above the bottom edge, like the overlay
          tt.addCue(cue);
        });
        video.__cfTrackKey = key;
      }
      tt.mode = 'showing';
      ensurePageStyle(doc);
      pageTT = { video: video, tt: tt, key: key };
    } catch (e) { pageTT = null; }
  }

  // host: { doc, el } for the page's fullscreen element, or null when the page is not fullscreen.
  function pageFullscreenSync(video, host) {
    if (!host || !track.cues.length) { removePageLayer(); removePageTrack(); return; }
    if (host.el.tagName === 'VIDEO') {
      removePageLayer();
      if (video) useTextTrack(video, [track.name, track.lang, track.offset, track.cues.length].join('|'));
      return;
    }
    removePageTrack();
    if (pageLayer && pageLayer.host === host.el && pageLayer.el.parentNode === host.el) return;
    removePageLayer();
    ensurePageStyle(host.doc);
    var layer = host.doc.createElement('div');
    layer.id = 'cf-sub-layer';
    host.el.appendChild(layer);
    pageLayer = { el: layer, host: host.el };
    lastShown = undefined;
    tick();
  }

  function clearTrack() {
    removePageLayer();
    removePageTrack();
    track = { cues: [], name: '', lang: '', text: '', offset: 0 };
    lastShown = undefined;
    renderCue(null);
  }

  function setOffset(delta) {
    track.offset = Math.round((track.offset + delta) * 10) / 10;
    if (cur && track.cues.length) remember(cur, { name: track.name, lang: track.lang, text: track.text, offset: track.offset });
    lastShown = undefined;
    tick();
  }

  // ---------- panel ----------

  function status() {
    var ctx = MF.player && MF.player.context && MF.player.context();
    if (ctx && ctx.mode === 'native') return 'Synced with the video';
    return bridge.seen ? 'Synced with your player' : 'Waiting for your player to report its time';
  }

  function fmtOffset(o) { return (o > 0 ? '+' : '') + o.toFixed(1) + 's'; }

  function chip(label, onClick, active) {
    var b = el('button', 'chip focusable' + (active ? ' active' : ''), label);
    b.addEventListener('click', onClick);
    return b;
  }

  function focusIn(box, selector) {
    var target = box.querySelector(selector) || box.querySelector('.focusable');
    if (target) MF.nav.focus(target);
  }

  function renderPanel(keepFocus) {
    var box = $('subs-box');
    var ctx = MF.player.context();
    var focusedKey = keepFocus && MF.nav.current() && MF.nav.current().getAttribute('data-k');
    box.innerHTML = '';
    box.appendChild(el('div', 'modal-title', 'Subtitles'));
    box.appendChild(el('div', 'modal-sub', (ctx ? ctx.title + ' \u00B7 ' : '') + status()));

    var controls = el('div', 'subs-controls');
    var langs = ['ALL'].concat(langList());
    var langChip = chip('Language: ' + (searchLang === 'ALL' ? langList().join(', ') : searchLang), function () {
      searchLang = langs[(langs.indexOf(searchLang) + 1) % langs.length];
      runSearch();
    });
    langChip.setAttribute('data-k', 'lang');
    controls.appendChild(langChip);
    if (track.cues.length) {
      var off = chip('Turn off', function () {
        clearTrack();
        if (cur) forget(cur);
        MF.ui.toast('Subtitles off');
        renderPanel(false);
      });
      off.setAttribute('data-k', 'off');
      controls.appendChild(off);
      [[-5, '-5s'], [-0.5, '-0.5s'], [0.5, '+0.5s'], [5, '+5s']].forEach(function (d) {
        var c = chip(d[1], function () { setOffset(d[0]); renderPanel(true); });
        c.setAttribute('data-k', 'd' + d[0]);
        controls.appendChild(c);
      });
      box.appendChild(controls);
      box.appendChild(el('div', 'subs-now', 'On: ' + track.lang + ' \u00B7 ' + track.name + '   (delay ' + fmtOffset(track.offset) + ')'));
    } else {
      box.appendChild(controls);
    }
    if (ctx && ctx.mode === 'page' && !bridge.seen) {
      box.appendChild(el('div', 'subs-note', 'CineFlix could not read this page\'s video time, so it cannot keep subtitles in step with pause and seeking. If your page has no video element CineFlix can reach, add the one-line makeflix-page-bridge.js to it (see README).'));
    }

    var list = el('div', 'subs-list scroller');
    list.id = 'subs-list';
    box.appendChild(list);
    focusIn(box, focusedKey ? '[data-k="' + focusedKey + '"]' : '.subs-item');
  }

  function fillResults(items, message) {
    var list = $('subs-list');
    if (!list) return;
    list.innerHTML = '';
    if (message) { list.appendChild(el('div', 'subs-msg', message)); return; }
    items.forEach(function (it) {
      var b = el('button', 'picker-item subs-item focusable');
      b.appendChild(el('span', 'subs-lang', it.lang));
      var text = el('span', 'picker-text');
      text.appendChild(el('span', 'picker-label', it.name));
      var sub = [it.pack && cur && cur.episode ? 'Full season zip, episode ' + cur.episode + ' picked for you' : '', it.hi ? 'Hearing impaired' : '', it.author].filter(Boolean).join(' \u00B7 ');
      if (sub) text.appendChild(el('span', 'picker-sub', sub));
      b.appendChild(text);
      b.addEventListener('click', function () { choose(it); });
      list.appendChild(b);
    });
    // On first open, land on the first result; afterwards leave focus on the control being used.
    var first = list.querySelector('.subs-item');
    if (first && autoFocusResult) {
      autoFocusResult = false;
      MF.nav.focus(first);
    }
  }

  function runSearch() {
    var token = ++searchToken;
    renderPanel(true);
    fillResults([], 'Searching...');
    var ctx = cur;
    var languages = searchLang === 'ALL' ? langList() : [searchLang];
    search(ctx, languages).then(function (items) {
      if (token !== searchToken || !panelOpen) return;
      fillResults(items, items.length ? '' : 'No subtitles found for this title in ' + languages.join(', ') + '.');
    }, function (err) {
      if (token !== searchToken || !panelOpen) return;
      fillResults([], err.message || 'Search failed');
    });
  }

  function choose(it) {
    var ctx = cur;
    if (!ctx) return;
    fillResults([], 'Downloading...');
    download(it, ctx).then(function (parsed) {
      if (cur !== ctx) return;
      apply(ctx, parsed, it.name, it.lang, 0);
      remember(ctx, { name: it.name, lang: it.lang, text: parsed.text, offset: 0 });
      MF.ui.toast('Subtitles on: ' + it.lang);
      closePanel(true);
    }, function (err) {
      fillResults([], err.message || 'Download failed');
    });
  }

  // ---------- panel / menu open & close ----------

  function setBody() {
    document.body.classList.toggle('subs-open', panelOpen);
  }

  function openPanel() {
    if (!enabled() || !cur) { MF.ui.toast('Add your SubDL API key in Settings'); return; }
    panelOpen = true;
    $('subs-panel').classList.remove('hidden');
    setBody();
    if (MF.player.blurPage) MF.player.blurPage();
    searchLang = 'ALL';
    autoFocusResult = true;
    runSearch();
  }

  function closePanel(refocus) {
    if (!panelOpen) return;
    panelOpen = false;
    searchToken++;
    $('subs-panel').classList.add('hidden');
    setBody();
    if (refocus !== false && MF.player.focusPage) MF.player.focusPage();
  }

  // ---------- hooks used by the player and the router ----------

  MF.subs = {
    enabled: enabled,
    uiOpen: function () { return panelOpen; },
    openPanel: openPanel,

    // Back key: first press in page mode opens the menu; with the menu open, Back closes the player.
    // Back closes the subtitle panel if it is open; otherwise the router handles it.
    handleBack: function () {
      if (panelOpen) { closePanel(true); return true; }
      return false;
    },

    onPlayerOpen: function (ctx) {
      cur = ctx;
      bridge = { seen: false, pos: 0, at: 0, paused: true };
      clearTrack();
      if (!enabled()) return;
      var saved = readAll()[titleKey(ctx)];
      if (saved && saved.text) {
        var cues = parseCues(saved.text);
        if (cues.length) apply(ctx, { text: saved.text, cues: cues }, saved.name, saved.lang, saved.offset || 0);
      }
    },

    onPageMode: function (on) {
      $('subs-cc').classList.toggle('hidden', !(on && enabled()));
    },

    onPageMessage: function (d) {
      // Only the bridge's frequent "time" messages are precise enough to sync subtitles.
      if (d.type === 'time') {
        var pos = Number(d.position);
        if (isFinite(pos)) {
          bridge.seen = true;
          bridge.pos = pos;
          bridge.at = now();
          bridge.paused = !!d.paused;
        }
      }
    },

    onPlayerClose: function () {
      cur = null;
      panelOpen = false;
      searchToken++;
      $('subs-panel').classList.add('hidden');
      $('subs-cc').classList.add('hidden');
      setBody();
      clearTrack();
      if (tickTimer) { clearInterval(tickTimer); tickTimer = null; }
    },

    pageFullscreenSync: pageFullscreenSync,

    // for tests
    _parse: parseCues,
    _find: findCue
  };

  document.addEventListener('DOMContentLoaded', function () {
    $('subs-cc').addEventListener('click', function () { openPanel(); });
  });
})();
