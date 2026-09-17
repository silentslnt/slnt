// commands/blackjack.js
const { EmbedBuilder } = require('discord.js');
const { COLOR, XP_PER_GAME, XP_PER_WIN } = require('../utils/config');
const { requireAdmin } = require('../utils/permissions');
const { parseBet } = require('../utils/parseBet');
const { getMultiplier, getLuckBonus, getActiveEssenceSummary } = require('../utils/essences');
const { addXP } = require('../utils/xp');
const { trackStat, checkAchievements } = require('../utils/achievements');
const { awardPoints } = require('../utils/sentinelDb');

const activeGames = new Set();

function getCard() {
  const values = [2,3,4,5,6,7,8,9,10,10,10,10,11];
  const suits  = ['♠️','♥️','♦️','♣️'];
  const val    = values[Math.floor(Math.random() * values.length)];
  const suit   = suits[Math.floor(Math.random() * suits.length)];
  const disp   = val === 11 ? 'A' : val === 10 ? ['10','J','Q','K'][Math.floor(Math.random()*4)] : String(val);
  return { val, display: `${disp}${suit}` };
}

function handValue(hand) {
  let sum  = hand.reduce((t, c) => t + c.val, 0);
  let aces = hand.filter(c => c.val === 11).length;
  while (sum > 21 && aces-- > 0) sum -= 10;
  return sum;
}

module.exports = {
  name: 'blackjack',
  aliases: ['bj'],
  adminOnly: true,
  description: 'Play blackjack. `.bj <amount|all>`',

  async execute({ message, args, userData, saveUserData }) {
    if (!await requireAdmin(message)) return;

    const bet = parseBet(args[0], userData.balance || 0);
    const userId = message.author.id;

    if (!bet) return message.channel.send('Usage: `.bj <amount|all>`');
    if (activeGames.has(userId)) return message.channel.send('❌ You already have an active blackjack game!');
    if ((userData.balance || 0) < bet) return message.channel.send('❌ Insufficient balance.');

    // Check insurance slip
    const hasInsurance = (userData.inventory?.['Insurance Slip'] || 0) > 0;

    activeGames.add(userId);
    userData.balance -= bet;
    await saveUserData({ balance: userData.balance });

    let playerHand = [getCard(), getCard()];
    let dealerHand = [getCard(), getCard()];
    let gameOver   = false;
    let naturalBJ  = false;

    // Check natural 21
    if (handValue(playerHand) === 21) naturalBJ = true;

    const luckBonus   = getLuckBonus(userData);
    const frenzyMult  = getMultiplier(userData, 'frenzy');
    const coinMult    = getMultiplier(userData, 'coins');
    const activeEss   = getActiveEssenceSummary(userData);

    function buildEmbed(desc) {
      const e = new EmbedBuilder()
        .setTitle('˗ˏˋ 𐙚 🃏 𝔅𝔩𝔞𝔠𝔨𝔧𝔞𝔠𝔨 🃏 𐙚 ˎˊ˗')
        .setColor(COLOR.DEFAULT)
        .addFields(
          { name: '꒰ঌ Your Hand ໒꒱',   value: playerHand.map(c=>c.display).join(' '), inline: true },
          { name: '꒰ঌ Dealer Hand ໒꒱',  value: `${dealerHand[0].display} 🂠`,          inline: true },
          { name: '⭐ Your Value',        value: String(handValue(playerHand)),          inline: false },
        )
        .setDescription(desc || 'React ✅ **Hit** · ⏹️ **Stand**' + (hasInsurance ? '\n🛡️ *Insurance Slip ready*' : ''))
        .setTimestamp()
        .setFooter({ text: 'System • Blackjack' + (activeEss ? ' • Essences active' : '') });
      return e;
    }

    const msg = await message.channel.send({ embeds: [buildEmbed()] });
    await msg.react('✅');
    await msg.react('⏹️');

    const filter = (r, u) => ['✅','⏹️'].includes(r.emoji.name) && u.id === userId;
    const collector = msg.createReactionCollector({ filter, time: 60000 });

    collector.on('collect', async (reaction, user) => {
      if (gameOver) return;
      await reaction.users.remove(user.id).catch(() => {});

      if (reaction.emoji.name === '✅') {
        playerHand.push(getCard());
        const pv = handValue(playerHand);
        if (pv > 21) {
          gameOver = true;
          collector.stop();

          // Insurance slip negates the loss
          if (hasInsurance) {
            userData.inventory['Insurance Slip']--;
            if (userData.inventory['Insurance Slip'] <= 0) delete userData.inventory['Insurance Slip'];
            userData.balance += bet;
            await saveUserData({ balance: userData.balance, inventory: userData.inventory });
            await msg.edit({ embeds: [buildEmbed('💥 Busted! 🛡️ **Insurance Slip** saved you — bet returned.')] });
          } else {
            await msg.edit({ embeds: [buildEmbed('💥 You busted! Dealer wins.')] });
          }
          await finalize(false, 0);
        } else if (pv === 21) {
          gameOver = true;
          collector.stop();
          await msg.edit({ embeds: [buildEmbed('🎯 **21!** Auto-standing...')] });
          await dealerTurn();
        } else {
          await msg.edit({ embeds: [buildEmbed('✅ Hit! React again to draw or ⏹️ to stand.')] });
        }
      } else {
        gameOver = true;
        collector.stop();
        await dealerTurn();
      }
    });

    collector.on('end', () => {
      if (!gameOver) { message.channel.send('⏱️ Blackjack timed out.'); finalize(false, 0); }
    });

    async function dealerTurn() {
      while (handValue(dealerHand) < 17) dealerHand.push(getCard());
      const pv = handValue(playerHand);
      const dv = handValue(dealerHand);

      let result = '';
      let color  = COLOR.DEFAULT;
      let won    = false;
      let payout = 0;

      if (pv > 21) {
        result = '💥 You busted!';
        color  = COLOR.LOSS;
      } else if (dv > 21) {
        payout = Math.floor(bet * 2 * frenzyMult * coinMult);
        won    = true;
        result = `🎉 Dealer busted! You win **${payout.toLocaleString()}** coins!`;
        color  = COLOR.WIN;
      } else if (naturalBJ && pv === 21) {
        // Natural blackjack = 2.5x
        payout = Math.floor(bet * 2.5 * frenzyMult * coinMult);
        won    = true;
        result = `♠ **Natural Blackjack!** You win **${payout.toLocaleString()}** coins!`;
        color  = COLOR.PRESTIGE;
      } else if (pv > dv) {
        payout = Math.floor(bet * 2 * frenzyMult * coinMult);
        won    = true;
        result = `🎉 You beat the dealer! You win **${payout.toLocaleString()}** coins!`;
        color  = COLOR.WIN;
      } else if (pv === dv) {
        payout = bet;
        result = '🤝 Push! Bet returned.';
        color  = COLOR.DEFAULT;
      } else {
        result = '😔 Dealer wins!';
        color  = COLOR.LOSS;
      }

      if (won || pv === dv) {
        userData.balance += payout;
        await saveUserData({ balance: userData.balance });
        if (won && message.guild) {
          const pts = Math.min(40, Math.max(5, Math.floor(payout / 500)));
          await awardPoints(message.guild.id, message.author.id, pts);
        }
      }

      const finalEmbed = new EmbedBuilder()
        .setTitle('˗ˏˋ 𐙚 🃏 𝔅𝔩𝔞𝔠𝔨𝔧𝔞𝔠𝔨 ℝ𝕖𝕤𝕦𝕝𝕥 𐙚 ˎˊ˗')
        .setColor(color)
        .setDescription(result)
        .addFields(
          { name: '꒰ঌ Your Hand ໒꒱',  value: playerHand.map(c=>c.display).join(' '), inline: true },
          { name: '꒰ঌ Dealer Hand ໒꒱', value: dealerHand.map(c=>c.display).join(' '), inline: true },
          { name: '⭐ Your Value',       value: String(pv), inline: true },
          { name: '🂠 Dealer Value',     value: String(dv), inline: true },
          { name: '💰 New Balance',      value: `**${userData.balance.toLocaleString()}** coins`, inline: false },
        )
        .setTimestamp()
        .setFooter({ text: frenzyMult > 1 ? `🎮 ${frenzyMult}× Frenzy Essence active!` : 'System • Blackjack' });

      await message.channel.send({ embeds: [finalEmbed] });
      await finalize(won, payout);
    }

    async function finalize(won, payout) {
      activeGames.delete(userId);

      // XP
      await addXP(userId, won ? XP_PER_WIN : XP_PER_GAME, userData, saveUserData, message);

      // Stats
      userData.stats = userData.stats || {};
      userData.stats.gamesPlayed = (userData.stats.gamesPlayed || 0) + 1;
      if (won) {
        userData.stats.gamesWon  = (userData.stats.gamesWon || 0) + 1;
        userData.stats.coinsWon  = (userData.stats.coinsWon || 0) + payout;
        if (naturalBJ) userData.stats.blackjack21 = (userData.stats.blackjack21 || 0) + 1;
      }
      await saveUserData({ stats: userData.stats });
      await checkAchievements(userData, { message, saveUserData });
    }
  },
};