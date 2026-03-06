const { EmbedBuilder } = require('discord.js');

const ADMIN_ROLE_ID = '1382513369801555988';

module.exports = {
  name: 'help',
  description: 'Shows all available commands',
  async execute({ message, args, prefix, client }) {
    const category = args[0]?.toLowerCase();

    // Detailed category help
    if (category) {
      let embed;

      switch (category) {
        case 'economy':
          embed = new EmbedBuilder()
            .setTitle('˗ˏˋ 𐙚 💰 𝔈𝔠𝔬𝔫𝔬𝔪𝔶 𝔠𝔬𝔪𝔪𝔞𝔫𝔡𝔰 𐙚 ˎˊ˗')
            .setColor('#F5E6FF')
            .addFields(
              {
                name: `${prefix}bal [@user]`,
                value: 'Check your balance or another user\'s balance.',
                inline: false,
              },
              {
                name: `${prefix}baltop`,
                value: 'View the richest users on the server.',
                inline: false,
              },
              {
                name: `${prefix}daily`,
                value: 'Claim your daily celestial reward.',
                inline: false,
              }
            );
          break;

        case 'games':
          embed = new EmbedBuilder()
            .setTitle('˗ˏˋ 𐙚 🎮 𝔊𝔞𝔪𝔢 𝔠𝔬𝔪𝔪𝔞𝔫𝔡𝔰 𐙚 ˎˊ˗')
            .setColor('#F5E6FF')
            .addFields(
              { name: `${prefix}dice <amount>`, value: 'Roll blessed dice and win rewards.', inline: false },
              { name: `${prefix}slots <amount>`, value: 'Spin the celestial slots – match 3 for jackpot.', inline: false },
              { name: `${prefix}rps <amount> <rock|paper|scissors>`, value: 'Play rock, paper, scissors versus fate.', inline: false },
              { name: `${prefix}cf <amount> <h|t>`, value: 'Flip an ethereal coin and bet on heads or tails.', inline: false },
              { name: `${prefix}roulette <amount> <red|black|green|0-36>`, value: 'Test your luck on the roulette wheel.', inline: false },
              { name: `${prefix}blackjack <amount>`, value: 'Play blackjack and outsmart the dealer.', inline: false },
              { name: `${prefix}hl <amount>`, value: 'Higher or Lower – guess correctly to win.', inline: false },
              { name: `${prefix}minesweeper start <size> <mines> <bet>`, value: 'Start your own minesweeper game.', inline: false }
            );
          break;

        case 'multiplayer':
          embed = new EmbedBuilder()
            .setTitle('˗ˏˋ 𐙚 🎯 𝔐𝔲𝔩𝔱𝔦𝔭𝔩𝔞𝔶𝔢𝔯 𝔤𝔞𝔪𝔢𝔰 𐙚 ˎˊ˗')
            .setColor('#F5E6FF')
            .addFields(
              { name: `${prefix}hangman start <word>`, value: '(Admin) Start a hangman game.', inline: false },
              { name: `${prefix}hangman guess <letter>`, value: 'Guess a letter in the active hangman game.', inline: false },
              { name: `${prefix}wordscramble start <word>`, value: '(Admin) Start a word scramble game.', inline: false },
              { name: `${prefix}guess start`, value: '(Admin) Start a number guessing game (1-500).', inline: false },
              { name: `${prefix}guess stop`, value: '(Admin) Stop the guessing game.', inline: false }
            );
          break;

        case 'shop':
          embed = new EmbedBuilder()
            .setTitle('˗ˏˋ 𐙚 🏪 𝔖𝔥𝔬𝔭 & 𝔦𝔱𝔢𝔪𝔰 𐙚 ˎˊ˗')
            .setColor('#F5E6FF')
            .addFields(
              { name: `${prefix}shop`, value: 'View items available for purchase.', inline: false },
              { name: `${prefix}buy <item_id>`, value: 'Buy an item from the shop.', inline: false },
              { name: `${prefix}inventory`, value: 'View your inventory.', inline: false },
              { name: `${prefix}open <rarity> [amount]`, value: 'Open keys to receive prizes.', inline: false },
              { name: `${prefix}trade @user`, value: 'Start a trade with another user.', inline: false },
              { name: `${prefix}trade offer currency <amount>`, value: 'Offer coins in active trade.', inline: false },
              { name: `${prefix}trade offer item <name> <amount>`, value: 'Offer items in active trade.', inline: false },
              { name: `${prefix}trade view`, value: 'View current trade offers.', inline: false },
              { name: `${prefix}trade confirm`, value: 'Confirm your side of the trade.', inline: false },
              { name: `${prefix}trade cancel`, value: 'Cancel the active trade.', inline: false }
            );
          break;

        case 'keys':
          embed = new EmbedBuilder()
            .setTitle('˗ˏˋ 𐙚 🔑 𝔎𝔢𝔶 𝔰𝔶𝔰𝔱𝔢𝔪 𐙚 ˎˊ˗')
            .setColor('#F5E6FF')
            .addFields(
              { name: `${prefix}redeem`, value: 'Claim a dropped key in the key drop channel.', inline: false },
              { name: 'Passive Key Drops', value: 'Keys drop randomly in the key drop channel as you chat.', inline: false }
            );
          break;

        case 'lottery':
          embed = new EmbedBuilder()
            .setTitle('˗ˏˋ 𐙚 🎟️ 𝔏𝔬𝔱𝔱𝔢𝔯𝔶 𐙚 ˎˊ˗')
            .setColor('#F5E6FF')
            .addFields(
              { name: `${prefix}lottery buy`, value: 'Buy a lottery ticket (max 5 per user).', inline: false },
              { name: `${prefix}lottery status`, value: 'Check current pot and tickets sold.', inline: false },
              { name: `${prefix}lottery draw`, value: '(Admin) Draw a winner from all tickets.', inline: false }
            );
          break;

        case 'characters':
          embed = new EmbedBuilder()
            .setTitle('˗ˏˋ 𐙚 ⭐ 𝔠𝔥𝔞𝔯𝔞𝔠𝔱𝔢𝔯 𝔰𝔶𝔰𝔱𝔢𝔪 𐙚 ˎˊ˗')
            .setColor('#F5E6FF')
            .addFields(
              { name: `${prefix}roll`, value: 'Roll for an anime character (costs 500 coins).', inline: false },
              { name: `${prefix}characters`, value: 'View your character collection.', inline: false },
              { name: `${prefix}charinfo <name>`, value: 'View details of a character you own.', inline: false },
              {
                name: 'Character Tiers',
                value: 'S+ (0.5%) • S (1.5%) • A (8%) • B (20%) • C (35%) • D (35%)',
                inline: false,
              }
            );
          break;

        case 'battle':
          embed = new EmbedBuilder()
            .setTitle('˗ˏˋ 𐙚 ⚔️ 𝔅𝔞𝔱𝔱𝔩𝔢 𝔠𝔬𝔪𝔪𝔞𝔫𝔡𝔰 𐙚 ˎˊ˗')
            .setColor('#F5E6FF')
            .addFields(
              { name: `${prefix}battle @user`, value: 'Challenge another player to battle.', inline: false },
              { name: `${prefix}battle add <character name>`, value: 'Add a character to your battle team (max 4).', inline: false },
              { name: `${prefix}battle remove <character name>`, value: 'Remove a character from your team.', inline: false },
              { name: `${prefix}battle team`, value: 'View your current battle team.', inline: false },
              { name: `${prefix}battle ready`, value: 'Ready up to start the battle.', inline: false },
              { name: `${prefix}battle attack <move#>`, value: 'Use a move during battle.', inline: false },
              { name: `${prefix}battle cancel`, value: 'Cancel the current battle.', inline: false },
              { name: 'Battle Info', value: 'Turn-based combat with up to 4 characters per team. Moves have limited uses based on power tier.', inline: false }
            );
          break;

        case 'admin':
          if (!message.member.roles.cache.has(ADMIN_ROLE_ID)) {
            return message.channel.send('❌ You do not have permission to view admin commands.');
          }
          embed = new EmbedBuilder()
            .setTitle('˗ˏˋ 𐙚 ⚙️ 𝔄𝔡𝔪𝔦𝔫 𝔠𝔬𝔫𝔱𝔯𝔬𝔩𝔰 𐙚 ˎˊ˗')
            .setColor('#F5E6FF')
            .addFields(
              { name: `${prefix}admin give currency <amount> @user`, value: 'Give coins to a user.', inline: false },
              { name: `${prefix}admin give keys <rarity> <amount> @user`, value: 'Give keys to a user.', inline: false },
              { name: `${prefix}admin remove currency <amount> @user`, value: 'Remove coins from a user.', inline: false },
              { name: `${prefix}admin remove keys <rarity> <amount> @user`, value: 'Remove keys from a user.', inline: false },
              { name: `${prefix}admin reset @user`, value: 'Reset a user\'s balance and inventory.', inline: false },
              { name: `${prefix}admin spawn <rarity> <channel_id>`, value: 'Spawn a key in a specific channel.', inline: false },
              { name: `${prefix}adminlogs`, value: 'View admin action logs from past 7 days.', inline: false }
            );
          break;

        default:
          return message.channel.send(
            `❌ Unknown category. Available: \`economy\`, \`games\`, \`multiplayer\`, \`shop\`, \`keys\`, \`lottery\`, \`characters\`, \`battle\`, \`admin\``
          );
      }

      embed
        .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
        .setTimestamp();

      return message.channel.send({ embeds: [embed] });
    }

    // Main help menu
    const embed = new EmbedBuilder()
      .setTitle('˗ˏˋ 𐙚 📜 𝔅𝔬𝔱 𝔠𝔬𝔪𝔪𝔞𝔫𝔡𝔰 𐙚 ˎˊ˗')
      .setDescription(
        [
          `**Prefix:** \`${prefix}\``,
          '',
          `Use \`${prefix}help <category>\` for detailed command info.`,
          '',
          '꒰ঌ **Available Categories** ໒꒱',
          '• `economy` – Balance, daily rewards, leaderboard',
          '• `games` – Betting games and mini-games',
          '• `multiplayer` – Group games (hangman, wordscramble, guess)',
          '• `shop` – Shop, inventory, trading',
          '• `keys` – Key drop system',
          '• `lottery` – Lottery system',
          '• `characters` – Roll and collect anime characters',
          '• `battle` – Battle other players with your characters',
          '• `admin` – Admin-only controls',
        ].join('\n')
      )
      .setColor('#F5E6FF')
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        {
          name: '💰 Popular Commands',
          value: `\`${prefix}bal\` • \`${prefix}daily\` • \`${prefix}inventory\` • \`${prefix}shop\``,
          inline: false,
        },
        {
          name: '🎮 Quick Games',
          value: `\`${prefix}dice 100\` • \`${prefix}slots 50\` • \`${prefix}rps 100 rock\``,
          inline: false,
        },
        {
          name: '⭐ Character System',
          value: `\`${prefix}roll\` • \`${prefix}characters\` • \`${prefix}battle @user\``,
          inline: false,
        }
      )
      .setFooter({ text: `Requested by ${message.author.username}`, iconURL: message.author.displayAvatarURL() })
      .setTimestamp();

    return message.channel.send({ embeds: [embed] });
  },
};
