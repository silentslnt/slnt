const { EmbedBuilder } = require('discord.js');
const { parseBet } = require('../utils/parseBet');
const { announceWin } = require('../utils/winAnnouncer');
const { trackStat, checkAchievements } = require('../utils/achievements');

const BLACK = 0x000000;

const choices = {
  rock: '🪨',
  paper: '📄',
  scissors: '✂️',
};

function getBotChoice() {
  const keys = Object.keys(choices);
  return keys[Math.floor(Math.random() * keys.length)];
}

function getResult(player, bot) {
  if (player === bot) return 'draw';
  if (
    (player === 'rock' && bot === 'scissors') ||
    (player === 'paper' && bot === 'rock') ||
    (player === 'scissors' && bot === 'paper')
  )
    return 'win';
  return 'lose';
}

const { casinoPayout } = require('../utils/houseEdge');

module.exports = {
  name: 'rps',
  description: 'Play rock paper scissors and double your bet if you win! `.rps <amount|all> <r|p|s>`',
  async execute({ message, args, userData, saveUserData, client, logAdminAction }) {
    if (typeof userData.balance !== 'number') userData.balance = 0;
    const bet = parseBet(args[0], userData.balance);
    const choiceMap = { r: 'rock', p: 'paper', s: 'scissors' };
    const playerChoice = choiceMap[(args[1] || '').toLowerCase()] || (args[1] || '').toLowerCase();

    if (!bet || !['rock', 'paper', 'scissors'].includes(playerChoice)) {
      return message.channel.send('Usage: `.rps <amount|all> <rock|paper|scissors>`');
    }
    if (userData.balance < bet) {
      return message.channel.send('You do not have enough balance to place that bet.');
    }

    // Deduct bet up front
    userData.balance -= bet;

    const botChoice = getBotChoice();
    const outcome = getResult(playerChoice, botChoice);
    const won = outcome === 'win';
    // House edge: a win pays 1.9×, a draw refunds 85% — ~92% return.
    const payout = won ? casinoPayout(bet, bet * 1.9, userData) : (outcome === 'draw' ? Math.floor(bet * 0.85) : 0);

    let resultLine = `> You: ${choices[playerChoice]} **${playerChoice}**  ·  Bot: ${choices[botChoice]} **${botChoice}**\n\n`;

    if (won) {
      userData.balance += payout;
      resultLine += `> **Victory!** Reward: **${payout.toLocaleString()}**`;
    } else if (outcome === 'draw') {
      userData.balance += payout;
      resultLine += `> **Draw.** 85% of your bet back (**${payout.toLocaleString()}**).`;
    } else {
      resultLine += `> **You lose.**`;
    }

    const embed = new EmbedBuilder()
      .setTitle('ROCK PAPER SCISSORS')
      .setDescription(`${resultLine}\n\n> New balance: **${userData.balance.toLocaleString()}** coins`)
      .setColor(BLACK)
      .setFooter({ text: message.guild?.name || 'Shiro' });

    await saveUserData({ balance: userData.balance });

    await trackStat(userData, 'gamesPlayed', 1);
    if (won) {
      await trackStat(userData, 'gamesWon', 1);
      await trackStat(userData, 'coinsWon', payout);
    }
    await saveUserData({ stats: userData.stats });
    await checkAchievements(userData, { message, saveUserData });

    message.channel.send({ embeds: [embed] });

    if (won && client) {
      announceWin(client, {
        userId: message.author.id, username: message.author.username,
        avatarURL: message.author.displayAvatarURL({ dynamic: true }),
        game: 'rps', bet, payout, multiplier: bet > 0 ? payout / bet : 0,
        logAdminAction,
      }).catch(() => {});
    }
  },
};
