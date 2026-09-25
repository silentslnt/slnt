const { recordRound } = require('../utils/houseBank');
const { EmbedBuilder } = require('discord.js');
const { awardPoints } = require('../utils/sentinelDb');
const { parseBet } = require('../utils/parseBet');
const { announceWin } = require('../utils/winAnnouncer');
const { trackStat, checkAchievements } = require('../utils/achievements');

const BLACK = 0x000000;

module.exports = {
  name: 'dice',
  aliases: ['d'],
  description: 'Roll a die and win rewards based on your roll! `.dice <amount|all>`',
  async execute({ message, args, userData, saveUserData, client, logAdminAction }) {
    if (typeof userData.balance !== 'number') userData.balance = 0;
    const bet = parseBet(args[0], userData.balance);

    if (!bet) {
      return message.channel.send('Usage: `.dice <amount|all>` (bet must be a positive number)');
    }
    if (userData.balance < bet) {
      return message.channel.send("You don't have enough balance to play!");
    }

    // Deduct bet first
    userData.balance -= bet;

    const roll = Math.floor(Math.random() * 6) + 1; // 1-6
    let reward = 0;
    let resultLine = '';

    if (roll === 6) {
      reward = Math.floor(bet * 2);
      userData.balance += reward;
      resultLine = `> Rolled **6** — Jackpot! Reward: **${reward.toLocaleString()}** (2×)`;
    } else if (roll === 5) {
      reward = Math.floor(bet * 1.7);
      userData.balance += reward;
      resultLine = `> Rolled **5** — Big Win! Reward: **${reward.toLocaleString()}** (1.7×)`;
    } else if (roll === 4) {
      reward = Math.floor(bet * 1.4);
      userData.balance += reward;
      resultLine = `> Rolled **4** — Win! Reward: **${reward.toLocaleString()}** (1.4×)`;
    } else {
      resultLine = `> Rolled **${roll}** — you lose.`;
    }

    await saveUserData({ balance: userData.balance });
    if (reward > 0 && message.guild) {
      const pts = roll === 6 ? 20 : roll === 5 ? 12 : 8;
      await awardPoints(message.guild.id, message.author.id, pts);
    }

    recordRound('dice', bet, reward);
    await trackStat(userData, 'gamesPlayed', 1);
    if (reward > 0) {
      await trackStat(userData, 'gamesWon', 1);
      await trackStat(userData, 'coinsWon', reward);
    }
    await saveUserData({ stats: userData.stats });
    await checkAchievements(userData, { message, saveUserData });

    const embed = new EmbedBuilder()
      .setTitle('DICE TABLE')
      .setDescription(
        `${resultLine}\n\n> New balance: **${userData.balance.toLocaleString()}** coins`
      )
      .setColor(BLACK)
      .setFooter({ text: message.guild?.name || 'Shiro' });

    message.channel.send({ embeds: [embed] });

    if (reward > 0 && client) {
      announceWin(client, {
        userId: message.author.id, username: message.author.username,
        avatarURL: message.author.displayAvatarURL({ dynamic: true }),
        game: 'dice', bet, payout: reward, multiplier: bet > 0 ? reward / bet : 0,
        logAdminAction,
      }).catch(() => {});
    }
  }
};
