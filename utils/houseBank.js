// utils/houseBank.js — the bot's private casino ledger. Every casino round is
// recorded here: what was bet, what was paid back, and fees taken. It is NOT a
// user balance — it never appears on leaderboards, .bal, or anywhere else.
// Only the bot owner sees it (.house).
const mongoose = require('mongoose');

const metaSchema = new mongoose.Schema({ key: { type: String, unique: true }, value: mongoose.Schema.Types.Mixed });
const Meta = mongoose.models.Meta || mongoose.model('Meta', metaSchema);
const KEY = 'house_bank';

/** Record one finished round. payout = everything paid back (stake included); fee = fee kept on a win. */
function recordRound(game, bet, payout, fee = 0) {
  const net = Math.floor(bet - payout);
  Meta.findOneAndUpdate(
    { key: KEY },
    { $inc: { 'value.balance': net, 'value.wagered': bet, 'value.paid': payout, 'value.fees': fee, 'value.rounds': 1,
              [`value.games.${game}.net`]: net, [`value.games.${game}.rounds`]: 1 } },
    { upsert: true },
  ).catch(() => {});
}

async function getBank() {
  const doc = await Meta.findOne({ key: KEY }).lean();
  return doc?.value || { balance: 0, wagered: 0, paid: 0, fees: 0, rounds: 0, games: {} };
}

async function resetBank() {
  await Meta.findOneAndUpdate({ key: KEY }, { $set: { value: { balance: 0, wagered: 0, paid: 0, fees: 0, rounds: 0, games: {} } } }, { upsert: true });
}

module.exports = { recordRound, getBank, resetBank };
