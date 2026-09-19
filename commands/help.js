// commands/help.js
const { EmbedBuilder } = require('discord.js');
const { COLOR } = require('../utils/config');

const SECTIONS = {
  economy: {
    emoji: '💰',
    title: '💰 Economy',
    commands: [
      { cmd: '.bal / .b',          desc: 'Check your balance & stats'        },
      { cmd: '.daily / .day',      desc: 'Claim daily reward + streak bonus' },
      { cmd: '.missions / .ms',    desc: 'View and complete daily missions'  },
      { cmd: '.profile / .pf',     desc: 'View your full profile'            },
      { cmd: '.invest / .vault',   desc: 'Lock coins for 10% profit (24h)'  },
      { cmd: '.leaderboard / .lb', desc: '.lb [coins|silv|streak|level...]'  },
      { cmd: '.gift / .give',      desc: 'Gift coins to someone (cap 10k/d)' },
      { cmd: '.duel / .dl',        desc: 'Challenge someone to a coin duel'  },
    ],
  },
  games: {
    emoji: '🎮',
    title: '🎮 Games (Admin-start)',
    commands: [
      { cmd: '.blackjack / .bj',    desc: '.bj <amount|all>  — Hit or Stand'  },
      { cmd: '.slots / .sl',        desc: '.sl <amount|all>  — Spin the reels' },
      { cmd: '.coinflip / .cf',     desc: '.cf <amount|all> <h|t>'             },
      { cmd: '.roulette / .rl',     desc: '.rl <amount|all> <color/num>'       },
      { cmd: '.dice / .d',          desc: '.d <amount|all>  — Roll the dice'   },
      { cmd: '.rps',                desc: '.rps <amount|all> <r|p|s>'          },
      { cmd: '.highlow / .hl',      desc: '.hl <amount>  — Higher or lower?'   },
      { cmd: '.minesweeper / .mine',desc: '.mine <bet> <rows> <cols> <mines>'  },
    ],
  },
  minigames: {
    emoji: '🎪',
    title: '🎪 Minigames (Respond)',
    commands: [
      { cmd: '.hangman / .hm',       desc: 'Admin-start word guessing game'    },
      { cmd: '.cipher / .cph',       desc: 'Admin-start decode challenge'      },
      { cmd: '.wordscramble / .ws',  desc: 'Admin-start word scramble'         },
      { cmd: '.guess',               desc: 'Admin-start number guessing'       },
    ],
  },
  shop: {
    emoji: '🛍',
    title: '🛍 Shop (1 SILV = 10 Robux)',
    commands: [
      { cmd: '.shop / .sh',          desc: 'Main shop overview'                },
      { cmd: '.sh essences',         desc: 'Active boost items (SILV)'         },
      { cmd: '.sh bundles',          desc: 'Value bundles (SILV)'              },
      { cmd: '.sh cosmetics',        desc: 'Titles & badges (SILV)'            },
      { cmd: '.sh utility',          desc: 'Utility items (coins)'             },
      { cmd: '.sh spells',           desc: 'SILV race spells for Sentinel'     },
      { cmd: '.sh buy <id>',         desc: 'Purchase an item'                  },
      { cmd: '.inv / .i',            desc: 'View your inventory'               },
    ],
  },
  keys: {
    emoji: '🔑',
    title: '🔑 Keys & Characters',
    commands: [
      { cmd: '.redeem / .rd',        desc: 'Claim a dropped key'               },
      { cmd: '.open / .op',          desc: '.op <rarity> [amount]'             },
      { cmd: '.roll / .r',           desc: 'Spend 2,000 coins for a character' },
      { cmd: '.characters / .chars', desc: 'View all characters'               },
      { cmd: '.charinfo / .ci',      desc: '.ci <name>  — Character details'   },
      { cmd: '.battle / .bt',        desc: '.bt @user  — Character battle'     },
      { cmd: '.mysterybox',          desc: 'Open a mystery box'                },
    ],
  },
  progress: {
    emoji: '📈',
    title: '📈 Progression',
    commands: [
      { cmd: '.achievements / .ach', desc: 'View all achievements'            },
      { cmd: '.profile / .pf',       desc: 'XP, level, rank, badges'          },
      { cmd: '.trade / .tr',         desc: '.tr @user  — Trade with someone'  },
      { cmd: '.lottery / .lot',      desc: 'Buy lottery tickets'              },
    ],
  },
};

module.exports = {
  name: 'help',
  aliases: ['h', 'commands', 'cmds'],
  adminOnly: false,
  description: 'View all bot commands. `.help [section]`',

  async execute({ message, args }) {
    const section = (args[0] || '').toLowerCase();
    const secData = SECTIONS[section];

    if (secData) {
      const embed = new EmbedBuilder()
        .setTitle(`˗ˏˋ 𐙚 ${secData.title} 𐙚 ˎˊ˗`)
        .setColor(COLOR.DEFAULT)
        .setDescription(secData.commands.map(c => `\`${c.cmd}\` — ${c.desc}`).join('\n'))
        .setFooter({ text: `Sections: ${Object.keys(SECTIONS).join(', ')} | .help [section]` });
      return message.channel.send({ embeds: [embed] });
    }

    // Main overview
    const embed = new EmbedBuilder()
      .setTitle('˗ˏˋ 𐙚 𝕂𝕆ℕ — Command Guide 𐙚 ˎˊ˗')
      .setColor(COLOR.DEFAULT)
      .setDescription(
        '꒰ঌ Use `.help [section]` to view a section in detail ໒꒱\n\n' +
        '⭐ **Non-admin commands:** `.rd .lb .bal .pf .inv .daily .missions .ach .help`\n' +
        '🔒 **All other commands are admin-only**\n\n' +
        '💎 **1 SILV Token = 10 Robux** — Spend SILV in the shop for massive value!\n\n' +
        Object.values(SECTIONS).map(s =>
          `**${s.emoji} ${s.title}** — \`.help ${Object.keys(SECTIONS).find(k => SECTIONS[k] === s)}\``
        ).join('\n')
      )
      .addFields(
        { name: '💡 All-in Shortcuts', value: '`all` or `max` — bet full balance\nExample: `.bj all`, `.cf max h`, `.sl all`', inline: false },
        { name: '🛍 Shop Highlights',   value: '`.sh essences` — Boost your gains\n`.sh bundles` — Best SILV value packs',        inline: false },
      )
      .setFooter({ text: 'System • Help | All gambling is admin-only' });

    return message.channel.send({ embeds: [embed] });
  },
};