// utils/houseBank.js — the bot's private game ledger. Every casino round is
// recorded here: what was bet, what was paid back, and fees taken. It is NOT a
// user balance — it never appears on leaderboards, .bal, or anywhere else.
// Only the bot owner sees it (.house).
const mongoose = require('mongoose');

const metaSchema = new mongoose.Schema({ key: { type: String, unique: true }, value: mongoose.Schema.Types.Mixed });
const Meta = mongoose.models.Meta || mongoose.model('Meta', metaSchema);
const KEY = 'house_bank';

// Every player's own rounds — powers `.history` (their win/loss log). Kept to the last HISTORY_KEEP per player.
const roundSchema = new mongoose.Schema({
  userId: { type: String, index: true }, game: String, bet: Number, payout: Number, at: { type: Date, default: Date.now },
});
const GameRound = mongoose.models.GameRound || mongoose.model('GameRound', roundSchema);
const HISTORY_KEEP = 200;

async function logPlayerRound(userId, game, bet, payout) {
  await CasinoRound.create({ userId, game, bet, payout });
  const old = await GameRound.find({ userId }).sort({ at: -1 }).skip(HISTORY_KEEP).select('_id').lean();
  if (old.length) await CasinoRound.deleteMany({ _id: { $in: old.map((o) => o._id) } });
}

async function playerHistory(userId, limit = HISTORY_KEEP) {
  return CasinoRound.find({ userId }).sort({ at: -1 }).limit(limit).lean();
}

/** Record one finished round. payout = everything paid back (stake included); fee = fee kept on a win.
 *  Pass userId so it also lands in that player's `.history`. */
function recordRound(game, bet, payout, fee = 0, userId = null) {
  if (userId) logPlayerRound(String(userId), game, bet, payout).catch(() => {});
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

/** Money the house takes outside a round (exchange taxes etc.) — kept in the same ledger, by label. */
function creditHouse(amount, label = 'tax') {
  amount = Math.floor(amount);
  if (!amount) return Promise.resolve();
  return Meta.findOneAndUpdate(
    { key: KEY },
    { $inc: { 'value.balance': amount, 'value.fees': amount, [`value.taxes.${label}`]: amount } },
    { upsert: true },
  ).catch(() => {});
}

/** Owner adjustment of the house balance (+/-), logged by the caller. */
function adjustHouse(amount) {
  return Meta.findOneAndUpdate({ key: KEY }, { $inc: { 'value.balance': Math.floor(amount), 'value.adjusted': Math.floor(amount) } }, { upsert: true });
}

/** Owner pays a player OUT of the house balance — guarded: only if the house holds that much. Returns true if taken. */
async function withdrawHouse(amount) {
  amount = Math.floor(amount);
  if (!(amount > 0)) return false;
  const res = await Meta.findOneAndUpdate({ key: KEY, 'value.balance': { $gte: amount } },
    { $inc: { 'value.balance': -amount, 'value.withdrawn': amount } }, { new: true });
  return !!res;
}

module.exports = { recordRound, getBank, resetBank, playerHistory, creditHouse, adjustHouse, withdrawHouse };
