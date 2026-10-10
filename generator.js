'use strict';
/* generator.js — keyword → custom glyph.
   Sources: MOTIFS (motifs.js, hand-built silhouettes) and Lucide icons (vendor/lucide-icons.js, loaded on first use).
   A source becomes a "motif" { parts, lines } in 0–100 space, then a style turns it into glyph shapes:
     solid  — parts filled (holes evenodd), lines stroked
     line   — everything stroked at the chosen weight
     hatch  — parts filled with parallel strokes (density = spacing), optional outline
     dots   — parts filled with a hex dot screen (density = spacing, weight = dot size)
     pixel  — whole motif rasterised to an N×N grid with 4×4 Bayer dithering (density = coverage) */

const GlyphGen = (() => {
  const $ = (s) => document.querySelector(s);

  /* ---------- Korean → English keywords for the icon library */
  const KO_EN = {
    '원두': ['bean', 'coffee'], '커피': ['coffee', 'cup'], '커피콩': ['bean'], '콩': ['bean'], '컵': ['cup', 'glass'], '차': ['car', 'tea'], '녹차': ['tea'],
    '카페': ['coffee'], '케이크': ['cake', 'cake-slice'], '컵케이크': ['cupcake'], '빵': ['croissant', 'sandwich'], '피자': ['pizza'], '햄버거': ['hamburger', 'burger'],
    '음식': ['utensils', 'food'], '포크': ['utensils'], '숟가락': ['utensils'], '사과': ['apple'], '포도': ['grape'], '바나나': ['banana'], '체리': ['cherry'],
    '레몬': ['citrus'], '당근': ['carrot'], '달걀': ['egg'], '계란': ['egg'], '우유': ['milk'], '와인': ['wine'], '맥주': ['beer'], '술': ['wine', 'beer'],
    '아이스크림': ['ice-cream'], '사탕': ['candy'], '쿠키': ['cookie'], '도넛': ['donut'], '샌드위치': ['sandwich'], '물고기': ['fish'], '생선': ['fish'],
    '고양이': ['cat'], '개': ['dog'], '강아지': ['dog'], '새': ['bird'], '토끼': ['rabbit'], '쥐': ['rat'], '거북이': ['turtle'], '벌레': ['bug'], '나비': ['butterfly'],
    '달팽이': ['snail'], '뱀': ['snake'], '발자국': ['paw-print', 'footprints'], '뼈': ['bone'], '해골': ['skull'], '유령': ['ghost'], '외계인': ['alien'],
    '꽃': ['flower'], '장미': ['flower'], '잎': ['leaf'], '나뭇잎': ['leaf'], '나무': ['tree'], '숲': ['trees'], '소나무': ['tree-pine'], '야자수': ['tree-palm'],
    '선인장': ['cactus'], '새싹': ['sprout'], '씨앗': ['sprout', 'bean'], '버섯': ['mushroom'], '클로버': ['clover'],
    '해': ['sun'], '태양': ['sun'], '달': ['moon'], '별': ['star'], '구름': ['cloud'], '비': ['cloud-rain', 'umbrella'], '눈': ['eye', 'snowflake'], '눈송이': ['snowflake'],
    '번개': ['zap', 'cloud-lightning'], '바람': ['wind'], '무지개': ['rainbow'], '불': ['flame'], '불꽃': ['flame', 'sparkles'], '물': ['droplet', 'waves'],
    '물방울': ['droplet'], '파도': ['waves'], '바다': ['waves', 'sailboat'], '산': ['mountain'], '지구': ['globe', 'earth'], '행성': ['orbit', 'planet'],
    '우주': ['rocket', 'orbit'], '로켓': ['rocket'], '온도': ['thermometer'], '우산': ['umbrella'],
    '집': ['house', 'home'], '건물': ['building'], '학교': ['school'], '병원': ['hospital'], '성': ['castle'], '텐트': ['tent'], '공장': ['factory'], '교회': ['church'],
    '자동차': ['car'], '차량': ['car'], '버스': ['bus'], '기차': ['train'], '비행기': ['plane'], '배': ['ship', 'sailboat'], '자전거': ['bike', 'bicycle'],
    '오토바이': ['motorbike'], '트럭': ['truck'], '닻': ['anchor'], '지도': ['map'], '나침반': ['compass'], '깃발': ['flag'], '위치': ['map-pin'],
    '전화': ['phone'], '휴대폰': ['smartphone'], '컴퓨터': ['computer', 'monitor'], '노트북': ['laptop'], '카메라': ['camera'], '사진': ['image', 'camera'],
    '시계': ['clock', 'watch'], '알람': ['alarm-clock'], '모래시계': ['hourglass'], '달력': ['calendar'], '편지': ['mail'], '메일': ['mail'], '책': ['book'],
    '연필': ['pencil'], '펜': ['pen'], '붓': ['paintbrush', 'brush'], '팔레트': ['palette'], '가위': ['scissors'], '종이': ['file'], '클립': ['paperclip'],
    '열쇠': ['key'], '자물쇠': ['lock'], '문': ['door-open'], '전구': ['lightbulb'], '아이디어': ['lightbulb'], '배터리': ['battery'], '플러그': ['plug'],
    '망치': ['hammer'], '렌치': ['wrench'], '톱니바퀴': ['cog', 'settings'], '설정': ['settings'], '자석': ['magnet'], '돋보기': ['search'], '검색': ['search'],
    '선물': ['gift'], '가방': ['briefcase', 'backpack'], '쇼핑': ['shopping-bag', 'shopping-cart'], '돈': ['banknote', 'coins'], '동전': ['coins'], '지갑': ['wallet'],
    '왕관': ['crown'], '보석': ['gem'], '다이아몬드': ['diamond', 'gem'], '반지': ['gem'], '트로피': ['trophy'], '메달': ['medal'], '방패': ['shield'], '칼': ['sword'],
    '음악': ['music'], '음표': ['music'], '노래': ['music'], '기타': ['guitar'], '피아노': ['piano'], '드럼': ['drum'], '헤드폰': ['headphones'], '마이크': ['mic'],
    '스피커': ['speaker'], '영화': ['film', 'clapperboard'], '게임': ['gamepad', 'gamepad-2'], '주사위': ['dice-5'], '퍼즐': ['puzzle'], '공': ['volleyball', 'circle'],
    '축구': ['volleyball'], '하트': ['heart'], '사랑': ['heart'], '웃음': ['smile', 'laugh'], '얼굴': ['smile'], '슬픔': ['frown'], '사람': ['user', 'person-standing'],
    '손': ['hand'], '엄지': ['thumbs-up'], '좋아요': ['thumbs-up'], '뇌': ['brain'], '안경': ['glasses'], '옷': ['shirt'], '셔츠': ['shirt'], '신발': ['footprints'],
    '모자': ['hard-hat'], '왕': ['crown'], '천사': ['sparkles'], '마법': ['wand', 'sparkles'], '반짝': ['sparkles'], '종': ['bell'], '알림': ['bell'],
    '화살표': ['arrow-right'], '위': ['arrow-up'], '아래': ['arrow-down'], '체크': ['check'], '엑스': ['x'], '더하기': ['plus'], '빼기': ['minus'], '물음표': ['circle-help'],
    '느낌표': ['circle-alert'], '경고': ['triangle-alert'], '정보': ['info'], '원': ['circle'], '사각형': ['square'], '삼각형': ['triangle'], '육각형': ['hexagon'],
    '오각형': ['pentagon'], '소용돌이': ['tornado'], '나선': ['loader'], '무한': ['infinity'], '와이파이': ['wifi'], '신호': ['signal', 'radio'], '안테나': ['antenna'],
    '구름비': ['cloud-rain'], '쓰레기': ['trash'], '휴지통': ['trash-2'], '재활용': ['recycle'], '평화': ['peace'], '음양': ['yin-yang'], '해시': ['hash'],
    '약': ['pill'], '주사': ['syringe'], '심장': ['heart-pulse'], '눈물': ['droplet'], '수염': ['cat'], '곰': ['panda'], '판다': ['panda'], '오리': ['bird'],
    '닭': ['egg'], '돼지': ['piggy-bank'], '소': ['beef'], '고기': ['beef', 'ham'], '거미': ['bug'], '벌': ['bug'], '깃털': ['feather'], '조개': ['shell'],
  };

  /* ---------- icon library (lazy) */
  let iconsPromise = null;
  function loadIcons() {
    if (window.AK_ICONS) return Promise.resolve(window.AK_ICONS);
    if (!iconsPromise) {
      iconsPromise = new Promise((resolve, reject) => {
        const s = document.createElement('script');
        s.src = 'vendor/lucide-icons.js';
        s.onload = () => resolve(window.AK_ICONS);
        s.onerror = () => { iconsPromise = null; reject(new Error('아이콘 라이브러리를 불러오지 못했습니다.')); };
        document.head.appendChild(s);
      });
    }
    return iconsPromise;
  }

  const ICON_M = [100 / 24, 0, 0, 100 / 24, 0, 0];
  function iconMotif(name) {
    const ds = (window.AK_ICONS[name] || ['', []])[1];
    const parts = [], lines = [];
    for (const d of ds) (/[zZ]\s*$/.test(d) ? parts : lines).push({ d, m: ICON_M });
    return { parts, lines };
  }
  function motifFor(src, id, w) {
    if (src === 'icon') return iconMotif(id);
    const mo = MOTIFS.find((x) => x.id === id);
    const r = mo ? mo.build(w) : {};
    return { parts: r.parts || [], lines: r.lines || [] };
  }

  /* ---------- search */
  function englishTerms(q) {
    const out = new Set();
    if (/^[a-z0-9 -]+$/.test(q)) { out.add(q.replace(/\s+/g, '-')); q.split(/\s+/).forEach((t) => t && out.add(t)); }
    if (KO_EN[q]) KO_EN[q].forEach((t) => out.add(t));
    else for (const [ko, en] of Object.entries(KO_EN)) if (ko.length >= 2 && q.includes(ko)) en.forEach((t) => out.add(t));
    return [...out];
  }

  function search(raw) {
    const q = raw.trim().toLowerCase();
    if (!q) return MOTIFS.map((m) => ({ src: 'motif', id: m.id, label: m.names[0] }));
    const terms = englishTerms(q);
    const res = [];
    for (const m of MOTIFS) {
      let s = 0;
      for (const n of m.names) {
        const nl = n.toLowerCase();
        if (nl === q) s = Math.max(s, 300);
        else if (q.length >= 2 && (nl.startsWith(q) || q.startsWith(nl))) s = Math.max(s, 220);
        else if (q.length >= 2 && (nl.includes(q) || q.includes(nl))) s = Math.max(s, 180);
        else if (terms.includes(nl)) s = Math.max(s, 160);
      }
      if (s) res.push({ src: 'motif', id: m.id, label: m.names[0], s });
    }
    if (window.AK_ICONS && terms.length) {
      for (const [name, [tags]] of Object.entries(window.AK_ICONS)) {
        const parts = name.split('-');
        const tagWords = tags.split(' ');
        let s = 0;
        terms.forEach((t, ti) => {
          const bonus = -ti * 2; // earlier dictionary terms are better translations
          if (name === t) s = Math.max(s, 120 + bonus);
          else if (parts.includes(t)) s = Math.max(s, 90 - parts.length * 3 + bonus);
          else if (tagWords.includes(t)) s = Math.max(s, 50 + bonus);
          else if (t.length >= 4 && name.includes(t)) s = Math.max(s, 30 + bonus);
        });
        if (s && parts.includes('off') && !terms.includes('off')) s -= 40;
        if (s > 0) res.push({ src: 'icon', id: name, label: name, s });
      }
    }
    res.sort((a, b) => b.s - a.s);
    return res.slice(0, 36);
  }

  /* ---------- style renderer */
  const mask = document.createElement('canvas');
  const MASK = 200;
  mask.width = mask.height = MASK;
  const mctx = mask.getContext('2d', { willReadFrequently: true });

  const toArr = (m) => [m.a, m.b, m.c, m.d, m.e, m.f].map((v) => Math.round(v * 1e4) / 1e4);
  const isIdentity = (a) => a[0] === 1 && a[1] === 0 && a[2] === 0 && a[3] === 1 && a[4] === 0 && a[5] === 0;
  const lerp = (a, b, t) => a + (b - a) * t;
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

  function placed(motif, o) {
    const G = new DOMMatrix().translate(50, 50).rotate(o.rotate).scale(o.size * (o.flip ? -1 : 1), o.size).translate(-50, -50);
    const fix = (arr) => arr.map((p) => {
      const m = toArr(G.multiply(new DOMMatrix(p.m || [1, 0, 0, 1, 0, 0])));
      return { d: p.d, m: isIdentity(m) ? undefined : m };
    });
    return { parts: fix(motif.parts), lines: fix(motif.lines) };
  }

  function path(p) {
    const q = new Path2D();
    q.addPath(new Path2D(p.d), p.m ? new DOMMatrix(p.m) : undefined);
    return q;
  }

  // alpha mask of the motif in 0–100 space; withLines also strokes the open lines
  function readMask(pl, w, withLines) {
    mctx.setTransform(1, 0, 0, 1, 0, 0);
    mctx.clearRect(0, 0, MASK, MASK);
    mctx.setTransform(MASK / 100, 0, 0, MASK / 100, 0, 0);
    mctx.fillStyle = '#000'; mctx.strokeStyle = '#000';
    for (const p of pl.parts) mctx.fill(path(p), 'evenodd');
    if (withLines) {
      mctx.lineWidth = w; mctx.lineCap = 'round'; mctx.lineJoin = 'round';
      for (const p of pl.lines) mctx.stroke(path(p));
    }
    const a = mctx.getImageData(0, 0, MASK, MASK).data;
    return (x, y) => {
      if (x < 0 || y < 0 || x >= 100 || y >= 100) return false;
      return a[(Math.floor(y * MASK / 100) * MASK + Math.floor(x * MASK / 100)) * 4 + 3] > 127;
    };
  }

  const strokeAll = (arr, sw) => arr.map((p) => ({ d: p.d, m: p.m, mode: 'stroke', sw }));
  const fillAll = (arr) => arr.map((p) => ({ d: p.d, m: p.m, mode: 'fill', rule: 'evenodd' }));

  function render(src, id, o) {
    const pl = placed(motifFor(src, id, o.weight), o);
    const w = o.weight;
    const g = { shapes: [], pixels: [], grid: 16, rule: 'nonzero' };
    if (o.style === 'solid') {
      g.shapes = fillAll(pl.parts).concat(strokeAll(pl.lines, w));
    } else if (o.style === 'line') {
      g.shapes = strokeAll(pl.parts, w).concat(strokeAll(pl.lines, w));
    } else if (o.style === 'hatch') {
      const inside = readMask(pl, w, false);
      const hw = Math.max(0.8, w * 0.5);
      const sp = Math.max(hw + 1.2, lerp(16, 3, o.density));
      const a = (o.angle * Math.PI) / 180, ux = Math.cos(a), uy = Math.sin(a), nx = -uy, ny = ux;
      let d = '';
      for (let off = -72; off <= 72; off += sp) {
        let start = null, last = null;
        for (let t = -72; t <= 72.01; t += 0.5) {
          const x = 50 + nx * off + ux * t, y = 50 + ny * off + uy * t;
          const inn = inside(x, y);
          if (inn && !start) start = [x, y];
          if (inn) last = [x, y];
          if ((!inn || t > 72) && start) {
            if (Math.hypot(last[0] - start[0], last[1] - start[1]) >= 0.8) d += `M${AK.round(start[0])} ${AK.round(start[1])}L${AK.round(last[0])} ${AK.round(last[1])}`;
            start = null;
          }
        }
      }
      if (d) g.shapes.push({ d, mode: 'stroke', sw: AK.round(hw) });
      if (o.outline) g.shapes.push(...strokeAll(pl.parts, w));
      g.shapes.push(...strokeAll(pl.lines, w));
    } else if (o.style === 'dots') {
      const inside = readMask(pl, w, false);
      const sp = lerp(14, 3.2, o.density);
      const r = Math.min(sp * 0.5, Math.max(0.6, w * 0.3));
      let d = '', row = 0;
      for (let y = sp / 2; y < 100; y += sp * 0.866, row++) {
        for (let x = (row % 2 ? sp : sp / 2); x < 100; x += sp) if (inside(x, y)) d += AK.d.ellipse(x, y, r, r);
      }
      if (d) g.shapes.push({ d, mode: 'fill' });
      if (o.outline) g.shapes.push(...strokeAll(pl.parts, w));
      g.shapes.push(...strokeAll(pl.lines, w));
    } else if (o.style === 'pixel') {
      const inside = readMask(pl, w, true);
      const n = o.grid, c = 100 / n;
      g.grid = n;
      for (let y = 0; y < n; y++) {
        for (let x = 0; x < n; x++) {
          let hit = 0;
          for (let sy = 0; sy < 3; sy++) for (let sx = 0; sx < 3; sx++) if (inside((x + (sx + 0.5) / 3) * c, (y + (sy + 0.5) / 3) * c)) hit++;
          if (hit >= 5 && (BAYER[(y % 4) * 4 + (x % 4)] + 0.5) / 16 < (o.fill ?? 1)) g.pixels.push(y * n + x);
        }
      }
    }
    return g;
  }

  /* ---------- UI */
  const dlg = $('#gen');
  const DEFAULT_OPTS = { style: 'solid', weight: 8, density: 0.55, fill: 1, angle: 45, outline: true, grid: 16, size: 0.84, rotate: 0, flip: false };
  const CTL = [
    { k: 'weight', label: '두께', min: 1, max: 24, step: 0.5, styles: ['solid', 'line', 'hatch', 'dots', 'pixel'] },
    { k: 'density', label: '밀도 (선·점 간격)', min: 0.05, max: 1, step: 0.01, styles: ['hatch', 'dots'] },
    { k: 'fill', label: '채움 밀도 (디더링)', min: 0.05, max: 1, step: 0.01, styles: ['pixel'] },
    { k: 'angle', label: '해칭 각도', min: 0, max: 180, step: 1, styles: ['hatch'] },
    { k: 'grid', label: '픽셀 해상도', min: 6, max: 32, step: 1, styles: ['pixel'] },
    { k: 'size', label: '크기', min: 0.4, max: 1.3, step: 0.01, styles: null },
    { k: 'rotate', label: '회전', min: -180, max: 180, step: 1, styles: null },
  ];
  const SUGGEST = ['원두', '커피', '하트', '꽃', '잎', '고양이', '번개', '달', '물방울', '버섯', '자전거', '카메라', 'rocket', 'anchor'];

  let cur = null;       // { src, id, label }
  let o = { ...DEFAULT_OPTS };
  let host = null;      // app bridge
  let editing = null;   // existing glyph being re-tuned
  let lastResults = [];

  function buildControls() {
    const box = $('#gen-ranges');
    box.innerHTML = '';
    for (const c of CTL) {
      const row = document.createElement('div');
      row.className = 'ctl ctl-range';
      row.innerHTML = `<label for="gen-${c.k}">${c.label}</label><output id="gen-${c.k}-o"></output><input type="range" id="gen-${c.k}" min="${c.min}" max="${c.max}" step="${c.step}">`;
      c.row = row; c.input = row.querySelector('input'); c.out = row.querySelector('output');
      c.input.addEventListener('input', () => { o[c.k] = +c.input.value; c.out.textContent = fmt(c, o[c.k]); update(); });
      box.appendChild(row);
    }
  }
  const fmt = (c, v) => (c.k === 'density' || c.k === 'fill' ? `${Math.round(v * 100)}%` : c.k === 'rotate' || c.k === 'angle' ? `${v}°` : c.k === 'grid' ? `${v}×${v}` : c.k === 'size' ? `${Math.round(v * 100)}%` : String(v));

  function syncControls() {
    for (const c of CTL) {
      c.input.value = o[c.k]; c.out.textContent = fmt(c, o[c.k]);
      c.row.hidden = !!c.styles && !c.styles.includes(o.style);
    }
    document.querySelectorAll('#gen-styles button').forEach((b) => b.classList.toggle('on', b.dataset.style === o.style));
    $('#gen-outline').checked = o.outline;
    $('#gen-outline-row').hidden = !(o.style === 'hatch' || o.style === 'dots');
    $('#gen-flip').checked = o.flip;
    AK.paintRanges($('#gen'));
  }

  function currentGlyph() {
    if (!cur) return null;
    const r = render(cur.src, cur.id, o);
    return AK.normGlyph({
      id: editing ? editing.id : undefined,
      v: editing ? (editing.v || 1) + 1 : 1,
      name: $('#gen-name').value.trim() || cur.label,
      fallback: [...$('#gen-fallback').value.trim()][0] || '*',
      grid: r.grid, pixels: r.pixels, shapes: r.shapes, rule: r.rule,
      gen: { src: cur.src, id: cur.id, label: cur.label, opts: { ...o } },
    });
  }

  function paintGlyph(cv, g, fg, bg, pad = 0.08) {
    const dpr = window.devicePixelRatio || 1;
    const r = cv.getBoundingClientRect();
    const W = Math.max(1, Math.round((r.width || cv.width) * dpr)), H = Math.max(1, Math.round((r.height || cv.height) * dpr));
    if (cv.width !== W || cv.height !== H) { cv.width = W; cv.height = H; }
    const c = cv.getContext('2d');
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = bg; c.fillRect(0, 0, W, H);
    const s = (Math.min(W, H) * (1 - pad * 2)) / 100;
    c.setTransform(s, 0, 0, s, (W - 100 * s) / 2, (H - 100 * s) / 2);
    c.fillStyle = fg; c.strokeStyle = fg;
    AK.drawGlyph(c, AK.compileGlyph(g));
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  function paintField(cv, g) {
    const dpr = window.devicePixelRatio || 1;
    const r = cv.getBoundingClientRect();
    cv.width = Math.round(r.width * dpr); cv.height = Math.round(r.height * dpr);
    const c = cv.getContext('2d');
    c.fillStyle = host.bg; c.fillRect(0, 0, cv.width, cv.height);
    c.fillStyle = host.fg; c.strokeStyle = host.fg;
    const cg = AK.compileGlyph(g);
    // left: three sizes; right: tiled at cell size, the way it appears in the letter
    let x = 12 * dpr;
    for (const size of [40, 24, 14]) {
      const s = (size * dpr) / 100;
      c.setTransform(s, 0, 0, s, x, (cv.height - size * dpr) / 2);
      AK.drawGlyph(c, cg);
      x += size * dpr + 14 * dpr;
    }
    const cell = 12 * dpr, s = cell / 100;
    for (let yy = 0; (yy + 1) * cell <= cv.height - 8 * dpr; yy++) {
      for (let xx = 0; x + (xx + 1) * cell <= cv.width - 8 * dpr; xx++) {
        c.setTransform(s, 0, 0, s, x + xx * cell, 6 * dpr + yy * cell);
        AK.drawGlyph(c, cg);
      }
    }
    c.setTransform(1, 0, 0, 1, 0, 0);
  }

  let raf = 0;
  function update() {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const g = currentGlyph();
      const empty = !g || (!g.pixels.length && !g.shapes.length);
      $('#gen-add').disabled = empty;
      $('#gen-edit').disabled = empty;
      if (!g) { $('#gen-dens').textContent = '왼쪽 결과에서 모양을 고르세요.'; return; }
      paintGlyph($('#gen-canvas'), g, host.fg, host.bg);
      paintField($('#gen-field'), g);
      $('#gen-dens').textContent = empty ? '이 설정에서는 그려지는 부분이 없습니다. 밀도나 두께를 올려 보세요.' : host.describe(g);
    });
  }

  function renderResults(list) {
    lastResults = list;
    const grid = $('#gen-grid');
    grid.innerHTML = '';
    for (const r of list) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'gen-item' + (cur && cur.src === r.src && cur.id === r.id ? ' on' : '');
      b.title = r.src === 'icon' ? `아이콘: ${r.id}` : `모티프: ${r.label}`;
      b.innerHTML = `<canvas width="64" height="64"></canvas><span>${AK.esc(r.label)}</span><em>${r.src === 'icon' ? '아이콘' : '모티프'}</em>`;
      const style = r.src === 'icon' ? 'line' : 'solid';
      const g = render(r.src, r.id, { ...DEFAULT_OPTS, style });
      grid.appendChild(b);
      paintGlyph(b.querySelector('canvas'), { ...g, rule: 'nonzero' }, host.fg, host.bg, 0.06);
      b.onclick = () => select(r);
    }
  }

  function select(r, opts) {
    const changed = !cur || cur.src !== r.src || cur.id !== r.id;
    cur = r;
    if (opts) o = { ...DEFAULT_OPTS, ...opts };
    else if (changed) o = { ...o, style: r.src === 'icon' ? 'line' : 'solid' };
    if (changed && !opts) {
      const q = $('#gen-q').value.trim();
      $('#gen-name').value = q && /[^\x00-\x7f]/.test(q) ? q.slice(0, 24) : r.label; // keep the user's Korean keyword as the name
    }
    document.querySelectorAll('#gen-grid .gen-item').forEach((b, i) => {
      const it = lastResults[i];
      b.classList.toggle('on', !!it && it.src === r.src && it.id === r.id);
    });
    syncControls();
    update();
  }

  async function runSearch() {
    const q = $('#gen-q').value;
    const status = $('#gen-status');
    let list = search(q);
    renderResults(list);
    if (q.trim() && !window.AK_ICONS) {
      status.textContent = '아이콘 라이브러리를 불러오는 중…';
      try { await loadIcons(); list = search(q); renderResults(list); } catch (e) { status.textContent = e.message + ' 모티프만 검색합니다.'; }
    }
    if (!q.trim()) status.textContent = `기본 모티프 ${list.length}개`;
    else if (!list.length) status.textContent = `“${q.trim()}”에 맞는 모양을 찾지 못했습니다. 비슷한 말이나 영어 단어로 검색해 보세요 (예: bicycle).`;
    else if (window.AK_ICONS) status.textContent = `결과 ${list.length}개`;
    if (list.length && (!cur || !list.some((r) => r.src === cur.src && r.id === cur.id))) select(list[0]);
  }

  // wiring
  buildControls();
  $('#gen-sugg').innerHTML = SUGGEST.map((s) => `<button type="button">${AK.esc(s)}</button>`).join('');
  $('#gen-sugg').onclick = (e) => { const b = e.target.closest('button'); if (b) { $('#gen-q').value = b.textContent; runSearch(); } };
  $('#gen-form').addEventListener('submit', (e) => { e.preventDefault(); runSearch(); });
  document.querySelectorAll('#gen-styles button').forEach((b) => (b.onclick = () => { o.style = b.dataset.style; syncControls(); update(); }));
  $('#gen-outline').onchange = (e) => { o.outline = e.target.checked; update(); };
  $('#gen-flip').onchange = (e) => { o.flip = e.target.checked; update(); };
  $('#gen-reset').onclick = () => { o = { ...DEFAULT_OPTS, style: o.style }; syncControls(); update(); };
  $('#gen-cancel').onclick = () => dlg.close();
  $('#gen-add').onclick = () => { const g = currentGlyph(); if (!g) return; dlg.close(); host.onSave(g, !editing); };
  $('#gen-edit').onclick = () => {
    const g = currentGlyph();
    if (!g) return;
    delete g.gen;
    dlg.close();
    host.onEdit(g, editing);
  };
  new ResizeObserver(() => { if (dlg.open) update(); }).observe($('#gen-canvas'));

  function open(bridge, glyph) {
    host = bridge;
    editing = glyph && glyph.gen ? glyph : null;
    $('#gen-title').textContent = editing ? `글리프 다시 조절 · ${editing.name}` : '키워드로 글리프 생성';
    $('#gen-add').textContent = editing ? '저장' : '유닛에 추가';
    dlg.showModal();
    if (editing) {
      const gn = editing.gen;
      $('#gen-q').value = gn.src === 'icon' ? gn.id : gn.label;
      $('#gen-name').value = editing.name;
      $('#gen-fallback').value = editing.fallback;
      cur = null;
      const ready = gn.src === 'icon' ? loadIcons() : Promise.resolve();
      ready.then(() => {
        renderResults(search($('#gen-q').value));
        select({ src: gn.src, id: gn.id, label: gn.label }, gn.opts);
      }).catch((e) => { $('#gen-status').textContent = e.message; });
    } else {
      $('#gen-fallback').value = '*';
      if (!lastResults.length) runSearch(); else { renderResults(lastResults); syncControls(); update(); }
      $('#gen-q').focus();
      $('#gen-q').select();
    }
  }

  return { open, search, render, loadIcons };
})();
