#!/usr/bin/env node
// Exports the avatar artwork in js/avatars.js as SVG files, so the iPhone app can use exactly the same pictures.
//   node tools/export-avatars.js <output-dir>
// For each avatar it writes <id>.svg (the character on a transparent background) and avatars.json (ids, names, groups, background colours).
const fs = require('fs');
const path = require('path');

const out = process.argv[2];
if (!out) { console.error('Usage: node tools/export-avatars.js <output-dir>'); process.exit(1); }

const window = {};
new Function('window', fs.readFileSync(path.join(__dirname, '..', 'js', 'avatars.js'), 'utf8'))(window);
const list = window.MF.avatars.list;

fs.mkdirSync(out, { recursive: true });
list.forEach((a) => {
  const svg = '<svg viewBox="0 0 120 120" width="120" height="120" xmlns="http://www.w3.org/2000/svg">' + a.art + '</svg>\n';
  fs.writeFileSync(path.join(out, 'avatar-' + a.id + '.svg'), svg);
});
fs.writeFileSync(path.join(out, 'avatars.json'), JSON.stringify(list.map((a) => ({ id: a.id, name: a.name, group: a.group, bg: a.bg })), null, 2) + '\n');
console.log('Exported ' + list.length + ' avatars to ' + out);
