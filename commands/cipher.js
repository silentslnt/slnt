// commands/cipher.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'cipher',
  description: 'Start a cipher betting challenge',
  /**
   * @param {Object} ctx
   * @param {import('discord.js').Message} ctx.message
   * @param {string[]} ctx.args
   * @param {Object} ctx.userData
   * @param {Function} ctx.saveUserData
   * @param {Function} ctx.getUserData
   */
  async execute({ message, args, userData, saveUserData, getUserData }) {
    const userId = message.author.id;
    const betAmount = parseInt(args[0]);

    // Validate bet amount
    if (!betAmount || isNaN(betAmount) || betAmount <= 0) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('INVALID BET AMOUNT')
            .setDescription('> Usage: `.cipher <amount>`\n> Example: `.cipher 500`')
            .setFooter({ text: message.guild?.name || 'Shiro' }),
        ],
      });
    }

    // Check if user already has an active challenge
    if (global.activeChallenges && global.activeChallenges.has(userId)) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('CHALLENGE ALREADY ACTIVE')
            .setDescription('> You already have an active cipher challenge — finish it first or wait for the timer to expire.')
            .setFooter({ text: message.guild?.name || 'Shiro' }),
        ],
      });
    }

    // Ensure userData exists & has balance
    const dbUser = await getUserData(userId);

    if (dbUser.balance < betAmount) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(0x000000)
            .setTitle('INSUFFICIENT BALANCE')
            .setDescription(
              `> Your balance: **${dbUser.balance.toLocaleString()}** coins\n` +
              `> Bet amount: **${betAmount.toLocaleString()}** coins\n` +
              `> Needed: **${(betAmount - dbUser.balance).toLocaleString()}** more`
            )
            .setFooter({ text: message.guild?.name || 'Shiro' }),
        ],
      });
    }

    // Deduct bet
    dbUser.balance -= betAmount;
    await saveUserData({ balance: dbUser.balance });

    // Possible secret messages (20)
    const messages = [
      'FORGE MASTER',
      'SHADOW BLADE',
      'IRON THRONE',
      'DRAGON SLAYER',
      'CRYSTAL KNIGHT',
      'FIRE STORM',
      'GOLDEN SHIELD',
      'THUNDER BOLT',
      'MYSTIC RUNE',
      'STEEL WARRIOR',
      'DARK MAGIC',
      'HOLY GRAIL',
      'BLOOD MOON',
      'ICE WIZARD',
      'WIND WALKER',
      'EARTH TITAN',
      'VOID HUNTER',
      'STAR GAZER',
      'SOUL KEEPER',
      'TIME BENDER',
    ];

    const secretMessage = messages[Math.floor(Math.random() * messages.length)];
    const upperSecret = secretMessage.toUpperCase();

    // Generate ciphers
    const ciphers = generateCiphers(upperSecret);

    // Timing & rewards
    const timeLimit = 120000; // 2 min
    const speedBonus = 60000; // 60s
    const startTime = Date.now();

    const baseReward = betAmount * 2; // 2x
    const speedReward = betAmount * 3; // 3x

    // Challenge embed
    const challengeEmbed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle('CIPHER CHALLENGE')
      .setDescription(
        `> ${message.author} entered the Cipher Arena.\n\n` +
        `> Bet: **${betAmount.toLocaleString()}** coins *(deducted)*\n` +
        `> Time limit: **2 minutes**\n` +
        `> Speed bonus: under 60s → 3x reward\n` +
        `> Fail: lose your bet if you run out of time\n\n` +
        `__**The secret message has been encoded with three ciphers**__\n` +
        `> Type the decoded message directly in this channel (no command needed).`
      )
      .addFields(
        { name: 'Cipher #1 — Binary', value: `\`\`\`${ciphers.binary}\`\`\`` },
        { name: 'Cipher #2 — Reverse', value: `\`\`\`${ciphers.reverse}\`\`\`` },
        { name: 'Cipher #3 — Atbash', value: `\`\`\`${ciphers.atbash}\`\`\`` },
        {
          name: 'Reward Breakdown',
          value: `> Clear < 2 min: **${baseReward.toLocaleString()}** coins (2x)\n` +
                 `> Clear < 60s: **${speedReward.toLocaleString()}** coins (3x)`,
        },
      )
      .setFooter({ text: 'Work out all three ciphers to find the true message.' });

    await message.channel.send({ embeds: [challengeEmbed] });

    // Init map
    if (!global.activeChallenges) global.activeChallenges = new Map();

    // Store challenge
    const challenge = {
      answer: upperSecret,
      startTime,
      timeLimit,
      speedBonus,
      betAmount,
      baseReward,
      speedReward,
      channelId: message.channel.id,
      attempts: 0,
      userId,
    };

    const timeoutId = setTimeout(async () => {
      if (!global.activeChallenges || !global.activeChallenges.has(userId)) return;

      global.activeChallenges.delete(userId);

      const latestUser = await getUserData(userId);

      const failEmbed = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle('TIME EXPIRED')
        .setDescription(
          `> ${message.author}, you ran out of time.\n\n` +
          `> The correct answer was: \`${upperSecret}\`\n` +
          `> Lost: **${betAmount.toLocaleString()}** coins\n` +
          `> Balance: **${latestUser.balance.toLocaleString()}** coins`
        )
        .setFooter({ text: message.guild?.name || 'Shiro' });

      message.channel.send({ embeds: [failEmbed] });
    }, timeLimit);

    challenge.timeoutId = timeoutId;
    global.activeChallenges.set(userId, challenge);
  },
};

// Helper: generate ciphers from UPPERCASE text
function generateCiphers(text) {
  // Binary (8-bit ASCII, space preserved)
  const binary = text.split('').map(char => {
    if (char === ' ') return '00100000';
    return char.charCodeAt(0).toString(2).padStart(8, '0');
  }).join(' ');

  // Reverse
  const reverse = text.split('').reverse().join('');

  // Atbash
  const atbash = text.split('').map(char => {
    if (char === ' ') return ' ';
    if (char >= 'A' && char <= 'Z') {
      return String.fromCharCode(90 - (char.charCodeAt(0) - 65)); // A↔Z
    }
    if (char >= 'a' && char <= 'z') {
      return String.fromCharCode(122 - (char.charCodeAt(0) - 97)); // a↔z
    }
    return char;
  }).join('');

  return { binary, reverse, atbash };
}
