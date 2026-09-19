// commands/bal.js
const { EmbedBuilder } = require('discord.js');
const { COLOR } = require('../utils/config');
const { xpProgress, progressBar, levelFromXP } = require('../utils/xp');
const { getRank, getNextRank } = require('../utils/prestige');

module.exports = {
  name: 'bal',
  aliases: ['balance', 'b', 'coins'],
  adminOnly: false,
  description: 'Check balance. `.bal [@user]`',

  async execute({ message, userData, getUserData }) {
    const target = message.mentions.users.first() || message.author;
    let data = userData;
    if (target.id !== message.author.id) {
      data = await getUserData(target.id);
      if (!data) return message.channel.send('❌ No data for that user.');
    }

    const balance = data.balance || 0;
    const silv    = data.inventory?.['Silv token'] || 0;
    const { level, current, needed } = xpProgress(data.xp || 0);
    const xpBar   = progressBar(current, needed, 8);
    const rank    = getRank(data.totalEarned || 0);

    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('˗ˏˋ 𐙚 💰 ℬ𝒶𝓁𝒶𝓃𝒸𝑒 𐙚 ˎˊ˗')
          .setColor(COLOR.DEFAULT)
          .setThumbnail(target.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: '💰 Coins',         value: `**${balance.toLocaleString()}**`,               inline: true },
            { name: '💎 SILV',           value: `**${silv}** _(= ${silv * 10} Robux value)_`,   inline: true },
            { name: '📈 Level',          value: `**${level}**`,                                  inline: true },
            { name: '⭐ Rank',           value: rank.name,                                        inline: true },
            { name: '🔥 Streak',         value: `${data.dailyStreak || 0} days`,                inline: true },
            { name: '🏦 Total Earned',   value: `${(data.totalEarned||0).toLocaleString()}`,    inline: true },
            { name: `📈 XP Progress (Lv ${level})`, value: `${xpBar} ${current}/${needed}`,    inline: false },
          )
          .setFooter({ text: 'System • Balance' })
          .setTimestamp(),
      ],
    });
  },
};