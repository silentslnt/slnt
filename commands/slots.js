const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'slots',
  description: 'Simple slots game',
  async execute({ message, args, userData, saveUserData }) {
    const betAmount = parseInt(args[0]);
    if (!betAmount || isNaN(betAmount) || betAmount <= 0) {
      return message.channel.send('Please enter a valid positive bet amount. Usage: `.slots <amount>`');
    }

    if (typeof userData.balance !== 'number') userData.balance = 0;

    if (userData.balance < betAmount) {
      return message.channel.send('You do not have enough balance to bet this amount.');
    }

    // Deduct bet amount first
    userData.balance -= betAmount;

    // Slots emojis
    const emojis = ['🍒', '🍋', '🍊', '🍉', '🍇', '⭐', '7️⃣'];

    // Spin result
    const spin = [
      emojis[Math.floor(Math.random() * emojis.length)],
      emojis[Math.floor(Math.random() * emojis.length)],
      emojis[Math.floor(Math.random() * emojis.length)],
    ];

    let winnings = 0;
    let outcomeBlock =
      '╭──────────────────────────────╮\n' +
      `│  🎰 Spin: ${spin.join(' | ')}   │\n`;

    if (spin[0] === spin[1] && spin[1] === spin[2]) {
      winnings = betAmount * 10;
      userData.balance += winnings;
      outcomeBlock +=
        '│  **✨ CELESTIAL JACKPOT ✨**  │\n' +
        `│  Reward: **${winnings}** (10x) │\n`;
    } else if (spin[0] === spin[1] || spin[1] === spin[2] || spin[0] === spin[2]) {
      winnings = betAmount * 2;
      userData.balance += winnings;
      outcomeBlock +=
        '│  **⭐ BLESSED DOUBLE ⭐**     │\n' +
        `│  Reward: **${winnings}** (2x)  │\n`;
    } else {
      outcomeBlock +=
        '│  **💔 FALLEN BET – YOU LOSE**│\n';
    }

    outcomeBlock += '╰──────────────────────────────╯';

    // Persist to MongoDB – one argument, wrapper adds userId
    await saveUserData({ balance: userData.balance });

    const embed = new EmbedBuilder()
      .setTitle('˗ˏˋ 𐙚 🎰 𝔠𝔢𝔩𝔢𝔰𝔱𝔦𝔞𝔩 𝔖𝔩𝔬𝔱𝔰 𐙚 ˎˊ˗')
      .setDescription(
        [
          '꒰ঌ the reels spin in the starlight ໒꒱',
          '',
          outcomeBlock,
          '',
          `💰 **New Balance:** ${userData.balance} coins`,
        ].join('\n')
      )
      .setColor('#F5E6FF')
      .setTimestamp()
      .setFooter({ text: 'System • Angelic Casino ✧' });

    message.channel.send({ embeds: [embed] });
  },
};
