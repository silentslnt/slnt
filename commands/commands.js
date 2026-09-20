const { EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../utils/permissions');

// Global bot state (in-memory, resets on restart — fails open to enabled)
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

function embed(title, desc, guild) {
  return new EmbedBuilder()
    .setColor(0x000000)
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: guild?.name || 'Shiro' });
}

module.exports = {
  name: 'commands',
  description: 'Toggle bot commands on/off (admin only)',
  async execute({ message, args }) {
    const member = message.member;

    if (!canToggleCommands(member)) {
      return message.channel.send({
        embeds: [embed('ACCESS DENIED', '> Only admins can toggle commands.', message.guild)],
      });
    }

    const action = args[0]?.toLowerCase();

    if (!action || !['on', 'off', 'status'].includes(action)) {
      return message.channel.send({
        embeds: [embed(
          'COMMANDS — USAGE',
          `> Usage: \`.commands <on|off|status>\`\n\n` +
          `> \`.commands off\` — disable all commands\n` +
          `> \`.commands on\` — enable all commands\n` +
          `> \`.commands status\` — check current status\n\n` +
          `-# Current status: ${commandsEnabled ? 'Enabled' : 'Disabled'}`,
          message.guild,
        )],
      });
    }

    if (action === 'status') {
      return message.channel.send({
        embeds: [embed(
          'COMMAND SYSTEM STATUS',
          `> Commands are currently **${commandsEnabled ? 'ENABLED' : 'DISABLED'}**.\n\n` +
          `-# ${commandsEnabled ? 'All users can use bot commands.' : 'Only admins can use bot commands.'}`,
          message.guild,
        )],
      });
    }

    if (action === 'off') {
      if (!commandsEnabled) {
        return message.channel.send({ embeds: [embed('ALREADY DISABLED', '> Commands are already disabled.', message.guild)] });
      }
      commandsEnabled = false;
      return message.channel.send({
        embeds: [embed(
          'COMMANDS DISABLED',
          '> All bot commands are now **disabled**. Only admins can still use commands.',
          message.guild,
        )],
      });
    }

    if (action === 'on') {
      if (commandsEnabled) {
        return message.channel.send({ embeds: [embed('ALREADY ENABLED', '> Commands are already enabled.', message.guild)] });
      }
      commandsEnabled = true;
      return message.channel.send({
        embeds: [embed('COMMANDS ENABLED', '> All bot commands are now **enabled**. Everyone can use commands again.', message.guild)],
      });
    }
  },

  canToggleCommands,
  areCommandsEnabled,
  setCommandsEnabled,
};
