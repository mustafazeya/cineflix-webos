(function () {
  'use strict';

  var MF = window.MF;
  var ui = MF.ui;
  var el = ui.el;

  function $(id) { return document.getElementById(id); }

  // ------------------------- Row definitions -------------------------

  var MOVIE_GENRES = [[28, 'Action'], [35, 'Comedy'], [18, 'Drama'], [53, 'Thrillers'], [878, 'Sci-Fi'], [27, 'Horror'],
    [16, 'Animation'], [10751, 'Family'], [10749, 'Romance'], [99, 'Documentaries']];
  var TV_GENRES = [[18, 'Drama Series'], [35, 'Comedy Series'], [80, 'Crime Series'], [10765, 'Sci-Fi & Fantasy Series'],
    [16, 'Animated Series'], [99, 'Docuseries'], [10764, 'Reality TV']];

  // Genre rows alternate between poster and wide cards for visual rhythm.
  function genreRows(type, genres) {
    return genres.map(function (g, i) {
      return { label: g[1], style: i % 2 ? 'land' : 'poster', load: function () { return MF.tmdb.discover(type, { with_genres: g[0] }); } };
    });
  }

  // style: 'top10' (ranked posters), 'land' (16:9 backdrops) or 'poster' (default)
  var ROUTE_ROWS = {
    home: function () {
      return [
        { label: 'Continue Watching', kind: 'continue' },
        { label: 'Recently Added to Your Library', kind: 'server' },
        { label: 'Top 10 Today', style: 'top10', load: function () { return MF.tmdb.trending('all', 'day'); }, hero: true },
        { label: 'New Releases', style: 'land', load: function () { return MF.tmdb.list('movie', 'now_playing'); } },
        { label: 'Popular Movies', load: function () { return MF.tmdb.list('movie', 'popular'); } },
        { label: 'Popular TV Shows', style: 'land', load: function () { return MF.tmdb.list('tv', 'popular'); } },
        { label: 'New Episodes This Week', load: function () { return MF.tmdb.list('tv', 'on_the_air'); } },
        { label: 'Top Rated Movies', style: 'land', load: function () { return MF.tmdb.list('movie', 'top_rated'); } },
        { label: 'Top Rated TV Shows', load: function () { return MF.tmdb.list('tv', 'top_rated'); } },
        { label: 'Coming Soon', style: 'land', load: function () { return MF.tmdb.list('movie', 'upcoming'); } }
      ].concat(genreRows('movie', MOVIE_GENRES.slice(0, 5)));
    },
    movies: function () {
      return [
        { label: 'Movies on Your Server', kind: 'server', type: 'movie' },
        { label: 'Top 10 Movies Today', style: 'top10', load: function () { return MF.tmdb.trending('movie', 'day'); }, hero: true },
        { label: 'In Theaters Now', style: 'land', load: function () { return MF.tmdb.list('movie', 'now_playing'); } },
        { label: 'Popular', load: function () { return MF.tmdb.list('movie', 'popular'); } },
        { label: 'Top Rated', style: 'land', load: function () { return MF.tmdb.list('movie', 'top_rated'); } },
        { label: 'Coming Soon', load: function () { return MF.tmdb.list('movie', 'upcoming'); } }
      ].concat(genreRows('movie', MOVIE_GENRES));
    },
    tv: function () {
      return [
        { label: 'Shows on Your Server', kind: 'server', type: 'tv' },
        { label: 'Top 10 Shows Today', style: 'top10', load: function () { return MF.tmdb.trending('tv', 'day'); }, hero: true },
        { label: 'Airing Today', style: 'land', load: function () { return MF.tmdb.list('tv', 'airing_today'); } },
        { label: 'New Episodes This Week', load: function () { return MF.tmdb.list('tv', 'on_the_air'); } },
        { label: 'Popular', style: 'land', load: function () { return MF.tmdb.list('tv', 'popular'); } },
        { label: 'Top Rated', load: function () { return MF.tmdb.list('tv', 'top_rated'); } }
      ].concat(genreRows('tv', TV_GENRES));
    }
  };

  // ------------------------- Router -------------------------

  var TABS = ['home', 'movies', 'tv', 'explore', 'mylist', 'watched', 'videos', 'search', 'settings', 'account'];
  var SCREEN_FOR = {
    explore: 'explore',
    home: 'browse', movies: 'browse', tv: 'browse', mylist: 'browse', watched: 'browse',
    search: 'search', settings: 'settings', details: 'details', player: 'player', trailer: 'trailer',
    account: 'account', profiles: 'profiles', signin: 'signin', 'profile-edit': 'profile-edit', avatars: 'avatars',
    videos: 'videos', 'video-edit': 'video-edit', 'mega-browse': 'mega'
  };
  var NO_NAV = { details: 1, player: 1, trailer: 1, profiles: 1, signin: 1, 'profile-edit': 1, avatars: 1, 'video-edit': 1, 'mega-browse': 1 };

  var stack = [];
  var stale = {};
  var lastBackAt = 0;

  function top() { return stack[stack.length - 1]; }

  function show(entry, restoreFocus) {
    var screenName = SCREEN_FOR[entry.route];
    Array.prototype.forEach.call(document.querySelectorAll('.screen'), function (s) {
      s.classList.toggle('active', s.id === 'screen-' + screenName);
    });
    document.body.classList.toggle('no-nav', !!NO_NAV[entry.route]);
    document.body.classList.toggle('scrolled', screenName === 'browse' && $('rows').scrollTop > 200);
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.classList.toggle('active', t.getAttribute('data-route') === entry.route);
    });
    MF.nav.handler = entry.route === 'player' ? MF.player.onKey : null;
    screens[screenName].enter(entry, restoreFocus);
    if (window.focus) window.focus();
  }

  function leave(entry) {
    if (!entry) return;
    entry.focus = MF.nav.current();
    var screen = screens[SCREEN_FOR[entry.route]];
    if (screen.leave) screen.leave(entry);
  }

  function go(route, params, opts) {
    var entry = { route: route, params: params || {} };
    leave(top());
    if (TABS.indexOf(route) >= 0 && !(opts && opts.push)) stack = [];
    else if (opts && opts.replace) stack.pop();
    stack.push(entry);
    show(entry, false);
  }

  function back() {
    if (MF.subs && MF.subs.handleBack()) return;
    if (MF.account && MF.account.handleBack()) return;
    if (MF.player && MF.player.confirmBack && top() && top().route === 'player' && MF.player.confirmBack()) return;
    if (MF.explore.pickerOpen()) { MF.explore.closePicker(); return; }
    if (stack.length > 1) {
      leave(stack.pop());
      show(top(), true);
      return;
    }
    if (top() && top().route !== 'home') { go('home'); return; }
    if (Date.now() - lastBackAt < 2500) { exitApp(); return; }
    lastBackAt = Date.now();
    ui.toast('Press Back again to exit');
  }

  // webOS turns the Back key into history.back(). A sentinel history entry catches it, so Back works
  // even when an embedded player page has focus (the app then gets no keydown). When the app does get
  // the keydown, it already handled Back, and the matching popstate is ignored.
  var lastBackKeyAt = 0;
  var exiting = false;
  function armHistory() {
    if (!history.state || !history.state.cineflix) history.pushState({ cineflix: true }, '');
  }
  window.addEventListener('popstate', function () {
    if (exiting) return;
    var handledByKey = Date.now() - lastBackKeyAt < 700;
    history.pushState({ cineflix: true }, '');
    if (!handledByKey) back();
  });

  function exitApp() {
    exiting = true;
    if (window.webOS && window.webOS.platformBack) window.webOS.platformBack();
    else window.close();
  }

  function restore(entry, fallbackSelector) {
    if (entry.focus && document.body.contains(entry.focus)) MF.nav.focus(entry.focus);
    else MF.nav.focusFirst(fallbackSelector);
  }

  // Opens the details page once its data, logo and backdrop are ready (max ~0.9 s),
  // so the page appears complete instead of flashing a loading state.
  var openToken = 0;
  function openItem(item) {
    var token = ++openToken;
    var done = false;
    var open = function () {
      if (done || token !== openToken) return;
      done = true;
      go('details', { type: item.media_type, id: item.id });
    };
    ui.prefetchTitle(item).then(open, open);
    setTimeout(open, 450);
  }

  // The hero's two buttons act on the title the hero is showing: More Info opens its page, Play does what its page's Play button does.
  function initHeroButtons() {
    $('hero-more').addEventListener('click', function () {
      var item = ui.heroItem();
      if (item) openItem(item);
    });
    $('hero-play').addEventListener('click', function () {
      var item = ui.heroItem();
      if (!item) return;
      MF.tmdb.details(item.media_type, item.id).then(function (d) {
        d.media_type = item.media_type;
        playButton(d).click();
      }, function (e) { ui.toast(e.message || 'Could not load this title', 4000); });
    });
  }

  // ------------------------- Browse screen -------------------------

  var browseViews = {};

  function loadRow(def) {
    if (def.kind === 'continue') {
      return Promise.resolve(MF.store.continueWatching());
    }
    if (def.kind === 'server') {
      return MF.server.catalog().then(function (items) {
        items = items.filter(function (i) { return !def.type || i.type === def.type; }).slice(0, 20);
        return Promise.all(items.map(function (i) {
          return MF.tmdb.details(i.type, i.tmdbId).catch(function () { return null; });
        }));
      }).then(function (list) {
        return { results: list.filter(Boolean) };
      });
    }
    return def.load();
  }

  function cardsFor(def, data) {
    if (def.kind === 'continue') {
      return data.map(function (p) {
        var item = { id: p.id, media_type: p.type, backdrop_path: p.backdrop_path, title: p.title, overview: '' };
        var sub = p.type === 'tv' && p.season
          ? (p.subtitle || 'S' + p.season + ' : E' + p.episode)
          : (p.duration && p.position ? 'Resume ' + ui.fmtTime(p.position) : 'Continue');
        return ui.wideCard({
          item: item,
          title: p.title,
          subtitle: sub,
          image: MF.tmdb.img(p.backdrop_path || p.still_path, 'w780'),
          progress: p.duration ? p.position / p.duration : 0,
          onSelect: function () { resumeEntry(p); }
        });
      });
    }
    var items = data.results || [];
    if (def.style === 'top10') return items.slice(0, 10).map(function (item, i) { return ui.top10Card(item, i + 1, openItem); });
    if (def.style === 'land') return items.filter(function (i) { return i.backdrop_path; }).map(function (item) { return ui.landscapeCard(item, openItem); });
    return items.map(function (item) { return ui.posterCard(item, openItem); });
  }

  function renderContinue(holder, def) {
    holder.innerHTML = '';
    var cards = cardsFor(def, MF.store.continueWatching());
    if (cards.length) holder.appendChild(ui.row(def.label, cards, 'row-wide'));
  }

  function renderBrowse(route) {
    var container = el('div', 'browse-view');
    container.setAttribute('data-route', route);
    var view = { container: container, heroSet: false, renderedAt: Date.now() };

    if (route === 'watched') {
      var seen = MF.store.watchedList();
      if (!seen.length) {
        ui.message(container, 'Nothing watched yet', 'Finished movies appear here automatically. You can also mark any title with "Watched" on its page.');
      } else {
        container.appendChild(ui.row('Already Watched', seen.map(function (i) { return ui.posterCard(i, openItem); }), 'row-grid'));
        ui.setHero(seen[0], 'WATCHED');
        view.heroSet = true;
      }
      return view;
    }

    if (route === 'mylist') {
      var list = MF.store.myList();
      if (!list.length) {
        ui.message(container, 'Your list is empty', 'Open any title and choose "+ My List" to save it here.');
      } else {
        container.appendChild(ui.row('My List', list.map(function (i) { return ui.posterCard(i, openItem); }), 'row-grid'));
        ui.setHero(list[0], 'MY LIST');
        view.heroSet = true;
      }
      return view;
    }

    if (!MF.settings.tmdbKey) {
      ui.message(container, 'Connect your catalog', 'Add a free TMDB API key in Settings to load movies and shows.', {
        label: 'Open Settings', onClick: function () { go('settings'); }
      });
      return view;
    }

    ROUTE_ROWS[route]().forEach(function (def) {
      if (def.kind === 'continue') {
        view.continueHolder = el('div', 'continue-holder');
        container.appendChild(view.continueHolder);
        renderContinue(view.continueHolder, def);
        return;
      }
      var slot = ui.skeletonRow(def.style);
      container.appendChild(slot);
      loadRow(def).then(function (data) {
        var cards = cardsFor(def, data);
        if (!cards.length) { slot.remove(); return; }
        var row = ui.row(def.label, cards, 'row-' + (def.style || 'poster'));
        slot.parentNode.replaceChild(row, slot);
        hideSplash();
        if (def.hero && !view.heroSet && data.results && data.results[0]) {
          view.heroSet = true;
          ui.setHero(data.results[0], def.style === 'top10' ? '#1 TODAY' : 'TRENDING');
        }
        // Until the user presses a key, keep focus on the first card of the top-most loaded row.
        var active = top();
        if (active && active.route === route && MF.nav.lastInputAt <= view.renderedAt) {
          MF.nav.focusFirst('#rows .browse-view[data-route="' + route + '"] .card');
        }
      }, function (err) {
        slot.remove();
        hideSplash();
        if (def.hero) ui.toast(err.message, 5000);
      });
    });
    return view;
  }

  var screens = {};

  screens['profile-edit'] = { enter: function (entry, restore) { MF.account.editScreen.enter(entry, restore); }, leave: function () { MF.account.editScreen.leave(); } };
  screens.avatars = { enter: function (entry, restore) { MF.account.avatarScreen.enter(entry, restore); }, leave: function () { MF.account.avatarScreen.leave(); } };
  screens.videos = { enter: function (entry, restore) { MF.videos.listScreen.enter(entry, restore); }, leave: function (entry) { MF.videos.listScreen.leave(entry); } };
  screens.mega = { enter: function (entry, restore) { MF.videos.megaScreen.enter(entry, restore); }, leave: function (entry) { MF.videos.megaScreen.leave(entry); } };
  screens['video-edit'] = { enter: function (entry, restore) { MF.videos.editScreen.enter(entry, restore); }, leave: function () { MF.videos.editScreen.leave(); } };
  screens.account = { enter: function (entry, restore) { MF.account.accountScreen.enter(entry, restore); }, leave: function () { MF.account.accountScreen.leave(); } };
  screens.profiles = { enter: function (entry, restore) { MF.account.profilesScreen.enter(entry, restore); }, leave: function () { MF.account.profilesScreen.leave(); } };
  screens.signin = { enter: function (entry, restore) { MF.account.signinScreen.enter(entry, restore); }, leave: function () { MF.account.signinScreen.leave(); } };

  screens.browse = {
    enter: function (entry, restoreFocus) {
      var route = entry.route;
      var rows = $('rows');
      var view = browseViews[route];
      if (!view || stale[route] || route === 'mylist' || route === 'watched') {
        if (view) view.container.remove();
        view = browseViews[route] = renderBrowse(route);
        rows.appendChild(view.container);
        stale[route] = false;
        restoreFocus = false;
      } else if (view.continueHolder && stale.continue) {
        renderContinue(view.continueHolder, ROUTE_ROWS.home()[0]);
      }
      if (route === 'home') stale.continue = false;
      Array.prototype.forEach.call(rows.children, function (c) {
        c.classList.toggle('hidden', c !== view.container);
      });
      if (restoreFocus) restore(entry);
      else {
        rows.scrollTop = 0;
        MF.nav.focusFirst('#rows .browse-view[data-route="' + route + '"] .focusable');
      }
      if (!view.heroSet) {
        var first = view.container.querySelector('.card');
        if (first && first._item) ui.setHero(first._item);
      }
      // Coming back from the player: the hero's Play may now need to say Resume (or the other way round).
      ui.refreshHeroPlay();
    }
  };

  var prefetchTimer = null;
  MF.nav.onFocus = function (node) {
    MF.explore.onFocus(node);
    clearTimeout(prefetchTimer);
    if (node._item) prefetchTimer = setTimeout(function () { ui.prefetchTitle(node._item); }, 250);
    var entry = top();
    if (!entry || SCREEN_FOR[entry.route] !== 'browse') return;
    if (node._item) ui.setHero(node._item);
  };

  // ------------------------- Details screen -------------------------

  function certification(d) {
    var region = MF.settings.region || 'US';
    var list = d.media_type === 'movie'
      ? ((d.release_dates && d.release_dates.results) || [])
      : ((d.content_ratings && d.content_ratings.results) || []);
    var match = list.filter(function (r) { return r.iso_3166_1 === region; })[0] || list.filter(function (r) { return r.iso_3166_1 === 'US'; })[0];
    if (!match) return '';
    if (d.media_type === 'tv') return match.rating || '';
    var rel = (match.release_dates || []).filter(function (r) { return r.certification; })[0];
    return rel ? rel.certification : '';
  }

  function trailerKey(d) {
    var vids = ((d.videos && d.videos.results) || []).filter(function (v) { return v.site === 'YouTube'; });
    var pick = vids.filter(function (v) { return v.type === 'Trailer' && v.official; })[0] ||
      vids.filter(function (v) { return v.type === 'Trailer'; })[0] || vids[0];
    return pick ? pick.key : null;
  }

  function seasonList(d) {
    return (d.seasons || []).filter(function (s) { return s.season_number > 0 && s.episode_count > 0; });
  }

  function aired(episodes) {
    var today = new Date().toISOString().slice(0, 10);
    return (episodes || []).filter(function (e) { return !e.air_date || e.air_date <= today; });
  }

  // Builds a "next episode" resolver for the player.
  function nextEpisodeFn(d, season, episode) {
    return function () {
      return MF.tmdb.season(d.id, season).then(function (s) {
        var eps = aired(s.episodes);
        var idx = -1;
        eps.forEach(function (e, n) { if (e.episode_number === episode) idx = n; });
        if (idx >= 0 && idx + 1 < eps.length) return episodePlayOpts(d, season, eps[idx + 1], 0);
        var seasons = seasonList(d);
        var nextSeason = seasons.filter(function (x) { return x.season_number > season; })[0];
        if (!nextSeason) return null;
        return MF.tmdb.season(d.id, nextSeason.season_number).then(function (ns) {
          var first = aired(ns.episodes)[0];
          return first ? episodePlayOpts(d, nextSeason.season_number, first, 0) : null;
        });
      });
    };
  }

  function episodePlayOpts(d, season, ep, resume) {
    var opts = {
      type: 'tv',
      id: d.id,
      title: ui.title(d),
      subtitle: 'S' + season + ' : E' + ep.episode_number + '  ' + (ep.name || ''),
      season: season,
      episode: ep.episode_number,
      backdrop_path: d.backdrop_path,
      poster_path: d.poster_path,
      still_path: ep.still_path,
      resume: resume || 0
    };
    opts.next = nextEpisodeFn(d, season, ep.episode_number);
    return opts;
  }

  function moviePlayOpts(d, resume) {
    return {
      type: 'movie',
      id: d.id,
      title: ui.title(d),
      subtitle: [ui.year(d), ui.fmtRuntime(d.runtime)].filter(Boolean).join('  \u00B7  '),
      backdrop_path: d.backdrop_path,
      poster_path: d.poster_path,
      resume: resume || 0
    };
  }

  function resumeEntry(p) {
    MF.tmdb.details(p.type, p.id).then(function (d) {
      if (p.type === 'movie') { go('player', moviePlayOpts(d, p.position)); return; }
      return MF.tmdb.season(d.id, p.season).then(function (s) {
        var eps = s.episodes || [];
        var ep = eps.filter(function (e) { return e.episode_number === p.episode; })[0];
        if (!ep) { openItem({ media_type: 'tv', id: p.id }); return; }
        if (p.finished) {
          return nextEpisodeFn(d, p.season, p.episode)().then(function (next) {
            if (next) go('player', next); else openItem({ media_type: 'tv', id: p.id });
          });
        }
        go('player', episodePlayOpts(d, p.season, ep, p.position));
      });
    }).catch(function (err) { ui.toast(err.message); });
  }

  function playButton(d) {
    var btn = el('button', 'btn btn-primary btn-play focusable');
    var avail = MF.server.has(d.media_type, d.id);
    var progress = MF.store.getProgress(d.media_type, d.id);

    if (!MF.server.enabled()) {
      btn.textContent = 'Set up media server';
      btn.addEventListener('click', function () { go('settings'); });
      return btn;
    }
    if (avail === false) {
      btn.textContent = 'Not in your library';
      btn.classList.remove('btn-primary');
      btn.classList.add('btn-disabled');
      btn.addEventListener('click', function () { ui.toast('Add this title to your media server to play it.'); });
      return btn;
    }

    if (d.media_type === 'movie') {
      var resume = progress && !progress.finished ? progress.position : 0;
      btn.innerHTML = MF.icon('play') + '&nbsp; ' + (resume > 30 ? 'Resume ' + ui.fmtTime(resume) : 'Play');
      btn.addEventListener('click', function () { go('player', moviePlayOpts(d, resume > 30 ? resume : 0)); });
    } else {
      var label = progress && progress.season ? 'Resume S' + progress.season + ' : E' + progress.episode : 'Play S1 : E1';
      if (!progress) {
        var first = seasonList(d)[0];
        label = first ? 'Play S' + first.season_number + ' : E1' : 'Play';
      }
      btn.innerHTML = MF.icon('play') + '&nbsp; ' + label;
      btn.addEventListener('click', function () {
        if (progress && progress.season) { resumeEntry(progress); return; }
        var s = seasonList(d)[0];
        if (!s) { ui.toast('No episodes found'); return; }
        MF.tmdb.season(d.id, s.season_number).then(function (season) {
          var ep = (season.episodes || [])[0];
          if (ep) go('player', episodePlayOpts(d, s.season_number, ep, 0));
        });
      });
    }
    return btn;
  }

  function renderEpisodes(d, wrap, seasonNumber) {
    wrap.innerHTML = '';
    var loading = el('div', 'muted', 'Loading episodes...');
    wrap.appendChild(loading);
    MF.tmdb.season(d.id, seasonNumber).then(function (s) {
      wrap.innerHTML = '';
      var progress = MF.store.getProgress('tv', d.id);
      var cards = (s.episodes || []).map(function (ep) {
        var isCurrent = progress && progress.season === seasonNumber && progress.episode === ep.episode_number;
        var resume = isCurrent && !progress.finished ? progress.position : 0;
        var card = ui.wideCard({
          title: ep.episode_number + '. ' + (ep.name || 'Episode ' + ep.episode_number),
          subtitle: [ep.runtime ? ep.runtime + 'm' : '', ep.air_date || ''].filter(Boolean).join('  \u00B7  '),
          image: MF.tmdb.img(ep.still_path || d.backdrop_path, 'w780'),
          progress: isCurrent && progress.duration ? progress.position / progress.duration : 0,
          onSelect: function () {
            if (!MF.server.enabled()) { go('settings'); return; }
            if (MF.server.has('tv', d.id) === false) { ui.toast('Add this show to your media server to play it.'); return; }
            go('player', episodePlayOpts(d, seasonNumber, ep, resume));
          }
        });
        card._episode = ep;
        if (MF.store.episodeWatched(d.id, seasonNumber, ep.episode_number)) {
          var w = el('div', 'watched-mark');
          w.appendChild(MF.iconEl('check'));
          card.appendChild(w);
          card.classList.add('is-watched');
        }
        return card;
      });
      wrap.appendChild(ui.row('Season ' + seasonNumber, cards, 'row-wide row-episodes'));
    }, function (err) {
      loading.textContent = err.message;
    });
  }

  screens.details = {
    enter: function (entry, restoreFocus) {
      var root = $('details');
      var p = entry.params;
      if (restoreFocus && root._key === p.type + ':' + p.id) {
        // Refresh play button labels (progress may have changed) but keep layout.
        var old = root.querySelector('.btn-play');
        if (old && root._data) old.parentNode.replaceChild(playButton(root._data), old);
        var epWrap = root.querySelector('.episodes');
        if (epWrap && root._season) renderEpisodes(root._data, epWrap, root._season);
        restore(entry, '#details .btn-play');
        return;
      }
      root._key = p.type + ':' + p.id;
      root.innerHTML = '';
      root.scrollTop = 0;
      root.classList.remove('reveal');
      $('details-bg').classList.remove('show');
      // Only show a loading hint if data is genuinely slow.
      var slow = setTimeout(function () {
        if (root._key === p.type + ':' + p.id && !root._ready) root.appendChild(el('div', 'details-wait'));
      }, 700);
      root._ready = false;

      Promise.all([
        MF.tmdb.details(p.type, p.id),
      ]).then(function (res) {
        if (root._key !== p.type + ':' + p.id) return;
        var d = res[0];
        clearTimeout(slow);
        root._ready = true;
        root._data = d;
        root.innerHTML = '';
        if (d.backdrop_path) $('details-bg').style.backgroundImage = 'url("' + MF.tmdb.img(d.backdrop_path, 'w1280') + '")';
        $('details-bg').classList.add('show');
        root.offsetWidth;
        root.classList.add('reveal');

        var head = el('div', 'details-head');
        head.appendChild(el('div', 'details-kicker', d.media_type === 'tv' ? 'SERIES' : 'MOVIE'));
        var logo = el('img', 'details-logo hidden');
        var titleEl = el('h1', 'details-title', ui.title(d));
        head.appendChild(logo);
        head.appendChild(titleEl);
        ui.applyLogo(d, logo, titleEl, 'w500');
        if (d.tagline) head.appendChild(el('div', 'details-tagline', d.tagline));

        var meta = [];
        if (ui.year(d)) meta.push(ui.year(d));
        if (d.media_type === 'movie' && d.runtime) meta.push(ui.fmtRuntime(d.runtime));
        if (d.media_type === 'tv' && d.number_of_seasons) meta.push(d.number_of_seasons + (d.number_of_seasons > 1 ? ' Seasons' : ' Season'));
        var cert = certification(d);
        if (MF.server.has(d.media_type, d.id) === true) meta.push('Available to play');
        var metaEl = el('div', 'details-meta');
        ui.setMeta(metaEl, d.vote_average ? ui.rating(d) : '', meta);
        if (cert) metaEl.appendChild(el('span', 'cert', cert));
        head.appendChild(metaEl);
        head.appendChild(el('div', 'details-genres', (d.genres || []).map(function (g) { return g.name; }).join('  \u00B7  ')));
        head.appendChild(el('p', 'details-overview', d.overview || ''));

        var actions = el('div', 'details-actions');
        actions.appendChild(playButton(d));
        var key = trailerKey(d);
        if (key) {
          var tr = el('button', 'btn btn-icon focusable');
          tr.innerHTML = MF.icon('film') + '<span>Trailer</span>';
          tr.addEventListener('click', function () { go('trailer', { key: key }); });
          actions.appendChild(tr);
        }
        var listBtn = el('button', 'btn btn-icon focusable');
        var setListLabel = function () {
          listBtn.innerHTML = (MF.store.inMyList(d.media_type, d.id) ? MF.icon('check') : MF.icon('plus')) + '<span>My List</span>';
        };
        setListLabel();
        listBtn.addEventListener('click', function () {
          var added = MF.store.toggleMyList(d);
          setListLabel();
          ui.toast(added ? 'Added to My List' : 'Removed from My List');
        });
        actions.appendChild(listBtn);

        var watchedBtn = el('button', 'btn btn-icon focusable');
        var setWatchedLabel = function () {
          var on = MF.store.isWatched(d.media_type, d.id);
          watchedBtn.innerHTML = MF.icon(on ? 'check-circle' : 'eye') + '<span>' + (on ? 'Watched' : 'Mark as watched') + '</span>';
          watchedBtn.classList.toggle('btn-on', on);
        };
        setWatchedLabel();
        watchedBtn.addEventListener('click', function () {
          var on = MF.store.setWatched(d, !MF.store.isWatched(d.media_type, d.id));
          setWatchedLabel();
          stale.continue = true;
          stale.watched = true;
          ui.toast(on ? 'Marked as watched' : 'Removed from watched');
        });
        actions.appendChild(watchedBtn);
        head.appendChild(actions);

        var crew = (d.credits && d.credits.crew || []).filter(function (c) { return c.job === 'Director'; }).map(function (c) { return c.name; });
        if (d.created_by && d.created_by.length) crew = d.created_by.map(function (c) { return c.name; });
        if (crew.length) head.appendChild(el('div', 'details-credit', (d.media_type === 'tv' ? 'Created by ' : 'Directed by ') + crew.join(', ')));
        root.appendChild(head);

        if (d.media_type === 'tv') {
          var seasons = seasonList(d);
          if (seasons.length) {
            var progress = MF.store.getProgress('tv', d.id);
            var startSeason = progress && progress.season ? progress.season : seasons[0].season_number;
            var seasonBar = el('div', 'season-bar strip');
            var epWrap = el('div', 'episodes');
            seasons.forEach(function (s) {
              var b = el('button', 'chip focusable' + (s.season_number === startSeason ? ' active' : ''), s.name || 'Season ' + s.season_number);
              b.addEventListener('click', function () {
                Array.prototype.forEach.call(seasonBar.children, function (c) { c.classList.remove('active'); });
                b.classList.add('active');
                root._season = s.season_number;
                renderEpisodes(d, epWrap, s.season_number);
              });
              seasonBar.appendChild(b);
            });
            var seasonSection = el('section', 'row');
            seasonSection.appendChild(seasonBar);
            root.appendChild(seasonSection);
            root.appendChild(epWrap);
            root._season = startSeason;
            renderEpisodes(d, epWrap, startSeason);
          }
        }

        var cast = (d.credits && d.credits.cast || []).slice(0, 20);
        if (cast.length) {
          root.appendChild(ui.row('Cast', cast.map(function (c) {
            var card = el('div', 'person focusable');
            card.addEventListener('click', function () {
              go('explore', { type: d.media_type, person: { id: c.id, name: c.name } }, { push: true });
            });
            var img = ui.lazyImg(MF.tmdb.img(c.profile_path, 'w185'), 'person-img');
            card.appendChild(img);
            card.appendChild(el('div', 'person-name', c.name));
            card.appendChild(el('div', 'person-role', c.character || ''));
            return card;
          }), 'row-cast'));
        }

        var recs = (d.recommendations && d.recommendations.results || []).filter(function (r) { return r.poster_path; });
        if (recs.length) root.appendChild(ui.row('More Like This', recs.map(function (r) { return ui.posterCard(r, openItem); })));

        if (top() === entry) MF.nav.focusFirst('#details .btn-play');

        // Library availability arrives separately; refresh the Play button when it does.
        MF.server.catalog().then(function () {
          if (root._key !== p.type + ':' + p.id) return;
          var oldBtn = root.querySelector('.btn-play');
          if (!oldBtn) return;
          var wasFocused = MF.nav.current() === oldBtn;
          var nb = playButton(d);
          oldBtn.parentNode.replaceChild(nb, oldBtn);
          if (wasFocused) MF.nav.focus(nb);
        }, function () {});
      }, function (err) {
        clearTimeout(slow);
        root._ready = true;
        root.innerHTML = '';
        root.classList.add('reveal');
        ui.message(root, 'Could not load this title', err.message, { label: 'Go back', onClick: back });
        if (top() === entry) MF.nav.focusFirst();
      });
    }
  };

  // ------------------------- Trailer -------------------------

  // YouTube embeds fail with error 153 inside webOS apps (file:// pages send no referrer), so the
  // embed is loaded through the media server's /trailer page, which gives it a proper http origin.
  var trailerHintTimer = null;

  function trailerUrl(key) {
    if (MF.settings.trailerPage) {
      var page = MF.settings.trailerPage;
      return page + (page.indexOf('?') < 0 ? '?' : '&') + 'v=' + encodeURIComponent(key);
    }
    if (MF.settings.serverBase) {
      return MF.settings.serverBase.replace(/\/+$/, '') + '/trailer?v=' + encodeURIComponent(key);
    }
    return 'https://www.youtube.com/embed/' + encodeURIComponent(key) + '?autoplay=1&rel=0';
  }

  // Each trailer gets a brand-new iframe (and it is thrown away on leaving). Re-pointing one iframe adds entries to the
  // browser history, and the Back key (a history step on webOS) would then walk the iframe back and restart the trailer.
  function freshTrailerFrame(src) {
    var old = $('trailer-frame');
    var f = document.createElement('iframe');
    f.id = 'trailer-frame';
    f.tabIndex = -1;
    f.setAttribute('allow', 'autoplay *; fullscreen *');
    f.setAttribute('referrerpolicy', 'strict-origin-when-cross-origin');
    old.parentNode.replaceChild(f, old);
    if (src) f.src = src;
  }

  function trailerCmd(msg) {
    var frame = $('trailer-frame');
    msg.source = 'mf-app';
    if (frame.contentWindow) frame.contentWindow.postMessage(msg, '*');
  }

  function showTrailerHint() {
    var hint = $('trailer-hint');
    hint.classList.remove('hidden');
    clearTimeout(trailerHintTimer);
    trailerHintTimer = setTimeout(function () { hint.classList.add('hidden'); }, 4000);
  }

  function onTrailerMessage(e) {
    var d = e.data || {};
    if (d.source !== 'mf-trailer' || !top() || top().route !== 'trailer') return;
    if (d.type === 'state' && d.state === 0) back();
    if (d.type === 'error') { ui.toast('Trailer unavailable (YouTube error ' + d.code + ')', 4000); back(); }
  }

  function trailerKeys(e, code) {
    var K = MF.nav.KEY;
    if (code === K.ENTER || code === K.PLAYPAUSE || code === K.PLAY || code === K.PAUSE) { trailerCmd({ cmd: 'toggle' }); showTrailerHint(); return true; }
    if (code === K.LEFT || code === K.RW) { trailerCmd({ cmd: 'seek', value: -10 }); showTrailerHint(); return true; }
    if (code === K.RIGHT || code === K.FF) { trailerCmd({ cmd: 'seek', value: 10 }); showTrailerHint(); return true; }
    if (code === K.STOP) { back(); return true; }
    if (code === K.UP || code === K.DOWN) { showTrailerHint(); return true; }
    return false;
  }

  screens.explore = {
    enter: function (entry, restoreFocus) {
      MF.explore.enter(entry.params, restoreFocus);
      if (restoreFocus) restore(entry, '#explore-bar .chip');
    },
    leave: function () { MF.explore.leave(); }
  };

  screens.trailer = {
    enter: function (entry) {
      freshTrailerFrame(trailerUrl(entry.params.key));
      MF.nav.handler = trailerKeys;
      showTrailerHint();
    },
    leave: function () {
      freshTrailerFrame('');
      $('trailer-hint').classList.add('hidden');
    }
  };

  // ------------------------- Player -------------------------

  screens.player = {
    enter: function (entry, restoreFocus) {
      if (!restoreFocus) MF.player.open(entry.params);
    },
    leave: function () {
      MF.player.close();
      stale.continue = true;
    }
  };

  // ------------------------- Search -------------------------

  var searchTimer = null;
  var lastQuery = null;

  function showSearchResults(heading, items, focusResults) {
    var out = $('search-results');
    out.innerHTML = '';
    out.scrollTop = 0;
    $('search-heading').textContent = heading;
    if (!items.length) return;
    out.appendChild(ui.row('', items.map(function (r) { return ui.posterCard(r, openItem); }), 'row-grid'));
    if (focusResults) MF.nav.focusFirst('#search-results .card');
  }

  function runSearch(q, focusResults) {
    q = q.trim();
    if (q === lastQuery && !focusResults) return;
    lastQuery = q;
    if (!q) {
      MF.tmdb.trending('all', 'week').then(function (d) {
        if (lastQuery === '') showSearchResults('Trending this week', (d.results || []).slice(0, 18), focusResults);
      }, function () {});
      return;
    }
    MF.tmdb.search(q).then(function (data) {
      if (q !== lastQuery) return;
      var results = data.results || [];
      showSearchResults(results.length ? 'Results for "' + q + '"' : 'No results for "' + q + '"', results, focusResults);
    }, function (err) {
      showSearchResults('Search failed: ' + err.message, [], false);
    });
  }

  // On-screen keyboard: works with the remote without opening the webOS keyboard.
  function buildKeyboard() {
    var kbd = $('kbd');
    var input = $('search-input');
    function changed() {
      setVoiceMode(false);
      clearTimeout(searchTimer);
      searchTimer = setTimeout(function () { runSearch(input.value, false); }, 350);
    }
    function key(label, cls, onPress, html) {
      var k = el('button', 'key focusable' + (cls ? ' ' + cls : ''));
      if (html) k.innerHTML = html; else k.textContent = label;
      k.addEventListener('click', function () { onPress(); changed(); });
      kbd.appendChild(k);
    }
    'abcdefghijklmnopqrstuvwxyz1234567890'.split('').forEach(function (ch) {
      key(ch, '', function () { input.value += ch; });
    });
    key('Space', 'key-wide', function () { if (input.value && !/ $/.test(input.value)) input.value += ' '; });
    key('', 'key-wide', function () { input.value = input.value.slice(0, -1); }, MF.icon('backspace'));
    key('Clear', 'key-wide', function () { input.value = ''; });
  }

  // Voice search. webOS gives apps no microphone access: the TV's own voice recognition types the spoken words into the focused
  // text field, started by the Magic Remote's mic button or the voice button on the system keyboard. So the mic button here
  // clears the field, gives it real focus, and runs the search as soon as the spoken words arrive.
  var voiceMode = false;
  var voiceTimer = null;
  var voiceExpiry = null;
  var SEARCH_PLACEHOLDER = 'Movies, shows, people';

  function setVoiceMode(on) {
    voiceMode = on;
    clearTimeout(voiceTimer);
    clearTimeout(voiceExpiry);
    if (on) voiceExpiry = setTimeout(function () { setVoiceMode(false); }, 25000);
    $('search-mic').classList.toggle('listening', on);
    $('search-input').placeholder = on ? 'Use mic on keyboard' : SEARCH_PLACEHOLDER;
  }

  function startVoiceSearch() {
    var input = $('search-input');
    input.value = '';
    setVoiceMode(true);
    MF.nav.focus(input, { edit: true });
  }

  function onVoiceText() {
    if (!voiceMode) return;
    clearTimeout(voiceTimer);
    voiceTimer = setTimeout(function () {
      var v = $('search-input').value;
      setVoiceMode(false);
      if (v.trim()) { clearTimeout(searchTimer); runSearch(v, true); }
    }, 1200);
  }

  screens.search = {
    leave: function () { setVoiceMode(false); },
    enter: function (entry, restoreFocus) {
      if (lastQuery === null) runSearch('', false);
      if (restoreFocus) restore(entry, '#kbd .key');
      else MF.nav.focus($('kbd').querySelector('.key'));
    }
  };


  // ------------------------- Settings -------------------------

  var FIELDS = {
    'set-tmdb-key': 'tmdbKey',
    'set-language': 'language',
    'set-region': 'region',
    'set-subdl-key': 'subdlKey',
    'set-sub-langs': 'subLangs',
    'set-sync-server': 'syncServer',
    'set-stream': 'streamBase',
    'set-server': 'serverBase',
    'set-server-token': 'serverToken',
    'set-refresh': 'refreshMinutes'
  };

  function status(msg) { $('settings-status').textContent = msg; }

  var STREAM_TYPES = [['auto', 'Detect automatically'], ['page', 'Web page with its own player'], ['video', 'Video file / HLS stream']];
  var pendingStreamType = 'auto';

  function renderStreamType() {
    var label = STREAM_TYPES.filter(function (t) { return t[0] === pendingStreamType; })[0] || STREAM_TYPES[0];
    $('set-stream-type').textContent = label[1] + '  ';
    $('set-stream-type').appendChild(MF.iconEl('cycle'));
  }

  screens.settings = {
    enter: function () {
      Object.keys(FIELDS).forEach(function (id) { $(id).value = MF.settings[FIELDS[id]] || ''; });
      pendingStreamType = MF.settings.streamType || 'auto';
      renderStreamType();
      $('settings-note').textContent = MF.settings.tmdbKey
        ? 'Metadata comes from TMDB. Videos play only from the media server you configure.'
        : 'Start by adding your TMDB key. Videos play only from the media server you configure.';
      status('');
      MF.nav.focus($('set-tmdb-key'));
    }
  };

  function readSettingsForm() {
    var patch = {};
    Object.keys(FIELDS).forEach(function (id) { patch[FIELDS[id]] = $(id).value.trim(); });
    patch.refreshMinutes = Math.max(5, Number(patch.refreshMinutes) || 60);
    patch.language = patch.language || 'en-US';
    patch.region = patch.region.toUpperCase();
    patch.subLangs = (patch.subLangs || '').toUpperCase().replace(/[^A-Z,]+/g, ',').replace(/^,+|,+$/g, '') || 'EN';
    patch.streamType = pendingStreamType;
    return patch;
  }

  function applySettings() {
    MF.store.saveSettings(readSettingsForm());
    MF.tmdb.clearCache();
    MF.server.reset();
    Object.keys(browseViews).forEach(function (r) { stale[r] = true; });
  }

  function bindSettings() {
    $('set-stream-type').addEventListener('click', function () {
      var i = STREAM_TYPES.map(function (t) { return t[0]; }).indexOf(pendingStreamType);
      pendingStreamType = STREAM_TYPES[(i + 1) % STREAM_TYPES.length][0];
      renderStreamType();
    });
    $('set-save').addEventListener('click', function () {
      applySettings();
      ui.toast('Settings saved');
      go('home');
    });
    $('set-test').addEventListener('click', function () {
      applySettings();
      status('Testing...');
      var t = MF.tmdb.ping().then(function () { return 'TMDB: connected'; }, function (e) { return 'TMDB: ' + e.message; });
      var s = MF.server.enabled()
        ? MF.server.ping().then(function (n) {
          return n === null ? 'Server: reachable, no /catalog (all titles playable)' : 'Server: connected (' + n + ' titles)';
        }, function (e) { return 'Server: ' + e.message; })
        : Promise.resolve('Server: not configured');
      Promise.all([t, s]).then(function (r) { status(r.join('    \u00B7    ')); });
    });
    $('set-clear').addEventListener('click', function () {
      MF.store.clearProgress();
      stale.continue = true;
      ui.toast('Watch history cleared');
    });
  }

  // ------------------------- Auto refresh -------------------------

  var knownCount = null;

  function refreshCatalog() {
    MF.tmdb.clearCache();
    Object.keys(browseViews).forEach(function (r) { stale[r] = true; });
    if (!MF.server.enabled()) return;
    MF.server.catalog(true).then(function (items) {
      if (knownCount !== null && items.length > knownCount) {
        ui.toast((items.length - knownCount) + ' new title(s) added to your library');
      }
      knownCount = items.length;
    }, function () { /* keep the previous catalog */ });
  }

  function scheduleRefresh() {
    var minutes = Math.max(5, Number(MF.settings.refreshMinutes) || 60);
    setTimeout(function () { refreshCatalog(); scheduleRefresh(); }, minutes * 60 * 1000);
  }

  // ------------------------- Boot -------------------------

  // Launch splash: stays at least 900 ms, hides when the first row is ready (or after 4 s).
  var bootAt = Date.now();
  var splashDone = false;
  function hideSplash() {
    if (splashDone) return;
    splashDone = true;
    setTimeout(function () {
      var sp = $('splash');
      sp.classList.add('out');
      setTimeout(function () { sp.classList.add('hidden'); }, 600);
    }, Math.max(0, 900 - (Date.now() - bootAt)));
  }

  function boot() {
    history.replaceState({ base: true }, '');
    armHistory();
    MF.hydrateIcons();
    buildKeyboard();
    setTimeout(hideSplash, 4000);
    MF.player.init();
    bindSettings();
    MF.account.init();

    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function (t) {
      t.addEventListener('click', function () { go(t.getAttribute('data-route')); });
    });

    $('search-mic').addEventListener('click', startVoiceSearch);
    $('search-input').addEventListener('input', function () {
      onVoiceText();
      clearTimeout(searchTimer);
      var v = $('search-input').value;
      searchTimer = setTimeout(function () { runSearch(v, false); }, 450);
    });
    MF.nav.onInputEnter = function (input) {
      if (input.id === 'picker-input') { MF.explore.onInputEnter(); return; }
      if (input.id === 'search-input') { clearTimeout(searchTimer); runSearch(input.value, true); }
      else input.blur();
    };

    var visEvent = 'hidden' in document ? 'visibilitychange' : 'webkitvisibilitychange';
    document.addEventListener(visEvent, function () {
      var hidden = document.hidden || document.webkitHidden;
      var entry = top();
      if (hidden && entry && entry.route === 'player') $('video').pause();
      if (!hidden && entry && SCREEN_FOR[entry.route] === 'browse' && stale[entry.route]) show(entry, false);
    });

    window.addEventListener('message', onTrailerMessage);
    // With the Magic Remote pointer showing, OK arrives as a click instead of an Enter key.
    $('screen-trailer').addEventListener('click', function () {
      trailerCmd({ cmd: 'toggle' });
      showTrailerHint();
    });

    // Fade and lift the hero as the rows scroll over it.
    var rowsEl = $('rows');
    var heroInfo = document.querySelector('.hero-info');
    rowsEl.addEventListener('scroll', function () {
      var y = rowsEl.scrollTop;
      heroInfo.style.opacity = Math.max(0, 1 - y / 260);
      heroInfo.style.transform = 'translateY(' + (-Math.min(y, 400) * 0.5) + 'px)';
      document.body.classList.toggle('scrolled', y > 200);
    });

    scheduleRefresh();
    initHeroButtons();
    MF.videos.init();
    MF.server.catalog().then(function (items) { knownCount = items.length; }, function () { /* surfaced on details/play */ });
    if (!MF.settings.tmdbKey) {
      hideSplash();
      go('settings');
      return;
    }
    // Genre names are used in hero and card meta; wait briefly for them, but never block start-up.
    var started = false;
    var start = function () { if (!started) { started = true; MF.account.startup(function () { go('home'); }); } };
    ui.loadGenres().then(start);
    setTimeout(start, 1500);
  }

  // Marks screens for a rebuild after the data behind them changed. full = a different profile or account; otherwise only Continue Watching.
  function invalidate(full) {
    if (full !== false) Object.keys(browseViews).forEach(function (r) { stale[r] = true; });
    stale.continue = true;
  }

  MF.app = {
    go: go, back: back, openItem: openItem, invalidate: invalidate,
    top: top, depth: function () { return stack.length; }, exit: function () { exitApp(); },
    noteBackKey: function () { lastBackKeyAt = Date.now(); }
  };

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
