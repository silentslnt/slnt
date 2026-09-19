// utils/permissions.js
//
// Two tiers, mirroring Sentinel's is_guild_admin / is_whitelisted split:
//   isAdmin       — the real Discord admin role OR the trusted user list.
//                    Fine for routine admin panels (logs, toggles, hosting
//                    a minigame).
//   isWhitelisted — the trusted user list ONLY, role does not count. Use
//                    this for anything that creates currency/items from
//                    nothing or can grant roles (including the admin role
//                    itself) — a command that could otherwise be used to
//                    self-escalate should never trust "has this role"
//                    alone, since roles can be misconfigured or handed to
//                    someone who shouldn't have this level of trust.
const { ADMIN_ROLE_ID, ADMIN_USER_IDS } = require('./config');

function isAdmin(message) {
  const hasRole = message.member?.roles.cache.has(ADMIN_ROLE_ID);
  const isUser  = ADMIN_USER_IDS.includes(message.author.id);
  return hasRole || isUser;
}

function isWhitelisted(message) {
  return ADMIN_USER_IDS.includes(message.author.id);
}

async function _deny(message, text) {
  const { EmbedBuilder } = require('discord.js');
  await message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor('#F5E6FF')
        .setTitle('˗ˏˋ 𐙚 𝔸𝕔𝕔𝕖𝕤𝕤 𝔻𝕖𝕟𝕚𝕖𝕕 𐙚 ˎˊ˗')
        .setDescription(text)
        .setFooter({ text: 'System • Permission Check' }),
    ],
  });
  return false;
}

/**
 * Sends a styled "admin only" denial and returns false.
 * Returns true if the user IS admin (so you can guard with: if (!await requireAdmin(msg)) return;)
 */
async function requireAdmin(message) {
  if (isAdmin(message)) return true;
  return _deny(message, '꒰ঌ This command is reserved for admins only ໒꒱');
}

/**
 * Stricter than requireAdmin — trusted user list only, role does not count.
 * Use for currency/item creation and anything that can grant roles.
 */
async function requireWhitelisted(message) {
  if (isWhitelisted(message)) return true;
  return _deny(message, '꒰ঌ This command is reserved for the owner-level whitelist only ໒꒱');
}

module.exports = { isAdmin, requireAdmin, isWhitelisted, requireWhitelisted };