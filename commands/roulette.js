// commands/roulette.js — European Roulette (0-36)
const { EmbedBuilder } = require('discord.js');
const { XP_PER_GAME, XP_PER_WIN } = require('../utils/config');

const CHECK = '<:check:1547659779877642360>';
const XMARK = '<:xmark:1547659816783061153>';
const BLACK = 0x000000;
const { parseBet } = require('../utils/parseBet');
const { getMultiplier, getLuckBonus } = require('../utils/essences');
const { addXP } = require('../utils/xp');
const { trackStat, checkAchievements } = require('../utils/achievements');
const { awardPoints } = require('../utils/sentinelDb');
const { randomFloat } = require('../utils/rng');
const { announceWin } = require('../utils/winAnnouncer');
const { recordRound } = require('../utils/houseBank');
const { casinoPayout, casinoLuck } = require('../utils/houseEdge');

// European roulette wheel — 37 slots (0 green, 1-18 alternating red/black)
const RED_NUMS   = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const BLACK_NUMS = new Set([2,4,6,8,10,11,13,15,17,20,22,24,26,28,29,31,33,35]);

function spinWheel() {
  const num = Math.floor(randomFloat() * 37); // 0-36
  const color = num === 0 ? 'green' : RED_NUMS.has(num) ? 'red' : 'black';
  return { num, color };
}

const COLOR_EMOJI = { red: '🟥', black: '⬛', green: '🟩' };
const COLOR_LABEL = { red: 'RED', black: 'BLACK', green: 'GREEN (0)' };

// Payouts (return including stake): red/black 2x, number 35x, green 17x
const PAYOUT = { red: 2, black: 2, number: 35, green: 17 };  // 0–36 wheel: every bet returns < 100%

module.exports = {
  name: 'roulette',
  aliases: ['rl', 'spin'],
  description: 'Bet on red, black, green, or a number. `.rl <bet> <red|black|green|0-36>`',

  async execute({ message, args, userData, saveUserData, client, logAdminAction }) {
    const betArg    = args[0];
    const choiceRaw = (args[1] || '').toLowerCase();
    const bet       = parseBet(betArg, userData.balance || 0);

    // Validate bet choice
    let betType = null;
    let betNumber = null;
    if (['red','black','green'].includes(choiceRaw)) {
      betType = choiceRaw;
    } else if (choiceRaw !== '' && !isNaN(parseInt(choiceRaw))) {
      const n = parseInt(choiceRaw);
      if (n >= 0 && n <= 36) { betType = 'number'; betNumber = n; }
    }

    if (!bet || !betType) {
      return message.channel.send({
        embeds: [new EmbedBuilder().setColor(BLACK)
          .setTitle('ROULETTE')
          .setDescription(
            '> Usage: `.rl <bet> <choice>`\n\n' +
            '__**Choices & Payouts**__\n' +
            '> `red` / `black` → **2×** (48.6% win)\n' +
            '> `green` → **18×** (2.7% win)\n' +
            '> `0`–`36` → **36×** (2.7% win)\n\n' +
            '__**Examples**__\n' +
            '> `.rl 500 red` · `.rl 1000 7` · `.rl all black`'
          )
          .setFooter({ text: `${message.guild?.name || 'Shiro'} — RTP ~97%` })],
      });
    }

    if ((userData.balance || 0) < bet) {
      return message.channel.send(`You only have **${(userData.balance||0).toLocaleString()}** coins.`);
    }

    userData.balance = (userData.balance || 0) - bet;
    await saveUserData({ balance: userData.balance });

    const result = spinWheel();

    // Determine win
    let won = false;
    if (betType === 'number') won = result.num === betNumber;
    else if (betType === 'red')   won = result.color === 'red';
    else if (betType === 'black') won = result.color === 'black';
    else if (betType === 'green') won = result.color === 'green';

    const baseMulti  = won ? PAYOUT[betType] : 0;
    const frenzy     = won ? getMultiplier(userData, 'frenzy') : 1;
    const finalMulti = baseMulti;
    const payout     = won ? casinoPayout(bet, bet * finalMulti, userData) : 0;
    const profit     = payout - bet;

    if (won) {
      userData.balance     = (userData.balance || 0) + payout;
      userData.totalEarned = (userData.totalEarned || 0) + profit;
      await saveUserData({ balance: userData.balance, totalEarned: userData.totalEarned });
    }

    await addXP(message.author.id, XP_PER_GAME + (won ? XP_PER_WIN : 0), userData, saveUserData, message);
    if (won && message.guild) {
      const pts = betType === 'number' ? 50 : betType === 'green' ? 35 : Math.min(30, Math.max(5, Math.floor(profit / 500)));
      await awardPoints(message.guild.id, message.author.id, pts);
    }
    recordRound('roulette', bet, payout);
    await trackStat(userData, 'gamesPlayed', 1);
    if (won) {
      await trackStat(userData, 'gamesWon', 1);
      await trackStat(userData, 'coinsWon', profit);
    }
    await checkAchievements(userData, { message, saveUserData });

    const resultEmoji = COLOR_EMOJI[result.color];
    const betLabel    = betType === 'number' ? `Number ${betNumber}` : betType.charAt(0).toUpperCase() + betType.slice(1);

    let statusLine;
    if (won) {
      statusLine = frenzy > 1
        ? `${CHECK} **${resultEmoji} ${result.num} (${COLOR_LABEL[result.color]})** — ×${baseMulti} + Frenzy 5% **+${profit.toLocaleString()}** coins`
        : `${CHECK} **${resultEmoji} ${result.num} (${COLOR_LABEL[result.color]})** — ×${baseMulti} — **+${profit.toLocaleString()}** coins`;
    } else {
      statusLine = `${XMARK} **${resultEmoji} ${result.num} (${COLOR_LABEL[result.color]})** — not ${betLabel}. Lost **${bet.toLocaleString()}** coins.`;
    }

    const embed = new EmbedBuilder()
      .setColor(BLACK)
      .setTitle('ROULETTE')
      .setDescription(
        `> ${statusLine}\n\n` +
        `> Bet: \`${bet.toLocaleString()}\` on \`${betLabel}\`\n` +
        `> Balance: \`${(userData.balance || 0).toLocaleString()}\``
      )
      .setFooter({ text: `${message.guild?.name || 'Shiro'} — RTP ~97%` });

    await message.channel.send({ embeds: [embed] });

    if (client && won) {
      announceWin(client, {
        userId: message.author.id,
        username: message.author.username,
        avatarURL: message.author.displayAvatarURL({ dynamic: true }),
        game: 'roulette',
        bet,
        payout,
        multiplier: finalMulti,
        detail: `bet ${betLabel}, landed ${result.num} ${COLOR_LABEL[result.color]}`,
        logAdminAction,
      }).catch(() => {});
    }
  },
};
