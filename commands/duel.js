// commands/duel.js
const { EmbedBuilder } = require('discord.js');
const { XP_PER_WIN, XP_PER_GAME } = require('../utils/config');
const { parseBet } = require('../utils/parseBet');
const { addXP } = require('../utils/xp');
const { trackStat, checkAchievements } = require('../utils/achievements');

const BLACK  = 0x000000;
const activeDuels = new Map();

module.exports = {
  name: 'duel',
  aliases: ['dl'],
  description: 'Challenge someone to a coin duel. `.duel @user <amount|all>`',

  async execute({ message, args, userData, saveUserData, getUserData, saveSpecificUserData, logAdminAction }) {
    const challenger = message.author;
    const opponent   = message.mentions.users.first();
    const bet        = parseBet(args[1], userData.balance || 0);

    if (!opponent || !bet) {
      return message.channel.send('Usage: `.duel @user <amount|all>`');
    }
    if (opponent.id === challenger.id) return message.channel.send('You cannot duel yourself.');
    if (opponent.bot) return message.channel.send('You cannot duel bots.');
    if (activeDuels.has(challenger.id) || activeDuels.has(opponent.id)) {
      return message.channel.send('One of you already has an active duel.');
    }
    if ((userData.balance || 0) < bet) return message.channel.send('Insufficient balance.');

    const opponentData = await getUserData(opponent.id);
    if (!opponentData || (opponentData.balance || 0) < bet) {
      return message.channel.send(`${opponent.username} doesn't have enough coins.`);
    }

    activeDuels.set(challenger.id, true);
    activeDuels.set(opponent.id,   true);

    // Challenge embed
    const challengeEmbed = new EmbedBuilder()
      .setTitle('DUEL CHALLENGE')
      .setColor(BLACK)
      .setDescription(
        `> ${challenger} challenges ${opponent} to a duel\n\n` +
        `> Stakes: **${bet.toLocaleString()}** coins each\n\n` +
        `-# ${opponent.username}, react ✅ to accept or ❌ to decline (30 seconds).`
      )
      .setFooter({ text: message.guild?.name || 'Shiro' });

    const msg = await message.channel.send({ embeds: [challengeEmbed] });
    await msg.react('✅');
    await msg.react('❌');

    const filter    = (r, u) => ['✅','❌'].includes(r.emoji.name) && u.id === opponent.id;
    const collector = msg.createReactionCollector({ filter, max: 1, time: 30_000 });

    collector.on('collect', async (reaction) => {
      if (reaction.emoji.name === '❌') {
        activeDuels.delete(challenger.id);
        activeDuels.delete(opponent.id);
        return msg.edit({
          embeds: [new EmbedBuilder().setColor(BLACK)
            .setTitle('DUEL DECLINED')
            .setDescription(`> ${opponent.username} declined the duel.`)],
        });
      }

      // Fight!
      const challengerWins = Math.random() < 0.5;
      const winner         = challengerWins ? challenger : opponent;
      const loser          = challengerWins ? opponent   : challenger;
      const winnerData     = challengerWins ? userData   : opponentData;
      const loserData      = challengerWins ? opponentData : userData;

      winnerData.balance    = (winnerData.balance || 0) + bet;
      loserData.balance     = (loserData.balance  || 0) - bet;
      winnerData.totalEarned = (winnerData.totalEarned || 0) + bet;

      if (challengerWins) {
        await saveUserData({ balance: winnerData.balance, totalEarned: winnerData.totalEarned });
        await saveSpecificUserData(opponent.id, { balance: loserData.balance });
      } else {
        await saveUserData({ balance: loserData.balance });
        await saveSpecificUserData(opponent.id, { balance: winnerData.balance, totalEarned: winnerData.totalEarned });
      }

      // XP & stats
      await addXP(winner.id, XP_PER_WIN,  winnerData, (d) => saveSpecificUserData(winner.id, d),  message);
      await addXP(loser.id,  XP_PER_GAME, loserData,  (d) => saveSpecificUserData(loser.id,  d),  message);

      const DUEL_FLAVOR = [
        `${winner.username} drew first and struck true!`,
        `${loser.username} hesitated — and paid the price!`,
        `${winner.username} moved like lightning — the duel was over in an instant!`,
        `The stars favored ${winner.username} tonight!`,
        `${winner.username} outsmarted their opponent completely!`,
      ];
      const flavor = DUEL_FLAVOR[Math.floor(Math.random() * DUEL_FLAVOR.length)];

      await msg.edit({
        embeds: [new EmbedBuilder().setColor(BLACK)
          .setTitle('DUEL CONCLUDED')
          .setDescription(
            `> ${flavor}\n\n` +
            `> **${winner.username}** wins **${bet.toLocaleString()}** coins\n` +
            `> **${loser.username}** loses **${bet.toLocaleString()}** coins\n\n` +
            `> ${winner.username}: **${winnerData.balance.toLocaleString()}** coins\n` +
            `> ${loser.username}: **${loserData.balance.toLocaleString()}** coins`
          )
          .setFooter({ text: message.guild?.name || 'Shiro' })],
      });

      await logAdminAction(winner.id, winner.username, 'duel', 'Duel Won', loser.id, loser.username, `${bet.toLocaleString()} coins`);

      activeDuels.delete(challenger.id);
      activeDuels.delete(opponent.id);
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        activeDuels.delete(challenger.id);
        activeDuels.delete(opponent.id);
        msg.edit({
          embeds: [new EmbedBuilder().setColor(BLACK)
            .setTitle('DUEL EXPIRED')
            .setDescription(`> ${opponent.username} didn't respond in time.`)],
        }).catch(() => {});
      }
    });
  },
};