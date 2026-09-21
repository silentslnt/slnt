// utils/gameChannel.js — the shared minigame channel for hangman, word
// scramble (ws.js), and guess.js. Used to be 3 separate hardcoded literals
// duplicated across those files with no way to change any of them without
// editing code — this is the single source of truth now, admin-settable via
// .gamechannel. Persisted to disk (same JSON-file pattern index.js already
// uses for vouch-config.json/economyLogsChannelId) — this used to be
// in-memory only, which silently reset to the hardcoded default on every
// restart and was a real source of "why doesn't .gamechannel stick" confusion.
const fs = require('fs');
const path = require('path');

const CONFIG_FILE = path.join(__dirname, '..', 'game-channel-config.json');
const DEFAULT_CHANNEL_ID = '1401925188991582338';

function load() {
  try {
    const data = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf8'));
    if (data && data.gameChannelId) return data.gameChannelId;
  } catch { /* file doesn't exist yet, or is unreadable — fall back to default */ }
  return DEFAULT_CHANNEL_ID;
}

let gameChannelId = load();

function getGameChannelId() {
  return gameChannelId;
}

function setGameChannelId(id) {
  gameChannelId = id;
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify({ gameChannelId: id }, null, 2));
  } catch (err) {
    console.error('[gameChannel] failed to persist channel change:', err.message);
  }
}

module.exports = { getGameChannelId, setGameChannelId };
