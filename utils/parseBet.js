// utils/parseBet.js
const { MAX_BET } = require('./config');

/**
 * Parse a bet argument that supports:
 *   - a positive integer  → that value
 *   - "all" or "max"      → min(balance, MAX_BET)
 *
 * Returns the numeric bet, or null if invalid.
 */
function parseBet(arg, balance, cap = MAX_BET) {
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

module.exports = { parseBet };