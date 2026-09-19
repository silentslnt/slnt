// commands/duel.js
const { EmbedBuilder } = require('discord.js');
const { COLOR, XP_PER_WIN, XP_PER_GAME } = require('../utils/config');
const { requireAdmin } = require('../utils/permissions');
const { parseBet } = require('../utils/parseBet');
const { addXP } = require('../utils/xp');
const { trackStat, checkAchievements } = require('../utils/achievements');

const activeDuels = new Map();

module.exports = {
  name: 'duel',
  aliases: ['dl'],
  adminOnly: true,
  description: 'Challenge someone to a coin duel. `.duel @user <amount|all>`',

  async execute({ message, args, userData, saveUserData, getUserData, saveSpecificUserData }) {
    if (!await requireAdmin(message)) return;

    const challenger = message.author;
    const opponent   = message.mentions.users.first();
    const bet        = parseBet(args[1], userData.balance || 0);

    if (!opponent || !bet) {
      return message.channel.send('Usage: `.duel @user <amount|all>`');
    }
    if (opponent.id === challenger.id) return message.channel.send('❌ You cannot duel yourself.');
    if (opponent.bot) return message.channel.send('❌ You cannot duel bots.');
    if (activeDuels.has(challenger.id) || activeDuels.has(opponent.id)) {
      return message.channel.send('❌ One of you already has an active duel.');
    }
    if ((userData.balance || 0) < bet) return message.channel.send('❌ Insufficient balance.');

    const opponentData = await getUserData(opponent.id);
    if (!opponentData || (opponentData.balance || 0) < bet) {
      return message.channel.send(`❌ ${opponent.username} doesn't have enough coins.`);
    }

    activeDuels.set(challenger.id, true);
    activeDuels.set(opponent.id,   true);

    // Challenge embed
    const challengeEmbed = new EmbedBuilder()
      .setTitle('˗ˏˋ 𐙚 ⚔️ ᴅᴜᴇʟ ᴄʜᴀʟʟᴇɴɢᴇ ᴅᴇᴄʟᴀʀᴇᴅ 𐙚 ˎˊ˗')
      .setColor(COLOR.WARNING)
      .setDescription(
        `${challenger} **challenges** ${opponent} to a duel!\n\n` +
        `⚔️ Stakes: **${bet.toLocaleString()}** coins each\n\n` +
        `꒰ঌ ${opponent.username}, react ✅ to accept or ❌ to decline ໒꒱\n` +
        `_(30 seconds to respond)_`
      )
      .setFooter({ text: 'System • Duel' });

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
          embeds: [new EmbedBuilder().setColor(COLOR.LOSS)
            .setTitle('˗ˏˋ 𐙚 ⚔️ Duel Declined 𐙚 ˎˊ˗')
            .setDescription(`꒰ঌ ${opponent.username} declined the duel ໒꒱`)],
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
        embeds: [new EmbedBuilder().setColor(COLOR.WIN)
          .setTitle('˗ˏˋ 𐙚 ⚔️ ᴅᴜᴇʟ ᴄᴏɴᴄʟᴜᴅᴇᴅ 𐙚 ˎˊ˗')
          .setDescription(
            `꒰ঌ ${flavor} ໒꒱\n\n` +
            `🏆 **${winner.username}** wins **${bet.toLocaleString()}** coins!\n` +
            `💀 **${loser.username}** loses ${bet.toLocaleString()} coins.`
          )
          .addFields(
            { name: `⚔️ ${winner.username}`, value: `${(winnerData.balance).toLocaleString()} coins`, inline: true },
            { name: `🛡️ ${loser.username}`,  value: `${(loserData.balance).toLocaleString()} coins`,  inline: true },
          )
          .setFooter({ text: 'System • Duel' })
          .setTimestamp()],
      });

      activeDuels.delete(challenger.id);
      activeDuels.delete(opponent.id);
    });

    collector.on('end', (_, reason) => {
      if (reason === 'time') {
        activeDuels.delete(challenger.id);
        activeDuels.delete(opponent.id);
        msg.edit({
          embeds: [new EmbedBuilder().setColor(COLOR.LOSS)
            .setTitle('˗ˏˋ 𐙚 ⚔️ Duel Expired 𐙚 ˎˊ˗')
            .setDescription(`꒰ঌ ${opponent.username} didn't respond in time ໒꒱`)],
        }).catch(() => {});
      }
    });
  },
};