'use strict';
/* outline.js — print-ready SVG: every unit becomes plain filled paths.
   Illustrator-safe on purpose: no <use>, no <text>, no strokes, no transforms, no currentColor.
   - custom glyphs: path data is parsed (M L H V C S Q T A Z, relative too), arcs and quadratics become cubics,
     and the shape matrix plus the cell placement are baked into absolute coordinates;
   - strokes (round caps/joins, as drawn on canvas) become unions of capsules (one per flattened segment,
     all with the same winding so the nonzero rule merges them);
   - characters are converted to glyph outlines with opentype.js from bundled fonts (vendor/print-fonts.js),
     falling back to JetBrains Mono / IBM Plex Mono for characters the unit font lacks. */

const Outline = (() => {
  const R = (n) => Math.round(n * 100) / 100;

  /* ---------- path parsing → absolute M / L / C / Z */
  const NUM = /[-+]?(?:\d*\.\d+|\d+\.?)(?:[eE][-+]?\d+)?/y;

  function arcToCubics(x1, y1, rx, ry, phiDeg, fa, fs, x2, y2) {
    if (!rx || !ry || (x1 === x2 && y1 === y2)) return [[x1, y1, x2, y2, x2, y2]];
    const phi = (phiDeg * Math.PI) / 180, cos = Math.cos(phi), sin = Math.sin(phi);
    const dx = (x1 - x2) / 2, dy = (y1 - y2) / 2;
    const x1p = cos * dx + sin * dy, y1p = -sin * dx + cos * dy;
    rx = Math.abs(rx); ry = Math.abs(ry);
    const lam = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
    if (lam > 1) { const s = Math.sqrt(lam); rx *= s; ry *= s; }
    const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
    const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
    const co = (fa === fs ? -1 : 1) * Math.sqrt(Math.max(0, num / den));
    const cxp = (co * rx * y1p) / ry, cyp = (-co * ry * x1p) / rx;
    const cx = cos * cxp - sin * cyp + (x1 + x2) / 2, cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
    const ang = (ux, uy, vx, vy) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
    const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
    let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
    if (!fs && dt > 0) dt -= 2 * Math.PI;
    else if (fs && dt < 0) dt += 2 * Math.PI;
    const n = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
    const delta = dt / n, k = (4 / 3) * Math.tan(delta / 4);
    const map = (ux, uy) => [cx + cos * rx * ux - sin * ry * uy, cy + sin * rx * ux + cos * ry * uy];
    const out = [];
    for (let i = 0, t = t1; i < n; i++, t += delta) {
      const c1 = Math.cos(t), s1 = Math.sin(t), c2 = Math.cos(t + delta), s2 = Math.sin(t + delta);
      out.push([...map(c1 - k * s1, s1 + k * c1), ...map(c2 + k * s2, s2 - k * c2), ...map(c2, s2)]);
    }
    const last = out[out.length - 1];
    last[4] = x2; last[5] = y2;
    return out;
  }

  function parse(d) {
    const out = [];
    let i = 0, cmd = '';
    let x = 0, y = 0, sx = 0, sy = 0, qx = null, qy = null, cx2 = null, cy2 = null;
    const n = d.length;
    const skip = () => { while (i < n && (d[i] === ' ' || d[i] === ',' || d[i] === '\n' || d[i] === '\t' || d[i] === '\r')) i++; };
    const num = () => {
      skip();
      NUM.lastIndex = i;
      const m = NUM.exec(d);
      if (!m) throw new Error('bad number');
      i = NUM.lastIndex;
      return parseFloat(m[0]);
    };
    const flag = () => { skip(); const c = d[i]; if (c !== '0' && c !== '1') throw new Error('bad flag'); i++; return c === '1'; };
    while (true) {
      skip();
      if (i >= n) break;
      const c = d[i];
      if (/[A-Za-z]/.test(c)) { cmd = c; i++; }
      else if (!cmd) break;
      const rel = cmd === cmd.toLowerCase();
      const ox = rel ? x : 0, oy = rel ? y : 0;
      const C = cmd.toUpperCase();
      try {
        if (C === 'Z') {
          out.push({ t: 'Z' }); x = sx; y = sy; qx = cx2 = null;
          cmd = ''; // Z takes no arguments
          continue;
        }
        if (C === 'M') {
          x = ox + num(); y = oy + num(); sx = x; sy = y;
          out.push({ t: 'M', x, y });
          cmd = rel ? 'l' : 'L';
          qx = cx2 = null;
        } else if (C === 'L') {
          x = ox + num(); y = oy + num(); out.push({ t: 'L', x, y }); qx = cx2 = null;
        } else if (C === 'H') {
          x = ox + num(); out.push({ t: 'L', x, y }); qx = cx2 = null;
        } else if (C === 'V') {
          y = (rel ? y : 0) + num(); out.push({ t: 'L', x, y }); qx = cx2 = null;
        } else if (C === 'C') {
          const a = ox + num(), b = oy + num(), e = ox + num(), f = oy + num(); x = ox + num(); y = oy + num();
          out.push({ t: 'C', c: [a, b, e, f, x, y] }); cx2 = e; cy2 = f; qx = null;
        } else if (C === 'S') {
          const a = cx2 === null ? x : 2 * x - cx2, b = cx2 === null ? y : 2 * y - cy2;
          const e = ox + num(), f = oy + num(); const nx = ox + num(), ny = oy + num();
          out.push({ t: 'C', c: [a, b, e, f, nx, ny] }); cx2 = e; cy2 = f; x = nx; y = ny; qx = null;
        } else if (C === 'Q' || C === 'T') {
          let a, b;
          if (C === 'Q') { a = ox + num(); b = oy + num(); }
          else { a = qx === null ? x : 2 * x - qx; b = qx === null ? y : 2 * y - qy; }
          const nx = ox + num(), ny = oy + num();
          out.push({ t: 'C', c: [x + (2 / 3) * (a - x), y + (2 / 3) * (b - y), nx + (2 / 3) * (a - nx), ny + (2 / 3) * (b - ny), nx, ny] });
          qx = a; qy = b; cx2 = null; x = nx; y = ny;
        } else if (C === 'A') {
          const rx = num(), ry = num(), rot = num(), fa = flag(), fs = flag();
          const nx = ox + num(), ny = oy + num();
          for (const c6 of arcToCubics(x, y, rx, ry, rot, fa, fs, nx, ny)) out.push({ t: 'C', c: c6 });
          x = nx; y = ny; qx = cx2 = null;
        } else break;
      } catch (e) { break; } // stop at malformed data, like browsers do
    }
    return out;
  }

  /* ---------- affine helpers: m = [a b c d e f] */
  const mul = (m, n) => [
    m[0] * n[0] + m[2] * n[1], m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3], m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4], m[1] * n[4] + m[3] * n[5] + m[5],
  ];
  const ap = (m, x, y) => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];

  function fillD(segs, m) {
    let s = '';
    for (const g of segs) {
      if (g.t === 'Z') s += 'Z';
      else if (g.t === 'M' || g.t === 'L') { const [px, py] = ap(m, g.x, g.y); s += `${g.t}${R(px)} ${R(py)}`; }
      else {
        const c = g.c, a = ap(m, c[0], c[1]), b = ap(m, c[2], c[3]), e = ap(m, c[4], c[5]);
        s += `C${R(a[0])} ${R(a[1])} ${R(b[0])} ${R(b[1])} ${R(e[0])} ${R(e[1])}`;
      }
    }
    return s;
  }

  // transformed polylines (curves flattened to within tol)
  function polylines(segs, m, tol) {
    const lines = [];
    let cur = null, start = null, last = null;
    for (const g of segs) {
      if (g.t === 'M') {
        const p = ap(m, g.x, g.y);
        cur = [p]; start = p; last = p; lines.push(cur);
      } else if (g.t === 'L') {
        const p = ap(m, g.x, g.y);
        if (!cur) { cur = [last || p]; lines.push(cur); }
        cur.push(p); last = p;
      } else if (g.t === 'C') {
        const p0 = last || [0, 0], p1 = ap(m, g.c[0], g.c[1]), p2 = ap(m, g.c[2], g.c[3]), p3 = ap(m, g.c[4], g.c[5]);
        if (!cur) { cur = [p0]; lines.push(cur); }
        const dd = Math.max(Math.hypot(p0[0] - 2 * p1[0] + p2[0], p0[1] - 2 * p1[1] + p2[1]), Math.hypot(p1[0] - 2 * p2[0] + p3[0], p1[1] - 2 * p2[1] + p3[1]));
        const k = Math.min(64, Math.max(1, Math.ceil(Math.sqrt((0.75 * dd) / tol))));
        for (let j = 1; j <= k; j++) {
          const t = j / k, u = 1 - t;
          cur.push([
            u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
            u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
          ]);
        }
        last = p3;
      } else if (g.t === 'Z') {
        if (cur && start) cur.push(start);
        last = start; cur = null;
      }
    }
    return lines;
  }

  // a stroke with round caps and joins = union of capsules; every capsule is wound the same way
  function strokeD(lines, r) {
    let s = '';
    const rr = R(r);
    for (const pts of lines) {
      if (pts.length === 1 || (pts.length === 2 && pts[0][0] === pts[1][0] && pts[0][1] === pts[1][1])) {
        const [x, y] = pts[0];
        s += `M${R(x - r)} ${R(y)}A${rr} ${rr} 0 1 0 ${R(x + r)} ${R(y)}A${rr} ${rr} 0 1 0 ${R(x - r)} ${R(y)}Z`;
        continue;
      }
      for (let i = 1; i < pts.length; i++) {
        const p = pts[i - 1], q = pts[i];
        const dx = q[0] - p[0], dy = q[1] - p[1], len = Math.hypot(dx, dy);
        if (len < 1e-6) continue;
        const nx = (-dy / len) * r, ny = (dx / len) * r;
        s += `M${R(p[0] + nx)} ${R(p[1] + ny)}L${R(q[0] + nx)} ${R(q[1] + ny)}A${rr} ${rr} 0 0 0 ${R(q[0] - nx)} ${R(q[1] - ny)}` +
          `L${R(p[0] - nx)} ${R(p[1] - ny)}A${rr} ${rr} 0 0 0 ${R(p[0] + nx)} ${R(p[1] + ny)}Z`;
      }
    }
    return s;
  }

  /* ---------- custom glyph → list of { d, rule } in artboard space */
  const glyphCache = new Map(); // glyph id → { v, shapes: parsed }
  function parsedGlyph(g) {
    const c = glyphCache.get(g.id);
    if (c && c.v === g.v) return c.p;
    const p = {
      pixels: g.pixels && g.pixels.length ? parse(AK.pixelsD(g.pixels, g.grid)) : null,
      shapes: (g.shapes || []).map((s) => ({ ...s, segs: parse(s.d) })),
    };
    glyphCache.set(g.id, { v: g.v, p });
    return p;
  }

  function glyphPaths(g, place, scale, tol) {
    const p = parsedGlyph(g);
    const out = [];
    let main = '';
    if (p.pixels) main += fillD(p.pixels, place);
    const extra = [];
    let strokes = '';
    for (const s of p.shapes) {
      const m = s.m ? mul(place, s.m) : place;
      if (s.mode === 'stroke') strokes += strokeD(polylines(s.segs, m, tol), ((s.sw || 6) / 2) * scale);
      else if (s.rule) extra.push({ d: fillD(s.segs, m), rule: s.rule });
      else main += fillD(s.segs, m);
    }
    if (main) out.push({ d: main, rule: g.rule || 'nonzero' });
    out.push(...extra);
    if (strokes) out.push({ d: strokes, rule: 'nonzero' });
    return out;
  }

  /* ---------- fonts (lazy) */
  const loadScript = (src) => new Promise((res, rej) => {
    const s = document.createElement('script');
    s.src = src; s.onload = res; s.onerror = () => rej(new Error(src + '를 불러오지 못했습니다.'));
    document.head.appendChild(s);
  });
  let ready = null;
  const fonts = {}; // family → [opentype.Font]
  function b64ToBuf(b64) {
    const bin = atob(b64), u = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
    return u.buffer;
  }
  function ensureFonts() {
    if (!ready) {
      ready = (async () => {
        if (!window.opentype) await loadScript('vendor/opentype.min.js');
        if (!window.AK_PRINT_FONTS) await loadScript('vendor/print-fonts.js');
        for (const [fam, list] of Object.entries(window.AK_PRINT_FONTS)) {
          fonts[fam] = list.map((b) => opentype.parse(b64ToBuf(b)));
        }
      })().catch((e) => { ready = null; throw e; });
    }
    return ready;
  }
  function addFont(family, buffer) {
    try { fonts[family] = [opentype.parse(buffer.slice(0))]; return true; } catch (e) { return false; }
  }

  // outline of one character in its cell, matching the canvas placement (app.js charOrigin):
  // align 'cap' centres the cap height, 'ink' centres the glyph's ink box, 'em' uses the em-box middle.
  // weight > 0 adds a round-joined stroke (in units of type size) as a separate filled path.
  const capHeights = new WeakMap();
  function capHeight(f) {
    if (capHeights.has(f)) return capHeights.get(f);
    let cap = f.tables.os2 && f.tables.os2.sCapHeight;
    if (!cap) { const H = f.glyphs.get(f.charToGlyphIndex('H')); cap = H ? H.getBoundingBox().y2 : f.ascender * 0.7; }
    capHeights.set(f, cap);
    return cap;
  }
  function charD(ch, family, x, y, size, opt = {}) {
    const chain = [...(fonts[family] || []), ...(fonts['JetBrains Mono'] || []), ...(fonts['IBM Plex Mono'] || [])];
    for (const f of chain) {
      const gi = f.charToGlyphIndex(ch);
      if (!gi) continue;
      const glyph = f.glyphs.get(gi);
      const k = size / f.unitsPerEm;
      let ox, baseline;
      if (opt.align === 'ink') {
        const bb = glyph.getBoundingBox();
        ox = x - ((bb.x1 + bb.x2) / 2) * k;
        baseline = y + ((bb.y1 + bb.y2) / 2) * k;
      } else if (opt.align === 'em') {
        // canvas textBaseline "middle" is the middle of the em box, with the font's ascent:descent ratio scaled to 1em
        const hh = f.tables.hhea || f;
        const asc = hh.ascender, desc = -hh.descender;
        ox = x - (glyph.advanceWidth * k) / 2;
        baseline = y + ((asc - desc) / (asc + desc) / 2) * size;
      } else {
        ox = x - (glyph.advanceWidth * k) / 2;
        baseline = y + (capHeight(f) * k) / 2;
      }
      const fill = glyph.getPath(ox, baseline, size).toPathData(2);
      const stroke = opt.weight > 0 ? strokeD(polylines(parse(fill), [1, 0, 0, 1, 0, 0], 0.05), (opt.weight * size) / 2) : '';
      return { fill, stroke };
    }
    return null;
  }

  /* ---------- whole artboard */
  // ctx: { state, dims, ops, glyphById, charPx, W, H }
  function build(ctx) {
    const { state, ops, glyphById } = ctx;
    const { cols, rows } = ctx.dims;
    const W = ctx.W, H = ctx.H, cw = W / cols, ch = H / rows;
    const fpx = ctx.charPx(cw, ch) * state.unitScale * (state.charScale || 1);
    const tol = 0.05;
    const inset = state.grid ? Math.min(cw, ch) * 0.06 : 0;
    const boxes = new Map(), ink = new Map(), faint = new Map(), missing = new Set();
    let count = 0;
    const add = (map, col, item) => { if (!map.has(col)) map.set(col, []); map.get(col).push(item); count++; };

    for (const op of ops) {
      const x = (op.c + 0.5) * cw, y = (op.r + 0.5) * ch;
      if (op.box) add(boxes, op.box, `<rect x="${R(op.c * cw + inset)}" y="${R(op.r * ch + inset)}" width="${R(cw - 2 * inset)}" height="${R(ch - 2 * inset)}"/>`);
      const target = op.a < 1 ? faint : ink;
      if (op.u.kind === 'char') {
        if (op.u.value === ' ' || !op.u.value.trim()) continue;
        const d = charD(op.u.value, state.unitFont, x + (state.charDX || 0) * cw, y + (state.charDY || 0) * ch, fpx * op.k,
          { align: state.charAlign || 'cap', weight: state.charWeight || 0 });
        if (d) add(target, op.col, d.stroke ? `<g><path d="${d.fill}"/><path d="${d.stroke}"/></g>` : `<path d="${d.fill}"/>`);
        else {
          missing.add(op.u.value);
          add(target, op.col, `<text x="${R(x)}" y="${R(y + fpx * op.k * 0.35)}" font-size="${R(fpx * op.k)}" text-anchor="middle" font-family="${AK.esc(state.unitFont)}">${AK.esc(op.u.value)}</text>`);
        }
      } else {
        const g = glyphById(op.u.glyph);
        if (!g) continue;
        const s = (Math.min(cw, ch) * state.unitScale * op.k) / 100;
        const place = [s, 0, 0, s, x - 50 * s, y - 50 * s];
        const paths = glyphPaths(g, place, s, tol);
        if (paths.length === 1) add(target, op.col, `<path d="${paths[0].d}"${paths[0].rule === 'evenodd' ? ' fill-rule="evenodd"' : ''}/>`);
        else if (paths.length) add(target, op.col, `<g>${paths.map((p) => `<path d="${p.d}"${p.rule === 'evenodd' ? ' fill-rule="evenodd"' : ''}/>`).join('')}</g>`);
      }
    }

    const layer = (id, map, extra = '') => [...map].map(([col, items], i) =>
      `<g id="${id}-${i + 1}" fill="${col}"${extra}>${items.join('')}</g>`).join('');
    let grid = '';
    if (state.grid) {
      const lw = Math.max(0.5, Math.min(cw, ch) * 0.04);
      for (let c = 0; c <= cols; c++) grid += `<rect x="${R(c * cw - lw / 2)}" y="0" width="${R(lw)}" height="${R(H)}"/>`;
      for (let r = 0; r <= rows; r++) grid += `<rect x="0" y="${R(r * ch - lw / 2)}" width="${R(W)}" height="${R(lw)}"/>`;
      grid = `<g id="grid" fill="${state.gridColor}" opacity="${state.gridAlpha}">${grid}</g>`;
    }
    const svg = `<?xml version="1.0" encoding="UTF-8"?>\n` +
      `<svg xmlns="http://www.w3.org/2000/svg" version="1.1" viewBox="0 0 ${R(W)} ${R(H)}" width="${R(W)}${ctx.unit || 'px'}" height="${R(H)}${ctx.unit || 'px'}">` +
      `<g id="background"><rect x="0" y="0" width="${R(W)}" height="${R(H)}" fill="${state.bg}"/></g>` +
      grid +
      layer('cells', boxes) +
      layer('background-units', faint, ` opacity="${state.bgAlpha}"`) +
      layer('units', ink) +
      `</svg>`;
    return { svg, count, missing: [...missing], colors: new Set([...ink.keys(), ...boxes.keys()]).size };
  }

  return { ensureFonts, addFont, build, charD, parse, fillD, polylines, strokeD };
})();
