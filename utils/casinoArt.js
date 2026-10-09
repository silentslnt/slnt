// utils/casinoArt.js — a drawn picture for every Shiro game, all in the pixel kit (utils/pixelUI.js). Each renderer
// returns a PNG Buffer; games put it under their title with card({ image: { name, buffer } }). The shared frame:
// a navy window, an icon cell + game name in pixel caps, the game's board in the middle, and a strip of reward-style
// boxes along the bottom (bet · payout · balance) with a WIN / LOSE / PUSH badge.
const K = require('./pixelUI');
const { C, P } = K;

const EMOJI_SPRITE = {
  '💎': 'gem', '⭐': 'star', '🌙': 'moon', '🔑': 'key', '💰': 'bag', '🌸': 'flower', '🎮': 'pad', '✨': 'spark',
  '💣': 'bomb', '🚩': 'flag', '💀': 'skull', '👑': 'crown', '🏆': 'trophy', '🪙': 'coin', '🎟': 'ticket', '🎟️': 'ticket',
};
const GAME = {   // game → [title, sprite, banner theme, accent]
  slots: ['SLOTS', 'gem', 'neon', C.pink], blackjack: ['BLACKJACK', 'heart', 'felt', C.green[0]], mines: ['MINES', 'bomb', 'dirt', C.green[0]],
  minesweeper: ['MINESWEEPER', 'flag', 'stone', C.dim], roulette: ['ROULETTE', 'wheel', 'crimson', C.red[0]], dice: ['DICE', 'dice', 'crimson', C.red[0]],
  wheel: ['WHEEL', 'wheel', 'gold', C.yellow], crash: ['CRASH', 'rocket', 'night', C.orange], tower: ['TOWER', 'tower', 'night', C.purple],
  plinko: ['PLINKO', 'ball', 'sky', C.blue[0]], cups: ['CUPS', 'cup', 'gold', C.yellow], scratch: ['SCRATCH CARD', 'ticket', 'gold', C.yellow],
  rps: ['ROCK PAPER SCISSORS', 'scissors', 'neon', C.purple], coinflip: ['COINFLIP', 'coin', 'gold', C.yellow], overunder: ['OVER / UNDER', 'dice', 'sea', C.blue[0]],
  hl: ['HIGHER / LOWER', 'spark', 'sea', C.blue[0]], lottery: ['LOTTERY', 'ticket', 'gold', C.yellow], mysterybox: ['MYSTERY BOX', 'gift', 'crimson', C.red[0]],
  freespin: ['FREE SPIN', 'wheel', 'gold', C.yellow],
};
const fmt = (n) => Math.floor(n || 0).toLocaleString();

/** The window every game picture uses. draw(ctx, box) paints the board inside box {x,y,w,h}. */
function frame({ game, sub = '', w = 900, h = 520, state = null, stats = null, draw }) {
  const [title, icon, theme, accent] = GAME[game] || [String(game).toUpperCase(), 'coin', 'felt', C.yellow];
  const { cv, ctx } = K.canvas(w, h);
  K.rect(ctx, 0, 0, w, h, C.bg);
  K.panel(ctx, 12, 12, w - 24, h - 24);
  // header
  K.cell(ctx, 28, 28, 56, 56, { sel: true });
  K.spriteIn(ctx, icon, 28, 28, 56, 56, 5);
  K.text(ctx, title, 100, 48, { size: 26, font: 'title', color: C.text, max: w - 330 });
  if (sub) K.text(ctx, sub, 100, 76, { size: 14, font: 'num', color: C.dim, max: w - 330 });
  if (state) {   // WIN / LOSE / PUSH badge, top right
    const col = state === 'win' ? C.green : state === 'lose' ? C.red : state === 'push' ? C.blue : C.gold;
    const label = { win: 'WIN', lose: 'LOSE', push: 'PUSH', live: 'LIVE', jackpot: 'JACKPOT' }[state] || String(state).toUpperCase();
    const bw = 30 + label.length * 18;
    K.block(ctx, w - 40 - bw, 30, bw, 48, C.ink, 1);
    K.block(ctx, w - 36 - bw, 34, bw - 8, 40, col[2], 1);
    K.rect(ctx, w - 32 - bw, 38, bw - 16, 28, col[1]);
    K.rect(ctx, w - 32 - bw, 38, bw - 16, 4, col[0]);
    K.text(ctx, label, w - 40 - bw / 2, 54, { size: 22, font: 'title', align: 'center' });
  }
  const top = 104, bottom = stats ? h - 112 : h - 32;
  const box = { x: 32, y: top, w: w - 64, h: bottom - top };
  K.rect(ctx, box.x - 4, box.y - 4, box.w + 8, box.h + 8, C.ink);
  K.banner(ctx, box.x, box.y, box.w, box.h, theme);
  K.rect(ctx, box.x, box.y, box.w, box.h, 'rgba(6,8,13,0.35)');
  if (draw) draw(ctx, box, accent);
  if (stats) {   // reward-style boxes along the bottom
    const items = stats.filter(Boolean);
    const gap = 16, bw = (w - 64 - gap * (items.length - 1)) / items.length;
    items.forEach(([label, value, ic, col], k) => {
      const x = 32 + k * (bw + gap), y = h - 92;
      K.rewardBox(ctx, x, y, bw, 60);
      if (ic) K.sprite(ctx, ic, x + 12, y + 14, 4);
      K.text(ctx, label, x + (ic ? 52 : 14), y + 18, { size: 13, color: '#E8C547', font: 'title' });
      K.text(ctx, value, x + (ic ? 52 : 14), y + 42, { size: 19, font: 'num', color: col || C.text, max: bw - (ic ? 64 : 24) });
    });
  }
  return K.finish(cv);
}

/** Standard bet / payout / balance strip. */
function money({ bet, payout = null, balance = null, extra = null }) {
  const net = payout == null ? null : payout - bet;
  return [
    ['BET', fmt(bet), 'coin'],
    payout == null ? null : ['PAYOUT', net >= 0 ? `+${fmt(net)}` : `-${fmt(-net)}`, net > 0 ? 'bag' : null, net > 0 ? C.green[0] : net < 0 ? C.red[0] : C.text],
    extra,
    balance == null ? null : ['BALANCE', fmt(balance), 'gem'],
  ];
}
const stateOf = (bet, payout) => (payout == null ? 'live' : payout > bet ? 'win' : payout === bet ? 'push' : 'lose');

// ── generic result (any game without its own board) ────────────────────────────
function result({ game, headline, bet, payout, balance, sub }) {
  return frame({ game, sub, state: stateOf(bet, payout), stats: money({ bet, payout, balance }), h: 420,
    draw: (ctx, b) => {
      const ic = (GAME[game] || [])[1] || 'coin';
      K.cell(ctx, b.x + 40, b.y + b.h / 2 - 60, 120, 120);
      K.spriteIn(ctx, ic, b.x + 40, b.y + b.h / 2 - 60, 120, 120, 10);
      K.text(ctx, headline, b.x + 200, b.y + b.h / 2, { size: 34, max: b.w - 240, color: payout > bet ? C.green[0] : payout === bet ? C.text : C.red[0] });
    } });
}

// ── slots ──────────────────────────────────────────────────────────────────────
/** reels: 3 emoji ('🌀' = still spinning) · win: index list of matching reels. */
function slots({ reels, bet, payout = null, balance = null, jackpot = 0, win = [] }) {
  const state = payout == null ? 'live' : reels.every((r) => r === '💎') && payout > 0 ? 'jackpot' : stateOf(bet, payout);
  return frame({ game: 'slots', sub: `Jackpot ${fmt(jackpot)}`, state, stats: money({ bet, payout, balance }), draw: (ctx, b) => {
    const cw = 170, gap = 34, total = cw * 3 + gap * 2, x0 = b.x + (b.w - total) / 2, y0 = b.y + (b.h - 200) / 2;
    K.panel(ctx, x0 - 20, y0 - 20, total + 40, 240, { fill: '#200A24', rim: '#7A2B6E', hi: '#FF7AD0' });
    reels.forEach((r, k) => {
      const x = x0 + k * (cw + gap);
      K.cell(ctx, x, y0, cw, 200, { sel: win.includes(k), fill: '#2A0E2E' });
      if (r === '🌀') {   // spinning: blurred streaks of symbols
        ['gem', 'star', 'bag'].forEach((s, j) => { ctx.globalAlpha = 0.35; K.spriteIn(ctx, s, x, y0 + j * 66 - 10, cw, 66, 5); });
        ctx.globalAlpha = 1;
        for (let yy = y0 + 8; yy < y0 + 196; yy += 16) K.rect(ctx, x + 12, yy, cw - 24, 4, 'rgba(255,122,208,0.25)');
      } else K.spriteIn(ctx, EMOJI_SPRITE[r] || 'coin', x, y0, cw, 200, 14);
    });
    K.rect(ctx, x0 - 28, y0 + 96, 8, 8, C.gold[0]); K.rect(ctx, x0 + total + 20, y0 + 96, 8, 8, C.gold[0]);   // pay-line arrows
  } });
}

module.exports = { frame, money, result, slots, stateOf, GAME, EMOJI_SPRITE, fmt };

// ── playing cards ──────────────────────────────────────────────────────────────
const SUIT = { '♠': ['spade', '#1A1C24'], '♣': ['club', '#1A1C24'], '♥': ['heart', '#C0242B'], '♦': ['diamond', '#C0242B'] };
function playingCard(ctx, x, y, display, { back = false, w = 84, h = 116 } = {}) {
  K.block(ctx, x - 4, y - 4, w + 8, h + 8, C.ink, 1);
  if (back) {
    K.rect(ctx, x, y, w, h, '#7A1E2A');
    for (let yy = y + 8; yy < y + h - 8; yy += 12) for (let xx = x + 8; xx < x + w - 8; xx += 12) K.rect(ctx, xx, yy, 4, 4, '#C9A227');
    K.rect(ctx, x + 4, y + 4, w - 8, 4, '#A33040');
    return;
  }
  K.rect(ctx, x, y, w, h, '#F4F1E8');
  K.rect(ctx, x, y + h - 8, w, 8, '#D9D3C2');
  const suit = display.slice(-1), rank = display.slice(0, -1);
  const [sp, col] = SUIT[suit] || ['spade', '#1A1C24'];
  K.text(ctx, rank, x + 10, y + 20, { size: 24, font: 'num', color: col, shadow: false });
  K.spriteIn(ctx, sp, x, y + 30, w, h - 30, 6);
}

function blackjack({ dealer, player, hide = false, dv, pv, bet, payout = null, balance = null, doubled = false }) {
  return frame({ game: 'blackjack', sub: doubled ? 'Doubled down · dealer stands on 17' : 'Dealer stands on 17', state: stateOf(bet, payout),
    stats: money({ bet, payout, balance }), h: 560, draw: (ctx, b) => {
      const rowAt = (cards, y, label, total, hideHole) => {
        K.text(ctx, label, b.x + 24, y + 58, { size: 18, font: 'title', color: C.gold[0] });
        K.cell(ctx, b.x + 24, y + 78, 92, 36, { fill: '#2A1410' });
        K.text(ctx, String(total), b.x + 70, y + 97, { size: 22, font: 'num', align: 'center', color: total > 21 ? C.red[0] : total === 21 ? C.green[0] : C.text });
        cards.forEach((c, k) => playingCard(ctx, b.x + 160 + k * 100, y + 6, c.display, { back: hideHole && k === 1 }));
      };
      rowAt(dealer, b.y + 10, 'DEALER', hide ? '?' : dv, hide);
      K.rect(ctx, b.x + 20, b.y + b.h / 2, b.w - 40, 4, 'rgba(255,255,255,0.12)');
      rowAt(player, b.y + b.h / 2 + 12, 'YOU', pv, false);
    } });
}

// ── mines / minesweeper ────────────────────────────────────────────────────────
function grid({ game, n = 5, cellAt, sub, state, stats, side }) {
  return frame({ game, sub, state, stats, h: 600, draw: (ctx, b) => {
    const size = Math.min(76, Math.floor((b.h - 24) / n) - 8), gap = 8;
    const total = n * size + (n - 1) * gap, x0 = b.x + 30, y0 = b.y + (b.h - total) / 2;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const x = x0 + c * (size + gap), y = y0 + r * (size + gap);
      const [kind, label] = cellAt(r * n + c) || ['hidden'];
      if (kind === 'hidden') { K.cell(ctx, x, y, size, size, { fill: '#3A3F4C' }); K.rect(ctx, x + 4, y + 4, size - 8, 4, '#565D70'); }
      else if (kind === 'gem') { K.cell(ctx, x, y, size, size, { fill: '#1E5131' }); K.spriteIn(ctx, 'gem', x, y, size, size, 6); }
      else if (kind === 'boom') { K.cell(ctx, x, y, size, size, { sel: true, fill: '#7A1410' }); K.spriteIn(ctx, 'bomb', x, y, size, size, 6); }
      else if (kind === 'bomb') { K.cell(ctx, x, y, size, size, { fill: '#3A1512' }); K.spriteIn(ctx, 'bomb', x, y, size, size, 5); }
      else if (kind === 'flag') { K.cell(ctx, x, y, size, size, { fill: '#3A3F4C' }); K.spriteIn(ctx, 'flag', x, y, size, size, 5); }
      else if (kind === 'num') {
        K.cell(ctx, x, y, size, size, { fill: '#C9CED8' });
        const col = ['#C9CED8', '#2E86DE', '#2E9B45', '#E0352B', '#6B3FC4', '#B8650E', '#21706B', '#1A1C24', '#636A80'][Number(label) || 0];
        if (label) K.text(ctx, label, x + size / 2, y + size / 2 + 2, { size: Math.floor(size * 0.5), font: 'num', align: 'center', color: col, shadow: false });
      }
    }
    if (side) side(ctx, { x: x0 + total + 40, y: b.y + 20, w: b.x + b.w - (x0 + total + 40) - 20, h: b.h - 40 });
  } });
}

function mines({ revealed, mines: bombs, ended = false, boom = null, mult, next, found, safeLeft, bet, payout = null, balance = null }) {
  return grid({ game: 'mines', sub: '6 mines in 25 tiles', state: ended ? stateOf(bet, payout) : 'live', stats: money({ bet, payout, balance }),
    cellAt: (i) => (!revealed.has(i) ? ['hidden'] : bombs.has(i) ? [i === boom ? 'boom' : 'bomb'] : ['gem']),
    side: (ctx, s) => {
      K.panel(ctx, s.x, s.y, s.w, s.h, { fill: C.panel2 });
      K.text(ctx, 'MULTIPLIER', s.x + s.w / 2, s.y + 30, { size: 16, font: 'title', align: 'center', color: C.gold[0] });
      K.text(ctx, `×${mult.toFixed(2)}`, s.x + s.w / 2, s.y + 80, { size: 46, font: 'num', align: 'center', color: C.green[0] });
      if (!ended) K.text(ctx, `next ×${next.toFixed(2)}`, s.x + s.w / 2, s.y + 124, { size: 18, font: 'num', align: 'center', color: C.dim });
      K.text(ctx, 'GEMS FOUND', s.x + 20, s.y + 172, { size: 14, font: 'title', color: C.dim });
      K.bar(ctx, s.x + 20, s.y + 192, s.w - 40, 22, found / (found + safeLeft || 1), { label: `${found} / ${found + safeLeft}` });
      K.text(ctx, 'WORTH NOW', s.x + 20, s.y + 250, { size: 14, font: 'title', color: C.dim });
      K.text(ctx, fmt(bet * mult), s.x + 20, s.y + 282, { size: 26, font: 'num', color: C.yellow });
    } });
}

function minesweeper({ cells, n = 4, ended = false, bet, payout = null, balance = null, sub = '' }) {
  return grid({ game: 'minesweeper', n, sub, state: ended ? stateOf(bet, payout) : 'live', stats: money({ bet, payout, balance }), cellAt: (i) => cells[i] });
}

// ── tower ──────────────────────────────────────────────────────────────────────
function tower({ floors = 8, floor, mults, picks = [], trapAt = null, cashed = null, bet, payout = null, balance = null }) {
  return frame({ game: 'tower', sub: '2 doors a floor · one is a trap', state: payout == null ? 'live' : stateOf(bet, payout), h: 760,
    stats: money({ bet, payout, balance }), draw: (ctx, b) => {
      const rh = Math.floor((b.h - 20) / floors), dw = 120;
      const cx = b.x + b.w / 2;
      K.rect(ctx, cx - 170, b.y + 8, 340, b.h - 16, 'rgba(10,8,24,0.55)');
      for (let f = 0; f < floors; f++) {
        const y = b.y + b.h - 10 - (f + 1) * rh;
        const cur = f === floor && payout == null, done = f < floor;
        K.text(ctx, String(f + 1), cx - 210, y + rh / 2, { size: 18, font: 'num', align: 'center', color: cur ? C.yellow : C.dim });
        K.text(ctx, `×${mults[f]}`, cx + 230, y + rh / 2, { size: 18, font: 'num', align: 'center', color: done ? C.green[0] : cur ? C.yellow : C.mute });
        [0, 1].forEach((d) => {
          const x = cx - 150 + d * (dw + 60), w = dw, h = rh - 12;
          const picked = done && picks[f] === d, trap = trapAt && trapAt[0] === f && trapAt[1] === d;
          K.cell(ctx, x, y + 6, w, h, { sel: cur || picked || trap, fill: trap ? '#7A1410' : picked ? '#1E5131' : cur ? C.cellSel : f > floor ? '#2B2238' : C.cell });
          K.spriteIn(ctx, trap ? 'trap' : picked ? 'star' : 'door', x, y + 6, w, h, Math.max(3, Math.floor(h / 12)), { dark: f > floor && !trap });
        });
      }
    } });
}

// ── crash ──────────────────────────────────────────────────────────────────────
function crash({ m, crashed = false, cashedAt = null, bet, payout = null, balance = null, auto = null }) {
  return frame({ game: 'crash', sub: auto ? `Auto cash-out ×${auto.toFixed(2)}` : 'Cash out before it crashes', state: payout == null ? 'live' : stateOf(bet, payout),
    stats: money({ bet, payout, balance }), draw: (ctx, b) => {
      const gx = b.x + 70, gy = b.y + 20, gw = b.w - 110, gh = b.h - 60;
      for (let k = 0; k <= 4; k++) K.rect(ctx, gx, gy + (gh * k) / 4, gw, 4, 'rgba(255,255,255,0.07)');
      const top = Math.max(2, m * 1.15);
      const pts = [];
      const steps = 40;
      for (let k = 0; k <= steps; k++) { const v = 1 + (m - 1) * Math.pow(k / steps, 2); pts.push([gx + (gw * k) / steps, gy + gh - ((v - 1) / (top - 1)) * gh]); }
      const col = crashed ? C.red : C.orange === undefined ? C.gold : [C.yellow, C.orange, '#B8650E'];
      pts.forEach(([x, y], k) => { if (k) { for (let yy = Math.round(y / 4) * 4; yy < gy + gh; yy += 4) K.rect(ctx, x, yy, 8, 4, crashed ? 'rgba(224,53,43,0.22)' : 'rgba(255,162,58,0.20)'); } });
      pts.forEach(([x, y]) => K.rect(ctx, x, y, 8, 8, col[1]));
      const [ex, ey] = pts[pts.length - 1];
      K.sprite(ctx, crashed ? 'bomb' : 'rocket', Math.min(ex - 28, b.x + b.w - 70), Math.max(b.y + 4, ey - 64), 7);
      K.text(ctx, `×${m.toFixed(2)}`, gx + 24, gy + 40, { size: 54, font: 'num', color: crashed ? C.red[0] : cashedAt ? C.green[0] : C.yellow });
      if (crashed) K.text(ctx, 'CRASHED', gx + 24, gy + 92, { size: 22, font: 'title', color: C.red[0] });
      if (cashedAt) K.text(ctx, `CASHED OUT ×${cashedAt.toFixed(2)}`, gx + 24, gy + 92, { size: 18, font: 'title', color: C.green[0] });
      K.text(ctx, '×1', gx - 30, gy + gh, { size: 14, font: 'num', color: C.dim });
      K.text(ctx, `×${top.toFixed(1)}`, gx - 44, gy + 8, { size: 14, font: 'num', color: C.dim });
    } });
}

// ── roulette ───────────────────────────────────────────────────────────────────
const RED_NUMS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const WHEEL_ORDER = [0, 32, 15, 19, 4, 21, 2, 25, 17, 34, 6, 27, 13, 36, 11, 30, 8, 23, 10, 5, 24, 16, 33, 1, 20, 14, 31, 9, 22, 18, 29, 7, 28, 12, 35, 3, 26];
function roulette({ num = null, betLabel = '', rolling = false, bet, payout = null, balance = null }) {
  return frame({ game: 'roulette', sub: `Bet on ${betLabel}`, state: rolling ? 'live' : stateOf(bet, payout), stats: money({ bet, payout, balance }), draw: (ctx, b) => {
    const at = num == null ? 0 : WHEEL_ORDER.indexOf(num);
    const cw = 74, n = 9, x0 = b.x + (b.w - n * cw) / 2, y0 = b.y + 40;
    for (let k = 0; k < n; k++) {
      const v = WHEEL_ORDER[(at - 4 + k + 37) % 37];
      const fill = v === 0 ? '#1E7A3A' : RED_NUMS.has(v) ? '#B71C1C' : '#16181F';
      const mid = k === 4;
      K.cell(ctx, x0 + k * cw, y0 + (mid ? 0 : 16), cw - 8, mid ? 130 : 98, { sel: mid && !rolling, fill });
      K.text(ctx, num == null && mid ? '?' : v, x0 + k * cw + (cw - 8) / 2, y0 + (mid ? 65 : 65), { size: mid ? 40 : 26, font: 'num', align: 'center', color: '#FFFFFF' });
    }
    K.sprite(ctx, 'ball', x0 + 4 * cw + (cw - 8) / 2 - 14, y0 - 36, 4);
    const label = num == null ? 'THE BALL IS ROLLING…' : `${num} ${num === 0 ? 'GREEN' : RED_NUMS.has(num) ? 'RED' : 'BLACK'}`;
    K.text(ctx, label, b.x + b.w / 2, y0 + 176, { size: 26, font: 'title', align: 'center', color: num == null ? C.dim : C.text });
  } });
}

// ── dice ───────────────────────────────────────────────────────────────────────
const PIPS = { 1: [[1, 1]], 2: [[0, 0], [2, 2]], 3: [[0, 0], [1, 1], [2, 2]], 4: [[0, 0], [2, 0], [0, 2], [2, 2]], 5: [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2]], 6: [[0, 0], [2, 0], [0, 1], [2, 1], [0, 2], [2, 2]] };
function die(ctx, x, y, s, face, { glow = false, tilt = 0 } = {}) {
  ctx.save(); ctx.translate(x + s / 2, y + s / 2); ctx.rotate(tilt); ctx.translate(-s / 2, -s / 2);
  K.block(ctx, -6, -6, s + 12, s + 12, glow ? C.gold[1] : C.ink, 2);
  K.block(ctx, 0, 0, s, s, '#F4F1E8', 2);
  K.rect(ctx, 0, s - 12, s, 8, '#D9D3C2');
  (PIPS[face] || []).forEach(([px, py]) => K.rect(ctx, s * 0.2 + px * s * 0.25, s * 0.2 + py * s * 0.25, s * 0.14, s * 0.14, face === 1 ? '#C0242B' : '#1A1C24'));
  ctx.restore();
}
function dice({ face, rolling = false, bet, payout = null, balance = null }) {
  return frame({ game: 'dice', sub: '4 → 1.4× · 5 → 1.7× · 6 → 2×', state: rolling ? 'live' : stateOf(bet, payout), stats: money({ bet, payout, balance }), draw: (ctx, b) => {
    die(ctx, b.x + b.w / 2 - 80, b.y + b.h / 2 - 80, 160, face, { glow: !rolling && face >= 4, tilt: rolling ? (face % 2 ? 0.25 : -0.2) : 0 });
    [4, 5, 6].forEach((f, k) => {
      const x = b.x + b.w - 200, y = b.y + 30 + k * 66;
      K.cell(ctx, x, y, 160, 52, { sel: !rolling && face === f });
      die(ctx, x + 8, y + 8, 36, f);
      K.text(ctx, ['1.4×', '1.7×', '2×'][k], x + 104, y + 28, { size: 20, font: 'num', align: 'center', color: C.yellow });
    });
  } });
}

// ── wheel ──────────────────────────────────────────────────────────────────────
const SEG_COL = { '⬛': '#23262F', '🟫': '#7A4A26', '🟦': '#2E86DE', '🟩': '#2E9B45', '🟨': '#F2C94C', '🟧': '#F2A31B', '🟥': '#E0352B' };
function wheel({ strip, mult = null, bet, payout = null, balance = null }) {
  return frame({ game: 'wheel', sub: 'Spin once, win what it lands on', state: mult == null ? 'live' : stateOf(bet, payout), stats: money({ bet, payout, balance }), draw: (ctx, b) => {
    const cw = 130, x0 = b.x + (b.w - cw * strip.length) / 2, y0 = b.y + 50;
    strip.forEach(([m, e], k) => {
      const mid = k === Math.floor(strip.length / 2);
      K.cell(ctx, x0 + k * cw, y0 + (mid ? 0 : 14), cw - 10, mid ? 140 : 112, { sel: mid && mult != null, fill: SEG_COL[e] || '#333' });
      K.text(ctx, `×${m}`, x0 + k * cw + (cw - 10) / 2, y0 + 70, { size: mid ? 36 : 26, font: 'num', align: 'center', color: '#FFFFFF' });
    });
    const px = x0 + Math.floor(strip.length / 2) * cw + (cw - 10) / 2;
    ctx.fillStyle = C.gold[0];
    for (let k = 0; k < 5; k++) ctx.fillRect(px - 20 + k * 4, y0 + 160 + k * 4, 40 - k * 8, 4);
    K.text(ctx, mult == null ? 'SPINNING…' : `LANDED ×${mult}`, b.x + b.w / 2, y0 + 210, { size: 24, font: 'title', align: 'center', color: mult == null ? C.dim : C.text });
  } });
}

// ── plinko ─────────────────────────────────────────────────────────────────────
function plinko({ mults, ball = null, bucket = null, bet, payout = null, balance = null }) {
  return frame({ game: 'plinko', sub: 'Edges pay big, the middle eats your bet', state: bucket == null ? 'live' : stateOf(bet, payout), h: 640,
    stats: money({ bet, payout, balance }), draw: (ctx, b) => {
      const n = mults.length, cw = (b.w - 40) / n, rows = 9, sp = (b.w - 40) / (rows + 3), rh = (b.h - 110) / rows;
      for (let r = 0; r < rows; r++) {
        const count = r + 3, y = b.y + 24 + r * rh;
        for (let k = 0; k < count; k++) K.rect(ctx, b.x + b.w / 2 + (k - (count - 1) / 2) * sp - 4, y, 8, 8, '#DDEFFF');
      }
      mults.forEach((m, k) => {
        const x = b.x + 20 + k * cw, y = b.y + b.h - 70, hit = bucket === k;
        const heat = Math.min(1, Math.log10(Math.max(1, m)) / 3);
        const col = m >= 1 ? `rgb(${Math.round(240 * heat + 60)},${Math.round(180 - 120 * heat)},60)` : '#3A4566';
        K.cell(ctx, x + 2, y, cw - 6, 54, { sel: hit, fill: col });
        K.text(ctx, m >= 100 ? `${m}` : `${m}`, x + cw / 2, y + 27, { size: cw > 50 ? 16 : 12, font: 'num', align: 'center', color: '#FFFFFF', shadow: true });
      });
      if (ball) { const r = Math.min(ball[1], 9); K.sprite(ctx, 'ball', b.x + 20 + ball[0] * cw + cw / 2 - 14, b.y + 4 + r * ((b.h - 110) / 9), 4); }
    } });
}

// ── cups ───────────────────────────────────────────────────────────────────────
function cups({ coin = null, show = false, pick = null, offsets = [0, 0, 0], bet, payout = null, balance = null, note = '' }) {
  return frame({ game: 'cups', sub: 'Find the coin · pays 2.8×', state: payout == null ? 'live' : stateOf(bet, payout), stats: money({ bet, payout, balance }), draw: (ctx, b) => {
    const cw = 180, x0 = b.x + (b.w - cw * 3) / 2;
    [0, 1, 2].forEach((k) => {
      const x = x0 + k * cw + offsets[k], y = b.y + 50;
      const lifted = show && (k === coin || k === pick);
      if (show && k === coin) K.sprite(ctx, 'coin', x + cw / 2 - 36, y + 150, 9);
      K.sprite(ctx, 'cup', x + cw / 2 - 48, y + (lifted ? 0 : 60), 12);
      K.text(ctx, `CUP ${k + 1}`, x + cw / 2, y + 250, { size: 18, font: 'title', align: 'center', color: pick === k ? C.yellow : C.dim });
    });
    if (note) K.text(ctx, note, b.x + b.w / 2, b.y + 20, { size: 18, align: 'center', color: C.text });
  } });
}

// ── scratch ────────────────────────────────────────────────────────────────────
const SCR = { '🍒': 'cherry', '🍋': 'lemon', '🔔': 'bell', '💎': 'gem', '👑': 'crown' };
function scratch({ tiles, shown, bet, payout = null, balance = null, done = false }) {
  return frame({ game: 'scratch', sub: '🍒 5× · 🍋 8× · 🔔 25× · 💎 100× · 👑 1,000×'.replace(/[^\x00-\x7F×·,]/g, '').replace(/\s+/g, ' ').trim() || 'Match three',
    state: done ? stateOf(bet, payout) : 'live', stats: money({ bet, payout, balance }), draw: (ctx, b) => {
      K.rect(ctx, b.x + 60, b.y + 20, b.w - 120, b.h - 40, '#E9C46A');
      K.rect(ctx, b.x + 68, b.y + 28, b.w - 136, b.h - 56, '#F7E7B0');
      K.text(ctx, 'MATCH THREE', b.x + b.w / 2, b.y + 52, { size: 22, font: 'title', align: 'center', color: '#7A4A0E', shadow: false });
      const cw = 170, x0 = b.x + (b.w - cw * 3) / 2;
      tiles.forEach((t, k) => {
        const x = x0 + k * cw + 10, y = b.y + 80, w = cw - 20, h = b.h - 130;
        if (!shown[k]) {
          K.rect(ctx, x, y, w, h, '#9AA3B5');
          for (let yy = y + 8; yy < y + h - 8; yy += 16) K.rect(ctx, x + 10, yy, w - 20, 4, '#B8C0CF');
          K.text(ctx, '?', x + w / 2, y + h / 2, { size: 48, font: 'title', align: 'center', color: '#5B6273', shadow: false });
        } else {
          K.cell(ctx, x, y, w, h, { fill: '#FFF7DA', sel: done && payout > bet });
          K.spriteIn(ctx, SCR[t] || 'coin', x, y, w, h, 12);
        }
      });
    } });
}

// ── rock paper scissors / coinflip / over-under ────────────────────────────────
const HAND = { rock: 'rock', paper: 'paper', scissors: 'scissors' };
function rps({ you, house, bet, payout = null, balance = null }) {
  return frame({ game: 'rps', sub: 'Win 1.9× · draw 85% back', state: payout === null ? 'live' : payout > bet ? 'win' : payout > 0 ? 'push' : 'lose',
    stats: money({ bet, payout, balance }), draw: (ctx, b) => {
      const w = 200, y = b.y + 30;
      [[you, 'YOU', b.x + 90], [house, 'HOUSE', b.x + b.w - 90 - w]].forEach(([h, label, x]) => {
        K.cell(ctx, x, y, w, 200, { sel: (label === 'YOU') === (payout > bet) && payout !== Math.floor(bet * 0.85) });
        K.spriteIn(ctx, HAND[h], x, y, w, 200, 16);
        K.text(ctx, `${label} · ${String(h).toUpperCase()}`, x + w / 2, y + 230, { size: 18, font: 'title', align: 'center', color: C.text });
      });
      K.text(ctx, 'VS', b.x + b.w / 2, y + 100, { size: 44, font: 'title', align: 'center', color: C.yellow });
    } });
}

function coinflip({ called, landed = null, bet, payout = null, balance = null, streak = 0, spin = 0 }) {
  return frame({ game: 'coinflip', sub: `You called ${called} · streak ${streak}`, state: landed == null ? 'live' : stateOf(bet, payout), stats: money({ bet, payout, balance }), draw: (ctx, b) => {
    const s = landed == null ? [16, 8, 3, 8][spin % 4] : 18, x = b.x + b.w / 2, y = b.y + b.h / 2 - 20;
    K.sprite(ctx, landed === 'Tails' ? 'moon' : 'coin', x - 4 * s, y - 4 * s, s, {});
    K.text(ctx, landed == null ? 'FLIPPING…' : landed.toUpperCase(), x, b.y + b.h - 30, { size: 26, font: 'title', align: 'center', color: landed == null ? C.dim : C.text });
  } });
}

function overunder({ roll, side, target, mult, bet, payout, balance }) {
  return frame({ game: 'overunder', sub: `You called ${side} ${target} · ×${mult}`, state: stateOf(bet, payout), stats: money({ bet, payout, balance }), draw: (ctx, b) => {
    const x = b.x + 40, w = b.w - 80, y = b.y + b.h / 2;
    const winFrom = side === 'over' ? target / 100 : 0, winTo = side === 'over' ? 1 : target / 100;
    K.rect(ctx, x - 4, y - 4, w + 8, 40, C.ink);
    K.rect(ctx, x, y, w, 32, '#3A1512');
    K.rect(ctx, x + w * winFrom, y, w * (winTo - winFrom), 32, '#1E6B2A');
    K.rect(ctx, x + w * (target / 100) - 2, y - 14, 4, 60, C.yellow);
    K.text(ctx, String(target), x + w * (target / 100), y + 64, { size: 16, font: 'num', align: 'center', color: C.yellow });
    const rx = x + w * ((roll - 0.5) / 100);
    K.sprite(ctx, 'dice', rx - 14, y - 52, 4);
    K.text(ctx, String(roll), b.x + b.w / 2, b.y + 50, { size: 54, font: 'num', align: 'center', color: payout > bet ? C.green[0] : C.red[0] });
  } });
}

module.exports = Object.assign(module.exports, { blackjack, mines, minesweeper, tower, crash, roulette, dice, wheel, plinko, cups, scratch, rps, coinflip, overunder, playingCard });
