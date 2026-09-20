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
            .setColor(0x000000)
            .setTitle('ACCESS DENIED')
            .setDescription('> Only admins can change the prefix.')
            .setFooter({ text: message.guild?.name || 'Shiro' }),
        ],
      });
    }

    const newPrefix = args[0];

    if (!newPrefix) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('PREFIX')
            .setDescription(
              `> Current prefix: \`${prefix}\`\n\n` +
              `> Usage: \`${prefix}prefix <new prefix>\`\n` +
              `> Example: \`${prefix}prefix ,\``
            )
            .setFooter({ text: message.guild?.name || 'Shiro' }),
        ],
      });
    }

    if (newPrefix.length > 3) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('INVALID PREFIX')
            .setDescription('> Prefix must be 3 characters or fewer.')
            .setFooter({ text: message.guild?.name || 'Shiro' }),
        ],
      });
    }

    await setPrefix(newPrefix);

    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x000000)
          .setTitle('PREFIX UPDATED')
          .setDescription(
            `> New prefix: \`${newPrefix}\`\n` +
            `> Example: \`${newPrefix}help\``
          )
          .setFooter({ text: `Changed by ${message.author.username}` }),
      ],
    });
  },
};
