// commands/keydrop.js
const { EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../utils/permissions');

const KEYDROP_CHANNEL_ID = '1472342562093404324';

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
function canManageKeydrop(message) {
  return isAdmin(message);
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
          .setColor(0x000000)
          .setTitle('KEY EXPIRED')
          .setDescription(`> The **${currentKey.rarity}** key expired.`);
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
      .setColor(0x000000)
      .setTitle('KEY DROPPED')
      .setDescription(`> A **${rarityName}** key dropped! Type \`.redeem\` to claim it.`);

    await message.channel.send({ embeds: [dropEmbed] });
  }
}

// Command to set keydrop channel
async function setKeydropChannel(message, args) {
  if (!canManageKeydrop(message)) {
    return message.channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x000000)
        .setTitle('ACCESS DENIED')
        .setDescription('> You need the admin role or be whitelisted to change keydrop settings.')],
    });
  }

  const channelId = args[0];

  if (!channelId) {
    return message.channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x000000)
        .setTitle('SETCHANNEL — USAGE')
        .setDescription(
          `> Usage: \`.setchannel <channel_id>\`\n` +
          `> Example: \`.setchannel 1401925188991582338\`\n\n` +
          `-# Current keydrop channel: <#${activeKeydropChannel}>`
        )],
    });
  }

  const channel = message.client.channels.cache.get(channelId);
  if (!channel) {
    return message.channel.send({
      embeds: [new EmbedBuilder()
        .setColor(0x000000)
        .setTitle('CHANNEL NOT FOUND')
        .setDescription(`> Channel with ID ${channelId} not found — check the ID.`)],
    });
  }

  const oldChannelId = activeKeydropChannel;
  activeKeydropChannel = channelId;

  return message.channel.send({
    embeds: [new EmbedBuilder()
      .setColor(0x000000)
      .setTitle('KEYDROP CHANNEL UPDATED')
      .setDescription(
        `> Previous channel: <#${oldChannelId}>\n` +
        `> New channel: <#${activeKeydropChannel}>\n\n` +
        `-# Keys will now drop in the new channel.`
      )],
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
      .setColor(0x000000)
      .setTitle('KEY SPAWNED BY ADMIN')
      .setDescription(`> An **${rarity}** key has been spawned! Type \`.redeem\` to claim it.`);

    await channel.send({ embeds: [dropEmbed] });
  }

  return { success: true, message: `Spawned **${rarity}** key in <#${channelId}>` };
}

// Used by claim.js: keydrop.claimKey(message.author.id, addKeyToInventory, client)
async function claimKey(userId, addKeyToInventory, client) {
  if (!currentKey || currentKey.claimed) return false;

  // Claim the key synchronously before the first await so two concurrent
  // .redeem calls can't both pass the check above and both get the key.
  currentKey.claimed = true;
  await addKeyToInventory(userId, currentKey.rarity, 1);

  const channel = client.channels.cache.get(currentKey.channelId);
  if (channel) {
    const claimEmbed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle('KEY CLAIMED')
      .setDescription(`> <@${userId}> claimed the **${currentKey.rarity}** key.`);

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
