// commands/connect4.js — Connect Four against another player for coins. 7 columns × 6 rows, buttons drop a disc;
// 60s per move or you forfeit. A full board is a draw (both stakes back).
const { card, button, row } = require('../utils/casino');
const { ButtonStyle } = require('discord.js');
const { challenge } = require('../utils/wager');

const W = 7, H = 6;
const DISC = ['⚫', '🔴', '🟡'];
const NUM = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣'];

function wins(g, p) {
  const at = (x, y) => x >= 0 && x < W && y >= 0 && y < H && g[y][x] === p;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      if ([0, 1, 2, 3].every((k) => at(x + dx * k, y + dy * k))) return true;
    }
  }
  return false;
}

module.exports = {
  name: 'connect4',
  aliases: ['c4', 'connectfour'],
  description: 'Connect Four against a player for coins. `.connect4 @user <amount>`',

  async execute(ctx) {
    const w = await challenge(ctx, { title: 'Connect Four', emoji: '🔴', usage: '> `.connect4 @user <amount|all>` — four in a row wins the pot.' });
    if (!w) return;
    const { msg, a, b, footer, finish } = w;
    const g = Array.from({ length: H }, () => Array(W).fill(0));
    const players = [a, b];
    let turn = 0;
    const board = () => g.map((r) => r.map((c) => DISC[c]).join('')).join('\n') + '\n' + NUM.join('');
    const rows = (off = false) => [
      row(...[0, 1, 2, 3].map((x) => button(`c4_${x}`, String(x + 1), ButtonStyle.Secondary, off || g[0][x] !== 0))),
      row(...[4, 5, 6].map((x) => button(`c4_${x}`, String(x + 1), ButtonStyle.Secondary, off || g[0][x] !== 0))),
    ];
    const show = (note, off = false, accent) => msg.edit(card({ title: '🔴 Connect Four',
      body: `${DISC[1]} ${a.username} vs ${DISC[2]} ${b.username}\n${board()}\n> ${note}`, rows: off ? [] : rows(), footer, accent })).catch(() => {});
    await show(`${players[turn]}'s move ${DISC[turn + 1]} — 60s`);
    for (;;) {
      const i = await msg.awaitMessageComponent({ time: 60_000, filter: (x) => x.customId.startsWith('c4_') && x.user.id === players[turn].id }).catch(() => null);
      if (!i) {
        const res = await finish(players[1 - turn].id);
        return show(`${players[turn].username} ran out of time — forfeit. ${res}`, true, 0x3FA34D);
      }
      await i.deferUpdate().catch(() => {});
      const x = Number(i.customId.slice(3));
      let y = H - 1;
      while (y >= 0 && g[y][x] !== 0) y--;
      if (y < 0) continue;
      g[y][x] = turn + 1;
      if (wins(g, turn + 1)) {
        const res = await finish(players[turn].id);
        return show(`**Four in a row!** ${res}`, true, 0x3FA34D);
      }
      if (g[0].every((c) => c !== 0)) {
        const res = await finish(null);
        return show(`The board is full. ${res}`, true);
      }
      turn = 1 - turn;
      await show(`${players[turn]}'s move ${DISC[turn + 1]} — 60s`);
    }
  },
};
