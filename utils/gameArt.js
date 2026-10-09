// utils/gameArt.js — drawn pictures for the PvP games (direct: "good picture art… stimulates casino theme, no AI slop").
// Everything is drawn here with @napi-rs/canvas: felt tables, lacquered boards, real-looking discs, a coin with a milled
// rim, an ocean with ships and fire. Each renderer returns a PNG Buffer; games attach it as `attachment://<name>.png`.
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const FONTS = path.join(__dirname, '..', 'assets', 'fonts');
try {
  GlobalFonts.registerFromPath(path.join(FONTS, 'Montserrat-Bold.ttf'), 'Montserrat');
  GlobalFonts.registerFromPath(path.join(FONTS, 'Cinzel-Black.ttf'), 'Cinzel');
  GlobalFonts.registerFromPath(path.join(FONTS, 'Inter-Regular.ttf'), 'Inter');
} catch { /* falls back to the default font */ }

const GOLD = ['#FFF1B8', '#E9C46A', '#A67C1F'];

// ── shared pieces ─────────────────────────────────────────────────────────────
function rr(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** A casino table: felt in `col` (centre lit, edges dark), a faint diamond weave, a vignette. */
function felt(ctx, w, h, col = ['#1F7A4D', '#0C3B24', '#06200F']) {
  const g = ctx.createRadialGradient(w / 2, h * 0.45, 20, w / 2, h / 2, Math.max(w, h) * 0.75);
  g.addColorStop(0, col[0]); g.addColorStop(0.6, col[1]); g.addColorStop(1, col[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);
  ctx.save();
  ctx.globalAlpha = 0.05;
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth = 1;
  for (let k = -h; k < w; k += 14) {
    ctx.beginPath(); ctx.moveTo(k, 0); ctx.lineTo(k + h, h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(k + h, 0); ctx.lineTo(k, h); ctx.stroke();
  }
  ctx.restore();
  const v = ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.max(w, h) * 0.72);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.55)');
  ctx.fillStyle = v;
  ctx.fillRect(0, 0, w, h);
}

/** A thin gold rail around the picture. */
function rail(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, GOLD[0]); g.addColorStop(0.5, GOLD[1]); g.addColorStop(1, GOLD[2]);
  ctx.strokeStyle = g; ctx.lineWidth = 4;
  rr(ctx, 6, 6, w - 12, h - 12, 18); ctx.stroke();
  ctx.strokeStyle = 'rgba(0,0,0,0.6)'; ctx.lineWidth = 2;
  rr(ctx, 11, 11, w - 22, h - 22, 14); ctx.stroke();
}

function text(ctx, s, x, y, { size = 22, font = 'Montserrat', color = '#fff', align = 'center', shadow = true, max } = {}) {
  ctx.font = `${size}px ${font}`;
  ctx.textAlign = align; ctx.textBaseline = 'middle';
  let str = String(s);
  if (max) while (str.length > 1 && ctx.measureText(str).width > max) str = str.slice(0, -2) + '…';
  if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.65)'; ctx.fillText(str, x + 2, y + 2); }
  ctx.fillStyle = color; ctx.fillText(str, x, y);
}

/** A name plate: dark glass pill with a coloured chip; `lit` = it's their move (gold edge + glow). */
function plate(ctx, x, y, w, name, chip, lit) {
  ctx.save();
  if (lit) { ctx.shadowColor = GOLD[1]; ctx.shadowBlur = 18; }
  rr(ctx, x, y, w, 44, 22);
  ctx.fillStyle = 'rgba(8,10,16,0.82)'; ctx.fill();
  ctx.restore();
  ctx.strokeStyle = lit ? GOLD[1] : 'rgba(255,255,255,0.18)'; ctx.lineWidth = lit ? 2.5 : 1.5;
  rr(ctx, x, y, w, 44, 22); ctx.stroke();
  if (chip) chip(x + 24, y + 22);
  text(ctx, name, x + 48, y + 23, { size: 19, align: 'left', max: w - 64, color: lit ? '#FFF6D5' : '#E6E6EA' });
}

// ── Connect Four ─────────────────────────────────────────────────────────────
const C4 = { red: ['#FF6B81', '#E11D48', '#7F0E2A'], yel: ['#FFF3A6', '#F5C518', '#946200'] };

function disc(ctx, cx, cy, r, which) {
  const c = which === 1 ? C4.red : C4.yel;
  const g = ctx.createRadialGradient(cx - r * 0.35, cy - r * 0.4, r * 0.1, cx, cy, r);
  g.addColorStop(0, c[0]); g.addColorStop(0.55, c[1]); g.addColorStop(1, c[2]);
  ctx.fillStyle = g;
  ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
  ctx.strokeStyle = 'rgba(0,0,0,0.25)'; ctx.lineWidth = 3;           // the moulded inner ring
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.68, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(255,255,255,0.18)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, r * 0.68 - 2, Math.PI * 1.1, Math.PI * 1.7); ctx.stroke();
  ctx.fillStyle = 'rgba(255,255,255,0.35)';                           // gloss
  ctx.beginPath(); ctx.ellipse(cx - r * 0.3, cy - r * 0.42, r * 0.38, r * 0.18, -0.5, 0, Math.PI * 2); ctx.fill();
}

/** grid[y][x] 0/1/2 (row 0 = top) · last [x,y] · line = winning cells [[x,y]…] · names [a,b] · turn 0|1|null */
function connect4({ grid, last = null, line = null, names = ['', ''], turn = null }) {
  const W = 7, H = 6, cell = 84, pad = 26;
  const bw = W * cell + pad * 2, bh = H * cell + pad * 2;
  const w = bw + 80, h = bh + 170;
  const cv = createCanvas(w, h);
  const ctx = cv.getContext('2d');
  felt(ctx, w, h, ['#20325E', '#0E1733', '#060A18']);
  rail(ctx, w, h);
  const bx = 40, by = 74;
  for (let x = 0; x < W; x++) {                    // column numbers
    const full = grid[0][x] !== 0;
    text(ctx, String(x + 1), bx + pad + x * cell + cell / 2, 48, { size: 24, color: full ? 'rgba(255,255,255,0.25)' : GOLD[1] });
  }
  ctx.save();                                     // the lacquered board
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 10;
  const bg = ctx.createLinearGradient(0, by, 0, by + bh);
  bg.addColorStop(0, '#3B6CF0'); bg.addColorStop(0.5, '#1D4ED8'); bg.addColorStop(1, '#14327F');
  rr(ctx, bx, by, bw, bh, 26); ctx.fillStyle = bg; ctx.fill();
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.35)'; ctx.lineWidth = 2;
  rr(ctx, bx + 3, by + 3, bw - 6, bh - 6, 23); ctx.stroke();
  const r = cell * 0.39;
  const win = new Set((line || []).map(([x, y]) => `${x},${y}`));
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const cx = bx + pad + x * cell + cell / 2, cy = by + pad + y * cell + cell / 2;
    const hole = ctx.createRadialGradient(cx, cy - r * 0.3, r * 0.2, cx, cy, r);   // the recess
    hole.addColorStop(0, '#0B1430'); hole.addColorStop(1, '#030612');
    ctx.fillStyle = hole; ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(cx, cy, r + 1, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeStyle = 'rgba(255,255,255,0.22)'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(cx, cy, r + 3, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    if (grid[y][x]) {
      if (win.has(`${x},${y}`)) { ctx.save(); ctx.shadowColor = '#FFE58A'; ctx.shadowBlur = 26; disc(ctx, cx, cy, r - 3, grid[y][x]); ctx.restore(); }
      disc(ctx, cx, cy, r - 3, grid[y][x]);
      if (last && last[0] === x && last[1] === y && !win.size) {
        ctx.strokeStyle = 'rgba(255,255,255,0.85)'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(cx, cy, r - 1, 0, Math.PI * 2); ctx.stroke();
      }
    }
  }
  if (line && line.length) {                       // a gold stroke through the four
    const p = (k) => [bx + pad + line[k][0] * cell + cell / 2, by + pad + line[k][1] * cell + cell / 2];
    const [x0, y0] = p(0), [x1, y1] = p(line.length - 1);
    ctx.save(); ctx.shadowColor = '#FFE58A'; ctx.shadowBlur = 16;
    ctx.strokeStyle = 'rgba(255,241,184,0.95)'; ctx.lineWidth = 8; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke(); ctx.restore();
  }
  const pw = (w - 120) / 2, py = by + bh + 30;
  const chip = (which) => (cx, cy) => disc(ctx, cx, cy, 13, which);
  plate(ctx, 40, py, pw, names[0], chip(1), turn === 0);
  plate(ctx, w - 40 - pw, py, pw, names[1], chip(2), turn === 1);
  text(ctx, 'VS', w / 2, py + 22, { size: 20, font: 'Cinzel', color: GOLD[1] });
  return cv.toBuffer('image/png');
}

// ── Battleship ───────────────────────────────────────────────────────────────
const SEA = { cell: 58, lab: 30 };

function ocean(ctx, x, y, n, seed = 1) {
  const s = n * SEA.cell;
  const g = ctx.createLinearGradient(x, y, x, y + s);
  g.addColorStop(0, '#0F5E8C'); g.addColorStop(1, '#063255');
  ctx.save();
  rr(ctx, x, y, s, s, 10); ctx.clip();
  ctx.fillStyle = g; ctx.fillRect(x, y, s, s);
  ctx.strokeStyle = 'rgba(180,230,255,0.10)'; ctx.lineWidth = 1.5;      // little swells
  for (let k = 0; k < n * 4; k++) {
    const wy = y + ((k * 37 + seed * 13) % s), wx = x + ((k * 53 + seed * 29) % s);
    ctx.beginPath();
    ctx.moveTo(wx, wy);
    ctx.quadraticCurveTo(wx + 8, wy - 4, wx + 16, wy);
    ctx.quadraticCurveTo(wx + 24, wy + 4, wx + 32, wy);
    ctx.stroke();
  }
  ctx.restore();
  ctx.strokeStyle = 'rgba(200,235,255,0.18)'; ctx.lineWidth = 1;
  for (let k = 1; k < n; k++) {
    ctx.beginPath(); ctx.moveTo(x + k * SEA.cell, y); ctx.lineTo(x + k * SEA.cell, y + s); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x, y + k * SEA.cell); ctx.lineTo(x + s, y + k * SEA.cell); ctx.stroke();
  }
  ctx.strokeStyle = 'rgba(233,196,106,0.75)'; ctx.lineWidth = 2;
  rr(ctx, x, y, s, s, 10); ctx.stroke();
  const L = 'ABCDEFGH';
  for (let k = 0; k < n; k++) {
    text(ctx, L[k], x + k * SEA.cell + SEA.cell / 2, y - 16, { size: 17, color: '#CFE8F7' });
    text(ctx, String(k + 1), x - 16, y + k * SEA.cell + SEA.cell / 2, { size: 17, color: '#CFE8F7' });
  }
}

/** A hull over `cells` (sorted [x,y] list), steel grey; `ghost` = a placement preview (green ok / red blocked). */
function hull(ctx, ox, oy, cells, { ghost = null, sunk = false } = {}) {
  const xs = cells.map((c) => c[0]), ys = cells.map((c) => c[1]);
  const horiz = new Set(ys).size === 1;
  const x0 = ox + Math.min(...xs) * SEA.cell + 7, y0 = oy + Math.min(...ys) * SEA.cell + 7;
  const w = (Math.max(...xs) - Math.min(...xs) + 1) * SEA.cell - 14, h = (Math.max(...ys) - Math.min(...ys) + 1) * SEA.cell - 14;
  ctx.save();
  if (ghost) ctx.globalAlpha = 0.6;
  const g = horiz ? ctx.createLinearGradient(0, y0, 0, y0 + h) : ctx.createLinearGradient(x0, 0, x0 + w, 0);
  const cols = ghost === 'ok' ? ['#8EF0B0', '#2E9B5C', '#14532D'] : ghost === 'bad' ? ['#FF9A9A', '#C53030', '#5C1010']
    : sunk ? ['#4B4B52', '#2A2A30', '#141418'] : ['#C9D1DC', '#7C8796', '#3B4452'];
  g.addColorStop(0, cols[0]); g.addColorStop(0.5, cols[1]); g.addColorStop(1, cols[2]);
  ctx.shadowColor = 'rgba(0,0,0,0.55)'; ctx.shadowBlur = 10; ctx.shadowOffsetY = 4;
  rr(ctx, x0, y0, w, h, Math.min(w, h) / 2); ctx.fillStyle = g; ctx.fill();
  ctx.restore();
  if (ghost) return;
  ctx.strokeStyle = 'rgba(0,0,0,0.45)'; ctx.lineWidth = 2;
  rr(ctx, x0, y0, w, h, Math.min(w, h) / 2); ctx.stroke();
  const n = cells.length;                          // deck: a centre line and a turret per section
  ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 1.5;
  ctx.beginPath();
  if (horiz) { ctx.moveTo(x0 + 14, y0 + h / 2); ctx.lineTo(x0 + w - 14, y0 + h / 2); } else { ctx.moveTo(x0 + w / 2, y0 + 14); ctx.lineTo(x0 + w / 2, y0 + h - 14); }
  ctx.stroke();
  for (let k = 0; k < n; k++) {
    const cx = horiz ? x0 + (k + 0.5) * (w / n) : x0 + w / 2, cy = horiz ? y0 + h / 2 : y0 + (k + 0.5) * (h / n);
    ctx.fillStyle = sunk ? '#1C1C21' : '#566170';
    ctx.beginPath(); ctx.arc(cx, cy, 8, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = sunk ? '#000' : '#2A313B'; ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx, cy);
    if (horiz) ctx.lineTo(cx + 13, cy); else ctx.lineTo(cx, cy - 13);
    ctx.stroke();
  }
}

function splash(ctx, cx, cy) {
  ctx.strokeStyle = 'rgba(235,248,255,0.9)'; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.arc(cx, cy, 11, 0, Math.PI * 2); ctx.stroke();
  ctx.strokeStyle = 'rgba(235,248,255,0.45)'; ctx.lineWidth = 2;
  ctx.beginPath(); ctx.arc(cx, cy, 18, 0, Math.PI * 2); ctx.stroke();
  ctx.fillStyle = 'rgba(235,248,255,0.85)';
  for (let k = 0; k < 6; k++) { const a = k * 1.05; ctx.beginPath(); ctx.arc(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24, 2, 0, Math.PI * 2); ctx.fill(); }
}

function fire(ctx, cx, cy) {
  ctx.save();
  const s = ctx.createRadialGradient(cx, cy - 6, 2, cx, cy - 6, 26);          // smoke
  s.addColorStop(0, 'rgba(40,40,44,0.7)'); s.addColorStop(1, 'rgba(40,40,44,0)');
  ctx.fillStyle = s; ctx.beginPath(); ctx.arc(cx, cy - 8, 26, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = '#FF7A1A'; ctx.shadowBlur = 22;
  const f = ctx.createRadialGradient(cx, cy + 4, 2, cx, cy, 20);
  f.addColorStop(0, '#FFF7C2'); f.addColorStop(0.35, '#FFB020'); f.addColorStop(0.75, '#E8410F'); f.addColorStop(1, 'rgba(160,20,0,0)');
  ctx.fillStyle = f;
  ctx.beginPath();                                   // flame tongues
  ctx.moveTo(cx - 15, cy + 12);
  ctx.quadraticCurveTo(cx - 18, cy - 4, cx - 7, cy - 12);
  ctx.quadraticCurveTo(cx - 6, cy - 2, cx - 2, cy - 22);
  ctx.quadraticCurveTo(cx + 6, cy - 8, cx + 8, cy - 16);
  ctx.quadraticCurveTo(cx + 18, cy - 2, cx + 15, cy + 12);
  ctx.closePath(); ctx.fill();
  ctx.restore();
}

/** One sea. shots: Map "x,y" -> 'hit'|'miss'. ships: [[ [x,y]… ] …] with sunk flags; show = draw hulls (own fleet). */
function sea(ctx, ox, oy, n, { shots, ships = [], show = false, sunk = new Set(), ghost = null, aim = null }) {
  ocean(ctx, ox, oy, n, ox);
  ships.forEach((cells, k) => { if (show || sunk.has(k)) hull(ctx, ox, oy, cells, { sunk: sunk.has(k) }); });
  if (ghost) hull(ctx, ox, oy, ghost.cells, { ghost: ghost.ok ? 'ok' : 'bad' });
  for (const [key, res] of shots) {
    const [x, y] = key.split(',').map(Number);
    const cx = ox + x * SEA.cell + SEA.cell / 2, cy = oy + y * SEA.cell + SEA.cell / 2;
    if (res === 'hit') fire(ctx, cx, cy); else splash(ctx, cx, cy);
  }
  if (aim) {
    const [x, y] = aim; const cx = ox + x * SEA.cell + SEA.cell / 2, cy = oy + y * SEA.cell + SEA.cell / 2;
    ctx.strokeStyle = '#FFE58A'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.arc(cx, cy, 20, 0, Math.PI * 2); ctx.stroke();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { ctx.beginPath(); ctx.moveTo(cx + dx * 12, cy + dy * 12); ctx.lineTo(cx + dx * 28, cy + dy * 28); ctx.stroke(); }
  }
}

/** The public table: both seas side by side (each shows the shots fired INTO it; ships only once sunk). */
function battleship({ n, seas, names, turn = null, aim = null }) {
  const s = n * SEA.cell;
  const w = s * 2 + 170, h = s + 170;
  const cv = createCanvas(w, h);
  const ctx = cv.getContext('2d');
  felt(ctx, w, h, ['#123C5A', '#081F33', '#030B14']);
  rail(ctx, w, h);
  const ox = [60, 60 + s + 60];
  seas.forEach((sd, k) => {
    text(ctx, `${names[k]}'S WATERS`, ox[k] + s / 2, 38, { size: 18, font: 'Cinzel', color: GOLD[0], max: s });
    sea(ctx, ox[k], 72, n, { ...sd, aim: aim && aim[0] === k ? aim[1] : null });
  });
  const py = 72 + s + 30;
  const left = seas.map((sd) => sd.ships.length - sd.sunk.size);
  plate(ctx, ox[0], py, s, `${names[0]} · ${left[0]} afloat`, null, turn === 0);
  plate(ctx, ox[1], py, s, `${names[1]} · ${left[1]} afloat`, null, turn === 1);
  return cv.toBuffer('image/png');
}

/** One player's own sea (placement / "my fleet"): every hull shown, enemy shots on it, an optional ghost hull. */
function fleetView({ n, ships, shots = new Map(), sunk = new Set(), ghost = null, title = 'YOUR FLEET' }) {
  const s = n * SEA.cell;
  const w = s + 110, h = s + 120;
  const cv = createCanvas(w, h);
  const ctx = cv.getContext('2d');
  felt(ctx, w, h, ['#123C5A', '#081F33', '#030B14']);
  rail(ctx, w, h);
  text(ctx, title, w / 2, 34, { size: 18, font: 'Cinzel', color: GOLD[0] });
  sea(ctx, 60, 76, n, { shots, ships, show: true, sunk, ghost });
  return cv.toBuffer('image/png');
}

// ── Coin flip ────────────────────────────────────────────────────────────────
function crown(ctx, cx, cy, s, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  ctx.moveTo(cx - s, cy + s * 0.55);
  ctx.lineTo(cx - s, cy - s * 0.35); ctx.lineTo(cx - s * 0.5, cy + s * 0.05); ctx.lineTo(cx, cy - s * 0.6);
  ctx.lineTo(cx + s * 0.5, cy + s * 0.05); ctx.lineTo(cx + s, cy - s * 0.35); ctx.lineTo(cx + s, cy + s * 0.55);
  ctx.closePath(); ctx.fill();
  for (const dx of [-1, 0, 1]) { ctx.beginPath(); ctx.arc(cx + dx * s, cy + (dx ? -s * 0.42 : -s * 0.68), s * 0.12, 0, Math.PI * 2); ctx.fill(); }
  ctx.fillRect(cx - s, cy + s * 0.62, s * 2, s * 0.18);
}

function star(ctx, cx, cy, r, col) {
  ctx.fillStyle = col;
  ctx.beginPath();
  for (let k = 0; k < 10; k++) {
    const a = -Math.PI / 2 + k * Math.PI / 5, rad = k % 2 ? r * 0.45 : r;
    ctx.lineTo(cx + Math.cos(a) * rad, cy + Math.sin(a) * rad);
  }
  ctx.closePath(); ctx.fill();
}

/** face: 'Heads' | 'Tails' | null (spinning, seen edge-on). */
function coinFace(ctx, cx, cy, r, face, squash = 1) {
  ctx.save();
  ctx.translate(cx, cy); ctx.scale(squash, 1);
  ctx.shadowColor = 'rgba(0,0,0,0.6)'; ctx.shadowBlur = 24; ctx.shadowOffsetY = 12;
  const g = ctx.createRadialGradient(-r * 0.35, -r * 0.4, r * 0.1, 0, 0, r);
  g.addColorStop(0, '#FFF4C4'); g.addColorStop(0.45, '#E9C46A'); g.addColorStop(1, '#8A6414');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(90,60,10,0.55)'; ctx.lineWidth = 2;        // milled rim
  for (let k = 0; k < 90; k++) { const a = k * Math.PI * 2 / 90; ctx.beginPath(); ctx.moveTo(Math.cos(a) * r * 0.9, Math.sin(a) * r * 0.9); ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r); ctx.stroke(); }
  ctx.strokeStyle = 'rgba(255,248,214,0.7)'; ctx.lineWidth = 3;
  ctx.beginPath(); ctx.arc(0, 0, r * 0.78, 0, Math.PI * 2); ctx.stroke();
  if (face) {
    const emboss = (fn) => { fn('rgba(80,52,8,0.55)', 2); fn('#FFF1B8', 0); };
    if (face === 'Heads') emboss((col, o) => crown(ctx, o, o - r * 0.05, r * 0.4, col));
    else emboss((col, o) => star(ctx, o, o - r * 0.05, r * 0.42, col));
    text(ctx, face.toUpperCase(), 0, r * 0.55, { size: Math.round(r * 0.16), font: 'Cinzel', color: '#5A3C08', shadow: false });
  }
  ctx.restore();
}

/** The flip table. face null = mid-air. calls = [aCall, bCall]; winner index or null. */
function coinflip({ names, calls, face = null, winner = null }) {
  const w = 760, h = 420;
  const cv = createCanvas(w, h);
  const ctx = cv.getContext('2d');
  felt(ctx, w, h, ['#5B2A86', '#2B0F45', '#12051F']);
  rail(ctx, w, h);
  if (face) coinFace(ctx, w / 2, 170, 112, face);
  else {
    coinFace(ctx, w / 2, 150, 112, null, 0.22);      // edge-on, motion streaks
    ctx.strokeStyle = 'rgba(255,241,184,0.35)'; ctx.lineWidth = 3;
    for (const dx of [-60, -40, 40, 60]) { ctx.beginPath(); ctx.moveTo(w / 2 + dx, 70); ctx.lineTo(w / 2 + dx * 1.2, 230); ctx.stroke(); }
  }
  const pw = 300, py = 330;
  const chip = (k) => (cx, cy) => coinFace(ctx, cx, cy, 13, calls[k]);
  plate(ctx, 40, py, pw, `${names[0]} · ${calls[0] || '…'}`, chip(0), winner === 0);
  plate(ctx, w - 40 - pw, py, pw, `${names[1]} · ${calls[1] || '…'}`, chip(1), winner === 1);
  return cv.toBuffer('image/png');
}

module.exports = { connect4, battleship, fleetView, coinflip };
