(function () {
  'use strict';

  // My Videos: links the user saved by hand (a name and a link). They sync with the profile and play in the normal player.
  var MF = window.MF;
  var ui = MF.ui;

  function $(id) { return document.getElementById(id); }

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function go(route, params, opts) { MF.app.go(route, params, opts); }

  function host(url) {
    return String(url || '').replace(/^[a-z]+:\/\//i, '').split(/[/?#]/)[0];
  }

  // Accepts "example.com/x" too; only web links are allowed.
  function cleanUrl(raw) {
    var u = String(raw || '').trim();
    if (!u) return '';
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'https://' + u;
    return /^https?:\/\/[^\s/]+\.?[^\s]*$/i.test(u) ? u : '';
  }

  function isMega(v) { return v.type === 'mega' || !!MF.mega.parse(v.url); }

  function b64url(bytes) {
    var bin = '';
    for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
    return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  // One spelling for every MEGA link, whatever the user pasted.
  function canonical(link) {
    var base = link.type === 'folder' ? 'https://mega.nz/folder/' : 'https://mega.nz/file/';
    return base + link.id + '#' + b64url(link.key) + (link.sub ? '/' + (link.subType === 'file' ? 'file' : 'folder') + '/' + link.sub : '');
  }

  function megaLabel(url) {
    var p = MF.mega.parse(url);
    return !p ? 'MEGA' : (p.type === 'file' || p.subType === 'file') ? 'MEGA file' : 'MEGA folder';
  }

  function fmtSize(n) {
    if (!n) return '';
    if (n >= 1073741824) return (n / 1073741824).toFixed(1) + ' GB';
    if (n >= 1048576) return Math.round(n / 1048576) + ' MB';
    return Math.max(1, Math.round(n / 1024)) + ' KB';
  }

  function stripExt(name) { return String(name).replace(/\.[A-Za-z0-9]{2,4}$/, ''); }

  function playVideo(v) {
    if (isMega(v)) { startMega(v); return; }
    go('player', { type: 'video', id: v.id, title: v.name, subtitle: host(v.url), url: v.url, custom: true, resume: 0 });
  }

  // ---------- The list ----------

  var lastFocus = null;     // { id, edit } of the button that had focus when the page was left

  function render() {
    var list = MF.store.getVideos();
    var holder = $('videos-list');
    holder.innerHTML = '';
    list.forEach(function (v) {
      var row = el('div', 'vrow');
      var play = el('button', 'vrow-play focusable');
      play.setAttribute('data-id', v.id);
      play.appendChild(MF.iconEl(isMega(v) ? 'folder' : 'play'));
      if (isMega(v)) play.classList.add('vrow-folder');
      var text = el('div', 'vrow-text');
      text.appendChild(el('div', 'vrow-name', v.name));
      text.appendChild(el('div', 'vrow-host', isMega(v) ? megaLabel(v.url) : host(v.url)));
      play.appendChild(text);
      if (isMega(v)) play.appendChild(el('span', 'vrow-tag', 'MEGA'));
      play.addEventListener('click', function () { playVideo(v); });
      var edit = el('button', 'vrow-edit focusable');
      edit.setAttribute('data-id', v.id);
      edit.setAttribute('data-edit', '1');
      edit.setAttribute('aria-label', 'Edit ' + v.name);
      edit.appendChild(MF.iconEl('edit'));
      edit.addEventListener('click', function () { openEditor(v); });
      row.appendChild(play);
      row.appendChild(edit);
      holder.appendChild(row);
    });
    $('videos-empty').classList.toggle('hidden', list.length > 0);
  }

  function focusAfterRender(restore) {
    var target = null;
    if (restore && lastFocus) {
      target = document.querySelector('#videos-list [data-id="' + lastFocus.id + '"]' + (lastFocus.edit ? '[data-edit]' : ':not([data-edit])'));
    }
    MF.nav.focus(target || (restore ? document.querySelector('#videos-list .vrow-play') : null) || $('videos-add'));
  }

  // ---------- Add / edit ----------

  var draft = null;     // { id, addedAt } while editing

  function openEditor(v) {
    draft = v ? { id: v.id, name: v.name, url: v.url, addedAt: v.addedAt } : { id: null, name: '', url: '' };
    go('video-edit');
  }

  var saving = false;

  function describeLink() {
    var raw = $('vedit-url').value.trim();
    var node = $('vedit-kind');
    node.classList.remove('bad');
    if (!raw) { node.textContent = ''; return; }
    var m = MF.mega.parse(raw);
    if (m) { node.textContent = megaLabel(canonical(m)) + ' found. You will pick what to watch from its list.'; return; }
    if (cleanUrl(raw)) { node.textContent = 'Direct link'; return; }
    node.textContent = 'Not a link yet';
    node.classList.add('bad');
  }

  function save() {
    if (saving) return;
    var name = $('vedit-name').value.trim();
    var raw = $('vedit-url').value.trim();
    var mega = MF.mega.parse(raw);
    if (mega) {
      // Check the link works (and learn the folder's name) before keeping it.
      var url = canonical(mega);
      saving = true;
      $('vedit-save').textContent = 'Checking link...';
      MF.mega.open(mega).then(function (op) {
        saving = false;
        $('vedit-save').textContent = 'Save';
        MF.store.saveVideo({ id: draft.id, name: name || op.root.name, url: url, type: 'mega', addedAt: draft.addedAt });
        MF.app.back();
      }, function (e) {
        saving = false;
        $('vedit-save').textContent = 'Save';
        ui.toast(e.message, 5000);
        MF.nav.focus($('vedit-url'));
      });
      return;
    }
    var link = cleanUrl(raw);
    if (!name) { ui.toast('Enter a name'); MF.nav.focus($('vedit-name')); return; }
    if (!link) { ui.toast('Enter a web link that starts with http or https'); MF.nav.focus($('vedit-url')); return; }
    MF.store.saveVideo({ id: draft.id, name: name, url: link, addedAt: draft.addedAt });
    MF.app.back();
  }

  function remove() {
    MF.account.dialog({
      title: 'Delete ' + draft.name + '?',
      text: 'It will be removed from every device signed in to this profile.',
      actions: [
        { label: 'Delete', primary: true, onClick: function () { MF.store.removeVideo(draft.id); MF.app.back(); } },
        { label: 'Cancel', onClick: function () {} }
      ]
    });
  }

  function init() {
    $('videos-add').addEventListener('click', function () { openEditor(null); });
    $('vedit-save').addEventListener('click', save);
    $('vedit-cancel').addEventListener('click', function () { MF.app.back(); });
    $('vedit-delete').addEventListener('click', remove);
    $('vedit-url').addEventListener('input', describeLink);
    $('mega-retry').addEventListener('click', function () { if (megaView) showFolder(megaView.v, megaView.folder, false); });
  }


  // ---------- MEGA folders ----------

  var openedCache = {};      // link text -> Promise of the opened folder
  var megaView = null;       // { v, folder } for the page on screen
  var megaFocus = null;      // handle that had focus when the page was left

  function getOpened(v) {
    var link = MF.mega.parse(v.url);
    if (!link) return Promise.reject(new Error('This is not a MEGA link.'));
    if (!openedCache[v.url]) {
      openedCache[v.url] = MF.mega.open(link);
      openedCache[v.url].catch(function () { delete openedCache[v.url]; });
    }
    return openedCache[v.url];
  }

  function nodeByHandle(op, h) {
    return op.nodes.filter(function (n) { return n.h === h; })[0] || null;
  }

  function crumbs(op, handle, rootName) {
    var names = [];
    var cur = handle;
    var guard = 0;
    while (cur && guard++ < 30) {
      var n = nodeByHandle(op, cur);
      if (!n) break;
      names.unshift(n.name);
      cur = n.p;
    }
    return [rootName].concat(names);
  }

  function playableSiblings(op, parent) {
    return MF.mega.children(op, parent).filter(function (n) { return !n.isDir && MF.mega.isCandidate(n); });
  }

  function megaPlayOpts(v, op, node) {
    return {
      type: 'video', id: node.h, title: stripExt(node.name), subtitle: crumbs(op, node.p || null, v.name).join('  \u00B7  '),
      custom: true, mega: { vid: v.id, h: node.h }, resume: 0,
      next: function () {
        var sibs = playableSiblings(op, node.p);
        var at = -1;
        sibs.forEach(function (n, i) { if (n.h === node.h) at = i; });
        return Promise.resolve(at >= 0 && at + 1 < sibs.length ? megaPlayOpts(v, op, sibs[at + 1]) : null);
      }
    };
  }

  // The hosted player page gets everything after the "#", which no server ever sees.
  function playerBase() {
    var custom = String(MF.settings.megaPlayer || '').trim();
    if (custom) return custom;
    var server = String(MF.settings.syncServer || '').trim().replace(/\/+$/, '');
    return server ? server + '/mega/player.html' : '';
  }

  function megaStream(ref) {
    var v = MF.store.getVideos().filter(function (x) { return x.id === ref.vid; })[0];
    if (!v) return Promise.reject(new Error('This saved video was removed.'));
    return getOpened(v).then(function (op) {
      var node = nodeByHandle(op, ref.h);
      if (!node) throw new Error('That file is no longer in the MEGA folder.');
      return MF.mega.download(MF.mega.parse(v.url), node).then(function (dl) {
        // The hosted player page is the fallback for files the TV cannot stream itself (not an MP4, an unusual layout).
        var base = playerBase();
        var hosted = null;
        if (base) {
          var json = JSON.stringify({ u: dl.url, k: MF.mega.hex(dl.aesKey), n: MF.mega.hex(dl.nonce), s: dl.size, t: dl.mime, m: node.name })
            .replace(/[\u0080-\uffff]/g, function (c) { return '\\u' + ('0000' + c.charCodeAt(0).toString(16)).slice(-4); });
          hosted = base + '#' + btoa(json).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
        }
        if (!/\.(mp4|m4v|mov)$/i.test(node.name)) {
          if (hosted) return { page: hosted, sources: [], subtitles: [] };
          throw new Error('This file type needs the sync address. Add it in Settings.');
        }
        return { sources: [{ url: dl.url, type: 'mega', mega: dl, quality: '', label: 'MEGA' }], subtitles: [], pageFallback: hosted };
      });
    });
  }

  // A saved MEGA entry: a single file plays right away, a folder opens its list.
  function startMega(v) {
    var link = MF.mega.parse(v.url);
    if (!link) { ui.toast('This MEGA link is not valid.'); return; }
    var fileHandle = link.type === 'file' ? link.id : (link.subType === 'file' ? link.sub : null);
    if (!fileHandle) { go('mega-browse', { vid: v.id, folder: link.sub || null }); return; }
    ui.toast('Opening MEGA...', 2500);
    getOpened(v).then(function (op) {
      var node = nodeByHandle(op, fileHandle);
      if (!node) { ui.toast('That file is no longer in the MEGA link.'); return; }
      go('player', megaPlayOpts(v, op, node));
    }, function (e) { ui.toast(e.message, 5000); });
  }

  function setStatus(text, bad) {
    var node = $('mega-status');
    node.textContent = text || '';
    node.classList.toggle('hidden', !text);
    node.classList.toggle('bad', !!bad);
    $('mega-retry-wrap').classList.toggle('hidden', !bad);
  }

  function megaRow(node, op, v) {
    var row = el('div', 'vrow');
    var btn = el('button', 'vrow-play focusable' + (node.isDir ? ' vrow-folder' : ''));
    btn.setAttribute('data-h', node.h);
    btn.appendChild(MF.iconEl(node.isDir ? 'folder' : 'play'));
    var text = el('div', 'vrow-text');
    text.appendChild(el('div', 'vrow-name', node.name));
    if (node.where) text.appendChild(el('div', 'vrow-host', node.where));
    btn.appendChild(text);
    var side = node.isDir ? MF.mega.videoCount(op, node.h) + ' videos' : fmtSize(node.size);
    var count = el('span', 'vrow-count', side);
    btn.appendChild(count);
    btn.addEventListener('click', function () {
      if (node.isDir) go('mega-browse', { vid: v.id, folder: node.h });
      else go('player', megaPlayOpts(v, op, node));
    });
    row.appendChild(btn);
    return row;
  }

  function showFolder(v, folder, restore) {
    megaView = { v: v, folder: folder };
    $('mega-list').innerHTML = '';
    $('mega-title').textContent = v.name;
    $('mega-kicker').textContent = 'MEGA';
    $('mega-sub').textContent = '';
    setStatus('Opening MEGA...', false);
    getOpened(v).then(function (op) {
      if (!megaView || megaView.v !== v || megaView.folder !== folder) return;
      var here = folder ? nodeByHandle(op, folder) : null;
      var parent = here ? folder : '';
      var trail = crumbs(op, here ? (here.p || null) : null, v.name);
      $('mega-kicker').textContent = folder ? trail.join('  /  ') : 'MEGA';
      $('mega-title').textContent = folder && here ? here.name : v.name;
      var holder = $('mega-list');
      holder.innerHTML = '';
      var items = MF.mega.children(op, parent).filter(function (n) { return n.isDir ? MF.mega.videoCount(op, n.h) > 0 : MF.mega.isCandidate(n); });
      // If the folder tree can't be followed, still show every video there is.
      if (!items.length && !parent) items = MF.mega.allVideos(op);
      var vids = items.filter(function (n) { return !n.isDir; }).length;
      var folders = items.length - vids;
      $('mega-sub').textContent = items.length ? [vids ? vids + (vids === 1 ? ' video' : ' videos') : '', folders ? folders + (folders === 1 ? ' folder' : ' folders') : ''].filter(Boolean).join('  \u00B7  ') : '';
      if (!items.length) { setStatus('No videos found here. ' + (folder ? '' : MF.mega.inventory(op)), false); return; }
      setStatus('', false);
      items.forEach(function (n) { holder.appendChild(megaRow(n, op, v)); });
      var target = restore && megaFocus ? holder.querySelector('[data-h="' + megaFocus + '"]') : null;
      MF.nav.focus(target || holder.querySelector('.vrow-play'));
    }, function (e) {
      if (!megaView || megaView.v !== v) return;
      setStatus(e.message, true);
      MF.nav.focus($('mega-retry'));
    });
  }

  MF.videos = {
    init: init,
    megaStream: megaStream,
    megaScreen: {
      enter: function (entry, restore) {
        var v = MF.store.getVideos().filter(function (x) { return x.id === entry.params.vid; })[0];
        if (!v) { MF.app.back(); return; }
        showFolder(v, entry.params.folder || null, restore);
      },
      leave: function (entry) {
        var f = entry && entry.focus;
        megaFocus = f && f.getAttribute ? f.getAttribute('data-h') : null;
        megaView = null;
      }
    },
    refresh: function () { if ($('screen-videos').classList.contains('active')) { var f = MF.nav.current(); lastFocus = f && f.getAttribute ? { id: f.getAttribute('data-id'), edit: !!f.getAttribute('data-edit') } : null; render(); focusAfterRender(true); } },
    listScreen: {
      enter: function (entry, restore) {
        render();
        focusAfterRender(restore);
      },
      leave: function (entry) {
        var f = entry && entry.focus;
        lastFocus = f && f.getAttribute && f.getAttribute('data-id') ? { id: f.getAttribute('data-id'), edit: !!f.getAttribute('data-edit') } : null;
      }
    },
    editScreen: {
      enter: function (entry, restore) {
        var isNew = !draft.id;
        $('vedit-title').textContent = isNew ? 'Add Video' : 'Edit Video';
        $('vedit-name').value = draft.name;
        $('vedit-url').value = draft.url;
        $('vedit-name').placeholder = 'Name (optional for MEGA)';
        describeLink();
        $('vedit-delete').classList.toggle('hidden', isNew);
        document.body.classList.add('no-nav');
        MF.nav.focus(restore ? $('vedit-save') : $('vedit-name'));
      },
      leave: function () {}
    }
  };
})();
