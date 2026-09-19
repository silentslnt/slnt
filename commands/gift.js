// commands/gift.js
const { EmbedBuilder } = require('discord.js');
const { GIFT_DAILY_CAP } = require('../utils/config');
const { requireAdmin } = require('../utils/permissions');

const PRESENT = '<:cpresent:1512497697381154826>';
const BLACK   = 0x000000;
const DAY_MS  = 24 * 60 * 60 * 1000;

module.exports = {
  name: 'gift',
  aliases: ['give', 'gft'],
  adminOnly: true,
  description: 'Gift coins to another user. `.gift @user <amount>` (daily cap: 10,000)',

  async execute({ message, args, userData, saveUserData, getUserData, saveSpecificUserData, logAdminAction }) {
    if (!await requireAdmin(message)) return;

    const target = message.mentions.users.first();
    const amount = parseInt(args[1] || args[0] || '', 10);

    if (!target || isNaN(amount) || amount <= 0) {
      return message.channel.send('Usage: `.gift @user <amount>`');
    }
    if (target.id === message.author.id) return message.channel.send('You cannot gift yourself.');
    if (target.bot) return message.channel.send('You cannot gift bots.');

    // Daily cap check
    const now = Date.now();
    userData.giftedToday   = userData.giftedToday || 0;
    userData.lastGiftReset = userData.lastGiftReset ? new Date(userData.lastGiftReset).getTime() : 0;

    if (now - userData.lastGiftReset >= DAY_MS) {
      userData.giftedToday   = 0;
      userData.lastGiftReset = new Date();
    }

    const remaining = GIFT_DAILY_CAP - userData.giftedToday;
    if (remaining <= 0) {
      return message.channel.send({
        embeds: [new EmbedBuilder().setColor(BLACK)
          .setTitle('DAILY GIFT CAP REACHED')
          .setDescription(`> You can gift up to **${GIFT_DAILY_CAP.toLocaleString()}** coins per day.\n> Cap resets in 24h.`)
          .setFooter({ text: message.guild?.name || 'Shiro' })],
      });
    }

    const capped  = Math.min(amount, remaining);
    const balance = userData.balance || 0;
    if (balance < capped) return message.channel.send(`Insufficient balance. You have **${balance.toLocaleString()}** coins.`);

    // Apply
    const targetData = await getUserData(target.id);
    if (!targetData) return message.channel.send('That user has no account yet.');

    userData.balance        -= capped;
    userData.giftedToday    += capped;
    userData.lastGiftReset   = userData.lastGiftReset || new Date();
    targetData.balance       = (targetData.balance || 0) + capped;
    targetData.totalEarned   = (targetData.totalEarned || 0) + capped;

    await saveUserData({ balance: userData.balance, giftedToday: userData.giftedToday, lastGiftReset: userData.lastGiftReset });
    await saveSpecificUserData(target.id, { balance: targetData.balance, totalEarned: targetData.totalEarned });
    await logAdminAction(message.author.id, message.author.username, 'gift', 'Gift Sent', target.id, target.username, `${capped.toLocaleString()} coins`);

    return message.channel.send({
      embeds: [new EmbedBuilder().setColor(BLACK)
        .setTitle('GIFT SENT')
        .setDescription(
          `> ${PRESENT} ${message.author} gifted **${capped.toLocaleString()}** coins to ${target}\n\n` +
          `> Your balance: **${userData.balance.toLocaleString()}**\n` +
          `> Daily gift remaining: **${(GIFT_DAILY_CAP - userData.giftedToday).toLocaleString()}** coins`
        )
        .setFooter({ text: message.guild?.name || 'Shiro' })],
    });
  },
};