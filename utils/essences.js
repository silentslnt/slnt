// utils/essences.js
// Handles reading/writing active essences on userData and
// computing active multipliers for different game types.

const { ESSENCES } = require('./config');

/**
 * Returns true if a given essence type is currently active for the user.
 * @param {Object} userData  – the user's MongoDB document
 * @param {string} type      – essence type key (e.g. 'frenzy', 'luck', 'xp')
 */
function isEssenceActive(userData, type) {
  const actives = userData.activeEssences || {};
  const entry   = actives[type];
  if (!entry) return false;
  return Date.now() < new Date(entry.expiresAt).getTime();
}

/**
 * Returns the numeric multiplier for the given context.
 * context: 'coins' | 'frenzy' | 'xp' | 'message' | 'keys'
 */
function getMultiplier(userData, context) {
  return isEssenceActive(userData, context) ? 2 : 1;
}

/**
 * Returns the luck bonus (0.0–0.15) if Luck Essence is active.
 */
function getLuckBonus(userData) {
  return isEssenceActive(userData, 'luck') ? 0.15 : 0;
}

/**
 * Returns true if Flow Essence (cooldown halving) is active.
 */
function hasFlowEssence(userData) {
  return isEssenceActive(userData, 'flow');
}

/**
 * Returns true if Key Essence (3× key drop) is active.
 */
function hasKeyEssence(userData) {
  return isEssenceActive(userData, 'keys');
}

/**
 * Activate an essence on a userData object (mutates in place).
 * Call saveUserData after this.
 * @param {Object} userData
 * @param {string} essenceId  – key in ESSENCES config (e.g. 'frenzy_essence')
 * @returns {{ ok: boolean, message: string }}
 */
function activateEssence(userData, essenceId) {
  const def = ESSENCES[essenceId];
  if (!def) return { ok: false, message: 'Unknown essence.' };

  userData.activeEssences = userData.activeEssences || {};
  const expiresAt = new Date(Date.now() + def.durationMs);
  userData.activeEssences[def.type] = { essenceId, expiresAt };

  // Track usage stat
  userData.stats = userData.stats || {};
  userData.stats.essencesUsed = (userData.stats.essencesUsed || 0) + 1;

  return { ok: true, message: `${def.emoji} **${def.name}** activated for ${formatDuration(def.durationMs)}!` };
}

/**
 * Returns a display list of all currently active essences.
 * Returns empty string if none.
 */
function getActiveEssenceSummary(userData) {
  const actives = userData.activeEssences || {};
  const now     = Date.now();
  const lines   = [];

  for (const [type, entry] of Object.entries(actives)) {
    const ms  = new Date(entry.expiresAt).getTime() - now;
    if (ms <= 0) continue;
    const def = Object.values(ESSENCES).find(e => e.type === type);
    if (!def) continue;
    lines.push(`${def.emoji} **${def.name}** — ${formatDuration(ms)} remaining`);
  }

  return lines.join('\n') || null;
}

/** Format milliseconds to a readable string */
function formatDuration(ms) {
  const totalSec = Math.floor(ms / 1000);
  const h  = Math.floor(totalSec / 3600);
  const m  = Math.floor((totalSec % 3600) / 60);
  const s  = totalSec % 60;

  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

module.exports = {
  isEssenceActive,
  getMultiplier,
  getLuckBonus,
  hasFlowEssence,
  hasKeyEssence,
  activateEssence,
  getActiveEssenceSummary,
  formatDuration,
};