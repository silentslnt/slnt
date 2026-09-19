// commands/gift.js
const { EmbedBuilder } = require('discord.js');
const { COLOR, GIFT_DAILY_CAP } = require('../utils/config');
const { requireAdmin } = require('../utils/permissions');

const DAY_MS = 24 * 60 * 60 * 1000;

module.exports = {
  name: 'gift',
  aliases: ['give', 'gft'],
  adminOnly: true,
  description: 'Gift coins to another user. `.gift @user <amount>` (daily cap: 10,000)',

  async execute({ message, args, userData, saveUserData, getUserData, saveSpecificUserData }) {
    if (!await requireAdmin(message)) return;

    const target = message.mentions.users.first();
    const amount = parseInt(args[1] || args[0] || '', 10);

    if (!target || isNaN(amount) || amount <= 0) {
      return message.channel.send('Usage: `.gift @user <amount>`');
    }
    if (target.id === message.author.id) return message.channel.send('❌ You cannot gift yourself.');
    if (target.bot) return message.channel.send('❌ You cannot gift bots.');

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
        embeds: [new EmbedBuilder().setColor(COLOR.LOSS)
          .setTitle('˗ˏˋ 𐙚 ✖ Daily Gift Cap Reached 𐙚 ˎˊ˗')
          .setDescription(`꒰ঌ You can gift up to **${GIFT_DAILY_CAP.toLocaleString()}** coins per day ໒꒱\nCap resets in 24h.`)
          .setFooter({ text: 'System • Gift' })],
      });
    }

    const capped  = Math.min(amount, remaining);
    const balance = userData.balance || 0;
    if (balance < capped) return message.channel.send(`❌ Insufficient balance. You have **${balance.toLocaleString()}** coins.`);

    // Apply
    const targetData = await getUserData(target.id);
    if (!targetData) return message.channel.send('❌ That user has no account yet.');

    userData.balance        -= capped;
    userData.giftedToday    += capped;
    userData.lastGiftReset   = userData.lastGiftReset || new Date();
    targetData.balance       = (targetData.balance || 0) + capped;
    targetData.totalEarned   = (targetData.totalEarned || 0) + capped;

    await saveUserData({ balance: userData.balance, giftedToday: userData.giftedToday, lastGiftReset: userData.lastGiftReset });
    await saveSpecificUserData(target.id, { balance: targetData.balance, totalEarned: targetData.totalEarned });

    return message.channel.send({
      embeds: [new EmbedBuilder().setColor(COLOR.WIN)
        .setTitle('˗ˏˋ 𐙚 🎁 ɢɪꜰᴛ ꜱᴇɴᴛ 𐙚 ˎˊ˗')
        .setDescription(
          `꒰ঌ ${message.author} gifted **${capped.toLocaleString()}** coins to ${target} ໒꒱\n\n` +
          `💰 Your balance: **${userData.balance.toLocaleString()}**\n` +
          `📦 Daily gift remaining: **${(GIFT_DAILY_CAP - userData.giftedToday).toLocaleString()}** coins`
        )
        .setFooter({ text: 'System • Gift' }).setTimestamp()],
    });
  },
};