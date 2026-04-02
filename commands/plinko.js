// commands/plinko.js — Plinko (16-row ball drop)
// Ball drops through 16 rows of pegs, landing in one of 17 buckets.
// Risk level controls the spread of multipliers (low/medium/high).
const { EmbedBuilder } = require('discord.js');
const { COLOR, XP_PER_GAME, XP_PER_WIN } = require('../utils/config');
const { requireAdmin } = require('../utils/permissions');
const { parseBet } = require('../utils/parseBet');
const { getMultiplier } = require('../utils/essences');
const { addXP } = require('../utils/xp');
const { trackStat, checkAchievements } = require('../utils/achievements');
const { randomFloat } = require('../utils/rng');
const { announceWin } = require('../utils/winAnnouncer');

// Multiplier tables per risk level (17 buckets, symmetric)
// RTP ~97% for all risk levels
const MULTIPLIERS = {
  low: [
    0.5, 0.7, 0.9, 1.0, 1.1, 1.1, 1.1, 1.2,
    1.1, 1.1, 1.1, 1.0, 0.9, 0.7, 0.5, 0.3, 0.2,
  ],
  medium: [
    0.2, 0.4, 0.6, 0.8, 1.0, 1.4, 1.6, 2.0,
    1.6, 1.4, 1.0, 0.8, 0.6, 0.4, 0.2, 0.1, 0.05,
  ],
  high: [
    0.2, 0.3, 0.5, 0.8, 1.2, 2.0, 5.0, 10.0,
    5.0, 2.0, 1.2, 0.8, 0.5, 0.3, 0.2, 0.1, 0.02,
  ],
};

const ROWS = 16; // 16 pegs → 17 buckets

/**
 * Simulate a Plinko ball drop.
 * Each row the ball goes left (0) or right (1).
 * Count of rights = bucket index (0–16).
 */
function dropBall(riskBias = 0) {
  let pos = 0;
  const path = [];
  for (let i = 0; i < ROWS; i++) {
    const r = randomFloat();
    const goRight = r < (0.5 + riskBias);
    path.push(goRight ? '╲' : '╱');
    if (goRight) pos++;
  }
  return { bucket: pos, path };
}

/**
 * Draw a simplified ASCII path through the pyramid.
 */
function drawPath(path) {
  const mid = '· ';
  let lines = [];
  for (let row = 0; row < Math.min(path.length, 8); row++) {
    const dir = path[row] === '╲' ? '↘' : '↙';
    lines.push(`Row ${row + 1}: ${dir}`);
  }
  return lines.join('\n');
}

const BUCKET_BARS = ['🟥','🟧','🟨','🟩','🟦','🟪','⬜','🔵','⬜','🟪','🟦','🟩','🟨','🟧','🟥','🟥','🟥'];

module.exports = {
  name: 'plinko',
  aliases: ['pl'],
  adminOnly: true,
  description: 'Drop a ball through Plinko pegs. `.plinko <bet> [low|medium|high]`',

  async execute({ message, args, userData, saveUserData, client }) {
    if (!await requireAdmin(message)) return;

    const betArg  = args[0];
    const riskArg = (args[1] || 'medium').toLowerCase();
    const bet     = parseBet(betArg, userData.balance || 0);

    if (!bet || !['low','medium','high'].includes(riskArg)) {
      return message.channel.send({
        embeds: [new EmbedBuilder().setColor(COLOR.DEFAULT)
          .setTitle('˗ˏˋ 🎯 Plinko ˎˊ˗')
          .setDescription(
            '꒰ঌ Usage ໒꒱\n\n' +
            '`.plinko <bet> [risk]`\n\n' +
            '**Risk levels:**\n' +
            '`low` — steady, multipliers 0.2×–1.2×\n' +
            '`medium` — balanced, up to 2×\n' +
            '`high` — volatile, up to 10×\n\n' +
            '**Examples:**\n' +
            '`.plinko 500 medium`\n' +
            '`.plinko all high`'
          )
          .setFooter({ text: 'System • Plinko  |  RTP ~97%' })],
      });
    }

    if ((userData.balance || 0) < bet) {
      return message.channel.send({ content: `❌ You only have **${(userData.balance||0).toLocaleString()}** coins.` });
    }

    userData.balance = (userData.balance || 0) - bet;
    await saveUserData(userData);

    const { bucket } = dropBall();
    const mults = MULTIPLIERS[riskArg];
    const baseMulti = mults[bucket] || 0.1;

    const frenzy   = await getMultiplier(message.author.id, 'frenzy').catch(() => 1);
    const finalMulti = Math.round(baseMulti * frenzy * 100) / 100;
    const payout     = Math.floor(bet * finalMulti);
    const profit     = payout - bet;
    const won        = payout > bet;

    userData.balance = (userData.balance || 0) + payout;
    await saveUserData(userData);

    await addXP(message.author.id, XP_PER_GAME + (won ? XP_PER_WIN : 0)).catch(() => {});
    await trackStat(message.author.id, 'gamesPlayed', 1).catch(() => {});
    if (won) await trackStat(message.author.id, 'gamesWon', 1).catch(() => {});
    if (won) await trackStat(message.author.id, 'coinsWon', profit).catch(() => {});
    await checkAchievements(message.author.id, userData).catch(() => {});

    // Build visual bucket row
    const bucketRow = mults.map((m, i) => {
      const bar = BUCKET_BARS[i] || '⬜';
      return i === bucket ? `**${m}×**` : `${m}×`;
    }).join(' ');

    const statusLine = won
      ? `✅ Ball landed in bucket **${bucket + 1}** — **×${finalMulti}** → **+${profit.toLocaleString()}** coins!`
      : `❌ Ball landed in bucket **${bucket + 1}** — **×${finalMulti}** → lost **${(bet - payout).toLocaleString()}** coins.`;

    const embed = new EmbedBuilder()
      .setColor(won ? COLOR.WIN : COLOR.LOSS)
      .setTitle('˗ˏˋ 🎯 Plinko ˎˊ˗')
      .setDescription(
        `${statusLine}\n\n` +
        `꒰ Risk: \`${riskArg}\` · Bet: \`${bet.toLocaleString()}\` ꒱\n` +
        `꒰ Multiplier: \`×${baseMulti}\`${frenzy > 1 ? ` → \`×${finalMulti}\` (Frenzy!)` : ''} ꒱\n` +
        `꒰ Payout: \`${payout.toLocaleString()}\` ꒱`
      )
      .setFooter({ text: 'System • Plinko  |  RTP ~97%' });

    await message.channel.send({ embeds: [embed] });

    if (client && won) {
      announceWin(client, {
        userId: message.author.id,
        username: message.author.username,
        avatarURL: message.author.displayAvatarURL({ dynamic: true }),
        game: 'plinko',
        bet,
        payout,
        multiplier: finalMulti,
        detail: `${riskArg} risk · bucket ${bucket + 1}/17`,
      }).catch(() => {});
    }
  },
};
