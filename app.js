'use strict';
/* app.js — letter → cell coverage → tone field → unit ramp → canvas / SVG / TXT.

   Pipeline
   1. raster   : draw the letter on an offscreen canvas (S× supersampled per cell) and average alpha per cell.
   2. tone     : shade the coverage (distance / gradient / radial / noise), add halo, edge, gamma, contrast, grain.
   3. ramp     : every enabled unit (character or custom vector glyph) gets its measured ink density;
                 auto mode picks the unit whose normalised density is closest to the cell tone and, within
                 a "mix" tolerance, picks randomly among near-equal units — that is how custom glyphs blend in.
   4. paint    : stamp units (or knock them out of filled cells) on canvas; the same op list feeds SVG/TXT. */

const $ = (s, r = document) => r.querySelector(s);

const LETTER_FONTS = [
  'Bodoni Moda', 'Playfair Display', 'Instrument Serif', 'UnifrakturCook', 'Archivo Black', 'Major Mono Display',
  'Noto Serif KR', 'Nanum Myeongjo', 'Gowun Batang', 'Black Han Sans', 'Do Hyeon',
];
const UNIT_FONTS = ['JetBrains Mono', 'IBM Plex Mono', 'Space Mono', 'VT323', 'Major Mono Display'];

const CHARSETS = [
  ['표준', ' .:-=+*#%@'],
  ['긴 램프', " .'`^\",:;Il!i><~+_-?][}{1)(|/tfjrxnuvczXYUJCLQ0OZmwqpdbkhao*#MW&8%B@$"],
  ['블라썸', ' .:+?$%S'],
  ['스파스', ' .-/%HSOLT*+'],
  ['이진', ' 01'],
  ['블록', ' ░▒▓█'],
  ['점', ' ·•●'],
  ['한글', ' ㆍㅡㄱㄴㄷㅁㅂㅎ'],
];

const SHAPE_DEFAULTS = {
  char: 'A', font: 'Bodoni Moda', weight: 700, italic: false, letterScale: 1, offsetX: 0, offsetY: 0,
  fitMode: 'font', rowsFont: 60, padCells: 1, padRows: 2,
  cols: 72, ratio: '4:5', cellAspect: 1.5,
  cellPt: 6, dpi: '300',
  shade: 'distance', shadeDepth: 0.6, angle: 90, noiseScale: 7, blur: 3, halo: 0.15, edge: 0,
  gamma: 1, contrast: 0, threshold: 0.08, grain: 0.08, invert: false,
  rampMode: 'auto', mixTol: 0.08, variation: 0.06, sizeMode: 'fixed', unitScale: 1, seed: 7,
  animate: false, flicker: 0.12, fps: 12,
  renderMode: 'stamp', fg: '#ecebe4', bg: '#0b0b0a',
  themeOn: false, palette: ['#ff48b0', '#0078bf', '#ffe800', '#00a95c'], colorMode: 'noise', colorBlend: 'step',
  colorScope: 'all', colorScale: 6, colorAngle: 120, colorSpread: 0.12, colorSeed: 3,
  grid: false, gridColor: '#ffffff', gridAlpha: 0.08, bgUnit: '', bgAlpha: 0.22,
  unitFont: 'JetBrains Mono',
};

const PRESETS = [
  { id: 'signal', name: 'Signal', sw: ['#050505', '#e9e9e9'], units: ' .,:;i1tfLCG08@', glyphs: ['b-cross', 'b-box'],
    set: { char: 'S', font: 'Bodoni Moda', weight: 800, italic: false, cols: 96, ratio: '4:5', cellAspect: 1.7, shade: 'noise', shadeDepth: 0.55,
      noiseScale: 6, blur: 3, halo: 0.3, edge: 0.15, gamma: 1, contrast: 0.2, threshold: 0.06, grain: 0.12, mixTol: 0.07, variation: 0.08,
      sizeMode: 'fixed', unitScale: 1, renderMode: 'stamp', fg: '#ececec', bg: '#050505', grid: false,
      bgUnitGlyph: 'b-dot', bgAlpha: 0.16, unitFont: 'JetBrains Mono' } },
  { id: 'blossom', name: 'Blossom', sw: ['#dccfc8', '#2b2626'], units: ' :.+?$%S', glyphs: ['b-petal'],
    set: { char: '꽃', font: 'Nanum Myeongjo', weight: 800, italic: false, cols: 58, ratio: '3:4', cellAspect: 1.45, shade: 'distance', shadeDepth: 0.6,
      blur: 1, halo: 0, edge: 0.1, gamma: 1, contrast: 0.1, threshold: 0.12, grain: 0.05, mixTol: 0.1, variation: 0.05,
      sizeMode: 'fixed', unitScale: 1, renderMode: 'stamp', fg: '#2b2626', bg: '#dccfc8', grid: false,
      bgUnitGlyph: '', unitFont: 'IBM Plex Mono' } },
  { id: 'blueprint', name: 'Blueprint', sw: ['#1638d9', '#f2f2f2'], units: ' ', glyphs: ['b-box', 'b-cross', 'b-boxdot', 'b-dot', 'b-check', 'b-solid'],
    set: { char: 'R', font: 'Archivo Black', weight: 400, italic: false, cols: 54, ratio: '3:4', cellAspect: 1, shade: 'noise', shadeDepth: 0.85,
      noiseScale: 5, blur: 2, halo: 0, edge: 0.2, gamma: 1, contrast: 0.3, threshold: 0.3, grain: 0.05, mixTol: 0.1, variation: 0.1,
      sizeMode: 'fixed', unitScale: 0.82, renderMode: 'knockout', fg: '#f2f2f2', bg: '#1638d9',
      grid: true, gridColor: '#8aa0ff', gridAlpha: 0.35, bgUnitGlyph: '', unitFont: 'JetBrains Mono' } },
  { id: 'halftone', name: 'Halftone', sw: ['#e8e6e6', '#e2392f'], units: '', glyphs: ['b-dot'],
    set: { char: 'H', font: 'Playfair Display', weight: 900, italic: true, cols: 46, ratio: '1:1', cellAspect: 1, shade: 'gradient', shadeDepth: 0.85,
      angle: 200, blur: 2, halo: 0.2, edge: 0, gamma: 0.9, contrast: 0, threshold: 0.05, grain: 0.04, mixTol: 0, variation: 0,
      sizeMode: 'tone', unitScale: 1.05, renderMode: 'stamp', fg: '#e2392f', bg: '#e8e6e6', grid: false,
      bgUnitGlyph: '', unitFont: 'JetBrains Mono' } },
  { id: 'riso', name: 'Riso', sw: ['#f3eee4', '#ff48b0'], units: ' .:+*#%@', glyphs: ['b-dot', 'b-box', 'b-spark'],
    set: { char: 'G', font: 'Archivo Black', weight: 400, italic: false, cols: 70, ratio: '4:5', cellAspect: 1.3, shade: 'distance', shadeDepth: 0.5,
      blur: 3, halo: 0.18, edge: 0.1, gamma: 1, contrast: 0.15, threshold: 0.07, grain: 0.08, mixTol: 0.1, variation: 0.06,
      sizeMode: 'fixed', unitScale: 1, renderMode: 'stamp', fg: '#1d1d1b', bg: '#f3eee4', grid: false,
      themeOn: true, palette: ['#ff48b0', '#0078bf', '#ffe800', '#00a95c'], colorMode: 'noise', colorBlend: 'step', colorScope: 'all',
      colorScale: 5, colorSpread: 0.14, colorSeed: 11, bgUnitGlyph: '', unitFont: 'IBM Plex Mono' } },
  { id: 'sparse', name: 'Organic', sw: ['#000000', '#cfcfcf'], units: ' .-/%HSOLT*+', glyphs: ['b-slash', 'b-spark'],
    set: { char: 'W', font: 'UnifrakturCook', weight: 700, italic: false, cols: 120, ratio: '2:3', cellAspect: 1.7, shade: 'noise', shadeDepth: 0.9,
      noiseScale: 9, blur: 2, halo: 0.1, edge: 0.45, gamma: 1.2, contrast: 0.4, threshold: 0.22, grain: 0.3, mixTol: 0.08, variation: 0.15,
      sizeMode: 'fixed', unitScale: 1, renderMode: 'stamp', fg: '#cfcfcf', bg: '#000000', grid: false,
      bgUnitGlyph: '', unitFont: 'Space Mono' } },
];

/* ---------- state */
const STORE_KEY = 'askiical:v1';
let state = makeDefaultState();

function makeDefaultState() {
  const s = { ...SHAPE_DEFAULTS, glyphs: AK.BUILTIN_GLYPHS.map(AK.normGlyph), units: [] };
  s.units = [...' .:-=+*#%@'].map((c) => ({ id: AK.uid(), kind: 'char', value: c, on: true }));
  s.units.push({ id: AK.uid(), kind: 'glyph', glyph: 'b-box', on: true }, { id: AK.uid(), kind: 'glyph', glyph: 'b-cross', on: true });
  return s;
}

function loadStored() {
  try {
    const raw = localStorage.getItem(STORE_KEY);
    if (raw) applyProject(JSON.parse(raw), true);
  } catch (e) { /* storage unavailable or corrupt: keep defaults */ }
}
let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(projectJSON())); } catch (e) { /* ignore */ }
  }, 400);
}
function projectJSON() {
  const out = { app: 'askiical', version: 1 };
  for (const k of Object.keys(SHAPE_DEFAULTS)) out[k] = state[k];
  out.units = state.units;
  out.glyphs = state.glyphs;
  return out;
}
function applyProject(p, quiet) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.units)) throw new Error('askiical 프로젝트 JSON이 아닙니다.');
  const s = { ...SHAPE_DEFAULTS };
  for (const k of Object.keys(SHAPE_DEFAULTS)) if (k in p && typeof p[k] === typeof SHAPE_DEFAULTS[k]) s[k] = p[k];
  s.glyphs = (Array.isArray(p.glyphs) ? p.glyphs : []).map(AK.normGlyph);
  const ids = new Set(s.glyphs.map((g) => g.id));
  s.units = p.units
    .filter((u) => (u.kind === 'char' && typeof u.value === 'string' && u.value.length) || (u.kind === 'glyph' && ids.has(u.glyph)))
    .map((u) => ({ id: u.id || AK.uid(), kind: u.kind, value: u.value, glyph: u.glyph, on: u.on !== false }));
  if (s.bgUnit && !s.units.some((u) => u.id === s.bgUnit)) s.bgUnit = '';
  s.palette = (Array.isArray(s.palette) ? s.palette : []).filter(Theme.isHex).slice(0, 8);
  if (!s.palette.length) s.palette = SHAPE_DEFAULTS.palette.slice();
  state = s;
  if (!quiet) afterStructuralChange();
}

/* ---------- derived helpers */
const glyphById = (id) => state.glyphs.find((g) => g.id === id);
const compiledCache = new Map(); // glyph id → { v, cg }
function compiled(g) {
  const c = compiledCache.get(g.id);
  if (c && c.v === g.v) return c.cg;
  const cg = AK.compileGlyph(g);
  compiledCache.set(g.id, { v: g.v, cg });
  return cg;
}

/* Grid layout.
   box  — the letter's ink box is fitted into a fixed artboard (cols × ratio); every letter gets its own type size.
   font — type size comes from the font's ascent + descent filling the artboard height (rows), the baseline sits
          on the same row for every letter, and the column count follows the letter's advance width.
          Letters made with the same font and settings therefore line up when placed side by side.
   Lengths below are in cell widths (a cell is 1 wide and cellAspect tall). */
const lctx = document.createElement('canvas').getContext('2d');
const VREF = 'HÅÉbdfhklgjpqyÿ()[]{}|';
let layoutCache = { key: '', v: null };
let fontEpoch = 0; // bumps when a web font finishes loading, so metrics are re-measured
function letterLayout() {
  const key = [state.fitMode, state.char, state.font, state.weight, state.italic, state.letterScale, state.rowsFont,
    state.padCells, state.padRows, state.cellAspect, state.cols, state.ratio, fontEpoch].join('|');
  if (layoutCache.key === key) return layoutCache.v;
  let v;
  if (state.fitMode !== 'font') {
    const [rw, rh] = state.ratio.split(':').map(Number);
    v = { mode: 'box', cols: state.cols, rows: Math.max(4, Math.round((state.cols * rh) / rw / state.cellAspect)) };
  } else {
    const rows = state.rowsFont, H = rows * state.cellAspect;
    const pad = Math.min(state.padRows, Math.floor((rows - 4) / 2)) * state.cellAspect;
    lctx.font = letterFontSpec(1000); // large size: canvas metrics come back rounded to whole pixels
    const m = lctx.measureText(state.char || ' ');
    // vertical box: the larger of the font's declared ascent/descent and the ink of tall/deep reference glyphs.
    // It never depends on the current letter, so every letter of the font gets the same size and baseline.
    const ref = lctx.measureText(VREF);
    const A = Math.max(m.fontBoundingBoxAscent ?? 800, ref.actualBoundingBoxAscent) / 1000;
    const D = Math.max(m.fontBoundingBoxDescent ?? 200, ref.actualBoundingBoxDescent) / 1000;
    const Hbox = H - 2 * pad;
    const f = (Hbox * state.letterScale) / (A + D); // type size in cell widths
    const left = Math.min(0, -m.actualBoundingBoxLeft / 1000), right = Math.max(m.width / 1000, m.actualBoundingBoxRight / 1000);
    const span = (right - left) * f;
    const cols = Math.max(4, Math.ceil(span - 1e-6) + 2 * state.padCells);
    // above size 1 the font box outgrows the base height: add rows so it fits with its margins.
    // This depends only on the font and settings, so all letters made with them still share height and baseline.
    const rowsFit = Math.max(rows, Math.ceil((Hbox * state.letterScale + 2 * pad) / state.cellAspect - 1e-6));
    const H2 = rowsFit * state.cellAspect;
    const baseline = pad + (H2 - 2 * pad - (A + D) * f) / 2 + A * f;
    const offY = state.offsetY * H; // vertical offset is measured against the base height, so extra rows don't move it
    // a letter whose ink would pass the bottom margin gets extra rows below; the top edge and baseline row stay put
    const inkBottom = baseline + offY + (m.actualBoundingBoxDescent / 1000) * f;
    const below = Math.max(pad, state.cellAspect); // keep at least one empty row under the descender
    const extraRows = Math.max(0, Math.ceil((inkBottom + below - H2) / state.cellAspect - 1e-6));
    v = { mode: 'font', cols, rows: rowsFit + extraRows, sizeRows: rowsFit - rows, extraRows, f,
      originX: (cols - span) / 2 - left * f, baseline, offY };
  }
  layoutCache = { key, v };
  return v;
}
function dims() {
  const l = letterLayout();
  return { cols: l.cols, rows: l.rows };
}
const letterFontSpec = (px) => `${state.italic ? 'italic ' : ''}${state.weight} ${px}px "${state.font}", serif`;
const unitFontSpec = (px) => `${px}px "${state.unitFont}", ui-monospace, monospace`;
const charPx = (cw, ch) => Math.min(ch * 0.92, cw / 0.6);

/* ---------- font loading */
const fontTried = new Set();
function ensureFont(spec, text) {
  let ok = true;
  try { ok = document.fonts.check(spec, text); } catch (e) { return true; }
  if (ok) return true;
  const key = spec + '|' + text;
  if (!fontTried.has(key)) {
    fontTried.add(key);
    document.fonts.load(spec, text).then(() => {
      rasterKey = '';
      fontEpoch++;
      densityCache.clear();
      afterStructuralChange();
    }).catch(() => {});
  }
  return false;
}

/* ---------- 1. raster */
const rc = document.createElement('canvas');
const rctx = rc.getContext('2d', { willReadFrequently: true });
let rasterKey = '', coverage = null, rasterClip = [];
const SS = 6;

function raster() {
  const { cols, rows } = dims();
  const L = letterLayout();
  const key = [state.fitMode, state.char, state.font, state.weight, state.italic, state.letterScale, state.offsetX, state.offsetY, cols, rows, state.cellAspect, L.f, fontEpoch].join('|');
  if (key === rasterKey && coverage) return coverage;
  ensureFont(letterFontSpec(100), state.char || 'A');
  const W = cols * SS, H = Math.max(rows, Math.round(rows * state.cellAspect * SS));
  rc.width = W; rc.height = H;
  rctx.clearRect(0, 0, W, H);
  const cov = new Float32Array(cols * rows);
  const text = state.char;
  if (text) {
    rctx.textAlign = 'left';
    rctx.textBaseline = 'alphabetic';
    rctx.font = letterFontSpec(200);
    const m = rctx.measureText(text);
    const bw = m.actualBoundingBoxLeft + m.actualBoundingBoxRight;
    const bh = m.actualBoundingBoxAscent + m.actualBoundingBoxDescent;
    if (bw > 0 && bh > 0) {
      let x, y;
      if (L.mode === 'font') {
        const sy = H / (rows * state.cellAspect); // raster px per cell width, vertically
        rctx.font = letterFontSpec(L.f * SS);
        x = (L.originX + state.offsetX * cols) * SS;
        y = (L.baseline + L.offY) * sy;
      } else {
        const fit = Math.min((W * 0.84) / bw, (H * 0.84) / bh) * state.letterScale;
        rctx.font = letterFontSpec(200 * fit);
        const m2 = rctx.measureText(text);
        x = W / 2 - (m2.actualBoundingBoxRight - m2.actualBoundingBoxLeft) / 2 + state.offsetX * W;
        y = H / 2 + (m2.actualBoundingBoxAscent - m2.actualBoundingBoxDescent) / 2 + state.offsetY * H;
      }
      rctx.fillStyle = '#000';
      rctx.fillText(text, x, y);
      const data = rctx.getImageData(0, 0, W, H).data;
      for (let r = 0; r < rows; r++) {
        const y0 = Math.floor((r * H) / rows), y1 = Math.floor(((r + 1) * H) / rows);
        for (let c = 0; c < cols; c++) {
          const x0 = c * SS, x1 = x0 + SS;
          let sum = 0;
          for (let yy = y0; yy < y1; yy++) {
            let p = (yy * W + x0) * 4 + 3;
            for (let xx = x0; xx < x1; xx++, p += 4) sum += data[p];
          }
          cov[r * cols + c] = sum / (255 * (x1 - x0) * Math.max(1, y1 - y0));
        }
      }
    }
  }
  // which artboard edges the letter's ink reaches (a sign it is being cut off)
  rasterClip = [];
  const edge = (i) => cov[i] > 0.04;
  for (let c = 0; c < cols; c++) { if (edge(c)) { rasterClip.push('위'); break; } }
  for (let c = 0; c < cols; c++) { if (edge((rows - 1) * cols + c)) { rasterClip.push('아래'); break; } }
  for (let r = 0; r < rows; r++) { if (edge(r * cols)) { rasterClip.push('왼쪽'); break; } }
  for (let r = 0; r < rows; r++) { if (edge(r * cols + cols - 1)) { rasterClip.push('오른쪽'); break; } }
  rasterKey = key;
  coverage = cov;
  toneKey = '';
  return cov;
}

/* ---------- 2. tone */
let toneKey = '', tone = null;
function computeTone() {
  const cov = raster();
  const { cols, rows } = dims();
  const key = rasterKey + '|' + ['shade', 'shadeDepth', 'angle', 'noiseScale', 'blur', 'halo', 'edge', 'gamma', 'contrast', 'grain', 'invert', 'seed']
    .map((k) => state[k]).join('|');
  if (key === toneKey && tone) return tone;
  const n = cols * rows;
  const t = new Float32Array(n);
  const needBlur = state.shade === 'distance' || state.halo > 0;
  const b = needBlur ? AK.blur(cov, cols, rows, state.blur) : null;
  const depth = state.shadeDepth;
  const ang = (state.angle * Math.PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang);
  const physH = rows * state.cellAspect, physMax = Math.max(cols, physH);
  const ns = state.noiseScale;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i = r * cols + c;
      const m = cov[i];
      // physical coordinates in [-0.5, 0.5] of the longer side
      const px = (c + 0.5 - cols / 2) / physMax, py = ((r + 0.5) * state.cellAspect - physH / 2) / physMax;
      let u = 1;
      switch (state.shade) {
        case 'distance': u = AK.clamp((b[i] - 0.5) * 2); break;
        case 'gradient': u = AK.clamp(px * ca + py * sa + 0.5); break;
        case 'radial': u = AK.clamp(1 - Math.hypot(px, py) * 2); break;
        case 'noise': u = AK.fbm((px + 0.5) * ns, (py + 0.5) * ns, state.seed); break;
      }
      const shade = state.shade === 'solid' ? 1 : 1 - depth + depth * u;
      let v = m * shade;
      if (state.halo > 0) v += (1 - m) * state.halo * Math.min(1, b[i] * 2);
      if (state.edge > 0) {
        const L = c > 0 ? cov[i - 1] : 0, Rr = c < cols - 1 ? cov[i + 1] : 0;
        const U = r > 0 ? cov[i - cols] : 0, D = r < rows - 1 ? cov[i + cols] : 0;
        const e = AK.clamp(Math.hypot(Rr - L, D - U));
        v = v * (1 - state.edge) + e * state.edge;
      }
      if (state.invert) v = 1 - v;
      v = AK.clamp((v - 0.5) * (1 + state.contrast) + 0.5);
      v = Math.pow(v, state.gamma);
      if (state.grain > 0) v = AK.clamp(v + (AK.hash(c, r, state.seed * 31 + 5) - 0.5) * state.grain);
      t[i] = v;
    }
  }
  toneKey = key;
  tone = t;
  return t;
}

/* ---------- 3. units & ramp */
const dcan = document.createElement('canvas');
const dctx = dcan.getContext('2d', { willReadFrequently: true });
const densityCache = new Map();
const unitKey = (u) => (u.kind === 'char' ? 'c:' + u.value : 'g:' + u.glyph + ':' + (glyphById(u.glyph) || {}).v);

function measure(u) {
  const key = u._g ? '' : unitKey(u) + '|' + state.unitFont + '|' + state.cellAspect; // unsaved editor glyphs skip the cache
  if (key && densityCache.has(key)) return densityCache.get(key);
  const cw = 40, ch = Math.round(40 * state.cellAspect);
  dcan.width = cw; dcan.height = ch;
  dctx.clearRect(0, 0, cw, ch);
  dctx.fillStyle = '#000'; dctx.strokeStyle = '#000';
  dctx.font = unitFontSpec(charPx(cw, ch));
  dctx.textAlign = 'center'; dctx.textBaseline = 'middle';
  drawUnit(dctx, u, cw / 2, ch / 2, cw, ch, 1, 1, 1);
  dctx.setTransform(1, 0, 0, 1, 0, 0);
  const d = dctx.getImageData(0, 0, cw, ch).data;
  let sum = 0;
  for (let i = 3; i < d.length; i += 4) sum += d[i];
  const v = sum / (255 * cw * ch);
  if (key) densityCache.set(key, v);
  return v;
}
function measureGlyph(g) {
  return measure({ kind: 'glyph', glyph: g.id, _g: g });
}

function drawUnit(ctx, u, x, y, cw, ch, k, px, unitScale) {
  if (u.kind === 'char') {
    if (u.value === ' ') return;
    ctx.setTransform(px * k, 0, 0, px * k, px * x, px * y);
    ctx.fillText(u.value, 0, 0);
    return;
  }
  const g = u._g || glyphById(u.glyph);
  if (!g) return;
  const s = (Math.min(cw, ch) * unitScale * k) / 100;
  ctx.setTransform(px * s, 0, 0, px * s, px * (x - 50 * s), px * (y - 50 * s));
  AK.drawGlyph(ctx, u._g ? AK.compileGlyph(g) : compiled(g));
}

function ramp() {
  const on = state.units.filter((u) => u.on && (u.kind === 'char' || glyphById(u.glyph)));
  if (on.some((u) => u.kind === 'char')) ensureFont(unitFontSpec(20), on.filter((u) => u.kind === 'char').map((u) => u.value).join(''));
  const items = on.map((u) => ({ u, d: measure(u) }));
  if (!items.length) return [];
  let lo = Infinity, hi = -Infinity;
  for (const it of items) { lo = Math.min(lo, it.d); hi = Math.max(hi, it.d); }
  const span = hi - lo;
  for (const it of items) it.nd = span > 1e-6 ? (it.d - lo) / span : 1;
  if (state.rampMode === 'auto') items.sort((a, b) => a.nd - b.nd);
  return items;
}

function pickUnit(items, t, h) {
  if (state.rampMode === 'manual') return items[Math.min(items.length - 1, Math.floor(t * items.length))].u;
  let best = Infinity;
  for (const it of items) { const d = Math.abs(it.nd - t); if (d < best) best = d; }
  const lim = best + state.mixTol + 1e-6;
  let n = 0;
  for (const it of items) if (Math.abs(it.nd - t) <= lim) n++;
  let pick = Math.floor(h * n);
  for (const it of items) if (Math.abs(it.nd - t) <= lim && pick-- === 0) return it.u;
  return items[items.length - 1].u;
}

/* colour theme: maps a cell to a palette position, then to a colour from the lookup table */
function themeCtx(items) {
  if (!state.themeOn || !state.palette.length) return null;
  const lut = Theme.lut(state.palette, state.colorBlend);
  const n = lut.length - 1;
  const order = new Map(items.map((it, i) => [it.u.id, items.length > 1 ? i / (items.length - 1) : 0.5]));
  const { cols, rows } = dims();
  const physH = rows * state.cellAspect, physMax = Math.max(cols, physH);
  const ang = (state.colorAngle * Math.PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang);
  const { colorMode: mode, colorSeed: seed, colorSpread: spread, colorScope: scope, colorScale: scale } = state;
  return {
    lut,
    applies: (u) => scope === 'all' || (scope === 'glyphs') === (u.kind === 'glyph'),
    at(c, r, tt, u) {
      const px = (c + 0.5 - cols / 2) / physMax, py = ((r + 0.5) * state.cellAspect - physH / 2) / physMax;
      let p;
      if (mode === 'tone') p = tt;
      else if (mode === 'random') p = AK.hash(c, r, seed * 7 + 3);
      else if (mode === 'noise') p = AK.fbm((px + 0.5) * scale, (py + 0.5) * scale, seed + 77);
      else if (mode === 'gradient') p = px * ca + py * sa + 0.5;
      else p = order.has(u.id) ? order.get(u.id) : 0.5;
      if (spread) p += (AK.hash(c, r, seed * 17 + 9) - 0.5) * 2 * spread;
      return lut[Math.round(AK.clamp(p) * n)];
    },
  };
}

/* build draw ops: { c, r, u, k, a, col, box } — box is the cell fill colour in knockout mode */
function buildOps(frame) {
  const t = computeTone();
  const { cols, rows } = dims();
  const items = ramp();
  const th = themeCtx(items);
  const bgU = state.bgUnit ? state.units.find((u) => u.id === state.bgUnit) : null;
  const thr = state.threshold;
  const knock = state.renderMode === 'knockout';
  const ops = [];
  let custom = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = t[r * cols + c];
      if (v < thr || !items.length) {
        if (bgU) ops.push({ c, r, u: bgU, k: 1, a: state.bgAlpha, col: state.fg });
        continue;
      }
      let s = state.seed;
      if (state.animate && AK.hash(c, r, frame * 7 + 1) < state.flicker) s += frame + 1;
      let tt = (v - thr) / (1 - thr || 1);
      if (state.variation) tt = AK.clamp(tt + (AK.hash(c, r, s * 13 + 11) - 0.5) * 2 * state.variation);
      const u = pickUnit(items, knock ? 1 - tt : tt, AK.hash(c, r, s));
      const isG = u.kind === 'glyph';
      if (isG) custom++;
      const k = state.sizeMode === 'tone' && !knock ? Math.max(0.12, Math.round(Math.sqrt(tt) * 20) / 20) : 1;
      const ink = th && th.applies(u) ? th.at(c, r, tt, u) : state.fg;
      ops.push({ c, r, u, k, a: 1, col: knock ? state.bg : ink, box: knock ? ink : null });
    }
  }
  ops.custom = custom;
  return ops;
}

/* ---------- 4. paint */
function paint(ctx, W, H, ops, px) {
  const { cols, rows } = dims();
  const cw = W / cols, ch = H / rows;
  ctx.setTransform(px, 0, 0, px, 0, 0);
  ctx.globalAlpha = 1;
  ctx.fillStyle = state.bg;
  ctx.fillRect(0, 0, W, H);
  if (state.grid) {
    ctx.strokeStyle = state.gridColor;
    ctx.globalAlpha = state.gridAlpha;
    ctx.lineWidth = Math.max(1 / px, Math.min(cw, ch) * 0.04);
    ctx.beginPath();
    for (let c = 0; c <= cols; c++) { ctx.moveTo(c * cw, 0); ctx.lineTo(c * cw, H); }
    for (let r = 0; r <= rows; r++) { ctx.moveTo(0, r * ch); ctx.lineTo(W, r * ch); }
    ctx.stroke();
    ctx.globalAlpha = 1;
  }
  ctx.font = unitFontSpec(charPx(cw, ch) * state.unitScale);
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  let col = null;
  const inset = state.grid ? Math.min(cw, ch) * 0.06 : 0;
  for (const op of ops) {
    if (op.box) {
      ctx.setTransform(px, 0, 0, px, 0, 0);
      ctx.globalAlpha = 1;
      ctx.fillStyle = op.box;
      col = null;
      ctx.fillRect(op.c * cw + inset, op.r * ch + inset, cw - inset * 2 + (inset ? 0 : 0.5), ch - inset * 2 + (inset ? 0 : 0.5));
    }
    if (op.col !== col) { col = op.col; ctx.fillStyle = col; ctx.strokeStyle = col; }
    ctx.globalAlpha = op.a;
    drawUnit(ctx, op.u, (op.c + 0.5) * cw, (op.r + 0.5) * ch, cw, ch, op.k, px, state.unitScale);
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
}

/* ---------- view */
const view = $('#view');
const vctx = view.getContext('2d');
const stage = $('#stage');
let frame = 0, lastOps = null, rafId = 0, animTimer = 0;

/* physical output: one cell is cellPt wide; PNG pixels follow from dpi */
const PT_MM = 25.4 / 72;
const MAX_SIDE = 16000, MAX_AREA = 120e6; // stay inside browser canvas limits
function outputSize() {
  const { cols, rows } = dims();
  const Wpt = cols * state.cellPt, Hpt = rows * state.cellAspect * state.cellPt;
  let dpi = parseFloat(state.dpi) || 300;
  let pxW = Math.round((Wpt / 72) * dpi), pxH = Math.round((Hpt / 72) * dpi);
  let clamped = false;
  const k = Math.min(1, MAX_SIDE / Math.max(pxW, pxH), Math.sqrt(MAX_AREA / (pxW * pxH)));
  if (k < 1) { dpi = Math.floor(dpi * k); pxW = Math.round((Wpt / 72) * dpi); pxH = Math.round((Hpt / 72) * dpi); clamped = true; }
  return { cols, rows, Wpt, Hpt, dpi, pxW, pxH, clamped };
}
const fmtNum = (n, d = 1) => Number(n.toFixed(d)).toLocaleString();
function renderOutputInfo() {
  const el = document.getElementById('out-info');
  if (!el) return;
  const o = outputSize();
  el.innerHTML = `${o.cols} × ${o.rows} 셀 · <b>${fmtNum(o.Wpt, 2)} × ${fmtNum(o.Hpt, 2)} pt</b><br>` +
    `${fmtNum(o.Wpt * PT_MM)} × ${fmtNum(o.Hpt * PT_MM)} mm · PNG ${o.pxW.toLocaleString()} × ${o.pxH.toLocaleString()} px @ ${o.dpi} dpi` +
    (o.clamped ? `<br>PNG가 너무 커서 ${o.dpi} dpi로 낮춰 저장합니다.` : '') +
    (letterLayout().sizeRows ? `<br>글자 크기 ${state.letterScale}에 맞춰 세로 셀을 ${state.rowsFont}행에서 ${state.rowsFont + letterLayout().sizeRows}행으로 늘렸습니다.` : '') +
    (letterLayout().extraRows ? `<br>디센더가 아래 여백을 넘어서 아래로 ${letterLayout().extraRows}행을 늘렸습니다. 위쪽 가장자리와 기준선 위치는 다른 글자와 같습니다.` : '') +
    (rasterClip.length ? `<br><span class="warn">글자가 ${rasterClip.join('·')}에서 잘립니다. 글자 크기를 줄이거나 여백을 늘리세요.</span>` : '');
}

function artSize() {
  const { cols, rows } = dims();
  return { aw: cols, ah: rows * state.cellAspect };
}

function renderNow() {
  rafId = 0;
  const { aw, ah } = artSize();
  const sr = stage.getBoundingClientRect();
  const cs = getComputedStyle(stage);
  const availW = sr.width - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  const availH = sr.height - parseFloat(cs.paddingTop) - parseFloat(cs.paddingBottom);
  const scale = Math.max(0.1, Math.min(availW / aw, availH / ah));
  const W = Math.floor(aw * scale), H = Math.floor(ah * scale);
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  if (view.width !== Math.round(W * dpr) || view.height !== Math.round(H * dpr)) {
    view.width = Math.round(W * dpr); view.height = Math.round(H * dpr);
  }
  view.style.width = W + 'px'; view.style.height = H + 'px';
  lastOps = buildOps(frame);
  paint(vctx, W, H, lastOps, dpr);
  const { cols, rows } = dims();
  const bgCount = lastOps.filter((o) => o.a < 1).length;
  renderOutputInfo();
  const L = letterLayout();
  const clip = (L.sizeRows ? ` · 글자 크기에 맞춰 ${L.sizeRows}행 늘림` : '') + (L.extraRows ? ` · 디센더 때문에 아래로 ${L.extraRows}행 늘림` : '') + (rasterClip.length ? ` · ${rasterClip.join('·')} 잘림` : '');
  $('#info').classList.toggle('warn', rasterClip.length > 0);
  $('#info').title = rasterClip.length ? '글자가 아트보드 가장자리에 닿아 잘립니다. 글자 크기를 줄이거나 여백을 늘리세요.' : '';
  $('#info').textContent = `${cols} × ${rows} 셀${clip} · ${fmtNum(cols * state.cellPt, 2)} pt · 유닛 ${(lastOps.length - bgCount).toLocaleString()} · 커스텀 글리프 ${lastOps.custom.toLocaleString()}`;
}
function requestRender() { if (!rafId) rafId = requestAnimationFrame(renderNow); }
new ResizeObserver(requestRender).observe(stage);

function syncAnimation() {
  clearInterval(animTimer);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (state.animate && !reduce) animTimer = setInterval(() => { frame++; requestRender(); }, 1000 / state.fps);
}

/* ---------- controls schema */
const opt = (pairs) => pairs.map(([v, l]) => [v, l]);
const themed = (s) => s.themeOn;
const SECTIONS = [
  { id: 'source', title: '글자', en: 'SOURCE', items: [
    { k: 'char', t: 'text', label: '글자 (한 글자, 최대 4자)' },
    { k: 'font', t: 'select', label: '서체', options: () => LETTER_FONTS.map((f) => [f, f]) },
    { k: 'fitMode', t: 'seg', label: '글자 맞춤', options: () => opt([['font', '서체 기준'], ['box', '개별 맞춤']]) },
    { k: 'weight', t: 'range', label: '굵기', min: 100, max: 900, step: 100 },
    { k: 'italic', t: 'check', label: '이탤릭' },
    { k: 'letterScale', t: 'range', label: '글자 크기', min: 0.3, max: 1.8, step: 0.01 },
    { k: 'offsetX', t: 'range', label: '가로 위치', min: -0.5, max: 0.5, step: 0.01 },
    { k: 'offsetY', t: 'range', label: '세로 위치', min: -0.5, max: 0.5, step: 0.01 },
    { id: 'font-file', t: 'file', label: '서체 파일 올리기 (.ttf .otf .woff2)', accept: '.ttf,.otf,.woff,.woff2' },
  ] },
  { id: 'color', title: '색', en: 'COLOR', items: [
    { k: 'bg', t: 'color', label: '배경' },
    { k: 'fg', t: 'color', label: '기본 유닛 색' },
    { k: 'themeOn', t: 'check', label: '색 테마 · 여러 색을 섞어 칠하기' },
    { id: 'theme', t: 'theme', when: themed },
    { k: 'colorMode', t: 'select', label: '섞는 방식', when: themed, options: () => opt([
      ['noise', '얼룩 · 노이즈 덩어리로 나눔'], ['tone', '톤 · 밝은 곳부터 짙은 곳 순서'], ['gradient', '방향 · 한쪽에서 다른 쪽으로'],
      ['random', '무작위 · 셀마다 흩뿌림'], ['unit', '유닛 · 같은 유닛은 같은 색']]) },
    { k: 'colorBlend', t: 'seg', label: '색 사이', when: themed, options: () => opt([['step', '끊어서'], ['smooth', '부드럽게']]) },
    { k: 'colorScope', t: 'seg', label: '칠할 유닛', when: themed, options: () => opt([['all', '전체'], ['glyphs', '글리프만'], ['chars', '문자만']]) },
    { k: 'colorScale', t: 'range', label: '얼룩 크기', min: 1, max: 30, step: 0.5, when: (s) => themed(s) && s.colorMode === 'noise' },
    { k: 'colorAngle', t: 'range', label: '방향', min: 0, max: 360, step: 1, unit: '°', when: (s) => themed(s) && s.colorMode === 'gradient' },
    { k: 'colorSpread', t: 'range', label: '경계 흩뿌림', min: 0, max: 0.5, step: 0.01, when: themed },
    { k: 'colorSeed', t: 'range', label: '색 시드', min: 0, max: 999, step: 1,
      when: (s) => themed(s) && (s.colorMode === 'random' || s.colorMode === 'noise' || s.colorSpread > 0) },
  ] },
  { id: 'grid', title: '그리드', en: 'GRID', items: [
    { k: 'rowsFont', t: 'range', label: '세로 셀 수', min: 12, max: 200, step: 1, when: (s) => s.fitMode === 'font' },
    { k: 'padRows', t: 'range', label: '위아래 여백 (셀)', min: 0, max: 12, step: 1, when: (s) => s.fitMode === 'font' },
    { k: 'padCells', t: 'range', label: '좌우 여백 (셀)', min: 0, max: 12, step: 1, when: (s) => s.fitMode === 'font' },
    { k: 'cols', t: 'range', label: '가로 셀 수', min: 12, max: 200, step: 1, when: (s) => s.fitMode !== 'font' },
    { k: 'ratio', t: 'select', label: '아트보드 비율', when: (s) => s.fitMode !== 'font', options: () => opt([['1:1', '1:1 정사각'], ['4:5', '4:5'], ['3:4', '3:4'], ['2:3', '2:3 포스터'], ['1:1.414', 'A 판형'], ['16:9', '16:9']]) },
    { k: 'cellAspect', t: 'range', label: '셀 세로 비 (높이 ÷ 너비)', min: 0.6, max: 2.4, step: 0.05 },
    { k: 'grid', t: 'check', label: '격자선 그리기' },
    { k: 'gridColor', t: 'color', label: '격자선 색', when: (s) => s.grid },
    { k: 'gridAlpha', t: 'range', label: '격자선 농도', min: 0.02, max: 1, step: 0.01, when: (s) => s.grid },
  ] },
  { id: 'output', title: '출력', en: 'OUTPUT', items: [
    { k: 'cellPt', t: 'number', label: '셀 너비 (pt)', min: 0.25, max: 72, step: 0.01 },
    { k: 'dpi', t: 'seg', label: 'PNG 해상도', options: () => opt([['150', '150 dpi'], ['300', '300 dpi'], ['600', '600 dpi']]) },
    { id: 'out-info', t: 'info' },
  ] },
  { id: 'tone', title: '톤', en: 'TONE', items: [
    { k: 'shade', t: 'select', label: '안쪽 음영', options: () => opt([['solid', '단색'], ['distance', '외곽에서 안쪽으로'], ['gradient', '직선 그라디언트'], ['radial', '원형 그라디언트'], ['noise', '노이즈']]) },
    { k: 'shadeDepth', t: 'range', label: '음영 깊이', min: 0, max: 1, step: 0.01, when: (s) => s.shade !== 'solid' },
    { k: 'angle', t: 'range', label: '그라디언트 각도', min: 0, max: 360, step: 1, unit: '°', when: (s) => s.shade === 'gradient' },
    { k: 'noiseScale', t: 'range', label: '노이즈 크기', min: 1, max: 24, step: 0.5, when: (s) => s.shade === 'noise' },
    { k: 'blur', t: 'range', label: '번짐 반경 (셀)', min: 1, max: 12, step: 1 },
    { k: 'halo', t: 'range', label: '바깥 광채', min: 0, max: 1, step: 0.01 },
    { k: 'edge', t: 'range', label: '윤곽 강조', min: 0, max: 1, step: 0.01 },
    { k: 'gamma', t: 'range', label: '감마', min: 0.3, max: 3, step: 0.05 },
    { k: 'contrast', t: 'range', label: '대비', min: -0.8, max: 2, step: 0.05 },
    { k: 'threshold', t: 'range', label: '비움 임계값', min: 0, max: 0.95, step: 0.01 },
    { k: 'grain', t: 'range', label: '그레인', min: 0, max: 1, step: 0.01 },
    { k: 'invert', t: 'check', label: '반전 (글자 바깥을 채움)' },
  ] },
  { id: 'map', title: '매핑', en: 'MAPPING', items: [
    { k: 'rampMode', t: 'seg', label: '램프', options: () => opt([['auto', '자동 · 밀도 순'], ['manual', '수동 · 칩 순서']]) },
    { k: 'mixTol', t: 'range', label: '혼합 폭 (비슷한 밀도끼리 섞기)', min: 0, max: 0.4, step: 0.01, when: (s) => s.rampMode === 'auto' },
    { k: 'variation', t: 'range', label: '무작위 흔들림', min: 0, max: 0.5, step: 0.01 },
    { k: 'renderMode', t: 'seg', label: '찍는 방식', options: () => opt([['stamp', '스탬프'], ['knockout', '녹아웃']]) },
    { k: 'sizeMode', t: 'seg', label: '유닛 크기', options: () => opt([['fixed', '고정'], ['tone', '톤 따라 (하프톤)']]) },
    { k: 'unitScale', t: 'range', label: '유닛 배율', min: 0.3, max: 1.8, step: 0.01 },
    { k: 'bgUnit', t: 'select', label: '빈 칸 배경 유닛', options: bgUnitOptions },
    { k: 'bgAlpha', t: 'range', label: '배경 유닛 농도', min: 0.02, max: 1, step: 0.01, when: (s) => !!s.bgUnit },
    { k: 'seed', t: 'range', label: '시드', min: 0, max: 999, step: 1 },
    { k: 'animate', t: 'check', label: '신호 깜빡임 애니메이션' },
    { k: 'flicker', t: 'range', label: '깜빡이는 셀 비율', min: 0.01, max: 1, step: 0.01, when: (s) => s.animate },
    { k: 'fps', t: 'range', label: '속도 (fps)', min: 2, max: 30, step: 1, when: (s) => s.animate },
  ] },
];
const ALL_ITEMS = SECTIONS.flatMap((s) => s.items);

function bgUnitOptions() {
  return [['', '없음']].concat(state.units.map((u) => [u.id, u.kind === 'char' ? `문자 “${u.value === ' ' ? '␠' : u.value}”` : `글리프 · ${(glyphById(u.glyph) || {}).name}`]));
}

const fmt = (it, v) => {
  const dec = String(it.step).split('.')[1];
  return (dec ? Number(v).toFixed(dec.length) : String(v)) + (it.unit || '');
};

const SEC_KEY = 'askiical:sections';
let secOpen = { source: true, color: true, grid: false, output: true, tone: true, map: false };
try { Object.assign(secOpen, JSON.parse(localStorage.getItem(SEC_KEY) || '{}')); } catch (e) { /* defaults */ }

function buildControls() {
  const host = $('#controls');
  host.innerHTML = '';
  for (const sec of SECTIONS) {
    const el = document.createElement('details');
    el.className = 'ctl-sec';
    el.open = secOpen[sec.id] !== false;
    el.innerHTML = `<summary><h3><span>${sec.title}</span><em>${sec.en}</em></h3></summary><div class="ctl-body"></div>`;
    el.addEventListener('toggle', () => {
      secOpen[sec.id] = el.open;
      try { localStorage.setItem(SEC_KEY, JSON.stringify(secOpen)); } catch (e) { /* ignore */ }
    });
    const body = el.querySelector('.ctl-body');
    for (const it of sec.items) {
      const row = document.createElement('div');
      row.className = 'ctl ctl-' + it.t;
      const id = 'c-' + (it.k || it.id);
      it.row = row;
      if (it.t === 'range') {
        row.innerHTML = `<label for="${id}">${it.label}</label><output id="${id}-o" for="${id}"></output><input type="range" id="${id}" min="${it.min}" max="${it.max}" step="${it.step}">`;
        it.input = row.querySelector('input'); it.out = row.querySelector('output');
        it.input.addEventListener('input', () => { set(it.k, +it.input.value); it.out.textContent = fmt(it, it.input.value); });
        it.input.addEventListener('dblclick', () => { // double-click resets to the default
          const d = SHAPE_DEFAULTS[it.k];
          if (typeof d === 'number') { it.input.value = d; set(it.k, d); it.out.textContent = fmt(it, d); AK.paintRange(it.input); }
        });
        it.input.title = '더블클릭하면 기본값으로';
      } else if (it.t === 'select') {
        row.innerHTML = `<label for="${id}">${it.label}</label><select id="${id}"></select>`;
        it.input = row.querySelector('select');
        it.input.addEventListener('change', () => set(it.k, it.input.value));
      } else if (it.t === 'seg') {
        row.innerHTML = `<span class="lbl" id="${id}-l">${it.label}</span><div class="seg-inline" role="group" aria-labelledby="${id}-l"></div>`;
        it.input = row.querySelector('.seg-inline');
        it.input.innerHTML = it.options().map(([v, l]) => `<button type="button" data-v="${AK.esc(v)}">${AK.esc(l)}</button>`).join('');
        it.input.addEventListener('click', (e) => {
          const b = e.target.closest('button');
          if (!b) return;
          set(it.k, b.dataset.v);
          syncSeg(it);
        });
      } else if (it.t === 'check') {
        row.innerHTML = `<label class="chk"><input type="checkbox" id="${id}"> <span>${it.label}</span></label>`;
        it.input = row.querySelector('input');
        it.input.addEventListener('change', () => set(it.k, it.input.checked));
      } else if (it.t === 'color') {
        row.innerHTML = `<label for="${id}">${it.label}</label><span class="color-pick"><code id="${id}-hex"></code><input type="color" id="${id}"></span>`;
        it.input = row.querySelector('input'); it.out = row.querySelector('code');
        it.input.addEventListener('input', () => { set(it.k, it.input.value); it.out.textContent = it.input.value; });
      } else if (it.t === 'text') {
        row.innerHTML = `<label for="${id}">${it.label}</label><input type="text" id="${id}" maxlength="8" autocomplete="off">`;
        it.input = row.querySelector('input');
        it.input.addEventListener('input', () => set(it.k, [...it.input.value].slice(0, 4).join('')));
      } else if (it.t === 'file') {
        row.innerHTML = `<label class="btn" for="${id}">${it.label}</label><input type="file" id="${id}" accept="${it.accept}" hidden>`;
        row.querySelector('input').addEventListener('change', onFontFile);
      } else if (it.t === 'theme') {
        buildThemeUI(row);
      } else if (it.t === 'number') {
        row.innerHTML = `<label for="${id}">${it.label}</label><input type="number" id="${id}" min="${it.min}" max="${it.max}" step="${it.step}" inputmode="decimal">`;
        it.input = row.querySelector('input');
        it.input.addEventListener('input', () => {
          const v = parseFloat(it.input.value);
          if (Number.isFinite(v) && v >= it.min && v <= it.max) { it.input.removeAttribute('aria-invalid'); set(it.k, v); }
          else it.input.setAttribute('aria-invalid', 'true');
        });
        it.input.addEventListener('change', () => { it.input.value = state[it.k]; it.input.removeAttribute('aria-invalid'); });
      } else if (it.t === 'info') {
        row.innerHTML = `<p class="note out-info" id="${it.id}" aria-live="polite"></p>`;
      }
      body.appendChild(row);
    }
    host.appendChild(el);
  }
}

function syncSeg(it) {
  it.input.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.v === state[it.k])));
}

function fillSelect(it) {
  const cur = state[it.k];
  it.input.innerHTML = it.options().map(([v, l]) => `<option value="${AK.esc(v)}">${AK.esc(l)}</option>`).join('');
  it.input.value = cur;
}

function syncControls() {
  for (const it of ALL_ITEMS) {
    if (!it.k) continue;
    const v = state[it.k];
    if (it.t === 'select') fillSelect(it);
    else if (it.t === 'seg') syncSeg(it);
    else if (it.t === 'check') it.input.checked = !!v;
    else if (it.t === 'range') { it.input.value = v; it.out.textContent = fmt(it, v); }
    else if (it.t === 'color') { it.input.value = v; it.out.textContent = v; }
    else if (it.input !== document.activeElement) it.input.value = v;
  }
  syncVisibility();
  renderThemeUI();
  AK.paintRanges($('#controls'));
  const uf = $('#unit-font');
  uf.innerHTML = UNIT_FONTS.map((f) => `<option>${AK.esc(f)}</option>`).join('');
  uf.value = state.unitFont;
}
function syncVisibility() {
  for (const it of ALL_ITEMS) if (it.when) it.row.hidden = !it.when(state);
}

/* ---------- colour theme panel */
function buildThemeUI(row) {
  row.innerHTML =
    `<div class="theme-presets" id="theme-presets" role="group" aria-label="테마 팔레트">${Theme.PRESETS.map((p, i) =>
      `<button type="button" data-i="${i}" title="${AK.esc(p.name)} · 배경과 팔레트를 함께 바꿉니다"><span class="stripe" style="background:${p.bg}">${p.colors.map((c) => `<i style="background:${c}"></i>`).join('')}</span><span>${AK.esc(p.name)}</span></button>`).join('')}</div>` +
    `<div class="swatches" id="swatches" aria-label="팔레트 색"></div>` +
    `<canvas class="pal-bar" id="pal-bar" aria-label="팔레트가 퍼지는 순서"></canvas>` +
    `<div class="row-btns"><button type="button" id="pal-harmony" title="어울리는 색 조합을 무작위로 만듭니다">조화 팔레트</button>` +
    `<button type="button" id="pal-shuffle">순서 섞기</button><button type="button" id="pal-rev">뒤집기</button></div>`;
  const usePalette = (bg, colors, msg) => {
    state.palette = colors.slice(0, 8);
    state.bg = bg;
    state.themeOn = true;
    syncControls();
    renderRamp();
    persist();
    requestRender();
    if (msg) toast(msg);
  };
  row.querySelector('#theme-presets').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const p = Theme.PRESETS[+b.dataset.i];
    usePalette(p.bg, p.colors);
  };
  row.querySelector('#pal-harmony').onclick = () => {
    const h = Theme.harmony((Math.random() * 1e9) | 0);
    usePalette(h.bg, h.colors, `${h.name} 배색으로 팔레트를 만들었습니다.`);
  };
  row.querySelector('#pal-shuffle').onclick = () => {
    const a = state.palette;
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    themeChanged(true);
  };
  row.querySelector('#pal-rev').onclick = () => { state.palette.reverse(); themeChanged(true); };
}

function themeChanged(rebuild) {
  if (rebuild) renderThemeUI(); else drawPalBar();
  renderRamp();
  persist();
  requestRender();
}

function renderThemeUI() {
  const box = $('#swatches');
  if (!box) return;
  box.innerHTML = '';
  state.palette.forEach((c, i) => {
    const sw = document.createElement('div');
    sw.className = 'sw';
    sw.innerHTML = `<input type="color" value="${c}" aria-label="팔레트 색 ${i + 1}" title="${c}">` +
      (state.palette.length > 1 ? `<button type="button" class="sw-x" aria-label="색 ${i + 1} 빼기">×</button>` : '');
    sw.querySelector('input').addEventListener('input', (e) => { state.palette[i] = e.target.value; e.target.title = e.target.value; themeChanged(false); });
    const x = sw.querySelector('.sw-x');
    if (x) x.onclick = () => { state.palette.splice(i, 1); themeChanged(true); };
    box.appendChild(sw);
  });
  if (state.palette.length < 8) {
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'sw-add';
    add.setAttribute('aria-label', '색 추가');
    add.textContent = '+';
    add.onclick = () => {
      const h = Theme.harmony((Math.random() * 1e9) | 0).colors;
      state.palette.push(h[Math.floor(Math.random() * h.length)]);
      themeChanged(true);
    };
    box.appendChild(add);
  }
  drawPalBar();
}

function drawPalBar() {
  const cv = $('#pal-bar');
  if (!cv) return;
  const r = cv.getBoundingClientRect();
  if (!r.width) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  const c = cv.getContext('2d');
  const lut = Theme.lut(state.palette, state.colorBlend, 128);
  const w = cv.width / lut.length;
  lut.forEach((col, i) => { c.fillStyle = col; c.fillRect(Math.floor(i * w), 0, Math.ceil(w) + 1, cv.height); });
}

const LAYOUT_KEYS = new Set(['cols', 'ratio', 'cellAspect']);
const THEME_KEYS = new Set(['themeOn', 'colorBlend', 'colorScope', 'colorMode', 'bg', 'fg']);
function set(k, v) {
  state[k] = v;
  if (k === 'cellAspect') densityCache.clear();
  if (k === 'animate' || k === 'fps') syncAnimation();
  syncVisibility();
  if (k === 'themeOn' && v) requestAnimationFrame(renderThemeUI); // swatches were hidden, size the bar now
  if (k === 'colorBlend') drawPalBar();
  if (LAYOUT_KEYS.has(k) || THEME_KEYS.has(k) || k === 'unitFont') renderRamp();
  persist();
  requestRender();
}

async function onFontFile(e) {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const name = 'User ' + f.name.replace(/\.[^.]+$/, '').slice(0, 24);
    const buf = await f.arrayBuffer();
    userFonts[name] = buf.slice(0);
    const face = new FontFace(name, buf);
    await face.load();
    document.fonts.add(face);
    if (!LETTER_FONTS.includes(name)) LETTER_FONTS.push(name);
    if (!UNIT_FONTS.includes(name)) UNIT_FONTS.push(name);
    state.font = name;
    rasterKey = '';
    syncControls();
    persist();
    requestRender();
    toast(`서체 “${name}”을 불러왔습니다. 이 서체는 새로고침하면 다시 올려야 합니다.`);
  } catch (err) {
    toast('서체 파일을 읽지 못했습니다. TTF, OTF, WOFF, WOFF2 파일인지 확인하세요.');
  }
}

/* ---------- units panel */
function unitFace(u) {
  if (u.kind === 'char') return `<span>${AK.esc(u.value === ' ' ? '␠' : u.value)}</span>`;
  return '<canvas width="52" height="52"></canvas>';
}
function drawGlyphThumb(cv, g, fg) {
  const c = cv.getContext('2d');
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, cv.width, cv.height);
  const s = cv.width / 100;
  c.setTransform(s * 0.86, 0, 0, s * 0.86, cv.width * 0.07, cv.height * 0.07);
  c.fillStyle = fg; c.strokeStyle = fg;
  AK.drawGlyph(c, compiled(g));
  c.setTransform(1, 0, 0, 1, 0, 0);
}

let dragFrom = -1;
function renderUnits() {
  const host = $('#unit-list');
  $('#unit-count').textContent = `${state.units.filter((u) => u.on).length}/${state.units.length}`;
  host.style.setProperty('--unit-font', `"${state.unitFont}", ui-monospace, monospace`);
  host.innerHTML = '';
  const text = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#e8e6dd';
  state.units.forEach((u, i) => {
    const g = u.kind === 'glyph' ? glyphById(u.glyph) : null;
    if (u.kind === 'glyph' && !g) return;
    const chip = document.createElement('div');
    chip.className = 'chip' + (u.on ? '' : ' off') + (g ? ' is-glyph' : '');
    chip.draggable = true;
    const label = g ? `글리프 ${g.name}` : `문자 ${u.value === ' ' ? '공백' : u.value}`;
    chip.innerHTML = `<button type="button" class="chip-face" aria-pressed="${u.on}" title="${AK.esc(label)} 켜기/끄기">${unitFace(u)}</button>` +
      `<span class="chip-d">${Math.round(measure(u) * 100)}%</span>` +
      `<button type="button" class="chip-x" aria-label="${AK.esc(label)} 삭제">×</button>`;
    if (g) drawGlyphThumb(chip.querySelector('canvas'), g, text);
    chip.querySelector('.chip-face').onclick = () => { u.on = !u.on; afterUnitsChange(); };
    chip.querySelector('.chip-x').onclick = () => {
      state.units.splice(i, 1);
      if (state.bgUnit === u.id) state.bgUnit = '';
      afterUnitsChange();
    };
    chip.addEventListener('dragstart', (e) => { dragFrom = i; chip.classList.add('dragging'); e.dataTransfer.effectAllowed = 'move'; });
    chip.addEventListener('dragend', () => { dragFrom = -1; chip.classList.remove('dragging'); });
    chip.addEventListener('dragover', (e) => { e.preventDefault(); chip.classList.add('drop'); });
    chip.addEventListener('dragleave', () => chip.classList.remove('drop'));
    chip.addEventListener('drop', (e) => {
      e.preventDefault();
      if (dragFrom < 0 || dragFrom === i) return;
      const [m] = state.units.splice(dragFrom, 1);
      state.units.splice(i, 0, m);
      afterUnitsChange();
    });
    host.appendChild(chip);
  });
}

function renderRamp() {
  const cv = $('#ramp');
  const r = cv.getBoundingClientRect();
  if (!r.width) return;
  const dpr = window.devicePixelRatio || 1;
  cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
  const c = cv.getContext('2d');
  const items = ramp();
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = state.bg; c.fillRect(0, 0, r.width, r.height);
  const note = $('#ramp-note');
  if (!items.length) { note.textContent = '켜진 유닛이 없습니다. 유닛 칩을 하나 이상 켜세요.'; return; }
  const n = items.length;
  const cw = Math.min(r.width / n, (r.height - 14) / state.cellAspect);
  const ch = cw * state.cellAspect;
  c.font = unitFontSpec(charPx(cw, ch));
  c.textAlign = 'center'; c.textBaseline = 'middle';
  const x0 = (r.width - cw * n) / 2;
  const th = themeCtx(items);
  items.forEach((it, i) => {
    const col = th && th.applies(it.u) ? th.lut[Math.round((n > 1 ? i / (n - 1) : 0.5) * (th.lut.length - 1))] : state.fg;
    c.fillStyle = col; c.strokeStyle = col;
    drawUnit(c, it.u, x0 + (i + 0.5) * cw, ch / 2 + 2, cw, ch, 1, dpr, 1);
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  });
  // density axis
  c.fillStyle = state.fg; c.globalAlpha = 0.5;
  items.forEach((it, i) => c.fillRect(x0 + i * cw + 1, r.height - 4, Math.max(1, (cw - 2) * it.nd), 2));
  c.globalAlpha = 1;
  const glyphs = items.filter((it) => it.u.kind === 'glyph').length;
  note.textContent = state.rampMode === 'auto'
    ? `왼쪽이 밝은 톤, 오른쪽이 짙은 톤입니다. 유닛 ${n}개 중 커스텀 글리프 ${glyphs}개가 밀도 순서에 섞여 있습니다.`
    : `수동 램프: 칩 순서대로 밝은 톤 → 짙은 톤에 배정합니다. 유닛 ${n}개.`;
}

function renderGlyphLib() {
  const host = $('#glyph-lib');
  $('#glyph-count').textContent = state.glyphs.length;
  host.innerHTML = '';
  const text = getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#e8e6dd';
  for (const g of state.glyphs) {
    const used = state.units.some((u) => u.kind === 'glyph' && u.glyph === g.id);
    const card = document.createElement('div');
    card.className = 'gcard' + (used ? ' used' : '');
    card.innerHTML = `<button type="button" class="gcard-main" aria-pressed="${used}" title="${used ? '눌러서 유닛에서 빼기' : '눌러서 유닛에 넣기'}">` +
      `<canvas width="80" height="80"></canvas><span class="gname">${AK.esc(g.name)}</span><span class="gd">잉크 ${Math.round(measureGlyph(g) * 100)}%</span></button>` +
      `<div class="gcard-act"><button type="button" data-a="edit">편집</button>` +
      (g.gen ? '<button type="button" data-a="tune" title="생성기에서 두께, 밀도, 스타일 다시 조절">조절</button>' : '') + '</div>';
    drawGlyphThumb(card.querySelector('canvas'), g, text);
    card.querySelector('.gcard-main').onclick = () => {
      if (used) {
        state.units = state.units.filter((u) => !(u.kind === 'glyph' && u.glyph === g.id));
        if (state.bgUnit && !state.units.some((u) => u.id === state.bgUnit)) state.bgUnit = '';
      } else state.units.push({ id: AK.uid(), kind: 'glyph', glyph: g.id, on: true });
      afterUnitsChange();
    };
    card.querySelector('[data-a="edit"]').onclick = () => openEditor(g, false);
    if (g.gen) card.querySelector('[data-a="tune"]').onclick = () => openGenerator(g);
    host.appendChild(card);
  }
}

function afterUnitsChange() {
  renderUnits();
  renderGlyphLib();
  renderRamp();
  const bgItem = ALL_ITEMS.find((i) => i.k === 'bgUnit');
  fillSelect(bgItem);
  syncVisibility();
  persist();
  requestRender();
}
function afterStructuralChange() {
  syncControls();
  syncAnimation();
  afterUnitsChange();
}

$('#unit-font').onchange = (e) => { set('unitFont', e.target.value); renderUnits(); };
$('#add-chars').addEventListener('submit', (e) => {
  e.preventDefault();
  const inp = $('#add-chars-input');
  const have = new Set(state.units.filter((u) => u.kind === 'char').map((u) => u.value));
  let added = 0;
  for (const ch of new Set([...inp.value])) {
    if (have.has(ch)) continue;
    state.units.push({ id: AK.uid(), kind: 'char', value: ch, on: true });
    added++;
  }
  inp.value = '';
  if (added) afterUnitsChange();
});
$('#charsets').innerHTML = CHARSETS.map(([n, s], i) => `<button type="button" data-i="${i}" title="문자 유닛을 “${AK.esc(s)}”로 교체 (글리프는 유지)">${AK.esc(n)}</button>`).join('');
$('#charsets').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  const chars = CHARSETS[+b.dataset.i][1];
  const glyphUnits = state.units.filter((u) => u.kind === 'glyph');
  state.units = [...new Set([...chars])].map((c) => ({ id: AK.uid(), kind: 'char', value: c, on: true })).concat(glyphUnits);
  if (state.bgUnit && !state.units.some((u) => u.id === state.bgUnit)) state.bgUnit = '';
  afterUnitsChange();
};

/* ---------- glyph editor bridge */
function openEditor(g, isNew) {
  GlyphEditor.open(g, {
    isNew,
    fg: state.fg === state.bg ? '#ffffff' : state.fg,
    bg: state.bg,
    measure: (gg) => measure({ kind: 'glyph', glyph: gg.id, _g: gg }),
    onSave: (ng) => {
      const i = state.glyphs.findIndex((x) => x.id === ng.id);
      if (i >= 0) state.glyphs[i] = ng; else state.glyphs.push(ng);
      if (isNew) state.units.push({ id: AK.uid(), kind: 'glyph', glyph: ng.id, on: true });
      afterUnitsChange();
      toast(isNew ? `글리프 “${ng.name}”를 만들고 유닛에 넣었습니다.` : `글리프 “${ng.name}”를 저장했습니다.`);
    },
    onDelete: (id) => {
      const g0 = glyphById(id);
      state.glyphs = state.glyphs.filter((x) => x.id !== id);
      state.units = state.units.filter((u) => !(u.kind === 'glyph' && u.glyph === id));
      if (state.bgUnit && !state.units.some((u) => u.id === state.bgUnit)) state.bgUnit = '';
      afterUnitsChange();
      toast(`글리프 “${g0 ? g0.name : ''}”를 삭제했습니다.`);
    },
  });
}
/* ---------- keyword generator bridge */
const unitLabel = (u) => (u.kind === 'char' ? `‘${u.value === ' ' ? '공백' : u.value}’` : (glyphById(u.glyph) || {}).name || '글리프');
function describeDensity(g) {
  const v = measure({ kind: 'glyph', glyph: g.id, _g: g });
  const others = state.units
    .filter((u) => u.on && !(u.kind === 'glyph' && u.glyph === g.id) && (u.kind === 'char' || glyphById(u.glyph)))
    .map((u) => ({ u, d: measure(u) }))
    .sort((a, b) => a.d - b.d);
  const pct = (d) => `${Math.round(d * 100)}%`;
  let where = '';
  if (others.length) {
    const lo = others.filter((x) => x.d <= v).pop();
    const hi = others.find((x) => x.d > v);
    if (lo && hi) where = ` · 지금 램프에서 ${unitLabel(lo.u)} ${pct(lo.d)}와 ${unitLabel(hi.u)} ${pct(hi.d)} 사이에 들어갑니다.`;
    else if (lo) where = ` · 지금 램프에서 가장 짙은 유닛이 됩니다 (다음은 ${unitLabel(lo.u)} ${pct(lo.d)}).`;
    else if (hi) where = ` · 지금 램프에서 가장 밝은 유닛이 됩니다 (다음은 ${unitLabel(hi.u)} ${pct(hi.d)}).`;
  }
  return `잉크 ${pct(v)}${where}`;
}
function openGenerator(g) {
  GlyphGen.open({
    fg: state.fg === state.bg ? '#ffffff' : state.fg,
    bg: state.bg,
    describe: describeDensity,
    onSave: (ng, isNew) => {
      const i = state.glyphs.findIndex((x) => x.id === ng.id);
      if (i >= 0) state.glyphs[i] = ng; else state.glyphs.push(ng);
      if (isNew) state.units.push({ id: AK.uid(), kind: 'glyph', glyph: ng.id, on: true });
      afterUnitsChange();
      toast(isNew ? `글리프 “${ng.name}”를 만들고 유닛에 넣었습니다.` : `글리프 “${ng.name}”를 다시 조절했습니다.`);
    },
    onEdit: (ng, editing) => openEditor(ng, !editing),
  }, g);
}
$('#gen-glyph').onclick = () => openGenerator();

$('#new-glyph').onclick = () => openEditor({ name: '새 글리프 ' + (state.glyphs.length + 1), grid: 16 }, true);
$('#svg-import').onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const r = AK.importSVG(await f.text());
    openEditor({ name: f.name.replace(/\.svg$/i, '').slice(0, 24), shapes: r.shapes, rule: r.rule, grid: 16 }, true);
  } catch (err) { toast(err.message); }
};

/* ---------- presets */
function applyPreset(p) {
  const keepGlyphs = state.glyphs;
  for (const id of p.glyphs) {
    if (!keepGlyphs.some((g) => g.id === id)) {
      const b = AK.BUILTIN_GLYPHS.find((x) => x.id === id);
      if (b) keepGlyphs.push(AK.normGlyph(b));
    }
  }
  const s = { ...SHAPE_DEFAULTS, ...p.set };
  delete s.bgUnitGlyph;
  // presets describe a look; the print setup (fit mode, cell size, dpi) stays the user's
  s.fitMode = state.fitMode; s.cellPt = state.cellPt; s.dpi = state.dpi;
  if (!p.set.rowsFont) {
    const [rw, rh] = s.ratio.split(':').map(Number);
    s.rowsFont = Math.max(12, Math.round((s.cols * rh) / rw / s.cellAspect));
  }
  s.glyphs = keepGlyphs;
  s.units = [...new Set([...p.units])].map((c) => ({ id: AK.uid(), kind: 'char', value: c, on: true }))
    .concat(p.glyphs.map((id) => ({ id: AK.uid(), kind: 'glyph', glyph: id, on: true })));
  s.bgUnit = '';
  if (p.set.bgUnitGlyph) {
    const bu = { id: AK.uid(), kind: 'glyph', glyph: p.set.bgUnitGlyph, on: false };
    s.units.push(bu);
    s.bgUnit = bu.id;
  }
  state = s;
  densityCache.clear();
  afterStructuralChange();
  toast(`프리셋 ${p.name}을 적용했습니다.`);
}
$('#presets').innerHTML = PRESETS.map((p, i) =>
  `<button type="button" data-i="${i}"><span class="sw" style="background:linear-gradient(135deg, ${p.sw[0]} 50%, ${p.sw[1]} 50%)"></span>${p.name}</button>`).join('');
$('#presets').onclick = (e) => { const b = e.target.closest('button'); if (b) applyPreset(PRESETS[+b.dataset.i]); };

/* ---------- export */
function download(name, blob) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
const baseName = () => 'askiical-' + (state.char || 'glyph').replace(/[^\p{L}\p{N}]/gu, '') + '-' + dims().cols + 'x' + dims().rows;

// PNG pHYs chunk so Illustrator / Photoshop place the image at its physical size
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
  return t;
})();
const crc32 = (bytes) => { let c = 0xffffffff; for (const b of bytes) c = CRC_TABLE[(c ^ b) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
async function withDpi(blob, dpi) {
  const src = new Uint8Array(await blob.arrayBuffer());
  const ppm = Math.round(dpi / 0.0254);
  const chunk = new Uint8Array(21);
  const dv = new DataView(chunk.buffer);
  dv.setUint32(0, 9);
  chunk.set([0x70, 0x48, 0x59, 0x73], 4); // "pHYs"
  dv.setUint32(8, ppm); dv.setUint32(12, ppm); chunk[16] = 1; // unit: metre
  dv.setUint32(17, crc32(chunk.subarray(4, 17)));
  const at = 33; // signature (8) + IHDR chunk (25)
  const out = new Uint8Array(src.length + chunk.length);
  out.set(src.subarray(0, at)); out.set(chunk, at); out.set(src.subarray(at), at + chunk.length);
  return new Blob([out], { type: 'image/png' });
}

$('#ex-png').onclick = () => {
  const o = outputSize();
  const cv = document.createElement('canvas');
  cv.width = o.pxW; cv.height = o.pxH;
  paint(cv.getContext('2d'), o.pxW, o.pxH, buildOps(frame), 1);
  cv.toBlob(async (b) => {
    if (!b) { toast('PNG를 만들지 못했습니다. 셀 너비나 해상도를 낮춰 보세요.'); return; }
    download(baseName() + `-${o.dpi}dpi.png`, await withDpi(b, o.dpi));
    toast(`PNG ${o.pxW.toLocaleString()} × ${o.pxH.toLocaleString()} px (${o.dpi} dpi, ${fmtNum(o.Wpt, 2)} × ${fmtNum(o.Hpt, 2)} pt)로 내보냈습니다.`);
  }, 'image/png');
};

const userFonts = {}; // uploaded font files by family, for outline export

$('#ex-svg').onclick = async () => {
  const btn = $('#ex-svg');
  btn.disabled = true;
  toast('아웃라인 SVG를 만드는 중입니다…');
  try {
    await Outline.ensureFonts();
    for (const [fam, buf] of Object.entries(userFonts)) Outline.addFont(fam, buf);
    const o = outputSize();
    const res = Outline.build({ state, dims: dims(), ops: buildOps(frame), glyphById, charPx, W: o.Wpt, H: o.Hpt, unit: 'pt' });
    download(baseName() + '-outline.svg', new Blob([res.svg], { type: 'image/svg+xml' }));
    toast(res.missing.length
      ? `아웃라인 SVG로 저장했습니다. 서체에 없는 문자 ${res.missing.join(' ')} 는 텍스트로 남았습니다.`
      : `아웃라인 SVG로 저장했습니다. 모든 유닛이 채움 패스입니다 (${res.count.toLocaleString()}개, ${res.colors}색).`);
  } catch (err) {
    toast('SVG를 만들지 못했습니다: ' + err.message);
  } finally {
    btn.disabled = false;
  }
};

function asciiText() {
  const { cols, rows } = dims();
  const grid = Array.from({ length: rows }, () => Array(cols).fill(' '));
  for (const op of buildOps(frame)) {
    const ch = op.u.kind === 'char' ? op.u.value : (glyphById(op.u.glyph) || {}).fallback || '#';
    grid[op.r][op.c] = ch;
  }
  return grid.map((r) => r.join('').replace(/\s+$/, '')).join('\n');
}
$('#ex-txt').onclick = () => { download(baseName() + '.txt', new Blob([asciiText()], { type: 'text/plain;charset=utf-8' })); toast('TXT로 내보냈습니다. 커스텀 글리프는 대체 문자로 바뀝니다.'); };
$('#ex-copy').onclick = () => {
  const t = asciiText();
  navigator.clipboard.writeText(t).then(() => toast('텍스트 아트를 복사했습니다.'), () => toast('클립보드에 접근할 수 없습니다. TXT 내보내기를 쓰세요.'));
};
$('#ex-json').onclick = () => {
  download(baseName() + '.json', new Blob([JSON.stringify(projectJSON(), null, 1)], { type: 'application/json' }));
  toast('프로젝트를 JSON으로 저장했습니다.');
};
$('#im-json').onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    applyProject(JSON.parse(await f.text()));
    densityCache.clear(); rasterKey = '';
    persist();
    toast(`${f.name}을 불러왔습니다.`);
  } catch (err) { toast(err.message || 'JSON을 읽지 못했습니다.'); }
};

let toastTimer = 0;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
}

/* ---------- boot */
window.addEventListener('resize', () => { renderRamp(); drawPalBar(); });
buildControls();
loadStored();
afterStructuralChange();
document.fonts.ready.then(() => { densityCache.clear(); rasterKey = ''; afterUnitsChange(); });
