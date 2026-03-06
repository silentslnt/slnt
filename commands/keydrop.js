// commands/keydrop.js
const { EmbedBuilder } = require('discord.js');

const KEYDROP_CHANNEL_ID = '1472342562093404324';

// Admin role and user IDs for keydrop channel control
const KEYDROP_ADMIN_ROLE_ID = '1471310720866975917';
const KEYDROP_ADMIN_USER_IDS = [
  '1432513881653121047','730860363884527646'
];

let currentKey = null;
let activeKeydropChannel = KEYDROP_CHANNEL_ID;
let keydropsEnabled = true; // Toggle for automatic keydrops

// Rarity chances are *within* the overall drop rate
const rarities = [
  { name: 'Prismatic', chance: 0.0001 },
  { name: 'Mythical',  chance: 0.001 },
  { name: 'Legendary', chance: 0.01  },
  { name: 'Rare',      chance: 0.03  },
  { name: 'Uncommon',  chance: 0.05  },
  { name: 'Common',    chance: 0.10  },
];

function getRandomRarity() {
  const roll = Math.random();
  let cumulative = 0;
  for (const rarity of rarities) {
    cumulative += rarity.chance;
    if (roll <= cumulative) return rarity.name;
  }
  return rarities[rarities.length - 1].name;
}

// Check if user can manage keydrop settings
function canManageKeydrop(member) {
  const hasRole = member.roles.cache.has(KEYDROP_ADMIN_ROLE_ID);
  const isWhitelisted = KEYDROP_ADMIN_USER_IDS.includes(member.id);
  return hasRole || isWhitelisted;
}

function areKeydropsEnabled() {
  return keydropsEnabled;
}

function setKeydropsEnabled(state) {
  keydropsEnabled = state;
}

async function handleKeyDrop(message, client) {
  if (message.author.bot) return;

  // Only drop in the active keydrop channel
  if (message.channel.id !== activeKeydropChannel) return;

  // Check if keydrops are enabled
  if (!keydropsEnabled) return;

  // Chance to expire an existing unclaimed key
  if (currentKey && !currentKey.claimed) {
    if (Math.random() <= 0.03) {
      const channel = client.channels.cache.get(currentKey.channelId);
      if (channel) {
        const expireEmbed = new EmbedBuilder()
          .setTitle('✧˚₊‧ 🔒 𝕂𝕖𝕪 𝔼𝕩𝕡𝕚𝕣𝕖𝕕 ‧₊˚✧')
          .setDescription(`The **${currentKey.rarity}** key expired.`)
          .setColor('#F5E6FF')
          .setFooter({ text: 'System • Keydrop Control' })
          .setTimestamp();
        await channel.send({ embeds: [expireEmbed] });
      }
      currentKey = null;
    }
  }

  // 2.5% chance per message to spawn a new key if none active
  if (!currentKey && Math.random() <= 0.025) {
    const rarityName = getRandomRarity();

    currentKey = {
      rarity: rarityName,
      channelId: message.channel.id,
      claimed: false,
      spawnedBy: 'auto',
    };

    const dropEmbed = new EmbedBuilder()
      .setTitle('✧˚₊‧ 🔑 𝕂𝕖𝕪 𝔻𝕣𝕠𝕡𝕡𝕖𝕕 ‧₊˚✧')
      .setDescription(
        [
          '˗ˏˋ 𐙚 𝔞 𝔠𝔢𝔩𝔢𝔰𝔱𝔦𝔞𝔩 𝔨𝔢𝔶 𝔣𝔞𝔩𝔩𝔰 𝔣𝔯𝔬𝔪 𝔱𝔥𝔢 𝔰𝔨𝔶 𐙚 ˎˊ˗',
          '',
          `A **${rarityName}** key dropped! Type \`.redeem\` to claim it!`
        ].join('\n')
      )
      .setColor('#F5E6FF')
      .setFooter({ text: 'System • Keydrop Control' })
      .setTimestamp();

    await message.channel.send({ embeds: [dropEmbed] });
  }
}

// Command to set keydrop channel
async function setKeydropChannel(message, args) {
  const member = message.member;

  if (!canManageKeydrop(member)) {
    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#F5E6FF')
          .setTitle('˗ˏˋ 𐙚 𝔸𝕔𝕔𝕖𝕤𝕤 𝔻𝕖𝕟𝕚𝕖𝕕 𐙚 ˎˊ˗')
          .setDescription(
            [
              '꒰ঌ 𝔒𝔫𝔩𝔶 𝔞𝔡𝔪𝔦𝔫𝔰 𝔠𝔞𝔫 𝔠𝔥𝔞𝔫𝔤𝔢 𝔨𝔢𝔶𝔡𝔯𝔬𝔭 𝔰𝔢𝔱𝔱𝔦𝔫𝔤𝔰 ໒꒱',
              '',
              'You need the admin role or be whitelisted.',
            ].join('\n')
          )
          .setFooter({ text: 'System • Permission Check' }),
      ],
    });
  }

  const channelId = args[0];

  if (!channelId) {
    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#F5E6FF')
          .setTitle('✧˚₊‧ 𝕀𝕟𝕧𝕒𝕝𝕚𝕕 𝕌𝕤𝕒𝕘𝕖 ‧₊˚✧')
          .setDescription(
            [
              'Usage: `.setchannel <channel_id>`',
              '',
              'Example: `.setchannel 1401925188991582338`',
              '',
              `**Current keydrop channel:** <#${activeKeydropChannel}>`,
            ].join('\n')
          )
          .setFooter({ text: 'System • Usage Hint' }),
      ],
    });
  }

  const channel = message.client.channels.cache.get(channelId);
  if (!channel) {
    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#F5E6FF')
          .setTitle('✧˚₊‧ ℂ𝕙𝕒𝕟𝕟𝕖𝕝 ℕ𝕠𝕥 𝔽𝕠𝕦𝕟𝕕 ‧₊˚✧')
          .setDescription(
            `Channel with ID ${channelId} not found. Make sure the ID is correct.`
          )
          .setFooter({ text: 'System • Channel Check' }),
      ],
    });
  }

  const oldChannelId = activeKeydropChannel;
  activeKeydropChannel = channelId;

  return message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor('#F5E6FF')
        .setTitle('✧˚₊‧ 🔑 𝕂𝕖𝕪𝕕𝕣𝕠𝕡 ℂ𝕙𝕒𝕟𝕟𝕖𝕝 𝕌𝕡𝕕𝕒𝕥𝕖𝕕 ‧₊˚✧')
        .setDescription(
          [
            '꒰ঌ 𝔱𝔥𝔢 𝔠𝔢𝔩𝔢𝔰𝔱𝔦𝔞𝔩 𝔭𝔞𝔱𝔥 𝔥𝔞𝔰 𝔟𝔢𝔢𝔫 𝔯𝔢𝔡𝔦𝔯𝔢𝔠𝔱𝔢𝔡 ໒꒱',
            '',
            `**Previous channel:** <#${oldChannelId}>`,
            `**New channel:** <#${activeKeydropChannel}>`,
            '',
            'Keys will now drop in the new channel.',
          ].join('\n')
        )
        .setFooter({ text: 'System • Keydrop Control' })
        .setTimestamp(),
    ],
  });
}

// Used by admin.js: keydrop.spawnKey(rarityKey, channelId, message.client)
async function spawnKey(rarity, channelId, client) {
  if (currentKey && !currentKey.claimed) {
    return {
      success: false,
      message: 'There is already an active key. Wait until it is claimed or expires.',
    };
  }

  currentKey = { rarity, channelId, claimed: false, spawnedBy: 'admin' };

  const channel = client.channels.cache.get(channelId);
  if (channel) {
    const dropEmbed = new EmbedBuilder()
      .setTitle('✧˚₊‧ 🔑 𝕂𝕖𝕪 𝕊𝕡𝕒𝕨𝕟𝕖𝕕 𝕓𝕪 𝔸𝕕𝕞𝕚𝕟 ‧₊˚✧')
      .setDescription(
        [
          '꒰ঌ 𝔞 𝔰𝔥𝔦𝔫𝔦𝔫𝔤 𝔨𝔢𝔶 𝔥𝔞𝔰 𝔟𝔢𝔢𝔫 𝔠𝔞𝔩𝔩𝔢𝔡 𝔡𝔬𝔴𝔫 ໒꒱',
          '',
          `An **${rarity}** key has been spawned! Type \`.redeem\` to claim it!`
        ].join('\n')
      )
      .setColor('#F5E6FF')
      .setFooter({ text: 'System • Keydrop Control' })
      .setTimestamp();

    await channel.send({ embeds: [dropEmbed] });
  }

  return { success: true, message: `Spawned **${rarity}** key in <#${channelId}>` };
}

// Used by claim.js: keydrop.claimKey(message.author.id, addKeyToInventory, client)
async function claimKey(userId, addKeyToInventory, client) {
  if (!currentKey || currentKey.claimed) return false;

  await addKeyToInventory(userId, currentKey.rarity, 1);
  currentKey.claimed = true;

  const channel = client.channels.cache.get(currentKey.channelId);
  if (channel) {
    const claimEmbed = new EmbedBuilder()
      .setTitle('✧˚₊‧ 🔑 𝕂𝕖𝕪 ℂ𝕝𝕒𝕚𝕞𝕖𝕕 ‧₊˚✧')
      .setDescription(
        [
          `<@${userId}> claimed the **${currentKey.rarity}** key!`,
          '',
          'ෆ 𝔱𝔥𝔢 𝔟𝔩𝔢𝔰𝔰𝔦𝔫𝔤 𝔥𝔞𝔰 𝔟𝔢𝔢𝔫 𝔯𝔢𝔠𝔢𝔦𝔳𝔢𝔡 ෆ'
        ].join('\n')
      )
      .setColor('#F5E6FF')
      .setFooter({ text: 'System • Keydrop Control' })
      .setTimestamp();

    await channel.send({ embeds: [claimEmbed] });
  }

  currentKey = null;
  return true;
}

function getCurrentKey() {
  return currentKey;
}

function getActiveChannel() {
  return activeKeydropChannel;
}

module.exports = {
  handleKeyDrop,
  spawnKey,
  claimKey,
  getCurrentKey,
  getRandomRarity,
  rarities,
  setKeydropChannel,
  canManageKeydrop,
  getActiveChannel,
  areKeydropsEnabled,
  setKeydropsEnabled,
};
