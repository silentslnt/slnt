// commands/cups.js — the shell game. The coin is under one of three cups;
// find it and win 2.8× (a 1-in-3 shot — 93% return).
const { card, button, row, takeBet, settle, WIN, LOSE, BLACK, ButtonStyle } = require('../utils/casino');
const { casinoPayout } = require('../utils/houseEdge');

const PAYOUT = 2.8;
const active = new Set();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  name: 'cups',
  aliases: ['shell', 'shellgame'],
  description: 'Find the coin under the right cup — 2.8×. `.cups <bet>`',

  async execute(ctx) {
    const { message, args } = ctx;
    const uid = message.author.id;
    if (active.has(uid)) return message.channel.send('You already have a Cups game running.');
    const taken = await takeBet(ctx, args[0], {
      title: 'Cups',
      body: `> \`.cups <bet>\` — watch the shuffle, then pick the cup with the coin. Pays **${PAYOUT}×**.`,
    });
    if (!taken) return;
    const { bet, userData } = taken;
    active.add(uid);
    const guild = message.guild?.name || 'Shiro';
    const coin = Math.floor(Math.random() * 3);
    const frames = ['🥤 🪙 🥤', '🥤 🥤 🥤', '  🥤🥤 🥤', '🥤  🥤🥤', '🥤 🥤 🥤'];
    const msg = await message.channel.send(card({ title: '🥤 Cups', body: `# ${frames[0]}\n> The coin goes under a cup…`, footer: guild }));
    for (const f of frames.slice(1)) {
      await sleep(700);
      await msg.edit(card({ title: '🥤 Cups', body: `# ${f}\n> Shuffling…`, footer: guild })).catch(() => {});
    }
    await msg.edit(card({
      title: '🥤 Cups', body: `# 🥤 🥤 🥤\n> Which cup has the coin? Bet **${bet.toLocaleString()}** → **${Math.floor(bet * PAYOUT).toLocaleString()}**`,
      rows: [row(...[0, 1, 2].map((n) => button(`cups_${n}`, `Cup ${n + 1}`, ButtonStyle.Primary)))], accent: BLACK, footer: guild,
    })).catch(() => {});

    const collector = msg.createMessageComponentCollector({ time: 60_000 });
    let over = false;
    const end = async (i, pick) => {
      over = true;
      collector.stop();
      active.delete(uid);
      const won = pick === coin;
      const payout = won ? casinoPayout(bet, bet * PAYOUT, userData) : 0;
      const balance = await settle(ctx, { bet, payout, game: 'cups', detail: 'found the coin' });
      const reveal = [0, 1, 2].map((n) => (n === coin ? '🪙' : '🥤')).join(' ');
      const view = card({
        title: won ? '🪙 Found it!' : '🥤 Empty',
        body: `# ${reveal}\n> ${pick === null ? 'Too slow — ' : ''}${won ? `**+${(payout - bet).toLocaleString()}** coins.` : `The coin was under cup ${coin + 1}. Lost **${bet.toLocaleString()}**.`}`,
        accent: won ? WIN : LOSE, footer: `${guild} · balance ${balance.toLocaleString()}`,
      });
      if (i) await i.update(view).catch(() => {});
      else await msg.edit(view).catch(() => {});
    };
    collector.on('collect', async (i) => {
      if (i.user.id !== uid) return i.reply({ content: 'Start your own with `.cups <bet>`.', ephemeral: true });
      if (over) return i.deferUpdate().catch(() => {});
      return end(i, parseInt(i.customId.split('_')[1], 10));
    });
    collector.on('end', async () => { if (!over) await end(null, null).catch(() => {}); });
  },
};
