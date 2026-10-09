// utils/parseBet.js
const { MAX_BET } = require('./config');

// direct: "every 10 levels gives 10k higher max betting so its 50k, at lvl 10 u can do 60k and so on"
const BET_PER_10_LEVELS = 10_000;

/** The table limit for this player: MAX_BET + 10k per 10 levels. */
function maxBetFor(userData) {
  const { levelFromXP } = require('./xp');
  const level = levelFromXP((userData && userData.xp) || 0);
  return MAX_BET + BET_PER_10_LEVELS * Math.floor(level / 10);
}

/**
 * Parse a bet argument that supports:
 *   - a positive integer  → that value
 *   - "all" or "max"      → min(balance, the table limit)
 * `balance` may be a number (limit = cap) or the player's userData (limit = maxBetFor(userData)).
 * Returns the numeric bet, or null if invalid.
 */
function parseBet(arg, balance, cap = MAX_BET) {
  if (balance && typeof balance === 'object') {
    cap = maxBetFor(balance);
    balance = balance.balance || 0;
  }
  if (!arg) return null;
  const lower = arg.toLowerCase();
  if (lower === 'all' || lower === 'max') {
    const val = Math.min(balance, cap);
    return val > 0 ? val : null;
  }
  const n = parseInt(arg, 10);
  if (isNaN(n) || n <= 0) return null;
  return Math.min(n, cap);
}

module.exports = { parseBet, maxBetFor, BET_PER_10_LEVELS };
