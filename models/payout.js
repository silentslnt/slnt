// models/payout.js — SILV → Robux payout requests (see commands/payout.js).
const mongoose = require('mongoose');

const payoutSchema = new mongoose.Schema({
  userId:      { type: String, required: true, index: true },
  guildId:     { type: String, required: true },
  silv:        { type: Number, required: true },   // SILV taken into escrow
  robux:       { type: Number, required: true },   // what they're owed
  price:       { type: Number, required: true },   // the gamepass price they were told to set
  gamepassId:  { type: String, required: true },
  gamepassUrl: { type: String, required: true },
  passName:    { type: String, default: '' },
  passOwner:   { type: String, default: '' },
  verified:    { type: Boolean, default: false },  // price checked against Roblox at request time
  status:      { type: String, default: 'open', enum: ['open', 'paid', 'rejected', 'cancelled'] },
  note:        { type: String, default: '' },
  handledBy:   { type: String, default: null },
  handledAt:   { type: Date, default: null },
  channelId:   { type: String, default: null },
  messageId:   { type: String, default: null },
  createdAt:   { type: Date, default: Date.now },
});
// One open request per player — enforced by the database, not just the code.
payoutSchema.index({ userId: 1 }, { unique: true, partialFilterExpression: { status: 'open' } });
// The same gamepass can't be in two open requests (someone else's link reused).
payoutSchema.index({ gamepassId: 1 }, { unique: true, partialFilterExpression: { status: 'open' } });

const payoutConfigSchema = new mongoose.Schema({
  guildId:   { type: String, required: true, unique: true },
  channelId: { type: String, default: null },  // where requests are posted
  roleId:    { type: String, default: null },  // pinged on every request
  coverFee:  { type: Boolean, default: false }, // price the pass so they receive the full amount after Roblox's 30%
  open:      { type: Boolean, default: true },
});

module.exports = {
  Payout: mongoose.models.Payout || mongoose.model('Payout', payoutSchema),
  PayoutConfig: mongoose.models.PayoutConfig || mongoose.model('PayoutConfig', payoutConfigSchema),
};
