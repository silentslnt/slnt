// models/silvExchange.js — Silv Exchange: the "more common" counterpart to
// the Artifact Shop. Same rotating-stock UX (random subset of the pool,
// tiny fixed stock, first-come-first-served) but resets DAILY instead of
// weekly and is always open — this is the actual earn path for SILV tokens
// through gameplay (spend coins from gambling), since before this the only
// ways to get SILV were paying real Robux, a rare 28-day login streak bonus,
// or an admin-only Mystery Box drop.
const mongoose = require('mongoose');

const silvExchangePoolSchema = new mongoose.Schema({
  itemId:      { type: String, required: true, unique: true },
  name:        { type: String, required: true },
  emoji:       { type: String, default: '🪙' },
  description: { type: String, required: true },
  coinCost:    { type: Number, required: true },
  silvAmount:  { type: Number, required: true },
  stock:       { type: Number, required: true }, // stock granted PER DAY if it rolls in
  active:      { type: Boolean, default: true },
});

const silvExchangeDayItemSchema = new mongoose.Schema({
  itemId:         String,
  name:           String,
  emoji:          String,
  description:    String,
  coinCost:       Number,
  silvAmount:     Number,
  remainingStock: Number,
  totalStock:     Number,
}, { _id: false });

const silvExchangeDaySchema = new mongoose.Schema({
  dayKey: { type: String, required: true, unique: true }, // YYYY-MM-DD (UTC)
  items:  [silvExchangeDayItemSchema],
});

const SilvExchangePool = mongoose.models.SilvExchangePool || mongoose.model('SilvExchangePool', silvExchangePoolSchema);
const SilvExchangeDay  = mongoose.models.SilvExchangeDay  || mongoose.model('SilvExchangeDay', silvExchangeDaySchema);

module.exports = { SilvExchangePool, SilvExchangeDay };
