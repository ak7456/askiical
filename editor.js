'use strict';
/* editor.js — custom vector glyph editor (pixel grid, pen, rect, ellipse, line, raw path d, SVG import). */

const GlyphEditor = (() => {
  const $ = (s) => document.querySelector(s);
  const dlg = $('#editor');
  const cv = $('#ed-canvas');
  const ctx = cv.getContext('2d');
  const pv = $('#ed-preview');

  let g = null;            // working copy
  let opts = null;         // { isNew, onSave, onDelete, measure, fg, bg }
  let tool = 'pen', mode = 'fill', sw = 8, snap = true;
  let sel = -1;
  let pen = null;          // [[x,y], ...] while drawing
  let hover = null;
  let drag = null;         // { x0, y0, x1, y1, shift }
  let paintVal = null;     // pixel tool drag value
  let hist = [], fut = [];

  const HINTS = {
    pixel: '격자 칸을 눌러 칠하거나 지웁니다. 드래그하면 연속으로 칠합니다.',
    pen: '클릭으로 점을 찍습니다. 첫 점을 다시 누르거나 Enter로 닫힌 도형, 더블클릭으로 열린 선. Esc 취소, Backspace 마지막 점 삭제.',
    rect: '드래그해서 사각형을 그립니다. Shift는 정사각형.',
    ellipse: '드래그해서 원을 그립니다. Shift는 정원.',
    line: '드래그해서 직선을 그립니다. 선 두께가 적용됩니다.',
  };

  /* ---------- history */
  const snapshot = () => JSON.stringify({ pixels: g.pixels, shapes: g.shapes, grid: g.grid, rule: g.rule });
  const commit = () => { hist.push(snapshot()); if (hist.length > 100) hist.shift(); fut = []; };
  const restore = (s) => { Object.assign(g, JSON.parse(s)); sel = -1; refresh(); };
  const undo = () => { if (!hist.length) return; fut.push(snapshot()); restore(hist.pop()); };
  const redo = () => { if (!fut.length) return; hist.push(snapshot()); restore(fut.pop()); };

  /* ---------- geometry helpers */
  const step = () => 100 / g.grid;
  const toGlyph = (e) => {
    const r = cv.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * 100, ((e.clientY - r.top) / r.height) * 100];
  };
  const snapPt = (p) => {
    if (!snap) return p;
    const s = step() / 2;
    return [Math.round(p[0] / s) * s, Math.round(p[1] / s) * s];
  };

  const addShape = (shape) => {
    commit();
    g.shapes.push(shape);
    sel = g.shapes.length - 1;
    refresh();
  };

  const finishPen = (closed) => {
    if (!pen) return;
    const pts = pen;
    pen = null;
    if (pts.length < 2) { draw(); return; }
    const isClosed = closed && pts.length >= 3;
    addShape({ d: AK.d.poly(pts, isClosed), mode: isClosed ? mode : 'stroke', sw });
  };

  const dragShape = () => {
    let { x0, y0, x1, y1, shift } = drag;
    if (shift && tool !== 'line') {
      const s = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      x1 = x0 + Math.sign(x1 - x0 || 1) * s;
      y1 = y0 + Math.sign(y1 - y0 || 1) * s;
    }
    const x = Math.min(x0, x1), y = Math.min(y0, y1), w = Math.abs(x1 - x0), h = Math.abs(y1 - y0);
    if (tool === 'line') return Math.hypot(w, h) < 0.5 ? null : { d: `M${AK.round(x0)} ${AK.round(y0)}L${AK.round(x1)} ${AK.round(y1)}`, mode: 'stroke', sw };
    if (w < 0.5 || h < 0.5) return null;
    if (tool === 'rect') return { d: AK.d.rect(x, y, w, h), mode, sw };
    return { d: AK.d.ellipse(x + w / 2, y + h / 2, w / 2, h / 2), mode, sw };
  };

  /* ---------- pointer */
  cv.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    cv.setPointerCapture(e.pointerId);
    const raw = toGlyph(e);
    if (tool === 'pixel') {
      const cx = Math.floor(raw[0] / step()), cy = Math.floor(raw[1] / step());
      if (cx < 0 || cy < 0 || cx >= g.grid || cy >= g.grid) return;
      const idx = cy * g.grid + cx;
      commit();
      paintVal = !g.pixels.includes(idx);
      setPixel(idx, paintVal);
      return;
    }
    const p = snapPt(raw);
    if (tool === 'pen') {
      if (!pen) pen = [];
      if (pen.length >= 3 && Math.hypot(p[0] - pen[0][0], p[1] - pen[0][1]) < 3) { finishPen(true); return; }
      const last = pen[pen.length - 1];
      if (!last || last[0] !== p[0] || last[1] !== p[1]) pen.push(p);
      draw();
      return;
    }
    drag = { x0: p[0], y0: p[1], x1: p[0], y1: p[1], shift: e.shiftKey };
  });

  cv.addEventListener('pointermove', (e) => {
    const raw = toGlyph(e);
    hover = snapPt(raw);
    if (tool === 'pixel' && paintVal !== null) {
      const cx = Math.floor(raw[0] / step()), cy = Math.floor(raw[1] / step());
      if (cx >= 0 && cy >= 0 && cx < g.grid && cy < g.grid) setPixel(cy * g.grid + cx, paintVal);
      return;
    }
    if (drag) { drag.x1 = hover[0]; drag.y1 = hover[1]; drag.shift = e.shiftKey; }
    draw();
  });

  const endPointer = () => {
    if (paintVal !== null) { paintVal = null; refresh(); return; }
    if (drag) { const s = dragShape(); drag = null; if (s) addShape(s); else draw(); }
  };
  cv.addEventListener('pointerup', endPointer);
  cv.addEventListener('dblclick', () => { if (tool === 'pen' && pen) finishPen(false); });
  cv.addEventListener('pointercancel', () => { drag = null; paintVal = null; draw(); });
  cv.addEventListener('pointerleave', () => { hover = null; draw(); });

  const setPixel = (idx, on) => {
    const has = g.pixels.includes(idx);
    if (on && !has) g.pixels.push(idx);
    if (!on && has) g.pixels = g.pixels.filter((i) => i !== idx);
    draw();
  };

  dlg.addEventListener('keydown', (e) => {
    const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName);
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !typing) {
      e.preventDefault(); e.shiftKey ? redo() : undo(); return;
    }
    if (typing) return;
    if (e.key === 'Escape' && pen) { e.preventDefault(); pen = null; draw(); return; }
    if (e.key === 'Enter' && pen) { e.preventDefault(); finishPen(mode === 'fill'); return; }
    if (e.key === 'Backspace' && pen) { e.preventDefault(); pen.pop(); if (!pen.length) pen = null; draw(); return; }
    if ((e.key === 'Delete' || e.key === 'Backspace') && sel >= 0) { e.preventDefault(); removeShape(sel); return; }
    const map = { p: 'pixel', n: 'pen', r: 'rect', e: 'ellipse', l: 'line' };
    if (map[e.key.toLowerCase()] && !e.ctrlKey && !e.metaKey) setTool(map[e.key.toLowerCase()]);
  });

  /* ---------- drawing */
  function sizeCanvas() {
    const r = cv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const px = Math.max(100, Math.round(r.width * dpr));
    if (cv.width !== px) { cv.width = px; cv.height = px; }
  }

  function draw() {
    if (!g) return;
    sizeCanvas();
    const W = cv.width, k = W / 100;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = opts.bg;
    ctx.fillRect(0, 0, W, W);
    // grid
    ctx.strokeStyle = opts.fg;
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 1; i < g.grid; i++) {
      const v = Math.round(i * step() * k) + 0.5;
      ctx.moveTo(v, 0); ctx.lineTo(v, W); ctx.moveTo(0, v); ctx.lineTo(W, v);
    }
    ctx.stroke();
    ctx.globalAlpha = 0.3;
    ctx.beginPath(); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, W); ctx.moveTo(0, W / 2); ctx.lineTo(W, W / 2); ctx.stroke();
    ctx.globalAlpha = 1;
    // glyph
    ctx.setTransform(k, 0, 0, k, 0, 0);
    ctx.fillStyle = opts.fg; ctx.strokeStyle = opts.fg;
    AK.drawGlyph(ctx, AK.compileGlyph(g));
    // selection outline
    if (sel >= 0 && g.shapes[sel]) {
      const s = g.shapes[sel];
      const p = new Path2D();
      p.addPath(new Path2D(s.d), s.m ? new DOMMatrix(s.m) : undefined);
      ctx.strokeStyle = '#5d7bff'; ctx.lineWidth = 2 / k * 1.5; ctx.setLineDash([4 / k * 2, 3 / k * 2]);
      ctx.stroke(p); ctx.setLineDash([]);
    }
    // pen in progress
    ctx.strokeStyle = '#5d7bff'; ctx.fillStyle = '#5d7bff'; ctx.lineWidth = 3 / k;
    if (pen) {
      ctx.beginPath();
      pen.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
      if (hover) ctx.lineTo(hover[0], hover[1]);
      ctx.stroke();
      pen.forEach((p, i) => { ctx.beginPath(); ctx.arc(p[0], p[1], (i ? 4 : 7) / k * 1.5, 0, 7); ctx.fill(); });
    }
    if (drag) {
      const s = dragShape();
      if (s) { ctx.setLineDash([6 / k, 4 / k]); ctx.stroke(new Path2D(s.d)); ctx.setLineDash([]); }
    }
    if (hover && tool !== 'pixel' && !drag) { ctx.beginPath(); ctx.arc(hover[0], hover[1], 3 / k * 1.5, 0, 7); ctx.fill(); }
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }

  function drawPreview() {
    const r = pv.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    pv.width = Math.round(r.width * dpr); pv.height = Math.round(r.height * dpr);
    const c = pv.getContext('2d');
    c.fillStyle = opts.bg; c.fillRect(0, 0, pv.width, pv.height);
    c.fillStyle = opts.fg; c.strokeStyle = opts.fg;
    const cg = AK.compileGlyph(g);
    const H = pv.height;
    let x = 10 * dpr;
    for (const size of [64, 32, 16, 10]) {
      const s = size * dpr / 100;
      c.setTransform(s, 0, 0, s, x, (H - size * dpr) / 2);
      AK.drawGlyph(c, cg);
      x += size * dpr + 12 * dpr;
    }
    // small tiled field
    const cell = 9 * dpr, s = cell / 100;
    for (let yy = 0; yy * cell < H - 16 * dpr; yy++) {
      for (let xx = 0; x + xx * cell < pv.width - 8 * dpr; xx++) {
        c.setTransform(s, 0, 0, s, x + xx * cell, 8 * dpr + yy * cell);
        AK.drawGlyph(c, cg);
      }
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
    $('#ed-dens').textContent = `잉크 ${Math.round(opts.measure(g) * 100)}%`;
  }

  /* ---------- side panel */
  function renderShapes() {
    const ol = $('#ed-shapes');
    ol.innerHTML = '';
    if (g.pixels.length) {
      const li = document.createElement('li');
      li.innerHTML = `<span>픽셀 ${g.pixels.length}칸 · ${g.grid}×${g.grid}</span><button type="button">지우기</button>`;
      li.querySelector('button').onclick = () => { commit(); g.pixels = []; refresh(); };
      ol.appendChild(li);
    }
    g.shapes.forEach((s, i) => {
      const li = document.createElement('li');
      if (i === sel) li.className = 'sel';
      const kind = s.mode === 'stroke' ? `선 ${s.sw || 6}` : '채움';
      li.innerHTML = `<span title="${AK.esc(s.d)}">${i + 1}. ${kind} · ${AK.esc(s.d.slice(0, 28))}</span>` +
        `<button type="button" data-a="mode">${s.mode === 'stroke' ? '채움으로' : '선으로'}</button><button type="button" data-a="del" aria-label="삭제">×</button>`;
      li.onclick = (e) => {
        const a = e.target.dataset && e.target.dataset.a;
        if (a === 'del') { removeShape(i); return; }
        if (a === 'mode') { commit(); s.mode = s.mode === 'stroke' ? 'fill' : 'stroke'; if (s.mode === 'stroke' && !s.sw) s.sw = sw; refresh(); return; }
        sel = sel === i ? -1 : i;
        $('#ed-d').value = sel >= 0 ? s.d : '';
        renderShapes(); draw();
      };
      ol.appendChild(li);
    });
    if (!ol.children.length) {
      const li = document.createElement('li');
      li.className = 'empty';
      li.textContent = '아직 도형이 없습니다. 왼쪽 도구로 그려 보세요.';
      ol.appendChild(li);
    }
  }

  function removeShape(i) {
    commit();
    g.shapes.splice(i, 1);
    sel = -1;
    refresh();
  }

  function refresh() {
    renderShapes();
    draw();
    drawPreview();
    $('#ed-rule').value = g.rule;
    $('#ed-grid').value = String(g.grid);
  }

  function setTool(t) {
    if (pen && t !== 'pen') finishPen(mode === 'fill');
    tool = t;
    document.querySelectorAll('#ed-toolset button').forEach((b) => b.classList.toggle('on', b.dataset.tool === t));
    $('#ed-hint').textContent = HINTS[t];
    cv.style.cursor = t === 'pixel' ? 'cell' : 'crosshair';
  }
  function setMode(m) {
    mode = m;
    document.querySelectorAll('#ed-modeset button').forEach((b) => b.classList.toggle('on', b.dataset.mode === m));
  }

  document.querySelectorAll('#ed-toolset button').forEach((b) => (b.onclick = () => setTool(b.dataset.tool)));
  document.querySelectorAll('#ed-modeset button').forEach((b) => (b.onclick = () => setMode(b.dataset.mode)));
  $('#ed-sw').oninput = (e) => {
    sw = +e.target.value;
    $('#ed-sw-o').textContent = sw;
    if (sel >= 0 && g.shapes[sel] && g.shapes[sel].mode === 'stroke') { g.shapes[sel].sw = sw; draw(); drawPreview(); renderShapes(); }
  };
  $('#ed-sw').onchange = () => { if (sel >= 0) commit(); };
  $('#ed-snap').onchange = (e) => { snap = e.target.checked; };
  $('#ed-rule').onchange = (e) => { commit(); g.rule = e.target.value; refresh(); };
  $('#ed-grid').onchange = (e) => {
    const n = +e.target.value;
    commit();
    if (g.pixels.length) { // bake existing pixels into a vector shape before the grid changes
      g.shapes.unshift({ d: AK.pixelsD(g.pixels, g.grid), mode: 'fill' });
      g.pixels = [];
    }
    g.grid = n;
    refresh();
  };
  $('#ed-undo').onclick = undo;
  $('#ed-redo').onclick = redo;
  $('#ed-clear').onclick = () => { commit(); g.pixels = []; g.shapes = []; sel = -1; pen = null; refresh(); };

  const validD = (d) => /^[\sMmLlHhVvCcSsQqTtAaZz0-9.,eE+-]+$/.test(d) && /^\s*[Mm]/.test(d);
  $('#ed-add-d').onclick = () => {
    const d = $('#ed-d').value.trim();
    if (!validD(d)) { $('#ed-hint').textContent = 'path d는 M으로 시작하고 SVG 경로 명령(M L H V C S Q T A Z)과 숫자만 쓸 수 있습니다.'; return; }
    addShape({ d, mode, sw });
  };
  $('#ed-set-d').onclick = () => {
    const d = $('#ed-d').value.trim();
    if (sel < 0) { $('#ed-hint').textContent = '먼저 오른쪽 목록에서 갱신할 도형을 고르세요.'; return; }
    if (!validD(d)) { $('#ed-hint').textContent = 'path d 형식이 올바르지 않습니다.'; return; }
    commit(); g.shapes[sel].d = d; refresh();
  };
  $('#ed-svg').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const r = AK.importSVG(await f.text());
      commit();
      g.shapes.push(...r.shapes);
      if (r.rule === 'evenodd') g.rule = 'evenodd';
      refresh();
      $('#ed-hint').textContent = `${f.name}에서 도형 ${r.shapes.length}개를 가져왔습니다.`;
    } catch (err) { $('#ed-hint').textContent = err.message; }
  };

  $('#ed-cancel').onclick = () => dlg.close();
  $('#ed-save').onclick = () => {
    if (pen) finishPen(mode === 'fill');
    g.name = $('#ed-name').value.trim() || '글리프';
    g.fallback = [...$('#ed-fallback').value.trim()][0] || '#';
    if (!g.pixels.length && !g.shapes.length) { $('#ed-hint').textContent = '빈 글리프는 저장할 수 없습니다. 도형을 하나 이상 그리세요.'; return; }
    g.v = (g.v || 1) + 1;
    if (hist.length) delete g.gen; // hand edits no longer match the generator recipe
    opts.onSave(g);
    dlg.close();
  };
  $('#ed-delete').onclick = () => {
    if ($('#ed-delete').dataset.confirm !== '1') {
      $('#ed-delete').dataset.confirm = '1';
      $('#ed-delete').textContent = '한 번 더 누르면 삭제';
      return;
    }
    opts.onDelete(g.id);
    dlg.close();
  };

  const ro = new ResizeObserver(() => { if (dlg.open) { draw(); drawPreview(); } });
  ro.observe(cv);

  function open(glyph, o) {
    g = AK.normGlyph(glyph);
    opts = o;
    sel = -1; pen = null; drag = null; hist = []; fut = [];
    $('#ed-title').textContent = o.isNew ? '새 글리프' : '글리프 편집';
    $('#ed-name').value = g.name;
    $('#ed-fallback').value = g.fallback;
    $('#ed-d').value = '';
    $('#ed-sw').value = sw; $('#ed-sw-o').textContent = sw;
    $('#ed-snap').checked = snap;
    const del = $('#ed-delete');
    del.hidden = !!o.isNew;
    del.dataset.confirm = '';
    del.textContent = '글리프 삭제';
    setTool(g.pixels.length && !g.shapes.length ? 'pixel' : tool);
    setMode(mode);
    dlg.showModal();
    AK.paintRanges(dlg);
    requestAnimationFrame(refresh);
  }

  return { open };
})();
