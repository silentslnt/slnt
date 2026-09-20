// models/cipherChallenge.js — persists commands/cipher.js's active challenges.
//
// The bet is deducted up front when a challenge starts, but the challenge
// itself used to live only in an in-memory Map (global.activeChallenges) —
// a bot restart mid-challenge silently erased it, leaving the player's paid
// bet impossible to ever win back (no way to submit the answer, no failure
// message either — just permanent limbo). This collection lets index.js
// recover in-flight challenges on startup: still-running ones get their
// remaining timer restored, already-expired ones get cleanly resolved as a
// loss instead of vanishing without explanation.
const mongoose = require('mongoose');

const cipherChallengeSchema = new mongoose.Schema({
  userId:      { type: String, required: true, unique: true },
  channelId:   { type: String, required: true },
  answer:      { type: String, required: true },
  startTime:   { type: Number, required: true },
  timeLimit:   { type: Number, required: true },
  speedBonus:  { type: Number, required: true },
  betAmount:   { type: Number, required: true },
  baseReward:  { type: Number, required: true },
  speedReward: { type: Number, required: true },
  attempts:    { type: Number, default: 0 },
});

module.exports = mongoose.models.CipherChallenge || mongoose.model('CipherChallenge', cipherChallengeSchema);
