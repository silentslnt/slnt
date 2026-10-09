// utils/pixelUI.js — the pixel-RPG look every Shiro picture is drawn in (direct: "full art overhaul… references in the
// folder": dark navy panels with stepped grey-blue bevels, brown item cells, gold-striped "selected" frames, teal quest
// frames, tiled banners, chunky pixel type, green count bars). Everything snaps to a P-pixel grid so it reads as pixel
// art at Discord's size. Sprites are hand-drawn as character grids (SPRITES) and painted cell by cell.
const path = require('path');
const { createCanvas, GlobalFonts } = require('@napi-rs/canvas');

const FONTS = path.join(__dirname, '..', 'assets', 'fonts');
try {
  GlobalFonts.registerFromPath(path.join(FONTS, 'Silkscreen-Bold.ttf'), 'Silkscreen');
  GlobalFonts.registerFromPath(path.join(FONTS, 'PixelifySans-Bold.ttf'), 'Pixelify');
  GlobalFonts.registerFromPath(path.join(FONTS, 'Montserrat-Bold.ttf'), 'Montserrat');
} catch { /* default font */ }

const P = 4;   // one "pixel" of the UI
const snap = (v) => Math.round(v / P) * P;

const C = {
  bg: '#0E121C', panel: '#151A27', panel2: '#1B2131', ink: '#06080D',
  rim: '#4E5675', rimHi: '#9AA2C6', rimLo: '#2B3046',
  cell: '#53261C', cellHi: '#7A3A2A', cellLo: '#2E130D', cellSel: '#8A4632',
  gold: ['#FFE07A', '#F2A31B', '#B8650E'], teal: ['#9FF3EA', '#4FC2BA', '#21706B'],
  green: ['#7CF08A', '#3FB34F', '#1E6B2A'], red: ['#FF8A8A', '#E0352B', '#7A1410'], blue: ['#8FD3FF', '#2E86DE', '#174A82'],
  text: '#F2F3F7', dim: '#9BA1B5', mute: '#636A80', yellow: '#FFD24A', orange: '#FFA23A', pink: '#FF7AB6', purple: '#B48CFF',
};

function canvas(w, h) {
  const cv = createCanvas(snap(w), snap(h));
  const ctx = cv.getContext('2d');
  ctx.imageSmoothingEnabled = false;
  return { cv, ctx, w: cv.width, h: cv.height };
}

function rect(ctx, x, y, w, h, col) { ctx.fillStyle = col; ctx.fillRect(snap(x), snap(y), snap(w), snap(h)); }

/** Stepped (cut-corner) block — the basic pixel panel shape. */
function block(ctx, x, y, w, h, col, cut = 1) {
  x = snap(x); y = snap(y); w = snap(w); h = snap(h);
  const c = cut * P;
  ctx.fillStyle = col;
  ctx.fillRect(x + c, y, w - 2 * c, h);
  ctx.fillRect(x, y + c, w, h - 2 * c);
}

/** The window frame from the references: dark outline, grey-blue bevel with a dashed light stripe, navy inside. */
function panel(ctx, x, y, w, h, { fill = C.panel, rim = C.rim, hi = C.rimHi, dash = true } = {}) {
  block(ctx, x - 2 * P, y - 2 * P, w + 4 * P, h + 4 * P, C.ink, 2);
  block(ctx, x - P, y - P, w + 2 * P, h + 2 * P, rim, 1);
  ctx.fillStyle = hi;
  const X = snap(x), Y = snap(y), W = snap(w), H = snap(h);
  if (dash) {
    for (let k = X + 2 * P; k < X + W - 2 * P; k += 4 * P) { ctx.fillRect(k, Y - P, 2 * P, P); ctx.fillRect(k, Y + H, 2 * P, P); }
    for (let k = Y + 2 * P; k < Y + H - 2 * P; k += 4 * P) { ctx.fillRect(X - P, k, P, 2 * P); ctx.fillRect(X + W, k, P, 2 * P); }
  }
  rect(ctx, x, y, w, h, fill);
  rect(ctx, x, y, w, P, 'rgba(255,255,255,0.05)');
}

/** A brown item cell (Encyclopedia grid). sel = gold striped frame. */
function cell(ctx, x, y, w, h, { sel = false, fill = null } = {}) {
  if (sel) goldFrame(ctx, x, y, w, h);
  else block(ctx, x - P, y - P, w + 2 * P, h + 2 * P, C.cellLo, 1);
  rect(ctx, x, y, w, h, fill || (sel ? C.cellSel : C.cell));
  rect(ctx, x, y, w, P, C.cellHi);
  rect(ctx, x, y, P, h, C.cellHi);
  rect(ctx, x, y + h - P, w, P, C.cellLo);
}

/** Gold striped frame (the "selected" look): alternating light/dark gold dashes around the box. */
function goldFrame(ctx, x, y, w, h, cols = C.gold) {
  block(ctx, x - 2 * P, y - 2 * P, w + 4 * P, h + 4 * P, cols[2], 1);
  ctx.fillStyle = cols[0];
  const X = snap(x), Y = snap(y), W = snap(w), H = snap(h);
  for (let k = X - P; k < X + W + P; k += 3 * P) { ctx.fillRect(k, Y - 2 * P, 2 * P, P); ctx.fillRect(k, Y + H + P, 2 * P, P); }
  for (let k = Y - P; k < Y + H + P; k += 3 * P) { ctx.fillRect(X - 2 * P, k, P, 2 * P); ctx.fillRect(X + W + P, k, P, 2 * P); }
  rect(ctx, x - P, y - P, w + 2 * P, h + 2 * P, cols[1]);
}

/** Teal frame with corner notches (the Quests window). */
function tealFrame(ctx, x, y, w, h, fill = C.panel2) {
  block(ctx, x - 2 * P, y - 2 * P, w + 4 * P, h + 4 * P, C.teal[2], 1);
  rect(ctx, x - P, y - P, w + 2 * P, h + 2 * P, C.teal[1]);
  rect(ctx, x, y, w, h, fill);
  ctx.fillStyle = C.teal[0];
  for (const [cx, cy] of [[x - P, y - P], [x + w - P, y - P], [x - P, y + h - P], [x + w - P, y + h - P]]) ctx.fillRect(snap(cx), snap(cy), 2 * P, 2 * P);
}

/** Gold reward box (quest rewards). */
function rewardBox(ctx, x, y, w, h) {
  block(ctx, x - P, y - P, w + 2 * P, h + 2 * P, '#6B5310', 0);
  rect(ctx, x - P, y - P, w + 2 * P, P, '#E8C547'); rect(ctx, x - P, y + h, w + 2 * P, P, '#8F7014');
  rect(ctx, x - P, y - P, P, h + 2 * P, '#C9A227'); rect(ctx, x + w, y - P, P, h + 2 * P, '#8F7014');
  const g = ctx.createLinearGradient(0, y, 0, y + h);
  g.addColorStop(0, '#6A3313'); g.addColorStop(1, '#3E1A0B');
  ctx.fillStyle = g; ctx.fillRect(snap(x), snap(y), snap(w), snap(h));
  ctx.fillStyle = '#FFE07A';
  for (const [cx, cy] of [[x - P, y - P], [x + w, y - P], [x - P, y + h], [x + w, y + h]]) ctx.fillRect(snap(cx), snap(cy), P, P);
}

/** Text in a pixel font with a hard 1-step drop shadow. font: 'title' (Silkscreen caps) | 'ui' (Pixelify) | 'num'. */
function text(ctx, s, x, y, { size = 20, font = 'ui', color = C.text, align = 'left', shadow = true, max = 0, base = 'middle' } = {}) {
  const fam = font === 'title' ? 'Silkscreen' : font === 'num' ? 'Montserrat' : 'Pixelify';
  let str = String(s);
  ctx.font = `${size}px ${fam}`;
  if (max) {
    while (str.length > 2 && ctx.measureText(str).width > max) str = str.slice(0, -2) + '…';
    if (ctx.measureText(str).width > max) { ctx.font = `${Math.floor(size * 0.8)}px ${fam}`; }
  }
  ctx.textAlign = align; ctx.textBaseline = base;
  if (shadow) { ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillText(str, Math.round(x) + 2, Math.round(y) + 2); }
  ctx.fillStyle = color; ctx.fillText(str, Math.round(x), Math.round(y));
  return ctx.measureText(str).width;
}

/** A count bar like "(15 / 15)": dark track, light rim, coloured fill, the count printed in the middle. */
function bar(ctx, x, y, w, h, frac, { col = C.green, label = null, rim = '#C8CCD8' } = {}) {
  rect(ctx, x - P, y - P, w + 2 * P, h + 2 * P, rim);
  rect(ctx, x, y, w, h, '#1C1F2B');
  const f = Math.max(0, Math.min(1, frac || 0));
  if (f > 0) {
    rect(ctx, x, y, Math.max(P, w * f), h, col[1]);
    rect(ctx, x, y, Math.max(P, w * f), P, col[0]);
    rect(ctx, x, y + h - P, Math.max(P, w * f), P, col[2]);
  }
  if (label) text(ctx, label, x + w / 2, y + h / 2 + 1, { size: Math.max(12, h - 4), align: 'center' });
}

/** Tiled banner (the biome strips): a repeating 8-cell pattern in two tones with sparkle pixels, a dark band for text. */
function banner(ctx, x, y, w, h, theme = 'felt', title = '', sub = '') {
  const T = THEMES[theme] || THEMES.felt;
  ctx.save();
  ctx.beginPath(); ctx.rect(snap(x), snap(y), snap(w), snap(h)); ctx.clip();
  const t = 4 * P;
  for (let yy = snap(y); yy < y + h; yy += t) for (let xx = snap(x); xx < x + w; xx += t) {
    const k = (((xx / t) * 7 + (yy / t) * 13) ^ ((xx / t) * (yy / t))) & 7;
    ctx.fillStyle = T.tiles[k % T.tiles.length]; ctx.fillRect(xx, yy, t, t);
    if (T.pat) T.pat(ctx, xx, yy, t, k);
  }
  ctx.restore();
  rect(ctx, x, y, w, P, 'rgba(255,255,255,0.18)');
  rect(ctx, x, y + h - P, w, P, 'rgba(0,0,0,0.35)');
  if (title) {
    text(ctx, title, x + w / 2, y + h / 2 - (sub ? 9 : 0), { size: 26, font: 'ui', align: 'center' });
    if (sub) text(ctx, sub, x + w / 2, y + h / 2 + 15, { size: 14, align: 'center', color: '#E6E8F0' });
  }
}

const THEMES = {
  felt: { tiles: ['#145C38', '#176A40', '#11512F', '#18703F'], pat: (c, x, y, t, k) => { if (k === 3) { c.fillStyle = '#1F8A50'; c.fillRect(x + t / 2 - 2, y + t / 2 - 2, 4, 4); } } },
  neon: { tiles: ['#3B0F3F', '#4A1250', '#331036', '#561661'], pat: (c, x, y, t, k) => { if (k === 5) { c.fillStyle = '#FF5BC8'; c.fillRect(x + 4, y + 4, 4, 4); } } },
  gold: { tiles: ['#5A3E0E', '#6B4A11', '#4E360C', '#7A5514'], pat: (c, x, y, t, k) => { if (k === 1) { c.fillStyle = '#E8C547'; c.fillRect(x + 8, y + 4, 4, 4); } } },
  stone: { tiles: ['#3A3F4C', '#454B5A', '#333844', '#4C5363'], pat: (c, x, y, t, k) => { if (k === 6) { c.fillStyle = '#2A2E38'; c.fillRect(x, y + t - 4, t, 4); } } },
  sea: { tiles: ['#1767A8', '#1B74BC', '#145C96', '#2384CF'], pat: (c, x, y, t, k) => { if (k % 3 === 0) { c.fillStyle = '#5FC0F2'; c.fillRect(x + 2, y + 6, 8, 4); } } },
  sand: { tiles: ['#D9A15E', '#E0AB68', '#CF9654', '#E6B574'], pat: (c, x, y, t, k) => { if (k === 2) { c.fillStyle = '#C08648'; c.fillRect(x + 4, y + 8, 8, 4); } } },
  night: { tiles: ['#121633', '#161B3D', '#10132C', '#1A2047'], pat: (c, x, y, t, k) => { if (k === 7) { c.fillStyle = '#C9D2FF'; c.fillRect(x + 6, y + 6, 4, 4); } } },
  crimson: { tiles: ['#4A0F12', '#5A1317', '#400D10', '#66161A'], pat: (c, x, y, t, k) => { if (k === 4) { c.fillStyle = '#E0352B'; c.fillRect(x + 6, y + 2, 4, 4); } } },
  sky: { tiles: ['#2E6FB7', '#3478C2', '#2965A8', '#3B83CF'], pat: (c, x, y, t, k) => { if (k === 1) { c.fillStyle = '#DDEFFF'; c.fillRect(x, y + 6, 12, 4); } } },
  dirt: { tiles: ['#4B3221', '#563A27', '#432C1D', '#5E402B'], pat: (c, x, y, t, k) => { if (k === 3) { c.fillStyle = '#6E4C33'; c.fillRect(x + 6, y + 6, 4, 4); } } },
};

// ── sprites ────────────────────────────────────────────────────────────────────
// Each sprite is rows of characters; a key maps characters to colours ('.' = empty). Drawn at s pixels per cell.
const PAL = {
  k: '#0B0B10', w: '#FFFFFF', W: '#DCE3F2', g: '#9AA3B5', G: '#5B6273', y: '#FFE07A', Y: '#F2A31B', o: '#B8650E',
  r: '#FF5A5A', R: '#C0242B', d: '#6E0F14', b: '#7CCBFF', B: '#2E86DE', n: '#1B4F8F', c: '#9FF3EA', C: '#2FA79E',
  e: '#7CF08A', E: '#2E9B45', f: '#1C5E2A', p: '#FF8AD0', P: '#D63C9B', v: '#B48CFF', V: '#6B3FC4', m: '#E7C08A', M: '#A8743D',
  t: '#7A4A26', T: '#4B2C15', s: '#C9A27A', S: '#8C6A48', x: '#FFB23A', X: '#E8410F',
};
const SPRITES = {
  coin: ['..kkkk..', '.kyyyyk.', 'kyYyyYok', 'kyYyyYok', 'kyYyyYok', 'kyYYYYok', '.kooook.', '..kkkk..'],
  gem: ['.kkkkkk.', 'kbwbbBBk', 'kbbbBBnk', '.kbBBnk.', '..kBnk..', '...kk...'],
  star: ['....k....', '...kyk...', '...kyk...', 'kkkyyykkk', 'kyyyyyyYk', '.kyyyyYk.', '..kyyYk..', '.kyYkYYk.', 'kyYk.kYYk', 'kkk...kkk'],
  moon: ['..kkkk..', '.kyyyk..', 'kyyYk...', 'kyYk....', 'kyYk....', 'kyyYk...', '.kyyyk..', '..kkkk..'],
  key: ['.kkk....', 'kyyYk...', 'ky.Yk...', 'kyYYkkkk', '.kkyYYYk', '....kYkY', '....k.kk'],
  bag: ['..kkkk..', '...kk...', '..kmmk..', '.kmmMMk.', 'kmmYMMMk', 'kmYYYMMk', 'kmmYMMMk', '.kkkkkk.'],
  flower: ['.kk.kk..', 'kppkppk.', 'kpyypPk.', '.kyykk..', 'kppkpPk.', 'kPPkPPk.', '.kk.Ek..', '....Ek..'],
  pad: ['.kkkkkk.', 'kVVVVVVk', 'kVwVVrVk', 'kwwwVVbk', 'kVwVVeVk', 'kVVkkVVk', '.kk..kk.'],
  spark: ['...k....', '..kwk...', 'kkwyykk.', '.kwyyk..', 'kkwyykk.', '..kwk...', '...k....'],
  bomb: ['.....xX.', '....kx..', '..kkkk..', '.kGGGGk.', 'kGwGGGGk', 'kGGGGGGk', 'kGGGGGGk', '.kkkkkk.'],
  flag: ['kRRRRk..', 'kRrRRRk.', 'kRRRRk..', 'kk......', 'k.......', 'k.......', 'kk......'],
  skull: ['.kkkkkk.', 'kWWWWWWk', 'kWkkWkkk', 'kWkkWkkk', 'kWWWWWWk', '.kWkWkk.', '.kkkkkk.'],
  crown: ['k..k..k.', 'ky.ky.yk', 'kyykyyyk', 'kyrYyrYk', 'kYYYYYYk', '.kkkkkk.'],
  trophy: ['kkkkkkkk', 'kyyyyyYk', 'kkyyyYkk', '.kyyyYk.', '..kyYk..', '...kk...', '..kYYk..', '.kkkkkk.'],
  cup: ['.kkkkkk.', 'kRRrRRRk', 'kRrRRRRk', '.kRRRRk.', '.kRRRRk.', '..kRRk..', '..kRRk..', '.kkkkkk.'],
  chest: ['.kkkkkk.', 'ktttttTk', 'kYYYYYYk', 'ktttyttk', 'ktttYttk', 'ktTTTTTk', '.kkkkkk.'],
  rocket: ['...kk...', '..kWWk..', '..kWbk..', '..kWWk..', '.kWWWWk.', 'kRkWWkRk', 'kk.xX.kk', '...xx...'],
  ticket: ['kkkkkkkk', 'kyyyyyyk', 'yYkYYkYy', 'kyyyyyyk', 'yYkYYkYy', 'kyyyyyyk', 'kkkkkkkk'],
  ball: ['..kkkk..', '.kbbbbk.', 'kbwbbBBk', 'kbbbBBBk', 'kbBBBBnk', '.kBBnnk.', '..kkkk..'],
  rock: ['..kkkk..', '.kggggk.', 'kgWgggGk', 'kggggGGk', 'kgggGGGk', '.kGGGGk.', '..kkkk..'],
  paper: ['kkkkkk..', 'kWWWWkk.', 'kWggWWWk', 'kWWWWWWk', 'kWggggWk', 'kWWWWWWk', 'kkkkkkkk'],
  scissors: ['k.....k.', 'kGk.kGk.', '.kGkGk..', '..kGk...', '.kRkRk..', 'kR.k.Rk.', 'kRk.kRk.', '.k...k..'],
  heart: ['.kk.kk..', 'krrkrrk.', 'krRRRRk.', 'kRRRRRk.', '.kRRRk..', '..kRk...', '...k....'],
  xp: ['kkkk.kkk', 'kXxk.kXk', '.kXkkXk.', '..kXXk..', '.kXkkXk.', 'kXk..kXk', 'kkk..kkk'],
  dice: ['kkkkkkk.', 'kWWWWWk.', 'kWkWWWk.', 'kWWkWWk.', 'kWWWkWk.', 'kWWWWWk.', 'kkkkkkk.'],
  wheel: ['..kkkk..', '.kyRyRk.', 'kRyRyRyk', 'kyRkkyRk', 'kRykkRyk', 'kyRyRyRk', '.kRyRyk.', '..kkkk..'],
  silv: ['...kk...', '..kWWk..', '.kWwWgk.', 'kWwWWggk', '.kWWggk.', '..kWgk..', '...kk...'],
  tower: ['.k.k.k..', 'kVkVkVk.', 'kVVVVVk.', 'kVkkkVk.', 'kVkyVVk.', 'kVVVVVk.', 'kkkkkkk.'],
  eye: ['..kkkk..', '.kWWWWk.', 'kWWbbWWk', 'kWbkkbWk', 'kWWbbWWk', '.kWWWWk.', '..kkkk..'],
  rain: ['..kkkk..', '.kWWWWk.', 'kWWWWWWk', 'kkkkkkkk', '.b..b...', '..b..b..', '.b..b...'],
  gift: ['..k..k..', '.kRkkRk.', 'kkkRRkkk', 'kRRyyRRk', 'kkkyykkk', 'kRRyyRRk', 'kRRyyRRk', 'kkkkkkkk'],
  scroll: ['.kkkkkk.', 'kmmmmmmk', '.kMMMMk.', '.kmmmmk.', '.kMMMMk.', 'kmmmmmmk', '.kkkkkk.'],
  spade: ['...k...', '..kGk..', '.kGGGk.', 'kGGGGGk', 'kGGkGGk', '.k.k.k.', '..kkk..'],
  club: ['..kkk..', '..kGk..', 'kkkGkkk', 'kGGGGGk', 'kkkGkkk', '...k...', '..kkk..'],
  diamond: ['...k...', '..krk..', '.krRrk.', 'krRRRrk', '.kRRRk.', '..kRk..', '...k...'],
  cherry: ['....kk..', '...kEk..', '..kE.k..', '.kk..kk.', 'kRrk.kRr', 'kRRk.kRR', '.kk...kk'],
  lemon: ['..kkkk..', '.kyyyyk.', 'kyyyyyYk', 'kyyyyyYk', '.kyyYYk.', '..kkkk..'],
  bell: ['...kk...', '..kyyk..', '.kyyyYk.', '.kyyyYk.', 'kyyyyYYk', 'kkkkkkkk', '...kk...'],
  door: ['.kkkkkk.', 'kttttttk', 'ktTttTtk', 'ktTttTtk', 'ktttttyk', 'ktTttTtk', 'kttttttk', 'kkkkkkkk'],
  trap: ['k.k.k.k.', 'kWkWkWk.', 'kWWWWWk.', 'kGGGGGk.', 'kkkkkkk.'],
  lock: ['..kkk...', '.kg.gk..', '.kg.gk..', 'kyyyyyk.', 'kyYkYYk.', 'kyYYYYk.', 'kkkkkkk.'],
};

/** Paint a sprite with its top-left at (x, y), s pixels per cell. dark = silhouette ("???" locked look). */
function sprite(ctx, name, x, y, s = P * 2, { dark = false } = {}) {
  const rows = SPRITES[name];
  if (!rows) return;
  rows.forEach((line, yy) => [...line].forEach((ch, xx) => {
    if (ch === '.') return;
    ctx.fillStyle = dark ? (ch === 'k' ? '#000000' : '#101218') : (PAL[ch] || ch);
    ctx.fillRect(Math.round(x + xx * s), Math.round(y + yy * s), s, s);
  }));
}
const spriteSize = (name, s = P * 2) => { const r = SPRITES[name] || ['']; return [r[0].length * s, r.length * s]; };
/** A sprite centred in a box. */
function spriteIn(ctx, name, x, y, w, h, s, opts) {
  const [sw, sh] = spriteSize(name, s);
  sprite(ctx, name, x + (w - sw) / 2, y + (h - sh) / 2, s, opts);
}

/** Stepped vignette + scanline-free finish; returns the PNG. */
function finish(cv) { return cv.toBuffer('image/png'); }

module.exports = {
  P, C, PAL, SPRITES, THEMES, canvas, rect, block, panel, cell, goldFrame, tealFrame, rewardBox, text, bar, banner,
  sprite, spriteIn, spriteSize, finish, snap,
};
