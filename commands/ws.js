const { EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../utils/permissions');

const GAME_CHANNEL_ID = '1401925188991582338';

let activeScramble = null;

function scrambleWord(word) {
  const arr = word.split('');
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr.join('');
}

module.exports = {
  name: 'wordscramble',
  aliases: ['ws'],
  description: 'Start a word scramble game in the game channel. Usage: .wordscramble start <word>',
  async execute({ message, args, updateUserBalance, client }) {
    const sub = (args[0] || '').toLowerCase();

    // START GAME
    if (sub === 'start') {
      if (!isAdmin(message)) {
        return message.channel.send('❌ Only authorized users can start a word scramble.');
      }

      if (activeScramble) {
        return message.channel.send('❌ A word scramble game is already active.');
      }

      const word = args.slice(1).join('').toLowerCase();
      if (!word || word.length < 3) {
        return message.channel.send(
          'Usage: `.wordscramble start <word>` (word must be at least 3 letters, no spaces)'
        );
      }

      if (!/^[a-z]+$/.test(word)) {
        return message.channel.send('❌ Word can only contain letters (no spaces or digits).');
      }

      await message.delete().catch(() => {});

      const scrambled = scrambleWord(word);
      activeScramble = {
        word,
        scrambled,
        setter: message.author.id,
      };

      const gameChannel = client.channels.cache.get(GAME_CHANNEL_ID);
      if (!gameChannel) {
        activeScramble = null;
        return message.channel.send('❌ Game channel not found. Check GAME_CHANNEL_ID.');
      }

      const infoBlock =
        '╭──────────────────────────────╮\n' +
        '│         Word Scramble        │\n' +
        '╰──────────────────────────────╯';

      const embed = new EmbedBuilder()
        .setTitle('˗ˏˋ 𐙚 🧩 Word Scramble 𐙚 ˎˊ˗')
        .setDescription(
          [
            infoBlock,
            '',
            'Unscramble the letters below.',
            '',
            `**${scrambled.toUpperCase()}**`,
            '',
            'Type your answer in chat. First correct answer wins.',
          ].join('\n')
        )
        .setColor('#F5E6FF')
        .setFooter({ text: 'No hints. Good luck.' })
        .setTimestamp();

      await gameChannel.send({ embeds: [embed] });

      const filter = m => !m.author.bot && m.content.toLowerCase() === word;
      const collector = gameChannel.createMessageCollector({ filter, time: 300000, max: 1 });

      collector.on('collect', async m => {
        const winnerId = m.author.id;
        const reward = 500;

        await updateUserBalance(winnerId, reward);

        const winBlock =
          '╭──────────────────────────────╮\n' +
          '│         Word Solved          │\n' +
          '╰──────────────────────────────╯';

        const winEmbed = new EmbedBuilder()
          .setTitle('˗ˏˋ 𐙚 🎉 Winner 𐙚 ˎˊ˗')
          .setDescription(
            [
              winBlock,
              '',
              `${m.author} solved the word **${word.toUpperCase()}**.`,
              `Reward: **${reward}** coins.`,
            ].join('\n')
          )
          .setColor('#C1FFD7')
          .setTimestamp();

        await gameChannel.send({ embeds: [winEmbed] });

        activeScramble = null;
      });

      collector.on('end', collected => {
        if (!collected.size && activeScramble) {
          const timeoutBlock =
            '╭──────────────────────────────╮\n' +
            '│           Time Up            │\n' +
            '╰──────────────────────────────╯';

          const loseEmbed = new EmbedBuilder()
            .setTitle('˗ˏˋ 𐙚 ⏱️ No Winner 𐙚 ˎˊ˗')
            .setDescription(
              [
                timeoutBlock,
                '',
                `No one solved the scramble. The word was **${word.toUpperCase()}**.`,
              ].join('\n')
            )
            .setColor('#FFB3C6')
            .setTimestamp();

          gameChannel.send({ embeds: [loseEmbed] });
          activeScramble = null;
        }
      });

      return;
    }

    // CANCEL GAME
    if (sub === 'cancel') {
      if (!isAdmin(message)) {
        return message.channel.send('❌ Only authorized users can cancel a scramble.');
      }
      if (!activeScramble) {
        return message.channel.send('❌ No active scramble to cancel.');
      }

      activeScramble = null;
      const gameChannel = client.channels.cache.get(GAME_CHANNEL_ID);
      if (gameChannel) {
        const cancelBlock =
          '╭──────────────────────────────╮\n' +
          '│        Scramble Cancelled    │\n' +
          '╰──────────────────────────────╯';

        const cancelEmbed = new EmbedBuilder()
          .setTitle('˗ˏˋ 𐙚 ❌ Game Cancelled 𐙚 ˎˊ˗')
          .setDescription(
            [
              cancelBlock,
              '',
              'The current word scramble has been cancelled.',
            ].join('\n')
          )
          .setColor('#FFB3C6')
          .setTimestamp();

        await gameChannel.send({ embeds: [cancelEmbed] });
      }
      return message.channel.send('✅ Scramble cancelled.');
    }

    // HELP / DEFAULT
    return message.channel.send(
      '**Word Scramble Commands:**\n' +
      '`.wordscramble start <word>` - Start a scramble (authorized role)\n' +
      '`.wordscramble cancel` - Cancel active scramble (authorized role)'
    );
  },
};
