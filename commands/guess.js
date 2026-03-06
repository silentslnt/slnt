const { EmbedBuilder } = require('discord.js');

const GUESS_ADMIN_ROLE_ID = '1382513369801555988';
const GUESS_CHANNEL_ID = '1454818862397653074';

const guessGameState = {
  active: false,
  number: null,
  channelId: null,
};

const guessGameRarities = [
  { name: 'Prismatic', chance: 0.005, minKan: 1000, maxKan: 2000 },
  { name: 'Mythical',  chance: 0.03,  minKan: 500,  maxKan: 999 },
  { name: 'Legendary', chance: 0.10,  minKan: 200,  maxKan: 499 },
  { name: 'Rare',      chance: 0.25,  minKan: 100,  maxKan: 199 },
  { name: 'Uncommon',  chance: 0.27,  minKan: 50,   maxKan: 99  },
  { name: 'Common',    chance: 0.33,  minKan: 10,   maxKan: 49  },
];

function getRandomRarity(rarities) {
  const roll = Math.random();
  let cumulative = 0;
  for (const rarity of rarities) {
    cumulative += rarity.chance;
    if (roll <= cumulative) return rarity;
  }
  return rarities[rarities.length - 1];
}

module.exports = {
  name: 'guess',
  description: 'Guess a number game with admin controls.',
  async execute({ message, args }) {
    const sub = (args[0] || '').toLowerCase();
    const isAdmin = message.member.roles.cache.has(GUESS_ADMIN_ROLE_ID);

    if (sub === 'start') {
      if (!isAdmin) {
        return message.channel.send('Only admins can start the guessing game.');
      }

      if (message.channel.id !== GUESS_CHANNEL_ID) {
        return message.channel.send('This game can only be started in the game channel.');
      }

      if (guessGameState.active) {
        return message.channel.send('A game is already running.');
      }

      const num = Math.floor(Math.random() * 500) + 1;
      guessGameState.active = true;
      guessGameState.number = num;
      guessGameState.channelId = message.channel.id;

      const startEmbed = new EmbedBuilder()
        .setColor('#F5E6FF')
        .setTitle('˗ˏˋ 𐙚 🔮 𝔊𝔲𝔢𝔰𝔰𝔦𝔫𝔤 𝔊𝔞𝔪𝔢 𝔖𝔱𝔞𝔯𝔱𝔢𝔡 𐙚 ˎˊ˗')
        .setDescription(
          [
            '꒰ঌ A number has been chosen between **1** and **500** ໒꒱',
            '',
            'Type your guesses in this channel and see who receives the prize.'
          ].join('\n')
        );

      return message.channel.send({ embeds: [startEmbed] });
    }

    if (sub === 'stop') {
      if (!isAdmin) {
        return message.channel.send('Only admins can stop the game.');
      }

      if (!guessGameState.active) {
        return message.channel.send('No game is running.');
      }

      guessGameState.active = false;
      guessGameState.number = null;
      guessGameState.channelId = null;

      const stopEmbed = new EmbedBuilder()
        .setColor('#F5E6FF')
        .setTitle('˗ˏˋ 𐙚 ⏹️ 𝔊𝔲𝔢𝔰𝔰𝔦𝔫𝔤 𝔊𝔞𝔪𝔢 𝔈𝔫𝔡𝔢𝔡 𐙚 ˎˊ˗')
        .setDescription('꒰ঌ The number has been sealed away for now ໒꒱');

      return message.channel.send({ embeds: [stopEmbed] });
    }

    return message.channel.send(
      'Use `.guess start` to begin the celestial guessing game or `.guess stop` to end it.'
    );
  },

  guessGameState,
  guessGameRarities,
  getRandomRarity,
};

