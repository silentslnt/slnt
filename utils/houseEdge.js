// utils/houseEdge.js — casino rules. Every house game must return LESS than
// it takes on average (RTP < 100%, even with essences active). A player who
// wins got lucky; the house wins over time. Essences give a small edge back,
// never enough to flip the math:
//   Frenzy  → +5% on WINNINGS (profit only, not the stake) in casino games
//   Luck    → +1 percentage point win chance in casino games
//   Aura    → does NOT apply to casino games (it's for chat/earning coins)
const { isEssenceActive } = require('./essences');

const FRENZY_PROFIT_BONUS = 0.05;
const LUCK_CHANCE_BONUS = 0.01;

/** Gross payout (stake included) after the Frenzy bonus on profit. */
function casinoPayout(bet, gross, userData) {
  gross = Math.floor(gross);
  if (gross <= bet) return gross;
  const bonus = isEssenceActive(userData, 'frenzy') ? FRENZY_PROFIT_BONUS : 0;
  return Math.floor(bet + (gross - bet) * (1 + bonus));
}

/** Extra win chance from Luck Essence (0 or 0.01). */
function casinoLuck(userData) {
  return isEssenceActive(userData, 'luck') ? LUCK_CHANCE_BONUS : 0;
}

module.exports = { casinoPayout, casinoLuck, FRENZY_PROFIT_BONUS, LUCK_CHANCE_BONUS };
