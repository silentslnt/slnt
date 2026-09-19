const { EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../utils/permissions');

module.exports = {
  name: 'prefix',
  description: 'Change the bot prefix (admin only). Usage: .prefix <new prefix>',
  async execute({ message, args, prefix, setPrefix }) {
    if (!isAdmin(message)) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F5E6FF')
            .setTitle('˗ˏˋ 𐙚 𝔸𝕔𝕔𝕖𝕤𝕤 𝔻𝕖𝕟𝕚𝕖𝕕 𐙚 ˎˊ˗')
            .setDescription('꒰ঌ 𝔒𝔫𝔩𝔶 𝔞𝔡𝔪𝔦𝔫𝔰 𝔠𝔞𝔫 𝔠𝔥𝔞𝔫𝔤𝔢 𝔱𝔥𝔢 𝔭𝔯𝔢𝔣𝔦𝔵 ໒꒱')
            .setFooter({ text: 'System • Permission Check' }),
        ],
      });
    }

    const newPrefix = args[0];

    if (!newPrefix) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F5E6FF')
            .setTitle('✧˚₊‧ 𝕀𝕟𝕧𝕒𝕝𝕚𝕕 𝕌𝕤𝕒𝕘𝕖 ‧₊˚✧')
            .setDescription(`Current prefix: \`${prefix}\`\n\nUsage: \`${prefix}prefix <new prefix>\`\nExample: \`${prefix}prefix ,\``)
            .setFooter({ text: 'System • Prefix Help' }),
        ],
      });
    }

    if (newPrefix.length > 3) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F5E6FF')
            .setTitle('✧˚₊‧ 𝕀𝕟𝕧𝕒𝕝𝕚𝕕 ℙ𝕣𝕖𝕗𝕚𝕩 ‧₊˚✧')
            .setDescription('Prefix must be 3 characters or fewer.')
            .setFooter({ text: 'System • Validation' }),
        ],
      });
    }

    await setPrefix(newPrefix);

    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#C1FFD7')
          .setTitle('˗ˏˋ 𐙚 ℙ𝕣𝕖𝕗𝕚𝕩 𝕌𝕡𝕕𝕒𝕥𝕖𝕕 𐙚 ˎˊ˗')
          .setDescription(
            [
              `꒰ঌ 𝔗𝔥𝔢 𝔭𝔯𝔢𝔣𝔦𝔵 𝔥𝔞𝔰 𝔟𝔢𝔢𝔫 𝔠𝔥𝔞𝔫𝔤𝔢𝔡 ໒꒱`,
              '',
              `New prefix: \`${newPrefix}\``,
              `Example: \`${newPrefix}help\``,
            ].join('\n'),
          )
          .setFooter({ text: `System • Changed by ${message.author.username}` }),
      ],
    });
  },
};
