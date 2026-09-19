const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { requireAdmin } = require('../utils/permissions');

const LOTTERY_PRICE = 500; // Ticket price

// Persisted so a bot restart/crash doesn't wipe the pot and tickets with
// no refund path — previously this was an in-memory-only object.
const lotteryStateSchema = new mongoose.Schema({
  _id:     { type: String, default: 'global' },
  tickets: { type: [String], default: [] },
  pot:     { type: Number, default: 0 },
});
const LotteryState = mongoose.models.LotteryState || mongoose.model('LotteryState', lotteryStateSchema);

// In-memory cache, kept in sync with Mongo on every mutation.
const lotteryState = { tickets: [], pot: 0 };
let loaded = false;

async function ensureLoaded() {
  if (loaded) return;
  const doc = await LotteryState.findByIdAndUpdate(
    'global',
    { $setOnInsert: { tickets: [], pot: 0 } },
    { upsert: true, new: true },
  );
  lotteryState.tickets = doc.tickets;
  lotteryState.pot     = doc.pot;
  loaded = true;
}

async function persist() {
  await LotteryState.updateOne(
    { _id: 'global' },
    { $set: { tickets: lotteryState.tickets, pot: lotteryState.pot } },
    { upsert: true },
  );
}

module.exports = {
  name: 'lottery',
  aliases: ['lot'],
  description: 'Join the lottery or draw a winner. Usage: .lottery buy | .lottery status | .lottery draw',
  async execute({ message, args, userData, saveUserData, updateUserBalance }) {
    await ensureLoaded();
    const userId = message.author.id;
    const sub = (args[0] || '').toLowerCase();

    // userData is already loaded from MongoDB by index.js
    if (typeof userData.balance !== 'number') userData.balance = 0;

    // Helper: count how many tickets this user currently has
    const getUserTicketCount = (id) =>
      lotteryState.tickets.filter(uid => uid === id).length;

    if (sub === 'buy') {
      const currentTickets = getUserTicketCount(userId);
      if (currentTickets >= 5) {
        return message.channel.send('❌ You already own the maximum of **5** lottery tickets.');
      }

      if (userData.balance < LOTTERY_PRICE)
        return message.channel.send(`You need at least ${LOTTERY_PRICE} to buy a lottery ticket.`);

      // Deduct and assign ticket
      userData.balance -= LOTTERY_PRICE;
      lotteryState.pot += LOTTERY_PRICE;
      lotteryState.tickets.push(userId);

      // Persist to MongoDB – one argument, wrapper adds userId
      await saveUserData({ balance: userData.balance });
      await persist();

      const boughtEmbed = new EmbedBuilder()
        .setTitle('˗ˏˋ 𐙚 🎟️ 𝔏𝔬𝔱𝔱𝔢𝔯𝔶 𝔗𝔦𝔠𝔨𝔢𝔱 𝔅𝔬𝔲𝔤𝔥𝔱! 𐙚 ˎˊ˗')
        .setDescription(
          [
            `You spent **${LOTTERY_PRICE}** coins on a celestial ticket.`,
            `You now have **${currentTickets + 1}/5** tickets.`
          ].join('\n')
        )
        .addFields(
          { name: '💰 Total Pot', value: `**${lotteryState.pot}** coins`, inline: true },
          { name: '🎫 Tickets Sold', value: `**${lotteryState.tickets.length}**`, inline: true }
        )
        .setColor('#F5E6FF')
        .setTimestamp();

      return message.channel.send({ embeds: [boughtEmbed] });
    }

    if (sub === 'status') {
      const pot = lotteryState.pot;
      const tickets = lotteryState.tickets.length;
      const embed = new EmbedBuilder()
        .setTitle('˗ˏˋ 𐙚 🎰 𝔏𝔬𝔱𝔱𝔢𝔯𝔶 𝔖𝔱𝔞𝔱𝔲𝔰 𐙚 ˎˊ˗')
        .setDescription('꒰ঌ current celestial pot & ticket count ໒꒱')
        .addFields(
          { name: '💰 Total Pot', value: `**${pot}** coins`, inline: true },
          { name: '🎫 Tickets Sold', value: `**${tickets}**`, inline: true }
        )
        .setColor('#F5E6FF')
        .setTimestamp();
      return message.channel.send({ embeds: [embed] });
    }

    if (sub === 'draw') {
      if (!await requireAdmin(message)) return;

      if (!lotteryState.tickets.length) {
        return message.channel.send('No tickets have been bought yet!');
      }

      // Draw winner
      const winnerIdx = Math.floor(Math.random() * lotteryState.tickets.length);
      const winnerId = lotteryState.tickets[winnerIdx];

      // Award winnings to winner
      if (winnerId === userId) {
        userData.balance += lotteryState.pot;
        await saveUserData({ balance: userData.balance });
      } else {
        await updateUserBalance(winnerId, lotteryState.pot);
      }

      const winnerEmbed = new EmbedBuilder()
        .setTitle('˗ˏˋ 𐙚 🎉 𝔏𝔬𝔱𝔱𝔢𝔯𝔶 𝔇𝔯𝔞𝔴𝔫! 𐙚 ˎˊ˗')
        .setDescription(
          [
            `✨ <@${winnerId}> has been blessed by the celestial raffle!`,
            `They win the entire pot of **${lotteryState.pot}** coins.`
          ].join('\n')
        )
        .setColor('#C1FFD7')
        .setTimestamp();

      // Reset state
      lotteryState.tickets = [];
      lotteryState.pot = 0;
      await persist();

      return message.channel.send({ embeds: [winnerEmbed] });
    }

    // Default error/help
    return message.channel.send(
      `Usage: \`.lottery buy\` to buy a ticket (**${LOTTERY_PRICE}** coins, max 5 per user), \`.lottery status\` to check the pot, \`.lottery draw\` (authorized users only)`
    );
  }
};
