// utils/gameChannel.js — the shared minigame channel for hangman, word
// scramble (ws.js), and guess.js. Used to be 3 separate hardcoded literals
// duplicated across those files with no way to change any of them without
// editing code — this is the single source of truth now, admin-settable via
// .gamechannel. In-memory only (matches keydrop.js's existing channel-setting
// pattern in this codebase); resets to the original default on a restart,
// which is fine for a "which channel" setting, not a money-critical value.
let gameChannelId = '1401925188991582338';

function getGameChannelId() {
  return gameChannelId;
}

function setGameChannelId(id) {
  gameChannelId = id;
}

module.exports = { getGameChannelId, setGameChannelId };
