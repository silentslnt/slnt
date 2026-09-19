// commands/missions.js
const { EmbedBuilder } = require('discord.js');
const { MISSIONS_POOL, COLOR, XP_PER_MISSION } = require('../utils/config');
const { addXP, progressBar } = require('../utils/xp');
const { trackStat } = require('../utils/achievements');

/** Get today's 3 missions using date as seed */
function getTodaysMissions() {
  const today = new Date();
  const seed  = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  // Simple seeded shuffle pick
  const shuffled = [...MISSIONS_POOL].sort((a, b) => {
    const ha = simpleHash(seed + a.id);
    const hb = simpleHash(seed + b.id);
    return ha - hb;
  });
  return shuffled.slice(0, 3);
}

function simpleHash(str) {
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

module.exports = {
  name: 'missions',
  aliases: ['ms', 'mission'],
  adminOnly: false,
  description: 'View and track your daily missions.',

  async execute({ message, userData, saveUserData }) {
    const today    = todayKey();
    const missions = getTodaysMissions();

    // Reset missions if it's a new day
    if (userData.missionDate !== today) {
      userData.missionProgress = {};
      userData.missionDate     = today;
    }

    userData.missionProgress = userData.missionProgress || {};
    const progress = userData.missionProgress;

    let allDone   = true;
    let totalXP   = 0;
    let totalCoins = 0;
    const lines   = [];

    for (const mission of missions) {
      const current = progress[mission.id]?.progress || 0;
      const done    = current >= mission.target;
      if (!done) allDone = false;

      const bar = progressBar(Math.min(current, mission.target), mission.target, 8);
      const rewardText = [
        mission.reward.coins ? `${mission.reward.coins} coins` : '',
        mission.reward.xp    ? `${mission.reward.xp} XP`       : '',
      ].filter(Boolean).join(', ');

      lines.push(
        `${done ? '✅' : '🔲'} **${mission.label}**\n` +
        `  ${bar} \`${Math.min(current, mission.target)}/${mission.target}\`\n` +
        `  🎁 Reward: ${rewardText}`
      );

      if (done && !progress[mission.id]?.claimed) {
        progress[mission.id] = { progress: current, claimed: true };
        totalCoins += mission.reward.coins || 0;
        totalXP    += mission.reward.xp    || 0;
      }
    }

    // Grant unclaimed rewards
    if (totalCoins > 0 || totalXP > 0) {
      userData.balance     = (userData.balance || 0) + totalCoins;
      userData.totalEarned = (userData.totalEarned || 0) + totalCoins;
      userData.stats = userData.stats || {};
      userData.stats.missionsCompleted = (userData.stats.missionsCompleted || 0) + 1;

      await saveUserData({
        balance: userData.balance,
        totalEarned: userData.totalEarned,
        missionDate: today,
        missionProgress: progress,
        stats: userData.stats,
      });

      if (totalXP > 0) {
        await addXP(message.author.id, totalXP, userData, saveUserData, message);
      }

      await trackStat(userData, 'missionsCompleted', 0, { message, saveUserData });
    } else {
      await saveUserData({ missionDate: today, missionProgress: progress });
    }

    const embed = new EmbedBuilder()
      .setColor(COLOR.MISSIONS)
      .setTitle('˗ˏˋ 𐙚 📋 𝔇𝔞𝔦𝔩𝔶 𝕄𝕚𝕤𝕤𝕚𝕠𝕟𝕤 𐙚 ˎˊ˗')
      .setDescription(
        '꒰ঌ Complete missions to earn bonus coins and XP ໒꒱\n' +
        '꒰ঌ Missions refresh daily at midnight ໒꒱\n\n' +
        lines.join('\n\n')
      )
      .setColor(allDone ? COLOR.WIN : COLOR.MISSIONS)
      .setFooter({ text: `Missions for ${today} • System • Missions Board` })
      .setTimestamp();

    if (totalCoins > 0) {
      embed.addFields({
        name: '🎉 Rewards Claimed!',
        value: `+${totalCoins.toLocaleString()} coins${totalXP ? ` + ${totalXP} XP` : ''}`,
        inline: false,
      });
    }

    return message.channel.send({ embeds: [embed] });
  },
};