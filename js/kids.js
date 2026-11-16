(function () {
  'use strict';

  // Kids profiles: a content filter that every TMDB listing, search and title page goes through, plus the rules for what a kids
  // profile may open. A title is kid-safe when its US certification is at or below the profile's maximum. Titles without a
  // known certification are blocked. The filter works on certifications and TMDB genre ids, never on titles or keywords.

  var MF = window.MF;

  var RANK = { G: 0, PG: 1, 'PG-13': 2, R: 3 };
  // US movie certifications and US TV content ratings on the same scale as the profile's maxRating.
  var CERT_RANK = {
    G: 0, PG: 1, 'PG-13': 2, R: 3, 'NC-17': 4,
    'TV-Y': 0, 'TV-Y7': 0, 'TV-Y7-FV': 0, 'TV-G': 0, 'TV-PG': 1, 'TV-14': 2, 'TV-MA': 3
  };
  // Genres that are ruled out before any certification lookup, so a search does not need a request per result.
  var BLOCKED_GENRES = { movie: [27, 53, 10752], tv: [80, 10768, 10766, 10764, 10763] };
  // Screens that can show adult catalog content or lead out of the profile.
  var RESTRICTED = ['explore', 'videos', 'video-edit', 'mega-browse', 'settings', 'account', 'signin', 'profiles', 'profile-edit', 'avatars'];
  var MESSAGE = 'Not available on this profile';

  var known = {};          // "type:id" -> { rank, adult, genres }
  var unlocked = false;
  var queue = [];
  var running = 0;
  var LIMIT = 6;

  function profile() {
    return MF.sync && MF.sync.signedIn() ? MF.sync.activeProfile() : null;
  }

  function active() {
    var p = profile();
    return !!(p && p.kids);
  }

  function maxRating() {
    var p = profile();
    return p && RANK[p.maxRating] !== undefined ? p.maxRating : 'PG';
  }

  function maxRank() { return RANK[maxRating()]; }

  function typeOf(item) { return item.media_type === 'tv' ? 'tv' : 'movie'; }

  function blockedGenre(type, ids) {
    var bad = BLOCKED_GENRES[type];
    return (ids || []).some(function (id) { return bad.indexOf(id) >= 0; });
  }

  // US certification of a details response (needs release_dates for movies, content_ratings for TV). null = unknown.
  function rankOf(type, d) {
    var ratings = [];
    if (type === 'movie') {
      var us = ((d.release_dates && d.release_dates.results) || []).filter(function (r) { return r.iso_3166_1 === 'US'; })[0];
      ratings = ((us && us.release_dates) || []).map(function (r) { return r.certification; });
    } else {
      var tv = ((d.content_ratings && d.content_ratings.results) || []).filter(function (r) { return r.iso_3166_1 === 'US'; })[0];
      ratings = tv ? [tv.rating] : [];
    }
    var ranks = ratings.map(function (c) { return CERT_RANK[String(c || '').trim().toUpperCase()]; })
      .filter(function (r) { return r !== undefined; });
    return ranks.length ? Math.max.apply(null, ranks) : null;
  }

  function remember(type, d) {
    var genres = d.genre_ids || (d.genres || []).map(function (g) { return g.id; });
    known[type + ':' + d.id] = { rank: rankOf(type, d), adult: !!d.adult, genres: genres };
    return known[type + ':' + d.id];
  }

  function safeEntry(type, e) {
    return !!e && !e.adult && !blockedGenre(type, e.genres) && e.rank !== null && e.rank <= maxRank();
  }

  function limited(fn) {
    return new Promise(function (resolve, reject) {
      queue.push({ fn: fn, resolve: resolve, reject: reject });
      pump();
    });
  }

  function pump() {
    while (running < LIMIT && queue.length) {
      var job = queue.shift();
      running++;
      job.fn().then(job.resolve, job.reject).then(function () { running--; pump(); });
    }
  }

  // Resolves true when the title may be shown to this profile. Always true when no kids profile is active.
  function check(item) {
    if (!active()) return Promise.resolve(true);
    if (!item || !item.id || item.adult) return Promise.resolve(false);
    var type = typeOf(item);
    if (blockedGenre(type, item.genre_ids)) return Promise.resolve(false);
    var hit = known[type + ':' + item.id];
    if (hit) return Promise.resolve(safeEntry(type, hit));
    return limited(function () { return MF.tmdb.safety(type, item.id); }).then(function (d) {
      return safeEntry(type, remember(type, d));
    }, function () { return false; });
  }

  // Keeps the kid-safe titles of a list, in order. trusted = TMDB already filtered the list by certification.
  function filterItems(items, opts) {
    items = items || [];
    if (!active()) return Promise.resolve(items);
    var pre = items.filter(function (i) {
      return i && !i.adult && !blockedGenre(typeOf(i), i.genre_ids || (i.genres || []).map(function (g) { return g.id; }));
    });
    if (opts && opts.trusted) return Promise.resolve(pre);
    return Promise.all(pre.map(check)).then(function (ok) {
      return pre.filter(function (i, n) { return ok[n]; });
    });
  }

  function filterResults(data, opts) {
    if (!active()) return Promise.resolve(data);
    // A copy: the response may be cached and shared with other profiles.
    return filterItems(data.results, opts).then(function (list) {
      return Object.assign({}, data, { results: list });
    });
  }

  // Details responses carry the certification already, so opening a title needs no extra request.
  function verify(type, d) {
    if (!active()) return d;
    if (!safeEntry(type, remember(type, d))) {
      var err = new Error(MESSAGE);
      err.blocked = true;
      throw err;
    }
    return d;
  }

  // Extra TMDB parameters for a kids profile: no adult titles, and for movies only up to the maximum certification.
  function params(type, p) {
    if (!active()) return p;
    var out = Object.assign({}, p, { include_adult: false });
    out.without_genres = BLOCKED_GENRES[type].join(',');
    if (type === 'movie') {
      out.certification_country = 'US';
      out['certification.lte'] = maxRating();
    }
    return out;
  }

  MF.kids = {
    MESSAGE: MESSAGE,
    ratings: ['G', 'PG', 'PG-13'],
    active: active,
    maxRating: maxRating,
    check: check,
    filterItems: filterItems,
    filterResults: filterResults,
    verify: verify,
    params: params,
    isKidSafe: check,
    restricted: function (route) { return RESTRICTED.indexOf(route) >= 0; },
    // Leaving a kids profile (picker, profile page, settings) is allowed once, after the PIN if it has one.
    isUnlocked: function () { return unlocked; },
    unlock: function () { unlocked = true; },
    relock: function () { unlocked = false; }
  };
})();
