const { EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../utils/permissions');
const { getGameChannelId, setGameChannelId } = require('../utils/gameChannel');

module.exports = {
  name: 'gamechannel',
  aliases: ['game', 'gamech', 'gc'],
  description: 'View or set the shared minigame channel (hangman, word scramble, guess). Admin only.',
  async execute({ message, args }) {
    if ((args[0] || '').toLowerCase() === 'channel') args = args.slice(1);   // `.game channel #x` works too
    const channel = message.mentions.channels.first()
      || (args[0] && message.guild.channels.cache.get(args[0].replace(/[<#>]/g, '')));

    if (!channel) {
      return message.channel.send({
        embeds: [new EmbedBuilder()
          .setColor(0x000000)
          .setTitle('GAME CHANNEL')
          .setDescription(
            `> Usage: \`.gamechannel #channel\`\n\n` +
            `-# Current: <#${getGameChannelId()}> — used by hangman, word scramble, and guess.`
          )],
      });
    }

    if (!isAdmin(message)) {
      return message.channel.send({
        embeds: [new EmbedBuilder().setColor(0x000000).setTitle('ACCESS DENIED')
          .setDescription('> Only admins can change the game channel.')],
      });
    }

    await setGameChannelId(channel.id);
    return message.channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x000000)
        .setTitle('GAME CHANNEL UPDATED')
        .setDescription(`> Hangman, word scramble, and guess will now use ${channel}.`)],
    });
  },
};
