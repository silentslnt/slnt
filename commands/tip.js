// commands/tip.js — Tip coins to another player
const { EmbedBuilder } = require('discord.js');
const { requireAdmin } = require('../utils/permissions');
const { parseBet } = require('../utils/parseBet');

const BLACK = 0x000000;

module.exports = {
  name: 'tip',
  aliases: ['send'],
  adminOnly: true,
  description: 'Send coins to another player. `.tip @user <amount>`',

  async execute({ message, args, userData, saveUserData, updateUserBalance, logAdminAction }) {
    if (!await requireAdmin(message)) return;

    const target = message.mentions.users.first();
    // Support both ".tip @user 500" and ".tip 500 @user"
    const amountArg = args.find(a => !a.startsWith('<@'));
    const bet       = parseBet(amountArg, userData.balance || 0);

    if (!target || target.bot || target.id === message.author.id || !bet) {
      return message.channel.send({
        embeds: [new EmbedBuilder().setColor(BLACK)
          .setTitle('TIP')
          .setDescription(
            '> Usage: `.tip @user <amount|all>`\n\n' +
            '__**Examples**__\n' +
            '> `.tip @Shiro 500` — send 500 coins\n' +
            '> `.tip @Shiro all` — send all your coins'
          )
          .setFooter({ text: message.guild?.name || 'Shiro' })],
      });
    }

    if ((userData.balance || 0) < bet) {
      return message.channel.send(`You only have **${(userData.balance||0).toLocaleString()}** coins.`);
    }

    // Atomic update both balances
    userData.balance = (userData.balance || 0) - bet;
    await saveUserData({ balance: userData.balance });
    await updateUserBalance(target.id, bet);
    await logAdminAction(message.author.id, message.author.username, 'tip', 'Tip Sent', target.id, target.username, `${bet.toLocaleString()} coins`);

    const embed = new EmbedBuilder()
      .setColor(BLACK)
      .setTitle('TIP SENT')
      .setDescription(
        `> ${message.author} sent **${bet.toLocaleString()}** coins to ${target}\n\n` +
        `> Your new balance: \`${userData.balance.toLocaleString()}\``
      )
      .setFooter({ text: message.guild?.name || 'Shiro' });

    await message.channel.send({ embeds: [embed] });
  },
};
