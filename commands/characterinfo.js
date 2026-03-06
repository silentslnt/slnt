const { EmbedBuilder } = require('discord.js');

// Character image URLs - using direct links
const characterImages = {
  // ONE PIECE
  'Luffy': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449307156473184447/latest.png?ex=693e6bf8&is=693d1a78&hm=5858b571e62fc01b99e8dc7104467bface6820a9bfacfa0b50ef99f1d4fe59da&',
  'Zoro': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449307404595630143/latest.png?ex=693e6c34&is=693d1ab4&hm=658dabbeea021de7a5ff6fcf6a8ebe7a8424151dd25ee2015183c38566091fec&',
  'Shanks': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449307603028017232/latest.png?ex=693e6c63&is=693d1ae3&hm=cea9f7a7133601b93a3233c0a9155a2218453430d8b48241924102593100f265&',
  'Whitebeard': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449307809559744586/latest.png?ex=693e6c94&is=693d1b14&hm=c06b9c66272041d0151dbf856eed21e1d5fb046636d7a3b658423d0dce0659dd&',
  'Ace': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449308054465019945/latest.png?ex=693e6ccf&is=693d1b4f&hm=3cf7073d743397afd3cba8045d340e64dca91cf43a87b29d5afb7667bea87b74&',

  // NARUTO
  'Itachi': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449308389556621363/latest.png?ex=693e6d1e&is=693d1b9e&hm=4291de6bc107c1ac3a0da5d246d3cf1bd0ae4a177902e3378a8a7c733da82519&',
  'Sasuke': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449309554528751687/images.png?ex=693e6e34&is=693d1cb4&hm=73075ea6724c385976a4fdb6b07cad5ca5a254703b0b4106ff6b6d41aebecf39&',
  'Naruto': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449309964496666708/latest.png?ex=693e6e96&is=693d1d16&hm=13ac925fa87dac5616305e9a62aa64e40c7a133a9f54bcdb1ec220cf4c4ca174&',

  // DRAGON BALL
  'Goku': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449310482845536276/2Q.png?ex=693e6f11&is=693d1d91&hm=9cd54122ef1874176470813dc4169db11616754355adb69f702f994bde3ca099&',
  'Vegeta': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449310651548958801/images.png?ex=693e6f3a&is=693d1dba&hm=192ecdc3223073ef04de9792f0ff0198091ae6fa192056d7295652564a732335&',

  // ATTACK ON TITAN
  'Eren': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449312098533380178/A1ddAIYVhZL.png?ex=693e7093&is=693d1f13&hm=4712386f847b997879a76952a8e4feec8a7a1c8cf26bd2845bfe0d22ea83b79d&',
  'Levi': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449311573389611073/latest.png?ex=693e7016&is=693d1e96&hm=94047b96773df956e0939f3558dc6105732959b5823253c7ab9e874a21783ee0&',
  'Reiner': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449311177115963473/d766a5134898651.png?ex=693e6fb7&is=693d1e37&hm=5270d0a9752cbcd0392b335f86ad98bd0d62f6fc0d46bf4ee45461a471b4b171&',

  // MY HERO ACADEMIA
  'Shoto Todoroki': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449305840791326775/latest.png?ex=693e6abf&is=693d193f&hm=ba24686d52ee807db4bdaed717b54d9dfe55fd037ba8725923c4050cffe18929&',
  'Izuku Midoriya': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449306180173299786/latest.png?ex=693e6b10&is=693d1990&hm=1e97a5a3f8ca6d497c2726b9f370b422d3c4a108e75956b890f45fe51b105526&',
  'Bakugo': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449305410048884816/latest.png?ex=693e6a58&is=693d18d8&hm=85a3f3b4e2e010ff9bf498bb5cf3a16b451727351fce0332bd6159d581a7fd9d&',
  'Hanta Sero': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449305050978451477/latest.png?ex=693e6a02&is=693d1882&hm=22510db28ae6b30df602403f10db1d66a3426aed809b74ed146abb0ca83c4b58&',

  // SOUL EATER
  'Tsubaki Nakatsukasa': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449312280033624105/Z.png?ex=693e70be&is=693d1f3e&hm=aae23a66c3c45fafa4c1ff516eaf27125edc8a18dc4268e6046c60193fd6008b&',

  // BUNGO STRAY DOGS
  'Michizo Tachihara': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449312600130326650/latest.png?ex=693e710a&is=693d1f8a&hm=7aa380b7c27336171e82eac1b3d5e9d70709b52768e37f6ecea4f1998ad3b0ad&',

  // THE WALLFLOWER
  'Sunako Nakahara': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449312936928612383/2373da5475588a7e99102b015fc45a34.png?ex=693e715b&is=693d1fdb&hm=3f31e5eefda48b8aa4e6a13b2649504c45d753d71dda4ea7cbc0e1d868720e2c&',

  // MAGI
  'Morgiana': 'https://cdn.discordapp.com/attachments/1405349401945178152/1449313111390818456/latest.png?ex=693e7184&is=693d2004&hm=4191375661318d01442c4707d5b847265834f166e4f81dd4868a86675e205de5&',
};

module.exports = {
  name: 'charinfo',
  description: 'View details of a character you own',
  async execute({ message, args, userData }) {
    const charName = args.join(' ').trim();

    if (!charName) {
      return message.channel.send('Usage: `.charinfo <character name>`');
    }

    const chars = userData.characters || [];

    const char = chars.find(c =>
      c.name.toLowerCase().trim() === charName.toLowerCase().trim()
    );

    if (!char) {
      if (chars.length === 0) {
        return message.channel.send(`❌ You don't own any characters yet! Use \`.roll\` to get one.`);
      }

      const ownedNames = chars.map(c => c.name).join(', ');
      return message.channel.send(
        `❌ You don't own **${charName}**.\n\nYour characters: ${ownedNames}`
      );
    }

    const movesText = char.moves.map(m => `• **${m.name}** (${m.damage})`).join('\n');

    const imageKey = Object.keys(characterImages).find(
      key => key.toLowerCase() === char.name.toLowerCase()
    );

    const imageUrl = imageKey ? characterImages[imageKey] : null;

    const embed = new EmbedBuilder()
      .setTitle(`˗ˏˋ 𐙚 ⭐ ${char.name} ⭐ 𐙚 ˎˊ˗`)
      .setDescription(
        [
          '꒰ঌ celestial profile ໒꒱',
          '',
          `📺 **Series:** ${char.series}`,
          `✨ **Tier:** ${char.tier}`,
          '',
          `**𝔞𝔟𝔦𝔩𝔦𝔱𝔦𝔢𝔰:**`,
          movesText
        ].join('\n')
      )
      .setColor('#F5E6FF')
      .setTimestamp()
      .setFooter({ text: 'System • Character Profile' });

    // Use image as large embed image with border description
    if (imageUrl) {
      embed.setImage(imageUrl);
      embed.setDescription(
        [
          '✧˚₊‧════╮ 𐙚 celestial profile 𐙚 ╭════‧₊˚✧',
          '',
          `📺 **Series:** ${char.series}`,
          `✨ **Tier:** ${char.tier}`,
          '',
          `**𝔞𝔟𝔦𝔩𝔦𝔱𝔦𝔢𝔰:**`,
          movesText,
          '',
          '✧˚₊‧════════════════════╮ 𐙚 ╭════════════════════‧₊˚✧'
        ].join('\n')
      );
    }

    return message.channel.send({ embeds: [embed] });
  }
};
