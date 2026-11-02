(function () {
  'use strict';

  var MF = window.MF;

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined && text !== null) node.textContent = text;
    return node;
  }

  function title(item) { return item.title || item.name || ''; }

  function year(item) {
    var d = item.release_date || item.first_air_date || '';
    return d ? d.slice(0, 4) : '';
  }

  function rating(item) {
    return item.vote_average ? (Math.round(item.vote_average * 10) / 10).toFixed(1) : '';
  }

  function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec || 0));
    var h = Math.floor(sec / 3600);
    var m = Math.floor((sec % 3600) / 60);
    var s = sec % 60;
    var mm = h ? (m < 10 ? '0' + m : m) : m;
    return (h ? h + ':' : '') + mm + ':' + (s < 10 ? '0' + s : s);
  }

  function fmtRuntime(min) {
    if (!min) return '';
    var h = Math.floor(min / 60);
    return (h ? h + 'h ' : '') + (min % 60) + 'm';
  }

  var genreMap = {};
  function loadGenres() {
    return MF.tmdb.genreNames().then(function (m) { genreMap = m; }, function () {});
  }

  function genreList(item, max) {
    var ids = item.genre_ids || (item.genres || []).map(function (g) { return g.id; });
    return ids.map(function (id) { return genreMap[id]; }).filter(Boolean).slice(0, max || 3);
  }

  var logoCache = {};
  var logoPath = {};
  function logoFor(item) {
    var key = item.media_type + ':' + item.id;
    if (!logoCache[key]) {
      logoCache[key] = MF.tmdb.logo(item.media_type, item.id).then(function (p) {
        logoPath[key] = p || null;
        return p;
      });
    }
    return logoCache[key];
  }

  function preloadImage(url) {
    return new Promise(function (resolve) {
      if (!url) { resolve(); return; }
      var im = new Image();
      im.onload = im.onerror = function () { resolve(); };
      im.src = url;
    });
  }

  // Warms everything the details page needs: data, title logo and backdrop.
  var prefetched = {};
  function prefetchTitle(item) {
    if (!item || !item.id || (item.media_type !== 'movie' && item.media_type !== 'tv')) return Promise.resolve();
    var key = item.media_type + ':' + item.id;
    if (prefetched[key]) return prefetched[key];
    var data = MF.tmdb.details(item.media_type, item.id).then(function (d) {
      return preloadImage(MF.tmdb.img(d.backdrop_path, 'w1280'));
    }, function () {});
    var logo = logoFor(item).then(function (p) { return p ? preloadImage(MF.tmdb.img(p, 'w500')) : null; });
    prefetched[key] = Promise.all([data, logo]);
    prefetched[key].catch(function () { delete prefetched[key]; });
    return prefetched[key];
  }

  // Shows the title logo when TMDB has one, otherwise the text title.
  function applyLogo(item, imgEl, titleEl, size) {
    var key = item.media_type + ':' + item.id;
    imgEl._key = key;
    titleEl.textContent = title(item);
    clearTimeout(imgEl._wait);
    // Logo already known: show the final state immediately (no text-to-logo swap).
    if (key in logoPath) {
      titleEl.classList.remove('pending');
      if (logoPath[key]) {
        imgEl.src = MF.tmdb.img(logoPath[key], size || 'w500');
        imgEl.alt = title(item);
        imgEl.classList.remove('hidden');
        titleEl.classList.add('hidden');
      } else {
        imgEl.classList.add('hidden');
        titleEl.classList.remove('hidden');
      }
      return;
    }
    // Unknown: keep the space quiet briefly; fall back to the text title if the logo is slow.
    imgEl.classList.add('hidden');
    titleEl.classList.remove('hidden');
    titleEl.classList.add('pending');
    imgEl._wait = setTimeout(function () { titleEl.classList.remove('pending'); }, 500);
    logoFor(item).then(function (path) {
      if (imgEl._key !== key) return;
      if (!path) { titleEl.classList.remove('pending'); return; }
      if (!path || imgEl._key !== key) return;
      var url = MF.tmdb.img(path, size || 'w500');
      var probe = new Image();
      probe.onload = function () {
        if (imgEl._key !== key) return;
        imgEl.src = url;
        imgEl.alt = title(item);
        imgEl.classList.remove('hidden');
        titleEl.classList.add('hidden');
        titleEl.classList.remove('pending');
      };
      probe.src = url;
    });
  }

  var lazyObserver = 'IntersectionObserver' in window
    ? new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var img = entry.target;
        lazyObserver.unobserve(img);
        img.src = img.getAttribute('data-src');
      });
    }, { rootMargin: '600px 1200px' })
    : null;

  function lazyImg(src, cls) {
    var img = el('img', cls);
    img.alt = '';
    if (!src) return img;
    if (lazyObserver) {
      img.setAttribute('data-src', src);
      lazyObserver.observe(img);
    } else {
      img.src = src;
    }
    img.onerror = function () { img.style.visibility = 'hidden'; };
    return img;
  }

  function badge(item, card) {
    if (MF.server.has(item.media_type, item.id) === true) card.appendChild(el('div', 'badge', 'Available'));
    if (item.id && item.media_type && MF.store.isWatched(item.media_type, item.id)) {
      var w = el('div', 'watched-mark');
      w.appendChild(MF.iconEl('check'));
      card.appendChild(w);
      card.classList.add('is-watched');
    }
  }

  function posterCard(item, onSelect) {
    var card = el('button', 'card card-poster focusable');
    card._item = item;
    var img = lazyImg(MF.tmdb.img(item.poster_path, 'w342'), 'card-img');
    card.appendChild(img);
    if (!item.poster_path) card.appendChild(el('div', 'card-fallback', title(item)));
    badge(item, card);
    card.addEventListener('click', function () { onSelect(item); });
    return card;
  }

  // 16:9 backdrop card with the title on a gradient; extra meta appears on focus.
  function landscapeCard(item, onSelect) {
    var card = el('button', 'card card-land focusable');
    card._item = item;
    card.appendChild(lazyImg(MF.tmdb.img(item.backdrop_path || item.poster_path, 'w780'), 'card-img'));
    var cap = el('div', 'card-caption');
    cap.appendChild(el('div', 'card-title', title(item)));
    var meta = [year(item), item.media_type === 'tv' ? 'Series' : 'Movie'].concat(genreList(item, 1)).filter(Boolean);
    var sub = el('div', 'card-sub');
    if (rating(item)) {
      var r = el('span', 'meta-rating');
      r.appendChild(MF.iconEl('star'));
      r.appendChild(document.createTextNode(' ' + rating(item)));
      sub.appendChild(r);
      sub.appendChild(el('span', 'meta-dot'));
    }
    sub.appendChild(document.createTextNode(meta.join('  \u00B7  ')));
    cap.appendChild(sub);
    card.appendChild(cap);
    badge(item, card);
    card.addEventListener('click', function () { onSelect(item); });
    return card;
  }

  // Netflix-style ranked card: big outlined number beside the poster.
  function top10Card(item, rank, onSelect) {
    var card = el('button', 'card card-top10 focusable');
    card._item = item;
    card.appendChild(el('div', 'rank', String(rank)));
    var poster = el('div', 'rank-poster');
    poster.appendChild(lazyImg(MF.tmdb.img(item.poster_path, 'w342'), 'card-img'));
    card.appendChild(poster);
    badge(item, poster);
    card.addEventListener('click', function () { onSelect(item); });
    return card;
  }

  // Placeholder row shown while a row loads.
  function skeletonRow(style) {
    var section = el('section', 'row row-skeleton');
    section.appendChild(el('div', 'skeleton-title'));
    var strip = el('div', 'strip');
    var n = style === 'land' ? 5 : 8;
    for (var i = 0; i < n; i++) strip.appendChild(el('div', 'skeleton-card ' + (style === 'land' ? 'card-land' : 'card-poster')));
    section.appendChild(strip);
    return section;
  }

  function wideCard(opts) {
    var card = el('button', 'card card-wide focusable');
    card._item = opts.item;
    card.appendChild(lazyImg(opts.image, 'card-img'));
    var cap = el('div', 'card-caption');
    cap.appendChild(el('div', 'card-title', opts.title));
    if (opts.subtitle) cap.appendChild(el('div', 'card-sub', opts.subtitle));
    card.appendChild(cap);
    if (opts.progress) {
      var bar = el('div', 'card-progress');
      var fill = el('div', 'card-progress-fill');
      fill.style.width = Math.min(100, Math.round(opts.progress * 100)) + '%';
      bar.appendChild(fill);
      card.appendChild(bar);
    }
    if (opts.item) badge(opts.item, card);
    card.addEventListener('click', opts.onSelect);
    return card;
  }

  function updateArrows(strip) {
    var section = strip.parentNode;
    if (!section || !section._arrows) return;
    var max = strip.scrollWidth - strip.clientWidth;
    section._arrows.left.classList.toggle('off', strip.scrollLeft <= 2);
    section._arrows.right.classList.toggle('off', strip.scrollLeft >= max - 2);
  }

  // Pointer-only paddles (Magic Remote) for scrolling a row sideways.
  function addArrows(section, strip) {
    var left = el('div', 'strip-arrow strip-arrow-left');
    var right = el('div', 'strip-arrow strip-arrow-right');
    left.innerHTML = MF.icon('chevron-left');
    right.innerHTML = MF.icon('chevron-right');
    function page(dir) {
      return function (e) {
        e.stopPropagation();
        strip.scrollLeft += dir * Math.round(strip.clientWidth * 0.75);
        setTimeout(function () { updateArrows(strip); }, 450);
      };
    }
    left.addEventListener('click', page(-1));
    right.addEventListener('click', page(1));
    section.appendChild(left);
    section.appendChild(right);
    section._arrows = { left: left, right: right };
    section.addEventListener('mouseenter', function () { updateArrows(strip); });
  }

  function row(label, cards, cls) {
    var section = el('section', 'row' + (cls ? ' ' + cls : ''));
    section.appendChild(el('h2', 'row-title', label));
    var strip = el('div', 'strip');
    cards.forEach(function (c) { strip.appendChild(c); });
    section.appendChild(strip);
    if (!/row-grid/.test(cls || '')) addArrows(section, strip);
    return section;
  }

  MF.nav.onStripScroll = function (strip) { updateArrows(strip); };

  var heroTimer = null;
  var heroFull = {};
  function setHero(item, kicker) {
    clearTimeout(heroTimer);
    heroTimer = setTimeout(function () {
      if (!item) return;
      // Continue Watching items only carry title/artwork; fetch the rest once, then redraw.
      if (!item.overview && !item.vote_average && item.id && item.media_type) {
        var k = item.media_type + ':' + item.id;
        if (heroFull[k]) item = heroFull[k];
        else {
          MF.tmdb.details(item.media_type, item.id).then(function (d) {
            d.genre_ids = (d.genres || []).map(function (g) { return g.id; });
            heroFull[k] = d;
            var cur = MF.nav.current();
            if (cur && cur._item && cur._item.id === d.id) setHero(d, kicker);
          }, function () {});
        }
      }
      var bg = document.getElementById('hero-bg');
      var url = MF.tmdb.img(item.backdrop_path, 'w1280');
      if (bg._url !== url) {
        bg._url = url;
        bg.classList.remove('show');
        if (url) {
          var probe = new Image();
          probe.onload = function () {
            if (bg._url !== url) return;
            bg.style.backgroundImage = 'url("' + url + '")';
            bg.classList.add('show');
          };
          probe.src = url;
        }
      }
      document.getElementById('hero-kicker').textContent = kicker || (item.media_type === 'tv' ? 'SERIES' : 'MOVIE');
      applyLogo(item, document.getElementById('hero-logo'), document.getElementById('hero-title'));
      var meta = [];
      if (year(item)) meta.push(year(item));
      meta = meta.concat(genreList(item, 3));
      if (MF.server.has(item.media_type, item.id) === true) meta.push('Available to play');
      setMeta(document.getElementById('hero-meta'), rating(item), meta);
      document.getElementById('hero-desc').textContent = item.overview || '';
    }, 140);
  }

  // Meta line: optional star rating followed by parts separated by drawn dots.
  function setMeta(node, ratingText, parts) {
    node.innerHTML = '';
    var items = [];
    if (ratingText) {
      var r = el('span', 'meta-rating');
      r.appendChild(MF.iconEl('star'));
      r.appendChild(document.createTextNode(' ' + ratingText));
      items.push(r);
    }
    parts.forEach(function (p) { items.push(document.createTextNode(p)); });
    items.forEach(function (item, i) {
      if (i) node.appendChild(el('span', 'meta-dot'));
      node.appendChild(item);
    });
  }

  var toastTimer = null;
  function toast(msg, ms) {
    var t = document.getElementById('toast');
    t.textContent = msg;
    t.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.add('hidden'); }, ms || 3000);
  }

  function message(container, heading, sub, action) {
    var box = el('div', 'message');
    box.appendChild(el('div', 'message-title', heading));
    if (sub) box.appendChild(el('div', 'message-sub', sub));
    if (action) {
      var btn = el('button', 'btn btn-primary focusable', action.label);
      btn.addEventListener('click', action.onClick);
      box.appendChild(btn);
    }
    container.appendChild(box);
    return box;
  }

  MF.ui = {
    el: el,
    title: title,
    year: year,
    rating: rating,
    fmtTime: fmtTime,
    fmtRuntime: fmtRuntime,
    lazyImg: lazyImg,
    posterCard: posterCard,
    landscapeCard: landscapeCard,
    top10Card: top10Card,
    skeletonRow: skeletonRow,
    applyLogo: applyLogo,
    prefetchTitle: prefetchTitle,
    loadGenres: loadGenres,
    genreList: genreList,
    wideCard: wideCard,
    row: row,
    setHero: setHero,
    setMeta: setMeta,
    toast: toast,
    message: message
  };
})();
