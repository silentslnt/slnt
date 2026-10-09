// commands/giveall.js — give every Player-role member coins or SILV (direct: "a command that lets me give all to
// players, everyone in shiro should have the player role"). Owner / trusted only. The Player role is set in
// `.shiroset` → Events. `.giveall <amount> [coins|silv]` shows how many it reaches; add `confirm` to send.
const { isWhitelisted } = require('../utils/permissions');
const { card } = require('../utils/casino');
const EV = require('../utils/events');

module.exports = {
  name: 'giveall',
  aliases: ['giveplayers', 'massgive'],
  description: 'Owner/trusted only — give every Player-role member coins or SILV. `.giveall <amount> [coins|silv] confirm`',

  async execute({ message, args, logAdminAction }) {
    if (!isWhitelisted(message) && message.author.id !== process.env.OWNER_ID) return;
    const footer = message.guild?.name || 'Shiro';
    const amount = parseInt(String(args.find((a) => /^\d[\d,]*$/.test(a)) || '').replace(/,/g, ''), 10);
    const silv = args.some((a) => /^silv/i.test(a));
    const go = args.some((a) => /^confirm$/i.test(a));
    const c = EV.cfg();
    if (!amount || amount < 1) {
      return message.channel.send(card({ title: '🎁 Give all players', footer,
        body: '> `.giveall <amount> [coins|silv] confirm` — every member with the Player role gets it.\n'
          + `> Player role: ${c.playerRoleId ? `<@&${c.playerRoleId}>` : '**not set** — `.shiroset` → Events'}` }));
    }
    if (!c.playerRoleId) return message.channel.send('Set the Player role first — `.shiroset` → Events.');
    const role = message.guild.roles.cache.get(c.playerRoleId);
    if (!go) {
      await message.guild.members.fetch().catch(() => null);
      const n = role ? [...role.members.values()].filter((m) => !m.user.bot).length : 0;
      return message.channel.send(card({ title: '🎁 Give all players', footer,
        body: `> **${amount.toLocaleString()} ${silv ? 'SILV' : 'coins'}** each to **${n}** players (<@&${c.playerRoleId}>).\n> Add \`confirm\` to send it.` }));
    }
    const { n, error } = await EV.giveAll(message.guild, { amount, silv });
    if (error) return message.channel.send(`❌ ${error}`);
    await logAdminAction?.(message.author.id, message.author.username, 'giveall', `Gave every Player ${amount} ${silv ? 'SILV' : 'coins'}`, null, null, `${n} players`);
    return message.channel.send(card({ title: '🎁 Give all players', footer, body: `> Sent **${amount.toLocaleString()} ${silv ? 'SILV' : 'coins'}** to **${n}** players.` }));
  },
};
