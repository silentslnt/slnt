const { EmbedBuilder } = require('discord.js');

// Track active games per user
const activeGames = new Set();

function getCard() {
  const values = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 11];
  const suits = ['♠️', '♥️', '♦️', '♣️'];
  const val = values[Math.floor(Math.random() * values.length)];
  const suit = suits[Math.floor(Math.random() * suits.length)];
  const valDisplay =
    val === 11
      ? 'A'
      : val === 10
      ? ['10', 'J', 'Q', 'K'][Math.floor(Math.random() * 4)]
      : val;
  return { val, display: `${valDisplay}${suit}` };
}

function handValue(hand) {
  let sum = hand.reduce((t, c) => t + c.val, 0);
  let aces = hand.filter(c => c.val === 11).length;
  while (sum > 21 && aces > 0) {
    sum -= 10;
    aces--;
  }
  return sum;
}

module.exports = {
  name: 'blackjack',
  description: 'Play blackjack and win double your bet!',
  async execute({ message, args, userData, saveUserData }) {
    const bet = parseInt(args[0]);
    const userId = message.author.id;

    if (activeGames.has(userId)) {
      return message.channel.send('❌ You already have an active blackjack game! Finish it first.');
    }

    if (!bet || isNaN(bet) || bet <= 0) {
      return message.channel.send('Usage: `.blackjack <amount>`');
    }

    if (typeof userData.balance !== 'number') userData.balance = 0;

    if (userData.balance < bet) {
      return message.channel.send('Insufficient balance.');
    }

    activeGames.add(userId);

    userData.balance -= bet;
    await saveUserData({ balance: userData.balance });

    let playerHand = [getCard(), getCard()];
    let dealerHand = [getCard(), getCard()];
    let gameOver = false;

    function createEmbed(desc = '') {
      return new EmbedBuilder()
        .setTitle('˗ˏˋ 𐙚 🃏 𝔅𝔩𝔞𝔠𝔨𝔧𝔞𝔠𝔨 🃏 𐙚 ˎˊ˗')
        .addFields(
          {
            name: '꒰ঌ Your Hand ໒꒱',
            value: playerHand.map(c => c.display).join(' '),
            inline: true
          },
          {
            name: '꒰ঌ Dealer Hand ໒꒱',
            value: `${dealerHand[0].display} 🂠`,
            inline: true
          },
          {
            name: '⭐ Your Value',
            value: handValue(playerHand).toString(),
            inline: false
          }
        )
        .setDescription(
          desc ||
          'React ✅ to **Hit** or ⏹️ to **Stand**.\n\n꒰ঌ Try to reach **21** without busting ໒꒱'
        )
        .setColor('#F5E6FF')
        .setTimestamp()
        .setFooter({ text: 'System • Blackjack Table' });
    }

    const gameEmbed = createEmbed();
    const statusMsg = await message.channel.send({ embeds: [gameEmbed] });

    await statusMsg.react('✅');
    await statusMsg.react('⏹️');

    const filter = (reaction, user) =>
      ['✅', '⏹️'].includes(reaction.emoji.name) && user.id === userId;

    const collector = statusMsg.createReactionCollector({ filter, time: 60000 });

    collector.on('collect', async (reaction, user) => {
      if (gameOver) return;

      await reaction.users.remove(user.id).catch(() => {});

      if (reaction.emoji.name === '✅') {
        playerHand.push(getCard());
        const pVal = handValue(playerHand);

        if (pVal > 21) {
          gameOver = true;
          collector.stop();
          const bustEmbed = createEmbed('💥 You busted! Dealer wins.');
          bustEmbed.setColor('#FFB3C6');
          await statusMsg.edit({ embeds: [bustEmbed] });
          endGame();
        } else if (pVal === 21) {
          gameOver = true;
          collector.stop();
          await statusMsg.edit({
            embeds: [createEmbed('🎯 **21!** Standing automatically...')]
          });
          await dealerTurn();
        } else {
          await statusMsg.edit({
            embeds: [createEmbed('✅ Hit registered! React again to draw another card.')]
          });
        }
      } else if (reaction.emoji.name === '⏹️') {
        gameOver = true;
        collector.stop();
        await dealerTurn();
      }
    });

    collector.on('end', () => {
      if (!gameOver) {
        message.channel.send('⏱️ Game timed out.');
        endGame();
      }
    });

    async function dealerTurn() {
      while (handValue(dealerHand) < 17) {
        dealerHand.push(getCard());
      }

      const pVal = handValue(playerHand);
      const dVal = handValue(dealerHand);

      let result = '';
      let color = '#FFFF00';

      if (pVal > 21) {
        result = '💥 You busted! Dealer wins.';
        color = '#FFB3C6';
      } else if (dVal > 21) {
        userData.balance += bet * 2;
        await saveUserData({ balance: userData.balance });
        result = `🎉 Dealer busted! You win **${bet * 2}** coins!`;
        color = '#C1FFD7';
      } else if (pVal > dVal) {
        userData.balance += bet * 2;
        await saveUserData({ balance: userData.balance });
        result = `🎉 You beat the dealer! You win **${bet * 2}** coins!`;
        color = '#C1FFD7';
      } else if (pVal === dVal) {
        userData.balance += bet;
        await saveUserData({ balance: userData.balance });
        result = '🤝 Push! Your bet has been returned.';
        color = '#F5E6FF';
      } else {
        result = '😔 Dealer wins!';
        color = '#FFB3C6';
      }

      const finalEmbed = new EmbedBuilder()
        .setTitle('˗ˏˋ 𐙚 🃏 𝔅𝔩𝔞𝔠𝔨𝔧𝔞𝔠𝔨 ℝ𝕖𝕤𝕦𝕝𝕥 🃏 𐙚 ˎˊ˗')
        .addFields(
          {
            name: '꒰ঌ Your Hand ໒꒱',
            value: playerHand.map(c => c.display).join(' '),
            inline: true
          },
          {
            name: '꒰ঌ Dealer Hand ໒꒱',
            value: dealerHand.map(c => c.display).join(' '),
            inline: true
          },
          { name: '⭐ Your Value', value: pVal.toString(), inline: true },
          { name: '🂠 Dealer Value', value: dVal.toString(), inline: true },
          {
            name: '💰 New Balance',
            value: userData.balance.toString(),
            inline: false
          }
        )
        .setDescription(result)
        .setColor(color)
        .setTimestamp()
        .setFooter({ text: 'System • Blackjack Table' });

      await message.channel.send({ embeds: [finalEmbed] });
      endGame();
    }

    function endGame() {
      activeGames.delete(userId);
    }
  },
};
