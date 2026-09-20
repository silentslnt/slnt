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

const artifactPoolSchema = new mongoose.Schema({
  itemId:      { type: String, required: true, unique: true },
  name:        { type: String, required: true },
  emoji:       { type: String, default: '🏺' },
  description: { type: String, required: true },
  priceSilv:   { type: Number, required: true },
  stock:       { type: Number, required: true }, // stock granted PER WINDOW if it rolls in
  roleId:      { type: String, default: null },
  roleDays:    { type: Number, default: 0 },
  active:      { type: Boolean, default: true }, // false = retired, never rolls into a window
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
}, { _id: false });

const artifactWindowSchema = new mongoose.Schema({
  windowStart: { type: Date, required: true, unique: true },
  windowEnd:   { type: Date, required: true },
  items:       [artifactWindowItemSchema],
});

const ArtifactPool   = mongoose.models.ArtifactPool   || mongoose.model('ArtifactPool', artifactPoolSchema);
const ArtifactWindow = mongoose.models.ArtifactWindow || mongoose.model('ArtifactWindow', artifactWindowSchema);

module.exports = { ArtifactPool, ArtifactWindow };
