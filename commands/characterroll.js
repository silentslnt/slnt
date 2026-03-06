const { EmbedBuilder } = require('discord.js');

// Character rarity rates
const rarityRates = [
  { name: 'S+', chance: 0.005, color: '#FF0000' }, // 0.5%
  { name: 'S', chance: 0.015, color: '#FF6B6B' },  // 1.5%
  { name: 'A', chance: 0.08, color: '#FFA500' },   // 8%
  { name: 'B', chance: 0.20, color: '#4169E1' },   // 20%
  { name: 'C', chance: 0.35, color: '#32CD32' },   // 35%
  { name: 'D', chance: 0.35, color: '#808080' },   // 35%
];

// Duplicate refund amounts by tier (percentage of roll cost)
const duplicateRefunds = {
  'S+': 1500,  // 75% refund
  'S': 1200,   // 60% refund
  'A': 1000,   // 50% refund
  'B': 800,    // 40% refund
  'C': 600,    // 30% refund
  'D': 400,    // 20% refund
};

// All characters with their moves and tier
const characters = {
  // ONE PIECE
  'Luffy': {
    series: 'One Piece',
    tier: 'S+',
    moves: [
      { name: 'Gum-Gum Pistol', damage: 'B' },
      { name: 'Jet Gatling', damage: 'A' },
      { name: 'King Kong Gun', damage: 'S' },
      { name: 'Gear 5: Bajrang Gun', damage: 'S+' }
    ]
  },
  'Zoro': {
    series: 'One Piece',
    tier: 'A',
    moves: [
      { name: 'Onigiri', damage: 'B' },
      { name: 'Asura Ichibugin', damage: 'A' },
      { name: 'Purgatory Onigiri', damage: 'A+' },
      { name: '3000 Worlds', damage: 'A-S' }
    ]
  },
  'Shanks': {
    series: 'One Piece',
    tier: 'S',
    moves: [
      { name: 'Conqueror\'s Haki Burst', damage: 'S' },
      { name: 'Divine Departure', damage: 'S' },
      { name: 'Adv. Conqueror\'s Infusion Slash', damage: 'S' },
      { name: 'Armament Haki Sword Strike', damage: 'A' }
    ]
  },
  'Whitebeard': {
    series: 'One Piece',
    tier: 'S+',
    moves: [
      { name: 'Quake Punch', damage: 'S+' },
      { name: 'Sea Quake', damage: 'S+' },
      { name: 'Air Crack Shockwave', damage: 'S' },
      { name: 'Earth Shatter Palm', damage: 'S' }
    ]
  },
  'Ace': {
    series: 'One Piece',
    tier: 'A',
    moves: [
      { name: 'Fire Fist', damage: 'A' },
      { name: 'Firefly', damage: 'B' },
      { name: 'Flame Emperor', damage: 'A-S' },
      { name: 'Fire Pillar', damage: 'A' }
    ]
  },

  // NARUTO
  'Itachi': {
    series: 'Naruto',
    tier: 'S',
    moves: [
      { name: 'Amaterasu', damage: 'S' },
      { name: 'Tsukuyomi', damage: 'S' },
      { name: 'Susanoo (Totsuka Blade)', damage: 'S' },
      { name: 'Fireball Jutsu', damage: 'C-B' }
    ]
  },
  'Sasuke': {
    series: 'Naruto',
    tier: 'S+',
    moves: [
      { name: 'Chidori', damage: 'B-A' },
      { name: 'Amaterasu Control', damage: 'S' },
      { name: 'Kirin', damage: 'S+' },
      { name: 'Susanoo Arrow', damage: 'A-S' }
    ]
  },
  'Naruto': {
    series: 'Naruto',
    tier: 'S+',
    moves: [
      { name: 'Rasengan', damage: 'B' },
      { name: 'Rasenshuriken', damage: 'S' },
      { name: 'Shadow Clones', damage: 'C' },
      { name: 'Kurama Chakra Attacks', damage: 'S+' }
    ]
  },

  // DRAGON BALL
  'Goku': {
    series: 'Dragon Ball',
    tier: 'S+',
    moves: [
      { name: 'Kamehameha', damage: 'A-S' },
      { name: 'Spirit Bomb', damage: 'S+' },
      { name: 'Instant Transmission Strike', damage: 'A' },
      { name: 'Ultra Instinct Strikes', damage: 'S+' }
    ]
  },
  'Vegeta': {
    series: 'Dragon Ball',
    tier: 'S+',
    moves: [
      { name: 'Final Flash', damage: 'S' },
      { name: 'Big Bang Attack', damage: 'A-S' },
      { name: 'Galick Gun', damage: 'A' },
      { name: 'Final Explosion', damage: 'S+' }
    ]
  },

  // ATTACK ON TITAN
  'Eren': {
    series: 'Attack on Titan',
    tier: 'A',
    moves: [
      { name: 'Titan Transformation Explosion', damage: 'B' },
      { name: 'Attack Titan Punches', damage: 'A' },
      { name: 'Founding Titan Control', damage: 'Varies' },
      { name: 'War Hammer Weapons', damage: 'A' }
    ]
  },
  'Levi': {
    series: 'Attack on Titan',
    tier: 'A',
    moves: [
      { name: '360° Spin Slash', damage: 'B' },
      { name: 'Ackerman Speed Burst', damage: 'B' },
      { name: 'Reverse Grip Slash', damage: 'B' },
      { name: 'Neck Precision Strike', damage: 'A' }
    ]
  },
  'Reiner': {
    series: 'Attack on Titan',
    tier: 'B',
    moves: [
      { name: 'Armored Titan Charge', damage: 'A' },
      { name: 'Hardened Defense', damage: 'B' },
      { name: 'Shoulder Tackle', damage: 'A' },
      { name: 'Titan Punch', damage: 'A' }
    ]
  },

  // MY HERO ACADEMIA
  'Shoto Todoroki': {
    series: 'My Hero Academia',
    tier: 'B',
    moves: [
      { name: 'Ice Wall', damage: 'B' },
      { name: 'Flashfreeze Heatwave', damage: 'A' },
      { name: 'Fire Blast', damage: 'B' },
      { name: 'Ice Slide Rush', damage: 'B' }
    ]
  },
  'Izuku Midoriya': {
    series: 'My Hero Academia',
    tier: 'A',
    moves: [
      { name: 'Detroit Smash', damage: 'A-S' },
      { name: 'Blackwhip', damage: 'B' },
      { name: 'Float', damage: 'Utility' },
      { name: 'Fa Jin Burst', damage: 'A' }
    ]
  },
  'Bakugo': {
    series: 'My Hero Academia',
    tier: 'B',
    moves: [
      { name: 'AP Shot', damage: 'A' },
      { name: 'Howitzer Impact', damage: 'A-S' },
      { name: 'Stun Grenade', damage: 'C' },
      { name: 'Blast Rush', damage: 'B' }
    ]
  },
  'Hanta Sero': {
    series: 'My Hero Academia',
    tier: 'C',
    moves: [
      { name: 'Cellophane Prison', damage: 'B' },
      { name: 'Tape Shield', damage: 'C' },
      { name: 'Tape Swing', damage: 'C' },
      { name: 'Tape Generation', damage: 'D' }
    ]
  },

  // SOUL EATER
  'Tsubaki Nakatsukasa': {
    series: 'Soul Eater',
    tier: 'C',
    moves: [
      { name: 'Uncanny Sword', damage: 'A' },
      { name: 'Chain Scythe Form', damage: 'B' },
      { name: 'Ninja Sword Form', damage: 'C' },
      { name: 'Smoke Bomb Form', damage: 'D' }
    ]
  },

  // BUNGO STRAY DOGS
  'Michizo Tachihara': {
    series: 'Bungo Stray Dogs',
    tier: 'C',
    moves: [
      { name: 'Weapon Creation', damage: 'B' },
      { name: 'Metal Manipulation', damage: 'B' },
      { name: 'Metal Shield', damage: 'C' },
      { name: 'Metallic Detection', damage: 'D' }
    ]
  },

  // THE WALLFLOWER
  'Sunako Nakahara': {
    series: 'The Wallflower',
    tier: 'D',
    moves: [
      { name: 'Supernatural Combat', damage: 'B' },
      { name: 'Improvised Weaponry', damage: 'C' },
      { name: 'Anatomy Knowledge', damage: 'C' },
      { name: 'Instant Sports Mastery', damage: 'D' }
    ]
  },

  // MAGI: LABYRINTH OF MAGIC
  'Morgiana': {
    series: 'Magi: Labyrinth of Magic',
    tier: 'D',
    moves: [
      { name: 'Household Vessel Chains', damage: 'A' },
      { name: 'Powerful Kicks', damage: 'B' },
      { name: 'Fanalis Strength', damage: 'B' },
      { name: 'Speed Enhancement', damage: 'C' }
    ]
  },
};

function rollRarity() {
  const roll = Math.random();
  let cumulative = 0;
  for (const rarity of rarityRates) {
    cumulative += rarity.chance;
    if (roll <= cumulative) return rarity.name;
  }
  return 'D';
}

function getCharactersByTier(tier) {
  return Object.keys(characters).filter(name => characters[name].tier === tier);
}

module.exports = {
  name: 'roll',
  description: 'Roll for anime characters from crates',
  async execute({ message, args, userData, saveUserData }) {
    const cost = 2000;

    if (userData.balance < cost) {
      return message.channel.send(
        `❌ You need **${cost}** coins to roll! Your balance: **${userData.balance}**`
      );
    }

    userData.balance -= cost;
    userData.characters = userData.characters || [];

    // Animation embed
    const animationEmbed = new EmbedBuilder()
      .setTitle('˗ˏˋ 𐙚 ✨ 𝔯𝔬𝔩𝔩𝔦𝔫𝔤... ✨ 𐙚 ˎˊ˗')
      .setDescription(
        '⠀\n꒰ঌ spinning the celestial wheel ໒꒱\n⠀'
      )
      .setColor('#F5E6FF')
      .setTimestamp();

    const animMsg = await message.channel.send({ embeds: [animationEmbed] });

    // Simulate rolling animation with delays
    const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
    for (let i = 0; i < 15; i++) {
      const frame = frames[i % frames.length];
      await animMsg.edit({
        embeds: [
          new EmbedBuilder()
            .setTitle('˗ˏˋ 𐙚 ✨ 𝔯𝔬𝔩𝔩𝔦𝔫𝔤... ✨ 𐙚 ˎˊ˗')
            .setDescription(
              `${frame} ${frame} ${frame}\n` +
              '꒰ঌ spinning the celestial wheel ໒꒱\n' +
              `${frame} ${frame} ${frame}`
            )
            .setColor('#F5E6FF')
            .setTimestamp()
        ]
      });
      await new Promise(resolve => setTimeout(resolve, 300));
    }

    // Roll the actual result
    const tier = rollRarity();
    const availableChars = getCharactersByTier(tier);

    if (availableChars.length === 0) {
      return message.channel.send('⚠️ No characters available in this tier.');
    }

    const charName = availableChars[Math.floor(Math.random() * availableChars.length)];
    const char = characters[charName];

    const isDuplicate = userData.characters.some(c => c.name === charName);
    let refundAmount = 0;
    let statusText = '';

    if (isDuplicate) {
      refundAmount = duplicateRefunds[tier] || 400;
      userData.balance += refundAmount;
      statusText = `\n💰 **Duplicate!** Refunded **${refundAmount}** coins.`;
    } else {
      statusText = '\n✨ **New character unlocked!**';
    }

    userData.characters.push({
      name: charName,
      series: char.series,
      tier: char.tier,
      moves: char.moves,
      claimedAt: new Date()
    });

    await saveUserData({
      balance: userData.balance,
      characters: userData.characters
    });

    const movesText = char.moves.map(m => `• **${m.name}** (${m.damage})`).join('\n');

    const tierColor = rarityRates.find(r => r.name === tier)?.color || '#808080';

    const resultEmbed = new EmbedBuilder()
      .setTitle(`${isDuplicate ? '🔄' : '🎉'} ${isDuplicate ? 'You got a duplicate!' : 'You rolled: ' + charName + '!'}`)
      .setDescription(
        [
          `✧˚₊‧════════════════════╮ 𐙚 ╭════════════════════‧₊˚✧`,
          '',
          `📺 **Series:** ${char.series}`,
          `✨ **Tier:** ${char.tier}`,
          statusText,
          '',
          `**𝔞𝔯𝔠𝔞𝔫𝔞𝔦𝔯𝔞𝔦𝔱𝔬𝔰:**`,
          movesText,
          '',
          `💰 **New Balance:** ${userData.balance} coins`,
          '',
          '✧˚₊‧════════════════════╮ 𐙚 ╭════════════════════‧₊˚✧'
        ].join('\n')
      )
      .setColor(tierColor)
      .setTimestamp()
      .setFooter({ text: 'System • Gacha Pull' });

    await animMsg.edit({ embeds: [resultEmbed] });
  }
};
