const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'characters',
  description: 'View your character collection',
  async execute({ message, userData }) {
    const chars = userData.characters || [];

    if (chars.length === 0) {
      return message.channel.send("You don't have any characters yet! Use `.roll` to get one.");
    }

    const uniqueChars = [];
    const seen = new Set();

    for (const char of chars) {
      const key = `${char.name}-${char.tier}`;
      if (!seen.has(key)) {
        seen.add(key);
        uniqueChars.push(char);
      }
    }

    const grouped = {};
    for (const char of uniqueChars) {
      if (!grouped[char.tier]) grouped[char.tier] = [];
      grouped[char.tier].push(char.name);
    }

    let description = '';
    for (const tier of ['S+', 'S', 'A', 'B', 'C', 'D']) {
      if (grouped[tier]) {
        description += `\n__**${tier} Tier**__\n> ${grouped[tier].join(', ')}\n`;
      }
    }

    const embed = new EmbedBuilder()
      .setTitle(`${message.author.username.toUpperCase()}'S CHARACTER COLLECTION`)
      .setDescription(description || '> No characters found. Use `.roll` to get one.')
      .setColor(0x000000)
      .setFooter({ text: `${uniqueChars.length} unique characters · ${chars.length} total pulls` });

    return message.channel.send({ embeds: [embed] });
  }
};
