// utils/rng.js — Provably Fair RNG
// Each result is derived from a server seed + client seed + nonce,
// hashed with HMAC-SHA256 so players can verify outcomes.
const crypto = require('crypto');

/**
 * Generate a random server seed (hex string).
 */
function generateServerSeed() {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a server seed so it can be shown to the player before the game
 * without revealing the seed itself.
 */
function hashSeed(seed) {
  return crypto.createHash('sha256').update(seed).digest('hex');
}

/**
 * Derive a float in [0, 1) from seed + nonce using HMAC-SHA256.
 * This is the same algorithm used by most provably fair casinos.
 */
function seedToFloat(serverSeed, clientSeed, nonce) {
  const hmac = crypto.createHmac('sha256', serverSeed);
  hmac.update(`${clientSeed}:${nonce}`);
  const hex = hmac.digest('hex');
  // Use first 8 hex chars = 32 bits, divide by max 32-bit value
  return parseInt(hex.slice(0, 8), 16) / 0xffffffff;
}

/**
 * Derive multiple floats from the same seeds using incrementing nonce offsets.
 */
function seedToFloats(serverSeed, clientSeed, nonce, count) {
  return Array.from({ length: count }, (_, i) => seedToFloat(serverSeed, clientSeed, nonce + i));
}

/**
 * Simple CSPRNG float [0,1) for non-provable games (faster).
 */
function randomFloat() {
  return crypto.randomBytes(4).readUInt32BE() / 0xffffffff;
}

/**
 * Random integer in [min, max] inclusive.
 */
function randomInt(min, max) {
  return Math.floor(randomFloat() * (max - min + 1)) + min;
}

/**
 * Shuffle an array in place using CSPRNG Fisher-Yates.
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(randomFloat() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

/**
 * Pick N unique random indices from [0, size).
 */
function pickUniqueIndices(size, count) {
  const indices = Array.from({ length: size }, (_, i) => i);
  shuffle(indices);
  return indices.slice(0, count);
}

module.exports = {
  generateServerSeed,
  hashSeed,
  seedToFloat,
  seedToFloats,
  randomFloat,
  randomInt,
  shuffle,
  pickUniqueIndices,
};
