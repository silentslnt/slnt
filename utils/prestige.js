// utils/prestige.js
const { PRESTIGE_RANKS } = require('./config');

/** Return rank object for a given totalEarned amount */
function getRank(totalEarned) {
  for (let i = PRESTIGE_RANKS.length - 1; i >= 0; i--) {
    if (totalEarned >= PRESTIGE_RANKS[i].min) return PRESTIGE_RANKS[i];
  }
  return PRESTIGE_RANKS[0];
}

/** Return next rank, or null if max */
function getNextRank(totalEarned) {
  const current = getRank(totalEarned);
  const idx     = PRESTIGE_RANKS.indexOf(current);
  return idx < PRESTIGE_RANKS.length - 1 ? PRESTIGE_RANKS[idx + 1] : null;
}

/** Daily bonus multiplier from rank */
function getRankBonusMultiplier(totalEarned) {
  return 1 + getRank(totalEarned).bonus;
}

/** Passive income per hour from rank */
function getPassiveIncome(totalEarned) {
  return getRank(totalEarned).passive;
}

module.exports = { getRank, getNextRank, getRankBonusMultiplier, getPassiveIncome };