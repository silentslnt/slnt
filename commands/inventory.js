const { EmbedBuilder } = require('discord.js');
const { trackStat, checkAchievements } = require('../utils/achievements');

// Map item names to emojis
const itemEmojis = {
  'silv token': '<:zzsilvtoken:1486364646796431427>',
  'common': '⚪',
  'uncommon': '🟢',
  'rare': '🔵',
  'legendary': '🟡',
  'mythical': '🟣',
  'prismatic': '🌈',
};

module.exports = {
  name:'inventory',
  description: 'Check your inventory',
  async execute({ message, userData, saveUserData }) {
    const inventory = userData.inventory || {};

    // 'Check your inventory' mission was permanently stuck at 0 — this
    // command never tracked the invChecked stat at all despite it being
    // declared in the schema and referenced by the mission pool.
    await trackStat(userData, 'invChecked', 1);
    await saveUserData({ stats: userData.stats });
    await checkAchievements(userData, { message, saveUserData });

    if (Object.keys(inventory).length === 0) {
      return message.channel.send('Your inventory is empty.');
    }

    // Format inventory items with emojis
    const formattedItems = Object.entries(inventory)
      .filter(([item, count]) => count > 0)
      .map(([item, count]) => {
        let displayName = item;

        // Normalize key names
        if (
          item.toLowerCase().includes('key') ||
          ['common', 'uncommon', 'rare', 'legendary', 'mythical', 'prismatic'].includes(
            item.toLowerCase()
          )
        ) {
          const rarityName = item.replace(/\s*key\s*/gi, '').trim();
          const capitalized =
            rarityName.charAt(0).toUpperCase() + rarityName.slice(1).toLowerCase();
          displayName = `${capitalized} key`;
        }

        // Normalize token names
        if (item.toLowerCase().includes('token')) {
          const tokenType = item.replace(/\s*token\s*/gi, '').trim();
          const capitalized =
            tokenType.charAt(0).toUpperCase() + tokenType.slice(1).toLowerCase();
          displayName = `${capitalized} token`;
        }

        // Get emoji for this item
        const emoji = itemEmojis[displayName.toLowerCase()] || '📦';

        return `${emoji} **${displayName}**: ${count}`;
      })
      .join('\n');

    const lines = formattedItems
      ? formattedItems.split('\n').map(l => `> ${l}`).join('\n')
      : '> Your inventory is empty.';

    const inventoryEmbed = new EmbedBuilder()
      .setTitle(`${message.author.username.toUpperCase()}'S INVENTORY`)
      .setDescription(`__**Items**__\n${lines}`)
      .setColor(0x000000)
      .setFooter({ text: message.guild?.name || 'Shiro' });

    message.channel.send({ embeds: [inventoryEmbed] });
  },
};
