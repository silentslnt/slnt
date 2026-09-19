const { EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../utils/permissions');

// Global bot state (in-memory, resets on restart)
let commandsEnabled = true;

function canToggleCommands(member) {
  if (!member) return false;
  return isAdmin({ member, author: member.user });
}

function areCommandsEnabled() {
  return commandsEnabled;
}

function setCommandsEnabled(state) {
  commandsEnabled = state;
}

module.exports = {
  name: 'commands',
  description: 'Toggle bot commands on/off (admin only)',
  async execute({ message, args }) {
    const member = message.member;

    if (!canToggleCommands(member)) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F5E6FF')
            .setTitle('˗ˏˋ 𐙚 𝔸𝕔𝕔𝕖𝕤𝕤 𝔻𝕖𝕟𝕚𝕖𝕕 𐙚 ˎˊ˗')
            .setDescription(
              [
                '꒰ঌ 𝔒𝔫𝔩𝔶 𝔞𝔡𝔪𝔦𝔫𝔰 𝔠𝔞𝔫 𝔱𝔬𝔤𝔤𝔩𝔢 𝔠𝔬𝔪𝔪𝔞𝔫𝔡𝔰 ໒꒱',
                '',
                'You need the admin role or be whitelisted.',
              ].join('\n')
            )
            .setFooter({ text: 'System • Permission Check' }),
        ],
      });
    }

    const action = args[0]?.toLowerCase();

    if (!action || !['on', 'off', 'status'].includes(action)) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F5E6FF')
            .setTitle('✧˚₊‧ 𝕀𝕟𝕧𝕒𝕝𝕚𝕕 𝕌𝕤𝕒𝕘𝕖 ‧₊˚✧')
            .setDescription(
              [
                'Usage: `.commands <on|off|status>`',
                '',
                'Examples:',
                '• `.commands off` - Disable all commands',
                '• `.commands on` - Enable all commands',
                '• `.commands status` - Check current status',
                '',
                `**Current status:** ${commandsEnabled ? '✅ Enabled' : '❌ Disabled'}`,
              ].join('\n')
            )
            .setFooter({ text: 'System • Usage Hint' }),
        ],
      });
    }

    if (action === 'status') {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F5E6FF')
            .setTitle('✧˚₊‧ 🤖 ℂ𝕠𝕞𝕞𝕒𝕟𝕕 𝕊𝕪𝕤𝕥𝕖𝕞 𝕊𝕥𝕒𝕥𝕦𝕤 ‧₊˚✧')
            .setDescription(
              [
                `**Commands are currently:** ${commandsEnabled ? '✅ **ENABLED**' : '❌ **DISABLED**'}`,
                '',
                commandsEnabled
                  ? 'All users can use bot commands.'
                  : 'Only admins can use bot commands.',
              ].join('\n')
            )
            .setFooter({ text: 'System • Status Check' })
            .setTimestamp(),
        ],
      });
    }

    if (action === 'off') {
      if (!commandsEnabled) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#F5E6FF')
              .setTitle('✧˚₊‧ ⚠️ 𝔸𝕝𝕣𝕖𝕒𝕕𝕪 𝔻𝕚𝕤𝕒𝕓𝕝𝕖𝕕 ‧₊˚✧')
              .setDescription('Commands are already disabled.')
              .setFooter({ text: 'System • Status Check' }),
          ],
        });
      }

      commandsEnabled = false;

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F5E6FF')
            .setTitle('✧˚₊‧ 🔒 ℂ𝕠𝕞𝕞𝕒𝕟𝕕𝕤 𝔻𝕚𝕤𝕒𝕓𝕝𝕖𝕕 ‧₊˚✧')
            .setDescription(
              [
                '꒰ঌ 𝔱𝔥𝔢 𝔟𝔬𝔱 𝔥𝔞𝔰 𝔟𝔢𝔢𝔫 𝔰𝔦𝔩𝔢𝔫𝔠𝔢𝔡 ໒꒱',
                '',
                'All bot commands are now **disabled**.',
                'Only admins can still use commands.',
                '',
                '**Silent mode:** Bot will not respond to non-admins.',
              ].join('\n')
            )
            .setFooter({ text: 'System • Commands Disabled' })
            .setTimestamp(),
        ],
      });
    }

    if (action === 'on') {
      if (commandsEnabled) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#F5E6FF')
              .setTitle('✧˚₊‧ ⚠️ 𝔸𝕝𝕣𝕖𝕒𝕕𝕪 𝔼𝕟𝕒𝕓𝕝𝕖𝕕 ‧₊˚✧')
              .setDescription('Commands are already enabled.')
              .setFooter({ text: 'System • Status Check' }),
          ],
        });
      }

      commandsEnabled = true;

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F5E6FF')
            .setTitle('✧˚₊‧ ✅ ℂ𝕠𝕞𝕞𝕒𝕟𝕕𝕤 𝔼𝕟𝕒𝕓𝕝𝕖𝕕 ‧₊˚✧')
            .setDescription(
              [
                '꒰ঌ 𝔱𝔥𝔢 𝔟𝔬𝔱 𝔥𝔞𝔰 𝔞𝔴𝔞𝔨𝔢𝔫𝔢𝔡 ໒꒱',
                '',
                'All bot commands are now **enabled**.',
                'Everyone can use commands again.',
              ].join('\n')
            )
            .setFooter({ text: 'System • Commands Enabled' })
            .setTimestamp(),
        ],
      });
    }
  },

  canToggleCommands,
  areCommandsEnabled,
  setCommandsEnabled,
};
