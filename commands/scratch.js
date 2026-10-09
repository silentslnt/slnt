// commands/scratch.js — a scratch card: three hidden tiles, scratch each one. Three of a kind pays by symbol
// (🍒 5× · 🍋 8× · 🔔 25× · 💎 100× · 👑 1,000×); two of a kind returns a quarter of the stake. ≈92% return.
const { card, button, row, takeBet, settle, WIN, LOSE, BLACK, ButtonStyle, replayRow, attachReplay } = require('../utils/casino');
const { casinoPayout } = require('../utils/houseEdge');

const SYMBOLS = [['🍒', 40, 5], ['🍋', 30, 8], ['🔔', 18, 25], ['💎', 9, 100], ['👑', 3, 1000]];
const PAIR_BACK = 0.25;
const active = new Set();

function roll() {
  const total = SYMBOLS.reduce((s, x) => s + x[1], 0);
  let r = Math.random() * total;
  for (const s of SYMBOLS) { if ((r -= s[1]) < 0) return s; }
  return SYMBOLS[0];
}

module.exports = {
  name: 'scratch',
  aliases: ['scratchcard', 'sc'],
  description: 'Scratch card — match three to win (up to 1,000×). `.scratch <bet>`',

  async execute(ctx) {
    const { message, args } = ctx;
    const uid = message.author.id;
    if (active.has(uid)) return message.channel.send('Finish your scratch card first.');
    const taken = await takeBet(ctx, args[0], {
      title: 'Scratch card',
      body: '> `.scratch <bet>` — scratch three tiles. Three of a kind: 🍒 5× · 🍋 8× · 🔔 25× · 💎 100× · 👑 1,000×. Two of a kind: a quarter back.',
    });
    if (!taken) return;
    const { bet, userData } = taken;
    active.add(uid);
    const guild = message.guild?.name || 'Shiro';
    const tiles = [roll(), roll(), roll()];
    const shown = [false, false, false];
    const face = () => tiles.map((t, k) => (shown[k] ? t[0] : '⬜')).join(' ');
    const rows = () => [row(...[0, 1, 2].map((k) => button(`scr_${k}`, shown[k] ? tiles[k][0] : 'Scratch', ButtonStyle.Secondary, shown[k])),
      button('scr_all', 'Scratch all', ButtonStyle.Primary))];
    const msg = await message.channel.send(card({ title: '🎟 Scratch card', body: `# ${face()}\n> **${bet.toLocaleString()}** on the card — scratch away.`, rows: rows(), accent: BLACK, footer: guild }));
    const col = msg.createMessageComponentCollector({ time: 90_000 });
    let over = false;
    const end = async (i) => {
      over = true; col.stop(); active.delete(uid);
      shown.fill(true);
      const same = tiles[0][0] === tiles[1][0] && tiles[1][0] === tiles[2][0];
      const pair = !same && new Set(tiles.map((t) => t[0])).size === 2;
      const gross = same ? bet * tiles[0][2] : pair ? Math.floor(bet * PAIR_BACK) : 0;
      const payout = same ? casinoPayout(bet, gross, userData) : gross;
      const balance = await settle(ctx, { bet, payout, game: 'scratch', detail: same ? `three ${tiles[0][0]}` : 'scratched' });
      const view = (r) => card({ rows: r ? [replayRow('scratch', bet)] : [],
        title: same ? `${tiles[0][0]} Three of a kind!` : pair ? '🎟 A pair' : '🎟 No match',
        body: `# ${face()}\n> ${same ? `**+${(payout - bet).toLocaleString()}** coins (${tiles[0][2]}×).` : pair ? `A quarter back: **${payout.toLocaleString()}**.` : `Lost **${bet.toLocaleString()}**.`}`,
        accent: same ? WIN : LOSE, footer: `${guild} · balance ${balance.toLocaleString()}` });
      if (i) await i.update(view(true)).catch(() => {}); else await msg.edit(view(true)).catch(() => {});
      attachReplay(msg, uid, { replay: { game: 'scratch', bet }, final: () => view(false) });
    };
    col.on('collect', async (i) => {
      if (i.user.id !== uid) return i.reply({ content: 'Get your own with `.scratch <bet>`.', ephemeral: true });
      if (over) return;
      if (i.customId === 'scr_all') return end(i);
      shown[Number(i.customId.slice(4))] = true;
      if (shown.every(Boolean)) return end(i);
      await i.update(card({ title: '🎟 Scratch card', body: `# ${face()}\n> Keep scratching…`, rows: rows(), accent: BLACK, footer: guild })).catch(() => {});
    });
    col.on('end', () => { if (!over) end(null); });
  },
};
