const { EmbedBuilder } = require('discord.js');

// Track active hangman games - declared ONCE at the top
const activeGamesMap = new Map();

const hangmanStages = [
  '``````',
  '``````',
  '``````',
  '``````',
  '``````',
  '``````',
  '``````'
];

const ADMIN_ROLE_ID = '1454818862397653074'; // Your admin role ID
const GAME_CHANNEL_ID = '1401925188991582338'; // Your game channel ID

module.exports = {
  name: 'hangman',
  description: 'Play hangman! Admin sets word, try to guess it!',
  async execute({ message, args, userData, saveUserData, client }) {
    const sub = (args[0] || '').toLowerCase();

    // START GAME
    if (sub === 'start') {
      if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) {
        return message.channel.send('❌ Only admins can start a hangman game.');
      }

      if (activeGamesMap.has(GAME_CHANNEL_ID)) {
        return message.channel.send('❌ A hangman game is already active in the game channel!');
      }

      const word = args.slice(1).join(' ').toLowerCase();
      if (!word || word.length < 3) {
        return message.channel.send('Usage: `.hangman start <word>` (word must be at least 3 letters)');
      }

      if (!/^[a-z\s]+$/.test(word)) {
        return message.channel.send('❌ Word can only contain letters and spaces.');
      }

      // delete admin command message
      await message.delete().catch(() => {});

      const gameChannel = client.channels.cache.get(GAME_CHANNEL_ID);
      if (!gameChannel) {
        return message.channel.send('❌ Game channel not found! Please check GAME_CHANNEL_ID.');
      }

      activeGamesMap.set(GAME_CHANNEL_ID, {
        word,
        guessed: new Set(),
        wrongGuesses: 0,
        maxWrongs: 6,
        adminId: message.author.id
      });

      const lettersCount = word.replace(/\s/g, '').length;

      const topBlock =
        '╭──────────────────────────────╮\n' +
        '│  🎮 New celestial hangman game has begun! │\n' +
        '╰──────────────────────────────╯';

      const startEmbed = new EmbedBuilder()
        .setTitle('˗ˏˋ 𐙚 🎮 𝔠𝔢𝔩𝔢𝔰𝔱𝔦𝔞𝔩 𝔥𝔞𝔫𝔤𝔪𝔞𝔫 𝔰𝔱𝔞𝔯𝔱𝔢𝔡 𐙚 ˎˊ˗')
        .setDescription(
          [
            topBlock,
            '',
            '꒰ঌ An admin has summoned a secret word from the heavens ໒꒱',
            '',
            `${getWordDisplay(GAME_CHANNEL_ID)}`,
            '',
            `This word has **${lettersCount}** letter(s) (spaces not counted).`,
            '',
            'Type `.hangman guess <letter>` in this channel to start guessing!'
          ].join('\n')
        )
        .addFields({ name: 'Wrong Guesses', value: '0/6', inline: true })
        .setColor('#F5E6FF')
        .setTimestamp();

      await gameChannel.send({ embeds: [startEmbed] });
      return;
    }

    // GUESS LETTER
    if (sub === 'guess') {
      if (message.channel.id !== GAME_CHANNEL_ID) {
        return message.channel.send(`❌ Hangman guesses must be made in <#${GAME_CHANNEL_ID}>!`);
      }

      if (!activeGamesMap.has(GAME_CHANNEL_ID)) {
        return message.channel.send('❌ No active hangman game.');
      }

      const game = activeGamesMap.get(GAME_CHANNEL_ID);
      const guess = args[1]?.toLowerCase();

      if (!guess || guess.length !== 1 || !/[a-z]/.test(guess)) {
        return message.channel.send('Please guess a single letter: `.hangman guess <letter>`');
      }

      if (game.guessed.has(guess)) {
        return message.channel.send(`❌ Letter **${guess.toUpperCase()}** already guessed!`);
      }

      game.guessed.add(guess);

      if (game.word.includes(guess)) {
        const display = getWordDisplay(GAME_CHANNEL_ID);

        if (!display.includes('_')) {
          const reward = 1000; // reward
          userData.balance = (userData.balance || 0) + reward;
          await saveUserData({ balance: userData.balance });

          const lettersCount = game.word.replace(/\s/g, '').length;

          const winBlock =
            '╭──────────────────────────────╮\n' +
            '│  🎉 WORD COMPLETED – YOU WIN │\n' +
            '╰──────────────────────────────╯';

          const winEmbed = new EmbedBuilder()
            .setTitle('˗ˏˋ 𐙚 🎉 𝔤𝔞𝔪𝔢 𝔠𝔬𝔪𝔭𝔩𝔢𝔱𝔢! 𐙚 ˎˊ˗')
            .setDescription(
              [
                winBlock,
                '',
                `${message.author} has unveiled the heavenly word!`,
                '',
                `**Word:** ${game.word.toUpperCase()} ( **${lettersCount}** letters )`,
                '',
                `꒰ঌ ${message.author} earned **${reward}** kan for their wisdom ໒꒱`,
                '',
                `💰 **New Balance:** ${userData.balance} kan`
              ].join('\n')
            )
            .setColor('#C1FFD7')
            .setTimestamp();

          message.channel.send({ embeds: [winEmbed] });
          activeGamesMap.delete(GAME_CHANNEL_ID);
          return;
        }

        const lettersCount = game.word.replace(/\s/g, '').length;

        const correctBlock =
          '╭──────────────────────────────╮\n' +
          `│  ✅ Letter **${guess.toUpperCase()}** is correct │\n` +
          '╰──────────────────────────────╯';

        const correctEmbed = new EmbedBuilder()
          .setTitle('˗ˏˋ 𐙚 ✅ 𝔠𝔬𝔯𝔯𝔢𝔠𝔱 𝔩𝔢𝔱𝔱𝔢𝔯 𐙚 ˎˊ˗')
          .setDescription(
            [
              correctBlock,
              '',
              `${display}`,
              '',
              `This word has **${lettersCount}** letter(s) (spaces not counted).`
            ].join('\n')
          )
          .addFields(
            { name: 'Wrong Guesses', value: `${game.wrongGuesses}/${game.maxWrongs}`, inline: true },
            {
              name: 'Guessed Letters',
              value: Array.from(game.guessed).join(', ').toUpperCase() || 'None',
              inline: true
            }
          )
          .setColor('#C1FFD7')
          .setTimestamp();

        return message.channel.send({ embeds: [correctEmbed] });
      } else {
        game.wrongGuesses++;

        if (game.wrongGuesses >= game.maxWrongs) {
          const loseBlock =
            '╭──────────────────────────────╮\n' +
            '│  💀 MAX STRIKES – GAME OVER │\n' +
            '╰──────────────────────────────╯';

          const loseEmbed = new EmbedBuilder()
            .setTitle('˗ˏˋ 𐙚 💀 𝔤𝔞𝔪𝔢 𝔬𝔳𝔢𝔯 𐙚 ˎˊ˗')
            .setDescription(
              [
                loseBlock,
                '',
                `${hangmanStages[game.wrongGuesses]}`,
                '',
                `**The word was:** ${game.word.toUpperCase()}`
              ].join('\n')
            )
            .setColor('#FFB3C6')
            .setTimestamp();

          message.channel.send({ embeds: [loseEmbed] });
          activeGamesMap.delete(GAME_CHANNEL_ID);
          return;
        }

        const lettersCount = game.word.replace(/\s/g, '').length;

        const wrongBlock =
          '╭──────────────────────────────╮\n' +
          `│  ❌ Letter **${guess.toUpperCase()}** is wrong │\n` +
          '╰──────────────────────────────╯';

        const wrongEmbed = new EmbedBuilder()
          .setTitle('˗ˏˋ 𐙚 ❌ 𝔴𝔯𝔬𝔫𝔤 𝔩𝔢𝔱𝔱𝔢𝔯 𐙚 ˎˊ˗')
          .setDescription(
            [
              wrongBlock,
              '',
              `${hangmanStages[game.wrongGuesses]}`,
              '',
              `${getWordDisplay(GAME_CHANNEL_ID)}`,
              '',
              `This word has **${lettersCount}** letter(s) (spaces not counted).`
            ].join('\n')
          )
          .addFields(
            { name: 'Wrong Guesses', value: `${game.wrongGuesses}/${game.maxWrongs}`, inline: true },
            {
              name: 'Guessed Letters',
              value: Array.from(game.guessed).join(', ').toUpperCase() || 'None',
              inline: true
            }
          )
          .setColor('#FFB3C6')
          .setTimestamp();

        return message.channel.send({ embeds: [wrongEmbed] });
      }
    }

    // CANCEL GAME
    if (sub === 'cancel') {
      if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) {
        return message.channel.send('❌ Only admins can cancel.');
      }

      if (!activeGamesMap.has(GAME_CHANNEL_ID)) {
        return message.channel.send('❌ No active game.');
      }

      activeGamesMap.delete(GAME_CHANNEL_ID);
      const gameChannel = client.channels.cache.get(GAME_CHANNEL_ID);
      if (gameChannel) gameChannel.send('✅ Hangman game cancelled by an admin.');
      return message.channel.send('✅ Game cancelled.');
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
