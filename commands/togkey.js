const { EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../utils/permissions');

function embed(title, desc, guild) {
  return new EmbedBuilder()
    .setColor(0x000000)
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: guild?.name || 'Shiro' });
}

module.exports = {
  name: 'tkd',
  description: 'Toggle automatic keydrops on/off (admin only)',
  async execute({ message, args, keydrop }) {
    // Check if user is not admin - silent block
    if (!isAdmin(message)) {
      return;
    }

    const action = args[0]?.toLowerCase();

    if (!action || !['on', 'off', 'status'].includes(action)) {
      const currentStatus = keydrop.areKeydropsEnabled();
      return message.channel.send({
        embeds: [embed(
          'KEYDROPS — USAGE',
          `> Usage: \`.tkd <on|off|status>\`\n\n` +
          `> \`.tkd off\` — disable automatic keydrops\n` +
          `> \`.tkd on\` — enable automatic keydrops\n` +
          `> \`.tkd status\` — check current status\n\n` +
          `-# Current status: ${currentStatus ? 'Enabled' : 'Disabled'}`,
          message.guild,
        )],
      });
    }

    if (action === 'status') {
      const currentStatus = keydrop.areKeydropsEnabled();
      return message.channel.send({
        embeds: [embed(
          'KEYDROP STATUS',
          `> Keydrops are currently **${currentStatus ? 'ENABLED' : 'DISABLED'}**.\n\n` +
          `-# ${currentStatus ? 'Keys will automatically drop in the keydrop channel.' : 'Automatic key drops are paused.'}`,
          message.guild,
        )],
      });
    }

    if (action === 'off') {
      if (!keydrop.areKeydropsEnabled()) {
        return message.channel.send({ embeds: [embed('ALREADY DISABLED', '> Keydrops are already disabled.', message.guild)] });
      }
      keydrop.setKeydropsEnabled(false);
      return message.channel.send({
        embeds: [embed(
          'KEYDROPS DISABLED',
          `> Automatic keydrops are now **disabled**.\n\n` +
          `-# Admin-spawned keys still work.`,
          message.guild,
        )],
      });
    }

    if (action === 'on') {
      if (keydrop.areKeydropsEnabled()) {
        return message.channel.send({ embeds: [embed('ALREADY ENABLED', '> Keydrops are already enabled.', message.guild)] });
      }
      keydrop.setKeydropsEnabled(true);
      return message.channel.send({
        embeds: [embed(
          'KEYDROPS ENABLED',
          '> Automatic keydrops are now **enabled**.\n\n-# Keys will start dropping in the keydrop channel.',
          message.guild,
        )],
      });
    }
  },
};
