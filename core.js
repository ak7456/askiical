'use strict';
/* core.js — math, noise, glyph geometry and SVG import shared by the app and the glyph editor.
   Custom glyphs live in a 0–100 square: pixels on an N×N grid plus vector shapes (SVG path d + optional matrix). */

const AK = {};

AK.clamp = (v, a = 0, b = 1) => (v < a ? a : v > b ? b : v);
AK.uid = () => Math.random().toString(36).slice(2, 9);
AK.esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
AK.round = (n) => Math.round(n * 100) / 100;

// Integer hash → [0,1). Deterministic per (x, y, seed).
AK.hash = (x, y, s) => {
  let h = Math.imul(x | 0, 374761393) ^ Math.imul(y | 0, 668265263) ^ Math.imul(s | 0, 2246822519);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
};

AK.vnoise = (x, y, s) => {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = AK.hash(xi, yi, s), b = AK.hash(xi + 1, yi, s);
  const c = AK.hash(xi, yi + 1, s), d = AK.hash(xi + 1, yi + 1, s);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
};

// 4-octave value noise, stretched so it actually reaches 0 and 1.
AK.fbm = (x, y, s) => {
  let t = 0, amp = 0.5, f = 1, n = 0;
  for (let o = 0; o < 4; o++) {
    t += amp * AK.vnoise(x * f, y * f, s + o * 101);
    n += amp; amp *= 0.5; f *= 2;
  }
  return AK.clamp((t / n - 0.5) * 2 + 0.5);
};

// Separable box blur, 3 passes ≈ gaussian. Outside the field counts as 0.
AK.blur = (src, w, h, r) => {
  r = Math.round(r);
  const a = Float32Array.from(src);
  if (r < 1) return a;
  const b = new Float32Array(w * h);
  const n = 2 * r + 1;
  for (let pass = 0; pass < 3; pass++) {
    for (let y = 0; y < h; y++) {
      let s = 0;
      for (let x = -r; x <= r; x++) if (x >= 0 && x < w) s += a[y * w + x];
      for (let x = 0; x < w; x++) {
        b[y * w + x] = s / n;
        const xo = x - r, xi = x + r + 1;
        if (xo >= 0) s -= a[y * w + xo];
        if (xi < w) s += a[y * w + xi];
      }
    }
    for (let x = 0; x < w; x++) {
      let s = 0;
      for (let y = -r; y <= r; y++) if (y >= 0 && y < h) s += b[y * w + x];
      for (let y = 0; y < h; y++) {
        a[y * w + x] = s / n;
        const yo = y - r, yi = y + r + 1;
        if (yo >= 0) s -= b[yo * w + x];
        if (yi < h) s += b[yi * w + x];
      }
    }
  }
  return a;
};

/* ---------- path builders (0–100 space) */
const R = AK.round;
AK.d = {
  rect: (x, y, w, h) => `M${R(x)} ${R(y)}H${R(x + w)}V${R(y + h)}H${R(x)}Z`,
  ellipse: (cx, cy, rx, ry) =>
    `M${R(cx - rx)} ${R(cy)}A${R(rx)} ${R(ry)} 0 1 0 ${R(cx + rx)} ${R(cy)}A${R(rx)} ${R(ry)} 0 1 0 ${R(cx - rx)} ${R(cy)}Z`,
  poly: (pts, closed) => 'M' + pts.map((p) => R(p[0]) + ' ' + R(p[1])).join('L') + (closed ? 'Z' : ''),
  roundRect: (x, y, w, h, rx, ry) => {
    rx = Math.min(rx, w / 2); ry = Math.min(ry || rx, h / 2);
    if (!rx || !ry) return AK.d.rect(x, y, w, h);
    return `M${R(x + rx)} ${R(y)}H${R(x + w - rx)}A${R(rx)} ${R(ry)} 0 0 1 ${R(x + w)} ${R(y + ry)}` +
      `V${R(y + h - ry)}A${R(rx)} ${R(ry)} 0 0 1 ${R(x + w - rx)} ${R(y + h)}` +
      `H${R(x + rx)}A${R(rx)} ${R(ry)} 0 0 1 ${R(x)} ${R(y + h - ry)}` +
      `V${R(y + ry)}A${R(rx)} ${R(ry)} 0 0 1 ${R(x + rx)} ${R(y)}Z`;
  },
};

AK.pixelsD = (pixels, grid) => {
  const c = 100 / grid;
  return pixels.map((i) => AK.d.rect((i % grid) * c, Math.floor(i / grid) * c, c, c)).join('');
};

AK.matScale = (m) => (m ? Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2])) : 1);

/* ---------- glyph compile → Path2D */
AK.compileGlyph = (g) => {
  const fill = new Path2D();
  const strokes = [];
  if (g.pixels && g.pixels.length) fill.addPath(new Path2D(AK.pixelsD(g.pixels, g.grid)));
  for (const s of g.shapes || []) {
    const p = new Path2D(s.d);
    const m = s.m ? new DOMMatrix(s.m) : undefined;
    if (s.mode === 'stroke') {
      const q = new Path2D();
      q.addPath(p, m);
      strokes.push({ p: q, sw: s.sw || 6 });
    } else {
      fill.addPath(p, m);
    }
  }
  return { fill, strokes, rule: g.rule || 'nonzero' };
};

// Draws in the current transform (glyph space 0–100). Caller sets fillStyle and strokeStyle.
AK.drawGlyph = (ctx, cg) => {
  ctx.fill(cg.fill, cg.rule);
  if (cg.strokes.length) {
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const s of cg.strokes) { ctx.lineWidth = s.sw; ctx.stroke(s.p); }
  }
};

// SVG markup of a glyph in 0–100 space. Fill inherits; strokes use currentColor.
AK.glyphSVG = (g) => {
  let out = '';
  if (g.pixels && g.pixels.length) out += `<path d="${AK.pixelsD(g.pixels, g.grid)}"/>`;
  for (const s of g.shapes || []) {
    const t = s.m ? ` transform="matrix(${s.m.map((v) => Math.round(v * 1e4) / 1e4).join(' ')})"` : '';
    if (s.mode === 'stroke') {
      const sw = R((s.sw || 6) / AK.matScale(s.m));
      out += `<path d="${AK.esc(s.d)}"${t} fill="none" stroke="currentColor" stroke-width="${sw}" stroke-linecap="round" stroke-linejoin="round"/>`;
    } else {
      out += `<path d="${AK.esc(s.d)}"${t}/>`;
    }
  }
  return `<g fill-rule="${g.rule || 'nonzero'}">${out}</g>`;
};

/* ---------- SVG file import → shapes normalised into 0–100 */
AK.importSVG = (text) => {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  const src = doc.querySelector('svg');
  if (!src || doc.querySelector('parsererror')) throw new Error('SVG 파일을 읽을 수 없습니다. 파일이 올바른 SVG인지 확인하세요.');
  // Attach (hidden) so computed styles and transforms resolve.
  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-9999px;top:0;width:10px;height:10px;overflow:hidden;pointer-events:none';
  const svg = document.importNode(src, true);
  host.appendChild(svg);
  document.body.appendChild(host);
  try {
    let vx = 0, vy = 0, vw = 0, vh = 0;
    const vb = (svg.getAttribute('viewBox') || '').trim().split(/[\s,]+/).map(Number);
    if (vb.length === 4 && vb[2] > 0 && vb[3] > 0) [vx, vy, vw, vh] = vb;
    else { vw = parseFloat(svg.getAttribute('width')) || 100; vh = parseFloat(svg.getAttribute('height')) || 100; }
    const k = 100 / Math.max(vw, vh);
    const base = new DOMMatrix([k, 0, 0, k, (100 - vw * k) / 2 - vx * k, (100 - vh * k) / 2 - vy * k]);

    const num = (el, a) => parseFloat(el.getAttribute(a)) || 0;
    const toD = (el) => {
      switch (el.tagName.toLowerCase()) {
        case 'path': return el.getAttribute('d');
        case 'rect': return AK.d.roundRect(num(el, 'x'), num(el, 'y'), num(el, 'width'), num(el, 'height'), num(el, 'rx'), num(el, 'ry'));
        case 'circle': return AK.d.ellipse(num(el, 'cx'), num(el, 'cy'), num(el, 'r'), num(el, 'r'));
        case 'ellipse': return AK.d.ellipse(num(el, 'cx'), num(el, 'cy'), num(el, 'rx'), num(el, 'ry'));
        case 'line': return `M${num(el, 'x1')} ${num(el, 'y1')}L${num(el, 'x2')} ${num(el, 'y2')}`;
        case 'polyline':
        case 'polygon': {
          const n = (el.getAttribute('points') || '').trim().split(/[\s,]+/).map(Number);
          const pts = [];
          for (let i = 0; i + 1 < n.length; i += 2) pts.push([n[i], n[i + 1]]);
          return pts.length > 1 ? AK.d.poly(pts, el.tagName.toLowerCase() === 'polygon') : null;
        }
      }
      return null;
    };
    const isWhite = (c) => /^rgb\(\s*255,\s*255,\s*255\s*\)$/.test(c) || c === 'white' || c === '#ffffff' || c === '#fff';

    const shapes = [];
    let rule = 'nonzero';
    svg.querySelectorAll('path,rect,circle,ellipse,line,polyline,polygon').forEach((el) => {
      if (el.closest('defs,clipPath,mask,symbol,pattern,marker')) return;
      const cs = getComputedStyle(el);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const d = toD(el);
      if (!d) return;
      let m = new DOMMatrix();
      const chain = [];
      for (let e = el; e && e !== svg; e = e.parentElement) chain.unshift(e);
      for (const c of chain) {
        const list = c.transform && c.transform.baseVal;
        const t = list && list.numberOfItems ? list.consolidate() : null;
        if (t) { const q = t.matrix; m = m.multiply(new DOMMatrix([q.a, q.b, q.c, q.d, q.e, q.f])); }
      }
      const full = base.multiply(m);
      const mat = [full.a, full.b, full.c, full.d, full.e, full.f].map((v) => Math.round(v * 10000) / 10000);
      const tag = el.tagName.toLowerCase();
      const fill = cs.fill, stroke = cs.stroke;
      const sw = parseFloat(cs.strokeWidth) || 1;
      const open = tag === 'line' || tag === 'polyline';
      if (cs.fillRule === 'evenodd') rule = 'evenodd';
      if (!open && fill && fill !== 'none' && !isWhite(fill)) shapes.push({ d, mode: 'fill', m: mat });
      if (stroke && stroke !== 'none' && !isWhite(stroke) && sw > 0) shapes.push({ d, mode: 'stroke', sw: AK.round(sw * AK.matScale(mat)), m: mat });
    });
    if (!shapes.length) throw new Error('가져올 수 있는 도형이 없습니다. path, rect, circle, polygon 같은 기본 도형이 있는 SVG를 쓰세요.');
    return { shapes, rule };
  } finally {
    host.remove();
  }
};

/* ---------- built-in custom glyphs (vector examples) */
AK.BUILTIN_GLYPHS = [
  { id: 'b-box', name: '빈 사각', fallback: '□', shapes: [{ d: 'M14 14H86V86H14Z', mode: 'stroke', sw: 9 }] },
  { id: 'b-cross', name: '엑스', fallback: 'x', shapes: [{ d: 'M18 18L82 82M82 18L18 82', mode: 'stroke', sw: 8 }] },
  { id: 'b-boxdot', name: '점 사각', fallback: '▣', shapes: [{ d: 'M14 14H86V86H14Z', mode: 'stroke', sw: 8 }, { d: 'M38 38H62V62H38Z', mode: 'fill' }] },
  { id: 'b-dot', name: '점', fallback: '•', shapes: [{ d: AK.d.ellipse(50, 50, 40, 40), mode: 'fill' }] },
  { id: 'b-ring', name: '고리', fallback: 'o', shapes: [{ d: AK.d.ellipse(50, 50, 32, 32), mode: 'stroke', sw: 10 }] },
  { id: 'b-solid', name: '면', fallback: '█', shapes: [{ d: 'M0 0H100V100H0Z', mode: 'fill' }] },
  { id: 'b-petal', name: '꽃잎', fallback: '*', shapes: [{ d: 'M50 6C80 30 80 70 50 94C20 70 20 30 50 6Z', mode: 'fill' }] },
  { id: 'b-spark', name: '반짝', fallback: '+', shapes: [{ d: 'M50 4C54 40 60 46 96 50C60 54 54 60 50 96C46 60 40 54 4 50C40 46 46 40 50 4Z', mode: 'fill' }] },
  { id: 'b-check', name: '체커', fallback: '▚', grid: 4, pixels: [0, 2, 5, 7, 8, 10, 13, 15] },
  { id: 'b-slash', name: '빗금', fallback: '/', shapes: [{ d: 'M8 92L92 8M8 48L48 8M52 92L92 52', mode: 'stroke', sw: 7 }] },
];

AK.normGlyph = (g) => ({
  id: g.id || 'g-' + AK.uid(),
  name: g.name || '글리프',
  fallback: g.fallback || '#',
  grid: g.grid || 16,
  pixels: Array.isArray(g.pixels) ? g.pixels.slice() : [],
  shapes: Array.isArray(g.shapes) ? g.shapes.map((s) => ({ ...s, m: s.m ? s.m.slice() : undefined })) : [],
  rule: g.rule || 'nonzero',
  v: g.v || 1,
});
