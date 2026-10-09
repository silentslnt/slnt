// commands/flipduel.js — a coin flip between two players (direct: "whats the point of flip duel if it doesnt let them
// pick"). After the challenge is accepted the challenger calls Heads or Tails with buttons (or typed: `h|t`), the other
// player gets the other side, then the coin is tossed on a drawn table.
const { ButtonStyle } = require('discord.js');
const { card, button, row } = require('../utils/casino');
const { challenge } = require('../utils/wager');
const art = require('../utils/gameArt');

const WIN = 0x3FA34D;
const other = (s) => (s === 'Heads' ? 'Tails' : 'Heads');

module.exports = {
  name: 'flipduel',
  aliases: ['cfd', 'cfvs'],
  description: 'Coin flip against a player for coins. `.flipduel @user <amount> [h|t]`',

  async execute(ctx) {
    const typed = ctx.args.find((x) => /^(h|t|heads|tails)$/i.test(x));
    const w = await challenge(ctx, { title: 'Flip Duel', emoji: '🪙', usage: '> `.flipduel @user <amount>` — call Heads or Tails, the coin decides. Winner takes the pot.' });
    if (!w) return;
    const { msg, a, b, footer, finish } = w;
    const names = [a.username, b.username];
    const img = (opts) => ({ name: 'flip.png', buffer: art.coinflip({ names, ...opts }) });
    let call = typed ? (typed.toLowerCase().startsWith('h') ? 'Heads' : 'Tails') : null;
    if (!call) {
      await msg.edit(card({ title: '🪙 Flip Duel', body: `> ${a}, call it — Heads or Tails? 20 seconds.`, footer,
        image: img({ calls: [null, null] }),
        rows: [row(button('fd_h', 'Heads', ButtonStyle.Primary, false, '👑'), button('fd_t', 'Tails', ButtonStyle.Primary, false, '⭐'))] })).catch(() => {});
      call = await new Promise((resolve) => {
        const col = msg.createMessageComponentCollector({ time: 20_000, filter: (i) => i.customId.startsWith('fd_') });
        col.on('collect', async (i) => {
          if (i.user.id !== a.id) return i.reply({ content: `${a.username} makes the call.`, ephemeral: true }).catch(() => {});
          await i.deferUpdate().catch(() => {});
          col.stop('picked');
          resolve(i.customId === 'fd_h' ? 'Heads' : 'Tails');
        });
        col.on('end', (_c, why) => { if (why !== 'picked') resolve(Math.random() < 0.5 ? 'Heads' : 'Tails'); });
      });
    }
    const calls = [call, other(call)];
    await msg.edit(card({ title: '🪙 Flip Duel', body: `> ${a.username} calls **${calls[0]}** · ${b.username} has **${calls[1]}** — the coin is in the air…`,
      footer, image: img({ calls }), rows: [] })).catch(() => {});
    await new Promise((r) => setTimeout(r, 1600));
    const landed = Math.random() < 0.5 ? 'Heads' : 'Tails';
    const wi = landed === calls[0] ? 0 : 1;
    const res = await finish([a, b][wi].id);
    await msg.edit(card({ title: '🪙 Flip Duel', body: `# ${landed}${res}`, footer, accent: WIN,
      image: img({ calls, face: landed, winner: wi }), rows: [] })).catch(() => {});
  },
};
