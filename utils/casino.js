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
  userData.balance -= bet;
  await saveSpecificUserData(message.author.id, { balance: userData.balance });
  return { bet, userData };
}

/** Pay out (payout = gross incl. stake, 0 on a loss) and record stats. */
async function settle(ctx, { bet, payout, game, detail }) {
  const { message, getUserData, saveSpecificUserData, client, logAdminAction } = ctx;
  const uid = message.author.id;
  const userData = await getUserData(uid);
  const won = payout > bet;
  recordRound(game, bet, payout);
  if (payout > 0) {
    userData.balance = (userData.balance || 0) + payout;
    userData.totalEarned = (userData.totalEarned || 0) + Math.max(0, payout - bet);
  }
  await trackStat(userData, 'gamesPlayed', 1);
  if (won) {
    await trackStat(userData, 'gamesWon', 1);
    await trackStat(userData, 'coinsWon', payout - bet);
  }
  const save = (d) => saveSpecificUserData(uid, d);
  await save({ balance: userData.balance, totalEarned: userData.totalEarned, stats: userData.stats });
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

module.exports = { card, button, row, takeBet, settle, BLACK, WIN, LOSE, ButtonStyle };
