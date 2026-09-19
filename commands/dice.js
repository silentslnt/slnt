const { EmbedBuilder } = require('discord.js');
const { awardPoints } = require('../utils/sentinelDb');
const { requireAdmin } = require('../utils/permissions');
const { parseBet } = require('../utils/parseBet');

module.exports = {
  name: 'dice',
  aliases: ['d'],
  adminOnly: true,
  description: 'Roll a die and win rewards based on your roll! `.dice <amount|all>`',
  async execute({ message, args, userData, saveUserData }) {
    if (!await requireAdmin(message)) return;

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
    let resultBlock = '';

    if (roll === 6) {
      reward = Math.floor(bet * 2);
      userData.balance += reward;

      resultBlock =
        '╭──────────────────────────────╮\n' +
        '│  🎲 Rolled: **6**            │\n' +
        '│  **✨ CELESTIAL JACKPOT ✨**  │\n' +
        `│  Reward: **${reward}** (2x)  │\n` +
        '╰──────────────────────────────╯';
    } else if (roll === 5) {
      reward = Math.floor(bet * 1.7);
      userData.balance += reward;

      resultBlock =
        '╭──────────────────────────────╮\n' +
        '│  🎲 Rolled: **5**            │\n' +
        '│  **⭐ HEAVENLY WIN ⭐**       │\n' +
        `│  Reward: **${reward}** (1.7x)│\n` +
        '╰──────────────────────────────╯';
    } else if (roll === 4) {
      reward = Math.floor(bet * 1.4);
      userData.balance += reward;

      resultBlock =
        '╭──────────────────────────────╮\n' +
        '│  🎲 Rolled: **4**            │\n' +
        '│  **🪽 BLESSED WIN 🪽**       │\n' +
        `│  Reward: **${reward}** (1.4x)│\n` +
        '╰──────────────────────────────╯';
    } else {
      resultBlock =
        '╭──────────────────────────────╮\n' +
        `│  🎲 Rolled: **${roll}**      │\n` +
        '│  **💔 FALLEN BET – YOU LOSE**│\n' +
        '╰──────────────────────────────╯';
    }

    await saveUserData({ balance: userData.balance });
    if (reward > 0 && message.guild) {
      const pts = roll === 6 ? 20 : roll === 5 ? 12 : 8;
      await awardPoints(message.guild.id, message.author.id, pts);
    }

    const embed = new EmbedBuilder()
      .setTitle('˗ˏˋ 𐙚 🎲 𝔠𝔢𝔩𝔢𝔰𝔱𝔦𝔞𝔩 𝔇𝔦𝔠𝔢 𝕋𝕒𝕓𝕝𝕖 𐙚 ˎˊ˗')
      .setDescription(
        [
          '꒰ঌ rolling the heavenly dice ໒꒱',
          '',
          resultBlock,
          '',
          `💰 **New Balance:** ${userData.balance} coins`
        ].join('\n')
      )
      .setColor('#F5E6FF')
      .setFooter({ text: 'System • Angelic Games ✧' })
      .setTimestamp();

    message.channel.send({ embeds: [embed] });
  }
};
