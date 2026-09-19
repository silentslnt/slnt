// commands/achievements.js
const { EmbedBuilder } = require('discord.js');
const { ACHIEVEMENTS } = require('../utils/config');

const CHECK = '<:check:1547659779877642360>';
const BLACK = 0x000000;

module.exports = {
  name: 'achievements',
  aliases: ['ach', 'achs'],
  adminOnly: false,
  description: 'View your unlocked achievements. `.achievements`',

  async execute({ message, userData }) {
    const earned = new Set(userData.achievements || []);

    const lines = ACHIEVEMENTS.map(ach =>
      earned.has(ach.id)
        ? `> ${CHECK} **${ach.name}** — ${ach.desc}`
        : `> ${ach.name} — ${ach.desc}`
    );

    const embed = new EmbedBuilder()
      .setColor(BLACK)
      .setTitle('ACHIEVEMENTS')
      .setDescription(
        `-# ${earned.size}/${ACHIEVEMENTS.length} unlocked\n\n` +
        lines.join('\n')
      )
      .setFooter({ text: message.guild?.name || 'Shiro' });

    return message.channel.send({ embeds: [embed] });
  },
};
