const { EmbedBuilder } = require('discord.js');

const wheel = [
  { num: 0, color: 'green' },
  ...Array.from({ length: 36 }, (_, i) => ({
    num: i + 1,
    color: (i % 2 === 0 ? 'black' : 'red')
  }))
];

function spinWheel() {
  const idx = Math.floor(Math.random() * wheel.length);
  return wheel[idx];
}

module.exports = {
  name: 'roulette',
  description: 'Bet on red, black, green, or a number (0-36) for a big payout!',
  async execute({ message, args, userData, saveUserData }) {
    if (args.length < 2)
      return message.channel.send('Usage: `.roulette <amount> <red|black|green|0-36>`');

    const bet = parseInt(args[0]);
    const choiceRaw = args[1].toLowerCase();

    if (isNaN(bet) || bet <= 0)
      return message.channel.send('Bet must be a positive integer!');

    if (typeof userData.balance !== 'number') userData.balance = 0;

    if (userData.balance < bet)
      return message.channel.send("You don't have enough balance to bet that!");

    // Deduct bet first
    userData.balance -= bet;

    // Validate bet
    let betType;
    let betNumber = null;
    if (['red', 'black', 'green'].includes(choiceRaw)) {
      betType = choiceRaw;
    } else if (!isNaN(parseInt(choiceRaw)) && parseInt(choiceRaw) >= 0 && parseInt(choiceRaw) <= 36) {
      betType = 'number';
      betNumber = parseInt(choiceRaw);
    } else {
      return message.channel.send('Invalid bet. Choose red, black, green, or a number 0-36.');
    }

    // Spin
    const result = spinWheel();

    let winnings = 0;
    let resultBlock = 
      '╭──────────────────────────────╮\n' +
      `│  🎡 Result: **${result.num} (${result.color.toUpperCase()} )** │\n`;

    if (betType === 'number' && betNumber === result.num) {
      winnings = bet * 36;
      userData.balance += winnings;
      resultBlock +=
        '│  **✨ CELESTIAL JACKPOT ✨**  │\n' +
        `│  Reward: **${winnings}** (36x) │\n`;
    } else if (betType === 'red' && result.color === 'red') {
      winnings = bet * 2;
      userData.balance += winnings;
      resultBlock +=
        '│  **🟥 RED BLESSED WIN 🟥**    │\n' +
        `│  Reward: **${winnings}** (2x)  │\n`;
    } else if (betType === 'black' && result.color === 'black') {
      winnings = bet * 2;
      userData.balance += winnings;
      resultBlock +=
        '│  **⬛ SHADOWED LUCK ⬛**      │\n' +
        `│  Reward: **${winnings}** (2x)  │\n`;
    } else if (betType === 'green' && result.num === 0) {
      winnings = bet * 18;
      userData.balance += winnings;
      resultBlock +=
        '│  **🟩 DIVINE ZERO 🟩**       │\n' +
        `│  Reward: **${winnings}** (18x) │\n`;
    } else {
      resultBlock +=
        '│  **💔 FALLEN BET – YOU LOSE**│\n';
    }

    resultBlock += '╰──────────────────────────────╯';

    // Persist to MongoDB – one argument, wrapper adds userId
    await saveUserData({ balance: userData.balance });

    const embed = new EmbedBuilder()
      .setTitle('˗ˏˋ 𐙚 🎡 𝔠𝔢𝔩𝔢𝔰𝔱𝔦𝔞𝔩 ℝ𝕠𝕦𝕝𝕖𝕥𝕥𝕖 𐙚 ˎˊ˗')
      .setDescription(
        [
          '꒰ঌ spinning the heavenly wheel ໒꒱',
          '',
          resultBlock,
          '',
          `💰 **New Balance:** ${userData.balance} coins`
        ].join('\n')
      )
      .setColor('#F5E6FF')
      .setFooter({ text: 'System • Angelic Casino ✧' })
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }
};
