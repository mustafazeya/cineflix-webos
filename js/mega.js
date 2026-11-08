/*
 * MEGA public links, read in the app itself: nothing is sent to any CineFlix server and the key never leaves the device.
 *   parse(link)             -> { type: 'folder' | 'file', id, key, sub }
 *   open(link)              -> { root, nodes }  (folder: every node with its decrypted name; file: the one file)
 *   download(link, node)    -> { url, size, aesKey, nonce }  (a temporary download address and what is needed to decrypt it)
 *   range(dl, start, end)   -> Uint8Array of the decrypted bytes start..end (inclusive)
 * Names and keys are decrypted with AES (WebCrypto); file data is AES-CTR.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else { root.MF = root.MF || {}; root.MF.mega = factory(); }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  var API = 'https://g.api.mega.co.nz/cs';
  var subtle = (typeof crypto !== 'undefined' ? crypto : require('node:crypto').webcrypto).subtle;

  var VIDEO_EXT = { mp4: 'video/mp4', m4v: 'video/mp4', mov: 'video/quicktime', mkv: 'video/x-matroska', webm: 'video/webm',
    avi: 'video/x-msvideo', ts: 'video/mp2t', m2ts: 'video/mp2t', mpg: 'video/mpeg', mpeg: 'video/mpeg', wmv: 'video/x-ms-wmv',
    flv: 'video/x-flv', '3gp': 'video/3gpp', ogv: 'video/ogg' };

  function ext(name) { var m = /\.([A-Za-z0-9]{2,4})$/.exec(name || ''); return m ? m[1].toLowerCase() : ''; }
  function isVideo(name) { return !!VIDEO_EXT[ext(name)]; }

  // Things that are certainly not videos, so a big file of another kind is not offered as one.
  var OTHER = {};
  ('txt nfo jpg jpeg png gif webp bmp srt sub idx ass ssa vtt pdf doc docx xls xlsx ppt pptx zip rar 7z tar gz iso exe dmg apk lnk url html htm ' +
    'db ini sfv md5 nzb torrent mp3 flac wav aac m4a ogg epub mobi cbz cbr json xml log').split(' ').forEach(function (e) { OTHER[e] = 1; });
  var BIG_FILE = 30 * 1048576;

  // A file worth listing: a known video type, or a large file with an unfamiliar extension (some folders have none).
  function isCandidate(node) {
    return isVideo(node.name) || (!OTHER[ext(node.name)] && node.size >= BIG_FILE);
  }

  // For an empty listing: what the folder does hold, e.g. "The folder has 12 files: .rar x9, .jpg x3."
  function inventory(opened) {
    var files = opened.nodes.filter(function (n) { return !n.isDir; });
    if (!files.length) return 'The folder has no files.';
    var counts = {};
    files.forEach(function (n) { var k = ext(n.name) ? '.' + ext(n.name) : 'no extension'; counts[k] = (counts[k] || 0) + 1; });
    var top = Object.keys(counts).sort(function (a, b) { return counts[b] - counts[a]; }).slice(0, 4).map(function (k) { return k + ' x' + counts[k]; });
    return 'The folder has ' + files.length + (files.length === 1 ? ' file' : ' files') + ': ' + top.join(', ') + '.';
  }
  function mimeFor(name) { return VIDEO_EXT[ext(name)] || 'application/octet-stream'; }

  // ---------- Encoding ----------

  function b64d(s) {
    s = String(s).replace(/-/g, '+').replace(/_/g, '/').replace(/,/g, '');
    while (s.length % 4) s += '=';
    var bin = atob(s);
    var out = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  function hex(bytes) {
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += (bytes[i] < 16 ? '0' : '') + bytes[i].toString(16);
    return s;
  }

  function utf8(bytes) { return new TextDecoder('utf-8').decode(bytes); }

  // ---------- Links ----------

  var ID = '[A-Za-z0-9_-]{8}';
  var KEY = '[A-Za-z0-9_-]{22,43}';

  // Folder links (new and old style), file links (new and old style). A folder link may point inside the folder.
  function parse(text) {
    var t = String(text || '').trim();
    var m;
    if ((m = new RegExp('mega(?:\\.co)?\\.(?:nz|io)/folder/(' + ID + ')#(' + KEY + ')(?:/(folder|file)/(' + ID + '))?', 'i').exec(t))) return make('folder', m[1], m[2], m[4], m[3]);
    if ((m = new RegExp('mega(?:\\.co)?\\.(?:nz|io)/#F!(' + ID + ')!(' + KEY + ')(?:[!?/](' + ID + '))?', 'i').exec(t))) return make('folder', m[1], m[2], m[3], 'folder');
    if ((m = new RegExp('mega(?:\\.co)?\\.(?:nz|io)/file/(' + ID + ')#(' + KEY + ')', 'i').exec(t))) return make('file', m[1], m[2]);
    if ((m = new RegExp('mega(?:\\.co)?\\.(?:nz|io)/#!(' + ID + ')!(' + KEY + ')', 'i').exec(t))) return make('file', m[1], m[2]);
    return null;
  }

  function make(type, id, key, sub, subType) {
    var k;
    try { k = b64d(key); } catch (e) { return null; }
    if ((type === 'folder' && k.length !== 16) || (type === 'file' && k.length !== 32)) return null;
    return { type: type, id: id, key: k, sub: sub || null, subType: subType || null };
  }

  // ---------- AES helpers (WebCrypto has no raw ECB/CBC without padding, so a padding block is appended and dropped) ----------

  var zeroIv = new Uint8Array(16);

  function importKey(raw, usage) { return subtle.importKey('raw', raw, { name: 'AES-CBC' }, false, usage); }

  // Decrypts whole 16-byte blocks that were encrypted with AES-CBC and an all-zero IV (ECB for a single block).
  function cbcZeroDecrypt(keyBytes, data) {
    if (data.length === 0 || data.length % 16 !== 0) return Promise.reject(new Error('bad length'));
    return Promise.all([importKey(keyBytes, ['decrypt', 'encrypt'])]).then(function (r) {
      var key = r[0];
      var last = data.slice(data.length - 16);
      // Encrypting nothing under CBC with the last ciphertext block as IV gives exactly the block that makes PKCS7 padding valid.
      return subtle.encrypt({ name: 'AES-CBC', iv: last }, key, new Uint8Array(0)).then(function (pad) {
        var joined = new Uint8Array(data.length + 16);
        joined.set(data, 0);
        joined.set(new Uint8Array(pad).slice(0, 16), data.length);
        return subtle.decrypt({ name: 'AES-CBC', iv: zeroIv }, key, joined);
      });
    }).then(function (plain) { return new Uint8Array(plain); });
  }

  // ECB over several blocks: each block on its own.
  function ecbDecrypt(keyBytes, data) {
    var blocks = [];
    for (var i = 0; i < data.length; i += 16) blocks.push(cbcZeroDecrypt(keyBytes, data.slice(i, i + 16)));
    return Promise.all(blocks).then(function (parts) {
      var out = new Uint8Array(data.length);
      parts.forEach(function (p, n) { out.set(p, n * 16); });
      return out;
    });
  }

  // A file key is 32 bytes: the AES key is the first half xor the second half; the CTR nonce is bytes 16..23.
  function fileKeyParts(key32) {
    var aes = new Uint8Array(16);
    for (var i = 0; i < 16; i++) aes[i] = key32[i] ^ key32[i + 16];
    return { aesKey: aes, nonce: key32.slice(16, 24) };
  }

  function decryptAttrs(attrB64, keyBytes) {
    var data = b64d(attrB64);
    var pad = data.length % 16;
    if (pad) { var d2 = new Uint8Array(data.length + 16 - pad); d2.set(data, 0); data = d2; }
    return cbcZeroDecrypt(keyBytes, data).then(function (plain) {
      var text = utf8(plain).replace(/\0+$/, '');
      if (text.indexOf('MEGA{') !== 0) throw new Error('wrong key');
      return JSON.parse(text.slice(4));
    });
  }

  // ---------- API ----------

  var ERRORS = {
    '-2': 'This MEGA link is not valid.',
    '-9': 'This MEGA link was not found. It may have been removed.',
    '-11': 'This MEGA link is not allowed to be opened.',
    '-13': 'This MEGA link is not complete.',
    '-14': 'The MEGA link key is wrong.',
    '-16': 'MEGA has blocked this link.',
    '-17': 'MEGA says the transfer limit for this link is used up. Try again later.',
    '-18': 'This MEGA link is temporarily unavailable. Try again later.'
  };

  var seq = Math.floor(Math.random() * 0x100000000);

  function call(command, folderId, attempt) {
    attempt = attempt || 0;
    var url = API + '?id=' + (seq++) + (folderId ? '&n=' + encodeURIComponent(folderId) : '');
    return fetch(url, { method: 'POST', body: JSON.stringify([command]) }).then(function (res) {
      if (!res.ok) throw new Error('MEGA did not respond (' + res.status + ').');
      return res.json();
    }).then(function (data) {
      var r = Array.isArray(data) ? data[0] : data;
      if (typeof r === 'number') {
        if (r === -3 && attempt < 4) return new Promise(function (ok) { setTimeout(ok, 500 * (attempt + 1)); }).then(function () { return call(command, folderId, attempt + 1); });
        var err = new Error(ERRORS[String(r)] || 'MEGA returned error ' + r + '.');
        err.code = r;
        throw err;
      }
      return r;
    }, function (e) {
      if (e && e.code) throw e;
      throw new Error('Could not reach MEGA. Check the internet connection.');
    });
  }

  // ---------- Opening a link ----------

  function nodeFrom(raw, folderKey) {
    // k looks like "ownerHandle:base64key" and may list several owners separated by "/".
    var parts = String(raw.k || '').split('/');
    var tries = parts.map(function (part) { return part.split(':')[1]; }).filter(Boolean);
    var size = raw.t === 1 ? 16 : 32;
    var attempt = function (i) {
      if (i >= tries.length) return Promise.resolve(null);
      var enc;
      try { enc = b64d(tries[i]); } catch (e) { return attempt(i + 1); }
      if (enc.length < size) return attempt(i + 1);
      return ecbDecrypt(folderKey, enc.slice(0, size)).then(function (key) {
        var attrKey = raw.t === 1 ? key : fileKeyParts(key).aesKey;
        return decryptAttrs(raw.a, attrKey).then(function (attrs) {
          return { h: raw.h, p: raw.p, isDir: raw.t === 1, name: String(attrs.n || ''), size: raw.s || 0, key: key, ts: raw.ts || 0 };
        });
      }).catch(function () { return attempt(i + 1); });
    };
    return attempt(0);
  }

  function open(link) {
    if (link.type === 'file') {
      return call({ a: 'g', p: link.id, ssl: 1 }).then(function (r) {
        return decryptAttrs(r.at, fileKeyParts(link.key).aesKey).then(function (attrs) {
          var node = { h: link.id, p: '', isDir: false, name: String(attrs.n || 'Video'), size: r.s || 0, key: link.key, ts: 0 };
          return { root: { h: link.id, name: node.name }, nodes: [node], single: true };
        });
      });
    }
    return call({ a: 'f', c: 1, r: 1 }, link.id).then(function (r) {
      var raws = (r && r.f) || [];
      return Promise.all(raws.map(function (n) { return nodeFrom(n, link.key); })).then(function (list) {
        var all = list.filter(Boolean);
        if (!all.length) throw new Error('This folder is empty, or the link key is wrong.');
        var rootNode = all.filter(function (n) { return n.h === link.id; })[0];
        var inside = all.filter(function (n) { return n.h !== link.id; });
        // Whatever sits at the top of the tree is the top level, however MEGA happens to name the parent.
        var ids = {};
        inside.forEach(function (n) { ids[n.h] = 1; });
        inside.forEach(function (n) { if (!ids[n.p]) n.p = ''; });
        var rootName = rootNode ? rootNode.name : 'MEGA folder';
        // A lone wrapper folder at the top is skipped: its contents are the top level.
        var tops = inside.filter(function (n) { return n.p === ''; });
        if (tops.length === 1 && tops[0].isDir) {
          var wrapper = tops[0];
          if (!rootNode) rootName = wrapper.name;
          inside = inside.filter(function (n) { return n !== wrapper; });
          inside.forEach(function (n) { if (n.p === wrapper.h) n.p = ''; });
        }
        return { root: { h: link.id, name: rootName }, nodes: inside, single: false };
      });
    });
  }

  // The folder's children by parent, folders first, then natural name order (episode 2 before episode 10).
  var collator = typeof Intl !== 'undefined' && Intl.Collator ? new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' }) : null;
  function byName(a, b) { return collator ? collator.compare(a.name, b.name) : (a.name < b.name ? -1 : a.name > b.name ? 1 : 0); }

  function children(opened, parent) {
    return opened.nodes.filter(function (n) { return n.p === parent; }).sort(function (a, b) {
      if (a.isDir !== b.isDir) return a.isDir ? -1 : 1;
      return byName(a, b);
    });
  }

  // Every video in the tree, in path order. Used when the folder structure can't be followed.
  function allVideos(opened) {
    function trail(parent) {
      var names = [];
      var cur = parent;
      var guard = 0;
      while (cur && guard++ < 30) {
        var n = opened.nodes.filter(function (x) { return x.h === cur; })[0];
        if (!n) break;
        names.unshift(n.name);
        cur = n.p;
      }
      return names.join(' / ');
    }
    return opened.nodes.filter(function (n) { return !n.isDir && isCandidate(n); }).map(function (n) { return { n: n, where: trail(n.p) }; })
      .sort(function (a, b) { return a.where === b.where ? byName(a.n, b.n) : byName({ name: a.where }, { name: b.where }); })
      .map(function (x) { x.n.where = x.where; return x.n; });
  }

  // How many videos are inside a folder (all levels), so empty folders can be hidden.
  function videoCount(opened, parent) {
    var total = 0;
    children(opened, parent).forEach(function (n) { total += n.isDir ? videoCount(opened, n.h) : (isCandidate(n) ? 1 : 0); });
    return total;
  }

  // ---------- Streaming ----------

  function download(link, node) {
    var cmd = link.type === 'file' ? { a: 'g', g: 1, p: link.id, ssl: 1 } : { a: 'g', g: 1, n: node.h, ssl: 1 };
    return call(cmd, link.type === 'file' ? null : link.id).then(function (r) {
      var url = Array.isArray(r.g) ? r.g[0] : r.g;
      if (!url) throw new Error('MEGA did not give a download address for this file.');
      var parts = fileKeyParts(node.key);
      return { url: String(url).replace(/^http:\/\/([^/]*\.mega\.(?:co\.)?nz)/i, 'https://$1'), size: r.s || node.size, aesKey: parts.aesKey, nonce: parts.nonce, name: node.name, mime: mimeFor(node.name) };
    });
  }

  // AES-CTR with the 8-byte nonce and a 64-bit block counter, as MEGA stores files.
  function ctrDecrypt(aesKey, nonce, offset, data) {
    var first = offset - (offset % 16);
    var counter = new Uint8Array(16);
    counter.set(nonce, 0);
    var block = first / 16;
    for (var i = 15; i >= 8; i--) { counter[i] = block % 256; block = Math.floor(block / 256); }
    return subtle.importKey('raw', aesKey, { name: 'AES-CTR' }, false, ['decrypt']).then(function (key) {
      var lead = offset - first;
      var padded = new Uint8Array(lead + data.length);
      padded.set(data, lead);
      return subtle.decrypt({ name: 'AES-CTR', counter: counter, length: 64 }, key, padded);
    }).then(function (plain) { return new Uint8Array(plain).slice(offset - first); });
  }

  function range(dl, start, end) {
    var first = start - (start % 16);
    return fetch(dl.url + '/' + first + '-' + end).then(function (res) {
      if (!res.ok) throw new Error('MEGA storage did not respond (' + res.status + ').');
      return res.arrayBuffer();
    }).then(function (buf) {
      return ctrDecrypt(dl.aesKey, dl.nonce, first, new Uint8Array(buf)).then(function (plain) { return plain.slice(start - first); });
    });
  }

  return {
    parse: parse, open: open, children: children, videoCount: videoCount, allVideos: allVideos, download: download, range: range,
    isVideo: isVideo, isCandidate: isCandidate, inventory: inventory, mimeFor: mimeFor, hex: hex, ctrDecrypt: ctrDecrypt, b64d: b64d,
    _setApi: function (u) { API = u; },
    _internals: { fileKeyParts: fileKeyParts, ecbDecrypt: ecbDecrypt, cbcZeroDecrypt: cbcZeroDecrypt, decryptAttrs: decryptAttrs }
  };
});
