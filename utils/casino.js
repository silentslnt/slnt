// utils/casino.js — shared plumbing for the CV2 games (crash, tower,
// cups, wheel, over/under). Bets are taken and paid on FRESH user data, so a
// game that waits on buttons never overwrites a balance change made in the
// meantime. Odds live in each game; the house edge rules live in houseEdge.js.
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
  MediaGalleryBuilder, MediaGalleryItemBuilder, AttachmentBuilder,
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

// direct: "the embed colour… black… it should be fitting the theme of the game" — a card that isn't a win/loss result
// takes its game's colour (matched on the title). WIN / LOSE results keep green / red.
const THEMES = [
  [/blackjack/i, 0x0B6E3A], [/crash/i, 0xFF6B1A], [/tower/i, 0x7B4BC4], [/cups/i, 0xC08A2E], [/wheel/i, 0xE0B43A],
  [/over|under/i, 0x2E86DE], [/minesweeper/i, 0x8E9AAF], [/mines/i, 0x2BB673], [/scratch/i, 0xF2C94C],
  [/battleship/i, 0x0E6BA8], [/connect/i, 0x1D4ED8], [/flip/i, 0xD4AF37], [/rps|rock/i, 0x9B51E0], [/dice/i, 0xE74C3C],
  [/roulette/i, 0xB71C1C], [/slots/i, 0xFF2D95], [/plinko/i, 0x00B3E6], [/rain/i, 0x5DADE2], [/roll/i, 0xE67E22],
];
const themeFor = (title = '') => (THEMES.find(([re]) => re.test(title)) || [null, BLACK])[1];

/** A CV2 card: title, body, optional button rows, footer. image = { name, buffer } shows a drawn picture under the
 *  title (the payload carries the file and replaces any older picture on an edit). */
function card({ title, body, rows = [], accent = BLACK, footer, image = null }) {
  if (accent === BLACK) accent = themeFor(title);
  const c = new ContainerBuilder().setAccentColor(accent)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${title}${image ? '' : `\n${body}`}`));
  if (image) {
    c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL(`attachment://${image.name}`)));
    if (body) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  }
  if (rows.length) {
    c.addSeparatorComponents(new SeparatorBuilder());
    for (const r of rows) c.addActionRowComponents(r);
  }
  if (footer) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${footer}`));
  const out = { components: [c], flags: MessageFlags.IsComponentsV2 };
  if (image) { out.files = [new AttachmentBuilder(image.buffer, { name: image.name })]; out.attachments = []; }
  return out;
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
  const bet = parseBet(arg, userData);
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
    require('./referralBonus').onWin(uid, payout - bet).catch(() => {});   // their recruiter's share — paid by the house
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
function gameResult({ emoji = '🎲', game, headline, won = null, lines = [], footer, replay, rowsBefore = [], art = null }, withReplay = true) {
  const accent = won === true ? WIN : won === false ? LOSE : themeFor(game);
  // with a drawn picture (art: PNG buffer) the numbers live in the picture — the text keeps the headline + small notes
  const body = art
    ? `### ${headline}` + lines.filter((l) => l && l.startsWith('-#')).map((l) => `\n${l}`).join('')
    : `# ${headline}\n` + lines.filter(Boolean).map((l) => (l.startsWith('-#') ? l : `> ${l}`)).join('\n');
  const rows = [...rowsBefore];
  if (withReplay && replay && replay.bet > 0) {
    if (replay.picks) {   // play again straight away with a different call (heads/tails, a colour, a hand)
      rows.push(row(...replay.picks.map(([label, emoji], k) => button(`rp:p:${k}`, `${label} · ${fmtN(replay.bet)}`, ButtonStyle.Primary, false, emoji))));
    }
    rows.push(replayRow(replay.game, replay.bet));
  }
  return card({ title: `${emoji} ${game}`, body, rows, accent, footer, image: art ? { name: 'game.png', buffer: art } : null });
}

/** Again · Double · Half · Game floor. */
function replayRow(game, bet) {
  const half = Math.max(1, Math.floor(bet / 2));
  return row(
    button(`rp:a:${bet}`, `Again · ${fmtN(bet)}`, ButtonStyle.Success, false, '🔁'),
    button(`rp:d:${bet * 2}`, `Double · ${fmtN(bet * 2)}`, ButtonStyle.Primary),
    button(`rp:h:${half}`, `Half · ${fmtN(half)}`, ButtonStyle.Secondary),
    button('rp:f:0', 'Game floor', ButtonStyle.Secondary, false, '🎲'),
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
  col.on('end', () => msg.edit(opts.final ? opts.final() : gameResult(opts, false)).catch(() => {}));   // games with their own board pass final()
}

module.exports = { card, themeFor, button, row, takeBet, settle, gameResult, replayRow, attachReplay, BLACK, WIN, LOSE, ButtonStyle };
