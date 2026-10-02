// commands/gift.js
const { EmbedBuilder } = require('discord.js');
const { GIFT_DAILY_CAP } = require('../utils/config');

const PRESENT = '<:cpresent:1512497697381154826>';
const BLACK   = 0x000000;

module.exports = {
  name: 'gift',
  aliases: ['give', 'gft'],
  description: 'Gift coins to another user. `.gift @user <amount>` (daily send limit 10,000, shared with tip/trade)',

  async execute({ message, args, userData, saveUserData, getUserData, saveSpecificUserData, logAdminAction }) {
    const target = message.mentions.users.first();
    const amount = parseInt(args[1] || args[0] || '', 10);

    if (!target || isNaN(amount) || amount <= 0) {
      return message.channel.send('Usage: `.gift @user <amount>`');
    }
    if (target.id === message.author.id) return message.channel.send('You cannot gift yourself.');
    if (target.bot) return message.channel.send('You cannot gift bots.');

    // Daily send limit — shared with .tip and .trade (utils/sendCap.js)
    const cap = require('../utils/sendCap');
    const { left: remaining, resets } = await cap.remaining(message.author.id);
    if (remaining <= 0) {
      return message.channel.send({
        embeds: [new EmbedBuilder().setColor(BLACK)
          .setTitle('DAILY SEND LIMIT REACHED')
          .setDescription(`> You can send up to **${GIFT_DAILY_CAP.toLocaleString()}** coins a day (gifts, tips and trades together).\n> Resets <t:${Math.floor(resets / 1000)}:R>.`)
          .setFooter({ text: message.guild?.name || 'Shiro' })],
      });
    }

    const capped  = Math.min(amount, remaining);
    const balance = userData.balance || 0;
    if (balance < capped) return message.channel.send(`Insufficient balance. You have **${balance.toLocaleString()}** coins.`);

    const targetData = await getUserData(target.id);
    if (!targetData) return message.channel.send('That user has no account yet.');

    const { debit, credit } = require('../utils/atomicInv');
    const { TRANSFER_TAX } = require('../utils/config');
    if (!(await cap.claim(message.author.id, capped))) return message.channel.send("That's over today's send limit.");
    if (!(await debit(message.author.id, { balance: capped }))) {
      await cap.release(message.author.id, capped);
      return message.channel.send("You don't have that many coins anymore.");
    }
    const tax = Math.floor(capped * TRANSFER_TAX);
    const net = capped - tax;
    userData.balance -= capped;
    await credit(target.id, { balance: net, totalEarned: net }); // never an absolute write
    if (tax) require('../utils/houseBank').creditHouse(tax, 'transfer');
    const leftNow = remaining - capped;
    await logAdminAction(message.author.id, message.author.username, 'gift', 'Gift Sent', target.id, target.username, `${capped.toLocaleString()} coins (${tax.toLocaleString()} tax)`);

    return message.channel.send({
      embeds: [new EmbedBuilder().setColor(BLACK)
        .setTitle('GIFT SENT')
        .setDescription(
          `> ${PRESENT} ${message.author} gifted **${capped.toLocaleString()}** coins to ${target}\n` +
          `> They receive **${net.toLocaleString()}** · ${Math.round(TRANSFER_TAX * 100)}% transfer tax **${tax.toLocaleString()}**\n\n` +
          `> Your balance: **${userData.balance.toLocaleString()}**\n` +
          `> Left to send today: **${leftNow.toLocaleString()}** coins`
        )
        .setFooter({ text: message.guild?.name || 'Shiro' })],
    });
  },
};