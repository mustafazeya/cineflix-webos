#!/usr/bin/env node
// Reference implementation of the CineFlix media server API.
// Serves titles you have the rights to, described in library.json. No dependencies.
//
//   node tools/media-server.js [--port 8090] [--library tools/library.json] [--media ./media]
//   MEDIA_TOKEN=secret node tools/media-server.js     (optional bearer-token auth)
//
// Edit library.json while the server runs; changes are picked up on the next request,
// so new titles show up in the app at the next catalog refresh.

'use strict';

const http = require('http');
const fs = require('fs');
const path = require('path');

function arg(name, fallback) {
  const i = process.argv.indexOf('--' + name);
  return i > -1 ? process.argv[i + 1] : fallback;
}

const PORT = Number(arg('port', process.env.PORT || 8090));
const LIBRARY = path.resolve(arg('library', path.join(__dirname, 'library.json')));
const MEDIA_DIR = path.resolve(arg('media', path.join(__dirname, '..', 'media')));
const TOKEN = process.env.MEDIA_TOKEN || '';

const MIME = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.webm': 'video/webm',
  '.mkv': 'video/x-matroska',
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.m4s': 'video/iso.segment',
  '.vtt': 'text/vtt',
  '.jpg': 'image/jpeg',
  '.png': 'image/png'
};

function loadLibrary() {
  try {
    return JSON.parse(fs.readFileSync(LIBRARY, 'utf8'));
  } catch (err) {
    console.error('Cannot read library:', err.message);
    return { movies: [], tv: [] };
  }
}

function cors(res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Range, Content-Type');
  res.setHeader('Access-Control-Expose-Headers', 'Content-Length, Content-Range, Accept-Ranges');
}

function json(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function authorized(req, url) {
  if (!TOKEN) return true;
  const header = req.headers.authorization || '';
  return header === 'Bearer ' + TOKEN || url.searchParams.get('token') === TOKEN;
}

// Local files are referenced as "media/<path>" and served below /media with Range support.
function mediaUrl(file) {
  return '/media/' + file.split('/').map(encodeURIComponent).join('/');
}

function streamsFor(entry) {
  if (!entry) return null;
  const sources = (entry.sources || []).map((s) => ({
    url: s.file ? mediaUrl(s.file) : s.url,
    type: s.type,
    quality: s.quality,
    label: s.label
  }));
  const subtitles = (entry.subtitles || []).map((t) => ({
    url: t.file ? mediaUrl(t.file) : t.url,
    lang: t.lang,
    label: t.label
  }));
  return { sources, subtitles };
}

function serveMedia(req, res, rel) {
  const target = path.resolve(MEDIA_DIR, decodeURIComponent(rel));
  if (!target.startsWith(MEDIA_DIR + path.sep)) return json(res, 403, { error: 'forbidden' });
  fs.stat(target, (err, stat) => {
    if (err || !stat.isFile()) return json(res, 404, { error: 'not found' });
    const type = MIME[path.extname(target).toLowerCase()] || 'application/octet-stream';
    const range = req.headers.range && /bytes=(\d*)-(\d*)/.exec(req.headers.range);
    if (range) {
      let start = range[1] ? parseInt(range[1], 10) : stat.size - parseInt(range[2], 10);
      let end = range[1] && range[2] ? parseInt(range[2], 10) : stat.size - 1;
      if (isNaN(start) || start < 0 || start >= stat.size || end >= stat.size || start > end) {
        res.writeHead(416, { 'Content-Range': 'bytes */' + stat.size });
        return res.end();
      }
      res.writeHead(206, {
        'Content-Type': type,
        'Content-Length': end - start + 1,
        'Content-Range': `bytes ${start}-${end}/${stat.size}`,
        'Accept-Ranges': 'bytes'
      });
      fs.createReadStream(target, { start, end }).pipe(res);
    } else {
      res.writeHead(200, { 'Content-Type': type, 'Content-Length': stat.size, 'Accept-Ranges': 'bytes' });
      if (req.method === 'HEAD') return res.end();
      fs.createReadStream(target).pipe(res);
    }
  });
}

// Wrapper page for YouTube trailers. webOS apps run from file:// and send no referrer, which makes
// YouTube embeds fail with error 153. Loading the embed from this http page gives it a valid origin.
function trailerPage(videoId) {
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="referrer" content="strict-origin-when-cross-origin">
<style>html,body{margin:0;height:100%;background:#000;overflow:hidden}#p{width:100%;height:100%}</style></head>
<body><div id="p"></div><script>
var player;
function send(m){ m.source = 'mf-trailer'; parent.postMessage(m, '*'); }
function onYouTubeIframeAPIReady(){
  player = new YT.Player('p', { videoId: ${JSON.stringify(videoId)}, width: '100%', height: '100%',
    playerVars: { autoplay: 1, controls: 0, rel: 0, playsinline: 1, iv_load_policy: 3, origin: location.origin },
    events: {
      onReady: function (e) { e.target.playVideo(); send({ type: 'ready' }); },
      onStateChange: function (e) { send({ type: 'state', state: e.data, time: player.getCurrentTime(), duration: player.getDuration() }); },
      onError: function (e) { send({ type: 'error', code: e.data }); }
    } });
}
window.addEventListener('message', function (e) {
  var d = e.data || {};
  if (!player || d.source !== 'mf-app') return;
  if (d.cmd === 'toggle') { if (player.getPlayerState() === 1) player.pauseVideo(); else player.playVideo(); }
  if (d.cmd === 'seek') player.seekTo(Math.max(0, player.getCurrentTime() + d.value), true);
});
</script><script src="https://www.youtube.com/iframe_api"></script></body></html>`;
}

const server = http.createServer((req, res) => {
  cors(res);
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end(); }

  const url = new URL(req.url, 'http://localhost');
  const parts = url.pathname.split('/').filter(Boolean);

  // GET /trailer?v=<youtubeId>  (no auth: it only wraps a public YouTube video)
  if (parts.length === 1 && parts[0] === 'trailer') {
    const v = url.searchParams.get('v') || '';
    if (!/^[A-Za-z0-9_-]{6,20}$/.test(v)) return json(res, 400, { error: 'invalid video id' });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Referrer-Policy': 'strict-origin-when-cross-origin' });
    return res.end(trailerPage(v));
  }

  if (parts[0] === 'media') {
    if (!authorized(req, url)) return json(res, 401, { error: 'unauthorized' });
    return serveMedia(req, res, parts.slice(1).join('/'));
  }

  if (!authorized(req, url)) return json(res, 401, { error: 'unauthorized' });
  const lib = loadLibrary();

  // Direct stream routes: GET /movie/:tmdbId and GET /tv/:tmdbId/:season/:episode
  // redirect to the title's first source, so the app's "Stream URL" mode can point here.
  if ((parts[0] === 'movie' && parts.length === 2) || (parts[0] === 'tv' && parts.length === 4)) {
    let entry;
    if (parts[0] === 'movie') {
      entry = (lib.movies || []).find((m) => String(m.tmdbId) === parts[1]);
    } else {
      const show = (lib.tv || []).find((x) => String(x.tmdbId) === parts[1]);
      entry = show && show.episodes && show.episodes[`${Number(parts[2])}x${Number(parts[3])}`];
    }
    const src = entry && entry.sources && entry.sources[0];
    if (!src) return json(res, 404, { error: 'not in library' });
    let target = src.file ? mediaUrl(src.file) : src.url;
    if (src.file && TOKEN) target += '?token=' + encodeURIComponent(TOKEN);
    res.writeHead(302, { Location: target, 'Cache-Control': 'no-store' });
    return res.end();
  }

  // GET /catalog
  if (parts.length === 1 && parts[0] === 'catalog') {
    const items = []
      .concat((lib.movies || []).map((m) => ({ tmdbId: m.tmdbId, type: 'movie', addedAt: m.addedAt })))
      .concat((lib.tv || []).map((s) => ({ tmdbId: s.tmdbId, type: 'tv', addedAt: s.addedAt })));
    return json(res, 200, { items });
  }

  // GET /streams/movie/:tmdbId
  if (parts[0] === 'streams' && parts[1] === 'movie' && parts.length === 3) {
    const movie = (lib.movies || []).find((m) => String(m.tmdbId) === parts[2]);
    const body = streamsFor(movie);
    return body ? json(res, 200, body) : json(res, 404, { error: 'not in library' });
  }

  // GET /streams/tv/:tmdbId/:season/:episode
  if (parts[0] === 'streams' && parts[1] === 'tv' && parts.length === 5) {
    const show = (lib.tv || []).find((s) => String(s.tmdbId) === parts[2]);
    const ep = show && show.episodes && show.episodes[`${Number(parts[3])}x${Number(parts[4])}`];
    const body = streamsFor(ep);
    return body ? json(res, 200, body) : json(res, 404, { error: 'not in library' });
  }

  json(res, 404, { error: 'unknown endpoint' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`CineFlix media server on http://0.0.0.0:${PORT}`);
  console.log(`Library: ${LIBRARY}`);
  console.log(`Media dir: ${MEDIA_DIR}`);
  if (TOKEN) console.log('Bearer token auth enabled');
});
