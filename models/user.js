// models/User.js
// ── Full Kon Bot User Schema (complete overhaul) ──────────────────────────────
const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },

  // ── Economy ───────────────────────────────────────────────────────────────
  balance:     { type: Number, default: 0 },
  totalEarned: { type: Number, default: 0 }, // lifetime coins earned (rank system)

  // ── XP & Level ───────────────────────────────────────────────────────────
  xp: { type: Number, default: 0 },

  // ── Prestige ─────────────────────────────────────────────────────────────
  prestige: { type: Number, default: 0 },

  // ── Daily Streak ─────────────────────────────────────────────────────────
  dailyStreak:  { type: Number, default: 0 },
  lastDaily:    { type: Date,   default: null },
  lastWeekly:   { type: Date,   default: null },
  lastMonthly:  { type: Date,   default: null },

  // ── Missions ─────────────────────────────────────────────────────────────
  missionDate:     { type: String, default: '' },
  missionProgress: { type: Object, default: {} },
  // missionBaseline was missing here — Mongoose's default strict mode
  // silently dropped it on every save (the EXACT bug the comment above
  // User's require() in index.js warns about, just a smaller-scale repeat
  // of it for this one field). syncMissionProgress() needs this to persist
  // to know "today's starting stat value" — without it, every command call
  // saw an empty missionBaseline coming back from Mongo and re-baselined
  // against the CURRENT stat value each time, so progress always read as
  // 0 no matter how much a player had actually done that day.
  missionBaseline: { type: Object, default: {} },

  // ── Inventory ─────────────────────────────────────────────────────────────
  // Keys: 'Common', 'Uncommon', 'Rare', 'Legendary', 'Mythical', 'Prismatic'
  // SILV: 'Silv token'
  // Utility: 'Insurance Slip', 'Reroll Token', 'Lucky Charm', 'Mystery Scroll', 'Vault Key'
  // Characters: stored as objects
  inventory: { type: Object, default: {} },

  // ── Characters ───────────────────────────────────────────────────────────
  characters:      { type: Array, default: [] },
  equippedCharacter: { type: String, default: null },

  // ── Investment Vault ─────────────────────────────────────────────────────
  vault: {
    type: Object, // { amount, startedAt, endsAt }
    default: null,
  },

  // ── Active Essences ───────────────────────────────────────────────────────
  // { [essenceType]: { essenceId, expiresAt } }
  activeEssences: { type: Object, default: {} },

  // ── Cosmetics ────────────────────────────────────────────────────────────
  equippedTitle:  { type: String, default: null },
  unlockedTitles: { type: Array,  default: [] },
  unlockedBadges: { type: Array,  default: [] },

  // ── Achievements ─────────────────────────────────────────────────────────
  achievements: { type: Array, default: [] },

  // ── Gifting cap ──────────────────────────────────────────────────────────
  giftedToday:    { type: Number, default: 0 },
  lastGiftReset:  { type: Date,   default: null },

  // ── Comprehensive Stats (drives achievements + missions) ─────────────────
  stats: {
    type: Object,
    default: {
      gamesPlayed:       0,
      gamesWon:          0,
      coinsWon:          0,
      keysOpened:        0,
      dailyClaimed:      0,
      missionsCompleted: 0,
      essencesUsed:      0,
      silvSpent:         0,
      trades:            0,
      investments:       0,
      cfStreak:          0,
      blackjack21:       0,
      profileViewed:     0,
      invChecked:        0,
    },
  },

  // ── Last activity (for passive income) ───────────────────────────────────
  lastActive: { type: Date, default: Date.now },

}, { timestamps: true });

// Index for leaderboards
userSchema.index({ balance: -1 });
userSchema.index({ xp: -1 });
userSchema.index({ dailyStreak: -1 });
userSchema.index({ totalEarned: -1 });
userSchema.index({ prestige: -1 });

module.exports = mongoose.models.User || mongoose.model('User', userSchema);