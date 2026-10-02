// utils/sendCap.js — ONE daily limit on coins a player sends to others, shared by .give, .tip and .trade
// (direct: "can't people bypass the .give limit in .trade?" — they could: only .give counted, .tip and .trade had none).
// Atomic: the window resets with a conditional update, and a claim only succeeds if it stays under the cap, so two
// fast sends can't both slip through. Uses the existing giftedToday / lastGiftReset fields.
const mongoose = require('mongoose');
const { GIFT_DAILY_CAP } = require('./config');

const DAY_MS = 24 * 60 * 60 * 1000;
const User = () => mongoose.model('User');

async function resetIfDue(userId) {
  const cut = new Date(Date.now() - DAY_MS);
  await User().updateOne({ userId, $or: [{ lastGiftReset: null }, { lastGiftReset: { $exists: false } }, { lastGiftReset: { $lte: cut } }] },
    { $set: { giftedToday: 0, lastGiftReset: new Date() } });
}

/** Coins this player can still send today, and when the window resets. */
async function remaining(userId) {
  await resetIfDue(userId);
  const u = await User().findOne({ userId }, { giftedToday: 1, lastGiftReset: 1 }).lean();
  const used = u?.giftedToday || 0;
  const resets = u?.lastGiftReset ? new Date(new Date(u.lastGiftReset).getTime() + DAY_MS) : new Date(Date.now() + DAY_MS);
  return { left: Math.max(0, GIFT_DAILY_CAP - used), resets };
}

/** Reserve `amount` of today's limit. Returns true only if it all fits. */
async function claim(userId, amount) {
  if (!(amount > 0)) return true;
  await resetIfDue(userId);
  const res = await User().findOneAndUpdate(
    { userId, $or: [{ giftedToday: { $lte: GIFT_DAILY_CAP - amount } }, { giftedToday: { $exists: false } }] },
    { $inc: { giftedToday: amount } }, { new: true });
  return !!res;
}

/** Give back a reservation when the send didn't happen. */
async function release(userId, amount) {
  if (amount > 0) await User().updateOne({ userId }, { $inc: { giftedToday: -amount } });
}

module.exports = { remaining, claim, release, CAP: GIFT_DAILY_CAP };
