// utils/winAnnouncer.js — Post big wins to a configured announcement channel
const { EmbedBuilder } = require('discord.js');
const fs   = require('fs');
const path = require('path');

const CFG_FILE = path.join(__dirname, '..', 'vouch-config.json');

function loadCfg() {
  try { return JSON.parse(fs.readFileSync(CFG_FILE, 'utf8')); } catch { return {}; }
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
 * Announce a big win to the wins channel if configured and threshold met.
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
 */
async function announceWin(client, opts) {
  const cfg = loadCfg();
  if (!cfg.winsChannelId) return;

  const profit = opts.payout - opts.bet;
  const meetsThreshold =
    opts.multiplier >= WIN_THRESHOLD_MULTIPLIER ||
    profit >= WIN_THRESHOLD_COINS;
  if (!meetsThreshold) return;

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
  } catch(e) {
    // Silent fail — wins channel might not be set yet
  }
}

module.exports = { announceWin };
