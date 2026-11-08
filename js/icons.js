(function () {
  'use strict';

  // Inline SVG icons. TV fonts often lack symbol characters (they show as empty boxes), so the UI
  // never relies on Unicode symbols for icons.
  var MF = window.MF;

  var FILL = {
    play: '<path d="M8 5v14l11-7z"/>',
    'play-left': '<path d="M16 5v14L5 12z"/>',
    pause: '<path d="M6 5h4v14H6zM14 5h4v14h-4z"/>',
    caret: '<path d="M6.5 9.5h11L12 15.5z"/>',
    star: '<path d="M12 2.5l2.9 6.1 6.6.8-4.9 4.6 1.3 6.6L12 17.3l-5.9 3.3 1.3-6.6-4.9-4.6 6.6-.8z"/>',
    gear: '<path d="M19.14 12.94c.04-.3.06-.61.06-.94 0-.32-.02-.64-.07-.94l2.03-1.58a.49.49 0 0 0 .12-.61l-1.92-3.32a.49.49 0 0 0-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.48.48 0 0 0-.48-.41h-3.84a.47.47 0 0 0-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96a.49.49 0 0 0-.59.22L2.74 8.87a.48.48 0 0 0 .12.61l2.03 1.58c-.05.3-.09.63-.09.94s.02.64.07.94l-2.03 1.58a.49.49 0 0 0-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32a.48.48 0 0 0-.12-.61l-2.01-1.58zM12 15.6a3.6 3.6 0 1 1 0-7.2 3.6 3.6 0 0 1 0 7.2z"/>',
    replay: '<path d="M12 5V1L7 6l5 5V7a6 6 0 1 1-6 6H4a8 8 0 1 0 8-8z"/>',
    forward: '<path d="M12 5V1l5 5-5 5V7a6 6 0 1 0 6 6h2a8 8 0 1 1-8-8z"/>',
    home: '<path d="M12 3.2l9 7.6V21h-6.5v-6h-5v6H3V10.8z"/>',
    film: '<path d="M4 4h16a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1zm1 2v2h2V6zm12 0v2h2V6zM5 10v4h2v-4zm12 0v4h2v-4zM5 16v2h2v-2zm12 0v2h2v-2zM9 6v12h6V6z"/>',
    tv: '<path d="M3 5h18a1 1 0 0 1 1 1v11a1 1 0 0 1-1 1h-7v1.5h3V21H7v-1.5h3V18H3a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm1 2v9h16V7z"/>',
    compass: '<path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm0 2a8 8 0 1 0 0 16 8 8 0 0 0 0-16zm4.2 3.8l-2.6 6.2-6.2 2.6 2.6-6.2zM12 10.6a1.4 1.4 0 1 0 0 2.8 1.4 1.4 0 0 0 0-2.8z"/>',
    bookmark: '<path d="M6 3h12a1 1 0 0 1 1 1v17.2l-7-4.2-7 4.2V4a1 1 0 0 1 1-1z"/>',
    folder: '<path d="M3 6.5A1.5 1.5 0 0 1 4.5 5h4.6c.4 0 .8.2 1.1.5L11.7 7H19.5A1.5 1.5 0 0 1 21 8.5v9a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 17.5z"/>',
    clapper: '<path fill-rule="evenodd" d="M4 6h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1zm5.5 4v6l5.5-3z"/>',
    info: '<path d="M12 2a10 10 0 1 1 0 20 10 10 0 0 1 0-20zm-1 8v7h2v-7zm0-3v2h2V7z"/>',
    cycle: '<path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/>'
  };

  var STROKE = {
    search: '<circle cx="10.5" cy="10.5" r="6.5"/><path d="M15.5 15.5L21 21"/>',
    plus: '<path d="M12 5v14M5 12h14"/>',
    edit: '<path d="M4 20h4L19.5 8.5a2.1 2.1 0 0 0 0-3L18.5 4.5a2.1 2.1 0 0 0-3 0L4 16z"/><path d="M13.5 6.5l4 4"/>',
    user: '<circle cx="12" cy="8" r="4"/><path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8"/>',
    mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
    backspace: '<path d="M9 5h10a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H9l-6-7z"/><path d="M12.5 9.5l5 5M17.5 9.5l-5 5"/>',
    eye: '<path d="M2 12s3.6-7 10-7 10 7 10 7-3.6 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
    'check-circle': '<circle cx="12" cy="12" r="9.5"/><path d="M7.8 12.3l2.8 2.8 5.6-5.8"/>',
    close: '<path d="M6 6l12 12M18 6L6 18"/>',
    check: '<path d="M5 12.5l4.5 4.5L19 7.5"/>',
    'chevron-left': '<path d="M15 4.5L7.5 12l7.5 7.5"/>',
    'chevron-right': '<path d="M9 4.5l7.5 7.5L9 19.5"/>'
  };

  function icon(name, cls) {
    var stroke = !!STROKE[name];
    var body = stroke ? STROKE[name] : FILL[name];
    if (!body) return '';
    return '<svg class="ico ico-' + name + (stroke ? ' ico-stroke' : '') + (cls ? ' ' + cls : '') +
      '" viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + body + '</svg>';
  }

  function iconEl(name, cls) {
    var wrap = document.createElement('span');
    wrap.innerHTML = icon(name, cls);
    return wrap.firstChild;
  }

  // Replaces <span data-icon="name"></span> placeholders in static markup.
  function hydrate(root) {
    Array.prototype.forEach.call((root || document).querySelectorAll('[data-icon]'), function (node) {
      node.outerHTML = icon(node.getAttribute('data-icon'), node.getAttribute('data-icon-class') || '');
    });
  }

  MF.icon = icon;
  MF.iconEl = iconEl;
  MF.hydrateIcons = hydrate;
})();
