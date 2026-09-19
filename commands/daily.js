// commands/daily.js
const { EmbedBuilder } = require('discord.js');
const {
  DAILY_BASE, STREAK_TIERS,
  WEEKLY_BONUS_COINS, WEEKLY_BONUS_KEY,
  MONTHLY_BONUS_COINS, MONTHLY_BONUS_SILV, MONTHLY_BADGE,
  COLOR, XP_PER_DAILY,
} = require('../utils/config');
const { getRankBonusMultiplier } = require('../utils/prestige');
const { addXP, progressBar, xpProgress } = require('../utils/xp');
const { trackStat } = require('../utils/achievements');

const DAY_MS   = 24 * 60 * 60 * 1000;
const WEEK_MS  =  7 * DAY_MS;
const MONTH_MS = 28 * DAY_MS;

function getStreakMultiplier(streak) {
  let mult = 1;
  for (const tier of STREAK_TIERS) {
    if (streak >= tier.days) mult = tier.multiplier;
  }
  return mult;
}

module.exports = {
  name: 'daily',
  aliases: ['day'],
  adminOnly: false,
  description: 'Claim your daily reward with streak bonuses.',

  async execute({ message, userData, saveUserData, getUserData }) {
    const now      = Date.now();
    const last     = userData.lastDaily ? new Date(userData.lastDaily).getTime() : 0;
    const elapsed  = now - last;

    // ── cooldown ───────────────────────────────────────────────
    if (elapsed < DAY_MS) {
      const timeLeft = DAY_MS - elapsed;
      const h  = Math.floor(timeLeft / 3600_000);
      const m  = Math.floor((timeLeft % 3600_000) / 60_000);
      const s  = Math.floor((timeLeft % 60_000) / 1000);

      const { current, needed } = xpProgress(userData.xp || 0);
      const bar = progressBar(current, needed);

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(COLOR.LOSS)
            .setTitle('˗ˏˋ 𐙚 ⏰ 𝔇𝔞𝔦𝔩𝔶 𝔬𝔫 ℭ𝔬𝔬𝔩𝔡𝔬𝔴𝔫 𐙚 ˎˊ˗')
            .setDescription(
              `You've already claimed today!\n\n` +
              `꒰ঌ **Time remaining:** \`${h}h ${m}m ${s}s\` ໒꒱\n\n` +
              `🔥 **Current streak:** ${userData.dailyStreak || 0} days`
            )
            .setFooter({ text: 'System • Daily Rewards' }),
        ],
      });
    }

    // ── streak calculation ─────────────────────────────────────
    const brokeStreak = elapsed > DAY_MS * 2; // missed 2+ days
    let streak = brokeStreak ? 1 : (userData.dailyStreak || 0) + 1;
    const streakMult = getStreakMultiplier(streak);
    const rankMult   = getRankBonusMultiplier(userData.totalEarned || 0);

    // ── base coins ────────────────────────────────────────────
    let coins        = Math.floor(DAILY_BASE * streakMult * rankMult);
    const lines      = [`💰 **Daily coins:** ${DAILY_BASE} × ${streakMult}× streak × ${rankMult.toFixed(2)}× rank = **${coins}**`];
    const newBadges  = [];
    let bonusKey     = null;
    let bonusSilv    = 0;

    // ── weekly bonus ──────────────────────────────────────────
    const lastWeekly = userData.lastWeekly ? new Date(userData.lastWeekly).getTime() : 0;
    if (streak % 7 === 0 && now - lastWeekly >= WEEK_MS - DAY_MS) {
      coins     += WEEKLY_BONUS_COINS;
      bonusKey   = WEEKLY_BONUS_KEY;
      userData.inventory = userData.inventory || {};
      userData.inventory[bonusKey] = (userData.inventory[bonusKey] || 0) + 1;
      userData.lastWeekly = new Date();
      lines.push(`🎁 **Weekly bonus:** +${WEEKLY_BONUS_COINS} coins + 1 ${bonusKey} key`);
    }

    // ── monthly bonus ─────────────────────────────────────────
    const lastMonthly = userData.lastMonthly ? new Date(userData.lastMonthly).getTime() : 0;
    if (streak % 28 === 0 && now - lastMonthly >= MONTH_MS - DAY_MS) {
      coins      += MONTHLY_BONUS_COINS;
      bonusSilv   = MONTHLY_BONUS_SILV;
      userData.inventory = userData.inventory || {};
      userData.inventory['Silv token'] = (userData.inventory['Silv token'] || 0) + bonusSilv;
      userData.lastMonthly = new Date();
      // Award monthly badge if not owned
      userData.unlockedBadges = userData.unlockedBadges || [];
      if (!userData.unlockedBadges.includes('moon_badge')) {
        userData.unlockedBadges.push('moon_badge');
        newBadges.push(MONTHLY_BADGE);
      }
      lines.push(`🌙 **Monthly bonus:** +${MONTHLY_BONUS_COINS} coins + ${bonusSilv} SILV token!`);
    }

    // ── apply ─────────────────────────────────────────────────
    userData.balance     = (userData.balance || 0) + coins;
    userData.dailyStreak = streak;
    userData.lastDaily   = new Date();
    userData.totalEarned = (userData.totalEarned || 0) + coins;

    // track stats
    userData.stats = userData.stats || {};
    userData.stats.dailyClaimed = (userData.stats.dailyClaimed || 0) + 1;

    await saveUserData({
      balance: userData.balance,
      dailyStreak: streak,
      lastDaily: userData.lastDaily,
      lastWeekly: userData.lastWeekly,
      lastMonthly: userData.lastMonthly,
      totalEarned: userData.totalEarned,
      inventory: userData.inventory,
      unlockedBadges: userData.unlockedBadges,
      stats: userData.stats,
    });

    // ── XP grant ──────────────────────────────────────────────
    await addXP(message.author.id, XP_PER_DAILY, userData, saveUserData, message);

    // ── achievement check ─────────────────────────────────────
    await trackStat(userData, 'dailyClaimed', 0, { message, saveUserData });

    // ── streak bar ────────────────────────────────────────────
    const nextMilestone = [7, 14, 21, 28, 35, 42, 50, 100].find(n => n > streak) || streak + 1;
    const streakBar = progressBar(streak % nextMilestone || streak, nextMilestone);

    // ── embed ─────────────────────────────────────────────────
    const embedColor = brokeStreak ? COLOR.WARNING : COLOR.WIN;
    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setTitle('˗ˏˋ 𐙚 🎁 𝔇𝔞𝔦𝔩𝔶 ℛ𝕖𝕨𝕒𝕣𝕕 𝔠𝔩𝔞𝔦𝔪𝔢𝔡! 𐙚 ˎˊ˗')
      .setDescription(lines.join('\n'))
      .addFields(
        {
          name: '🔥 Streak',
          value:
            `**${streak}** days  ${brokeStreak ? '_(streak reset)_' : ''}\n` +
            `${streakBar} → next milestone: **${nextMilestone}** days`,
          inline: false,
        },
        {
          name: '💰 New Balance',
          value: `**${userData.balance.toLocaleString()}** coins`,
          inline: true,
        },
        {
          name: '⏩ Next Streak Bonus',
          value: (() => {
            const t = STREAK_TIERS.find(t => t.days > streak);
            return t ? `${t.multiplier}× at **${t.days}** days` : '🏆 Max multiplier!';
          })(),
          inline: true,
        },
      )
      .setFooter({ text: `System • Daily Rewards${newBadges.length ? ' • New badge unlocked!' : ''}` })
      .setTimestamp();

    if (newBadges.length) {
      embed.addFields({ name: '🏅 Badge Awarded', value: newBadges.join(', '), inline: false });
    }

    return message.channel.send({ embeds: [embed] });
  },
};