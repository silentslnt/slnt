// commands/coinflip.js
const { EmbedBuilder } = require('discord.js');
const { XP_PER_GAME, XP_PER_WIN } = require('../utils/config');

const BLACK = 0x000000;
const { requireAdmin } = require('../utils/permissions');
const { parseBet } = require('../utils/parseBet');
const { getMultiplier, getLuckBonus } = require('../utils/essences');
const { addXP } = require('../utils/xp');
const { trackStat, checkAchievements } = require('../utils/achievements');
const { awardPoints } = require('../utils/sentinelDb');

const SPIN_FRAMES = ['🪙', '✨', '💫', '⭐', '🪙'];

module.exports = {
  name: 'coinflip',
  aliases: ['cf'],
  adminOnly: true,
  description: 'Flip a coin. `.cf <amount|all|max> <h|t>`',

  async execute({ message, args, userData, saveUserData }) {
    if (!await requireAdmin(message)) return;

    const betArg  = args[0];
    const sideArg = (args[1] || '').toLowerCase();
    const bet     = parseBet(betArg, userData.balance || 0);

    if (!bet || !['h', 't', 'heads', 'tails'].includes(sideArg)) {
      return message.channel.send({
        embeds: [new EmbedBuilder().setColor(BLACK)
          .setTitle('COINFLIP')
          .setDescription(
            '> Usage: `.cf <amount|all|max> <h|t>`\n\n' +
            '__**Examples**__\n' +
            '> `.cf 500 h` — bet 500 on heads\n' +
            '> `.cf all t` — bet all on tails\n' +
            '> `.cf max h` — bet max on heads'
          )
          .setFooter({ text: message.guild?.name || 'Shiro' })],
      });
    }

    if ((userData.balance || 0) < bet) {
      return message.channel.send('Insufficient balance.');
    }

    const pickedHeads = sideArg.startsWith('h');
    const luckBonus   = getLuckBonus(userData);
    const frenzyMult  = getMultiplier(userData, 'frenzy');
    const coinMult    = getMultiplier(userData, 'coins');

    // Luck essence shifts win probability slightly
    const winChance   = 0.5 + luckBonus;
    const won         = Math.random() < winChance;
    const landedHeads = won ? pickedHeads : !pickedHeads;
    const result      = landedHeads ? 'Heads 🪙' : 'Tails 🌑';
    const picked      = pickedHeads ? 'Heads 🪙' : 'Tails 🌑';

    // Animation
    const spinMsg = await message.channel.send({
      embeds: [new EmbedBuilder().setColor(BLACK)
        .setTitle('FLIPPING...')
        .setDescription(`${SPIN_FRAMES[0]} Spinning...`)
        .setFooter({ text: message.guild?.name || 'Shiro' })],
    });
    for (let i = 1; i < SPIN_FRAMES.length; i++) {
      await new Promise(r => setTimeout(r, 300));
      await spinMsg.edit({
        embeds: [new EmbedBuilder().setColor(BLACK)
          .setTitle('FLIPPING...')
          .setDescription(`${SPIN_FRAMES[i]} Spinning...`)
          .setFooter({ text: message.guild?.name || 'Shiro' })],
      });
    }

    // Calculate payout
    let payout = 0;
    userData.balance = (userData.balance || 0) - bet;

    if (won) {
      payout           = Math.floor(bet * 2 * frenzyMult * coinMult);
      userData.balance += payout;
      userData.totalEarned = (userData.totalEarned || 0) + payout;
    }

    // Streak tracking
    userData.stats = userData.stats || {};
    if (won) {
      userData.stats.cfStreak = (userData.stats.cfStreak || 0) + 1;
    } else {
      userData.stats.cfStreak = 0;
    }

    const cfStreak = userData.stats.cfStreak;
    let streakBonus = 0;
    let streakNote  = '';
    if (won && cfStreak > 0 && cfStreak % 5 === 0) {
      streakBonus       = Math.floor(bet * 0.5);
      userData.balance += streakBonus;
      streakNote        = `\n> **${cfStreak}-flip streak bonus:** +${streakBonus.toLocaleString()} coins!`;
    }

    await saveUserData({ balance: userData.balance, totalEarned: userData.totalEarned, stats: userData.stats });
    await addXP(message.author.id, won ? XP_PER_WIN : XP_PER_GAME, userData, saveUserData, message);
    if (won && message.guild) {
      const pts = Math.min(30, Math.max(5, Math.floor(payout / 500)));
      await awardPoints(message.guild.id, message.author.id, pts);
    }

    userData.stats.gamesPlayed = (userData.stats.gamesPlayed || 0) + 1;
    if (won) {
      userData.stats.gamesWon  = (userData.stats.gamesWon || 0) + 1;
      userData.stats.coinsWon  = (userData.stats.coinsWon || 0) + payout;
    }
    await saveUserData({ stats: userData.stats });
    await checkAchievements(userData, { message, saveUserData });

    const embed = new EmbedBuilder()
      .setTitle('COINFLIP RESULT')
      .setColor(BLACK)
      .addFields(
        { name: 'Result',     value: result,                                   inline: true },
        { name: 'You Picked', value: picked,                                   inline: true },
        { name: 'Bet',        value: bet.toLocaleString(),                     inline: true },
        { name: won ? 'Won' : 'Lost', value: won ? `+${payout.toLocaleString()}` : `-${bet.toLocaleString()}`, inline: true },
        { name: 'Balance',    value: userData.balance.toLocaleString(),        inline: true },
        { name: 'CF Streak',  value: `${cfStreak} flips`,                     inline: true },
      )
      .setDescription(
        won
          ? `> **${result}!** You win **${payout.toLocaleString()}** coins!${streakNote}`
          : `> **${result}!** You picked ${picked}. Better luck next time.`
      )
      .setFooter({
        text: [
          frenzyMult > 1 ? `${frenzyMult}× Frenzy` : '',
          luckBonus   > 0 ? `+${luckBonus * 100}% luck` : '',
          message.guild?.name || 'Shiro',
        ].filter(Boolean).join(' — '),
      });

    await spinMsg.edit({ embeds: [embed] });
  },
};