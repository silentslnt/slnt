const { EmbedBuilder } = require('discord.js');

const LOTTERY_PRICE = 500; // Ticket price
const LOTTERY_DRAW_ROLE_ID = '1382513369801555988'; // Replace with your role ID

// Use a global object to store lottery state in memory
const lotteryState = {
  tickets: [],  // Array of Discord user IDs
  pot: 0
};

module.exports = {
  name: 'lottery',
  description: 'Join the lottery or draw a winner. Usage: .lottery buy | .lottery status | .lottery draw',
  async execute({ message, args, userData, saveUserData, updateUserBalance }) {
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
      // Check if the user has the specific role
      if (!message.member.roles.cache.has(LOTTERY_DRAW_ROLE_ID)) {
        return message.channel.send('❌ You do not have permission to draw the lottery. Only authorized users can do this.');
      }

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

      return message.channel.send({ embeds: [winnerEmbed] });
    }

    // Default error/help
    return message.channel.send(
      `Usage: \`.lottery buy\` to buy a ticket (**${LOTTERY_PRICE}** coins, max 5 per user), \`.lottery status\` to check the pot, \`.lottery draw\` (authorized users only)`
    );
  }
};
