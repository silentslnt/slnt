// commands/house.js — the bot's private casino ledger (bot owner / trusted list only).
// This balance is bookkeeping only: it isn't a user, isn't on any leaderboard,
// and can't be spent.
const { getBank, resetBank } = require('../utils/houseBank');
const { isWhitelisted } = require('../utils/permissions');
const { card, button, row, ButtonStyle } = require('../utils/casino');

module.exports = {
  name: 'house',
  aliases: ['bank', 'casinobank'],
  description: 'Owner only — the casino ledger: what the games have taken in and paid out.',

  async execute({ message }) {
    if (!isWhitelisted(message) && message.author.id !== process.env.OWNER_ID) return;
    const render = async () => {
      const b = await getBank();
      const games = Object.entries(b.games || {}).sort((x, y) => (y[1].net || 0) - (x[1].net || 0))
        .map(([g, v]) => `> **${g}** — ${(v.net || 0) >= 0 ? '+' : ''}${(v.net || 0).toLocaleString()} over ${(v.rounds || 0).toLocaleString()} rounds`).join('\n');
      const edge = b.wagered ? (((b.wagered - b.paid) / b.wagered) * 100).toFixed(2) : '0.00';
      return card({
        title: '🏦 Casino ledger',
        body: `# ${(b.balance || 0) >= 0 ? '+' : ''}${(b.balance || 0).toLocaleString()} coins\n`
          + `> Wagered **${(b.wagered || 0).toLocaleString()}** · paid back **${(b.paid || 0).toLocaleString()}** · kept **${edge}%**\n`
          + `> Fees collected **${(b.fees || 0).toLocaleString()}** · ${(b.rounds || 0).toLocaleString()} rounds\n\n`
          + `__**By game**__\n${games || '> No rounds yet.'}\n\n-# Private bookkeeping — not a user balance, not on any leaderboard.`,
        rows: [row(button('house_refresh', 'Refresh'), button('house_reset', 'Reset ledger', ButtonStyle.Danger))],
        footer: message.guild?.name || 'Shiro',
      });
    };
    const msg = await message.channel.send(await render());
    const col = msg.createMessageComponentCollector({ time: 120_000 });
    col.on('collect', async (i) => {
      if (i.user.id !== message.author.id) return i.reply({ content: 'Owner only.', ephemeral: true });
      if (i.customId === 'house_reset') await resetBank();
      await i.update(await render()).catch(() => {});
    });
  },
};
