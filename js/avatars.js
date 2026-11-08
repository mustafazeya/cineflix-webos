(function () {
  'use strict';

  // Profile avatars: 16 original flat characters on a 120x120 canvas, in two groups. Each has a two-colour background and a drawing.
  // The drawings are plain SVG, so the iPhone app uses the same artwork (see tools/export-avatars.js).

  var MF = window.MF = window.MF || {};

  var DARK = '#1f1b24';

  function a(id, name, group, bg, art) {
    return { id: id, name: name, group: group, bg: bg, art: art };
  }

  var LIST = [
    // ---- Animals ----
    a('fox', 'Fox', 'Animals', ['#4b5bd6', '#7b8cff'],
      '<path d="M28 58 L33 22 L55 38 Q60 37 65 38 L87 22 L92 58 Q92 94 60 100 Q28 94 28 58Z" fill="#f28c38"/>' +
      '<path d="M36 34 L48 42 L38 52Z" fill="#6b2f12"/><path d="M84 34 L72 42 L82 52Z" fill="#6b2f12"/>' +
      '<path d="M40 72 Q50 66 60 74 Q70 66 80 72 Q74 96 60 98 Q46 96 40 72Z" fill="#fff3e4"/>' +
      '<ellipse cx="60" cy="78" rx="5.5" ry="4.2" fill="#2a1710"/>' +
      '<circle cx="46" cy="62" r="4.6" fill="#2a1710"/><circle cx="74" cy="62" r="4.6" fill="#2a1710"/>' +
      '<path d="M54 86 Q60 91 66 86" stroke="#2a1710" stroke-width="2.6" fill="none" stroke-linecap="round"/>'),

    a('cat', 'Cat', 'Animals', ['#ff9a8b', '#ff6a88'],
      '<path d="M30 62 L30 28 L50 42 Q60 39 70 42 L90 28 L90 62 Q90 98 60 98 Q30 98 30 62Z" fill="#9aa5b8"/>' +
      '<path d="M35 38 L45 45 L35 54Z" fill="#f4b8c4"/><path d="M85 38 L75 45 L85 54Z" fill="#f4b8c4"/>' +
      '<ellipse cx="46" cy="64" rx="5" ry="6" fill="#1e2430"/><ellipse cx="74" cy="64" rx="5" ry="6" fill="#1e2430"/>' +
      '<circle cx="47.5" cy="62" r="1.8" fill="#fff"/><circle cx="75.5" cy="62" r="1.8" fill="#fff"/>' +
      '<path d="M56 76 L64 76 L60 81Z" fill="#f08fa4"/>' +
      '<path d="M60 81 Q55 88 50 85 M60 81 Q65 88 70 85" stroke="#1e2430" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
      '<path d="M22 74 L41 77 M22 85 L41 82 M98 74 L79 77 M98 85 L79 82" stroke="#eef1f7" stroke-width="2" stroke-linecap="round"/>'),

    a('panda', 'Panda', 'Animals', ['#2ecc71', '#16a085'],
      '<circle cx="35" cy="34" r="12" fill="#1c1f26"/><circle cx="85" cy="34" r="12" fill="#1c1f26"/>' +
      '<circle cx="60" cy="64" r="34" fill="#fbfbfd"/>' +
      '<ellipse cx="46" cy="62" rx="9" ry="11" fill="#1c1f26" transform="rotate(20 46 62)"/>' +
      '<ellipse cx="74" cy="62" rx="9" ry="11" fill="#1c1f26" transform="rotate(-20 74 62)"/>' +
      '<circle cx="47" cy="61" r="3.2" fill="#fff"/><circle cx="73" cy="61" r="3.2" fill="#fff"/>' +
      '<ellipse cx="60" cy="76" rx="6" ry="4.4" fill="#1c1f26"/>' +
      '<path d="M53 84 Q60 90 67 84" stroke="#1c1f26" stroke-width="2.6" fill="none" stroke-linecap="round"/>'),

    a('owl', 'Owl', 'Animals', ['#a18cd1', '#cfd9ff'],
      '<path d="M26 46 L34 22 L50 36 Q60 33 70 36 L86 22 L94 46 Q96 98 60 100 Q24 98 26 46Z" fill="#8a5a3c"/>' +
      '<ellipse cx="60" cy="86" rx="22" ry="14" fill="#e9c9a3"/>' +
      '<circle cx="45" cy="56" r="15" fill="#fdf3e0"/><circle cx="75" cy="56" r="15" fill="#fdf3e0"/>' +
      '<circle cx="45" cy="57" r="7" fill="#2b1b12"/><circle cx="75" cy="57" r="7" fill="#2b1b12"/>' +
      '<circle cx="47" cy="55" r="2.4" fill="#fff"/><circle cx="77" cy="55" r="2.4" fill="#fff"/>' +
      '<path d="M54 66 L66 66 L60 77Z" fill="#f3a712"/>'),

    a('bear', 'Bear', 'Animals', ['#2f80ed', '#56ccf2'],
      '<circle cx="34" cy="36" r="13" fill="#7a4a2b"/><circle cx="86" cy="36" r="13" fill="#7a4a2b"/>' +
      '<circle cx="34" cy="36" r="6.5" fill="#d9a074"/><circle cx="86" cy="36" r="6.5" fill="#d9a074"/>' +
      '<circle cx="60" cy="64" r="34" fill="#8f5a37"/>' +
      '<ellipse cx="60" cy="78" rx="16" ry="13" fill="#e2b88f"/>' +
      '<ellipse cx="60" cy="73" rx="6" ry="4.4" fill="#2a1a10"/>' +
      '<path d="M60 77 V82 M52 84 Q60 90 68 84" stroke="#2a1a10" stroke-width="2.4" fill="none" stroke-linecap="round"/>' +
      '<circle cx="46" cy="58" r="4.4" fill="#2a1a10"/><circle cx="74" cy="58" r="4.4" fill="#2a1a10"/>'),

    a('rabbit', 'Rabbit', 'Animals', ['#b24592', '#f15f79'],
      '<ellipse cx="44" cy="30" rx="10" ry="26" fill="#fdfbff" transform="rotate(-8 44 30)"/>' +
      '<ellipse cx="76" cy="30" rx="10" ry="26" fill="#fdfbff" transform="rotate(8 76 30)"/>' +
      '<ellipse cx="44" cy="32" rx="5" ry="18" fill="#ffb8d1" transform="rotate(-8 44 32)"/>' +
      '<ellipse cx="76" cy="32" rx="5" ry="18" fill="#ffb8d1" transform="rotate(8 76 32)"/>' +
      '<circle cx="60" cy="74" r="28" fill="#fdfbff"/>' +
      '<circle cx="49" cy="70" r="4.2" fill="#3a2a40"/><circle cx="71" cy="70" r="4.2" fill="#3a2a40"/>' +
      '<path d="M56 79 L64 79 L60 84Z" fill="#ff8fb0"/>' +
      '<path d="M60 84 Q55 90 51 87 M60 84 Q65 90 69 87" stroke="#3a2a40" stroke-width="2.2" fill="none" stroke-linecap="round"/>' +
      '<circle cx="40" cy="80" r="5" fill="#ffc6da" opacity=".7"/><circle cx="80" cy="80" r="5" fill="#ffc6da" opacity=".7"/>'),

    a('penguin', 'Penguin', 'Animals', ['#f9d423', '#ff4e50'],
      '<ellipse cx="60" cy="64" rx="34" ry="38" fill="#233042"/>' +
      '<path d="M60 60 Q86 62 82 82 Q78 100 60 100 Q42 100 38 82 Q34 62 60 60Z" fill="#fff"/>' +
      '<circle cx="48" cy="48" r="6.2" fill="#fff"/><circle cx="72" cy="48" r="6.2" fill="#fff"/>' +
      '<circle cx="49" cy="49" r="3" fill="#10161f"/><circle cx="71" cy="49" r="3" fill="#10161f"/>' +
      '<path d="M52 58 L68 58 L60 69Z" fill="#ffa62b"/>' +
      '<ellipse cx="46" cy="104" rx="10" ry="4" fill="#ffa62b"/><ellipse cx="74" cy="104" rx="10" ry="4" fill="#ffa62b"/>'),

    a('dino', 'Dino', 'Animals', ['#fc5c7d', '#6a82fb'],
      '<rect x="28" y="34" width="64" height="62" rx="26" fill="#43c59e"/>' +
      '<path d="M42 38 L49 20 L58 36Z M55 34 L64 14 L73 34Z M69 36 L77 20 L84 40Z" fill="#2b9f7c"/>' +
      '<circle cx="46" cy="62" r="6.4" fill="#fff"/><circle cx="74" cy="62" r="6.4" fill="#fff"/>' +
      '<circle cx="47" cy="63" r="3.2" fill="#13352b"/><circle cx="73" cy="63" r="3.2" fill="#13352b"/>' +
      '<circle cx="54" cy="76" r="2.2" fill="#13352b"/><circle cx="66" cy="76" r="2.2" fill="#13352b"/>' +
      '<path d="M44 83 Q60 96 76 83" stroke="#13352b" stroke-width="2.8" fill="none" stroke-linecap="round"/>' +
      '<circle cx="38" cy="80" r="4" fill="#2b9f7c" opacity=".55"/><circle cx="82" cy="80" r="4" fill="#2b9f7c" opacity=".55"/>'),

    // ---- Characters ----
    a('robot', 'Robot', 'Characters', ['#1e3c72', '#2a5298'],
      '<line x1="60" y1="20" x2="60" y2="34" stroke="#c9d3df" stroke-width="4" stroke-linecap="round"/><circle cx="60" cy="17" r="5.5" fill="#ff5d73"/>' +
      '<rect x="22" y="56" width="8" height="20" rx="4" fill="#9fb0c3"/><rect x="90" y="56" width="8" height="20" rx="4" fill="#9fb0c3"/>' +
      '<rect x="30" y="34" width="60" height="62" rx="16" fill="#e4ebf3"/>' +
      '<rect x="38" y="46" width="44" height="26" rx="10" fill="#1f2a44"/>' +
      '<circle cx="50" cy="59" r="6" fill="#4cf0ff"/><circle cx="70" cy="59" r="6" fill="#4cf0ff"/>' +
      '<rect x="44" y="80" width="32" height="9" rx="4.5" fill="#1f2a44"/>' +
      '<path d="M52 80 V89 M60 80 V89 M68 80 V89" stroke="#e4ebf3" stroke-width="2"/>'),

    a('astronaut', 'Astronaut', 'Characters', ['#ff9966', '#ff5e62'],
      '<circle cx="60" cy="62" r="36" fill="#f3f5fa"/>' +
      '<rect x="30" y="46" width="60" height="40" rx="20" fill="#1d2440"/>' +
      '<path d="M39 58 Q46 52 58 54" stroke="#7d92ff" stroke-width="4" fill="none" stroke-linecap="round" opacity=".85"/>' +
      '<circle cx="76" cy="72" r="3" fill="#7d92ff" opacity=".6"/>' +
      '<rect x="50" y="94" width="20" height="9" rx="3.5" fill="#cfd5e3"/>' +
      '<circle cx="84" cy="36" r="4.5" fill="#ff6b6b"/>'),

    a('alien', 'Alien', 'Characters', ['#4776e6', '#8e54e9'],
      '<path d="M60 22 Q96 24 96 62 Q96 96 60 100 Q24 96 24 62 Q24 24 60 22Z" fill="#7be495"/>' +
      '<path d="M60 22 L60 13" stroke="#5fc77d" stroke-width="3" stroke-linecap="round"/><circle cx="60" cy="11" r="4.5" fill="#ffe66d"/>' +
      '<ellipse cx="44" cy="60" rx="11" ry="15" fill="#10241a" transform="rotate(18 44 60)"/>' +
      '<ellipse cx="76" cy="60" rx="11" ry="15" fill="#10241a" transform="rotate(-18 76 60)"/>' +
      '<circle cx="47" cy="55" r="3" fill="#d6ffe3"/><circle cx="73" cy="55" r="3" fill="#d6ffe3"/>' +
      '<path d="M52 85 Q60 91 68 85" stroke="#10241a" stroke-width="2.6" fill="none" stroke-linecap="round"/>'),

    a('ghost', 'Ghost', 'Characters', ['#f7971e', '#ffd200'],
      '<path d="M28 102 L28 56 Q28 24 60 24 Q92 24 92 56 L92 102 L82 94 L71 102 L60 94 L49 102 L38 94Z" fill="#fff"/>' +
      '<ellipse cx="48" cy="58" rx="5.5" ry="7.5" fill="#2b2457"/><ellipse cx="72" cy="58" rx="5.5" ry="7.5" fill="#2b2457"/>' +
      '<ellipse cx="40" cy="72" rx="6" ry="4" fill="#ffb3c7" opacity=".85"/><ellipse cx="80" cy="72" rx="6" ry="4" fill="#ffb3c7" opacity=".85"/>' +
      '<ellipse cx="60" cy="75" rx="4.5" ry="5.5" fill="#2b2457"/>'),

    a('ninja', 'Ninja', 'Characters', ['#f5af19', '#f12711'],
      '<circle cx="60" cy="62" r="36" fill="#1f2433"/>' +
      '<rect x="28" y="52" width="64" height="26" rx="13" fill="#f2c9a0"/>' +
      '<circle cx="47" cy="65" r="4.6" fill="#1b1b1b"/><circle cx="73" cy="65" r="4.6" fill="#1b1b1b"/>' +
      '<rect x="24" y="40" width="72" height="11" rx="5.5" fill="#e63946"/>' +
      '<path d="M92 42 L110 32 L105 49Z" fill="#e63946"/><path d="M92 47 L108 58 L96 55Z" fill="#c1121f"/>'),

    a('wizard', 'Wizard', 'Characters', ['#0f2027', '#2c5364'],
      '<path d="M60 6 L90 58 L30 58Z" fill="#6c5ce7"/>' +
      '<ellipse cx="60" cy="59" rx="38" ry="7" fill="#4d3fc2"/>' +
      '<circle cx="60" cy="80" r="24" fill="#f6d2b0"/>' +
      '<path d="M36 80 Q38 108 60 112 Q82 108 84 80 Q74 94 60 92 Q46 94 36 80Z" fill="#f4f4f8"/>' +
      '<circle cx="50" cy="76" r="3.6" fill="#2a2140"/><circle cx="70" cy="76" r="3.6" fill="#2a2140"/>' +
      '<path d="M60 26 l2.6 5.4 5.9.8-4.3 4.1 1 5.8-5.2-2.8-5.2 2.8 1-5.8-4.3-4.1 5.9-.8z" fill="#ffd966"/>'),

    a('smiley', 'Cool', 'Characters', ['#8360c3', '#2ebf91'],
      '<circle cx="60" cy="62" r="38" fill="#ffd23f"/>' +
      '<rect x="31" y="50" width="25" height="21" rx="9" fill="' + DARK + '"/><rect x="64" y="50" width="25" height="21" rx="9" fill="' + DARK + '"/>' +
      '<rect x="54" y="55" width="12" height="4.5" fill="' + DARK + '"/>' +
      '<path d="M35 55 L44 55 M68 55 L77 55" stroke="#fff" stroke-width="2.4" stroke-linecap="round" opacity=".45"/>' +
      '<path d="M43 86 Q60 100 77 86" stroke="' + DARK + '" stroke-width="3.6" fill="none" stroke-linecap="round"/>'),

    a('planet', 'Planet', 'Characters', ['#232526', '#414345'],
      '<circle cx="60" cy="60" r="27" fill="#ff8a5b"/>' +
      '<path d="M35 55 Q60 49 85 55" stroke="#ffb690" stroke-width="5" fill="none" opacity=".85"/>' +
      '<path d="M34 68 Q60 75 86 68" stroke="#d9633a" stroke-width="5" fill="none" opacity=".8"/>' +
      '<ellipse cx="60" cy="62" rx="46" ry="12" fill="none" stroke="#ffe7a8" stroke-width="5" transform="rotate(-18 60 62)"/>' +
      '<circle cx="23" cy="26" r="2.2" fill="#fff"/><circle cx="97" cy="22" r="1.8" fill="#fff"/><circle cx="99" cy="98" r="2.4" fill="#fff"/><circle cx="21" cy="94" r="1.8" fill="#fff"/><circle cx="72" cy="14" r="1.5" fill="#fff"/>')
  ];

  var BY_ID = {};
  LIST.forEach(function (x) { BY_ID[x.id] = x; });

  function svg(id) {
    var def = BY_ID[id];
    return def ? '<svg viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' + def.art + '</svg>' : '';
  }

  function background(id, fallbackColor) {
    var def = BY_ID[id];
    if (def) return 'linear-gradient(145deg, ' + def.bg[0] + ', ' + def.bg[1] + ')';
    return fallbackColor || '#3a3a3a';
  }

  // Fills a box with an avatar. Unknown ids (for example from a newer app version) fall back to the profile colour and initial.
  function paint(box, id, fallbackColor, name) {
    box.style.background = background(id, fallbackColor);
    if (BY_ID[id]) {
      box.innerHTML = svg(id);
      box.classList.remove('avatar-initial');
    } else {
      box.textContent = String(name || '?').trim().charAt(0).toUpperCase() || '?';
      box.classList.add('avatar-initial');
    }
  }

  MF.avatars = {
    list: LIST,
    groups: ['Animals', 'Characters'],
    has: function (id) { return !!BY_ID[id]; },
    byId: function (id) { return BY_ID[id] || null; },
    svg: svg,
    background: background,
    paint: paint,
    // The avatar a new profile should get: the first one nobody uses yet.
    nextFree: function (used) {
      for (var i = 0; i < LIST.length; i++) if (used.indexOf(LIST[i].id) < 0) return LIST[i].id;
      return LIST[0].id;
    }
  };
})();
