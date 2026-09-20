// utils/artifactSchedule.js — Fixed weekly window for the Artifact Shop.
// Opens Friday 18:00 UTC, closes Sunday 23:59:59 UTC. Pure function of the
// current time — no cron job needed, no missed-tick risk on restart, and it
// self-heals correctly no matter when the process was last running.
const DAY_MS = 24 * 60 * 60 * 1000;

// 0=Sunday .. 6=Saturday (UTC)
const OPEN_DOW  = 5;  // Friday
const OPEN_HOUR = 18; // 18:00 UTC
const CLOSE_DOW = 0;  // Sunday (of the following calendar day rollover)

function _atUtcHour(date, hour) {
  const d = new Date(date);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

/** Most recent Friday 18:00 UTC at or before `now`. */
function _lastWindowStart(now) {
  const d = new Date(now);
  let diff = (d.getUTCDay() - OPEN_DOW + 7) % 7;
  let start = _atUtcHour(new Date(d.getTime() - diff * DAY_MS), OPEN_HOUR);
  if (start.getTime() > now.getTime()) start = new Date(start.getTime() - 7 * DAY_MS);
  return start;
}

function getWindow(now = new Date()) {
  const start = _lastWindowStart(now);
  // End = the Sunday 23:59:59.999 UTC that follows `start` (start+2 days, end of that day)
  const end = new Date(start.getTime() + 2 * DAY_MS);
  end.setUTCHours(23, 59, 59, 999);
  const isOpen = now >= start && now <= end;
  // start + 7 days is always the NEXT Friday 18:00 UTC after `start`, whether
  // we're currently inside that window or past it waiting for the next one.
  const nextStart = new Date(start.getTime() + 7 * DAY_MS);
  return { start, end, isOpen, nextStart };
}

module.exports = { getWindow };
