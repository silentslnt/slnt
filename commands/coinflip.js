// commands/coinflip.js
const { XP_PER_GAME, XP_PER_WIN } = require('../utils/config');

const BLACK = 0x000000;
const { parseBet } = require('../utils/parseBet');
const { getMultiplier, getLuckBonus } = require('../utils/essences');
const { addXP } = require('../utils/xp');
const { trackStat, checkAchievements } = require('../utils/achievements');
const { awardPoints } = require('../utils/sentinelDb');
const { announceWin } = require('../utils/winAnnouncer');
const { recordRound } = require('../utils/houseBank');
const { casinoPayout, casinoLuck } = require('../utils/houseEdge');
const { card, gameResult, attachReplay } = require('../utils/casino');

const CF_FEE = 0.10;   // taken from the winnings of every winning flip

const SPIN_FRAMES = ['🪙', '✨', '💫', '⭐', '🪙'];

module.exports = {
  name: 'coinflip',
  aliases: ['cf'],
  description: 'Flip a coin. `.cf <amount|all|max> <h|t>`',

  async execute({ message, args, userData, saveUserData, client, logAdminAction }) {
    const betArg  = args[0];
    const sideArg = (args[1] || '').toLowerCase();
    const bet     = parseBet(betArg, userData);

    if (!bet || !['h', 't', 'heads', 'tails'].includes(sideArg)) {
      return message.channel.send(card({
        title: '🪙 Coinflip',
        body: '> `.cf <amount|all|max> <h|t>` — call it, double it (a 10% fee comes off a win).\n> Or pick it with buttons: `.play`',
        footer: message.guild?.name || 'Shiro',
      }));
    }

    if ((userData.balance || 0) < bet) {
      return message.channel.send('Insufficient balance.');
    }

    const pickedHeads = sideArg.startsWith('h');
    const luckBonus   = getLuckBonus(userData);
    const frenzyMult  = getMultiplier(userData, 'frenzy');
    const coinMult    = getMultiplier(userData, 'coins');

    // Luck essence shifts win probability slightly
    // A fair 50/50 flip; a 10% fee comes off the winnings (≈95% return). Luck adds 1 point.
    const winChance   = 0.5 + casinoLuck(userData);
    const won         = Math.random() < winChance;
    const landedHeads = won ? pickedHeads : !pickedHeads;
    const result      = landedHeads ? 'Heads 🪙' : 'Tails 🌑';
    const picked      = pickedHeads ? 'Heads 🪙' : 'Tails 🌑';

    // Animation
    const spin = (f) => card({ title: '🪙 Coinflip', body: `# ${f}\n> ${picked} · **${bet.toLocaleString()}** on the line…`, footer: message.guild?.name || 'Shiro' });
    const spinMsg = await message.channel.send(spin(SPIN_FRAMES[0]));
    for (let i = 1; i < SPIN_FRAMES.length; i++) {
      await new Promise(r => setTimeout(r, 300));
      await spinMsg.edit(spin(SPIN_FRAMES[i])).catch(() => {});
    }

    // Calculate payout
    let payout = 0;
    let fee = 0;
    userData.balance = (userData.balance || 0) - bet;

    if (won) {
      fee              = Math.ceil(bet * CF_FEE);
      payout           = casinoPayout(bet, bet * 2 - fee, userData);
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
      streakBonus       = Math.floor(bet * 0.25);
      userData.balance += streakBonus;
      streakNote        = `\n> **${cfStreak}-flip streak bonus:** +${streakBonus.toLocaleString()} coins!`;
    }
    recordRound('coinflip', bet, payout + streakBonus, fee, message.author.id);

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

    const opts = {
      emoji: '🪙', game: 'Coinflip', won,
      headline: won ? `${result} — you win` : `${result} — you lose`,
      lines: [
        `You called **${picked}** · bet **${bet.toLocaleString()}**`,
        won ? `**+${(payout - bet).toLocaleString()}** coins (fee ${fee.toLocaleString()})${streakNote.replace(/\n> /g, ' · ')}` : `**−${bet.toLocaleString()}** coins`,
        `Balance **${userData.balance.toLocaleString()}** · streak **${cfStreak}**`,
      ],
      footer: [frenzyMult > 1 ? 'Frenzy +5% winnings' : '', luckBonus > 0 ? '+1% luck' : '', message.guild?.name || 'Shiro'].filter(Boolean).join(' · '),
      replay: { game: 'coinflip', bet, extra: [pickedHeads ? 'h' : 't'], picks: [['Heads', '🪙', ['h']], ['Tails', '🌑', ['t']]] },
    };
    await spinMsg.edit(gameResult(opts)).catch(() => {});
    attachReplay(spinMsg, message.author.id, opts);

    if (won && client) {
      announceWin(client, {
        userId: message.author.id, username: message.author.username,
        avatarURL: message.author.displayAvatarURL({ dynamic: true }),
        game: 'coinflip', bet, payout, multiplier: bet > 0 ? payout / bet : 0,
        detail: cfStreak > 0 && cfStreak % 5 === 0 ? `${cfStreak}-flip streak bonus` : undefined,
        logAdminAction,
      }).catch(() => {});
    }
  },
};