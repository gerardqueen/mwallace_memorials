// Memorial designer engine: everything needed to turn a design (plain JSON, sizes in mm) into
//  - a 2D picture of the face (stone + lettering + motif), used for thumbnails and as the 3D face texture
//  - a three.js scene at true size (metres), used for the live preview and exported to GLB/USDZ for AR.
// Nothing here touches the page, so the designer, the admin page and thumbnails can all share it.

export const SHAPES = [
  { key: 'square', name: 'Square top' },
  { key: 'round', name: 'Half round' },
  { key: 'ogee', name: 'Ogee' },
  { key: 'peak', name: 'Gothic peak' },
  { key: 'serpentine', name: 'Serpentine' },
  { key: 'heart', name: 'Heart' },
  { key: 'book', name: 'Open book' },
];

export const SIZES = [
  { key: 's', name: 'Small', w: 610, h: 610, t: 75 },
  { key: 'm', name: 'Medium', w: 610, h: 760, t: 75 },
  { key: 'l', name: 'Large', w: 760, h: 915, t: 75 },
  { key: 'xl', name: 'Tall', w: 760, h: 1070, t: 100 },
];

export const FONTS = [
  { key: 'roman', name: 'Roman', family: 'Cinzel', upper: true },
  { key: 'classic', name: 'Classic', family: 'Cormorant Garamond', upper: false, italicSmall: true },
  { key: 'block', name: 'Block', family: 'Montserrat', upper: true },
  { key: 'script', name: 'Script', family: 'Great Vibes', upper: false },
];

export const COLOURS = [
  { key: 'gold', name: 'Gold leaf' },
  { key: 'silver', name: 'Silver' },
  { key: 'lead', name: 'Lead' },
  { key: 'white', name: 'White' },
  { key: 'black', name: 'Black' },
  { key: 'cut', name: 'Cut only' },
];

export const MOTIFS = [
  { key: 'none', name: 'None' },
  { key: 'cross', name: 'Cross' },
  { key: 'celtic', name: 'Celtic cross' },
  { key: 'heart', name: 'Heart' },
  { key: 'hearts', name: 'Two hearts' },
  { key: 'star', name: 'Star of David' },
  { key: 'dove', name: 'Dove' },
];

export const CHIPS = [
  { key: 'white', name: 'White marble chips', base: '#e9e7e1', flecks: ['#ffffff', '#d6d3cb', '#c8c4ba'] },
  { key: 'grey', name: 'Grey granite chips', base: '#8d8d8a', flecks: ['#b5b5b1', '#5f5f5c', '#a3a39e'] },
  { key: 'green', name: 'Green glass chips', base: '#2f6b4f', flecks: ['#3f8f69', '#1f4d38', '#5aa883'] },
  { key: 'black', name: 'Black chips', base: '#262626', flecks: ['#3a3a3a', '#151515', '#4a4a4a'] },
];

// Built-in stones, drawn in code so the designer works before any photos are uploaded.
// Staff can add real stones (with a photo of the polished surface) in the admin page.
export const DEFAULT_STONES = [
  { id: 'black', name: 'Black granite', kind: 'granite', colour: '#111214', flecks: ['#2a2b2e', '#3c3d40', '#18191b'], density: 0.5 },
  { id: 'bluepearl', name: 'Blue Pearl granite', kind: 'granite', colour: '#3c434c', flecks: ['#6f8fb4', '#2a2f36', '#8aa4c6', '#1c1f24'], density: 0.9 },
  { id: 'grey', name: 'Grey granite', kind: 'granite', colour: '#8a8a88', flecks: ['#2d2d2d', '#c9c9c6', '#5b5b59', '#e2e2df'], density: 1.0 },
  { id: 'ruby', name: 'Ruby red granite', kind: 'granite', colour: '#7a2c26', flecks: ['#3a1513', '#b2574b', '#1d1a19', '#d08a7d'], density: 0.9 },
  { id: 'emerald', name: 'Emerald Pearl granite', kind: 'granite', colour: '#1f2723', flecks: ['#3f6a58', '#0e1311', '#5f8a78'], density: 0.8 },
  { id: 'paradiso', name: 'Brown granite', kind: 'granite', colour: '#4a3a33', flecks: ['#22180f', '#7d6656', '#a58a75', '#2f2420'], density: 1.0 },
  { id: 'whitemarble', name: 'White marble', kind: 'marble', colour: '#eeece7', vein: '#9fa3a6' },
  { id: 'greymarble', name: 'Grey veined marble', kind: 'marble', colour: '#d9d8d4', vein: '#5f6266' },
];

export const DEFAULT_DESIGN = {
  v: 1,
  shape: 'ogee', w: 610, h: 760, t: 75,
  stone: 'black',
  base: true, baseH: 150, vases: 2,
  kerbs: false, chips: 'white',
  font: 'roman', colour: 'gold', motif: 'cross',
  text: { top: 'In loving memory of', name: 'Name Surname', dates: '1940 – 2025', more: '', epitaph: 'Forever in our hearts' },
};

// ---------- small helpers ----------
// fleck colours for a stone that only has a base colour: darker, lighter and near-black/near-white grains
function shades(hex) {
  const n = parseInt(hex.replace('#', ''), 16), r = n >> 16, g = (n >> 8) & 255, b = n & 255;
  const mix = (k, t) => '#' + [r, g, b].map((c) => Math.round(c + (t - c) * k).toString(16).padStart(2, '0')).join('');
  return [mix(0.55, 0), mix(0.45, 255), mix(0.8, 20), mix(0.25, 255)];
}
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
function rng(seed) { // deterministic, so the same design always looks the same
  let s = seed >>> 0 || 1;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}
const hashStr = (str) => [...String(str)].reduce((h, c) => (Math.imul(h ^ c.charCodeAt(0), 16777619) >>> 0), 2166136261);

export function normalise(d) {
  const x = { ...DEFAULT_DESIGN, ...(d || {}), text: { ...DEFAULT_DESIGN.text, ...(d?.text || {}) } };
  x.w = clamp(+x.w || 610, 400, 1200); x.h = clamp(+x.h || 760, 400, 1500); x.t = clamp(+x.t || 75, 50, 150);
  x.baseH = clamp(+x.baseH || 150, 75, 300); x.vases = [0, 1, 2].includes(+x.vases) ? +x.vases : 0;
  if (!SHAPES.some((s) => s.key === x.shape)) x.shape = 'ogee';
  return x;
}
export function encodeDesign(d) {
  const json = JSON.stringify(d);
  return btoa(unescape(encodeURIComponent(json))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}
export function decodeDesign(s) {
  try { return normalise(JSON.parse(decodeURIComponent(escape(atob(s.replace(/-/g, '+').replace(/_/g, '/')))))); }
  catch { return null; }
}
export function describe(d, stones) {
  const st = stones.find((s) => s.id === d.stone);
  const parts = [
    `${SHAPES.find((s) => s.key === d.shape)?.name} headstone, ${d.w}mm wide × ${d.h}mm high × ${d.t}mm`,
    st ? st.name : d.stone,
    `${FONTS.find((f) => f.key === d.font)?.name} lettering in ${COLOURS.find((c) => c.key === d.colour)?.name.toLowerCase()}`,
  ];
  if (d.motif !== 'none') parts.push(`${MOTIFS.find((m) => m.key === d.motif)?.name} motif`);
  if (d.base) parts.push(`base ${d.baseH}mm high${d.vases ? `, ${d.vases} vase${d.vases > 1 ? 's' : ''}` : ''}`);
  if (d.kerbs) parts.push(`full kerb set with ${CHIPS.find((c) => c.key === d.chips)?.name.toLowerCase()}`);
  return parts.join('; ');
}

// ---------- outlines ----------
// Each shape is the right-hand half, from the bottom right corner up to the top centre, as
// segments in mm (y up). The left half is the mirror image, so every shape is symmetrical.
function rightHalf(shape, W, H) {
  const w = W / 2;
  switch (shape) {
    case 'square': return { start: [w, 0], segs: [['L', [w, H]], ['L', [0, H]]] };
    case 'round': {
      const sh = Math.max(H - w, H * 0.45), ry = H - sh, k = 0.5523;
      return { start: [w, 0], segs: [['L', [w, sh]], ['C', [w, sh + ry * k], [w * k, H], [0, H]]] };
    }
    case 'ogee': {
      const sh = H * 0.8, d = H - sh;
      return { start: [w, 0], segs: [['L', [w, sh]], ['C', [w, sh + d * 0.55], [w * 0.62, sh + d * 0.3], [w * 0.4, sh + d * 0.6]], ['C', [w * 0.2, sh + d * 0.86], [w * 0.1, H], [0, H]]] };
    }
    case 'peak': {
      const sh = H * 0.8, d = H - sh;
      return { start: [w, 0], segs: [['L', [w, sh]], ['Q', [w, sh + d * 0.75], [0, H]]] };
    }
    case 'serpentine': {
      const sh = H * 0.86, d = H - sh;
      return { start: [w, 0], segs: [['L', [w, sh]], ['C', [w * 0.72, sh - d * 0.55], [w * 0.38, H], [0, H]]] };
    }
    case 'heart': {
      return { start: [w * 0.34, 0], segs: [
        ['C', [w * 0.8, H * 0.22], [w * 1.04, H * 0.52], [w * 0.98, H * 0.74]],
        ['C', [w * 0.92, H * 0.96], [w * 0.62, H * 1.02], [w * 0.4, H * 0.96]],
        ['C', [w * 0.2, H * 0.91], [w * 0.06, H * 0.84], [0, H * 0.76]],
      ] };
    }
    case 'book': {
      return { start: [w, 0], segs: [['L', [w, H * 0.86]], ['C', [w, H * 0.96], [w * 0.92, H], [w * 0.78, H]], ['C', [w * 0.42, H], [w * 0.14, H * 0.97], [0, H * 0.9]]] };
    }
  }
  return rightHalf('square', W, H);
}

/** Draw the outline onto anything with moveTo/lineTo/bezierCurveTo/quadraticCurveTo (canvas or THREE.Shape). */
export function tracePath(target, shape, W, H, map = (p) => p) {
  const { start, segs } = rightHalf(shape, W, H);
  const pts = [start]; segs.forEach((s) => pts.push(s[s.length - 1]));
  const P = (p) => map(p), M = ([x, y]) => [-x, y];
  target.moveTo(...P([-start[0], 0])); // bottom left (mirror of start, at y=0)
  target.lineTo(...P(start));
  segs.forEach((s) => {
    if (s[0] === 'L') target.lineTo(...P(s[1]));
    if (s[0] === 'Q') target.quadraticCurveTo(...P(s[1]), ...P(s[2]));
    if (s[0] === 'C') target.bezierCurveTo(...P(s[1]), ...P(s[2]), ...P(s[3]));
  });
  // left half: same segments reversed and mirrored
  for (let i = segs.length - 1; i >= 0; i--) {
    const s = segs[i], from = pts[i];
    if (s[0] === 'L') target.lineTo(...P(M(from)));
    if (s[0] === 'Q') target.quadraticCurveTo(...P(M(s[1])), ...P(M(from)));
    if (s[0] === 'C') target.bezierCurveTo(...P(M(s[2])), ...P(M(s[1])), ...P(M(from)));
  }
  if (target.closePath) target.closePath();
}

// Where lettering can go on each shape (fractions of the face), so text never runs into a curve.
function safeBox(shape, W, H) {
  const b = { square: [0.1, 0.08], round: [Math.min(0.45, (W / 2) / H * 0.5), 0.08], ogee: [0.24, 0.08], peak: [0.26, 0.08],
    serpentine: [0.14, 0.08], heart: [0.24, 0.26], book: [0.16, 0.1] }[shape] || [0.1, 0.08];
  const side = shape === 'heart' ? 0.2 : 0.09;
  return { x0: W * side, x1: W * (1 - side), top: H * b[0], bottom: H * (1 - b[1]) }; // y measured from the top
}

// ---------- stone surfaces ----------
const photoCache = new Map();
export function loadImage(src) {
  if (!photoCache.has(src)) photoCache.set(src, new Promise((res, rej) => {
    const img = new Image(); img.crossOrigin = 'anonymous';
    img.onload = () => res(img); img.onerror = rej; img.src = src;
  }));
  return photoCache.get(src);
}

/** A stone surface of wPx × hPx at `pxPerMm`, drawn in code or cut from the stone's photo. */
export async function stoneCanvas(stone, wPx, hPx, pxPerMm = 1) {
  const c = document.createElement('canvas'); c.width = Math.max(2, Math.round(wPx)); c.height = Math.max(2, Math.round(hPx));
  const g = c.getContext('2d');
  if (stone?.photo_url) {
    const img = await loadImage(stone.photo_url).catch(() => null);
    if (img) {
      // tile the photo at roughly 600mm per tile so the grain stays a realistic size
      const tile = 600 * pxPerMm, s = tile / Math.max(img.width, img.height);
      const tw = img.width * s, th = img.height * s;
      for (let y = 0; y < c.height; y += th) for (let x = 0; x < c.width; x += tw) g.drawImage(img, x, y, tw, th);
      return c;
    }
  }
  const st = stone || DEFAULT_STONES[0];
  g.fillStyle = st.colour || '#555'; g.fillRect(0, 0, c.width, c.height);
  const r = rng(hashStr(st.id || st.name));
  if (st.kind === 'marble') {
    g.globalAlpha = 0.1; g.fillStyle = '#fff';
    for (let i = 0; i < 30; i++) { g.beginPath(); g.arc(r() * c.width, r() * c.height, (40 + r() * 140) * pxPerMm, 0, 7); g.fill(); }
    g.strokeStyle = st.vein || '#888'; g.lineCap = 'round';
    for (let i = 0; i < 9; i++) {
      let x = r() * c.width, y = -20, a = 0.6 + r() * 0.5;
      g.globalAlpha = 0.18 + r() * 0.3; g.lineWidth = (0.6 + r() * 2.2) * pxPerMm;
      g.beginPath(); g.moveTo(x, y);
      while (y < c.height + 20) { x += (r() - 0.5) * 40 * pxPerMm + Math.cos(a) * 6; y += (8 + r() * 18) * pxPerMm; g.lineTo(x, y); }
      g.stroke();
    }
    g.globalAlpha = 1;
  } else {
    // about one fleck per 20mm² of stone, whatever the canvas resolution
    const n = Math.min(400000, Math.round((c.width * c.height) / (pxPerMm * pxPerMm) / 20 * (st.density || 1)));
    const fl = st.flecks || shades(st.colour || '#777');
    for (let i = 0; i < n; i++) {
      g.fillStyle = fl[(r() * fl.length) | 0]; g.globalAlpha = 0.35 + r() * 0.6;
      const s = (0.4 + r() * r() * 3.2) * pxPerMm;
      g.fillRect(r() * c.width, r() * c.height, s, s * (0.6 + r() * 0.8));
    }
    g.globalAlpha = 1;
  }
  return c;
}

function chipsCanvas(chip, size = 512) {
  const c = document.createElement('canvas'); c.width = c.height = size;
  const g = c.getContext('2d'), r = rng(hashStr(chip.key));
  g.fillStyle = chip.base; g.fillRect(0, 0, size, size);
  for (let i = 0; i < 2600; i++) {
    g.fillStyle = chip.flecks[(r() * chip.flecks.length) | 0]; g.globalAlpha = 0.7 + r() * 0.3;
    g.beginPath(); g.ellipse(r() * size, r() * size, 2 + r() * 5, 2 + r() * 4, r() * 3, 0, 7); g.fill();
  }
  g.globalAlpha = 1; return c;
}

// ---------- lettering ----------
function letterPaint(g, colour, x0, x1, stoneAvgDark) {
  if (colour === 'gold') { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, '#b8902c'); gr.addColorStop(0.45, '#f3dc7f'); gr.addColorStop(0.6, '#d6b04a'); gr.addColorStop(1, '#a8801f'); return gr; }
  if (colour === 'silver') { const gr = g.createLinearGradient(x0, 0, x1, 0); gr.addColorStop(0, '#a9adb1'); gr.addColorStop(0.5, '#f4f5f6'); gr.addColorStop(1, '#9ca0a4'); return gr; }
  if (colour === 'lead') return '#56585b';
  if (colour === 'white') return '#f5f4ef';
  if (colour === 'black') return '#121212';
  return stoneAvgDark ? 'rgba(255,255,255,0.28)' : 'rgba(0,0,0,0.38)'; // cut only
}

const MOTIF_PATHS = {
  cross: 'M44 2h12v26h24v12H56v58H44V40H20V28h24z',
  heart: 'M50 90C22 70 4 54 4 32 4 16 16 6 30 6c9 0 16 5 20 12 4-7 11-12 20-12 14 0 26 10 26 26 0 22-18 38-46 58z',
  star: 'M50 4 90 74H10zM50 96 10 26h80z',
  dove: 'M8 56c10-2 22 2 30 8 4-14 14-30 34-38-6 8-8 16-6 22 8-4 18-4 26 0-10 2-18 8-22 16 6 8 4 18-6 24-12 6-30 4-44-6-6 4-12 6-20 6 4-4 6-8 8-12-4-6-6-12 0-20z',
};
function drawMotif(g, key, cx, top, size, paint) {
  if (key === 'none') return 0;
  g.save(); g.translate(cx - size / 2, top); g.scale(size / 100, size / 100); g.fillStyle = paint; g.strokeStyle = paint;
  if (key === 'hearts') {
    const p = new Path2D(MOTIF_PATHS.heart);
    g.save(); g.translate(-14, 8); g.scale(0.78, 0.78); g.fill(p); g.restore();
    g.save(); g.translate(36, 8); g.scale(0.78, 0.78); g.lineWidth = 9; g.stroke(p); g.restore();
  } else if (key === 'celtic') {
    g.fill(new Path2D(MOTIF_PATHS.cross)); g.lineWidth = 7; g.beginPath(); g.arc(50, 34, 19, 0, 7); g.stroke();
  } else if (key === 'star') {
    g.lineWidth = 6; g.stroke(new Path2D('M50 6 88 72H12z')); g.stroke(new Path2D('M50 94 12 28h76z'));
  } else g.fill(new Path2D(MOTIF_PATHS[key]));
  g.restore();
  return size;
}

export const fontsReady = (d) => {
  const f = FONTS.find((x) => x.key === d.font) || FONTS[0];
  return document.fonts ? Promise.all([document.fonts.load(`60px "${f.family}"`), document.fonts.load(`italic 60px "${f.family}"`)]).catch(() => {}) : Promise.resolve();
};

/**
 * The polished face: stone, lettering and motif, cut to the outline (transparent outside).
 * Returns { canvas, plain, avg } — plain is the stone without lettering, for the back and sides.
 */
export async function faceCanvas(d, stones, maxPx = 2048) {
  const stone = stones.find((s) => s.id === d.stone) || stones[0];
  const ppm = Math.min(maxPx / d.w, maxPx / d.h);
  const W = Math.round(d.w * ppm), H = Math.round(d.h * ppm);
  const plain = await stoneCanvas(stone, W, H, ppm);
  const c = document.createElement('canvas'); c.width = W; c.height = H;
  const g = c.getContext('2d');
  g.save();
  g.beginPath(); tracePath(g, d.shape, d.w, d.h, ([x, y]) => [(x + d.w / 2) * ppm, (d.h - y) * ppm]); g.clip();
  g.drawImage(plain, 0, 0);
  // gentle polish highlight
  const sheen = g.createLinearGradient(0, 0, W, H); sheen.addColorStop(0, 'rgba(255,255,255,0.10)'); sheen.addColorStop(0.5, 'rgba(255,255,255,0)'); sheen.addColorStop(1, 'rgba(0,0,0,0.08)');
  g.fillStyle = sheen; g.fillRect(0, 0, W, H);

  // average brightness decides the "cut only" tone
  const t = document.createElement('canvas'); t.width = t.height = 1; t.getContext('2d').drawImage(plain, 0, 0, 1, 1);
  const [ar, ag, ab] = t.getContext('2d').getImageData(0, 0, 1, 1).data;
  const dark = (ar + ag + ab) / 3 < 120;

  // lettering block
  const font = FONTS.find((f) => f.key === d.font) || FONTS[0];
  const box = safeBox(d.shape, d.w, d.h);
  const bx0 = box.x0 * ppm, bx1 = box.x1 * ppm, by0 = box.top * ppm, by1 = box.bottom * ppm;
  const T = d.text || {};
  const up = (s) => (font.upper ? s.toUpperCase() : s);
  const lines = [];
  const add = (txt, rel, italic = false) => { if (txt && txt.trim()) lines.push({ txt: up(txt.trim()), rel, italic }); };
  add(T.top, 0.5, font.italicSmall);
  add(T.name, 1, false);
  add(T.dates, 0.58);
  (T.more || '').split('\n').forEach((l) => add(l, 0.58));
  add(T.epitaph, 0.5, font.italicSmall);
  const motifRel = d.motif !== 'none' ? 1.5 : 0;
  // fit: start large, shrink until every line fits the width and the block fits the height
  const gapK = 1.32;
  const totalRel = lines.reduce((s, l) => s + l.rel * gapK, 0) + motifRel * 1.1;
  let base = Math.min((by1 - by0) / Math.max(totalRel, 1), d.w * ppm * 0.075);
  const fontStr = (l, b) => `${l.italic ? 'italic ' : ''}${font.key === 'block' ? 600 : 500} ${l.rel * b}px "${font.family}", serif`;
  for (const l of lines) { g.font = fontStr(l, base); const w = g.measureText(l.txt).width; if (w > bx1 - bx0) base *= (bx1 - bx0) / w; }
  const blockH = lines.reduce((s, l) => s + l.rel * base * gapK, 0) + motifRel * base * 1.1;
  let y = by0 + Math.max(0, (by1 - by0 - blockH) * (d.shape === 'heart' ? 0.35 : 0.42));
  const paint = letterPaint(g, d.colour, bx0, bx1, dark);
  const cx = W / 2;
  // engraved look: soft shadow inside the cut
  g.shadowColor = d.colour === 'cut' ? 'rgba(0,0,0,0.35)' : 'rgba(0,0,0,0.55)'; g.shadowOffsetX = ppm * 0.6; g.shadowOffsetY = ppm * 0.8; g.shadowBlur = ppm * 0.8;
  if (motifRel) { y += drawMotif(g, d.motif, cx, y, motifRel * base, paint) + base * 0.15; }
  g.textAlign = 'center'; g.textBaseline = 'alphabetic'; g.fillStyle = paint;
  for (const l of lines) { y += l.rel * base * gapK; g.font = fontStr(l, base); g.fillText(l.txt, cx, y - l.rel * base * 0.32); }
  g.restore();
  return { canvas: c, plain, avg: `rgb(${ar},${ag},${ab})`, ppm };
}

// ---------- 3D ----------
/**
 * Build the memorial at true size. Origin: ground level, centre of the headstone's footprint.
 * The face looks towards +z. Returns { group, textures } (dispose the textures when done).
 */
export async function buildMemorial(THREE, d, stones, { maxTex = 2048 } = {}) {
  d = normalise(d);
  await fontsReady(d);
  const face = await faceCanvas(d, stones, maxTex);
  const m = (v) => v / 1000;
  const W = m(d.w), H = m(d.h), T = m(d.t);
  const group = new THREE.Group(); group.name = 'memorial';
  const textures = [];
  const tex = (canvas, repeat = false) => {
    const t = new THREE.CanvasTexture(canvas); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
    textures.push(t); return t;
  };
  const polished = (map) => new THREE.MeshStandardMaterial({ map, roughness: 0.22, metalness: 0.05 });
  const stoneTex = tex(face.plain, true);
  const stoneMat = polished(stoneTex);

  // headstone: body (sides + back) and the lettered face on the front
  const outline = new THREE.Shape();
  tracePath(outline, d.shape, W, H);
  const body = new THREE.ExtrudeGeometry(outline, { depth: T, bevelEnabled: false, curveSegments: 24 });
  // planar UVs in metres across the stone texture (which covers the face size), so grain looks right
  const uvb = body.attributes.uv, pb = body.attributes.position, nb = body.attributes.normal;
  for (let i = 0; i < uvb.count; i++) {
    const x = pb.getX(i), y = pb.getY(i), z = pb.getZ(i), nx = Math.abs(nb.getX(i));
    uvb.setXY(i, (nx > 0.5 ? z : x + W / 2) / W, y / H);
  }
  body.translate(0, 0, -T / 2);
  const headstone = new THREE.Group(); headstone.name = 'headstone';
  headstone.add(new THREE.Mesh(body, stoneMat));
  const faceGeo = new THREE.ShapeGeometry(outline, 24);
  const uv = faceGeo.attributes.uv, pos = faceGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) uv.setXY(i, (pos.getX(i) + W / 2) / W, pos.getY(i) / H);
  const faceMesh = new THREE.Mesh(faceGeo, new THREE.MeshStandardMaterial({ map: tex(face.canvas), roughness: 0.2, metalness: 0.05, transparent: false }));
  faceMesh.position.z = T / 2 + 0.0008; faceMesh.name = 'face';
  headstone.add(faceMesh);

  const box = (w, h, dz, mat) => {
    const g = new THREE.BoxGeometry(w, h, dz);
    // scale box UVs to metres so the stone grain matches the headstone
    const u = g.attributes.uv, n = g.attributes.normal;
    for (let i = 0; i < u.count; i++) {
      const ax = Math.abs(n.getX(i)), ay = Math.abs(n.getY(i));
      const [sx, sy] = ax > 0.5 ? [dz, h] : ay > 0.5 ? [w, dz] : [w, h];
      u.setXY(i, u.getX(i) * sx / W, u.getY(i) * sy / H);
    }
    return new THREE.Mesh(g, mat);
  };

  let headY = 0;
  if (d.base) {
    const bh = m(d.baseH), bw = W + 0.2, bd = T + 0.26;
    const base = box(bw, bh, bd, stoneMat); base.position.set(0, bh / 2, 0.07); base.name = 'base';
    group.add(base); headY = bh;
    if (d.vases) {
      const vw = 0.13, vh = 0.17;
      const spots = d.vases === 2 ? [-(bw / 2 - vw / 2 - 0.02), bw / 2 - vw / 2 - 0.02] : [0];
      for (const x of spots) {
        if (d.vases === 1 && x === 0) {
          const v = box(vw * 1.6, vh * 0.75, vw, stoneMat); v.position.set(0, bh + vh * 0.375, 0.07 + bd / 2 - vw / 2 - 0.01); v.name = 'vase'; group.add(v);
        } else {
          const v = box(vw, vh, vw, stoneMat); v.position.set(x, bh + vh / 2, 0.07 + bd / 2 - vw / 2 - 0.01); v.name = 'vase'; group.add(v);
        }
      }
    }
  }
  headstone.position.y = headY;
  group.add(headstone);

  if (d.kerbs) {
    // single lair surround, about 6'6" × 2'6", starting just in front of the base
    const L = 1.98, Wk = Math.max(0.76, W + 0.16), kh = 0.15, kw = 0.1;
    const z0 = d.base ? 0.07 + (T + 0.26) / 2 : T / 2 + 0.02, zc = z0 + L / 2;
    const sideL = box(kw, kh, L, stoneMat); sideL.position.set(-(Wk / 2 - kw / 2), kh / 2, zc);
    const sideR = sideL.clone(); sideR.position.x = Wk / 2 - kw / 2;
    const foot = box(Wk, kh, kw, stoneMat); foot.position.set(0, kh / 2, z0 + L - kw / 2);
    const head = box(Wk, kh, kw, stoneMat); head.position.set(0, kh / 2, z0 + kw / 2);
    [sideL, sideR, foot, head].forEach((k) => { k.name = 'kerb'; group.add(k); });
    const chip = CHIPS.find((c) => c.key === d.chips) || CHIPS[0];
    const ct = tex(chipsCanvas(chip), true);
    const cw = Wk - 2 * kw, cl = L - 2 * kw;
    const chipsGeo = new THREE.PlaneGeometry(cw, cl);
    const cu = chipsGeo.attributes.uv; for (let i = 0; i < cu.count; i++) cu.setXY(i, cu.getX(i) * cw / 0.35, cu.getY(i) * cl / 0.35);
    const chips = new THREE.Mesh(chipsGeo, new THREE.MeshStandardMaterial({ map: ct, roughness: 0.9 }));
    chips.rotation.x = -Math.PI / 2; chips.position.set(0, kh * 0.7, zc); chips.name = 'chippings';
    group.add(chips);
  }
  return { group, textures, face };
}

/** Export the memorial as GLB (viewer + Android) and USDZ (iPhone Quick Look). */
export async function exportForAR(THREE, GLTFExporter, USDZExporter, d, stones) {
  const { group, textures } = await buildMemorial(THREE, d, stones, { maxTex: 2048 });
  const scene = new THREE.Scene(); scene.add(group);
  const glb = await new GLTFExporter().parseAsync(scene, { binary: true });
  const usdz = await new USDZExporter().parseAsync(scene, { quickLookCompatible: true, maxTextureSize: 2048, ar: { anchoring: { type: 'plane' }, planeAnchoring: { alignment: 'horizontal' } } });
  textures.forEach((t) => t.dispose());
  return {
    glbUrl: URL.createObjectURL(new Blob([glb], { type: 'model/gltf-binary' })),
    usdzUrl: URL.createObjectURL(new Blob([usdz], { type: 'model/vnd.usdz+zip' })),
  };
}

/** Small SVG silhouette of a shape, for the shape picker. */
export function shapeSVG(shape, fill = 'currentColor') {
  const W = 100, H = 120, p = [];
  const ctx = { moveTo: (x, y) => p.push(`M${x.toFixed(1)} ${y.toFixed(1)}`), lineTo: (x, y) => p.push(`L${x.toFixed(1)} ${y.toFixed(1)}`),
    quadraticCurveTo: (a, b, x, y) => p.push(`Q${a.toFixed(1)} ${b.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`),
    bezierCurveTo: (a, b, c2, e, x, y) => p.push(`C${a.toFixed(1)} ${b.toFixed(1)} ${c2.toFixed(1)} ${e.toFixed(1)} ${x.toFixed(1)} ${y.toFixed(1)}`),
    closePath: () => p.push('Z') };
  tracePath(ctx, shape, W, H, ([x, y]) => [x + W / 2 + 10, H - y + 4]);
  return `<svg viewBox="0 0 120 128" aria-hidden="true"><path d="${p.join('')}" fill="${fill}"/></svg>`;
}
