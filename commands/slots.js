// commands/slots.js
const { card, gameResult, attachReplay } = require('../utils/casino');
const mongoose = require('mongoose');
const { XP_PER_GAME, XP_PER_WIN } = require('../utils/config');

const { parseBet } = require('../utils/parseBet');
const { getMultiplier, getLuckBonus } = require('../utils/essences');
const { addXP } = require('../utils/xp');
const { trackStat, checkAchievements } = require('../utils/achievements');
const { awardPoints } = require('../utils/sentinelDb');
const { announceWin } = require('../utils/winAnnouncer');
const { recordRound } = require('../utils/houseBank');
const { casinoPayout, casinoLuck } = require('../utils/houseEdge');

// ── Jackpot state (persisted per guild in MongoDB meta collection) ────────────
const metaSchema = new mongoose.Schema({ key: { type: String, unique: true }, value: mongoose.Schema.Types.Mixed });
const Meta = mongoose.models.Meta || mongoose.model('Meta', metaSchema);

async function getJackpot() {
  const doc = await Meta.findOne({ key: 'slots_jackpot' });
  return doc?.value || 5_000;
}
async function addToJackpot(amount) {
  await Meta.findOneAndUpdate({ key: 'slots_jackpot' }, { $inc: { value: amount } }, { upsert: true });
}
async function resetJackpot() {
  await Meta.findOneAndUpdate({ key: 'slots_jackpot' }, { $set: { value: 5_000 } }, { upsert: true });
}

// ── Reel symbols with weights ─────────────────────────────────────────────────
const SYMBOLS = [
  { s: '💎', weight: 1,  mult: 50  },
  { s: '⭐', weight: 2,  mult: 25  },
  { s: '🌙', weight: 4,  mult: 12  },
  { s: '🔑', weight: 6,  mult: 8   },
  { s: '💰', weight: 10, mult: 4   },
  { s: '🌸', weight: 15, mult: 2.5 },
  { s: '🎮', weight: 20, mult: 2   },
  { s: '✨', weight: 25, mult: 1.5 },
];
const TOTAL_WEIGHT = SYMBOLS.reduce((t, s) => t + s.weight, 0);

function spinReel(luckBonus = 0) {
  // Luck slightly boosts high-value symbols by reducing effective weight of lowest 3
  const adjusted = SYMBOLS.map((sym, i) => ({
    ...sym,
    weight: i < 3 ? sym.weight * (1 + luckBonus * 3) : sym.weight,
  }));
  const total = adjusted.reduce((t, s) => t + s.weight, 0);
  let r = Math.random() * total;
  for (const sym of adjusted) {
    r -= sym.weight;
    if (r <= 0) return sym;
  }
  return adjusted[adjusted.length - 1];
}

const SPIN_FRAMES = [
  '🎰 | ❓ ❓ ❓ |',
  '🎰 | 🌀 ❓ ❓ |',
  '🎰 | 🌀 🌀 ❓ |',
];

module.exports = {
  name: 'slots',
  aliases: ['sl', 's'],
  description: 'Spin the slots. `.sl <amount|all|max>`',

  async execute({ message, args, userData, saveUserData, client, logAdminAction }) {
    const bet = parseBet(args[0], userData.balance || 0);
    if (!bet) {
      return message.channel.send(card({
        title: '🎰 Slots',
        body: '> `.sl <amount|all|max>` — three of a kind pays the symbol, two pays half. 💎💎💎 wins the jackpot.\n> '
          + SYMBOLS.map((x) => `${x.s} **${x.mult}×**`).join(' · ') + '\n> Or with buttons: `.play`',
        footer: message.guild?.name || 'Shiro',
      }));
    }

    if ((userData.balance || 0) < bet) return message.channel.send('Insufficient balance.');

    const jackpot    = await getJackpot();
    const luckBonus  = getLuckBonus(userData);
    const frenzyMult = getMultiplier(userData, 'frenzy');
    const coinMult   = getMultiplier(userData, 'coins');

    // ── 5% of bet goes to jackpot ─────────────────────────────────────────
    const jackpotContrib = Math.floor(bet * 0.05);
    await addToJackpot(jackpotContrib);

    // ── Spin animation ────────────────────────────────────────────────────
    const g = message.guild?.name || 'Shiro';
    const reelCard = (a, b, c) => card({ title: '🎰 Slots', body: `# ┃ ${a} ┃ ${b} ┃ ${c} ┃\n> **${bet.toLocaleString()}** in · jackpot **${(jackpot + jackpotContrib).toLocaleString()}**`, footer: g });
    const rnd = () => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)].s;
    const spinMsg = await message.channel.send(reelCard('🌀', '🌀', '🌀'));
    // ── Spin reels ────────────────────────────────────────────────────────
    const reels  = [spinReel(casinoLuck(userData)), spinReel(casinoLuck(userData)), spinReel(casinoLuck(userData))];
    const row    = reels.map(r => r.s).join(' ');
    // reels stop one by one
    for (const shown of [[rnd(), rnd(), rnd()], [reels[0].s, rnd(), rnd()], [reels[0].s, reels[1].s, rnd()]]) {
      await new Promise((r) => setTimeout(r, 380));
      await spinMsg.edit(reelCard(...shown)).catch(() => {});
    }

    userData.balance = (userData.balance || 0) - bet;

    let resultText = '';
    let payout     = 0;
    let isJackpot  = false;

    const allMatch = reels[0].s === reels[1].s && reels[1].s === reels[2].s;
    const twoMatch = !allMatch && (
      reels[0].s === reels[1].s || reels[1].s === reels[2].s || reels[0].s === reels[2].s
    );

    if (allMatch && reels[0].s === '💎') {
      // Jackpot!
      payout       = jackpot + jackpotContrib;
      isJackpot    = true;
      resultText   = `**JACKPOT!** 💎💎💎 You won the **${payout.toLocaleString()}** coin jackpot!`;
      await resetJackpot();
    } else if (allMatch) {
      payout     = casinoPayout(bet, bet * reels[0].mult, userData);
      resultText = `**TRIPLE ${reels[0].s}!** You win **${payout.toLocaleString()}** coins! (${reels[0].mult}×${frenzyMult > 1 ? ' + Frenzy 5%' : ''})`;
    } else if (twoMatch) {
      const matchSym = reels[0].s === reels[1].s ? reels[0] : reels[1].s === reels[2].s ? reels[1] : reels[0];
      const twoMult  = matchSym.mult * 0.5;
      payout         = casinoPayout(bet, bet * twoMult, userData);
      resultText     = `**Double ${matchSym.s}!** You win **${payout.toLocaleString()}** coins! (${twoMult.toFixed(1)}×)`;
    } else {
      resultText = `No match. Better luck next time! \`${row}\``;
    }

    if (payout > 0) {
      userData.balance += payout;
      userData.totalEarned = (userData.totalEarned || 0) + payout;
    }

    await saveUserData({ balance: userData.balance, totalEarned: userData.totalEarned });
    await addXP(message.author.id, payout > 0 ? XP_PER_WIN : XP_PER_GAME, userData, saveUserData, message);
    if (payout > 0 && message.guild) {
      const pts = isJackpot ? 100 : Math.min(50, Math.max(5, Math.floor(payout / 500)));
      await awardPoints(message.guild.id, message.author.id, pts);
    }

    userData.stats = userData.stats || {};
    recordRound('slots', bet, payout, 0, message.author.id);
    userData.stats.gamesPlayed = (userData.stats.gamesPlayed || 0) + 1;
    if (payout > 0) {
      userData.stats.gamesWon = (userData.stats.gamesWon || 0) + 1;
      userData.stats.coinsWon = (userData.stats.coinsWon || 0) + payout;
    }
    await saveUserData({ stats: userData.stats });
    await checkAchievements(userData, { message, saveUserData });

    const newJackpot = isJackpot ? 5_000 : jackpot + jackpotContrib;

    const opts = {
      emoji: '🎰', game: 'Slots', won: payout > bet ? true : payout > 0 ? null : false,
      headline: `┃ ${reels.map((r) => r.s).join(' ┃ ')} ┃` + (isJackpot ? '  JACKPOT' : ''),
      lines: [
        resultText,
        payout > 0 ? `Paid **${payout.toLocaleString()}** on a **${bet.toLocaleString()}** bet` : `**−${bet.toLocaleString()}** coins`,
        `Balance **${userData.balance.toLocaleString()}** · next jackpot **${newJackpot.toLocaleString()}**`,
        '-# 5% of every bet feeds the jackpot' + (frenzyMult > 1 ? ' · Frenzy +5%' : ''),
      ],
      footer: g, replay: { game: 'slots', bet },
    };
    await spinMsg.edit(gameResult(opts)).catch(() => {});
    attachReplay(spinMsg, message.author.id, opts);

    if (payout > 0 && client) {
      announceWin(client, {
        userId: message.author.id, username: message.author.username,
        avatarURL: message.author.displayAvatarURL({ dynamic: true }),
        game: 'slots', bet, payout, multiplier: bet > 0 ? payout / bet : 0,
        detail: isJackpot ? 'JACKPOT' : undefined,
        logAdminAction,
      }).catch(() => {});
    }
  },
};