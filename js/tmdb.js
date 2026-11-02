(function () {
  'use strict';

  var MF = window.MF;
  var cache = {};

  function ttl() {
    return Math.max(5, Number(MF.settings.refreshMinutes) || 60) * 60 * 1000;
  }

  function request(path, params) {
    var s = MF.settings;
    if (!s.tmdbKey) return Promise.reject(new Error('Add your TMDB key in Settings'));

    params = Object.assign({ language: s.language }, params || {});
    var headers = { Accept: 'application/json' };
    // v4 read access tokens are long JWTs; v3 keys are 32 hex chars.
    if (s.tmdbKey.length > 40) headers.Authorization = 'Bearer ' + s.tmdbKey;
    else params.api_key = s.tmdbKey;

    var query = Object.keys(params)
      .filter(function (k) { return params[k] !== undefined && params[k] !== null && params[k] !== ''; })
      .map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); })
      .join('&');
    var url = s.tmdbBase.replace(/\/$/, '') + path + (query ? '?' + query : '');

    var hit = cache[url];
    if (hit && Date.now() - hit.at < ttl()) return hit.promise;

    var promise = fetch(url, { headers: headers }).then(function (res) {
      if (!res.ok) throw new Error('TMDB request failed (' + res.status + ')');
      return res.json();
    });
    cache[url] = { at: Date.now(), promise: promise };
    promise.catch(function () { delete cache[url]; });
    return promise;
  }

  function tag(type) {
    return function (data) {
      (data.results || []).forEach(function (r) {
        if (!r.media_type) r.media_type = type;
      });
      return data;
    };
  }

  function playable(data) {
    data.results = (data.results || []).filter(function (r) {
      return (r.media_type === 'movie' || r.media_type === 'tv') && (r.poster_path || r.backdrop_path);
    });
    return data;
  }

  MF.tmdb = {
    clearCache: function () { cache = {}; },

    img: function (path, size) {
      return path ? MF.settings.tmdbImageBase + (size || 'w342') + path : '';
    },

    trending: function (type, window_) {
      return request('/trending/' + (type || 'all') + '/' + (window_ || 'day')).then(tag(type)).then(playable);
    },

    // kind: popular | top_rated | now_playing | upcoming | on_the_air | airing_today
    list: function (type, kind, page) {
      return request('/' + type + '/' + kind, { page: page || 1, region: MF.settings.region }).then(tag(type)).then(playable);
    },

    discover: function (type, params) {
      return request('/discover/' + type, Object.assign({ sort_by: 'popularity.desc', 'vote_count.gte': 50 }, params))
        .then(tag(type)).then(playable);
    },

    details: function (type, id) {
      var extra = type === 'movie' ? 'credits,videos,recommendations,release_dates' : 'credits,videos,recommendations,content_ratings';
      return request('/' + type + '/' + id, { append_to_response: extra }).then(function (d) {
        d.media_type = type;
        if (d.recommendations) tag(type)(d.recommendations);
        return d;
      });
    },

    season: function (id, number) {
      return request('/tv/' + id + '/season/' + number);
    },

    // Title logo (transparent PNG) in the UI language or English, best voted first.
    logo: function (type, id) {
      var lang = (MF.settings.language || 'en').slice(0, 2);
      return request('/' + type + '/' + id + '/images', { language: null, include_image_language: lang + ',en,null' }).then(function (d) {
        var logos = (d.logos || []).filter(function (l) { return /\.png$/i.test(l.file_path); });
        var rank = function (l) { return l.iso_639_1 === lang ? 2 : (l.iso_639_1 === 'en' ? 1 : 0); };
        logos.sort(function (a, b) { return rank(b) - rank(a) || (b.vote_average || 0) - (a.vote_average || 0); });
        return logos[0] ? logos[0].file_path : null;
      }, function () { return null; });
    },

    // id -> name for movie and TV genres (used in hero and card meta lines).
    genreNames: function () {
      return Promise.all([this.genres('movie'), this.genres('tv')]).then(function (lists) {
        var map = {};
        lists[0].concat(lists[1]).forEach(function (g) { map[g.id] = g.name; });
        return map;
      });
    },

    genres: function (type) {
      return request('/genre/' + type + '/list').then(function (d) { return d.genres || []; });
    },

    searchPerson: function (query) {
      return request('/search/person', { query: query, include_adult: false });
    },

    popularPeople: function () {
      return request('/person/popular');
    },

    personCredits: function (id, type) {
      return request('/person/' + id + '/' + (type === 'tv' ? 'tv_credits' : 'movie_credits'));
    },

    search: function (query) {
      return request('/search/multi', { query: query, include_adult: false }).then(playable);
    },

    ping: function () {
      return request('/configuration');
    }
  };
})();
