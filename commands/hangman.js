const { EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../utils/permissions');

// Track active hangman games - declared ONCE at the top
const activeGamesMap = new Map();

const hangmanStages = [
  '```\n\n\n\n\n\n=======```',
  '```\n |\n |\n |\n |\n |\n=======```',
  '```  ______\n |\n |\n |\n |\n |\n=======```',
  '```  ______\n |    |\n |    O\n |\n |\n |\n=======```',
  '```  ______\n |    |\n |    O\n |    |\n |\n |\n=======```',
  '```  ______\n |    |\n |    O\n |   /|\\\n |\n |\n=======```',
  '```  ______\n |    |\n |    O\n |   /|\\\n |   / \\\n |\n=======```',
];

const GAME_CHANNEL_ID = '1401925188991582338'; // Your game channel ID

function embed(title, desc, color = 0x000000) {
  return new EmbedBuilder().setColor(color).setTitle(title).setDescription(desc);
}

module.exports = {
  name: 'hangman',
  description: 'Play hangman! Admin sets word, try to guess it!',
  async execute({ message, args, userData, saveUserData, client }) {
    const sub = (args[0] || '').toLowerCase();

    // START GAME
    if (sub === 'start') {
      if (!isAdmin(message)) {
        return message.channel.send('Only admins can start a hangman game.');
      }

      if (activeGamesMap.has(GAME_CHANNEL_ID)) {
        return message.channel.send('A hangman game is already active in the game channel.');
      }

      const word = args.slice(1).join(' ').toLowerCase();
      if (!word || word.length < 3) {
        return message.channel.send('Usage: `.hangman start <word>` (word must be at least 3 letters)');
      }

      if (!/^[a-z\s]+$/.test(word)) {
        return message.channel.send('Word can only contain letters and spaces.');
      }

      // delete admin command message
      await message.delete().catch(() => {});

      const gameChannel = client.channels.cache.get(GAME_CHANNEL_ID);
      if (!gameChannel) {
        return message.channel.send('Game channel not found — check GAME_CHANNEL_ID.');
      }

      activeGamesMap.set(GAME_CHANNEL_ID, {
        word,
        guessed: new Set(),
        wrongGuesses: 0,
        maxWrongs: 6,
        adminId: message.author.id
      });

      const lettersCount = word.replace(/\s/g, '').length;

      await gameChannel.send({
        embeds: [embed(
          'HANGMAN STARTED',
          `${hangmanStages[0]}\n` +
          `> An admin has hidden a secret word.\n\n` +
          `${getWordDisplay(GAME_CHANNEL_ID)}\n\n` +
          `> This word has **${lettersCount}** letter(s) (spaces not counted).\n\n` +
          `-# Type \`.hangman guess <letter>\` in this channel to guess.`
        ).addFields({ name: 'Wrong Guesses', value: '0/6', inline: true })],
      });
      return;
    }

    // GUESS LETTER
    if (sub === 'guess') {
      if (message.channel.id !== GAME_CHANNEL_ID) {
        return message.channel.send(`Hangman guesses must be made in <#${GAME_CHANNEL_ID}>.`);
      }

      if (!activeGamesMap.has(GAME_CHANNEL_ID)) {
        return message.channel.send('No active hangman game.');
      }

      const game = activeGamesMap.get(GAME_CHANNEL_ID);
      const guess = args[1]?.toLowerCase();

      if (!guess || guess.length !== 1 || !/[a-z]/.test(guess)) {
        return message.channel.send('Please guess a single letter: `.hangman guess <letter>`');
      }

      if (game.guessed.has(guess)) {
        return message.channel.send(`Letter **${guess.toUpperCase()}** already guessed.`);
      }

      game.guessed.add(guess);

      if (game.word.includes(guess)) {
        const display = getWordDisplay(GAME_CHANNEL_ID);

        if (!display.includes('_')) {
          const reward = 1000;
          userData.balance = (userData.balance || 0) + reward;
          await saveUserData({ balance: userData.balance });

          const lettersCount = game.word.replace(/\s/g, '').length;

          message.channel.send({
            embeds: [embed(
              'WORD COMPLETED — YOU WIN',
              `> ${message.author} revealed the word.\n\n` +
              `> **${game.word.toUpperCase()}** (${lettersCount} letters)\n\n` +
              `> +**${reward.toLocaleString()}** coins\n` +
              `> New balance: **${userData.balance.toLocaleString()}** coins`
            )],
          });
          activeGamesMap.delete(GAME_CHANNEL_ID);
          return;
        }

        const lettersCount = game.word.replace(/\s/g, '').length;

        return message.channel.send({
          embeds: [embed(
            'CORRECT LETTER',
            `> **${guess.toUpperCase()}** is in the word.\n\n` +
            `${display}\n\n` +
            `> This word has **${lettersCount}** letter(s) (spaces not counted).`
          ).addFields(
            { name: 'Wrong Guesses', value: `${game.wrongGuesses}/${game.maxWrongs}`, inline: true },
            { name: 'Guessed Letters', value: Array.from(game.guessed).join(', ').toUpperCase() || 'None', inline: true },
          )],
        });
      } else {
        game.wrongGuesses++;

        if (game.wrongGuesses >= game.maxWrongs) {
          message.channel.send({
            embeds: [embed(
              'GAME OVER',
              `${hangmanStages[game.wrongGuesses]}\n> The word was: **${game.word.toUpperCase()}**`
            )],
          });
          activeGamesMap.delete(GAME_CHANNEL_ID);
          return;
        }

        const lettersCount = game.word.replace(/\s/g, '').length;

        return message.channel.send({
          embeds: [embed(
            'WRONG LETTER',
            `${hangmanStages[game.wrongGuesses]}\n` +
            `${getWordDisplay(GAME_CHANNEL_ID)}\n\n` +
            `> This word has **${lettersCount}** letter(s) (spaces not counted).`
          ).addFields(
            { name: 'Wrong Guesses', value: `${game.wrongGuesses}/${game.maxWrongs}`, inline: true },
            { name: 'Guessed Letters', value: Array.from(game.guessed).join(', ').toUpperCase() || 'None', inline: true },
          )],
        });
      }
    }

    // CANCEL GAME
    if (sub === 'cancel') {
      if (!isAdmin(message)) {
        return message.channel.send('Only admins can cancel.');
      }

      if (!activeGamesMap.has(GAME_CHANNEL_ID)) {
        return message.channel.send('No active game.');
      }

      activeGamesMap.delete(GAME_CHANNEL_ID);
      const gameChannel = client.channels.cache.get(GAME_CHANNEL_ID);
      if (gameChannel) gameChannel.send('Hangman game cancelled by an admin.');
      return message.channel.send('Game cancelled.');
    }

    // HELP
    return message.channel.send(
      '**Hangman Commands:**\n' +
      '`.hangman start <word>` - Start (admin)\n' +
      '`.hangman guess <letter>` - Guess\n' +
      '`.hangman cancel` - Cancel (admin)'
    );
  }
};

function getWordDisplay(channelId) {
  const game = activeGamesMap.get(channelId);
  if (!game) return '';

  return '**Word:** ' + game.word
    .split('')
    .map(char => {
      if (char === ' ') return '  ';
      return game.guessed.has(char) ? char.toUpperCase() : '_';
    })
    .join(' ');
}
