const { EmbedBuilder } = require('discord.js');
const { trackStat, checkAchievements } = require('../utils/achievements');

const validRarities = [
  'Prismatic', 'Mythical', 'Legendary', 'Rare', 'Uncommon', 'Common'
];

// Per‑rarity reward ranges
const rarityRewards = {
  Prismatic: { min: 800, max: 2000 },
  Mythical:  { min: 500, max: 1500 },
  Legendary: { min: 300, max: 1000 },
  Rare:      { min: 150, max: 600 },
  Uncommon:  { min: 75,  max: 300 },
  Common:    { min: 25,  max: 150 }
};

// Helper: Converts any input to ProperCase for standardized key names
function toProperCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

module.exports = {
  name: 'open',
  description: 'Open one or more keys of the given rarity to receive prizes.',
  async execute({ message, args, userData, saveUserData }) {
    try {
      const rarityArg = args[0];
      if (!rarityArg) {
        return message.channel.send('Please specify a key rarity to open (e.g. `.open Rare`).');
      }
      const rarityKey = toProperCase(rarityArg);

      if (!validRarities.includes(rarityKey)) {
        return message.channel.send('Invalid key rarity specified.');
      }

      let amount = parseInt(args[1]);
      if (isNaN(amount) || amount <= 0) amount = 1;

      // Initialize inventory if needed
      userData.inventory = userData.inventory || {};
      const currentAmount = userData.inventory[rarityKey] || 0;

      if (currentAmount < amount) {
        return message.channel.send(
          `You do not have enough **${rarityKey}** keys to open (**${amount}** requested, you have **${currentAmount}**).`
        );
      }

      // Get rarity-based reward range
      const { min, max } = rarityRewards[rarityKey] || { min: 10, max: 100 };

      // Calculate total reward from ALL keys (cap EACH key at 2000)
      let totalReward = 0;
      for (let i = 0; i < amount; i++) {
        let roll = Math.floor(Math.random() * (max - min + 1)) + min;
        if (roll > 2000) roll = 2000;
        totalReward += roll;
      }

      // Remove keys from inventory
      userData.inventory[rarityKey] = currentAmount - amount;

      // Clean up if zero
      if (userData.inventory[rarityKey] === 0) {
        delete userData.inventory[rarityKey];
      }

      // Add total reward to balance
      userData.balance = (userData.balance || 0) + totalReward;

      // Save BOTH inventory AND balance
      await saveUserData({
        inventory: userData.inventory,
        balance: userData.balance
      });

      // 'Open 3 keys' mission/achievement was permanently stuck at 0 — this
      // stat was declared in the schema and referenced by the mission pool
      // and keys_opened_50 achievement, but nothing ever actually
      // incremented it. Track real keys opened, not just successful casts.
      await trackStat(userData, 'keysOpened', amount);
      await saveUserData({ stats: userData.stats });
      await checkAchievements(userData, { message, saveUserData });

      const embed = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle('KEYS OPENED')
        .setDescription(
          `> Opened **${amount} ${rarityKey}** key${amount > 1 ? 's' : ''}.\n` +
          `> Reward: **${totalReward.toLocaleString()}** coins\n\n` +
          `> Keys remaining: **${userData.inventory[rarityKey] || 0}**\n` +
          `> New balance: **${userData.balance.toLocaleString()}** coins`
        )
        .setFooter({ text: message.guild?.name || 'Shiro' });

      await message.channel.send({ embeds: [embed] });

    } catch (error) {
      console.error('Error in open command:', error);
      message.channel.send('Something went wrong while opening your key(s).');
    }
  }
};
