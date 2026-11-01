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
  font: 'Bodoni Moda', weight: 700, italic: false, cellAspect: 1.5,
  // text tool: up to two lines on a page, sized like the calendar's month name
  txt: 'A', txtPaper: 'A4', txtOrient: 'portrait', txtSize: 0.6, txtLeading: 1, txtAlign: 'center', txtVAlign: 'middle', txtDY: 0, txtMargin: 6,
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
  // character units: how letters sit in their cell (custom glyphs are centred on the cell by construction)
  charAlign: 'cap', charScale: 1, charWeight: 0, charDX: 0, charDY: 0,
  // calendar mode: one month on an A4 portrait page
  calOn: false, calPaper: 'A4', calOrient: 'portrait', calMonthDY: 0, calGridDY: 0,
  calLines: false, calLineMode: 'units', calLineW: 1, calLineDY: 0, calLineColor: '#ecebe4', calYear: new Date().getFullYear(), calMonth: new Date().getMonth() + 1, calLabel: 'full',
  calMonthAlign: 'left', calMonthSize: 0.2, calWeekStart: 'sun', calDayAlign: 'center', calDaySize: 0.55,
  calMargin: 6, calGap: 2, calSixWeeks: false, calSun: true, calSat: false, calSpecial: {}, calMonthPalette: false,
  // holiday names under the day numbers: solid text in a font of the user's (outlined in SVG once its data is loaded)
  calHol: {}, calHolSpecial: true, calHolFont: 'YMG Gothic', calHolPt: 6, calHolDY: 0, calHolColorMode: 'custom', calHolColor: '#5c5c5c', calHolColorIdx: 1,
  colorTarget: 'month', altColors: null,
  // image tool: the picture is sampled per cell into ink coverage (and optionally its own colours)
  imgCols: 120, imgTone: 'auto', imgLo: 0, imgHi: 1, imgColor: 'theme', imgQuant: 8,
};
// colour settings that differ between the month-name theme and the day-number theme in calendar mode
const COLOR_KEYS = ['fg', 'themeOn', 'palette', 'colorMode', 'colorBlend', 'colorScope', 'colorScale', 'colorAngle', 'colorSpread', 'colorSeed'];
const pickColors = (src) => Object.fromEntries(COLOR_KEYS.map((k) => [k, Array.isArray(src[k]) ? src[k].slice() : src[k]]));
SHAPE_DEFAULTS.altColors = { ...pickColors(SHAPE_DEFAULTS), palette: ['#e6f7ff', '#7fd6f2', '#2f98d9', '#2457a8'] };
// state holds the colour set being edited; altColors holds the other one
function colorsFor(style) {
  if (!state.calOn) return state;
  return state.colorTarget === style ? state : state.altColors;
}

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

/* ---------- tools */
// one page, three tools: text, calendar and image. Each keeps its own saved state;
// project JSON has the same format in all of them, so settings move freely between them.
const TOOLS = ['text', 'calendar', 'image'];
const TOOL_KEY = 'askiical:tool';
const LEGACY_KEY = 'askiical:v1'; // the letter/calendar tool's state before the split
function initialTool() {
  const m = /[?&]tool=(\w+)/.exec(location.search);
  if (m && TOOLS.includes(m[1])) return m[1];
  if (m && m[1] === 'letter') return 'text';
  if (location.hash === '#image') return 'image';
  try {
    const t = localStorage.getItem(TOOL_KEY);
    if (TOOLS.includes(t)) return t;
    const old = JSON.parse(localStorage.getItem(LEGACY_KEY) || 'null');
    if (old && old.calOn) return 'calendar';
  } catch (e) { /* storage unavailable */ }
  return 'text';
}
let TOOL = initialTool();
const isImg = () => TOOL === 'image';
// calOn follows the tool; the image tool keeps an imported calOn so its JSON goes back unchanged
let carriedCalOn = false;

/* ---------- state */
const storeKey = () => `askiical:${TOOL}:v1`;
let state = makeDefaultState();

function makeDefaultState() {
  const s = { ...SHAPE_DEFAULTS, glyphs: AK.BUILTIN_GLYPHS.map(AK.normGlyph), units: [] };
  s.palette = SHAPE_DEFAULTS.palette.slice();
  s.calOn = TOOL === 'calendar';
  if (s.calOn) s.cellPt = 3; // a whole month needs small cells for the day numbers to read
  s.altColors = pickColors(SHAPE_DEFAULTS.altColors);
  s.calSpecial = {};
  s.units = [...' .:-=+*#%@'].map((c) => ({ id: AK.uid(), kind: 'char', value: c, on: true }));
  s.units.push({ id: AK.uid(), kind: 'glyph', glyph: 'b-box', on: true }, { id: AK.uid(), kind: 'glyph', glyph: 'b-cross', on: true });
  if (isImg()) Object.assign(s, { shade: 'solid', halo: 0, edge: 0, grain: 0.04, threshold: 0.04, cellPt: 4 }); // a picture keeps its own shading
  return s;
}

function loadStored() {
  try {
    const raw = localStorage.getItem(storeKey()) ?? (isImg() ? null : localStorage.getItem(LEGACY_KEY));
    if (raw) applyProject(JSON.parse(raw), true);
  } catch (e) { /* storage unavailable or corrupt: keep defaults */ }
}
let saveTimer = 0;
function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try { localStorage.setItem(storeKey(), JSON.stringify(projectJSON())); } catch (e) { /* ignore */ }
  }, 400);
}
function projectJSON() {
  const out = { app: 'askiical', version: 1, tool: TOOL };
  for (const k of Object.keys(SHAPE_DEFAULTS)) out[k] = state[k];
  out.calOn = isImg() ? carriedCalOn : TOOL === 'calendar';
  out.units = state.units;
  out.glyphs = state.glyphs;
  return out;
}
function applyProject(p, quiet) {
  if (!p || typeof p !== 'object' || !Array.isArray(p.units)) throw new Error('askiical 프로젝트 JSON이 아닙니다.');
  const s = { ...SHAPE_DEFAULTS };
  for (const k of Object.keys(SHAPE_DEFAULTS)) if (k in p && typeof p[k] === typeof SHAPE_DEFAULTS[k]) s[k] = p[k];
  if (typeof p.txt !== 'string' && typeof p.char === 'string') s.txt = p.char; // single-letter projects from before the text tool
  s.txt = s.txt.split('\n').slice(0, 2).join('\n');
  s.glyphs = (Array.isArray(p.glyphs) ? p.glyphs : []).map(AK.normGlyph);
  const ids = new Set(s.glyphs.map((g) => g.id));
  s.units = p.units
    .filter((u) => (u.kind === 'char' && typeof u.value === 'string' && u.value.length) || (u.kind === 'glyph' && ids.has(u.glyph)))
    .map((u) => ({ id: u.id || AK.uid(), kind: u.kind, value: u.value, glyph: u.glyph, on: u.on !== false }));
  if (s.bgUnit && !s.units.some((u) => u.id === s.bgUnit)) s.bgUnit = '';
  s.palette = (Array.isArray(s.palette) ? s.palette : []).filter(Theme.isHex).slice(0, 8);
  if (!s.palette.length) s.palette = SHAPE_DEFAULTS.palette.slice();
  const alt = s.altColors && typeof s.altColors === 'object' ? s.altColors : {};
  s.altColors = pickColors(SHAPE_DEFAULTS.altColors);
  for (const k of COLOR_KEYS) if (typeof alt[k] === typeof SHAPE_DEFAULTS.altColors[k]) s.altColors[k] = Array.isArray(alt[k]) ? alt[k].slice() : alt[k];
  s.altColors.palette = (Array.isArray(s.altColors.palette) ? s.altColors.palette : []).filter(Theme.isHex).slice(0, 8);
  if (!s.altColors.palette.length) s.altColors.palette = SHAPE_DEFAULTS.altColors.palette.slice();
  const sp = s.calSpecial && typeof s.calSpecial === 'object' ? s.calSpecial : {};
  s.calSpecial = Object.fromEntries(Object.entries(sp).filter(([k, v]) => /^\d{4}-\d{2}$/.test(k) && typeof v === 'string'));
  const hl = s.calHol && typeof s.calHol === 'object' ? s.calHol : {};
  s.calHol = Object.fromEntries(Object.entries(hl).filter(([k, v]) => /^\d{4}-\d{2}$/.test(k) && typeof v === 'string'));
  if (s.calMonth < 1 || s.calMonth > 12) s.calMonth = SHAPE_DEFAULTS.calMonth;
  if (!Calendar.PAPERS.some((pp) => pp.id === s.calPaper)) s.calPaper = 'A4';
  if (!Calendar.PAPERS.some((pp) => pp.id === s.txtPaper)) s.txtPaper = 'A4';
  if (!['month', 'day'].includes(s.colorTarget)) s.colorTarget = 'month';
  carriedCalOn = s.calOn;
  s.calOn = TOOL === 'calendar';
  if (!s.calOn) {
    if (s.colorTarget === 'day') { // outside the calendar the month-name colour set is the one in use
      const day = pickColors(s);
      Object.assign(s, pickColors(s.altColors));
      s.altColors = day;
      s.colorTarget = 'month';
    }
  }
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

/* Page layout. Lengths are in cell widths (a cell is 1 wide and cellAspect tall).
   The text and calendar tools lay their type out on a paper-sized grid (calendar.js); the image tool samples a picture. */
const lctx = document.createElement('canvas').getContext('2d');
const VREF = 'HÅÉbdfhklgjpqyÿ()[]{}|'; // tall and deep reference glyphs: the font box covers their ink
let fontEpoch = 0; // bumps when a web font finishes loading, so metrics are re-measured
let textCache = { key: '', v: null };
function textLayout() {
  const key = ['txt', 'txtPaper', 'txtOrient', 'txtSize', 'txtLeading', 'txtAlign', 'txtVAlign', 'txtDY', 'txtMargin',
    'font', 'weight', 'italic', 'cellPt', 'cellAspect'].map((k) => state[k]).join('|') + '|' + fontEpoch;
  if (textCache.key !== key) textCache = { key, v: Calendar.textLayout(state, calMeasure()) };
  return textCache.v;
}
function dims() {
  if (isImg()) {
    const src = source();
    return { cols: state.imgCols, rows: Math.max(4, Math.round((state.imgCols * src.height) / src.width / state.cellAspect)) };
  }
  if (state.calOn) return Calendar.grid(state);
  return Calendar.grid(state, state.txtPaper, state.txtOrient);
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

// average alpha of the raster canvas per cell
function cellCoverage(W, H, cols, rows) {
  const cov = new Float32Array(cols * rows);
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
  return cov;
}

/* calendar: text metrics per unit of type size, measured large (canvas rounds metrics to whole pixels) */
function calMeasure() {
  lctx.font = letterFontSpec(1000);
  const ref = lctx.measureText(VREF), zero = lctx.measureText('0');
  const box = { asc: Math.max(zero.fontBoundingBoxAscent ?? 800, ref.actualBoundingBoxAscent) / 1000,
    desc: Math.max(zero.fontBoundingBoxDescent ?? 200, ref.actualBoundingBoxDescent) / 1000 };
  const measure = (t) => {
    lctx.font = letterFontSpec(1000);
    const m = lctx.measureText(t);
    return { left: m.actualBoundingBoxLeft / 1000, right: m.actualBoundingBoxRight / 1000, width: m.width / 1000 };
  };
  measure.box = () => box;
  return measure;
}
let calCache = { key: '', v: null };
function calLayout() {
  const key = ['calYear', 'calMonth', 'calLabel', 'calMonthAlign', 'calMonthSize', 'calWeekStart', 'calDayAlign', 'calDaySize',
    'calPaper', 'calOrient', 'calMonthDY', 'calGridDY', 'calLines', 'calLineW', 'calLineDY', 'calMargin', 'calGap', 'calSixWeeks', 'calSun', 'calSat', 'calHolSpecial', 'font', 'weight', 'italic', 'cellPt', 'cellAspect'].map((k) => state[k]).join('|') +
    '|' + JSON.stringify(state.calSpecial) + '|' + JSON.stringify(state.calHol) + '|' + fontEpoch;
  if (calCache.key !== key) calCache = { key, v: Calendar.layout(state, calMeasure()) };
  return calCache.v;
}

// per cell: 1 = month theme (month name, special days), 2 = day theme
let styleMap = null;
function rasterCalendar() {
  const lay = calLayout();
  const { cols, rows } = lay;
  const key = 'cal|' + calCache.key + '|' + state.calLineMode;
  if (key === rasterKey && coverage) return coverage;
  ensureFont(letterFontSpec(100), lay.blocks.map((b) => b.text).join(''));
  const W = cols * SS, H = Math.max(rows, Math.round(rows * state.cellAspect * SS));
  rc.width = W; rc.height = H;
  const sy = H / (rows * state.cellAspect);
  const pass = (style) => {
    rctx.clearRect(0, 0, W, H);
    rctx.fillStyle = '#000'; rctx.textAlign = 'left'; rctx.textBaseline = 'alphabetic';
    for (const b of lay.blocks) {
      if (b.style !== style) continue;
      rctx.font = letterFontSpec(b.size * SS);
      rctx.fillText(b.text, b.x * SS, b.y * sy);
    }
    if (style === 'day' && state.calLineMode === 'units') { // rules drawn into the letter field, so units fill them
      for (const l of lay.lines) rctx.fillRect(l.x0 * SS, (l.y - l.t / 2) * sy, (l.x1 - l.x0) * SS, l.t * sy);
    }
    return cellCoverage(W, H, cols, rows);
  };
  const a = pass('month'), d = pass('day');
  const n = cols * rows, cov = new Float32Array(n);
  styleMap = new Uint8Array(n);
  const ba = AK.blur(a, cols, rows, 3), bd = AK.blur(d, cols, rows, 3); // halo cells take the nearer text's theme
  for (let i = 0; i < n; i++) {
    cov[i] = Math.max(a[i], d[i]);
    styleMap[i] = a[i] || d[i] ? (a[i] >= d[i] ? 1 : 2) : (ba[i] >= bd[i] ? 1 : 2);
  }
  rasterClip = [];
  rasterKey = key;
  coverage = cov;
  toneKey = '';
  return cov;
}

function raster() {
  if (isImg()) return rasterImage();
  if (state.calOn) return rasterCalendar();
  return rasterText();
}
function rasterText() {
  styleMap = null;
  const lay = textLayout();
  const { cols, rows } = lay;
  const key = 'text|' + textCache.key;
  if (key === rasterKey && coverage) return coverage;
  ensureFont(letterFontSpec(100), state.txt || 'A');
  const W = cols * SS, H = Math.max(rows, Math.round(rows * state.cellAspect * SS));
  rc.width = W; rc.height = H;
  const sy = H / (rows * state.cellAspect);
  rctx.clearRect(0, 0, W, H);
  rctx.fillStyle = '#000'; rctx.textAlign = 'left'; rctx.textBaseline = 'alphabetic';
  for (const b of lay.blocks) {
    rctx.font = letterFontSpec(b.size * SS);
    rctx.fillText(b.text, b.x * SS, b.y * sy);
  }
  const cov = cellCoverage(W, H, cols, rows);
  // which page edges the ink reaches (a sign it is being cut off)
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

/* image tool: the source picture, sampled per cell */
let srcCanvas = null, srcName = '', srcEpoch = 0;
let imgHex = null; // per cell: the picture's colour (posterised), for imgColor 'source'
const SRC_KEY = 'askiical:image:src';
const SRC_MAX = 2000; // longest side kept in memory
function sampleSource() { // a lit sphere on a soft ground, until a picture is loaded
  const c = document.createElement('canvas');
  c.width = 800; c.height = 1000;
  const x = c.getContext('2d');
  const g = x.createLinearGradient(0, 0, 0, 1000);
  g.addColorStop(0, '#f2efe6'); g.addColorStop(1, '#8a8780');
  x.fillStyle = g; x.fillRect(0, 0, 800, 1000);
  const r = x.createRadialGradient(330, 380, 20, 400, 480, 300);
  r.addColorStop(0, '#ffffff'); r.addColorStop(0.35, '#e0603a'); r.addColorStop(1, '#2a0d08');
  x.fillStyle = r; x.beginPath(); x.arc(400, 480, 280, 0, Math.PI * 2); x.fill();
  x.fillStyle = 'rgba(0,0,0,0.35)'; x.beginPath(); x.ellipse(420, 800, 240, 40, 0, 0, Math.PI * 2); x.fill();
  return c;
}
function source() {
  if (!srcCanvas) { srcCanvas = sampleSource(); srcName = 'sample'; srcEpoch++; }
  return srcCanvas;
}
// draw any image (img, bitmap, canvas) into a canvas no larger than SRC_MAX on its long side
function toSourceCanvas(img) {
  const w = img.naturalWidth || img.width, h = img.naturalHeight || img.height;
  const k = Math.min(1, SRC_MAX / Math.max(w, h));
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.round(w * k)); c.height = Math.max(1, Math.round(h * k));
  const x = c.getContext('2d');
  x.imageSmoothingQuality = 'high';
  x.drawImage(img, 0, 0, c.width, c.height);
  return c;
}
function setSource(canvas, name, keep) {
  srcCanvas = canvas; srcName = name; srcEpoch++;
  rasterKey = '';
  if (keep) { // remember the picture across reloads when it fits in storage
    try {
      let url = canvas.toDataURL('image/png');
      if (url.length > 4e6) url = canvas.toDataURL('image/jpeg', 0.9);
      localStorage.setItem(SRC_KEY, JSON.stringify({ name, url }));
    } catch (e) { try { localStorage.removeItem(SRC_KEY); } catch (e2) { /* ignore */ } }
  }
  zoom = 1; view_.cx = 0.5; view_.cy = 0.5;
  afterStructuralChange();
}
function loadStoredSource() {
  try {
    const v = JSON.parse(localStorage.getItem(SRC_KEY) || 'null');
    if (!v || !v.url) return;
    const img = new Image();
    img.onload = () => setSource(toSourceCanvas(img), v.name, false);
    img.src = v.url;
  } catch (e) { /* keep the sample */ }
}
async function loadImageFile(f) {
  if (!f || !/^image\//.test(f.type)) { toast('이미지 파일이 아닙니다.'); return; }
  try {
    const url = URL.createObjectURL(f);
    const img = new Image();
    await new Promise((ok, no) => { img.onload = ok; img.onerror = () => no(new Error('decode')); img.src = url; });
    setSource(toSourceCanvas(img), f.name.replace(/\.[^.]+$/, ''), true);
    URL.revokeObjectURL(url);
    toast(`이미지 “${f.name}”을 불러왔습니다.`);
  } catch (e) {
    toast('이미지를 읽지 못했습니다.');
  }
}
function onImageFile(e) { const f = e.target.files[0]; e.target.value = ''; loadImageFile(f); }

// shrink in halves first so a big picture averages every pixel into its cell
function downscale(src, w, h) {
  let c = src;
  while (c.width / 2 >= w * 2 && c.height / 2 >= h * 2) {
    const n = document.createElement('canvas');
    n.width = Math.round(c.width / 2); n.height = Math.round(c.height / 2);
    const x = n.getContext('2d');
    x.imageSmoothingQuality = 'high';
    x.drawImage(c, 0, 0, n.width, n.height);
    c = n;
  }
  const out = document.createElement('canvas');
  out.width = w; out.height = h;
  const x = out.getContext('2d', { willReadFrequently: true });
  x.imageSmoothingQuality = 'high';
  x.drawImage(c, 0, 0, w, h);
  return x.getImageData(0, 0, w, h).data;
}
// coverage per cell from brightness: on a dark ground the light parts take ink, on a light ground the dark parts
function rasterImage() {
  styleMap = null;
  rasterClip = [];
  const { cols, rows } = dims();
  const key = ['img', srcEpoch, cols, rows, state.imgTone, state.imgLo, state.imgHi, state.imgQuant, state.bg].join('|');
  if (key === rasterKey && coverage) return coverage;
  const d = downscale(source(), cols, rows);
  const n = cols * rows;
  const cov = new Float32Array(n);
  const hex = new Array(n);
  const light = state.imgTone === 'light' || (state.imgTone === 'auto' && Theme.lightness(state.bg) < 0.5);
  const lo = state.imgLo, span = Math.max(0.01, state.imgHi - state.imgLo);
  const q = Math.max(1, state.imgQuant - 1);
  const post = (v) => Math.round(Math.round((v / 255) * q) * (255 / q));
  for (let i = 0, p = 0; i < n; i++, p += 4) {
    const a = d[p + 3] / 255;
    const Y = AK.clamp(((0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2]) / 255 - lo) / span);
    cov[i] = (light ? Y : 1 - Y) * a; // transparent pixels stay empty
    hex[i] = '#' + [post(d[p]), post(d[p + 1]), post(d[p + 2])].map((v) => v.toString(16).padStart(2, '0')).join('');
  }
  imgHex = hex;
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
  const charKey = u.kind === 'char' ? [state.charAlign, state.charScale, state.charWeight, state.charDX, state.charDY, fontEpoch].join(',') : '';
  const key = u._g ? '' : unitKey(u) + '|' + state.unitFont + '|' + state.cellAspect + '|' + charKey; // unsaved editor glyphs skip the cache
  if (key && densityCache.has(key)) return densityCache.get(key);
  const cw = 40, ch = Math.round(40 * state.cellAspect);
  dcan.width = cw; dcan.height = ch;
  dctx.clearRect(0, 0, cw, ch);
  dctx.fillStyle = '#000'; dctx.strokeStyle = '#000';
  dctx.__akFont = null; // resizing the canvas reset its font
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

/* character metrics per 1px of type size, measured at 1000px (canvas metrics are whole pixels) */
const cmCanvas = document.createElement('canvas').getContext('2d');
const charMetricCache = new Map();
function charMetrics(chr) {
  const key = state.unitFont + '|' + fontEpoch + '|' + chr;
  let v = charMetricCache.get(key);
  if (v) return v;
  const c = cmCanvas;
  c.font = unitFontSpec(1000);
  c.textAlign = 'left';
  c.textBaseline = 'alphabetic';
  const m = c.measureText(chr), H = c.measureText('H');
  c.textBaseline = 'middle';
  const mm = c.measureText(chr);
  c.textBaseline = 'alphabetic';
  v = {
    L: m.actualBoundingBoxLeft / 1000, R: m.actualBoundingBoxRight / 1000,
    A: m.actualBoundingBoxAscent / 1000, D: m.actualBoundingBoxDescent / 1000,
    adv: m.width / 1000, cap: H.actualBoundingBoxAscent / 1000,
    mid: ((m.fontBoundingBoxAscent ?? 0) - (mm.fontBoundingBoxAscent ?? 0)) / 1000, // baseline below the em-box middle
  };
  charMetricCache.set(key, v);
  return v;
}
// origin of a character relative to its cell centre, per 1px of type size
function charOrigin(chr) {
  const m = charMetrics(chr);
  if (state.charAlign === 'ink') return [-(m.R - m.L) / 2, (m.A - m.D) / 2]; // each glyph's ink box centred
  if (state.charAlign === 'em') return [-m.adv / 2, m.mid];                // the font's own em-box middle
  return [-m.adv / 2, m.cap / 2];                                           // cap height centred: letters sit like glyphs
}

function drawUnit(ctx, u, x, y, cw, ch, k, px, unitScale) {
  if (u.kind === 'char') {
    if (u.value === ' ') return;
    const fs = charPx(cw, ch) * unitScale * state.charScale;
    const spec = unitFontSpec(fs);
    if (ctx.__akFont !== spec) { ctx.font = spec; ctx.__akFont = spec; } // setting ctx.font is slow; callers reset __akFont
    ctx.textAlign = 'left';
    ctx.textBaseline = 'alphabetic';
    const [ox, oy] = charOrigin(u.value);
    ctx.setTransform(px * k, 0, 0, px * k, px * (x + state.charDX * cw), px * (y + state.charDY * ch));
    ctx.fillText(u.value, ox * fs, oy * fs);
    if (state.charWeight > 0) { // thicken by stroking the outline in the same colour
      ctx.lineWidth = state.charWeight * fs;
      ctx.lineJoin = 'round';
      ctx.strokeText(u.value, ox * fs, oy * fs);
    }
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
function themeCtx(items, cs = state) {
  if (!cs.themeOn || !cs.palette.length) return null;
  const lut = Theme.lut(cs.palette, cs.colorBlend);
  const n = lut.length - 1;
  const order = new Map(items.map((it, i) => [it.u.id, items.length > 1 ? i / (items.length - 1) : 0.5]));
  const { cols, rows } = dims();
  const physH = rows * state.cellAspect, physMax = Math.max(cols, physH);
  const ang = (cs.colorAngle * Math.PI) / 180, ca = Math.cos(ang), sa = Math.sin(ang);
  const { colorMode: mode, colorSeed: seed, colorSpread: spread, colorScope: scope, colorScale: scale } = cs;
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
  const csM = colorsFor('month'), csD = colorsFor('day');
  const thM = themeCtx(items, csM), thD = state.calOn ? themeCtx(items, csD) : thM;
  const sm = state.calOn ? styleMap : null;
  const bgU = state.bgUnit ? state.units.find((u) => u.id === state.bgUnit) : null;
  const thr = state.threshold;
  const knock = state.renderMode === 'knockout';
  const srcHex = isImg() && state.imgColor === 'source' ? imgHex : null; // the picture's own colours
  const ops = [];
  let custom = 0;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const v = t[r * cols + c];
      if (v < thr || !items.length) {
        if (bgU) ops.push({ c, r, u: bgU, k: 1, a: state.bgAlpha, col: csM.fg });
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
      const isDay = sm && sm[r * cols + c] === 2;
      const th = isDay ? thD : thM;
      const ink = srcHex ? srcHex[r * cols + c] : th && th.applies(u) ? th.at(c, r, tt, u) : (isDay ? csD.fg : csM.fg);
      ops.push({ c, r, u, k, a: 1, col: knock ? state.bg : ink, box: knock ? ink : null });
    }
  }
  ops.custom = custom;
  return ops;
}

/* ---------- 4. paint */
// calendar rules drawn as solid lines (in cell widths), or none
const vectorRules = () => (state.calOn && state.calLines && state.calLineMode === 'vector' ? calLayout().lines : []);

// W × H: artboard size in CSS px; px: device pixel ratio.
// vp (optional, zoomed preview): the visible window { x, y, w, h } of the artboard; only cells inside it are drawn.
function paint(ctx, W, H, ops, px, vp) {
  const { cols, rows } = dims();
  const cw = W / cols, ch = H / rows;
  const ox = vp ? vp.x : 0, oy = vp ? vp.y : 0;
  const base = () => ctx.setTransform(px, 0, 0, px, -ox * px, -oy * px);
  if (vp) { ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height); }
  base();
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
  ctx.__akFont = null;
  let col = null;
  const inset = state.grid ? Math.min(cw, ch) * 0.06 : 0;
  const c0 = vp ? Math.floor(ox / cw) - 1 : -1, c1 = vp ? Math.ceil((ox + vp.w) / cw) + 1 : cols + 1;
  const r0 = vp ? Math.floor(oy / ch) - 1 : -1, r1 = vp ? Math.ceil((oy + vp.h) / ch) + 1 : rows + 1;
  for (const op of ops) {
    if (op.c < c0 || op.c > c1 || op.r < r0 || op.r > r1) continue;
    if (op.box) {
      base();
      ctx.globalAlpha = 1;
      ctx.fillStyle = op.box;
      col = null;
      ctx.fillRect(op.c * cw + inset, op.r * ch + inset, cw - inset * 2 + (inset ? 0 : 0.5), ch - inset * 2 + (inset ? 0 : 0.5));
    }
    if (op.col !== col) { col = op.col; ctx.fillStyle = col; ctx.strokeStyle = col; }
    ctx.globalAlpha = op.a;
    drawUnit(ctx, op.u, (op.c + 0.5) * cw - ox, (op.r + 0.5) * ch - oy, cw, ch, op.k, px, state.unitScale);
  }
  const rules = vectorRules();
  if (rules.length) { // calendar rules as solid lines over the units
    base();
    ctx.globalAlpha = 1;
    ctx.fillStyle = state.calLineColor;
    for (const l of rules) ctx.fillRect(l.x0 * cw, (l.y - l.t / 2) * cw, (l.x1 - l.x0) * cw, l.t * cw);
  }
  const labels = holidayLabels();
  if (labels.length) { // holiday names as solid text over the units
    base();
    ctx.globalAlpha = 1;
    ctx.textBaseline = 'alphabetic';
    for (const l of labels) {
      ctx.font = `${l.size * cw}px ${holFontCss()}`;
      ctx.textAlign = l.align;
      ctx.fillStyle = l.color;
      ctx.fillText(l.text, l.x * cw, l.y * cw);
    }
  }
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1;
}

/* ---------- view (zoom & pan) */
let zoom = 1;                       // 1 = whole artboard fits the stage
let zoomLimits = { min: 1, max: 8 };
const view_ = { cx: 0.5, cy: 0.5 };  // centre of the visible window, as artboard fractions
let viewGeom = null;
const printScale = () => (state.cellPt * 96) / 72; // CSS px per cell at actual print size
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
  const [pid, orient] = pageOf();
  const pg = pid ? Calendar.paper(pid, orient) : null;
  el.innerHTML = (pg ? `용지 ${pg.paper.id} ${orient === 'landscape' ? '가로' : '세로'} (${fmtNum(pg.w * PT_MM)} × ${fmtNum(pg.h * PT_MM)} mm)에 맞춘 격자<br>` : '') +
    `${o.cols} × ${o.rows} 셀 · <b>${fmtNum(o.Wpt, 2)} × ${fmtNum(o.Hpt, 2)} pt</b><br>` +
    `${fmtNum(o.Wpt * PT_MM)} × ${fmtNum(o.Hpt * PT_MM)} mm · PNG ${o.pxW.toLocaleString()} × ${o.pxH.toLocaleString()} px @ ${o.dpi} dpi` +
    (o.clamped ? `<br>PNG가 너무 커서 ${o.dpi} dpi로 낮춰 저장합니다.` : '') +
    (TOOL === 'text' && textLayout().fitWidth ? '<br>가장 긴 줄이 좌우 여백에 닿아서 글자를 영역 높이보다 작게 맞췄습니다.' : '') +
    (rasterClip.length ? `<br><span class="warn">글자가 ${rasterClip.join('·')}에서 잘립니다. 글자 영역 높이나 세로 위치를 조절하세요.</span>` : '');
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
  const fit = Math.max(0.1, Math.min(availW / aw, availH / ah)); // CSS px per cell width when the whole artboard fits
  zoomLimits = { min: Math.min(1, printScale() / fit), max: Math.max(1, 64 / fit) };
  zoom = AK.clamp(zoom, zoomLimits.min, zoomLimits.max);
  const scale = fit * zoom;
  const dpr = Math.min(3, window.devicePixelRatio || 1);
  const artW = aw * scale, artH = ah * scale;
  // the canvas never grows past the stage; when zoomed in it shows a window of the artboard
  const W = Math.floor(Math.min(artW, availW)), H = Math.floor(Math.min(artH, availH));
  const vp = {
    x: AK.clamp(view_.cx * artW - W / 2, 0, Math.max(0, artW - W)),
    y: AK.clamp(view_.cy * artH - H / 2, 0, Math.max(0, artH - H)),
    w: W, h: H,
  };
  view_.cx = (vp.x + W / 2) / artW; view_.cy = (vp.y + H / 2) / artH; // keep the centre inside the artboard
  viewGeom = { artW, artH, vp, scale };
  if (view.width !== Math.round(W * dpr) || view.height !== Math.round(H * dpr)) {
    view.width = Math.round(W * dpr); view.height = Math.round(H * dpr);
  }
  view.style.width = W + 'px'; view.style.height = H + 'px';
  view.classList.toggle('zoomed', artW > W + 1 || artH > H + 1);
  lastOps = buildOps(frame);
  paint(vctx, artW, artH, lastOps, dpr, vp);
  renderZoomUI(scale);
  const { cols, rows } = dims();
  const bgCount = lastOps.filter((o) => o.a < 1).length;
  renderOutputInfo();
  const clip = rasterClip.length ? ` · ${rasterClip.join('·')} 잘림` : '';
  $('#info').classList.toggle('warn', rasterClip.length > 0);
  $('#info').title = rasterClip.length ? '글자가 용지 가장자리에 닿아 잘립니다. 글자 영역 높이나 세로 위치를 조절하세요.' : '';
  $('#info').textContent = `${isImg() ? `이미지 ${srcName} · ` : ''}${cols} × ${rows} 셀${clip} · ${fmtNum(cols * state.cellPt, 2)} pt · 유닛 ${(lastOps.length - bgCount).toLocaleString()} · 커스텀 글리프 ${lastOps.custom.toLocaleString()}`;
}
function requestRender() { if (!rafId) rafId = requestAnimationFrame(renderNow); }

function renderZoomUI(scale) {
  const o = $('#zoom-o');
  o.textContent = `${Math.round((scale / printScale()) * 100)}%`;
  o.title = `인쇄 크기 대비 배율 · 셀 하나가 화면에서 ${scale.toFixed(1)}px`;
  $('#zoom [data-z="fit"]').setAttribute('aria-pressed', String(Math.abs(zoom - 1) < 1e-3));
}
// zoom to z (multiples of "fit"), keeping the artboard point under the anchor (canvas CSS px) in place
function setZoom(z, anchor) {
  const g = viewGeom;
  const nz = AK.clamp(z, zoomLimits.min, zoomLimits.max);
  if (g && anchor) {
    const fx = (g.vp.x + anchor.x) / g.artW, fy = (g.vp.y + anchor.y) / g.artH;
    const k = nz / zoom, artW = g.artW * k, artH = g.artH * k;
    view_.cx = fx + (g.vp.w / 2 - anchor.x) / artW;
    view_.cy = fy + (g.vp.h / 2 - anchor.y) / artH;
  }
  zoom = nz;
  requestRender();
}
const canvasPoint = (e) => { const r = view.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
$('#zoom').addEventListener('click', (e) => {
  const b = e.target.closest('button');
  if (!b || !viewGeom) return;
  const mid = { x: viewGeom.vp.w / 2, y: viewGeom.vp.h / 2 };
  const fit = viewGeom.scale / zoom;
  if (b.dataset.z === 'in') setZoom(zoom * 1.5, mid);
  else if (b.dataset.z === 'out') setZoom(zoom / 1.5, mid);
  else if (b.dataset.z === 'fit') { view_.cx = 0.5; view_.cy = 0.5; setZoom(1); }
  else if (b.dataset.z === 'print') setZoom(printScale() / fit, mid);
});
view.addEventListener('wheel', (e) => {
  if (!viewGeom) return;
  if (e.ctrlKey || e.metaKey) { // pinch or ctrl/cmd + wheel
    e.preventDefault();
    setZoom(zoom * Math.exp(-e.deltaY * 0.01), canvasPoint(e));
  } else if (view.classList.contains('zoomed')) { // scroll pans the zoomed view
    e.preventDefault();
    view_.cx += e.deltaX / viewGeom.artW;
    view_.cy += e.deltaY / viewGeom.artH;
    requestRender();
  }
}, { passive: false });
let panFrom = null;
view.addEventListener('pointerdown', (e) => {
  if (e.button !== 0 || !view.classList.contains('zoomed')) return;
  panFrom = { x: e.clientX, y: e.clientY, cx: view_.cx, cy: view_.cy };
  view.setPointerCapture(e.pointerId);
  view.classList.add('panning');
});
view.addEventListener('pointermove', (e) => {
  if (!panFrom || !viewGeom) return;
  view_.cx = panFrom.cx - (e.clientX - panFrom.x) / viewGeom.artW;
  view_.cy = panFrom.cy - (e.clientY - panFrom.y) / viewGeom.artH;
  requestRender();
});
const endPan = () => { panFrom = null; view.classList.remove('panning'); };
view.addEventListener('pointerup', endPan);
view.addEventListener('pointercancel', endPan);
view.addEventListener('dblclick', (e) => { // close-up where a cell is ~16px, or back to fit
  if (!viewGeom) return;
  const fit = viewGeom.scale / zoom;
  if (zoom > 1.01) { view_.cx = 0.5; view_.cy = 0.5; setZoom(1); } else setZoom(16 / fit, canvasPoint(e));
});
new ResizeObserver(requestRender).observe(stage);

function syncAnimation() {
  clearInterval(animTimer);
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (state.animate && !reduce) animTimer = setInterval(() => { frame++; requestRender(); }, 1000 / state.fps);
}

/* ---------- controls schema */
const opt = (pairs) => pairs.map(([v, l]) => [v, l]);
const themed = (s) => s.themeOn;
const cal = (s) => s.calOn;
const SECTIONS = [
  { id: 'image', title: '이미지', en: 'IMAGE', tool: 'image', items: [
    { id: 'img-file', t: 'file', label: '이미지 불러오기 (PNG · JPG · WEBP · SVG)', accept: 'image/*', onFile: onImageFile },
    { id: 'img-note', t: 'note', text: '이미지를 미리보기에 끌어 놓거나 붙여넣어도 됩니다. 불러온 이미지는 이 브라우저에 기억합니다(JSON에는 들어가지 않습니다).' },
    { k: 'imgCols', t: 'range', label: '가로 셀 수', min: 20, max: 400, step: 1 },
    { k: 'imgTone', t: 'seg', label: '유닛을 채울 곳', options: () => opt([['auto', '배경 따라'], ['dark', '어두운 곳'], ['light', '밝은 곳']]) },
    { k: 'imgLo', t: 'range', label: '검은 점 (이보다 어두우면 완전 검정)', min: 0, max: 0.95, step: 0.01 },
    { k: 'imgHi', t: 'range', label: '흰 점 (이보다 밝으면 완전 흰색)', min: 0.05, max: 1, step: 0.01 },
    { k: 'imgColor', t: 'seg', label: '유닛 색', options: () => opt([['theme', '색 섹션 설정'], ['source', '이미지 색']]) },
    { k: 'imgQuant', t: 'range', label: '이미지 색 단계 (채널마다)', min: 2, max: 32, step: 1, when: (s) => s.imgColor === 'source' },
  ] },
  { id: 'text', title: '글자', en: 'TEXT', tool: 'text', items: [
    { k: 'txt', t: 'area', label: '텍스트 (최대 2줄)', lines: 2 },
    { k: 'txtPaper', t: 'select', label: '용지', options: () => Calendar.PAPERS.map((p) => [p.id, p.label]) },
    { k: 'txtOrient', t: 'seg', label: '방향', options: () => opt([['portrait', '세로'], ['landscape', '가로']]) },
    { k: 'txtSize', t: 'range', label: '글자 영역 높이 (용지 대비)', min: 0.05, max: 1, step: 0.01 },
    { k: 'txtLeading', t: 'range', label: '행간 (서체 높이 대비)', min: 0.5, max: 2, step: 0.01, when: (s) => s.txt.includes('\n') },
    { k: 'txtAlign', t: 'seg', label: '정렬', options: () => opt([['left', '왼쪽'], ['center', '가운데'], ['right', '오른쪽']]) },
    { k: 'txtVAlign', t: 'seg', label: '영역 위치', options: () => opt([['top', '위'], ['middle', '가운데'], ['bottom', '아래']]) },
    { k: 'txtDY', t: 'range', label: '세로 위치 (행)', min: -60, max: 60, step: 0.5 },
    { k: 'txtMargin', t: 'range', label: '바깥 여백 (셀)', min: 0, max: 30, step: 1 },
  ] },
  { id: 'calendar', title: '달력', en: 'CALENDAR', tool: 'calendar', items: [
    { k: 'calPaper', t: 'select', label: '용지', when: cal, options: () => Calendar.PAPERS.map((p) => [p.id, p.label]) },
    { k: 'calOrient', t: 'seg', label: '방향', when: cal, options: () => opt([['portrait', '세로'], ['landscape', '가로']]) },
    { k: 'calYear', t: 'number', label: '연도', min: 1900, max: 2100, step: 1, when: cal },
    { k: 'calMonth', t: 'select', label: '월', when: cal, options: () => Calendar.MONTHS.map((n, i) => [String(i + 1), `${i + 1}월 · ${n}`]) },
    { id: 'cal-nav', t: 'buttons', when: cal, buttons: () => [['‹ 이전 달', () => stepMonth(-1)], ['다음 달 ›', () => stepMonth(1)]] },
    { k: 'calLabel', t: 'select', label: '달 이름 표기', when: cal, options: () => Calendar.LABELS.map(([v]) => [v, Calendar.monthLabel(state.calMonth, v)]) },
    { k: 'calMonthAlign', t: 'seg', label: '달 이름 정렬', when: cal, options: () => opt([['left', '왼쪽'], ['center', '가운데']]) },
    { k: 'calMonthSize', t: 'range', label: '달 이름 영역 높이', min: 0.08, max: 0.5, step: 0.01, when: cal },
    { k: 'calWeekStart', t: 'seg', label: '한 주의 시작', when: cal, options: () => opt([['sun', '일요일'], ['mon', '월요일']]) },
    { k: 'calDayAlign', t: 'seg', label: '날짜 위치', when: cal, options: () => opt([['center', '칸 가운데'], ['left', '칸 왼쪽 위']]) },
    { k: 'calDaySize', t: 'range', label: '날짜 크기 (칸 높이 대비)', min: 0.2, max: 1, step: 0.01, when: cal },
    { k: 'calMargin', t: 'range', label: '바깥 여백 (셀)', min: 0, max: 30, step: 1, when: cal },
    { k: 'calGap', t: 'range', label: '달 이름과 날짜 사이 (행)', min: -30, max: 30, step: 1, when: cal },
    { k: 'calMonthDY', t: 'range', label: '달 이름 세로 위치 (행)', min: -60, max: 60, step: 0.5, when: cal },
    { k: 'calGridDY', t: 'range', label: '날짜 표 세로 위치 (행)', min: -60, max: 60, step: 0.5, when: cal },
    { k: 'calLines', t: 'check', label: '각 주 위에 가로선', when: cal },
    { k: 'calLineMode', t: 'seg', label: '선 표현', when: (s) => cal(s) && s.calLines, options: () => opt([['units', '유닛으로 채움'], ['vector', '실선']]) },
    { k: 'calLineW', t: 'range', label: '선 두께', min: 0.25, max: 24, step: 0.25, unit: ' pt', when: (s) => cal(s) && s.calLines },
    { k: 'calLineDY', t: 'range', label: '선 세로 위치 (행)', min: -20, max: 20, step: 0.25, when: (s) => cal(s) && s.calLines },
    { k: 'calLineColor', t: 'color', label: '선 색', when: (s) => cal(s) && s.calLines && s.calLineMode === 'vector' },
    { id: 'cal-line-note', t: 'note', when: (s) => cal(s) && s.calLines && s.calLineMode === 'units',
      text: '유닛으로 채움: 선도 날짜 색 테마의 유닛으로 그립니다. 셀 높이보다 가늘면 유닛이 흐리게 나오니, 두께를 셀 높이(셀 너비 × 셀 세로 비) 이상으로 두세요.' },
    { k: 'calSixWeeks', t: 'check', label: '항상 6주 칸으로 나누기', when: cal },
    { k: 'calSun', t: 'check', label: '일요일을 특별한 날로', when: cal },
    { k: 'calSat', t: 'check', label: '토요일을 특별한 날로', when: cal },
    { id: 'calSpecialText', t: 'line', label: '이 달의 특별한 날 (예: 3, 9, 24-26)', when: cal,
      get: () => state.calSpecial[calKey()] || '',
      put: (v) => { state.calSpecial = { ...state.calSpecial, [calKey()]: v }; } },
    { id: 'calHolText', t: 'line', label: '이 달의 공휴일 (예: 1 신정, 5-7 설날)', when: cal,
      get: () => state.calHol[calKey()] || '',
      put: (v) => { state.calHol = { ...state.calHol, [calKey()]: v }; } },
    { k: 'calHolSpecial', t: 'check', label: '공휴일을 특별한 날로', when: cal },
    { id: 'calHolFontName', t: 'line', label: '공휴일 텍스트 서체 (설치된 서체 이름)', when: cal,
      get: () => state.calHolFont, put: (v) => { state.calHolFont = v.trim() || 'YMG Gothic'; } },
    { id: 'cal-hol-font', t: 'buttons', when: cal, buttons: () => [['설치된 서체 불러오기', loadLocalHolidayFont]] },
    { id: 'cal-hol-file', t: 'file', label: '공휴일 서체 파일 올리기 (.ttf .otf)', accept: '.ttf,.otf', when: cal, onFile: onHolidayFontFile },
    { id: 'cal-hol-note', t: 'note', when: cal,
      text: '화면과 PNG는 이름으로 찾은 설치 서체로 그립니다. SVG에서 아웃라인으로 바꾸려면 “설치된 서체 불러오기”(Chrome·Edge)나 파일 올리기로 서체 데이터를 한 번 불러오세요. 새로고침하면 다시 불러와야 합니다.' },
    { k: 'calHolPt', t: 'range', label: '공휴일 텍스트 크기', min: 2, max: 36, step: 0.25, unit: ' pt', when: cal },
    { k: 'calHolDY', t: 'range', label: '공휴일 텍스트 세로 위치 (행)', min: -10, max: 10, step: 0.1, when: cal },
    { k: 'calHolColorMode', t: 'seg', label: '공휴일 텍스트 색', when: cal, options: () => opt([['custom', '직접 고르기'], ['month', '달 이름 팔레트']]) },
    { k: 'calHolColor', t: 'color', label: '색', when: (s) => cal(s) && s.calHolColorMode === 'custom' },
    { k: 'calHolColorIdx', t: 'range', label: '팔레트의 몇 번째 색', min: 1, max: 8, step: 1, when: (s) => cal(s) && s.calHolColorMode === 'month' },
    { k: 'calMonthPalette', t: 'check', label: '월별 팔레트 자동 적용 (달 이름 · 특별한 날)', when: cal },
    { id: 'cal-mp-note', t: 'note', when: (s) => cal(s) && s.calMonthPalette,
      text: `달을 바꾸면 그 달의 팔레트와 배경을 달 이름 색에 넣습니다. 팔레트가 없는 달은 그대로 둡니다.` },
    { id: 'cal-note', t: 'note', when: cal, text: '특별한 날은 달 이름과 같은 색 테마로 칠합니다. 색 섹션의 “편집할 색”으로 두 테마를 오가며 고치세요.' },
    { id: 'cal-export', t: 'buttons', when: cal, buttons: () => [['12달 SVG (ZIP)', () => exportYear('svg')], ['12달 PNG (ZIP)', () => exportYear('png')]] },
  ] },
  { id: 'source', title: '서체', en: 'TYPEFACE', tool: ['text', 'calendar'], items: [
    { k: 'font', t: 'select', label: '서체', options: () => LETTER_FONTS.map((f) => [f, f]) },
    { k: 'weight', t: 'range', label: '굵기', min: 100, max: 900, step: 100 },
    { k: 'italic', t: 'check', label: '이탤릭' },
    { id: 'font-file', t: 'file', label: '서체 파일 올리기 (.ttf .otf .woff2)', accept: '.ttf,.otf,.woff,.woff2' },
  ] },
  { id: 'color', title: '색', en: 'COLOR', items: [
    { k: 'colorTarget', t: 'seg', label: '편집할 색 (달력)', when: cal, options: () => opt([['month', '달 이름 · 특별한 날'], ['day', '날짜']]) },
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
// character-unit settings live in the units panel (right)
const UNIT_SECTIONS = [
  { id: 'charunits', title: '문자 유닛 조정', en: 'CHARACTERS', items: [
    { k: 'charAlign', t: 'seg', label: '세로 맞춤', options: () => opt([['cap', '대문자 기준'], ['ink', '글자마다'], ['em', '서체 기본']]) },
    { k: 'charScale', t: 'range', label: '크기', min: 0.4, max: 1.8, step: 0.01 },
    { k: 'charWeight', t: 'range', label: '두께 (획을 바깥으로 굵히기)', min: 0, max: 0.15, step: 0.005 },
    { k: 'charDX', t: 'range', label: '가로 위치 (셀 너비 대비)', min: -0.5, max: 0.5, step: 0.01 },
    { k: 'charDY', t: 'range', label: '세로 위치 (셀 높이 대비)', min: -0.5, max: 0.5, step: 0.01 },
    { id: 'char-note', t: 'note', text: '대문자 기준: 대문자 높이의 가운데를 셀 가운데에 맞춰 커스텀 글리프와 높이가 고르게 맞습니다. 글자마다: 각 글자의 잉크를 셀 가운데에 둡니다(마침표·밑줄도 가운데로). 서체 기본: 예전 방식입니다.' },
  ] },
];
const ALL_ITEMS = [...SECTIONS, ...UNIT_SECTIONS].flatMap((s) => s.items);

function bgUnitOptions() {
  return [['', '없음']].concat(state.units.map((u) => [u.id, u.kind === 'char' ? `문자 “${u.value === ' ' ? '␠' : u.value}”` : `글리프 · ${(glyphById(u.glyph) || {}).name}`]));
}

const fmt = (it, v) => {
  const dec = String(it.step).split('.')[1];
  return (dec ? Number(v).toFixed(dec.length) : String(v)) + (it.unit || '');
};

const SEC_KEY = 'askiical:sections';
let secOpen = { charunits: false, calendar: true, source: true, color: true, grid: false, output: true, tone: true, map: false };
try { Object.assign(secOpen, JSON.parse(localStorage.getItem(SEC_KEY) || '{}')); } catch (e) { /* defaults */ }

function buildControls() {
  buildSections($('#controls'), SECTIONS);
  buildSections($('#unit-controls'), UNIT_SECTIONS);
}
function buildSections(host, sections) {
  host.innerHTML = '';
  for (const sec of sections) {
    const el = document.createElement('details');
    el.className = 'ctl-sec';
    sec.el = el;
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
        row.querySelector('input').addEventListener('change', it.onFile || onFontFile);
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
      } else if (it.t === 'area') {
        row.innerHTML = `<label for="${id}">${it.label}</label><textarea id="${id}" rows="${it.lines}" autocomplete="off" spellcheck="false"></textarea>`;
        it.input = row.querySelector('textarea');
        it.input.addEventListener('keydown', (e) => { // no line past the limit
          if (e.key === 'Enter' && it.input.value.split('\n').length >= it.lines) e.preventDefault();
        });
        it.input.addEventListener('input', () => {
          const v = it.input.value.split('\n').slice(0, it.lines).join('\n');
          if (v !== it.input.value) it.input.value = v;
          set(it.k, v);
        });
      } else if (it.t === 'line') {
        row.className = 'ctl ctl-text-line';
        row.innerHTML = `<label for="${id}">${it.label}</label><input type="text" id="${id}" autocomplete="off">`;
        it.input = row.querySelector('input');
        it.input.addEventListener('input', () => { it.put(it.input.value); persist(); requestRender(); });
      } else if (it.t === 'buttons') {
        row.className = 'ctl ctl-buttons';
        const list = it.buttons();
        row.innerHTML = `<div class="row-btns split">${list.map(([l], i) => `<button type="button" data-i="${i}">${AK.esc(l)}</button>`).join('')}</div>`;
        row.querySelectorAll('button').forEach((b) => (b.onclick = () => list[+b.dataset.i][1]()));
      } else if (it.t === 'note') {
        row.className = 'ctl ctl-note';
        row.innerHTML = `<p class="note">${AK.esc(it.text)}</p>`;
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
    if (it.t === 'line') { if (it.input !== document.activeElement) it.input.value = it.get(); continue; }
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
  for (const sec of [...SECTIONS, ...UNIT_SECTIONS]) if (sec.el) sec.el.hidden = !!sec.tool && ![].concat(sec.tool).includes(TOOL);
  for (const it of ALL_ITEMS) if (it.when) it.row.hidden = !it.when(state);
}

/* ---------- colour theme panel */
function buildThemeUI(row) {
  row.innerHTML =
    `<div class="theme-presets" id="theme-presets" role="group" aria-label="테마 팔레트">${Theme.PRESETS.map((p, i) =>
      `<button type="button" data-i="${i}" title="${AK.esc(p.name)} · 배경과 팔레트를 함께 바꿉니다"><span class="stripe" style="background:${p.bg}">${p.colors.map((c) => `<i style="background:${c}"></i>`).join('')}</span><span>${AK.esc(p.name)}</span></button>`).join('')}</div>` +
    `<div class="theme-presets-label">월별 팔레트</div>` +
    `<div class="theme-presets" id="theme-monthly" role="group" aria-label="월별 팔레트">${Object.entries(Theme.MONTHLY).map(([m, p]) =>
      `<button type="button" data-m="${m}" title="${AK.esc(p.name)} 팔레트 · 배경과 팔레트를 함께 바꿉니다"><span class="stripe" style="background:${p.bg};box-shadow:inset 0 0 0 1px var(--line)">${p.colors.map((c) => `<i style="background:${c}"></i>`).join('')}</span><span>${AK.esc(p.name)}</span></button>`).join('')}</div>` +
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
  row.querySelector('#theme-monthly').onclick = (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    const p = Theme.MONTHLY[b.dataset.m];
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

const LAYOUT_KEYS = new Set(['cellAspect', 'imgCols']);
const THEME_KEYS = new Set(['themeOn', 'colorBlend', 'colorScope', 'colorMode', 'bg', 'fg']);
const CHAR_KEYS = new Set(['charAlign', 'charScale', 'charWeight', 'charDX', 'charDY']);
function set(k, v) {
  if (typeof SHAPE_DEFAULTS[k] === 'number' && typeof v === 'string') v = +v; // selects hand back strings
  if (k === 'colorTarget') { switchColorTarget(v); return; }
  state[k] = v;
  if (k === 'calMonth' || k === 'calYear' || k === 'calMonthPalette') applyMonthPalette();
  if (k === 'calMonth' || k === 'calYear' || k === 'calMonthPalette') syncControls(); // month label examples and special days follow the month
  if (k === 'cellAspect') densityCache.clear();
  if (k === 'animate' || k === 'fps') syncAnimation();
  syncVisibility();
  if (k === 'themeOn' && v) requestAnimationFrame(renderThemeUI); // swatches were hidden, size the bar now
  if (k === 'colorBlend') drawPalBar();
  if (LAYOUT_KEYS.has(k) || THEME_KEYS.has(k) || CHAR_KEYS.has(k) || k === 'unitFont') renderRamp();
  if (CHAR_KEYS.has(k)) { clearTimeout(set.chipTimer); set.chipTimer = setTimeout(renderUnits, 150); } // chip ink % follows
  persist();
  requestRender();
}

// swap the colour set being edited (state) with the stored one (altColors)
function switchColorTarget(t) {
  if (t === state.colorTarget) return;
  const cur = pickColors(state);
  Object.assign(state, pickColors(state.altColors));
  state.altColors = cur;
  state.colorTarget = t;
  syncControls();
  renderRamp();
  persist();
  requestRender();
}
const calKey = () => `${state.calYear}-${String(state.calMonth).padStart(2, '0')}`;
function stepMonth(d) {
  let m = state.calMonth + d, y = state.calYear;
  if (m < 1) { m = 12; y--; } else if (m > 12) { m = 1; y++; }
  state.calMonth = m; state.calYear = y;
  applyMonthPalette();
  syncControls(); persist(); requestRender();
}
// holiday labels in cell widths: the baseline sits 0.8 type sizes below the top edge under the day number
function holidayLabels() {
  if (!state.calOn) return [];
  const lay = calLayout();
  if (!lay.labels.length) return [];
  const size = state.calHolPt / state.cellPt;
  const dy = state.calHolDY * state.cellAspect;
  let color = state.calHolColor;
  if (state.calHolColorMode === 'month') {
    const m = colorsFor('month');
    color = m.themeOn && m.palette.length ? m.palette[Math.min(state.calHolColorIdx, m.palette.length) - 1] : m.fg;
  }
  return lay.labels.map((l) => ({ text: l.text, x: l.x, y: l.top + size * 0.8 + dy, size, align: l.align, color }));
}
const holFontCss = () => `"${state.calHolFont.replace(/"/g, '')}", "IBM Plex Sans KR", sans-serif`;

// label font data: registered under its own family name so the preview and the outline export use the same face
async function useHolidayFont(buf, fallbackName) {
  await Outline.ensureFonts(); // brings in opentype.js
  let fam = fallbackName;
  try {
    const f = opentype.parse(buf.slice(0));
    const n = f.names.preferredFamily || f.names.typographicFamily || f.names.fontFamily || {};
    fam = n.en || n.ko || Object.values(n)[0] || fam;
  } catch (e) { /* unreadable for outlines; the preview still works */ }
  const face = new FontFace(fam, buf.slice(0));
  await face.load();
  document.fonts.add(face);
  userFonts[fam] = buf.slice(0);
  state.calHolFont = fam;
  syncControls(); persist(); requestRender();
  return fam;
}
async function loadLocalHolidayFont() {
  if (!window.queryLocalFonts) { toast('이 브라우저는 설치된 서체를 읽을 수 없습니다 (Chrome·Edge에서 됩니다). 서체 파일을 올려 주세요.'); return; }
  try {
    const norm = (t) => String(t).toLowerCase().replace(/[\s_-]+/g, '');
    const want = norm(state.calHolFont);
    const all = await window.queryLocalFonts();
    const hits = all.filter((f) => norm(f.family) === want || norm(f.fullName).startsWith(want) || norm(f.postscriptName).startsWith(want));
    if (!hits.length) { toast(`설치된 서체에서 “${state.calHolFont}”을 찾지 못했습니다. 이름을 확인하거나 파일을 올려 주세요.`); return; }
    const pick = hits.find((f) => norm(f.fullName) === want) || hits.find((f) => /^(regular|normal|book|medium)$/i.test(f.style)) || hits[0];
    const buf = await (await pick.blob()).arrayBuffer();
    await useHolidayFont(buf, pick.family);
    toast(`“${pick.fullName}”을 불러왔습니다. SVG에서 공휴일 텍스트가 아웃라인이 됩니다. 굵기를 바꾸려면 서체 이름에 굵기까지 적으세요 (예: ${pick.family} Bold).`);
  } catch (err) {
    toast('설치된 서체를 읽지 못했습니다: ' + err.message);
  }
}
async function onHolidayFontFile(e) {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const fam = await useHolidayFont(await f.arrayBuffer(), f.name.replace(/\.[^.]+$/, ''));
    toast(`공휴일 서체 “${fam}”을 불러왔습니다.`);
  } catch (err) {
    toast('서체 파일을 읽지 못했습니다. TTF나 OTF 파일인지 확인하세요.');
  }
}

// calendar: put the month's own palette (Theme.MONTHLY) into the month-name colour set
function applyMonthPalette() {
  const p = state.calOn && state.calMonthPalette && Theme.MONTHLY[state.calMonth];
  if (!p) return false;
  const set = state.colorTarget === 'month' ? state : state.altColors;
  set.palette = p.colors.slice();
  set.themeOn = true;
  state.bg = p.bg;
  renderThemeUI();
  renderRamp();
  return true;
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
  c.__akFont = null;
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
  const s = { ...SHAPE_DEFAULTS };
  for (const [k, v] of Object.entries(p.set)) if (k in SHAPE_DEFAULTS) s[k] = Array.isArray(v) ? v.slice() : v;
  s.palette = s.palette.slice();
  // presets describe a look; the print setup (cell size, dpi) and each tool's own content stay the user's
  s.cellPt = state.cellPt; s.dpi = state.dpi; s.calOn = state.calOn;
  for (const k of Object.keys(SHAPE_DEFAULTS)) if (/^(cal|img|txt)/.test(k)) s[k] = state[k];
  if (isImg()) for (const k of ['shade', 'shadeDepth', 'halo', 'edge', 'blur', 'invert']) s[k] = state[k]; // letter shading would bend the picture's tones
  s.colorTarget = state.colorTarget; s.altColors = state.altColors; // a preset restyles the colour set being edited
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
// the page the current tool lays out on: [paper id, orientation], or [] for the image tool
const pageOf = () => (isImg() ? [] : state.calOn ? [state.calPaper, state.calOrient] : [state.txtPaper, state.txtOrient]);
const paperTag = () => { const [p, o] = pageOf(); return `${p}${o === 'landscape' ? '-land' : ''}`; };
const baseName = () => isImg() ? `askiical-img-${srcName.replace(/[^\p{L}\p{N}_-]/gu, '') || 'image'}-${dims().cols}x${dims().rows}` : state.calOn ? `askiical-${calKey()}-${paperTag()}`
  : `askiical-${state.txt.replace(/\s+/g, '_').replace(/[^\p{L}\p{N}_]/gu, '').slice(0, 24) || 'text'}-${paperTag()}`;

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

// 12 months of the selected year in one ZIP, same settings for every page
let exporting = false;
const LABEL_TEXT_MSG = '공휴일 텍스트는 서체 데이터가 없어 텍스트로 남았습니다. “설치된 서체 불러오기”나 파일 올리기 후 다시 저장하면 아웃라인이 됩니다.';
async function exportYear(kind) {
  if (!state.calOn || exporting) return;
  exporting = true;
  const keep = state.calMonth, year = state.calYear;
  const keepColors = { bg: state.bg, cur: pickColors(state), alt: pickColors(state.altColors) };
  const enc = new TextEncoder();
  const files = [];
  let labelText = false;
  try {
    if (kind === 'svg') {
      await Outline.ensureFonts();
      for (const [fam, buf] of Object.entries(userFonts)) Outline.addFont(fam, buf);
    }
    for (let m = 1; m <= 12; m++) {
      toast(`${year}년 ${m}월을 만드는 중입니다… (${m}/12)`);
      await new Promise((r) => setTimeout(r, 0)); // let the toast paint
      state.calMonth = m;
      applyMonthPalette();
      const o = outputSize();
      const ops = buildOps(0);
      const name = `askiical-${year}-${String(m).padStart(2, '0')}-${paperTag()}`;
      if (kind === 'svg') {
        const res = Outline.build({ state, dims: dims(), ops, glyphById, charPx, W: o.Wpt, H: o.Hpt, unit: 'pt', rules: vectorRules(), labels: holidayLabels() });
        if (res.labelText) labelText = true;
        files.push({ name: name + '.svg', data: enc.encode(res.svg) });
      } else {
        const cv = document.createElement('canvas');
        cv.width = o.pxW; cv.height = o.pxH;
        paint(cv.getContext('2d'), o.pxW, o.pxH, ops, 1);
        const blob = await new Promise((r) => cv.toBlob(r, 'image/png'));
        if (!blob) throw new Error('PNG를 만들지 못했습니다. 셀 너비나 해상도를 낮춰 보세요.');
        files.push({ name: `${name}-${o.dpi}dpi.png`, data: new Uint8Array(await (await withDpi(blob, o.dpi)).arrayBuffer()) });
      }
    }
    toast('ZIP으로 묶는 중입니다…');
    download(`askiical-${year}-calendar-${paperTag()}-${kind}.zip`, await Calendar.zip(files));
    toast(`${year}년 12달을 ${kind.toUpperCase()}로 묶어 저장했습니다.` + (labelText ? ' ' + LABEL_TEXT_MSG : ''));
  } catch (err) {
    toast('12달 내보내기에 실패했습니다: ' + err.message);
  } finally {
    state.calMonth = keep;
    state.bg = keepColors.bg; Object.assign(state, keepColors.cur); state.altColors = keepColors.alt;
    renderThemeUI(); renderRamp();
    exporting = false;
    requestRender();
  }
}

$('#ex-svg').onclick = async () => {
  const btn = $('#ex-svg');
  btn.disabled = true;
  toast('아웃라인 SVG를 만드는 중입니다…');
  try {
    await Outline.ensureFonts();
    for (const [fam, buf] of Object.entries(userFonts)) Outline.addFont(fam, buf);
    const o = outputSize();
    const res = Outline.build({ state, dims: dims(), ops: buildOps(frame), glyphById, charPx, W: o.Wpt, H: o.Hpt, unit: 'pt', rules: vectorRules(), labels: holidayLabels() });
    download(baseName() + '-outline.svg', new Blob([res.svg], { type: 'image/svg+xml' }));
    if (res.labelText) toast(LABEL_TEXT_MSG);
    else toast(res.missing.length
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
    toast(`${f.name}을 불러왔습니다.` + (isImg() && state.shade !== 'solid' ? ' 톤 섹션의 “안쪽 음영”이 글자용 설정이라 이미지 명암이 달라 보이면 “단색”으로 바꾸세요.' : ''));
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

/* ---------- tool switch */
const TOOL_SUB = { text: 'ASCII 유닛으로 글자를 짓는 타이포그래피 시뮬레이터', calendar: 'ASCII 유닛으로 한 달을 한 장에 짓는 달력', image: '이미지를 ASCII 유닛으로 다시 그리는 도구' };
const TOOL_TITLE = { text: 'Askiical Letter Lab', calendar: 'Askiical Calendar Lab', image: 'Askiical Image Lab' };
function applyToolChrome() {
  $('#tool-sub').textContent = TOOL_SUB[TOOL];
  document.title = TOOL_TITLE[TOOL];
  for (const b of $('#tool-switch').querySelectorAll('button')) b.setAttribute('aria-pressed', String(b.dataset.tool === TOOL));
}
function switchTool(t) {
  if (t === TOOL) return;
  clearTimeout(saveTimer);
  try { localStorage.setItem(storeKey(), JSON.stringify(projectJSON())); } catch (e) { /* ignore */ }
  TOOL = t;
  try { localStorage.setItem(TOOL_KEY, t); } catch (e) { /* ignore */ }
  try { history.replaceState(null, '', `?tool=${t}`); } catch (e) { /* file:// may refuse */ }
  state = makeDefaultState();
  carriedCalOn = false;
  loadStored();
  rasterKey = ''; densityCache.clear();
  zoom = 1; view_.cx = 0.5; view_.cy = 0.5;
  applyToolChrome();
  afterStructuralChange();
}
$('#tool-switch').onclick = (e) => { const b = e.target.closest('button'); if (b) switchTool(b.dataset.tool); };
// image tool: drop or paste a picture onto the page
stage.addEventListener('dragover', (e) => { if (!isImg()) return; e.preventDefault(); stage.classList.add('drop'); });
stage.addEventListener('dragleave', () => stage.classList.remove('drop'));
stage.addEventListener('drop', (e) => {
  stage.classList.remove('drop');
  if (!isImg()) return;
  e.preventDefault();
  loadImageFile(e.dataTransfer.files[0]);
});
window.addEventListener('paste', (e) => {
  if (!isImg() || /^(INPUT|TEXTAREA)$/.test(document.activeElement.tagName)) return;
  const f = [...(e.clipboardData || {}).files || []].find((x) => /^image\//.test(x.type));
  if (f) { e.preventDefault(); loadImageFile(f); }
});

/* ---------- boot */
window.addEventListener('resize', () => { renderRamp(); drawPalBar(); });
buildControls();
loadStored();
loadStoredSource();
applyToolChrome();
afterStructuralChange();
document.fonts.ready.then(() => { densityCache.clear(); rasterKey = ''; afterUnitsChange(); });
