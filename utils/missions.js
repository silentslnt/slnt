// utils/missions.js — shared daily-mission logic.
//
// IMPORTANT: missions.js (the command) used to compute progress purely from
// userData.missionProgress[id].progress, but nothing anywhere ever wrote to
// that field except missions.js itself when marking a mission claimed — so
// every mission's progress bar was permanently stuck at 0/N no matter what
// anyone did. This module is the fix: syncMissionProgress() is called from
// trackStat()/checkAchievements() (utils/achievements.js) every time a
// relevant lifetime stat changes, and derives each of TODAY's 3 missions'
// progress as (current lifetime stat) - (stat value snapshotted at the
// start of today), so a mission like "win 5 games" only counts wins from
// today, not a player's lifetime total.
const { MISSIONS_POOL } = require('./config');

function simpleHash(str) {
  let h = 0;
  for (const c of String(str)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return h;
}

function todayKey(d = new Date()) {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** Get today's 3 missions using date as seed — deterministic, same for everyone. */
function getTodaysMissions() {
  const today = new Date();
  const seed  = today.getFullYear() * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const shuffled = [...MISSIONS_POOL].sort((a, b) => simpleHash(seed + a.id) - simpleHash(seed + b.id));
  return shuffled.slice(0, 3);
}

/**
 * Ensures missionBaseline/missionProgress are rolled over for a new day, then
 * recomputes progress for all of today's missions from current lifetime stats.
 * Call this any time userData.stats changes. Mutates userData; caller is
 * responsible for persisting the touched fields via saveUserData.
 */
function syncMissionProgress(userData) {
  const today = todayKey();
  userData.stats = userData.stats || {};

  if (userData.missionDate !== today) {
    userData.missionDate     = today;
    userData.missionProgress = {};
    userData.missionBaseline = {};
  }
  userData.missionProgress = userData.missionProgress || {};
  userData.missionBaseline = userData.missionBaseline || {};

  const missions = getTodaysMissions();
  for (const mission of missions) {
    if (!(mission.field in userData.missionBaseline)) {
      // First time we've seen this field today — baseline it at the CURRENT
      // lifetime value so only progress made from now on counts.
      userData.missionBaseline[mission.field] = userData.stats[mission.field] || 0;
    }
    const base    = userData.missionBaseline[mission.field] || 0;
    const current = Math.max(0, (userData.stats[mission.field] || 0) - base);
    const prior   = userData.missionProgress[mission.id] || {};
    userData.missionProgress[mission.id] = { progress: current, claimed: prior.claimed || false };
  }
}

module.exports = { getTodaysMissions, todayKey, syncMissionProgress };
