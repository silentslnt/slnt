// models/liveLeaderboard.js — one persistent auto-refreshing leaderboard
// message per category. Set up with .livelb, refreshed by a setInterval in
// index.js every 5 minutes (Shiro's economy moves faster than Sentinel's
// Race Points, so a shorter cadence than the 30m race leaderboard makes
// sense here). Persisted to Mongo (not just in-memory) so it survives a
// restart instead of silently going stale until someone re-runs .livelb.
const mongoose = require('mongoose');

const liveLeaderboardSchema = new mongoose.Schema({
  category:  { type: String, required: true, unique: true },
  channelId: { type: String, required: true },
  messageId: { type: String, required: true },
});

module.exports = mongoose.models.LiveLeaderboard || mongoose.model('LiveLeaderboard', liveLeaderboardSchema);
