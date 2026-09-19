// utils/xp.js
const { XP_LEVEL_BASE, XP_LEVEL_SCALE, COLOR } = require('./config');
const { getMultiplier } = require('./essences');

/** XP needed to go from level N to N+1 */
function xpForLevel(level) {
  return Math.floor(XP_LEVEL_BASE * Math.pow(XP_LEVEL_SCALE, level - 1));
}

/** Total XP needed to reach a given level from 0 */
function totalXpForLevel(level) {
  let total = 0;
  for (let i = 1; i < level; i++) total += xpForLevel(i);
  return total;
}

/** Compute level from raw XP */
function levelFromXP(xp) {
  let level = 1;
  let spent = 0;
  while (true) {
    const needed = xpForLevel(level);
    if (spent + needed > xp) break;
    spent += needed;
    level++;
  }
  return level;
}

/** XP progress within current level */
function xpProgress(xp) {
  const level     = levelFromXP(xp);
  const levelStart = totalXpForLevel(level);
  const levelEnd   = levelStart + xpForLevel(level);
  return { level, current: xp - levelStart, needed: levelEnd - levelStart };
}

/** ASCII progress bar */
function progressBar(current, total, length = 10) {
  const filled = Math.round((current / total) * length);
  return '▓'.repeat(filled) + '░'.repeat(length - filled);
}

/**
 * Add XP to a user, handle level-ups, and save.
 * @param {string}   userId
 * @param {number}   baseXP   - XP before essence multiplier
 * @param {Object}   userData - mutable user doc
 * @param {Function} saveUserData
 * @param {Object}   message  - discord.js Message (for level-up announcement)
 * @returns {Promise<{ leveledUp: boolean, newLevel: number }>}
 */
async function addXP(userId, baseXP, userData, saveUserData, message = null) {
  const multiplier = getMultiplier(userData, 'xp');
  const gained     = Math.floor(baseXP * multiplier);

  const oldLevel  = levelFromXP(userData.xp || 0);
  userData.xp     = (userData.xp || 0) + gained;
  const newLevel  = levelFromXP(userData.xp);

  await saveUserData({ xp: userData.xp });

  const leveledUp = newLevel > oldLevel;
  if (leveledUp && message) {
    const { EmbedBuilder } = require('discord.js');
    await message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.PRESTIGE)
          .setTitle('˗ˏˋ 𐙚 ⬆ 𝕃𝕖𝕧𝕖𝕝 𝕌𝕡! 𐙚 ˎˊ˗')
          .setDescription(
            `${message.author} ascended to **Level ${newLevel}**!\n\n` +
            `꒰ঌ The celestial archives record your growth ໒꒱`
          )
          .setFooter({ text: 'System • XP Panel' }),
      ],
    }).catch(() => {});
  }

  return { leveledUp, newLevel, gained };
}

module.exports = { levelFromXP, xpProgress, progressBar, addXP, xpForLevel };