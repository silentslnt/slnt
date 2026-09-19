// commands/achievements.js
const { EmbedBuilder } = require('discord.js');
const { ACHIEVEMENTS, COLOR } = require('../utils/config');

module.exports = {
  name: 'achievements',
  aliases: ['ach', 'achs'],
  adminOnly: false,
  description: 'View your unlocked achievements. `.achievements`',

  async execute({ message, userData }) {
    const earned = new Set(userData.achievements || []);

    const lines = ACHIEVEMENTS.map(ach =>
      earned.has(ach.id)
        ? `✅ **${ach.name}** — _${ach.desc}_`
        : `🔒 ${ach.name} — _${ach.desc}_`
    );

    const embed = new EmbedBuilder()
      .setColor(COLOR.PRESTIGE)
      .setTitle('˗ˏˋ 𐙚 🏆 𝔸𝕔𝕙𝕚𝕖𝕧𝕖𝕞𝕖𝕟𝕥𝕤 𐙚 ˎˊ˗')
      .setDescription(
        `꒰ঌ **${earned.size}/${ACHIEVEMENTS.length}** unlocked ໒꒱\n\n` +
        lines.join('\n')
      )
      .setFooter({ text: 'System • Achievements' })
      .setTimestamp();

    return message.channel.send({ embeds: [embed] });
  },
};
