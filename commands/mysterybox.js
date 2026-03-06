const { EmbedBuilder } = require('discord.js');

const MYSTERY_BOX_KEY = 'Mystery Box';
const SILV_TOKEN_KEY = 'Silv token';

// Configure your role rewards here - add as many as you want
const ROLE_REWARDS = [
  { roleId: '1457075680746541273', weight: 5 },   // Lower weight = rarer
  // Add more roles here
];

// Reward types with their weights and ranges
const REWARD_TABLE = [
  { type: 'role', weight: 10 },                    // 10% chance
  { type: 'silv', weight: 30, min: 1, max: 3 },    // 30% chance, 1-3 tokens
  { type: 'prismatic', weight: 5, min: 1, max: 5 }, // 5% chance, 1-5 keys
  { type: 'legendary', weight: 55, min: 3, max: 10 }, // 55% chance, 3-10 keys
];

function getRandomReward() {
  const totalWeight = REWARD_TABLE.reduce((sum, reward) => sum + reward.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const reward of REWARD_TABLE) {
    random -= reward.weight;
    if (random <= 0) {
      return reward;
    }
  }
  
  return REWARD_TABLE[REWARD_TABLE.length - 1];
}

function getRandomRole() {
  const totalWeight = ROLE_REWARDS.reduce((sum, role) => sum + role.weight, 0);
  let random = Math.random() * totalWeight;
  
  for (const roleReward of ROLE_REWARDS) {
    random -= roleReward.weight;
    if (random <= 0) {
      return roleReward.roleId;
    }
  }
  
  return ROLE_REWARDS[ROLE_REWARDS.length - 1].roleId;
}

module.exports = {
  name: 'openmysterybox',
  description: 'Open a Mystery Box to get random rewards',
  async execute({ message, getUserData, saveUserData }) {
    const userId = message.author.id;
    const userData = await getUserData(userId);
    
    userData.inventory = userData.inventory || {};
    
    // Check if user has a Mystery Box
    const boxCount = userData.inventory[MYSTERY_BOX_KEY] || 0;
    
    if (boxCount < 1) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F5E6FF')
            .setTitle('✧˚₊‧ 📦 ℕ𝕠 𝕄𝕪𝕤𝕥𝕖𝕣𝕪 𝔹𝕠𝕩 ‧₊˚✧')
            .setDescription(
              [
                '꒰ঌ 𝔶𝔬𝔲 𝔡𝔬𝔫\'𝔱 𝔥𝔞𝔳𝔢 𝔞𝔫𝔶 𝔪𝔶𝔰𝔱𝔢𝔯𝔶 𝔟𝔬𝔵𝔢𝔰 ໒꒱',
                '',
                'You need a **Mystery Box** to open!',
              ].join('\n')
            )
            .setFooter({ text: 'System • Inventory Check' }),
        ],
      });
    }
    
    // Remove one Mystery Box
    userData.inventory[MYSTERY_BOX_KEY]--;
    if (userData.inventory[MYSTERY_BOX_KEY] === 0) {
      delete userData.inventory[MYSTERY_BOX_KEY];
    }
    
    // Get random reward
    const rewardType = getRandomReward();
    let rewardMessage = '';
    let rewardEmoji = '';
    
    if (rewardType.type === 'role') {
      // Role reward
      const roleId = getRandomRole();
      const role = message.guild.roles.cache.get(roleId);
      
      if (role) {
        try {
          // Check if member already has the role
          if (message.member.roles.cache.has(roleId)) {
            // Give 1 Silv token instead
            userData.inventory[SILV_TOKEN_KEY] = (userData.inventory[SILV_TOKEN_KEY] || 0) + 1;
            rewardEmoji = '✨';
            rewardMessage = `**1x Silv Token** (you already have the **${role.name}** role)`;
          } else {
            // Add the new role
            await message.member.roles.add(roleId);
            rewardEmoji = '👑';
            rewardMessage = `**${role.name}** role!`;
          }
        } catch (error) {
          console.error('Error adding role:', error);
          rewardEmoji = '❌';
          rewardMessage = `Failed to add role (permission error)`;
        }
      } else {
        rewardEmoji = '⚠️';
        rewardMessage = `Role not found (contact admin)`;
      }
      
    } else if (rewardType.type === 'silv') {
      // Silv tokens
      const amount = Math.floor(Math.random() * (rewardType.max - rewardType.min + 1)) + rewardType.min;
      userData.inventory[SILV_TOKEN_KEY] = (userData.inventory[SILV_TOKEN_KEY] || 0) + amount;
      rewardEmoji = '✨';
      rewardMessage = `**${amount}x Silv Token${amount > 1 ? 's' : ''}**!`;
      
    } else if (rewardType.type === 'prismatic') {
      // Prismatic keys
      const amount = Math.floor(Math.random() * (rewardType.max - rewardType.min + 1)) + rewardType.min;
      userData.inventory['Prismatic'] = (userData.inventory['Prismatic'] || 0) + amount;
      rewardEmoji = '🔮';
      rewardMessage = `**${amount}x Prismatic Key${amount > 1 ? 's' : ''}**!`;
      
    } else if (rewardType.type === 'legendary') {
      // Legendary keys
      const amount = Math.floor(Math.random() * (rewardType.max - rewardType.min + 1)) + rewardType.min;
      userData.inventory['Legendary'] = (userData.inventory['Legendary'] || 0) + amount;
      rewardEmoji = '🔑';
      rewardMessage = `**${amount}x Legendary Key${amount > 1 ? 's' : ''}**!`;
    }
    
    // Save user data
    await saveUserData({ 
      inventory: userData.inventory 
    });
    
    // Send reward message
    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#F5E6FF')
          .setTitle('✧˚₊‧ 📦 𝕄𝕪𝕤𝕥𝕖𝕣𝕪 𝔹𝕠𝕩 𝕆𝕡𝕖𝕟𝕖𝕕 ‧₊˚✧')
          .setDescription(
            [
              '꒰ঌ 𝔱𝔥𝔢 𝔟𝔬𝔵 𝔯𝔢𝔳𝔢𝔞𝔩𝔰 𝔦𝔱𝔰 𝔱𝔯𝔢𝔞𝔰𝔲𝔯𝔢 ໒꒱',
              '',
              `${rewardEmoji} You received: ${rewardMessage}`,
              '',
              `**Remaining Mystery Boxes:** ${userData.inventory[MYSTERY_BOX_KEY] || 0}`,
            ].join('\n')
          )
          .setFooter({ text: 'System • Mystery Box Opened' })
          .setTimestamp(),
      ],
    });
  },
};
