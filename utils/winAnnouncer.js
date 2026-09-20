// utils/winAnnouncer.js — Post big wins to a configured announcement channel
const { EmbedBuilder } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const CFG_FILE = path.join(__dirname, '..', 'vouch-config.json');

function loadCfg() {
  try { return JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); } catch { return {}; }
}

// Loaded once at startup; index.js calls updateCfg() after every config save.
let cachedCfg = loadCfg();

function updateCfg(newCfg) {
  cachedCfg = newCfg;
}

// Minimum multiplier or absolute win to trigger an announcement
const WIN_THRESHOLD_MULTIPLIER = 3;   // 3x or more
const WIN_THRESHOLD_COINS      = 2000; // or won at least 2000 coins

const GAME_EMOJIS = {
  mines:     '💣',
  plinko:    '🎯',
  blackjack: '♠️',
  slots:     '🎰',
  roulette:  '🎡',
  coinflip:  '🪙',
  dice:      '🎲',
  keno:      '🔢',
  tower:     '🗼',
  default:   '🎮',
};

/**
 * Announce a big win — posts to the public wins channel if configured, and
 * separately logs to the moderation/economy log channel if a logAdminAction
 * function is passed. Either, both, or neither may be configured; each is
 * independent so a big win is never silently missed just because one
 * channel isn't set up.
 *
 * @param {Client} client   - Discord client
 * @param {Object} opts
 * @param {string} opts.userId
 * @param {string} opts.username
 * @param {string} opts.avatarURL
 * @param {string} opts.game       - game key e.g. 'mines'
 * @param {number} opts.bet
 * @param {number} opts.payout     - total coins returned (including bet)
 * @param {number} opts.multiplier - e.g. 5.5
 * @param {string} [opts.detail]   - optional flavour text
 * @param {Function} [opts.logAdminAction] - from command context, for the mod log
 */
async function announceWin(client, opts) {
  const profit = opts.payout - opts.bet;
  const meetsThreshold =
    opts.multiplier >= WIN_THRESHOLD_MULTIPLIER ||
    profit >= WIN_THRESHOLD_COINS;
  if (!meetsThreshold) return;

  const cfg = cachedCfg;
  if (cfg.winsChannelId) {
    try {
      const ch = await client.channels.fetch(cfg.winsChannelId);
      const emoji = GAME_EMOJIS[opts.game] || GAME_EMOJIS.default;
      const embed = new EmbedBuilder()
        .setColor(0xFFD700)
        .setAuthor({ name: opts.username, iconURL: opts.avatarURL })
        .setDescription(
          `${emoji} **${opts.username}** won **${profit.toLocaleString()} SILV coins** in **${opts.game}**!\n` +
          `꒰ Bet: \`${opts.bet.toLocaleString()}\` · Payout: \`${opts.payout.toLocaleString()}\` · Multiplier: \`${opts.multiplier}x\` ꒱` +
          (opts.detail ? `\n> ${opts.detail}` : '')
        )
        .setTimestamp();
      await ch.send({ embeds: [embed] });
    } catch (e) {
      // Silent fail — wins channel might not be set yet
    }
  }

  if (opts.logAdminAction) {
    await opts.logAdminAction(
      opts.userId, opts.username, opts.game, 'Big Win', null, null,
      `bet ${opts.bet.toLocaleString()} → payout ${opts.payout.toLocaleString()} (${opts.multiplier}×)${opts.detail ? ` — ${opts.detail}` : ''}`,
    );
  }
}

module.exports = { announceWin, updateCfg };
