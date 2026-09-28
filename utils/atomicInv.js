// utils/atomicInv.js — guarded, atomic balance/inventory moves.
// Every spend is a single findOneAndUpdate whose filter requires the funds to be there
// ($gte), so two fast clicks, a stale command or a parallel game can never overspend
// or write an old number back. Credits are plain $inc.
const mongoose = require('mongoose');

const User = () => mongoose.model('User');
const clean = (items) => Object.entries(items || {}).filter(([, n]) => Number.isFinite(n) && n > 0);

/** Take coins and/or items. Returns true only if ALL of it was there and was taken. */
async function debit(userId, { balance = 0, items = {} } = {}) {
  const filter = { userId };
  const inc = {};
  if (balance > 0) { filter.balance = { $gte: balance }; inc.balance = -balance; }
  for (const [k, n] of clean(items)) { filter[`inventory.${k}`] = { $gte: n }; inc[`inventory.${k}`] = -n; }
  if (!Object.keys(inc).length) return true;
  const res = await User().findOneAndUpdate(filter, { $inc: inc }, { new: true });
  return !!res;
}

/** Give coins and/or items (and optional stat bumps). */
async function credit(userId, { balance = 0, items = {}, stats = {}, totalEarned = 0 } = {}) {
  const inc = {};
  if (balance > 0) inc.balance = balance;
  if (totalEarned > 0) inc.totalEarned = totalEarned;
  for (const [k, n] of clean(items)) inc[`inventory.${k}`] = n;
  for (const [k, n] of Object.entries(stats)) if (Number.isFinite(n) && n) inc[`stats.${k}`] = n;
  if (!Object.keys(inc).length) return;
  await User().updateOne({ userId }, { $inc: inc }, { upsert: true });
}

module.exports = { debit, credit };
