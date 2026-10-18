'use strict';
/* calendar.js — one month on one page (A4 / A3 / B4 / B3, portrait or landscape), laid out on the shared cell grid.
   The page is a block layout: a month name band on top and a 7-column day grid below.
   Every block carries a style: 'month' (month name and special days) or 'day' (other day numbers);
   app.js rasterises each style separately so the two can take different colour themes.
   Lengths are in cell widths: a cell is 1 wide and cellAspect tall, the page is cols × rows·cellAspect. */

const Calendar = (() => {
  // paper sizes in mm (portrait), as used by the print shop
  const PAPERS = [
    { id: 'A4', label: 'A4 · 210×297mm', w: 210, h: 297 },
    { id: 'A3', label: 'A3 · 297×420mm', w: 297, h: 420 },
    { id: 'B4', label: 'B4 · 257×364mm', w: 257, h: 364 },
    { id: 'B3', label: 'B3 · 364×504mm', w: 364, h: 504 },
    { id: '335x700', label: '335×700mm', w: 335, h: 700 },
    { id: '380x530', label: '380×530mm', w: 380, h: 530 },
  ];
  const MM_PT = 72 / 25.4;
  // page size in pt for the paper and orientation
  function paper(id, orient) {
    const p = PAPERS.find((x) => x.id === id) || PAPERS[0];
    const w = p.w * MM_PT, h = p.h * MM_PT;
    return orient === 'landscape' ? { w: h, h: w, paper: p } : { w, h, paper: p };
  }
  const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  const LABELS = [
    ['full', 'September'], ['upper', 'SEPTEMBER'], ['short', 'Sep'], ['shortUpper', 'SEP'], ['ko', '9월'], ['num', '09'],
  ];
  function monthLabel(m, style) {
    const name = MONTHS[m - 1];
    switch (style) {
      case 'upper': return name.toUpperCase();
      case 'short': return name.slice(0, 3);
      case 'shortUpper': return name.slice(0, 3).toUpperCase();
      case 'ko': return `${m}월`;
      case 'num': return String(m).padStart(2, '0');
      default: return name;
    }
  }

  // page grid for the cell size: as close to the paper as whole cells allow
  function grid(s) {
    const pg = paper(s.calPaper, s.calOrient);
    return {
      cols: Math.max(20, Math.round(pg.w / s.cellPt)),
      rows: Math.max(20, Math.round(pg.h / (s.cellPt * s.cellAspect))),
    };
  }

  // "3, 9, 25" or "3 9 25" or "24-26" → Set of day numbers within the month
  function parseDays(text, days) {
    const out = new Set();
    for (const part of String(text || '').split(/[\s,]+/)) {
      const m = /^(\d{1,2})(?:-(\d{1,2}))?$/.exec(part);
      if (!m) continue;
      const a = +m[1], b = m[2] ? +m[2] : a;
      for (let d = Math.min(a, b); d <= Math.max(a, b); d++) if (d >= 1 && d <= days) out.add(d);
    }
    return out;
  }

  // "1 신정, 5-7 설날, 9 대체공휴일" → Map(day → label); a range labels every day in it
  function parseHolidays(text, days) {
    const out = new Map();
    for (const part of String(text || '').split(/[,;\n]+/)) {
      const m = /^\s*(\d{1,2})(?:\s*-\s*(\d{1,2}))?\s+(.+?)\s*$/.exec(part);
      if (!m) continue;
      const a = +m[1], b = m[2] ? +m[2] : a;
      for (let d = Math.min(a, b); d <= Math.max(a, b); d++) if (d >= 1 && d <= days) out.set(d, m[3]);
    }
    return out;
  }

  /* layout(s, measure) → { cols, rows, blocks: [{ text, x, y, size, style }] }
     x / y: text origin and baseline in cell widths; size: type size in cell widths.
     measure(text) → { asc, desc, left, right, width } per 1 unit of type size, plus box: { asc, desc } for the font. */
  function layout(s, measure) {
    const { cols, rows } = grid(s);
    const W = cols, H = rows * s.cellAspect;
    const mg = s.calMargin;
    const contentW = W - 2 * mg, contentH = H - 2 * mg;
    const blocks = [];
    const box = measure.box(); // font-wide ascent/descent (same for every text, so baselines stay consistent)

    // month name band
    const bandH = contentH * s.calMonthSize;
    const label = monthLabel(s.calMonth, s.calLabel);
    const lm = measure(label);
    let fm = bandH / (box.asc + box.desc);
    const inkW = lm.right + lm.left;
    if (inkW * fm > contentW) fm = contentW / inkW;
    const mBase = mg + (bandH - (box.asc + box.desc) * fm) / 2 + box.asc * fm + (s.calMonthDY || 0) * s.cellAspect;
    const mx = s.calMonthAlign === 'center' ? W / 2 - ((lm.right - lm.left) / 2) * fm : mg + lm.left * fm;
    blocks.push({ text: label, x: mx, y: mBase, size: fm, style: 'month' });

    // day grid
    const y = s.calYear, m = s.calMonth;
    const days = new Date(y, m, 0).getDate();
    const dow1 = new Date(y, m - 1, 1).getDay(); // 0 = Sunday
    const offset = s.calWeekStart === 'mon' ? (dow1 + 6) % 7 : dow1;
    const weeks = s.calSixWeeks ? 6 : Math.ceil((offset + days) / 7);
    const top0 = mg + bandH + s.calGap * s.cellAspect;
    const cellW = contentW / 7, cellH = Math.max(1, (H - mg - top0) / weeks);
    const top = top0 + (s.calGridDY || 0) * s.cellAspect; // moving the table keeps its cell size
    // one type size for every day number: fit the box height, then make sure the widest two digits fit the column
    let fd = (cellH * s.calDaySize) / (box.asc + box.desc);
    const wide = Math.max(...['00', '22', '28', '30', '31', '88'].map((t) => { const q = measure(t); return q.right + q.left; }));
    if (wide * fd > cellW * 0.9) fd = (cellW * 0.9) / wide;
    const mk = `${y}-${String(m).padStart(2, '0')}`;
    const special = parseDays((s.calSpecial || {})[mk], days);
    const holidays = parseHolidays((s.calHol || {})[mk], days);
    const labels = []; // holiday names under the day number: x anchor, top edge (below the number box), alignment
    const sunCol = s.calWeekStart === 'mon' ? 6 : 0, satCol = s.calWeekStart === 'mon' ? 5 : 6;
    const inset = Math.min(cellW, cellH) * 0.08;
    for (let d = 1; d <= days; d++) {
      const i = offset + d - 1, col = i % 7, wk = Math.floor(i / 7);
      const x0 = mg + col * cellW, y0 = top + wk * cellH;
      const t = String(d), q = measure(t);
      let x, base;
      if (s.calDayAlign === 'left') {
        x = x0 + inset + q.left * fd;
        base = y0 + inset + box.asc * fd;
      } else {
        x = x0 + cellW / 2 - ((q.right - q.left) / 2) * fd;
        base = y0 + (cellH - (box.asc + box.desc) * fd) / 2 + box.asc * fd;
      }
      const hol = holidays.get(d);
      const isSpecial = special.has(d) || (s.calSun && col === sunCol) || (s.calSat && col === satCol) || (hol && s.calHolSpecial);
      blocks.push({ text: t, x, y: base, size: fd, style: isSpecial ? 'month' : 'day' });
      if (hol) labels.push({ text: hol, d, x: s.calDayAlign === 'left' ? x - q.left * fd : x + ((q.right - q.left) / 2) * fd, top: base + box.desc * fd, align: s.calDayAlign === 'left' ? 'left' : 'center' });
    }
    // horizontal rule above each week row, spanning only the columns that hold a day;
    // t = thickness in cell widths (one cell width = cellPt pt)
    const lines = [];
    if (s.calLines) {
      const t = (s.calLineW || 1) / s.cellPt;
      for (let wk = 0; wk < weeks; wk++) {
        const first = Math.max(offset, wk * 7), last = Math.min(offset + days - 1, wk * 7 + 6);
        if (first > last) continue; // empty sixth week
        lines.push({ x0: mg + (first % 7) * cellW, x1: mg + ((last % 7) + 1) * cellW, y: top + wk * cellH + (s.calLineDY || 0) * s.cellAspect, t });
      }
    }
    return { cols, rows, blocks, lines, labels, weeks, days };
  }

  /* minimal ZIP writer (deflate via CompressionStream when available, otherwise stored) */
  const CRC = (() => {
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; }
    return t;
  })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  async function deflate(u8) {
    if (typeof CompressionStream === 'undefined') return null;
    try {
      const stream = new Blob([u8]).stream().pipeThrough(new CompressionStream('deflate-raw'));
      return new Uint8Array(await new Response(stream).arrayBuffer());
    } catch (e) { return null; }
  }

  async function zip(files) {
    const enc = new TextEncoder();
    const now = new Date();
    const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1);
    const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate();
    const local = [], central = [];
    let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name);
      const data = f.data;
      const packed = await deflate(data);
      const method = packed && packed.length < data.length ? 8 : 0;
      const body = method ? packed : data;
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, method, true);
      lh.setUint16(10, dosTime, true); lh.setUint16(12, dosDate, true); lh.setUint32(14, crc, true);
      lh.setUint32(18, body.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      local.push(new Uint8Array(lh.buffer), name, body);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint16(10, method, true); ch.setUint16(12, dosTime, true); ch.setUint16(14, dosDate, true); ch.setUint32(16, crc, true);
      ch.setUint32(20, body.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true);
      ch.setUint32(42, offset, true);
      central.push(new Uint8Array(ch.buffer), name);
      offset += 30 + name.length + body.length;
    }
    const csize = central.reduce((n, a) => n + a.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true);
    end.setUint32(12, csize, true); end.setUint32(16, offset, true);
    return new Blob([...local, ...central, new Uint8Array(end.buffer)], { type: 'application/zip' });
  }

  return { PAPERS, paper, MONTHS, LABELS, monthLabel, grid, parseDays, parseHolidays, layout, zip };
})();
