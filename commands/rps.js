const { EmbedBuilder } = require('discord.js');
const { requireAdmin } = require('../utils/permissions');
const { parseBet } = require('../utils/parseBet');

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

module.exports = {
  name: 'rps',
  adminOnly: true,
  description: 'Play rock paper scissors and double your bet if you win! `.rps <amount|all> <r|p|s>`',
  async execute({ message, args, userData, saveUserData }) {
    if (!await requireAdmin(message)) return;

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

    let resultLine = `> You: ${choices[playerChoice]} **${playerChoice}**  ·  Bot: ${choices[botChoice]} **${botChoice}**\n\n`;

    if (outcome === 'win') {
      userData.balance += bet * 2;
      resultLine += `> **Victory!** Reward: **${(bet * 2).toLocaleString()}**`;
    } else if (outcome === 'draw') {
      userData.balance += bet;
      resultLine += `> **Draw.** Bet refunded.`;
    } else {
      resultLine += `> **You lose.**`;
    }

    const embed = new EmbedBuilder()
      .setTitle('ROCK PAPER SCISSORS')
      .setDescription(`${resultLine}\n\n> New balance: **${userData.balance.toLocaleString()}** coins`)
      .setColor(BLACK)
      .setFooter({ text: message.guild?.name || 'Shiro' });

    await saveUserData({ balance: userData.balance });

    message.channel.send({ embeds: [embed] });
  },
};
