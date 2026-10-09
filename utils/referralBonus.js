// utils/referralBonus.js — recruiters earn a share of their recruits' Shiro winnings (direct: "inviter gets 5% of the
// recruit's gamble winnings — a bonus, not taken from the recruit"). Only VALIDATED recruits count (Sentinel's
// referral_rewards: the invite was proven by real play), so alts can't farm it. The bonus is paid by the house
// (logged on its ledger as referral_bonus). Percent is set on `.shiroset` Home (0 = off).
const settings = require('./settings');
const User = require('../models/user');
const { query } = require('./sentinelDb');

const DEFAULT_PCT = 0.05;
const cache = new Map();   // invitee id → { inviter, at }
const pct = () => { const v = settings.get('referralPct', DEFAULT_PCT); return Number.isFinite(v) ? v : DEFAULT_PCT; };

async function inviterOf(uid) {
  const hit = cache.get(uid);
  if (hit && Date.now() - hit.at < 10 * 60_000) return hit.inviter;
  const rows = await query('SELECT inviter_id FROM referral_rewards WHERE invitee_id=$1 ORDER BY paid_at LIMIT 1', [uid]);
  const inviter = rows && rows[0] ? String(rows[0].inviter_id) : null;
  cache.set(uid, { inviter, at: Date.now() });
  return inviter;
}

async function onWin(uid, profit) {
  const p = pct();
  if (!(p > 0) || !(profit > 0)) return 0;
  const inviter = await inviterOf(uid);
  if (!inviter || inviter === uid) return 0;
  const bonus = Math.floor(profit * p);
  if (bonus < 1) return 0;
  await User.updateOne({ userId: inviter }, { $inc: { balance: bonus, refEarned: bonus, [`refFrom.${uid}`]: bonus } }, { upsert: true });
  require('./houseBank').creditHouse(-bonus, 'referral_bonus');
  return bonus;
}

async function recruits(uid) {
  return (await query('SELECT invitee_id, paid_at FROM referral_rewards WHERE inviter_id=$1 ORDER BY paid_at DESC LIMIT 25', [uid])) || [];
}

module.exports = { onWin, recruits, inviterOf, pct, DEFAULT_PCT };
