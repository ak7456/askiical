// Builds vendor/print-fonts.js: unit fonts as base64 so the outline SVG export can convert characters to paths
// (loaded with a <script> tag, so it also works when index.html is opened straight from disk).
//   node tools/build-print-fonts.mjs "JetBrains Mono=JetBrainsMono-Regular.ttf" "Space Mono=space-mono-latin-400-normal.woff" ...
// A family may be given several times (e.g. latin + latin-ext subsets); they are tried in order.
// opentype.js reads TTF, OTF and WOFF. WOFF2 files are converted to TTF first when the wawoff2 package is installed.
import { readFileSync, writeFileSync } from 'node:fs';

const fonts = {};
for (const arg of process.argv.slice(2)) {
  const at = arg.indexOf('=');
  if (at < 1) { console.error(`skip "${arg}" (expected Family=path)`); continue; }
  const family = arg.slice(0, at), file = arg.slice(at + 1);
  let buf = readFileSync(file);
  if (file.endsWith('.woff2')) {
    const { default: wawoff2 } = await import('wawoff2');
    buf = Buffer.from(await wawoff2.decompress(buf));
  }
  (fonts[family] ||= []).push(buf.toString('base64'));
}
const body = `/* Unit fonts for outline SVG export (SIL Open Font License 1.1, see vendor/LICENSE-fonts.txt), built by tools/build-print-fonts.mjs */\nwindow.AK_PRINT_FONTS=${JSON.stringify(fonts)};\n`;
writeFileSync(new URL('../vendor/print-fonts.js', import.meta.url), body);
console.log(`wrote ${Object.keys(fonts).length} families, ${(body.length / 1024).toFixed(0)} KB`);
