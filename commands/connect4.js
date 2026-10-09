// commands/connect4.js — Connect Four against another player for coins, on a drawn board (direct: "cant this look
// better"). 7 columns × 6 rows, the column buttons drop a disc; 60s per move or you forfeit. A full board is a draw.
// Each move reposts the board at the bottom (old one deleted) and pings whose move it is (direct: "they will lose the message").
const { ButtonStyle } = require('discord.js');
const { card, button, row } = require('../utils/casino');
const { challenge } = require('../utils/wager');
const art = require('../utils/gameArt');

const W = 7, H = 6, MOVE_MS = 60_000;
const WIN = 0x3FA34D;

/** The winning four for player p, or null. */
function fourOf(g, p) {
  const at = (x, y) => x >= 0 && x < W && y >= 0 && y < H && g[y][x] === p;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    for (const [dx, dy] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
      if ([0, 1, 2, 3].every((k) => at(x + dx * k, y + dy * k))) return [0, 1, 2, 3].map((k) => [x + dx * k, y + dy * k]);
    }
  }
  return null;
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
    let turn = 0, last = null, over = false;
    const rows = () => [
      row(...[0, 1, 2, 3].map((x) => button(`c4_${x}`, String(x + 1), x % 2 ? ButtonStyle.Secondary : ButtonStyle.Primary, g[0][x] !== 0))),
      row(...[4, 5, 6].map((x) => button(`c4_${x}`, String(x + 1), x % 2 ? ButtonStyle.Secondary : ButtonStyle.Primary, g[0][x] !== 0))),
    ];
    const payload = (note, { done = false, line = null, accent } = {}) => card({
      title: '🔴 Connect Four', body: `> ${note}`, footer, accent, rows: done ? [] : rows(),
      image: { name: 'c4.png', buffer: art.connect4({ grid: g, last, line, names: [a.username, b.username], turn: done ? null : turn }) },
    });
    const deadline = () => `<t:${Math.floor((Date.now() + MOVE_MS) / 1000)}:R>`;
    let table = msg;
    const post = async (p, ping) => {
      const old = table;
      table = await old.channel.send({ ...p, allowedMentions: { users: ping } }).catch(() => old);
      if (table !== old) await old.delete().catch(() => {});
    };
    await post(payload(`${players[turn]} drops first ${turn ? '🟡' : '🔴'} — ${deadline()}`), [players[turn].id]);

    await new Promise((resolve) => {
      let timer;
      const col = table.channel.createMessageComponentCollector({ filter: (i) => i.message?.id === table.id && i.customId.startsWith('c4_') });
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          if (over) return;
          over = true; col.stop();
          const res = await finish(players[1 - turn].id);
          await post(payload(`${players[turn].username} ran out of time — forfeit.${res}`, { done: true, accent: WIN }), [a.id, b.id]);
          resolve();
        }, MOVE_MS);
      };
      arm();
      col.on('collect', async (i) => {
        if (over) return i.deferUpdate().catch(() => {});
        if (!players.some((p) => p.id === i.user.id)) return i.reply({ content: 'This game isn\'t yours — start one with `.connect4 @user <amount>`.', ephemeral: true }).catch(() => {});
        if (i.user.id !== players[turn].id) return i.reply({ content: `It's ${players[turn].username}'s move.`, ephemeral: true }).catch(() => {});
        const x = Number(i.customId.slice(3));
        let y = H - 1;
        while (y >= 0 && g[y][x] !== 0) y--;
        if (y < 0) return i.reply({ content: 'That column is full.', ephemeral: true }).catch(() => {});
        g[y][x] = turn + 1;
        last = [x, y];
        const line = fourOf(g, turn + 1);
        if (line) {
          over = true; clearTimeout(timer); col.stop();
          await i.deferUpdate().catch(() => {});
          const res = await finish(players[turn].id);
          await post(payload(`**Four in a row!**${res}`, { done: true, line, accent: WIN }), [a.id, b.id]);
          return resolve();
        }
        if (g[0].every((c) => c !== 0)) {
          over = true; clearTimeout(timer); col.stop();
          await i.deferUpdate().catch(() => {});
          const res = await finish(null);
          await post(payload(`The board is full.${res}`, { done: true }), [a.id, b.id]);
          return resolve();
        }
        turn = 1 - turn;
        arm();
        await i.deferUpdate().catch(() => {});
        await post(payload(`${players[turn]}'s move ${turn ? '🟡' : '🔴'} — ${deadline()}`), [players[turn].id]);
      });
    });
  },
};
