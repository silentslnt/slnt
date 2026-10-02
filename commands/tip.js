// commands/tip.js — Tip coins to another player
const { EmbedBuilder } = require('discord.js');
const { parseBet } = require('../utils/parseBet');

const BLACK = 0x000000;

module.exports = {
  name: 'tip',
  aliases: ['send'],
  description: 'Send coins to another player. `.tip @user <amount>`',

  async execute({ message, args, userData, saveUserData, updateUserBalance, logAdminAction }) {
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

    // Guarded debit (two fast tips can't overspend); the receiver gets it minus the transfer tax
    const { debit, credit } = require('../utils/atomicInv');
    const { TRANSFER_TAX } = require('../utils/config');
    const cap = require('../utils/sendCap');
    const { left, resets } = await cap.remaining(message.author.id);
    if (bet > left) return message.channel.send(`You can send **${left.toLocaleString()}** more coins today (gifts, tips and trades share a ${cap.CAP.toLocaleString()} daily limit). Resets <t:${Math.floor(resets / 1000)}:R>.`);
    if (!(await cap.claim(message.author.id, bet))) return message.channel.send("That's over today's send limit.");
    if (!(await debit(message.author.id, { balance: bet }))) {
      await cap.release(message.author.id, bet);
      return message.channel.send("You don't have that many coins anymore.");
    }
    const tax = Math.floor(bet * TRANSFER_TAX);
    const net = bet - tax;
    userData.balance = (userData.balance || 0) - bet;
    await credit(target.id, { balance: net, totalEarned: net });
    if (tax) require('../utils/houseBank').creditHouse(tax, 'transfer');
    await logAdminAction(message.author.id, message.author.username, 'tip', 'Tip Sent', target.id, target.username, `${bet.toLocaleString()} coins (${tax.toLocaleString()} tax)`);

    const embed = new EmbedBuilder()
      .setColor(BLACK)
      .setTitle('TIP SENT')
      .setDescription(
        `> ${message.author} sent **${bet.toLocaleString()}** coins to ${target}\n` +
        `> They receive **${net.toLocaleString()}** · ${Math.round(TRANSFER_TAX * 100)}% transfer tax **${tax.toLocaleString()}**\n\n` +
        `> Your new balance: \`${userData.balance.toLocaleString()}\``
      )
      .setFooter({ text: message.guild?.name || 'Shiro' });

    await message.channel.send({ embeds: [embed] });
  },
};
