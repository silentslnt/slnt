const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'cf',
  description: 'Flip a coin and bet on heads(h) or tails(t).',
  async execute({ message, args, userData, saveUserData }) {
    if (args.length < 2) {
      return message.channel.send('Usage: `.cf <amount> <h|t>`');
    }

    const betAmount = parseInt(args[0]);
    const guess = args[1].toLowerCase();

    if (isNaN(betAmount) || betAmount <= 0) {
      return message.channel.send('Please enter a valid positive amount to bet.');
    }

    if (guess !== 'h' && guess !== 't') {
      return message.channel.send('You must bet on "h" (heads) or "t" (tails).');
    }

    if (typeof userData.balance !== 'number') userData.balance = 0;

    if (userData.balance < betAmount) {
      return message.channel.send('You do not have enough balance to place that bet.');
    }

    // Deduct bet first
    userData.balance -= betAmount;

    const coinSides = ['h', 't'];
    const result = coinSides[Math.floor(Math.random() * coinSides.length)];

    let winnings = 0;
    let block =
      '╭──────────────────────────────╮\n' +
      `│  🪙 Result: **${result === 'h' ? 'Heads' : 'Tails'}**      │\n`;

    if (guess === result) {
      winnings = betAmount * 2;
      userData.balance += winnings;
      block +=
        '│  **✨ HEAVENLY FLIP – YOU WIN ✨** │\n' +
        `│  Reward: **${winnings}** coins      │\n`;
    } else {
      block +=
        '│  **💔 FALLEN BET – YOU LOSE**       │\n';
    }

    block += '╰──────────────────────────────╯';

    const embed = new EmbedBuilder()
      .setTitle('˗ˏˋ 𐙚 🪙 𝔠𝔢𝔩𝔢𝔰𝔱𝔦𝔞𝔩 𝔠𝔬𝔦𝔫 𝔉𝔩𝔦𝔭 𐙚 ˎˊ˗')
      .setDescription(
        [
          `${message.author} cast a coin into the heavens.`,
          '',
          block,
          '',
          `💰 **New Balance:** ${userData.balance} coins`,
        ].join('\n')
      )
      .setColor('#F5E6FF')
      .setTimestamp()
      .setFooter({ text: 'System • Angelic Games ✧' });

    // Persist to MongoDB (wrapped in index.js with userId)
    await saveUserData({ balance: userData.balance });

    message.channel.send({ embeds: [embed] });
  },
};
