(function () {
  'use strict';

  var KEYS = {
    settings: 'mfc.settings',
    progress: 'mfc.progress',
    mylist: 'mfc.mylist',
    watched: 'mfc.watched',
    episodes: 'mfc.episodes'
  };

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch (e) {
      return fallback;
    }
  }

  function write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* storage full or unavailable */ }
  }

  function itemKey(type, id) {
    return type + ':' + id;
  }

  var MF = window.MF = window.MF || {};

  MF.settings = Object.assign({}, window.MF_DEFAULTS, read(KEYS.settings, {}));
  // Remove data left by the former "My Videos" feature.
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
        eps[key + ':' + entry.season + ':' + entry.episode] = Date.now();
        write(KEYS.episodes, eps);
      }
      if (finished && entry.type === 'movie') {
        delete all[key];
        MF.store.setWatched({
          id: entry.id, media_type: 'movie', title: entry.title,
          poster_path: entry.poster_path, backdrop_path: entry.backdrop_path
        }, true);
      } else {
        entry.updatedAt = Date.now();
        entry.finished = finished;
        all[key] = entry;
      }
      write(KEYS.progress, all);
    },

    continueWatching: function () {
      var all = read(KEYS.progress, {});
      return Object.keys(all).map(function (k) { return all[k]; })
        // Unknown duration means a web-page player without progress reporting: it was started, so keep it.
        .filter(function (e) { return e.position > 30 || e.type === 'tv' || !e.duration; })
        .sort(function (a, b) { return b.updatedAt - a.updatedAt; })
        .slice(0, 20);
    },

    clearProgress: function () {
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
        if (prog[key]) { delete prog[key]; write(KEYS.progress, prog); }
      } else {
        delete all[key];
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
      } else {
        list.unshift({
          id: item.id,
          media_type: item.media_type,
          title: item.title || item.name,
          poster_path: item.poster_path,
          backdrop_path: item.backdrop_path,
          overview: item.overview,
          vote_average: item.vote_average,
          release_date: item.release_date || item.first_air_date
        });
      }
      write(KEYS.mylist, list);
      return idx < 0;
    }
  };
})();
