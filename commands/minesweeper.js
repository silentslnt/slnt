const { EmbedBuilder } = require('discord.js');
const { MAX_BET } = require('../utils/config');
const { requireAdmin } = require('../utils/permissions');
const { announceWin } = require('../utils/winAnnouncer');

const BLACK = 0x000000;

// Each user can have one game active; key: userId, value: gameState
const userGames = new Map();

function generateGrid(size, mineCount) {
  let grid = Array(size).fill('safe');
  for (let i = 0; i < mineCount; i++) grid[i] = 'mine';
  for (let i = grid.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [grid[i], grid[j]] = [grid[j], grid[i]];
  }
  return grid;
}

function gridDisplay(grid, picks) {
  return grid
    .map((tile, idx) => {
      if (picks.has(idx)) {
        return tile === 'mine' ? '💥' : '✅';
      } else {
        return `\`${idx + 1}\``;
      }
    })
    .join(' ');
}

module.exports = {
  name: 'minesweeper',
  adminOnly: true,
  description: 'Play a personalized minesweeper! Usage: .minesweeper start <size> <mines> <bet>',
  async execute({ message, args, userData, saveUserData, client, logAdminAction }) {
    if (!await requireAdmin(message)) return;

    const sub = (args[0] || '').toLowerCase();
    const userId = message.author.id;

    // START game
    if (sub === 'start') {
      if (userGames.has(userId)) {
        return message.channel.send('You already have a minesweeper game in progress!');
      }
      const size = parseInt(args[1]);
      const mineCount = parseInt(args[2]);
      const bet = parseInt(args[3]);

      if (isNaN(size) || size < 5 || size > 20) return message.channel.send('Size must be 5–20.');
      if (isNaN(mineCount) || mineCount < 1 || mineCount >= size)
        return message.channel.send('Invalid mine count.');
      if (isNaN(bet) || bet <= 0) return message.channel.send('Valid bet required.');
      if (bet > MAX_BET) return message.channel.send(`Max bet is **${MAX_BET.toLocaleString()}** coins.`);

      if (userData.balance < bet)
        return message.channel.send('You do not have enough balance for this bet.');

      userData.balance -= bet;
      await saveUserData({ balance: userData.balance });

      userGames.set(userId, {
        grid: generateGrid(size, mineCount),
        picks: new Set(),
        started: true,
        bet,
        mineCount,
        size,
        player: userId,
      });

      const embed = new EmbedBuilder()
        .setTitle('MINESWEEPER')
        .setDescription(
          `> Grid: **${size}** tiles with **${mineCount}** hidden mines.\n\n` +
          `-# Type \`.minesweeper pick <tile number>\` to begin uncovering the field.`
        )
        .addFields({
          name: 'Grid',
          value: gridDisplay(Array(size).fill('safe'), new Set()),
          inline: false,
        })
        .setColor(BLACK)
        .setFooter({ text: message.guild?.name || 'Shiro' });

      await message.channel.send({ embeds: [embed] });
      return;
    }

    // Picking a tile
    if (sub === 'pick') {
      const game = userGames.get(userId);
      if (!game || !game.started) {
        return message.channel.send(
          'You do not have a minesweeper game running! Start with `.minesweeper start`.'
        );
      }
      const pickNum = parseInt(args[1]);
      if (isNaN(pickNum) || pickNum < 1 || pickNum > game.size) {
        return message.channel.send(`Pick a tile between 1 and ${game.size}.`);
      }
      if (game.picks.has(pickNum - 1)) {
        return message.channel.send('This tile was already picked!');
      }
      game.picks.add(pickNum - 1);

      if (game.grid[pickNum - 1] === 'mine') {
        // Lost
        const embed = new EmbedBuilder()
          .setTitle('MINE HIT — GAME OVER')
          .setDescription(
            `${gridDisplay(game.grid, game.picks)}\n\n` +
            `> You stepped on a mine at tile **${pickNum}** and lost your bet.`
          )
          .setColor(BLACK)
          .setFooter({ text: message.guild?.name || 'Shiro' });
        message.channel.send({ embeds: [embed] });
        userGames.delete(userId);
        return;
      }

      // Win: all safe tiles found
      const safeTiles = game.grid.filter(x => x === 'safe').length;
      if (game.picks.size >= safeTiles) {
        const payout = game.bet * 5;
        userData.balance += payout;
        userData.totalEarned = (userData.totalEarned || 0) + (payout - game.bet);
        await saveUserData({ balance: userData.balance, totalEarned: userData.totalEarned });

        const embed = new EmbedBuilder()
          .setTitle('MINES CLEARED')
          .setDescription(
            `${gridDisplay(game.grid, game.picks)}\n\n` +
            `> You cleared all safe tiles and earned **${payout.toLocaleString()}** coins!`
          )
          .setColor(BLACK)
          .setFooter({ text: message.guild?.name || 'Shiro' });
        message.channel.send({ embeds: [embed] });
        userGames.delete(userId);

        if (client) {
          announceWin(client, {
            userId, username: message.author.username,
            avatarURL: message.author.displayAvatarURL({ dynamic: true }),
            game: 'minesweeper', bet: game.bet, payout, multiplier: 5,
            detail: `all ${safeTiles} safe tiles cleared`,
            logAdminAction,
          }).catch(() => {});
        }
        return;
      }

      // Show progress
      const embed = new EmbedBuilder()
        .setTitle('MINESWEEPER PROGRESS')
        .setDescription(
          `${gridDisplay(game.grid, game.picks)}\n\n` +
          `-# Pick another tile with \`.minesweeper pick <tile number>\`.`
        )
        .setColor(BLACK)
        .setFooter({ text: message.guild?.name || 'Shiro' });
      message.channel.send({ embeds: [embed] });
      return;
    }

    // CANCEL game — refund the bet, it was never at risk if no tile was picked yet
    if (sub === 'cancel') {
      const game = userGames.get(userId);
      if (!game) {
        return message.channel.send('You have no game to cancel.');
      }
      userData.balance += game.bet;
      await saveUserData({ balance: userData.balance });
      userGames.delete(userId);
      return message.channel.send(`Your minesweeper game was cancelled — **${game.bet.toLocaleString()}** coins refunded.`);
    }

    // HELP
    return message.channel.send(
      '**Minesweeper Commands:**\n' +
        '`.minesweeper start <size> <mines> <bet>` - Start your own game\n' +
        '`.minesweeper pick <tile number>` - Play your game\n' +
        '`.minesweeper cancel` - Cancel your game (refunds bet)'
    );
  },
};
