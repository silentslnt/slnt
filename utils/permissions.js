// utils/permissions.js
const { ADMIN_ROLE_ID, ADMIN_USER_IDS } = require('./config');

/**
 * Returns true if the message author has admin privileges.
 */
function isAdmin(message) {
  const hasRole = message.member?.roles.cache.has(ADMIN_ROLE_ID);
  const isUser  = ADMIN_USER_IDS.includes(message.author.id);
  return hasRole || isUser;
}

/**
 * Sends a styled "admin only" denial and returns false.
 * Returns true if the user IS admin (so you can guard with: if (!await requireAdmin(msg)) return;)
 */
async function requireAdmin(message) {
  if (isAdmin(message)) return true;
  const { EmbedBuilder } = require('discord.js');
  await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor('#F5E6FF')
        .setTitle('˗ˏˋ 𐙚 𝔸𝕔𝕔𝕖𝕤𝕤 𝔻𝕖𝕟𝕚𝕖𝕕 𐙚 ˎˊ˗')
        .setDescription('꒰ঌ This command is reserved for admins only ໒꒱')
        .setFooter({ text: 'System • Permission Check' }),
    ],
  });
  return false;
}

module.exports = { isAdmin, requireAdmin };