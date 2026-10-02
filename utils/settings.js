// utils/settings.js — bot settings kept in MongoDB (direct: "why does Shiro keep forgetting the game channel I set").
// They used to live in JSON files on disk, and Railway wipes the disk on every redeploy, so the game channel,
// prefix, vouch/wins/log channels reset after each update. Now: one Meta doc `bot_settings`, cached in memory,
// loaded once at startup (load()), written through on every change. The old files are read once as a fallback,
// so nothing set before this is lost.
const mongoose = require('mongoose');

const metaSchema = new mongoose.Schema({ key: { type: String, unique: true }, value: mongoose.Schema.Types.Mixed });
const Meta = mongoose.models.Meta || mongoose.model('Meta', metaSchema);
const KEY = 'bot_settings';
let cache = {};

async function load(fallbacks = {}) {
  const doc = await Meta.findOne({ key: KEY }).lean().catch(() => null);
  cache = (doc && doc.value) || {};
  const missing = Object.entries(fallbacks).filter(([k, v]) => cache[k] === undefined && v !== undefined && v !== null);
  for (const [k, v] of missing) await set(k, v);   // carry over what the old files held
  return cache;
}

function get(key, def = undefined) {
  return cache[key] === undefined ? def : cache[key];
}

async function set(key, value) {
  cache[key] = value;
  await Meta.updateOne({ key: KEY }, { $set: { [`value.${key}`]: value } }, { upsert: true }).catch((e) =>
    console.error('[settings] save failed:', e.message));
}

module.exports = { load, get, set };
