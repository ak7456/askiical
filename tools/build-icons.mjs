// Builds vendor/lucide-icons.js from the lucide-static npm package.
//   npm pack lucide-static && tar xzf lucide-static-*.tgz
//   node tools/build-icons.mjs ./package
// Output: window.AK_ICONS = { "<name>": ["tag tag …", ["d", …]] } in Lucide's 24×24 space.
// A d string ending in Z is a closed shape (fillable); anything else is an open line.
import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';

const pkg = process.argv[2];
if (!pkg) { console.error('usage: node tools/build-icons.mjs <path-to-lucide-static-package>'); process.exit(1); }
const nodes = JSON.parse(readFileSync(join(pkg, 'icon-nodes.json'), 'utf8'));
const tags = JSON.parse(readFileSync(join(pkg, 'tags.json'), 'utf8'));
const version = JSON.parse(readFileSync(join(pkg, 'package.json'), 'utf8')).version;

const n = (v) => +(+v || 0).toFixed(3);
const ellipse = (cx, cy, rx, ry) => `M${n(cx - rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx + rx)} ${n(cy)}A${n(rx)} ${n(ry)} 0 1 0 ${n(cx - rx)} ${n(cy)}Z`;
function rect(a) {
  const x = n(a.x), y = n(a.y), w = n(a.width), h = n(a.height);
  const rx = Math.min(n(a.rx ?? a.ry), w / 2), ry = Math.min(n(a.ry ?? a.rx), h / 2);
  if (!rx) return `M${x} ${y}H${n(x + w)}V${n(y + h)}H${x}Z`;
  return `M${n(x + rx)} ${y}H${n(x + w - rx)}A${rx} ${ry} 0 0 1 ${n(x + w)} ${n(y + ry)}V${n(y + h - ry)}A${rx} ${ry} 0 0 1 ${n(x + w - rx)} ${n(y + h)}` +
    `H${n(x + rx)}A${rx} ${ry} 0 0 1 ${x} ${n(y + h - ry)}V${n(y + ry)}A${rx} ${ry} 0 0 1 ${n(x + rx)} ${y}Z`;
}
const pts = (s) => { const v = s.trim().split(/[\s,]+/).map(Number); const o = []; for (let i = 0; i + 1 < v.length; i += 2) o.push(`${n(v[i])} ${n(v[i + 1])}`); return o; };

function toD([tag, a]) {
  switch (tag) {
    case 'path': return a.d.trim();
    case 'circle': return ellipse(+a.cx, +a.cy, +a.r, +a.r);
    case 'ellipse': return ellipse(+a.cx, +a.cy, +a.rx, +a.ry);
    case 'rect': return rect(a);
    case 'line': return `M${n(a.x1)} ${n(a.y1)}L${n(a.x2)} ${n(a.y2)}`;
    case 'polyline': return 'M' + pts(a.points).join('L');
    case 'polygon': return 'M' + pts(a.points).join('L') + 'Z';
  }
  return null;
}

const out = {};
for (const [name, list] of Object.entries(nodes)) {
  out[name] = [(tags[name] || []).join(' '), list.map(toD).filter(Boolean)];
}
const body = `/* Lucide icons v${version} (ISC license, see vendor/LICENSE-lucide.txt), converted by tools/build-icons.mjs */\nwindow.AK_ICONS=${JSON.stringify(out)};\n`;
writeFileSync(new URL('../vendor/lucide-icons.js', import.meta.url), body);
copyFileSync(join(pkg, 'LICENSE'), new URL('../vendor/LICENSE-lucide.txt', import.meta.url));
console.log(`wrote ${Object.keys(out).length} icons, ${(body.length / 1024).toFixed(0)} KB`);
