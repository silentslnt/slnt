const { EmbedBuilder } = require('discord.js');
const { parseBet } = require('../utils/parseBet');
const { announceWin } = require('../utils/winAnnouncer');
const { trackStat, checkAchievements } = require('../utils/achievements');

const BLACK = 0x000000;

module.exports = {
  name: 'hl',
  aliases: ['highlow'],
  description: 'Play Higher or Lower: guess if the next number will be higher or lower! `.hl <amount|all>`',
  async execute({ message, args, userData, saveUserData, client, logAdminAction }) {
    if (typeof userData.balance !== 'number') userData.balance = 0;
    const bet = parseBet(args[0], userData.balance);

    if (!bet) return message.channel.send('Usage: `.hl <amount|all>`');
    if (userData.balance < bet) {
      return message.channel.send("You don't have enough balance for this bet.");
    }

    // Deduct bet first
    userData.balance -= bet;
    await saveUserData({ balance: userData.balance });

    // Start with a random number (1-99, so the next is always possible)
    let current = Math.floor(Math.random() * 99) + 1;
    let streak = 0;

    const maxRounds = 3;
    const multipliers = [0, 1.5, 2.2, 3];
    // index = streak; streak 1→1.5x, 2→2.2x, 3→3x

    let embed = new EmbedBuilder()
      .setTitle('HIGHER OR LOWER')
      .setDescription(
        `> Current number: **${current}**\n\n` +
        `> React 🔼 for **Higher**, 🔽 for **Lower**.\n\n` +
        `> Streak: **0**\n` +
        `> Payout caps at **${multipliers[maxRounds]}×** after **${maxRounds}** correct guesses.`
      )
      .setColor(BLACK)
      .setFooter({ text: message.guild?.name || 'Shiro' });

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
          `> You survived **${streakCount}** round(s)! The next number was **${finalNum}**.\n` +
          `> **You won ${payout.toLocaleString()} coins!**`;
      } else {
        resultMsg =
          `> Your streak ended. The next number was **${finalNum}**.\n` +
          `> Streak: **${streakCount}** — you lost your bet.`;
      }

      const endEmbed = new EmbedBuilder()
        .setTitle('HIGHER OR LOWER — RESULT')
        .setDescription(resultMsg)
        .addFields({ name: 'Balance', value: `**${userData.balance.toLocaleString()}**`, inline: true })
        .setColor(BLACK)
        .setFooter({ text: message.guild?.name || 'Shiro' });

      await message.channel.send({ embeds: [endEmbed] });

      await trackStat(userData, 'gamesPlayed', 1);
      if (won) {
        await trackStat(userData, 'gamesWon', 1);
        await trackStat(userData, 'coinsWon', payout);
      }
      await saveUserData({ stats: userData.stats });
      await checkAchievements(userData, { message, saveUserData });

      if (won && client) {
        announceWin(client, {
          userId: message.author.id, username: message.author.username,
          avatarURL: message.author.displayAvatarURL({ dynamic: true }),
          game: 'highlow', bet, payout, multiplier: bet > 0 ? payout / bet : 0,
          detail: `${streakCount}-round streak`,
          logAdminAction,
        }).catch(() => {});
      }
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
            .setTitle('HIGHER OR LOWER')
            .setDescription(
              `> Correct! The new number is **${nextNum}**.\n\n` +
              `> React again to continue your streak.\n\n` +
              `> Streak: **${streak}** / ${maxRounds}\n` +
              `> Current potential: **${multipliers[streak]}×** if you make it to the end.`
            )
            .setColor(BLACK)
            .setFooter({ text: message.guild?.name || 'Shiro' });

          await statusMsg.edit({ embeds: [streakEmbed] });
        }
      } else {
        collector.stop('fail');
        return endGame(false, 0, streak, nextNum);
      }
    });

    collector.on('end', (_, reason) => {
      if (reason !== 'win' && reason !== 'fail') {
        message.channel.send('Higher or Lower game timed out.');
      }
    });
  },
};
