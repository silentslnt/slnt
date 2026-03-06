const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'hl',
  description: 'Play Higher or Lower: guess if the next number will be higher or lower!',
  async execute({ message, args, userData, saveUserData }) {
    const bet = parseInt(args[0]);

    if (!bet || isNaN(bet) || bet <= 0)
      return message.channel.send('Usage: `.hl <amount>`');

    if (typeof userData.balance !== 'number') userData.balance = 0;

    if (userData.balance < bet)
      return message.channel.send("You don't have enough balance for this bet.");

    // Deduct bet first
    userData.balance -= bet;
    await saveUserData({ balance: userData.balance });

    // Start with a random number (1-99, so the next is always possible)
    let current = Math.floor(Math.random() * 99) + 1;
    let streak = 0;

    // NERF: fewer rounds and softer multipliers
    const maxRounds = 3;
    const multipliers = [0, 1.5, 2.2, 3];
    // index = streak; streak 1→1.5x, 2→2.2x, 3→3x

    let embed = new EmbedBuilder()
      .setTitle('˗ˏˋ 𐙚 🔼 𝔥𝔦𝔤𝔥𝔢𝔯 𝓸𝔯 𝔩𝔬𝔴𝔢𝔯 🔽 𐙚 ˎˊ˗')
      .setDescription(
        [
          `Current number: **${current}**`,
          '',
          'React 🔼 for **Higher**, 🔽 for **Lower**.',
          '',
          `Streak: **0**`,
          `Payout caps at **${multipliers[maxRounds]}x** after **${maxRounds}** correct celestial guesses.`
        ].join('\n')
      )
      .setColor('#F5E6FF')
      .setTimestamp();

    let statusMsg = await message.channel.send({ embeds: [embed] });
    await statusMsg.react('🔼');
    await statusMsg.react('🔽');

    const filter = (reaction, user) =>
      ['🔼', '🔽'].includes(reaction.emoji.name) && user.id === message.author.id;

    const collector = statusMsg.createReactionCollector({ filter, time: 60000 });

    async function endGame(won, payout, streakCount, finalNum) {
      let resultMsg;
      if (won) {
        userData.balance += payout;
        await saveUserData({ balance: userData.balance });
        resultMsg =
          [
            `🎉 You survived **${streakCount}** celestial round(s)!`,
            `The next number was **${finalNum}**.`,
            `**You won ${payout} coins!**`
          ].join('\n');
      } else {
        resultMsg =
          [
            `❌ Your streak has fallen. The next number was **${finalNum}**.`,
            `Streak: **${streakCount}** – you lost your bet.`
          ].join('\n');
      }

      const endEmbed = new EmbedBuilder()
        .setTitle('˗ˏˋ 𐙚 🔮 𝔥/𝔩 𝔯𝔢𝔰𝔲𝔩𝔱𝔰 𐙚 ˎˊ˗')
        .setDescription(resultMsg)
        .addFields({ name: '💰 Balance', value: `**${userData.balance}**`, inline: true })
        .setColor(won ? '#C1FFD7' : '#FFB3C6')
        .setTimestamp();

      await message.channel.send({ embeds: [endEmbed] });
    }

    collector.on('collect', async (reaction, user) => {
      await reaction.users.remove(user.id).catch(() => {});
      collector.resetTimer();

      const nextNum = Math.floor(Math.random() * 100) + 1;
      const picked = reaction.emoji.name === '🔼' ? 'higher' : 'lower';

      const correct =
        (picked === 'higher' && nextNum > current) ||
        (picked === 'lower' && nextNum < current);

      if (correct) {
        streak += 1;
        current = nextNum;

        if (streak >= maxRounds) {
          collector.stop('win');
          const payout = Math.floor(bet * multipliers[streak]);
          return endGame(true, payout, streak, nextNum);
        } else {
          const streakEmbed = new EmbedBuilder()
            .setTitle('˗ˏˋ 𐙚 🔼 𝔥𝔦𝔤𝔥𝔢𝔯 𝓸𝔯 𝔩𝔬𝔴𝔢𝔯 🔽 𐙚 ˎˊ˗')
            .setDescription(
              [
                `✅ Correct guess! The new number is **${nextNum}**.`,
                '',
                'React again to continue your streak.',
                '',
                `Streak: **${streak}** / ${maxRounds}`,
                `Current potential: **${multipliers[streak]}x** your bet if you make it to the end.`
              ].join('\n')
            )
            .setColor('#C1FFD7')
            .setTimestamp();

          await statusMsg.edit({ embeds: [streakEmbed] });
        }
      } else {
        collector.stop('fail');
        return endGame(false, 0, streak, nextNum);
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'win' && reason !== 'fail') {
        message.channel.send('⏱️ Higher or Lower game timed out.');
      }
    });
  },
};
