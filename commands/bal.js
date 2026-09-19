// commands/bal.js
const { EmbedBuilder } = require('discord.js');
const { xpProgress, progressBar } = require('../utils/xp');
const { getRank } = require('../utils/prestige');

const SILV_ICON  = '<:SILV_TOKEN:1447678878448484555>';
const WHITESWIRL = '<a:cwhiteswirl:1512869492492079184>';
const CSTAR      = '<a:cstar:1545032606603812954>';
const BLACK      = 0x000000;

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
      if (!data) return message.channel.send('No data for that user.');
    }

    const balance = data.balance || 0;
    const silv    = data.inventory?.['Silv token'] || 0;
    const { level, current, needed } = xpProgress(data.xp || 0);
    const xpBar   = progressBar(current, needed, 8);
    const rank    = getRank(data.totalEarned || 0);

    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('BALANCE')
          .setColor(BLACK)
          .setThumbnail(target.displayAvatarURL({ dynamic: true }))
          .setDescription(
            `> **${target.username}**\n\n` +
            `> Coins: **${balance.toLocaleString()}**\n` +
            `> ${SILV_ICON} SILV: **${silv}** *(= ${silv * 10} Robux)*\n` +
            `> ${CSTAR} Level **${level}** · ${WHITESWIRL} Rank **${rank.name}**\n` +
            `> Streak: **${data.dailyStreak || 0}** days · Total earned: **${(data.totalEarned || 0).toLocaleString()}**\n\n` +
            `__**XP Progress**__ *(Lv ${level})*\n` +
            `> ${xpBar} ${current}/${needed}`
          )
          .setFooter({ text: message.guild?.name || 'Shiro' }),
      ],
    });
  },
};