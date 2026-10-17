'use strict';
/* motifs.js — hand-built silhouettes for the keyword glyph generator.
   Drawn in the 0–100 glyph square and tuned to read at cell size (solid masses, few details).
   build(w) gets the stroke weight so inner cuts (bean groove, leaf vein…) thicken with it.
   parts: closed shapes, extra subpaths are holes (filled evenodd). lines: always stroked. */

const MOTIFS = (() => {
  const E = AK.d.ellipse;
  const C = (cx, cy, r) => E(cx, cy, r, r);
  const P = (pts, closed = true) => AK.d.poly(pts, closed);
  const RR = AK.d.roundRect;
  const f = AK.round;
  // rotation matrix about (cx, cy), as [a b c d e f]
  const rot = (deg, cx = 50, cy = 50) => {
    const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
    return [c, s, -s, c, cx - c * cx + s * cy, cy - s * cx - c * cy];
  };
  const polar = (cx, cy, r, deg) => [cx + r * Math.cos((deg * Math.PI) / 180), cy + r * Math.sin((deg * Math.PI) / 180)];
  const star = (n, R, r, cx = 50, cy = 52, a0 = -90) => {
    const pts = [];
    for (let i = 0; i < n * 2; i++) pts.push(polar(cx, cy, i % 2 ? r : R, a0 + (i * 180) / n));
    return P(pts);
  };
  // crescent = disc (cx,cy,R) minus disc (ox,oy,r), built from the two intersection points
  const crescent = (cx, cy, R, ox, oy, r) => {
    const dx = ox - cx, dy = oy - cy, d = Math.hypot(dx, dy);
    const a = (R * R - r * r + d * d) / (2 * d), h = Math.sqrt(Math.max(0, R * R - a * a));
    const mx = cx + (a * dx) / d, my = cy + (a * dy) / d;
    const p1 = [mx + (h * dy) / d, my - (h * dx) / d], p2 = [mx - (h * dy) / d, my + (h * dx) / d];
    return `M${f(p1[0])} ${f(p1[1])}A${R} ${R} 0 1 0 ${f(p2[0])} ${f(p2[1])}A${r} ${r} 0 0 1 ${f(p1[0])} ${f(p1[1])}Z`;
  };

  const list = [
    { id: 'bean', names: ['원두', '커피콩', '커피 원두', '콩', 'coffee bean', 'bean'], build: (w) => {
      const a = Math.max(1.6, w * 0.45);
      const groove = `M50 18C${f(37 - a)} 38 ${f(63 - a)} 62 50 82C${f(63 + a)} 62 ${f(37 + a)} 38 50 18Z`;
      return { parts: [{ d: E(50, 50, 27, 38) + groove, m: rot(-32) }] };
    } },
    { id: 'cup', names: ['커피', '커피잔', '컵', '카페', '머그', '찻잔', 'coffee', 'cup', 'mug', 'cafe'], build: (w) => {
      const t = Math.max(3, w * 0.8);
      return {
        parts: [
          { d: 'M16 42H70V62C70 76 60 86 43 86C26 86 16 76 16 62Z' },
          { d: C(72, 58, 12) + C(72, 58, 12 - t) },
          { d: 'M8 89H84C84 93 80 95 76 95H16C12 95 8 93 8 89Z' },
        ],
        lines: [{ d: 'M32 34C27 28 37 23 32 15' }, { d: 'M46 34C41 28 51 23 46 15' }],
      };
    } },
    { id: 'heart', names: ['하트', '사랑', '마음', 'heart', 'love'], build: () => ({
      parts: [{ d: 'M50 86C20 64 10 46 10 34C10 20 21 12 32 12C41 12 47 18 50 25C53 18 59 12 68 12C79 12 90 20 90 34C90 46 80 64 50 86Z' }],
    }) },
    { id: 'star', names: ['별', '스타', 'star'], build: () => ({ parts: [{ d: star(5, 44, 19) }] }) },
    { id: 'sparkle', names: ['반짝', '반짝임', '빛', 'sparkle', 'shine', 'twinkle'], build: () => ({
      parts: [{ d: 'M50 6C53 36 64 47 94 50C64 53 53 64 50 94C47 64 36 53 6 50C36 47 47 36 50 6Z' }],
    }) },
    { id: 'flower', names: ['꽃', '꽃잎', '블라썸', 'flower', 'blossom', 'petal'], build: () => {
      const parts = [];
      for (let i = 0; i < 5; i++) parts.push({ d: E(50, 25, 12, 17), m: rot(i * 72) });
      parts.push({ d: C(50, 50, 9) });
      return { parts };
    } },
    { id: 'leaf', names: ['잎', '나뭇잎', '잎사귀', '식물', 'leaf', 'plant'], build: (w) => {
      const a = Math.max(1, w * 0.3);
      return { parts: [{ d: 'M50 8C78 26 84 62 50 92C16 62 22 26 50 8Z' + AK.d.rect(50 - a, 22, a * 2, 60), m: rot(35) }] };
    } },
    { id: 'tree', names: ['나무', '숲', 'tree', 'forest'], build: () => ({
      parts: [{ d: C(50, 38, 30) }, { d: 'M43 60H57V92H43Z' }],
    }) },
    { id: 'sun', names: ['해', '태양', '햇빛', 'sun', 'sunny'], build: () => {
      const lines = [];
      for (let i = 0; i < 8; i++) { const a = polar(50, 50, 30, i * 45), b = polar(50, 50, 43, i * 45); lines.push({ d: P([a, b], false) }); }
      return { parts: [{ d: C(50, 50, 20) }], lines };
    } },
    { id: 'moon', names: ['달', '초승달', '밤', 'moon', 'night', 'crescent'], build: () => ({
      parts: [{ d: crescent(48, 52, 38, 66, 38, 32) }],
    }) },
    { id: 'cloud', names: ['구름', '흐림', 'cloud', 'cloudy'], build: () => ({
      parts: [{ d: C(32, 60, 17) }, { d: C(54, 48, 23) }, { d: C(74, 62, 15) }, { d: 'M24 62H80V77H24Z' }, { d: C(24, 69, 8) }, { d: C(80, 69, 8) }],
    }) },
    { id: 'drop', names: ['물방울', '물', '비', '눈물', 'drop', 'water', 'rain', 'tear'], build: (w) => ({
      parts: [{ d: 'M50 8C62 30 78 46 78 64C78 80 66 92 50 92C34 92 22 80 22 64C22 46 38 30 50 8Z' + E(37, 66, Math.max(2, w * 0.35), 8) }],
    }) },
    { id: 'snow', names: ['눈송이', '눈 결정', '겨울', '얼음', 'snow', 'snowflake', 'winter', 'ice'], build: () => {
      const lines = [];
      for (let i = 0; i < 6; i++) {
        const deg = i * 60 - 90;
        lines.push({ d: P([[50, 50], polar(50, 50, 42, deg)], false) });
        const b = polar(50, 50, 26, deg);
        lines.push({ d: P([polar(b[0], b[1], 12, deg - 45), b, polar(b[0], b[1], 12, deg + 45)], false) });
      }
      return { lines };
    } },
    { id: 'bolt', names: ['번개', '전기', '전기 충전', 'bolt', 'lightning', 'thunder', 'electric'], build: () => ({
      parts: [{ d: 'M58 6L20 56H46L38 94L80 40H54Z' }],
    }) },
    { id: 'fire', names: ['불', '불꽃', '화염', 'fire', 'flame'], build: () => ({
      parts: [{ d: 'M50 6C58 26 78 38 78 62C78 80 66 92 50 92C34 92 22 80 22 62C22 48 32 40 36 30C40 42 44 46 48 46C46 34 44 20 50 6Z' +
        'M50 52C55 62 62 68 62 76C62 83 57 87 50 87C43 87 38 83 38 76C38 68 45 62 50 52Z' }],
    }) },
    { id: 'house', names: ['집', '주택', '홈', 'house', 'home'], build: () => ({
      parts: [{ d: 'M50 10L92 46H80V90H20V46H8Z' + 'M42 62H58V90H42Z' }],
    }) },
    { id: 'fish', names: ['물고기', '생선', '고기', 'fish'], build: (w) => ({
      parts: [{ d: E(42, 50, 30, 20) + C(26, 46, Math.max(2.5, w * 0.4)) }, { d: 'M66 50L94 30V70Z' }],
    }) },
    { id: 'cat', names: ['고양이', '냥이', '야옹', 'cat', 'kitten'], build: () => ({
      parts: [
        { d: C(50, 58, 32) + E(38, 56, 4, 6.5) + E(62, 56, 4, 6.5) + P([[46, 68], [54, 68], [50, 73]]) },
        { d: P([[20, 44], [22, 8], [46, 28]]) },
        { d: P([[80, 44], [78, 8], [54, 28]]) },
      ],
    }) },
    { id: 'apple', names: ['사과', '과일', 'apple', 'fruit'], build: () => ({
      parts: [
        { d: 'M50 30C40 22 18 22 16 46C14 70 32 92 44 90C48 89 52 89 56 90C68 92 86 70 84 46C82 22 60 22 50 30Z' },
        { d: E(64, 16, 11, 5), m: rot(-30, 64, 16) },
      ],
      lines: [{ d: 'M50 30C50 22 51 16 54 10' }],
    }) },
    { id: 'cherry', names: ['체리', '버찌', 'cherry'], build: () => ({
      parts: [{ d: C(30, 72, 17) }, { d: C(70, 70, 17) }],
      lines: [{ d: 'M30 56C34 36 46 20 62 10' }, { d: 'M70 54C68 36 66 22 62 10' }],
    }) },
    { id: 'mushroom', names: ['버섯', 'mushroom', 'fungus'], build: (w) => {
      const r = Math.max(4, w * 0.7);
      return { parts: [
        { d: 'M8 54C8 26 28 10 50 10C72 10 92 26 92 54Z' + C(34, 32, r) + C(62, 26, r * 0.8) + C(70, 44, r * 0.7) },
        { d: 'M37 54H63V82C63 88 58 92 50 92C42 92 37 88 37 82Z' },
      ] };
    } },
    { id: 'key', names: ['열쇠', '키', 'key'], build: (w) => ({
      parts: [{ d: C(28, 50, 20) + C(28, 50, Math.max(4, 20 - Math.max(6, w * 1.2))) }, { d: 'M46 45H92V55H46Z' }, { d: 'M72 55H80V68H72Z' }, { d: 'M84 55H92V64H84Z' }],
    }) },
    { id: 'eye', names: ['눈', '시선', '보기', 'eye', 'see', 'view'], build: () => ({
      parts: [{ d: 'M6 50C26 20 74 20 94 50C74 80 26 80 6 50Z' + C(50, 50, 19) }, { d: C(50, 50, 10) }],
    }) },
    { id: 'note', names: ['음표', '음악', '노래', 'music', 'note', 'song'], build: () => ({
      parts: [{ d: E(36, 76, 16, 12), m: rot(-20, 36, 76) }, { d: 'M46 14H54V76H46Z' }, { d: 'M54 14C68 20 82 30 76 50C73 38 64 32 54 32Z' }],
    }) },
    { id: 'bulb', names: ['전구', '아이디어', '생각', 'bulb', 'idea', 'light'], build: () => ({
      parts: [
        { d: 'M50 6C30 6 18 22 18 38C18 52 30 60 34 70H66C70 60 82 52 82 38C82 22 70 6 50 6Z' },
        { d: 'M35 75H65V81H35Z' }, { d: 'M39 86H61V92H39Z' },
      ],
    }) },
    { id: 'gem', names: ['보석', '다이아몬드', '다이아', 'gem', 'diamond', 'jewel'], build: (w) => {
      const a = Math.max(1, w * 0.3);
      return { parts: [{ d: 'M28 14H72L92 38L50 90L8 38Z' + AK.d.rect(14, 38 - a, 72, a * 2) }] };
    } },
    { id: 'crown', names: ['왕관', '왕', '여왕', 'crown', 'king', 'queen'], build: () => ({
      parts: [{ d: 'M10 28L30 52L50 16L70 52L90 28L82 80H18Z' }, { d: 'M18 85H82V92H18Z' }],
    }) },
    { id: 'arrow', names: ['화살표', '화살', '오른쪽', 'arrow', 'right'], build: () => ({
      parts: [{ d: 'M8 40H56V18L92 50L56 82V60H8Z' }],
    }) },
    { id: 'plus', names: ['십자', '플러스', '더하기', '병원', 'plus', 'cross', 'add'], build: () => ({
      parts: [{ d: 'M37 8H63V37H92V63H63V92H37V63H8V37H37Z' }],
    }) },
    { id: 'planet', names: ['행성', '토성', '우주', 'planet', 'saturn', 'space'], build: () => ({
      parts: [{ d: C(50, 50, 22) }],
      lines: [{ d: E(50, 50, 45, 12), m: rot(-20) }],
    }) },
    { id: 'mountain', names: ['산', '봉우리', 'mountain', 'peak'], build: () => ({
      parts: [{ d: 'M4 86L36 28L52 54L66 38L96 86Z' }],
    }) },
    { id: 'wave', names: ['파도', '물결', '바다', 'wave', 'sea', 'ocean'], build: () => ({
      lines: [26, 50, 74].map((y) => ({ d: `M8 ${y}Q19 ${y - 11} 30 ${y}T52 ${y}T74 ${y}T96 ${y}` })),
    }) },
    { id: 'butterfly', names: ['나비', 'butterfly'], build: () => ({
      parts: [
        { d: E(31, 36, 18, 22), m: rot(-30, 31, 36) }, { d: E(69, 36, 18, 22), m: rot(30, 69, 36) },
        { d: E(35, 70, 12, 16), m: rot(25, 35, 70) }, { d: E(65, 70, 12, 16), m: rot(-25, 65, 70) },
        { d: E(50, 52, 4, 28) },
      ],
      lines: [{ d: 'M48 26C44 16 38 12 32 10' }, { d: 'M52 26C56 16 62 12 68 10' }],
    }) },
    { id: 'bread', names: ['빵', '식빵', '베이커리', 'bread', 'toast', 'bakery'], build: (w) => {
      const a = Math.max(1, w * 0.25);
      return { parts: [{ d: 'M14 48C10 28 30 16 50 16C70 16 90 28 86 48C84 54 80 56 80 60V86H20V60C20 56 16 54 14 48Z' +
        AK.d.rect(30, 44 - a, 40, a * 2) + AK.d.rect(30, 60 - a, 40, a * 2) }] };
    } },
    { id: 'wine', names: ['와인', '와인잔', '술', '건배', 'wine', 'glass', 'drink'], build: () => ({
      parts: [{ d: 'M26 8H74C76 36 66 54 50 54C34 54 24 36 26 8Z' }, { d: 'M47 52H53V84H47Z' }, { d: 'M30 84H70V91H30Z' }],
    }) },
    { id: 'clover', names: ['클로버', '행운', '네잎클로버', 'clover', 'luck', 'lucky'], build: () => ({
      parts: [{ d: C(36, 30, 15) }, { d: C(64, 30, 15) }, { d: C(36, 56, 15) }, { d: C(64, 56, 15) }],
      lines: [{ d: 'M50 58C52 74 58 84 68 92' }],
    }) },
    { id: 'spiral', names: ['나선', '소용돌이', '달팽이', 'spiral', 'swirl'], build: () => {
      // sample the Archimedean spiral every 30° and join the samples with Catmull-Rom cubics, so it stays a true curve
      const pts = [];
      for (let t = 0; t <= 3.25 * 360 + 1e-6; t += 30) pts.push(polar(50, 50, 2 + t * 0.036, t));
      let d = `M${f(pts[0][0])} ${f(pts[0][1])}`;
      for (let i = 0; i < pts.length - 1; i++) {
        const p0 = pts[Math.max(0, i - 1)], p1 = pts[i], p2 = pts[i + 1], p3 = pts[Math.min(pts.length - 1, i + 2)];
        d += `C${f(p1[0] + (p2[0] - p0[0]) / 6)} ${f(p1[1] + (p2[1] - p0[1]) / 6)} ${f(p2[0] - (p3[0] - p1[0]) / 6)} ${f(p2[1] - (p3[1] - p1[1]) / 6)} ${f(p2[0])} ${f(p2[1])}`;
      }
      return { lines: [{ d }] };
    } },
    { id: 'smile', names: ['스마일', '웃음', '얼굴', '행복', 'smile', 'face', 'happy'], build: (w) => {
      const t = Math.max(3, w * 0.7);
      return { parts: [{ d: C(50, 50, 42) + E(36, 40, 5, 8) + E(64, 40, 5, 8) + `M28 58C34 ${f(74 + t)} 66 ${f(74 + t)} 72 58C62 ${f(62 + t)} 38 ${f(62 + t)} 28 58Z` }] };
    } },
    { id: 'egg', names: ['달걀', '계란', '알', 'egg'], build: () => ({
      parts: [{ d: 'M50 8C72 8 86 44 86 62C86 80 70 92 50 92C30 92 14 80 14 62C14 44 28 8 50 8Z' }],
    }) },
    { id: 'check', names: ['체크', '확인', '완료', 'check', 'done', 'ok'], build: () => ({
      lines: [{ d: 'M14 52L38 76L86 24' }],
    }) },
    { id: 'cross', names: ['엑스', '취소', '닫기', 'x', 'close', 'cancel'], build: () => ({
      lines: [{ d: 'M18 18L82 82' }, { d: 'M82 18L18 82' }],
    }) },
    { id: 'bird', names: ['새', '참새', '비둘기', 'bird', 'dove'], build: () => ({
      parts: [
        { d: 'M18 58C18 40 32 28 50 28C58 28 64 22 72 22C80 22 86 28 86 34L94 38L84 42C82 62 66 78 44 78C30 78 18 70 18 58Z' + C(72, 32, 3) },
        { d: 'M30 50C40 46 54 50 62 60C50 66 36 64 30 50Z' },
        { d: 'M22 60L4 54L14 70Z' },
      ],
    }) },
  ];
  return list;
})();
