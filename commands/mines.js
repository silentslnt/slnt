// commands/mines.js — Mines (Minesweeper casino game)
// Player picks tiles on a 5×5 grid; each safe reveal increases the multiplier.
// Hit a mine and lose everything. Cash out any time to lock in winnings.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { XP_PER_GAME, XP_PER_WIN } = require('../utils/config');

const BLACK = 0x000000;
const { parseBet } = require('../utils/parseBet');
const { getMultiplier } = require('../utils/essences');
const { addXP } = require('../utils/xp');
const { trackStat, checkAchievements } = require('../utils/achievements');
const { pickUniqueIndices } = require('../utils/rng');
const { announceWin } = require('../utils/winAnnouncer');

// Multiplier table: [mineCount][safeReveals] → multiplier
// RTP target ~97%. Formula: nCr(25-mines, reveals) / nCr(25, reveals) gives prob of survival.
function calcMultiplier(mines, revealed) {
  if (revealed === 0) return 1.00;
  const safe = 25 - mines;
  let prob = 1;
  for (let i = 0; i < revealed; i++) {
    prob *= (safe - i) / (25 - i);
  }
  // House edge: 3%
  return Math.max(1.01, Math.round((0.97 / prob) * 100) / 100);
}

// Active game sessions: userId → { bet, mines, minePositions, revealed: Set, grid: string[] }
const SESSIONS = new Map();

const GRID_SIZE = 25; // 5×5
const MINE_COUNTS = [1, 2, 3, 5, 7, 10, 15, 20, 24];

function buildGrid(session) {
  const rows = [];
  for (let row = 0; row < 5; row++) {
    const btns = [];
    for (let col = 0; col < 5; col++) {
      const idx = row * 5 + col;
      const isRevealed = session.revealed.has(idx);
      const isMine     = session.minePositions.has(idx);
      if (isRevealed) {
        btns.push(new ButtonBuilder()
          .setCustomId(`mines_tile_${idx}`)
          .setEmoji(isMine ? '💥' : '💎')
          .setStyle(isMine ? ButtonStyle.Danger : ButtonStyle.Success)
          .setDisabled(true));
      } else {
        btns.push(new ButtonBuilder()
          .setCustomId(`mines_tile_${idx}`)
          .setLabel('·')
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(session.ended));
      }
    }
    rows.push(new ActionRowBuilder().addComponents(btns));
  }
  return rows;
}

function buildCashoutRow(session) {
  const multi = calcMultiplier(session.mines, session.revealed.size);
  const payout = Math.floor(session.bet * multi);
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('mines_cashout')
      .setLabel(`💰 Cash Out  ×${multi}  (+${(payout - session.bet).toLocaleString()})`)
      .setStyle(ButtonStyle.Primary)
      .setDisabled(session.revealed.size === 0 || session.ended)
  );
}

function buildEmbed(session, status = '', guildName = 'Shiro') {
  const multi  = calcMultiplier(session.mines, session.revealed.size);
  const payout = Math.floor(session.bet * multi);
  const safe   = 25 - session.mines - session.revealed.size;

  return new EmbedBuilder()
    .setColor(BLACK)
    .setTitle('MINES')
    .setDescription(
      (status ? `> ${status}\n\n` : '') +
      `> Bet: \`${session.bet.toLocaleString()}\` · Mines: \`${session.mines}\`\n` +
      `> Revealed: \`${session.revealed.size}\` safe · Multiplier: \`×${multi}\`\n` +
      `> Cash out value: \`${payout.toLocaleString()}\`\n\n` +
      `-# ${safe} safe tiles remain — dig deeper or cash out.`
    )
    .setFooter({ text: `${guildName} — RTP ~97%` });
}

module.exports = {
  name: 'mines',
  aliases: ['mine', 'mn'],
  description: 'Mines game. `.mines <bet> [mine count 1-24]`',

  async execute({ message, args, userData, saveUserData, client, logAdminAction }) {
    const userId = message.author.id;

    // If player already has a session, remind them
    if (SESSIONS.has(userId)) {
      return message.channel.send('You already have an active Mines game! Click a tile or cash out.');
    }

    const betArg   = args[0];
    const mineArg  = parseInt(args[1]) || 3;
    const bet      = parseBet(betArg, userData.balance || 0);
    const mines    = Math.max(1, Math.min(24, mineArg));

    if (!bet) {
      return message.channel.send({
        embeds: [new EmbedBuilder().setColor(BLACK)
          .setTitle('MINES')
          .setDescription(
            '> Usage: `.mines <bet> [mines]`\n\n' +
            '__**Mine Counts**__\n> 1 · 2 · 3 · 5 · 7 · 10 · 15 · 20 · 24\n\n' +
            '__**Examples**__\n' +
            '> `.mines 500` — 500 bet, 3 mines (default)\n' +
            '> `.mines 1000 5` — 1000 bet, 5 mines\n\n' +
            '-# More mines = higher multipliers per tile revealed.'
          )
          .setFooter({ text: `${message.guild?.name || 'Shiro'} — RTP ~97%` })],
      });
    }

    if ((userData.balance || 0) < bet) {
      return message.channel.send(`You only have **${(userData.balance||0).toLocaleString()}** coins.`);
    }

    // Deduct bet
    userData.balance = (userData.balance || 0) - bet;
    await saveUserData({ balance: userData.balance });

    // Place mines
    const minePositions = new Set(pickUniqueIndices(GRID_SIZE, mines));
    const session = {
      userId, bet, mines,
      minePositions,
      revealed: new Set(),
      ended: false,
      won: false,
      gameMsg: null,
    };
    SESSIONS.set(userId, session);

    const rows = [...buildGrid(session), buildCashoutRow(session)];
    const msg  = await message.channel.send({ embeds: [buildEmbed(session, '', message.guild?.name)], components: rows });
    session.gameMsg = msg;

    // Collector
    const collector = msg.createMessageComponentCollector({ time: 5 * 60 * 1000 });

    collector.on('collect', async (i) => {
      if (i.user.id !== userId) {
        return i.reply({ content: '❌ This is not your game.', ephemeral: true });
      }

      if (session.ended) {
        return i.deferUpdate();
      }

      // Cash out
      if (i.customId === 'mines_cashout') {
        const multi  = calcMultiplier(session.mines, session.revealed.size);
        const payout = Math.floor(session.bet * multi);
        session.ended = true;
        session.won   = true;

        // Frenzy essence multiplier
        const frenzy   = getMultiplier(userData, 'frenzy');
        const finalPay = Math.floor(payout * frenzy);

        userData.balance     = (userData.balance || 0) + finalPay;
        userData.totalEarned = (userData.totalEarned || 0) + Math.max(0, finalPay - bet);
        await saveUserData({ balance: userData.balance, totalEarned: userData.totalEarned });
        await addXP(userId, XP_PER_GAME + XP_PER_WIN, userData, saveUserData, message);
        await trackStat(userData, 'gamesWon', 1);
        await trackStat(userData, 'coinsWon', finalPay - bet);
        await checkAchievements(userData, { message, saveUserData });

        // Reveal all mines
        for (const mineIdx of session.minePositions) session.revealed.add(mineIdx);

        // Win announcer
        if (client) {
          announceWin(client, {
            userId,
            username: i.user.username,
            avatarURL: i.user.displayAvatarURL({ dynamic: true }),
            game: 'mines',
            bet,
            payout: finalPay,
            multiplier: multi,
            detail: `${session.revealed.size - mines} tiles revealed, ${mines} mines survived`,
            logAdminAction,
          }).catch(() => {});
        }

        const status = frenzy > 1
          ? `✅ Cashed out! ×${multi} → ×${(multi * frenzy).toFixed(2)} (Frenzy) = **${finalPay.toLocaleString()}** coins!`
          : `✅ Cashed out at ×${multi} — **+${(finalPay - bet).toLocaleString()}** coins!`;

        await i.update({
          embeds: [buildEmbed(session, status, message.guild?.name)],
          components: [...buildGrid(session), buildCashoutRow(session)],
        });
        collector.stop('cashout');
        return;
      }

      // Tile click
      if (i.customId.startsWith('mines_tile_')) {
        const idx = parseInt(i.customId.replace('mines_tile_', ''));
        if (session.revealed.has(idx)) return i.deferUpdate();

        session.revealed.add(idx);

        if (session.minePositions.has(idx)) {
          // BOOM — reveal all mines
          session.ended = true;
          session.won   = false;
          for (const mineIdx of session.minePositions) session.revealed.add(mineIdx);

          await addXP(userId, XP_PER_GAME, userData, saveUserData, message);
          await trackStat(userData, 'gamesPlayed', 1);
          await checkAchievements(userData, { message, saveUserData });

          await i.update({
            embeds: [buildEmbed(session, `BOOM! You hit a mine! Lost **${bet.toLocaleString()}** coins.`, message.guild?.name)],
            components: [...buildGrid(session), buildCashoutRow(session)],
          });
          collector.stop('mine_hit');
          return;
        }

        // Safe tile — check if all safe tiles revealed (auto-cashout)
        const totalSafe = 25 - session.mines;
        if (session.revealed.size === totalSafe) {
          // Maximum reveal — auto-cashout
          const multi  = calcMultiplier(session.mines, session.revealed.size);
          const payout = Math.floor(session.bet * multi);
          session.ended = true;
          session.won   = true;

          userData.balance     = (userData.balance || 0) + payout;
          userData.totalEarned = (userData.totalEarned || 0) + Math.max(0, payout - bet);
          await saveUserData({ balance: userData.balance, totalEarned: userData.totalEarned });
          await addXP(userId, XP_PER_GAME + XP_PER_WIN * 2, userData, saveUserData, message);
          await trackStat(userData, 'gamesWon', 1);
          await trackStat(userData, 'coinsWon', payout - bet);
          await checkAchievements(userData, { message, saveUserData });

          await i.update({
            embeds: [buildEmbed(session, `🏆 PERFECT GAME! All ${totalSafe} safe tiles found! **+${(payout - bet).toLocaleString()}** coins!`, message.guild?.name)],
            components: [...buildGrid(session), buildCashoutRow(session)],
          });
          collector.stop('perfect');
          return;
        }

        await i.update({
          embeds: [buildEmbed(session, '', message.guild?.name)],
          components: [...buildGrid(session), buildCashoutRow(session)],
        });
      }
    });

    collector.on('end', async (_, reason) => {
      SESSIONS.delete(userId);
      if (!session.ended && reason === 'time') {
        // Timeout — treat as loss
        session.ended = true;
        await msg.edit({
          embeds: [buildEmbed(session, `⏱️ Game timed out — bet of **${bet.toLocaleString()}** lost.`, message.guild?.name)],
          components: [...buildGrid(session), buildCashoutRow(session)],
        }).catch(() => {});
      }
    });
  },
};
