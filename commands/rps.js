const { EmbedBuilder } = require('discord.js');

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
  description: 'Play rock paper scissors and double your bet if you win!',
  async execute({ message, args, userData, saveUserData }) {
    if (args.length < 2) {
      return message.channel.send('Usage: `.rps <amount> <rock|paper|scissors>`');
    }

    const bet = parseInt(args[0]);
    const playerChoice = args[1].toLowerCase();

    if (isNaN(bet) || bet <= 0) {
      return message.channel.send('Please enter a valid positive amount to bet.');
    }
    if (!['rock', 'paper', 'scissors'].includes(playerChoice)) {
      return message.channel.send('Invalid choice. Use `rock`, `paper`, or `scissors`.');
    }

    if (typeof userData.balance !== 'number') userData.balance = 0;

    if (userData.balance < bet) {
      return message.channel.send('You do not have enough balance to place that bet.');
    }

    // Deduct bet up front
    userData.balance -= bet;

    const botChoice = getBotChoice();
    const outcome = getResult(playerChoice, botChoice);

    let resultBlock =
      '╭──────────────────────────────╮\n' +
      `│  ① You: ${choices[playerChoice]} **${playerChoice}**   │\n` +
      `│  ② Bot: ${choices[botChoice]} **${botChoice}**   │\n`;

    if (outcome === 'win') {
      userData.balance += bet * 2;
      resultBlock +=
        '│  **✨ HEAVENLY VICTORY ✨**  │\n' +
        `│  Reward: **${bet * 2}**      │\n`;
    } else if (outcome === 'draw') {
      userData.balance += bet;
      resultBlock +=
        '│  **☁️ CELESTIAL DRAW ☁️**   │\n' +
        '│  Bet refunded              │\n';
    } else {
      resultBlock +=
        '│  **💔 FALLEN BET – YOU LOSE**│\n';
    }

    resultBlock += '╰──────────────────────────────╯';

    const embed = new EmbedBuilder()
      .setTitle('˗ˏˋ 𐙚 ✂️ 𝔠𝔢𝔩𝔢𝔰𝔱𝔦𝔞𝔩 ℝ𝕠𝕔𝕜 𝕡𝕒𝕡𝕖𝕣 𝕤𝕔𝕚𝕤𝕤𝕠𝕣𝕤 𐙚 ˎˊ˗')
      .setDescription(
        [
          '꒰ঌ heavenly duel results ໒꒱',
          '',
          resultBlock,
          '',
          `💰 **New Balance:** ${userData.balance} coins`,
        ].join('\n')
      )
      .setColor('#F5E6FF')
      .setTimestamp()
      .setFooter({ text: 'System • Angelic Arena ✧' });

    // Persist to MongoDB – one argument, wrapper adds userId
    await saveUserData({ balance: userData.balance });

    message.channel.send({ embeds: [embed] });
  },
};
