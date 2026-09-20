// utils/achievements.js
const { ACHIEVEMENTS, COLOR } = require('./config');
const { syncMissionProgress } = require('./missions');

/**
 * Check and award any newly earned achievements.
 * Sends a channel message for each new achievement.
 *
 * @param {Object}   userData     - mutable user document
 * @param {Object}   context      - { message, saveUserData }
 * @returns {Promise<string[]>}   - array of newly awarded achievement IDs
 */
async function checkAchievements(userData, { message, saveUserData }) {
  userData.achievements = userData.achievements || [];
  userData.stats        = userData.stats        || {};
  userData.inventory    = userData.inventory    || {};

  const earned     = new Set(userData.achievements);
  const newlyEarned = [];

  const stats   = userData.stats;
  const balance = userData.balance || 0;
  const silv    = userData.inventory['Silv token'] || 0;
  const level   = require('./xp').levelFromXP(userData.xp || 0);
  const streak  = userData.dailyStreak || 0;

  const conditions = {
    first_daily:    (stats.dailyClaimed || 0) >= 1,
    streak_7:       streak >= 7,
    streak_30:      streak >= 30,
    streak_100:     streak >= 100,
    rich_1:         balance >= 100_000,
    rich_2:         balance >= 1_000_000,
    gambler_100:    (stats.gamesPlayed || 0) >= 100,
    wins_50:        (stats.gamesWon || 0) >= 50,
    keys_opened_50: (stats.keysOpened || 0) >= 50,
    silv_5:         silv >= 5,
    silv_25:        silv >= 25,
    prestige_1:     (userData.prestige || 0) >= 1,
    level_10:       level >= 10,
    level_50:       level >= 50,
    missions_7:     (stats.missionsCompleted || 0) >= 7,
    trade_1:        (stats.trades || 0) >= 1,
    invest_1:       (stats.investments || 0) >= 1,
    cf_5_streak:    (stats.cfStreak || 0) >= 5,
    blackjack_21:   (stats.blackjack21 || 0) >= 1,
    essence_10:     (stats.essencesUsed || 0) >= 10,
    all_badges:     checkAllBadges(userData),
  };

  for (const ach of ACHIEVEMENTS) {
    if (earned.has(ach.id)) continue;
    if (conditions[ach.id]) {
      earned.add(ach.id);
      newlyEarned.push(ach.id);

      // announce
      if (message) {
        const { EmbedBuilder } = require('discord.js');
        await message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(COLOR.PRESTIGE)
              .setTitle('˗ˏˋ 𐙚 🏆 𝔸𝕔𝕙𝕚𝕖𝕧𝕖𝕞𝕖𝕟𝕥 𝕌𝕟𝕝𝕠𝕔𝕜𝕖𝕕 𐙚 ˎˊ˗')
              .setDescription(
                `**${ach.name}**\n_${ach.desc}_\n\n` +
                `꒰ঌ ${message.author} earned a new achievement ໒꒱`
              )
              .setFooter({ text: 'System • Achievements' }),
          ],
        }).catch(() => {});
      }
    }
  }

  if (newlyEarned.length > 0) {
    userData.achievements = [...earned];
    await saveUserData({ achievements: userData.achievements });
  }

  // Every call here is a stat-changing event (game played, trade completed,
  // profile viewed, etc.) — recompute today's mission progress from the
  // updated stats and persist it. Without this, mission progress bars never
  // move: nothing else in the codebase ever writes to missionProgress.
  const prevProgress = JSON.stringify(userData.missionProgress || {});
  syncMissionProgress(userData);
  if (JSON.stringify(userData.missionProgress) !== prevProgress) {
    await saveUserData({
      missionDate:     userData.missionDate,
      missionProgress: userData.missionProgress,
      missionBaseline: userData.missionBaseline,
    });
  }

  return newlyEarned;
}

function checkAllBadges(userData) {
  const { BADGES } = require('./config');
  const allIds = Object.keys(BADGES);
  const owned  = userData.unlockedBadges || [];
  return allIds.every(id => owned.includes(id));
}

/**
 * Increment a stat field and optionally check achievements.
 */
async function trackStat(userData, field, amount = 1, context = null) {
  userData.stats = userData.stats || {};
  userData.stats[field] = (userData.stats[field] || 0) + amount;
  if (context) {
    await checkAchievements(userData, context);
  }
}

module.exports = { checkAchievements, trackStat };