// utils/weeklyBoard.js — the weekly game board (direct: "reward the top 10 active weekly… 1st gets 3 tokens, 2nd and 3rd
// get 1, the rest get coins and Aether… don't give too much").
// Every game round with a bet of at least MIN_BET counts one play (recordRound → countPlay). Week = Monday 00:00 UTC.
// When a week ends, payWeek() pays its top 10 exactly once (a Meta claim row), posts one card in the game channel,
// and logs it. Ties break on coins wagered.
const mongoose = require('mongoose');

const MIN_BET = 1_000;
const PRIZES = [   // place → reward
  { silv: 3 }, { silv: 1 }, { silv: 1 },
  { coins: 10_000, aether: 3_000 }, { coins: 10_000, aether: 3_000 }, { coins: 10_000, aether: 3_000 }, { coins: 10_000, aether: 3_000 },
  { coins: 10_000, aether: 3_000 }, { coins: 10_000, aether: 3_000 }, { coins: 10_000, aether: 3_000 },
];

const playSchema = new mongoose.Schema({ week: { type: Number, index: true }, userId: String, plays: Number, wagered: Number });
playSchema.index({ week: 1, userId: 1 }, { unique: true });
const WeeklyPlay = mongoose.models.WeeklyPlay || mongoose.model('WeeklyPlay', playSchema);
const metaSchema = new mongoose.Schema({ key: { type: String, unique: true }, value: mongoose.Schema.Types.Mixed });
const Meta = mongoose.models.Meta || mongoose.model('Meta', metaSchema);

const weekNo = (t = Date.now()) => Math.floor((Math.floor(t / 86_400_000) + 3) / 7);   // Monday-based (epoch was a Thursday)
const weekEnds = (w) => (w * 7 + 4) * 86_400_000;   // ms timestamp of the Monday that closes week w

function countPlay(userId, bet) {
  if (!userId || !(bet >= MIN_BET)) return;
  WeeklyPlay.updateOne({ week: weekNo(), userId: String(userId) }, { $inc: { plays: 1, wagered: Math.floor(bet) } }, { upsert: true }).catch(() => {});
}

async function top(week = weekNo(), n = 10) {
  return WeeklyPlay.find({ week }).sort({ plays: -1, wagered: -1 }).limit(n).lean();
}

const prizeText = (p) => (p.silv ? `${p.silv} SILV` : `${p.coins.toLocaleString()} coins + ${p.aether.toLocaleString()} Aether`);

/** Pay last week's board once. Returns the paid rows or null if already paid / nothing to pay. */
async function payWeek(client, logAdminAction) {
  const week = weekNo() - 1;
  const claimed = await Meta.findOneAndUpdate({ key: `weekly_paid_${week}` }, { $setOnInsert: { value: Date.now() } },
    { upsert: true, new: false }).catch(() => 'err');
  if (claimed) return null;   // someone (an earlier tick) already paid it
  const rows = await top(week);
  if (!rows.length) return null;
  const { credit } = require('./atomicInv');
  const sdb = require('./sentinelDb');
  const gid = process.env.GUILD_ID;
  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const p = PRIZES[i];
    const r = rows[i];
    if (p.silv) await credit(r.userId, { items: { 'Silv token': p.silv } });
    else {
      await credit(r.userId, { balance: p.coins, totalEarned: p.coins });
      if (gid) await sdb.awardPoints(gid, r.userId, p.aether);
    }
    lines.push(`> **${i + 1}.** <@${r.userId}> — ${r.plays.toLocaleString()} plays · **${prizeText(p)}**`);
    logAdminAction?.(client.user.id, 'Shiro', 'weekly', `Weekly board #${i + 1}: ${prizeText(p)}`, r.userId, r.userId).catch?.(() => {});
  }
  const { GAME_CHANNEL_ID } = require('./config');
  const ch = await client.channels.fetch(GAME_CHANNEL_ID).catch(() => null);
  if (ch) {
    const { card } = require('./casino');
    await ch.send({ ...card({ title: '🏆 Weekly game board — results',
      body: `-# Last week's most active players. A new week has started — every game round of ${MIN_BET.toLocaleString()}+ coins counts.\n${lines.join('\n')}`,
      footer: '.weekly — this week\'s board' }), allowedMentions: { parse: [] } }).catch(() => {});
  }
  return rows;
}

module.exports = { countPlay, top, payWeek, weekNo, weekEnds, PRIZES, MIN_BET, prizeText };
