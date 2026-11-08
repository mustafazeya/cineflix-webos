(function () {
  'use strict';

  var MF = window.MF;

  var KEY = {
    LEFT: 37, UP: 38, RIGHT: 39, DOWN: 40, ENTER: 13,
    BACK: 461, ESC: 27, BACKSPACE: 8,
    PLAY: 415, PAUSE: 19, PLAYPAUSE: 10252, STOP: 413, FF: 417, RW: 412,
    RED: 403, GREEN: 404, YELLOW: 405, BLUE: 406
  };

  var current = null;

  function isVisible(el) {
    if (!el || el.disabled) return false;
    if (el.offsetParent === null && getComputedStyle(el).position !== 'fixed') return false;
    return !el.closest('.hidden');
  }

  function scopes() {
    // A picker overlay is modal: only its items can take focus.
    if (document.body.classList.contains('dialog-open')) return [document.getElementById('dialog')];
    if (document.body.classList.contains('picker-open')) return [document.getElementById('picker')];
    if (document.body.classList.contains('subs-open')) {
      var ui = document.querySelector('#subs-panel:not(.hidden), #subs-menu:not(.hidden)');
      if (ui) return [ui];
    }
    var list = [];
    var nav = document.getElementById('sidenav');
    if (nav && !document.body.classList.contains('no-nav')) list.push(nav);
    var screen = document.querySelector('.screen.active');
    if (screen) list.push(screen);
    return list;
  }

  function candidates() {
    var out = [];
    scopes().forEach(function (s) {
      var nodes = s.querySelectorAll('.focusable');
      for (var i = 0; i < nodes.length; i++) if (isVisible(nodes[i])) out.push(nodes[i]);
    });
    return out;
  }

  function ensureVisible(el) {
    var node = el.parentElement;
    while (node && node !== document.body) {
      if (node.classList.contains('strip')) {
        var pad = 80;
        var left = el.offsetLeft - node.scrollLeft;
        if (left < pad) node.scrollLeft = Math.max(0, el.offsetLeft - pad);
        else if (left + el.offsetWidth > node.clientWidth - pad) node.scrollLeft = el.offsetLeft + el.offsetWidth - node.clientWidth + pad;
      } else if (node.classList.contains('scroller')) {
        stopSmooth(node);
        var r = el.getBoundingClientRect();
        var nr = node.getBoundingClientRect();
        var anchor = el.closest('.row') || el;
        // The first row of a hero screen scrolls fully back so the hero is visible again.
        if (node.id === 'rows' && anchor === node.querySelector('.browse-view:not(.hidden) .row')) {
          node.scrollTop = 0;
          node = node.parentElement;
          continue;
        }
        var ar = anchor.getBoundingClientRect();
        var topPad = Number(node.getAttribute('data-top-pad')) || 40;
        var bottomPad = 60;
        if (ar.top < nr.top + topPad) node.scrollTop -= (nr.top + topPad - ar.top);
        else if (r.bottom > nr.bottom - bottomPad) node.scrollTop += (Math.min(ar.bottom, ar.top + nr.height - topPad) - nr.bottom + bottomPad);
      }
      node = node.parentElement;
    }
  }

  // Text fields are only highlighted on focus; typing (and the TV keyboard) starts with OK or a click.
  var keyboardVisible = false;

  function editing() {
    var a = document.activeElement;
    return !!a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA');
  }

  function startEditing(el) {
    el.focus();
    try {
      var len = el.value.length;
      el.setSelectionRange(len, len);
    } catch (e) { /* number inputs don't support selection */ }
  }

  var lastContent = null;

  function focus(el, opts) {
    if (!el) return;
    var inRail = !!el.closest('#sidenav');
    if (!inRail) lastContent = el;
    document.body.classList.toggle('nav-open', inRail);
    if (current && current !== el) current.classList.remove('focused');
    current = el;
    el.classList.add('focused');
    var strip = el.closest('.strip');
    if (strip) strip._last = el;
    if (editing() && document.activeElement !== el) document.activeElement.blur();
    if (el.tagName === 'INPUT' && opts && opts.edit) startEditing(el);
    if (!opts || !opts.noScroll) ensureVisible(el);
    if (MF.nav.onFocus) MF.nav.onFocus(el);
  }

  function centre(r) {
    return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
  }

  function move(dir) {
    var list = candidates();
    if (!current || list.indexOf(current) < 0) {
      focus(list[0]);
      return !!list[0];
    }
    var cr = current.getBoundingClientRect();
    var cc = centre(cr);
    var curStrip = current.closest('.strip');
    var best = null;
    var bestScore = Infinity;
    var horizontal = dir === 'left' || dir === 'right';

    var railOnly = !horizontal && !!current.closest('#sidenav');
    list.forEach(function (el) {
      if (el === current) return;
      // Up/Down inside the side menu stays in the menu.
      if (railOnly && !el.closest('#sidenav')) return;
      // Up/Down from the content never jumps into the side menu; Left does that.
      if (!horizontal && !railOnly && el.closest('#sidenav')) return;
      var r = el.getBoundingClientRect();
      var c = centre(r);
      var primary, secondary;
      if (dir === 'right') { if (c.x <= cc.x + 1) return; primary = r.left - cr.right; secondary = Math.abs(c.y - cc.y); }
      if (dir === 'left') { if (c.x >= cc.x - 1) return; primary = cr.left - r.right; secondary = Math.abs(c.y - cc.y); }
      if (dir === 'down') { if (c.y <= cc.y + 1) return; primary = r.top - cr.bottom; secondary = Math.abs(c.x - cc.x); }
      if (dir === 'up') { if (c.y >= cc.y - 1) return; primary = cr.top - r.bottom; secondary = Math.abs(c.x - cc.x); }
      if (horizontal && curStrip && el.closest('.strip') !== curStrip && secondary < cr.height / 2) secondary += 2000;
      var score = Math.max(primary, 0) + secondary * (horizontal ? 3 : 0.6);
      if (score < bestScore) { bestScore = score; best = el; }
    });

    var fromRail = !!current.closest('#sidenav');
    // Entering the side menu from content lands on the active section.
    if (best && best.closest('#sidenav') && !fromRail) {
      var activeTab = document.querySelector('#sidenav .tab.active');
      if (activeTab && isVisible(activeTab)) best = activeTab;
    }
    // Leaving the side menu returns to where you were in the content.
    if (best && fromRail && !best.closest('#sidenav') && dir === 'right') {
      if (lastContent && isVisible(lastContent) && document.querySelector('.screen.active').contains(lastContent)) best = lastContent;
    }
    if (best && !horizontal) {
      // Returning to a row restores the card that was focused there last.
      var strip = best.closest('.strip');
      if (strip && strip !== curStrip && strip._last && isVisible(strip._last)) best = strip._last;
    }
    if (best) focus(best);
    return !!best;
  }

  function onKey(e) {
    var code = e.keyCode;
    MF.nav.lastInputAt = Date.now();
    if (MF.nav.handler && MF.nav.handler(e, code) === true) { e.preventDefault(); return; }

    // The webOS on-screen keyboard handles its own keys (including Back, which closes it).
    if (keyboardVisible) return;

    var inInput = editing();

    switch (code) {
      case KEY.LEFT:
      case KEY.RIGHT:
        if (inInput) return;
        move(code === KEY.LEFT ? 'left' : 'right');
        break;
      case KEY.UP: move('up'); break;
      case KEY.DOWN: move('down'); break;
      case KEY.ENTER:
        if (inInput) {
          if (MF.nav.onInputEnter) MF.nav.onInputEnter(document.activeElement);
          return;
        }
        if (current && current.tagName === 'INPUT') startEditing(current);
        else if (current) current.click();
        break;
      case KEY.BACKSPACE:
        if (inInput) return;
        MF.app.back();
        break;
      case KEY.BACK:
      case KEY.ESC:
        MF.app.noteBackKey();
        if (inInput) { document.activeElement.blur(); break; }
        MF.app.back();
        break;
      default:
        return;
    }
    e.preventDefault();
  }

  document.addEventListener('keydown', onKey);

  // Magic Remote: pointer mode shows row arrows; any key press switches back to D-pad mode.
  var lastPointer = { x: -1, y: -1 };
  document.addEventListener('keydown', function () { document.body.classList.remove('pointer-mode'); }, true);

  // Scrollers use overflow:hidden for D-pad control, so the wheel is handled here.
  function wheelTarget(target) {
    var node = target && target.closest ? target.closest('.scroller') : null;
    if (node) return node;
    var screen = document.querySelector('.screen.active');
    var list = screen ? screen.querySelectorAll('.scroller') : [];
    for (var i = 0; i < list.length; i++) if (isVisible(list[i])) return list[i];
    return null;
  }

  // Eased scrolling toward an accumulated target, so fast wheel spins add up instead of restarting.
  var raf = window.requestAnimationFrame || function (fn) { return setTimeout(fn, 16); };

  function stopSmooth(node) {
    node._target = null;
    node.style.scrollBehavior = '';
  }

  function smoothScrollBy(node, dy) {
    var max = node.scrollHeight - node.clientHeight;
    var from = node._target === null || node._target === undefined ? node.scrollTop : node._target;
    node._target = Math.max(0, Math.min(max, from + dy));
    if (node._animating) return;
    node._animating = true;
    node.style.scrollBehavior = 'auto';
    (function step() {
      if (node._target === null || node._target === undefined) { node._animating = false; return; }
      var diff = node._target - node.scrollTop;
      if (Math.abs(diff) < 1) {
        node.scrollTop = node._target;
        node._animating = false;
        stopSmooth(node);
        return;
      }
      node.scrollTop += diff * 0.22;
      raf(step);
    })();
  }

  var WHEEL_STEP = 170;

  document.addEventListener('wheel', function (e) {
    if (MF.nav.onWheel && MF.nav.onWheel(e) === true) { e.preventDefault(); return; }
    var dy = e.deltaY;
    var dx = e.deltaX;
    if (e.deltaMode === 1) { dy *= 40; dx *= 40; }
    var strip = e.target.closest && e.target.closest('.strip');
    if (strip && Math.abs(dx) > Math.abs(dy)) {
      strip.scrollLeft += dx;
      if (MF.nav.onStripScroll) MF.nav.onStripScroll(strip);
    } else if (dy) {
      var scroller = wheelTarget(e.target);
      // Each wheel notch moves at least WHEEL_STEP px; bigger deltas (trackpads, fast spins) scale up.
      if (scroller) smoothScrollBy(scroller, (dy > 0 ? 1 : -1) * Math.max(Math.abs(dy) * 1.4, WHEEL_STEP));
    }
    e.preventDefault();
  }, { passive: false });

  // mousemove (not mouseover) so layout shifts under a resting pointer don't steal focus.
  document.addEventListener('mousemove', function (e) {
    if (Math.abs(e.clientX - lastPointer.x) + Math.abs(e.clientY - lastPointer.y) > 2) {
      document.body.classList.add('pointer-mode');
    }
    lastPointer = { x: e.clientX, y: e.clientY };
    // The pointer moving over the on-screen keyboard also moves over the app underneath;
    // don't let that hover steal focus from the field being typed in.
    if (keyboardVisible || editing()) return;
    var el = e.target.closest && e.target.closest('.focusable');
    if (el && el !== current && isVisible(el)) focus(el, { noScroll: true });
  });

  // webOS reports the on-screen keyboard's visibility.
  document.addEventListener('keyboardStateChange', function (e) {
    keyboardVisible = !!(e.detail && e.detail.visibility);
  });

  // A click or tap into a field (Magic Remote) makes it the highlighted element too.
  document.addEventListener('focusin', function (e) {
    var el = e.target;
    if (el && el.classList && el.classList.contains('focusable') && el !== current) focus(el, { noScroll: true });
  });

  // When typing ends (keyboard closed or field left), the field stays highlighted for the D-pad.
  document.addEventListener('focusout', function (e) {
    if (e.target && e.target.tagName === 'INPUT') keyboardVisible = false;
  });

  MF.nav = {
    KEY: KEY,
    focus: focus,
    move: move,
    current: function () { return current; },
    focusFirst: function (selector) {
      var screen = document.querySelector('.screen.active');
      var el = selector ? document.querySelector(selector) : null;
      if (!el || !isVisible(el)) el = screen && Array.prototype.filter.call(screen.querySelectorAll('.focusable'), isVisible)[0];
      if (el) focus(el);
    },
    handler: null,
    onWheel: null,
    onStripScroll: null,
    lastInputAt: 0,
    onFocus: null,
    onInputEnter: null
  };
})();
