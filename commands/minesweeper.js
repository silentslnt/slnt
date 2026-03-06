const { EmbedBuilder } = require('discord.js');

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
  description: 'Play a personalized minesweeper! Usage: .minesweeper start <size> <mines> <bet>',
  async execute({ message, args, userData, saveUserData }) {
    const sub = (args[0] || '').toLowerCase();
    const userId = message.author.id;

    // START game (any user)
    if (sub === 'start') {
      if (userGames.has(userId)) {
        return message.channel.send('❌ You already have a minesweeper game in progress!');
      }
      const size = parseInt(args[1]);
      const mineCount = parseInt(args[2]);
      const bet = parseInt(args[3]);

      if (isNaN(size) || size < 5 || size > 20) return message.channel.send('Size must be 5–20.');
      if (isNaN(mineCount) || mineCount < 1 || mineCount >= size)
        return message.channel.send('Invalid mine count.');
      if (isNaN(bet) || bet <= 0) return message.channel.send('Valid bet required.');

      // userData is already loaded from MongoDB by index.js
      if (userData.balance < bet)
        return message.channel.send('You do not have enough balance for this bet.');

      // Deduct bet – one argument, wrapper adds userId
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
        .setTitle('˗ˏˋ 𐙚 ☢️ 𝔠𝔢𝔩𝔢𝔰𝔱𝔦𝔞𝔩 𝔪𝔦𝔫𝔢𝔰𝔴𝔢𝔢𝔭𝔢𝔯 𐙚 ˎˊ˗')
        .setDescription(
          [
            `Grid: **${size}** tiles with **${mineCount}** hidden mines.`,
            '',
            '꒰ঌ Type `.minesweeper pick <tile number>` to begin uncovering the field ໒꒱',
          ].join('\n')
        )
        .addFields({
          name: 'Grid',
          value: gridDisplay(Array(size).fill('safe'), new Set()),
          inline: false,
        })
        .setColor('#F5E6FF')
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });
      return;
    }

    // Picking a tile (only by game owner)
    if (sub === 'pick') {
      const game = userGames.get(userId);
      if (!game || !game.started) {
        return message.channel.send(
          '❌ You do not have a minesweeper game running! Start with `.minesweeper start`.'
        );
      }
      const pickNum = parseInt(args[1]);
      if (isNaN(pickNum) || pickNum < 1 || pickNum > game.size) {
        return message.channel.send(`Pick a tile between 1 and ${game.size}.`);
      }
      if (game.picks.has(pickNum - 1)) {
        return message.channel.send('❌ This tile was already picked!');
      }
      game.picks.add(pickNum - 1);

      if (game.grid[pickNum - 1] === 'mine') {
        // Lost
        const embed = new EmbedBuilder()
          .setTitle('˗ˏˋ 𐙚 💥 𝔪𝔦𝔫𝔢 𝔥𝔦𝔱! 𝔤𝔞𝔪𝔢 𝔬𝔳𝔢𝔯 𐙚 ˎˊ˗')
          .setDescription(
            [
              gridDisplay(game.grid, game.picks),
              '',
              `You stepped on a mine at tile **${pickNum}** and lost your bet.`,
            ].join('\n')
          )
          .setColor('#FFB3C6')
          .setTimestamp();
        message.channel.send({ embeds: [embed] });
        userGames.delete(userId);
        return;
      }

      // Win: all safe tiles found
      const safeTiles = game.grid.filter(x => x === 'safe').length;
      if (game.picks.size >= safeTiles) {
        const payout = game.bet * 5;
        userData.balance += payout;

        // Persist to MongoDB – one argument, wrapper adds userId
        await saveUserData({ balance: userData.balance });

        const embed = new EmbedBuilder()
          .setTitle('˗ˏˋ 𐙚 🎉 𝔪𝔦𝔫𝔢𝔰 𝔠𝔩𝔢𝔞𝔯𝔢𝔡! 𐙚 ˎˊ˗')
          .setDescription(
            [
              gridDisplay(game.grid, game.picks),
              '',
              `You cleared all safe tiles and earn **${payout}** coins!`,
            ].join('\n')
          )
          .setColor('#C1FFD7')
          .setTimestamp();
        message.channel.send({ embeds: [embed] });
        userGames.delete(userId);
        return;
      }

      // Show progress
      const embed = new EmbedBuilder()
        .setTitle('˗ˏˋ 𐙚 ☢️ 𝔪𝔦𝔫𝔢𝔰𝔴𝔢𝔢𝔭𝔢𝔯 𝔭𝔯𝔬𝔤𝔯𝔢𝔰𝔰 𐙚 ˎˊ˗')
        .setDescription(
          [
            gridDisplay(game.grid, game.picks),
            '',
            'Pick another tile with `.minesweeper pick <tile number>`.',
          ].join('\n')
        )
        .setColor('#F5E6FF')
        .setTimestamp();
      message.channel.send({ embeds: [embed] });
      return;
    }

    // CANCEL game
    if (sub === 'cancel') {
      if (!userGames.has(userId)) {
        return message.channel.send('❌ You have no game to cancel.');
      }
      userGames.delete(userId);
      return message.channel.send('✅ Your minesweeper game was cancelled.');
    }

    // HELP
    return message.channel.send(
      '**Minesweeper Commands:**\n' +
        '`.minesweeper start <size> <mines> <bet>` - Start your own game\n' +
        '`.minesweeper pick <tile number>` - Play your game\n' +
        '`.minesweeper cancel` - Cancel your game'
    );
  },
};
