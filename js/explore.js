(function () {
  'use strict';

  // Browse screen: TMDB discover with type, sort, genre, year, actor and rating filters.
  var MF = window.MF;

  function $(id) { return document.getElementById(id); }
  function el(tag, cls, text) { return MF.ui.el(tag, cls, text); }

  var TYPES = [{ v: 'movie', l: 'Movies' }, { v: 'tv', l: 'TV Shows' }];
  var SORTS = [
    { v: 'popular', l: 'Most popular' },
    { v: 'top', l: 'Top rated' },
    { v: 'new', l: 'Newest' },
    { v: 'votes', l: 'Most voted' }
  ];
  var RATINGS = [{ v: '', l: 'Any rating' }, { v: '8', l: '8+' }, { v: '7', l: '7+' }, { v: '6', l: '6+' }, { v: '5', l: '5+' }];
  var YEARS = (function () {
    var out = [{ v: '', l: 'Any year' }];
    for (var y = new Date().getFullYear(); y >= 2000; y--) out.push({ v: String(y), l: String(y) });
    [1990, 1980, 1970, 1960, 1950].forEach(function (d) { out.push({ v: d + 's', l: d + 's' }); });
    out.push({ v: 'old', l: 'Before 1950' });
    return out;
  })();

  function defaults() {
    return { type: 'movie', sort: 'popular', genre: null, year: '', person: null, rating: '' };
  }

  var filters = defaults();
  var loaded = false;
  var initialized = false;
  var genreCache = {};
  var personCache = {};
  var results = { token: 0 };
  var picker = { open: false, onPick: null, returnFocus: null, timer: null };

  function labelOf(list, v) {
    var m = list.filter(function (o) { return o.v === v; })[0];
    return m ? m.l : '';
  }

  function today() { return new Date().toISOString().slice(0, 10); }

  function yearRange(v) {
    if (!v) return null;
    if (v === 'old') return ['1800-01-01', '1949-12-31'];
    if (/s$/.test(v)) { var d = parseInt(v, 10); return [d + '-01-01', (d + 9) + '-12-31']; }
    return [v + '-01-01', v + '-12-31'];
  }

  // --------- Data ---------

  function discoverParams(page) {
    var f = filters;
    var movie = f.type === 'movie';
    var dateKey = movie ? 'primary_release_date' : 'first_air_date';
    var p = { page: page };
    p.sort_by = { popular: 'popularity.desc', top: 'vote_average.desc', 'new': dateKey + '.desc', votes: 'vote_count.desc' }[f.sort];
    // "Top rated" needs a vote floor, otherwise new or niche titles with few votes win. All-time lists
    // use a high floor (close to IMDb's Top 250); narrower filters use a lower one so they aren't empty.
    var narrow = f.person || f.year || f.genre;
    var topFloor = f.person ? 50 : (movie ? (narrow ? 800 : 5000) : (narrow ? 200 : 1000));
    p['vote_count.gte'] = f.sort === 'top' ? topFloor : (f.person ? 0 : (f.sort === 'new' ? 10 : 50));
    if (f.genre) p.with_genres = f.genre.id;
    if (f.rating) p['vote_average.gte'] = f.rating;
    var r = yearRange(f.year);
    if (r) { p[dateKey + '.gte'] = r[0]; p[dateKey + '.lte'] = r[1]; }
    if (f.sort === 'new' && (!r || r[1] > today())) p[dateKey + '.lte'] = today();
    if (f.person && movie) p.with_cast = f.person.id;
    return p;
  }

  // TMDB can't filter TV discover by cast, so TV + actor uses the person's credits, filtered here.
  function filterCredits(list) {
    var f = filters;
    var r = yearRange(f.year);
    var seen = {};
    list = list.filter(function (i) {
      if (seen[i.id] || !i.poster_path) return false;
      seen[i.id] = true;
      var d = i.first_air_date || i.release_date || '';
      if (f.genre && (i.genre_ids || []).indexOf(f.genre.id) < 0) return false;
      if (f.rating && (i.vote_average || 0) < Number(f.rating)) return false;
      if (r && (!d || d < r[0] || d > r[1])) return false;
      if (f.sort === 'top' && (i.vote_count || 0) < 20) return false;
      return true;
    });
    var key = { popular: 'popularity', top: 'vote_average', votes: 'vote_count' }[f.sort];
    // Weight by episodes the actor is in, so starring roles rank above one-off guest appearances.
    function weight(i) { return Math.log(2 + (i.episode_count || 1)); }
    list.sort(function (a, b) {
      if (f.sort === 'new') return String(b.first_air_date || '').localeCompare(String(a.first_air_date || ''));
      if (f.sort === 'popular') return (b.popularity || 0) * weight(b) * weight(b) - (a.popularity || 0) * weight(a) * weight(a);
      return (b[key] || 0) - (a[key] || 0);
    });
    list.forEach(function (i) { i.media_type = 'tv'; });
    return list;
  }

  function fetchPage(page) {
    if (filters.person && filters.type === 'tv') {
      var id = filters.person.id;
      var credits = personCache[id] || (personCache[id] = MF.tmdb.personCredits(id, 'tv'));
      credits.catch(function () { delete personCache[id]; });
      return credits.then(function (d) {
        var all = filterCredits(d.cast || []);
        return { results: all.slice((page - 1) * 20, page * 20), total_pages: Math.max(1, Math.ceil(all.length / 20)) };
      });
    }
    return MF.tmdb.discover(filters.type, discoverParams(page));
  }

  function genres(type) {
    if (!genreCache[type]) {
      genreCache[type] = MF.tmdb.genres(type);
      genreCache[type].catch(function () { delete genreCache[type]; });
    }
    return genreCache[type];
  }

  // --------- Filter bar ---------

  function anyFilter() {
    var f = filters;
    return f.sort !== 'popular' || f.genre || f.year || f.person || f.rating;
  }

  function renderBar() {
    var bar = $('explore-bar');
    var f = filters;
    bar.innerHTML = '';

    // Chips that open a picker get a drawn caret; text-only arrows break on TV fonts.
    function chip(key, text, active, onClick, menu) {
      var b = el('button', 'chip focusable' + (active ? ' active' : ''), text);
      if (menu) b.appendChild(MF.iconEl('caret', 'ico-caret'));
      b.setAttribute('data-filter', key);
      b.addEventListener('click', onClick);
      bar.appendChild(b);
    }

    TYPES.forEach(function (t) {
      chip('type-' + t.v, t.l, f.type === t.v, function () {
        if (f.type === t.v) return;
        f.type = t.v;
        f.genre = null;
        apply('type-' + t.v);
      });
    });
    bar.appendChild(el('span', 'bar-sep'));

    chip('sort', labelOf(SORTS, f.sort), f.sort !== 'popular', function () {
      openPicker('Sort by', SORTS.map(function (o) { return { v: o.v, l: o.l, active: o.v === f.sort }; }), function (o) {
        f.sort = o.v;
        apply('sort');
      });
    }, true);

    chip('genre', (f.genre ? f.genre.name : 'All genres'), !!f.genre, function () {
      genres(f.type).then(function (list) {
        var opts = [{ v: '', l: 'All genres', active: !f.genre }].concat(list.map(function (g) {
          return { v: g.id, l: g.name, active: !!f.genre && f.genre.id === g.id, data: g };
        }));
        openPicker('Genre', opts, function (o) {
          f.genre = o.data || null;
          apply('genre');
        });
      }, function (err) { MF.ui.toast(err.message); });
    }, true);

    chip('year', (f.year ? labelOf(YEARS, f.year) : 'Any year'), !!f.year, function () {
      openPicker('Year', YEARS.map(function (o) { return { v: o.v, l: o.l, active: o.v === f.year }; }), function (o) {
        f.year = o.v;
        apply('year');
      });
    }, true);

    chip('person', f.person ? f.person.name : 'Any actor', !!f.person, openActorPicker, true);

    chip('rating', (f.rating ? 'Rating ' + labelOf(RATINGS, f.rating) : 'Any rating'), !!f.rating, function () {
      openPicker('Minimum rating', RATINGS.map(function (o) { return { v: o.v, l: o.l, active: o.v === f.rating }; }), function (o) {
        f.rating = o.v;
        apply('rating');
      });
    }, true);

    var hiding = MF.settings.hideWatched !== false;
    chip('watched', hiding ? 'Hiding watched' : 'Showing watched', hiding, function () {
      MF.store.saveSettings({ hideWatched: !hiding });
      apply('watched');
    });
    var wchip = $('explore-bar').querySelector('[data-filter="watched"]');
    wchip.insertBefore(MF.iconEl(hiding ? 'check' : 'eye', 'ico-lead'), wchip.firstChild);

    if (anyFilter()) {
      chip('clear', 'Clear', false, function () {
        var type = f.type;
        filters = defaults();
        filters.type = type;
        apply('type-' + type);
      });
      var clear = $('explore-bar').querySelector('[data-filter="clear"]');
      clear.insertBefore(MF.iconEl('close', 'ico-lead'), clear.firstChild);
    }
  }

  function summary() {
    var f = filters;
    var parts = [labelOf(SORTS, f.sort) + ' ' + (f.type === 'movie' ? 'movies' : 'TV shows')];
    if (f.genre) parts.push(f.genre.name);
    if (f.year) parts.push(labelOf(YEARS, f.year));
    if (f.person) parts.push('with ' + f.person.name);
    if (f.rating) parts.push('rated ' + labelOf(RATINGS, f.rating));
    if (MF.settings.hideWatched !== false) parts.push('watched hidden');
    return parts.join('  \u00B7  ');
  }

  function apply(focusKey) {
    renderBar();
    reload();
    var chipEl = $('explore-bar').querySelector('[data-filter="' + focusKey + '"]') || $('explore-bar').querySelector('.chip');
    MF.nav.focus(chipEl);
  }

  // --------- Results ---------

  function reload() {
    var box = $('explore-results');
    results = { token: results.token + 1, page: 0, totalPages: 1, loading: false, seen: {} };
    box.innerHTML = '';
    box.scrollTop = 0;
    $('explore-summary').textContent = summary();
    var section = el('section', 'row row-grid');
    results.grid = el('div', 'strip');
    section.appendChild(results.grid);
    box.appendChild(section);
    loaded = true;
    loadMore();
  }

  function loadMore() {
    if (results.loading || results.page >= results.totalPages || results.page >= 25) return;
    results.loading = true;
    var token = results.token;
    var page = results.page + 1;
    fetchPage(page).then(function (d) {
      if (token !== results.token) return;
      results.loading = false;
      results.page = page;
      results.totalPages = Math.min(d.total_pages || 1, 500);
      var hide = MF.settings.hideWatched !== false;
      var raw = d.results || [];
      var items = raw.filter(function (i) {
        var k = i.media_type + ':' + i.id;
        if (results.seen[k]) return false;
        results.seen[k] = true;
        return !(hide && MF.store.isWatched(i.media_type, i.id));
      });
      items.forEach(function (i) {
        results.grid.appendChild(MF.ui.posterCard(i, MF.app.openItem));
      });
      // Pages emptied by the "hide watched" filter: keep fetching until there is something to show.
      if (!results.grid.children.length && raw.length && page < results.totalPages && page < 10) { loadMore(); return; }
      if (!results.grid.children.length) {
        MF.ui.message($('explore-results'), 'Nothing matches these filters', 'Try removing a filter.');
      }
      // Fill at least three screen rows before waiting for scroll/focus.
      if (raw.length && results.grid.children.length < 21) loadMore();
    }, function (err) {
      if (token !== results.token) return;
      results.loading = false;
      MF.ui.toast(err.message, 4000);
    });
  }

  function nearEnd() {
    var box = $('explore-results');
    if (box.scrollTop + box.clientHeight > box.scrollHeight - 700) loadMore();
  }

  // --------- Picker overlay ---------

  function fillPicker(options) {
    var list = $('picker-list');
    list.innerHTML = '';
    list.scrollTop = 0;
    options.forEach(function (o) {
      var b = el('button', 'picker-item focusable' + (o.active ? ' active' : ''));
      if (o.image !== undefined) {
        var img = MF.ui.lazyImg(o.image, 'picker-img');
        b.appendChild(img);
      }
      var text = el('span', 'picker-text');
      text.appendChild(el('span', 'picker-label', o.l));
      if (o.sub) text.appendChild(el('span', 'picker-sub', o.sub));
      b.appendChild(text);
      b.addEventListener('click', function () {
        var cb = picker.onPick;
        closePicker(true);
        cb(o);
      });
      list.appendChild(b);
    });
  }

  function openPicker(title, options, onPick, opts) {
    picker.open = true;
    picker.onPick = onPick;
    picker.returnFocus = MF.nav.current();
    $('picker-title').textContent = title;
    var input = $('picker-input');
    var search = !!(opts && opts.search);
    input.classList.toggle('hidden', !search);
    input.value = '';
    fillPicker(options);
    $('picker').classList.remove('hidden');
    document.body.classList.add('picker-open');
    var first = $('picker-list').querySelector('.picker-item.active') || $('picker-list').querySelector('.picker-item');
    if (search) MF.nav.focus(input, { edit: true });
    else MF.nav.focus(first);
  }

  function closePicker(silent) {
    if (!picker.open) return;
    picker.open = false;
    clearTimeout(picker.timer);
    $('picker').classList.add('hidden');
    document.body.classList.remove('picker-open');
    if (document.activeElement && document.activeElement.id === 'picker-input') document.activeElement.blur();
    if (!silent && picker.returnFocus) MF.nav.focus(picker.returnFocus);
  }

  function personOption(p) {
    var known = (p.known_for || []).map(function (k) { return k.title || k.name; }).filter(Boolean).slice(0, 2).join(', ');
    return { v: p.id, l: p.name, sub: known || p.known_for_department || '', image: MF.tmdb.img(p.profile_path, 'w185'), data: { id: p.id, name: p.name } };
  }

  function pickPerson(o) {
    filters.person = o.data || null;
    apply('person');
  }

  function openActorPicker() {
    var opts = [{ v: '', l: 'Any actor', active: !filters.person }];
    openPicker('Actor', opts, pickPerson, { search: true });
    MF.tmdb.popularPeople().then(function (d) {
      if (!picker.open || $('picker-input').value.trim()) return;
      fillPicker(opts.concat((d.results || []).filter(function (p) { return p.known_for_department === 'Acting'; }).map(personOption)));
    });
  }

  function searchPeople(focusResults) {
    var q = $('picker-input').value.trim();
    if (!q) return;
    MF.tmdb.searchPerson(q).then(function (d) {
      if (!picker.open || $('picker-input').value.trim() !== q) return;
      var people = (d.results || []).filter(function (p) { return p.profile_path || p.known_for_department === 'Acting'; });
      fillPicker(people.length ? people.map(personOption) : [{ v: '', l: 'No people found for "' + q + '"' }]);
      if (focusResults) MF.nav.focus($('picker-list').querySelector('.picker-item'));
    }, function (err) { MF.ui.toast(err.message); });
  }

  // --------- Screen ---------

  function init() {
    if (initialized) return;
    initialized = true;
    $('explore-results').addEventListener('scroll', nearEnd);
    $('picker-input').addEventListener('input', function () {
      clearTimeout(picker.timer);
      picker.timer = setTimeout(function () { searchPeople(false); }, 400);
    });
    $('picker').addEventListener('click', function (e) {
      if (e.target === $('picker')) closePicker(false);
    });
  }

  MF.explore = {
    // params (optional): { type, person: {id, name}, sort, ... } to start with specific filters.
    enter: function (params, restoreFocus) {
      init();
      if (!restoreFocus && params && Object.keys(params).length) {
        filters = Object.assign(defaults(), params);
        loaded = false;
      }
      if (!loaded) {
        renderBar();
        reload();
      }
      if (!restoreFocus) MF.nav.focus($('explore-bar').querySelector('.chip.active') || $('explore-bar').querySelector('.chip'));
    },

    leave: function () { closePicker(true); },

    pickerOpen: function () { return picker.open; },
    closePicker: function () { closePicker(false); },

    onInputEnter: function () {
      clearTimeout(picker.timer);
      $('picker-input').blur();
      searchPeople(true);
    },

    onFocus: function (node) {
      if (!results.grid || !results.grid.contains(node)) return;
      var cards = results.grid.children;
      if (Array.prototype.indexOf.call(cards, node) >= cards.length - 14) loadMore();
    }
  };
})();
