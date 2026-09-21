// models/artifact.js — Artifact Shop: a rare, time-gated rotation of
// high-value P2W items. Two collections:
//
//   ArtifactPool   — the permanent catalog of possible artifacts (admin-managed).
//   ArtifactWindow — one document per weekly open window, generated the first
//                    time anyone checks the shop during that window. Holds a
//                    RANDOM SUBSET of the pool (not every artifact shows up
//                    every window) plus each one's remaining stock for that
//                    window specifically.
const mongoose = require('mongoose');

// tier: 'relic' (Gaia-style — only ONE may be owned at a time, powerful, always-on)
//       or 'charm' (Khei-style — stackable, smaller effect, usually paired with a drawback).
// effectKind/effectValue (+ the optional drawback pair) are read by Sentinel's
// races.py ARTIFACT_EFFECTS table by itemId — see cogs/races.py and
// docs/artifact_spell_expansion.md. Keep itemId identical on both sides or the
// bonus silently does nothing (same cross-bot drift class as spells — see
// feedback_engineering_checklist.md section 0b).
const artifactPoolSchema = new mongoose.Schema({
  itemId:       { type: String, required: true, unique: true },
  name:         { type: String, required: true },
  emoji:        { type: String, default: '🏺' },
  description:  { type: String, required: true },
  priceSilv:    { type: Number, required: true },
  stock:        { type: Number, required: true }, // stock granted PER WINDOW if it rolls in
  roleId:       { type: String, default: null },
  roleDays:     { type: Number, default: 0 },
  tier:         { type: String, enum: ['relic', 'charm', 'none'], default: 'none' },
  effectKind:   { type: String, default: null },  // e.g. 'rp_mult', 'duel_roll' — see races.py ARTIFACT_EFFECTS
  effectValue:  { type: Number, default: 0 },
  drawbackKind: { type: String, default: null },
  drawbackValue:{ type: Number, default: 0 },
  active:       { type: Boolean, default: true }, // false = retired, never rolls into a window
});

const artifactWindowItemSchema = new mongoose.Schema({
  itemId:          String,
  name:            String,
  emoji:           String,
  description:     String,
  priceSilv:       Number,
  remainingStock:  Number,
  totalStock:      Number,
  roleId:          String,
  roleDays:        Number,
  tier:            String,
  effectKind:      String,
  effectValue:     Number,
  drawbackKind:    String,
  drawbackValue:   Number,
}, { _id: false });

const artifactWindowSchema = new mongoose.Schema({
  windowStart: { type: Date, required: true, unique: true },
  windowEnd:   { type: Date, required: true },
  items:       [artifactWindowItemSchema],
});

// Single-doc override so an admin can force the shop open outside its normal
// Fri-Sun schedule (.artifact forceopen) — spawn it "anytime I please" per
// direct request. When active and not expired, getWindow() returns this
// instead of the computed weekly window.
const artifactOverrideSchema = new mongoose.Schema({
  key:    { type: String, default: 'singleton', unique: true },
  endsAt: { type: Date, required: true },
});

const ArtifactPool     = mongoose.models.ArtifactPool     || mongoose.model('ArtifactPool', artifactPoolSchema);
const ArtifactWindow   = mongoose.models.ArtifactWindow   || mongoose.model('ArtifactWindow', artifactWindowSchema);
const ArtifactOverride = mongoose.models.ArtifactOverride || mongoose.model('ArtifactOverride', artifactOverrideSchema);

module.exports = { ArtifactPool, ArtifactWindow, ArtifactOverride };
