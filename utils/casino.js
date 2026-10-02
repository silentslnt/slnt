// utils/casino.js — shared plumbing for the CV2 casino games (crash, tower,
// cups, wheel, over/under). Bets are taken and paid on FRESH user data, so a
// game that waits on buttons never overwrites a balance change made in the
// meantime. Odds live in each game; the house edge rules live in houseEdge.js.
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const { parseBet } = require('./parseBet');
const { addXP } = require('./xp');
const { trackStat, checkAchievements } = require('./achievements');
const { announceWin } = require('./winAnnouncer');
const { XP_PER_GAME, XP_PER_WIN } = require('./config');
const { recordRound } = require('./houseBank');
const User = require('../models/user');

const BLACK = 0x000000;
const WIN = 0x3FA34D;
const LOSE = 0x8B0000;

/** A CV2 card: title, body, optional button rows, footer. */
function card({ title, body, rows = [], accent = BLACK, footer }) {
  const c = new ContainerBuilder().setAccentColor(accent)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}\n${body}`));
  if (rows.length) {
    c.addSeparatorComponents(new SeparatorBuilder());
    for (const r of rows) c.addActionRowComponents(r);
  }
  if (footer) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer}`));
  return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

function button(id, label, style = ButtonStyle.Secondary, disabled = false, emoji = null) {
  const b = new ButtonBuilder().setCustomId(id).setLabel(label).setStyle(style).setDisabled(disabled);
  if (emoji) b.setEmoji(emoji);
  return b;
}

function row(...buttons) {
  return new ActionRowBuilder().addComponents(...buttons);
}

/** Parse + take the bet. Returns { bet, userData } or null after replying with why. */
async function takeBet(ctx, arg, usage) {
  const { message, getUserData, saveSpecificUserData } = ctx;
  const userData = await getUserData(message.author.id);
  const bet = parseBet(arg, userData.balance || 0);
  if (!bet) {
    await message.channel.send(card({ title: usage.title, body: usage.body, footer: message.guild?.name || 'Shiro' }));
    return null;
  }
  if ((userData.balance || 0) < bet) {
    await message.channel.send(`You only have **${(userData.balance || 0).toLocaleString()}** coins.`);
    return null;
  }
  // Atomic: only taken if the balance still covers it right now (two games at once can't spend the same coins).
  const taken = await User.findOneAndUpdate({ userId: message.author.id, balance: { $gte: bet } }, { $inc: { balance: -bet } }, { new: true });
  if (!taken) {
    await message.channel.send("You don't have enough coins for that bet.");
    return null;
  }
  userData.balance = taken.balance;
  return { bet, userData };
}

/** Pay out (payout = gross incl. stake, 0 on a loss) and record stats. */
async function settle(ctx, { bet, payout, game, detail }) {
  const { message, getUserData, saveSpecificUserData, client, logAdminAction } = ctx;
  const uid = message.author.id;
  const userData = await getUserData(uid);
  const won = payout > bet;
  recordRound(game, bet, payout, 0, uid);
  if (payout > 0) {  // paid as an increment — never overwrites a balance change made meanwhile
    const after = await User.findOneAndUpdate({ userId: uid }, { $inc: { balance: payout } }, { new: true, upsert: true });
    userData.balance = after.balance;
    userData.totalEarned = (userData.totalEarned || 0) + Math.max(0, payout - bet);
  }
  await trackStat(userData, 'gamesPlayed', 1);
  if (won) {
    await trackStat(userData, 'gamesWon', 1);
    await trackStat(userData, 'coinsWon', payout - bet);
  }
  const save = (d) => saveSpecificUserData(uid, d);
  await save({ totalEarned: userData.totalEarned, stats: userData.stats });
  await addXP(uid, won ? XP_PER_GAME + XP_PER_WIN : XP_PER_GAME, userData, save, message).catch(() => {});
  await checkAchievements(userData, { message, saveUserData: save }).catch(() => {});
  if (won && client) {
    announceWin(client, {
      userId: uid, username: message.author.username,
      avatarURL: message.author.displayAvatarURL({ dynamic: true }),
      game, bet, payout, multiplier: bet > 0 ? payout / bet : 0, detail, logAdminAction,
    }).catch(() => {});
  }
  return userData.balance;
}

const fmtN = (n) => Math.floor(n || 0).toLocaleString();

/** The finished-game card every game uses: a big headline, the numbers, and a replay row.
 *  opts: { emoji, game, headline, won (true|false|null for a push), lines: [..], footer, replay: { game, bet, extra } } */
function gameResult({ emoji = '🎲', game, headline, won = null, lines = [], footer, replay, rowsBefore = [] }, withReplay = true) {
  const accent = won === true ? WIN : won === false ? LOSE : BLACK;
  const body = `# ${headline}\n` + lines.filter(Boolean).map((l) => (l.startsWith('-#') ? l : `> ${l}`)).join('\n');
  const rows = [...rowsBefore];
  if (withReplay && replay && replay.bet > 0) {
    if (replay.picks) {   // play again straight away with a different call (heads/tails, a colour, a hand)
      rows.push(row(...replay.picks.map(([label, emoji], k) => button(`rp:p:${k}`, `${label} · ${fmtN(replay.bet)}`, ButtonStyle.Primary, false, emoji))));
    }
    rows.push(replayRow(replay.game, replay.bet));
  }
  return card({ title: `${emoji} ${game}`, body, rows, accent, footer });
}

/** Again · Double · Half · Casino floor. */
function replayRow(game, bet) {
  const half = Math.max(1, Math.floor(bet / 2));
  return row(
    button(`rp:a:${bet}`, `Again · ${fmtN(bet)}`, ButtonStyle.Success, false, '🔁'),
    button(`rp:d:${bet * 2}`, `Double · ${fmtN(bet * 2)}`, ButtonStyle.Primary),
    button(`rp:h:${half}`, `Half · ${fmtN(half)}`, ButtonStyle.Secondary),
    button('rp:f:0', 'Casino floor', ButtonStyle.Secondary, false, '🎲'),
  );
}

/** Wire the replay row on a sent result: only the player can press it; each press runs the real command for them.
 *  After 2 minutes the row is removed (the card stays). */
function attachReplay(msg, ownerId, opts) {
  if (!msg || !opts.replay || !(opts.replay.bet > 0)) return;
  const col = msg.createMessageComponentCollector({ time: 120_000, filter: (i) => i.customId.startsWith('rp:') });
  col.on('collect', async (i) => {
    if (i.user.id !== ownerId) return i.reply({ content: 'Play your own round — `.play`.', flags: MessageFlags.Ephemeral }).catch(() => {});
    await i.deferUpdate().catch(() => {});
    const [, kind, amt] = i.customId.split(':');
    if (kind === 'f') return i.client.runAs(i, 'play', []);
    if (kind === 'p') return i.client.runAs(i, opts.replay.game, [String(opts.replay.bet), ...(opts.replay.picks[Number(amt)][2] || [])]);
    return i.client.runAs(i, opts.replay.game, [String(amt), ...(opts.replay.extra || [])]);
  });
  col.on('end', () => msg.edit(gameResult(opts, false)).catch(() => {}));
}

module.exports = { card, button, row, takeBet, settle, gameResult, replayRow, attachReplay, BLACK, WIN, LOSE, ButtonStyle };
