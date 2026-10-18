'use strict';
/* theme.js — colour palettes for glyph units.
   A theme is a background plus 1–8 ink colours. The app maps every cell to a position 0–1
   (by tone, noise patch, gradient, random or unit order) and reads the colour from a lookup
   table built here: "step" keeps only the palette colours, "smooth" interpolates in OKLab. */

const Theme = (() => {
  const clamp = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);

  const hexToRgb = (h) => {
    h = String(h).replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    const n = parseInt(h, 16) || 0;
    return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
  };
  const rgbToHex = (rgb) => '#' + rgb.map((v) => Math.round(clamp(v) * 255).toString(16).padStart(2, '0')).join('');
  const toLin = (c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
  const toSrgb = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);

  function rgbToOklab([r, g, b]) {
    r = toLin(r); g = toLin(g); b = toLin(b);
    const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
    const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
    const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
    return [
      0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
      1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
      0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
    ];
  }
  function oklabToRgbRaw([L, a, b]) {
    const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
    const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
    const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
    return [
      toSrgb(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
      toSrgb(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
      toSrgb(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
    ];
  }
  const inGamut = (rgb) => rgb.every((v) => v >= -0.001 && v <= 1.001 && !Number.isNaN(v));
  // OKLCH → hex, reducing chroma until the colour fits in sRGB
  function oklch(L, C, h) {
    const hr = (h * Math.PI) / 180;
    for (let c = C; c >= 0; c -= 0.005) {
      const rgb = oklabToRgbRaw([L, c * Math.cos(hr), c * Math.sin(hr)]);
      if (inGamut(rgb)) return rgbToHex(rgb);
    }
    return rgbToHex(oklabToRgbRaw([L, 0, 0]));
  }

  // lookup table of n hex colours for positions 0..1
  function lut(palette, blend, n = 64) {
    const cols = palette.length ? palette : ['#ffffff'];
    const out = new Array(n);
    if (blend !== 'smooth' || cols.length === 1) {
      for (let i = 0; i < n; i++) out[i] = cols[Math.min(cols.length - 1, Math.floor((i / n) * cols.length))];
      return out;
    }
    const labs = cols.map((c) => rgbToOklab(hexToRgb(c)));
    for (let i = 0; i < n; i++) {
      const p = (i / (n - 1)) * (labs.length - 1);
      const k = Math.min(labs.length - 2, Math.floor(p)), t = p - k;
      const a = labs[k], b = labs[k + 1];
      out[i] = rgbToHex(oklabToRgbRaw([a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]));
    }
    return out;
  }

  const lightness = (hex) => rgbToOklab(hexToRgb(hex))[0];

  // random harmonious palette: one base hue, a scheme, a lightness ramp, and a background that contrasts with it
  const SCHEMES = [
    ['유사색', [0, 25, 50, 75]],
    ['보색', [0, 20, 180, 200]],
    ['삼각', [0, 120, 240, 30]],
    ['분할보색', [0, 150, 210, 15]],
    ['사각', [0, 90, 180, 270]],
  ];
  function harmony(seed) {
    let a = (seed * 2654435761) >>> 0;
    const rnd = () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    const base = rnd() * 360;
    const [schemeName, offs] = SCHEMES[Math.floor(rnd() * SCHEMES.length)];
    const dark = rnd() < 0.6;
    const chroma = 0.09 + rnd() * 0.12;
    const colors = offs.map((o, i) => {
      const L = dark ? 0.62 + (i / (offs.length - 1)) * 0.3 : 0.3 + (i / (offs.length - 1)) * 0.32;
      return oklch(L, chroma * (0.75 + rnd() * 0.5), (base + o + (rnd() - 0.5) * 12 + 360) % 360);
    });
    if (!dark) colors.reverse(); // keep palette order "lightest ink first" on light grounds too
    const bg = dark ? oklch(0.14 + rnd() * 0.06, 0.02 + rnd() * 0.03, base + 180) : oklch(0.94 + rnd() * 0.03, 0.015 + rnd() * 0.02, base + 30);
    return { name: schemeName, bg, colors };
  }

  const PRESETS = [
    { name: '리소', bg: '#f3eee4', colors: ['#ff48b0', '#0078bf', '#ffe800', '#00a95c'] },
    { name: '노을', bg: '#1b1026', colors: ['#ffd27a', '#ff8a5b', '#e24a6d', '#8c3b9e'] },
    { name: '바다', bg: '#04131f', colors: ['#e6f7ff', '#7fd6f2', '#2f98d9', '#2457a8'] },
    { name: '숲', bg: '#0f1a12', colors: ['#eef7cf', '#a9d873', '#55a35c', '#2b6644'] },
    { name: '네온', bg: '#07060d', colors: ['#3dff6e', '#19e3ff', '#ff3bd4', '#fff23a'] },
    { name: '흙', bg: '#ece3d3', colors: ['#7c8a55', '#c48e55', '#8f5a3a', '#3d2b1f'] },
    { name: '캔디', bg: '#fff5f8', colors: ['#bdb2ff', '#a0c4ff', '#ffadc6', '#ff6f91'] },
    { name: '청사진', bg: '#1638d9', colors: ['#ffffff', '#c8d6ff', '#86a6ff'] },
    { name: '신호', bg: '#0a0a0a', colors: ['#f1f1f1', '#9a9a9a', '#ff3b2f'] },
    { name: '모노', bg: '#0b0b0a', colors: ['#ffffff', '#a8a8a8', '#5c5c5c'] },
  ];

  // the user's month palettes (2027 calendar), read from their exported SVGs; keyed by month number.
  // Calendar mode can apply them to the month-name set automatically (see calMonthPalette in app.js).
  const MONTHLY = {
    1: { name: '1월', bg: '#ffffff', colors: ['#e0acff', '#ff9ee0', '#0fc37c', '#73933d'] },
    2: { name: '2월', bg: '#ffffff', colors: ['#16b7d8', '#17999a', '#007bff', '#44468d'] },
    3: { name: '3월', bg: '#ffffff', colors: ['#ff48b0', '#0078bf', '#fff700', '#00a95c'] },
    4: { name: '4월', bg: '#ffffff', colors: ['#a494ff', '#a0c4ff', '#ffadc6', '#ff6f91'] },
    5: { name: '5월', bg: '#ffffff', colors: ['#feb3ff', '#55a35c', '#008035', '#004d47'] },
    6: { name: '6월', bg: '#ffffff', colors: ['#769323', '#b62c2a', '#5c2a8d', '#07343b'] },
    7: { name: '7월', bg: '#ffffff', colors: ['#ffadad', '#afc332', '#0095ff', '#665c00'] },
    8: { name: '8월', bg: '#ffffff', colors: ['#ffd27a', '#ff0059', '#e24a6d', '#8c3b9e'] },
    9: { name: '9월', bg: '#ffffff', colors: ['#7c8a55', '#c48e55', '#a80000', '#3d2b1f'] },
    10: { name: '10월', bg: '#ffffff', colors: ['#ffdd00', '#ff6200', '#8b4b68', '#6c5128'] },
    11: { name: '11월', bg: '#ffffff', colors: ['#ffe761', '#56d2bf', '#b27aff', '#804200'] },
    12: { name: '12월', bg: '#ffffff', colors: ['#d5b26c', '#ff0000', '#0c7e13', '#c20a00', '#0a2e00'] },
  };

  const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

  return { lut, harmony, lightness, PRESETS, MONTHLY, isHex };
})();
