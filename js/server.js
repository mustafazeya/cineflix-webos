(function () {
  'use strict';

  // Client for your own licensed media server. API contract is documented in README.md.
  var MF = window.MF;
  var catalogState = { at: 0, loaded: false, keys: null, items: [], promise: null };

  function base() {
    return (MF.settings.serverBase || '').replace(/\/+$/, '');
  }

  // Optional direct stream base: {streamBase}/movie/{id} and {streamBase}/tv/{id}/{season}/{episode}.
  function streamBase() {
    return (MF.settings.streamBase || '').replace(/\/+$/, '');
  }

  // Catalog comes from the catalog server if set, otherwise from the stream server.
  function catalogBase() {
    return base() || streamBase();
  }

  function originOf(url) {
    return ((url || '').match(/^([a-z]+:\/\/[^/]+)/i) || [])[1] || '';
  }

  function resolve(url) {
    if (!url) return url;
    if (/^[a-z]+:\/\//i.test(url)) return url;
    var b = base();
    if (url.charAt(0) === '/') {
      var m = b.match(/^([a-z]+:\/\/[^/]+)/i);
      return (m ? m[1] : '') + url;
    }
    return b + '/' + url;
  }

  function request(path, root) {
    root = root || base();
    if (!root) return Promise.reject(new Error('No media server configured'));
    var headers = { Accept: 'application/json' };
    if (MF.settings.serverToken) headers.Authorization = 'Bearer ' + MF.settings.serverToken;
    // Never let a slow or unreachable server hold up the UI.
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, 4000) : null;
    return fetch(root + path, { headers: headers, signal: ctrl ? ctrl.signal : undefined }).then(function (res) {
      clearTimeout(timer);
      if (res.status === 404) return null;
      if (!res.ok) throw new Error('Media server error (' + res.status + ')');
      // A server without a JSON catalog (e.g. it returns a web page) counts as "no catalog".
      if (!/json/i.test(res.headers.get('content-type') || '')) return null;
      return res.json();
    }, function (err) {
      clearTimeout(timer);
      throw err.name === 'AbortError' ? new Error('Media server did not respond') : err;
    });
  }

  function withToken(url) {
    var token = MF.settings.serverToken;
    if (!token || !url) return url;
    var ours = [originOf(base()), originOf(streamBase())].filter(Boolean);
    var match = ours.some(function (o) { return url.indexOf(o) === 0; });
    if (!match) return url;
    return url + (url.indexOf('?') < 0 ? '?' : '&') + 'token=' + encodeURIComponent(token);
  }

  function normalizeStreams(data) {
    if (!data) return { sources: [], subtitles: [] };
    var sources = (data.sources || []).map(function (s) {
      var url = resolve(s.url);
      return {
        url: withToken(url),
        type: s.type || (/\.m3u8(\?|$)/i.test(url) ? 'hls' : 'mp4'),
        quality: s.quality || '',
        label: s.label || s.quality || 'Default'
      };
    }).filter(function (s) { return !!s.url; });
    var subtitles = (data.subtitles || []).map(function (t) {
      return { url: withToken(resolve(t.url)), lang: t.lang || 'und', label: t.label || t.lang || 'Subtitles' };
    }).filter(function (t) { return !!t.url; });
    return { sources: sources, subtitles: subtitles };
  }

  // Work out whether a stream URL is HLS, a plain video file, or a web page with its own player.
  function probe(url) {
    var guess = /\.m3u8(\?|$)/i.test(url) ? 'hls' : 'mp4';
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var headers = {};
    if (MF.settings.serverToken && originOf(url) && [originOf(base()), originOf(streamBase())].indexOf(originOf(url)) >= 0) {
      headers.Authorization = 'Bearer ' + MF.settings.serverToken;
    }
    return fetch(url, { headers: headers, signal: ctrl ? ctrl.signal : undefined }).then(function (res) {
      if (res.status === 404) throw new Error('Not available on your stream server (404).');
      if (!res.ok) throw new Error('Stream server error (' + res.status + ').');
      var ct = (res.headers.get('content-type') || '').toLowerCase();
      var finalUrl = res.url || url;
      var done = function (kind) { if (ctrl) ctrl.abort(); return kind; };
      if (/mpegurl/.test(ct) || /\.m3u8(\?|$)/i.test(finalUrl)) return done('hls');
      if (/^video\/|^audio\/|octet-stream|mp2t/.test(ct)) return done('mp4');
      if (/text\/html|xhtml/.test(ct)) return done('page');
      return res.text().then(function (body) {
        return body.slice(0, 7) === '#EXTM3U' ? 'hls' : guess;
      });
    }, function (err) {
      if (err && err.message && /404|server error/.test(err.message)) throw err;
      // CORS or network limits on the probe: let the video element try it directly.
      return guess;
    });
  }

  MF.server = {
    enabled: function () { return !!base() || !!streamBase(); },
    usesStreamBase: function () { return !!streamBase(); },

    // Returns [{tmdbId, type, addedAt}] and caches a lookup set. Refreshes on the configured interval.
    catalog: function (force) {
      if (!catalogBase()) return Promise.resolve([]);
      var maxAge = Math.max(5, Number(MF.settings.refreshMinutes) || 60) * 60 * 1000;
      if (!force && catalogState.loaded && Date.now() - catalogState.at < maxAge) {
        return Promise.resolve(catalogState.items);
      }
      if (catalogState.promise) return catalogState.promise;

      catalogState.promise = request('/catalog', catalogBase()).then(function (data) {
        catalogState.loaded = true;
        catalogState.at = Date.now();
        catalogState.promise = null;
        if (data === null) {
          // No /catalog on this server: availability is unknown, so every title stays playable.
          catalogState.items = [];
          catalogState.keys = null;
          return [];
        }
        var items = (data && (data.items || data)) || [];
        if (!Array.isArray(items)) items = [];
        items = items.filter(function (i) { return i && i.tmdbId && (i.type === 'movie' || i.type === 'tv'); });
        items.sort(function (a, b) { return String(b.addedAt || '').localeCompare(String(a.addedAt || '')); });
        catalogState.items = items;
        catalogState.keys = {};
        items.forEach(function (i) { catalogState.keys[MF.store.itemKey(i.type, i.tmdbId)] = true; });
        catalogState.at = Date.now();
        catalogState.promise = null;
        return items;
      }, function (err) {
        // Remember the failure for a few minutes instead of retrying on every screen;
        // keep the previous catalog if there was one.
        catalogState.promise = null;
        if (!catalogState.loaded) { catalogState.items = []; catalogState.keys = null; }
        catalogState.loaded = true;
        catalogState.at = Date.now() - maxAge + 3 * 60 * 1000;
        throw err;
      });
      return catalogState.promise;
    },

    // true / false when the server publishes a catalog; null when availability is unknown.
    has: function (type, id) {
      if (!catalogBase()) return false;
      if (!catalogState.keys) return null;
      return !!catalogState.keys[MF.store.itemKey(type, id)];
    },

    streams: function (type, id, season, episode) {
      if (streamBase()) {
        var url = streamBase() + (type === 'tv'
          ? '/tv/' + id + '/' + season + '/' + episode
          : '/movie/' + id);
        var full = withToken(url);
        var mode = MF.settings.streamType || 'auto';
        if (mode === 'page') return Promise.resolve({ page: full, sources: [], subtitles: [] });
        var detect = mode === 'video'
          ? Promise.resolve(/\.m3u8(\?|$)/i.test(full) ? 'hls' : 'mp4')
          : probe(full);
        return detect.then(function (kind) {
          if (kind === 'page') return { page: full, sources: [], subtitles: [] };
          return {
            sources: [{ url: full, type: kind, quality: '', label: 'Auto' }],
            subtitles: [],
            // In auto mode, if the video element can't play it, open it as a web page instead.
            pageFallback: mode === 'auto' ? full : null
          };
        });
      }
      var path = type === 'tv'
        ? '/streams/tv/' + id + '/' + season + '/' + episode
        : '/streams/movie/' + id;
      return request(path).then(normalizeStreams);
    },

    // Resolves to the number of titles, or null when the server has no /catalog.
    ping: function () {
      return request('/catalog', catalogBase()).then(function (d) {
        if (d === null) return null;
        var items = (d && (d.items || d)) || [];
        return Array.isArray(items) ? items.length : 0;
      });
    },

    reset: function () {
      catalogState = { at: 0, loaded: false, keys: null, items: [], promise: null };
    }
  };
})();
