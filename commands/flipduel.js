// commands/flipduel.js — a coin flip between two players: the challenger calls it, the coin decides.
const { card } = require('../utils/casino');
const { challenge } = require('../utils/wager');

module.exports = {
  name: 'flipduel',
  aliases: ['cfd', 'cfvs'],
  description: 'Coin flip against a player for coins. `.flipduel @user <amount> [h|t]`',

  async execute(ctx) {
    const call = (ctx.args.find((x) => /^(h|t|heads|tails)$/i.test(x)) || 'h').toLowerCase().startsWith('h') ? 'Heads' : 'Tails';
    const w = await challenge(ctx, { title: 'Flip Duel', emoji: '🪙', usage: '> `.flipduel @user <amount> [h|t]` — you call it, winner takes the pot.' });
    if (!w) return;
    const { msg, a, b, footer, finish } = w;
    for (const f of ['🪙', '✨', '💫', '🪙']) {
      await msg.edit(card({ title: '🪙 Flip Duel', body: `# ${f}\n> ${a.username} called **${call}**…`, footer })).catch(() => {});
      await new Promise((r) => setTimeout(r, 350));
    }
    const landed = Math.random() < 0.5 ? 'Heads' : 'Tails';
    const res = await finish(landed === call ? a.id : b.id);
    await msg.edit(card({ title: '🪙 Flip Duel', body: `# ${landed}\n> ${a.username} called **${call}** · ${res}`, footer, accent: 0x3FA34D })).catch(() => {});
  },
};
