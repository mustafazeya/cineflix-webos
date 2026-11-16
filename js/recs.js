(function () {
  'use strict';

  // "Because you watched <Title>" rows for Home. The sources are the profile's most recent signals: titles rated up first, then
  // watched titles and shows with finished episodes, newest first. Each row is TMDB's recommendations for that title (similar
  // titles when there are few), without anything already watched or rated down. A kids profile only gets kid-safe titles,
  // because MF.tmdb.related goes through the kids filter.

  var MF = window.MF;

  var MAX_ROWS = 2;
  var MAX_SOURCES = 6;
  var MIN_ITEMS = 4;
  var ROW_LIMIT = 20;

  var related = {};     // per session: "kids?:type:id" -> promise of the raw list
  var titles = {};      // "type:id" -> promise of a display title

  function key(type, id) { return type + ':' + id; }

  function sources() {
    var out = [];
    var seen = {};
    function add(type, id, title) {
      var k = key(type, id);
      if (seen[k] || MF.store.getRating(type, id) === -1) return;
      seen[k] = true;
      out.push({ type: type, id: id, title: title || '' });
    }
    MF.store.ratingsList().filter(function (r) { return r.rating === 1; }).forEach(function (r) { add(r.media_type, r.id, r.title); });
    var recent = MF.store.watchedList().map(function (w) { return { type: w.media_type, id: w.id, title: w.title, at: w.watchedAt || 0 }; })
      .concat(MF.store.finishedShows().map(function (s) { return { type: 'tv', id: s.id, title: s.title, at: s.at }; }));
    recent.sort(function (a, b) { return b.at - a.at; }).forEach(function (r) { add(r.type, r.id, r.title); });
    return out;
  }

  function relatedTo(type, id) {
    var k = (MF.kids.active() ? 'k' + MF.kids.maxRating() : 'a') + ':' + key(type, id);
    if (!related[k]) {
      related[k] = MF.tmdb.related(type, id);
      related[k].catch(function () { delete related[k]; });
    }
    return related[k];
  }

  function titleOf(src) {
    if (src.title) return Promise.resolve(src.title);
    var k = key(src.type, src.id);
    if (!titles[k]) {
      titles[k] = MF.tmdb.details(src.type, src.id).then(function (d) { return MF.ui.title(d); });
      titles[k].catch(function () { delete titles[k]; });
    }
    return titles[k];
  }

  // Resolves to [{ label, items, source }], at most two rows.
  function rows() {
    var cands = sources().slice(0, MAX_SOURCES);
    var finished = {};
    MF.store.finishedShows().forEach(function (s) { finished[key('tv', s.id)] = true; });
    var used = {};
    var out = [];

    function skip(i, src) {
      var k = key(i.media_type, i.id);
      return !i.poster_path || used[k] || finished[k] || MF.store.isWatched(i.media_type, i.id) ||
        MF.store.getRating(i.media_type, i.id) === -1 || (i.media_type === src.type && i.id === src.id);
    }

    function next(n) {
      if (out.length >= MAX_ROWS || n >= cands.length) return Promise.resolve(out);
      var src = cands[n];
      return relatedTo(src.type, src.id).then(function (list) {
        var items = list.filter(function (i) { return !skip(i, src); }).slice(0, ROW_LIMIT);
        if (items.length < MIN_ITEMS) return null;
        return titleOf(src).then(function (title) {
          items.forEach(function (i) { used[key(i.media_type, i.id)] = true; });
          out.push({ label: 'Because you watched ' + title, items: items, source: src });
        });
      }).then(function () { return next(n + 1); }, function () { return next(n + 1); });
    }
    return next(0);
  }

  MF.recs = { rows: rows };
})();
