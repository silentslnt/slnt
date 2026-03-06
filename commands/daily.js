const { EmbedBuilder } = require('discord.js');

const DAILY_REWARD = 100;
const DAILY_COOLDOWN = 24 * 60 * 60 * 1000; // 24 hours in milliseconds

module.exports = {
  name: 'daily',
  description: 'Claim your daily reward of 100 coins (available every 24 hours)',
  async execute({ message, userData, saveUserData }) {
    const now = Date.now();
    const lastDaily = userData.lastDaily ? new Date(userData.lastDaily).getTime() : 0;
    const timeSinceLastClaim = now - lastDaily;

    // Check if 24 hours have passed
    if (timeSinceLastClaim < DAILY_COOLDOWN) {
      const timeLeft = DAILY_COOLDOWN - timeSinceLastClaim;
      const hoursLeft = Math.floor(timeLeft / (60 * 60 * 1000));
      const minutesLeft = Math.floor((timeLeft % (60 * 60 * 1000)) / (60 * 1000));
      const secondsLeft = Math.floor((timeLeft % (60 * 1000)) / 1000);

      const embed = new EmbedBuilder()
        .setTitle('˗ˏˋ 𐙚 ⏰ 𝔇𝔞𝔦𝔩𝔶 𝔬𝔫 ℭ𝔬𝔬𝔩𝔡𝔬𝔴𝔫 𐙚 ˎˊ˗')
        .setDescription(
          [
            'You\'ve already claimed your daily reward today!',
            '',
            '꒰ঌ **Time until next claim:** ໒꒱',
            `> ${hoursLeft}h ${minutesLeft}m ${secondsLeft}s`
          ].join('\n')
        )
        .setColor('#FFB3C6')
        .setFooter({ text: 'Come back a little later, celestial saver ✧' })
        .setTimestamp();

      return message.channel.send({ embeds: [embed] });
    }

    // Grant daily reward
    userData.balance = (userData.balance || 0) + DAILY_REWARD;
    userData.lastDaily = new Date();

    await saveUserData({
      balance: userData.balance,
      lastDaily: userData.lastDaily
    });

    const embed = new EmbedBuilder()
      .setTitle('˗ˏˋ 𐙚 🎁 𝔇𝔞𝔦𝔩𝔶 ℛ𝕖𝕨𝕒𝕣𝕕 𝔠𝔩𝔞𝔦𝔪𝔢𝔡! 𐙚 ˎˊ˗')
      .setDescription(
        [
          `You received **${DAILY_REWARD}** coins!`,
          '',
          `💰 **New Balance:** ${userData.balance} coins`,
          '',
          '꒰ঌ Come back in **24 hours** for another little gift ໒꒱'
        ].join('\n')
      )
      .setColor('#C1FFD7')
      .setFooter({ text: 'System • Daily Rewards' })
      .setTimestamp();

    return message.channel.send({ embeds: [embed] });
  }
};
