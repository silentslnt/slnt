// ============================================================
//  KON BOT — Command Handler Patch
//  Drop this into your index.js or command handler.
//  Replaces your current command dispatch loop.
// ============================================================

// ── Command registry (all aliases → command name) ──────────────────────────
const COMMAND_ALIASES = {
  // Economy
  'bal': 'bal', 'balance': 'bal', 'b': 'bal', 'coins': 'bal',
  'daily': 'daily', 'day': 'daily',
  'missions': 'missions', 'ms': 'missions', 'mission': 'missions',
  'profile': 'profile', 'pf': 'profile', 'p': 'profile',
  'invest': 'invest', 'vault': 'invest', 'iv': 'invest',
  'leaderboard': 'leaderboard', 'lb': 'leaderboard', 'baltop': 'leaderboard',
  'gift': 'gift', 'give': 'gift', 'gft': 'gift',
  'duel': 'duel', 'dl': 'duel',
  'achievements': 'achievements', 'ach': 'achievements', 'achs': 'achievements',

  // Gambling
  'blackjack': 'blackjack', 'bj': 'blackjack',
  'slots': 'slots', 'sl': 'slots', 's': 'slots',
  'coinflip': 'coinflip', 'cf': 'coinflip',
  'roulette': 'roulette', 'rl': 'roulette',
  'dice': 'dice', 'd': 'dice',
  'rps': 'rps',
  'crash': 'crash', 'cr': 'crash',
  'tower': 'tower', 'tw': 'tower',
  'wheel': 'wheel', 'wh': 'wheel',
  'cups': 'cups', 'shell': 'cups',
  'overunder': 'overunder', 'ou': 'overunder',
  'keno': 'keno',
  'minesweeper': 'minesweeper', 'mine': 'minesweeper',

  // Keys / Inventory
  'redeem': 'claim', 'rd': 'claim', 'claim': 'claim',
  'open': 'open', 'op': 'open',
  'inventory': 'inventory', 'inv': 'inventory', 'i': 'inventory',
  'trade': 'trade', 'tr': 'trade',
  'shop': 'shop', 'sh': 'shop', 'store': 'shop',
  'lottery': 'lottery', 'lot': 'lottery',
  'mysterybox': 'mysterybox', 'openmysterybox': 'mysterybox',

  // Characters
  'roll': 'characterroll', 'r': 'characterroll',
  'characters': 'characters', 'chars': 'characters', 'c': 'characters',
  'charinfo': 'characterinfo', 'ci': 'characterinfo',
  'battle': 'battle', 'bt': 'battle',

  // Minigames
  'hangman': 'hangman', 'hm': 'hangman',
  'cipher': 'cipher', 'cph': 'cipher',
  'wordscramble': 'ws', 'ws': 'ws',
  'guess': 'guess',

  // Admin
  'admin': 'admin', 'adm': 'admin',
  'adminlogs': 'adminlogs', 'al': 'adminlogs',
  'togkey': 'togkey', 'tkd': 'togkey',
  'setchannel': 'setchannel', 'sc': 'setchannel',
  'testrole': 'testrole',

  // Help
  'help': 'help', 'h': 'help', 'commands': 'help', 'cmds': 'help',
};

// ── Non-admin public commands ───────────────────────────────────────────────
const PUBLIC_COMMANDS = new Set([
  'bal', 'leaderboard', 'profile', 'inventory', 'achievements',
  'daily', 'missions', 'help', 'claim', 'characters', 'characterinfo',
]);

// ── Minigame-response commands (always public) ──────────────────────────────
// These are response commands, not initiators — users just type letters/numbers.
// They are already gated inside each command file by the active game state.
const MINIGAME_RESPONSE_COMMANDS = new Set(['hangman', 'cipher', 'ws', 'guess']);

// ── Keys/game channel restriction ───────────────────────────────────────────
// The channel ID itself now lives in ./gameChannel.js (admin-settable via
// .gamechannel) — this used to be its own separate hardcoded literal here,
// a 4th independent copy of the same value duplicated across this file,
// index.js, and (until this pass) hangman.js/ws.js/guess.js individually.
//
// This allowlist used to be dead — this whole file was never require()'d
// by anything (its own header even says "Drop this into your index.js"
// and never was). index.js enforced a SEPARATE, shorter, diverging list
// inline instead, which meant .ws/.guess/.achievements/.leaderboard were
// silently blocked in the game channel despite this "authoritative"-looking
// list saying they should work. Merged both lists; this is now the one
// index.js actually imports and enforces.
const KEYS_CHANNEL_ALLOWED = new Set([
  'claim', 'redeem', 'inventory', 'inv', 'bal', 'baltop', 'leaderboard',
  'profile', 'setchannel', 'gamechannel', 'help', 'cipher', 'hangman',
  'ws', 'guess', 'achievements', 'tkd', 'admin', 'commands',
]);

// ── Passive income cron (call this in your ready event) ─────────────────────
// Runs every 60 minutes to award passive income to active users.
function startPassiveCron(client, getUserData, saveSpecificUserData) {
  const { getPassiveIncome } = require('./utils/prestige');
  const { isEssenceActive }  = require('./utils/essences');

  setInterval(async () => {
    // This is simplified — in production you'd query DB for active users.
    // Patch this into your existing user loop / activity tracker.
    console.log('[Passive Cron] Running passive income tick...');
  }, 60 * 60 * 1000);
}

// NOTE: COMMAND_ALIASES and startPassiveCron below are NOT wired up anywhere
// — this whole file was never require()'d until this pass (see comment
// above). index.js has its own, separate, working two-pass alias loader
// already (primary command names claimed first, then aliases only if
// unclaimed) — COMMAND_ALIASES here would conflict with it, not complement
// it, so it's left disconnected on purpose. startPassiveCron is an inert
// stub (its own comment says "Patch this into your existing user loop").
// Only KEYS_CHANNEL_ALLOWED is actually used, by index.js.
module.exports = { COMMAND_ALIASES, PUBLIC_COMMANDS, MINIGAME_RESPONSE_COMMANDS, KEYS_CHANNEL_ALLOWED, startPassiveCron };