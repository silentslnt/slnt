// commands/missions.js
const { EmbedBuilder } = require('discord.js');
const { addXP, progressBar } = require('../utils/xp');
const { trackStat } = require('../utils/achievements');
const { getTodaysMissions, todayKey, syncMissionProgress } = require('../utils/missions');

const CHECK = '<:check:1547659779877642360>';
const BLACK = 0x000000;

module.exports = {
  name: 'missions',
  aliases: ['ms', 'mission'],
  adminOnly: false,
  description: 'View and track your daily missions.',

  async execute({ message, userData, saveUserData }) {
    const today    = todayKey();
    const missions = getTodaysMissions();

    // getUserData() already rolled this over for today and synced progress
    // from current lifetime stats — this just re-syncs in case anything
    // changed between fetch and now (harmless no-op otherwise).
    syncMissionProgress(userData);
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
        `> ${done ? CHECK : '◻'} **${mission.label}**\n` +
        `> ${bar} \`${Math.min(current, mission.target)}/${mission.target}\`\n` +
        `> Reward: ${rewardText}`
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
      .setColor(BLACK)
      .setTitle('DAILY MISSIONS')
      .setDescription(
        '-# Complete missions to earn bonus coins and XP. Missions refresh daily at midnight.\n\n' +
        lines.join('\n\n') +
        (totalCoins > 0
          ? `\n\n__**Rewards Claimed**__\n> +${totalCoins.toLocaleString()} coins${totalXP ? ` + ${totalXP} XP` : ''}`
          : '')
      )
      .setFooter({ text: `Missions for ${today} — ${message.guild?.name || 'Shiro'}` });

    return message.channel.send({ embeds: [embed] });
  },
};