const { EmbedBuilder } = require('discord.js');
const { requireWhitelisted } = require('../utils/permissions');

function embed(title, desc, guild) {
  return new EmbedBuilder()
    .setColor(0x000000)
    .setTitle(title)
    .setDescription(desc)
    .setFooter({ text: guild?.name || 'Shiro' });
}

module.exports = {
  name: 'r',
  description: 'Toggle role on/off for a user (restricted access)',
  async execute({ message, args }) {
    // Can grant/remove ANY role including the real admin role — a command
    // like this must never trust "has some role" alone (that's exactly
    // how a stale/mislabeled role becomes a privilege-escalation path),
    // so it's gated at the strict whitelist tier, not requireAdmin.
    if (!await requireWhitelisted(message)) return;

    if (args.length < 2) {
      return message.channel.send({
        embeds: [embed('INVALID USAGE', '> Usage: `.r @user @role` or `.r <userId> <roleId>` — toggles the role on/off.', message.guild)],
      });
    }

    let targetUser = message.mentions.members.first();
    if (!targetUser) {
      const userId = args[0].replace(/[<@!>]/g, '');
      targetUser = await message.guild.members.fetch(userId).catch(() => null);
    }
    if (!targetUser) {
      return message.channel.send({ embeds: [embed('USER NOT FOUND', '> Could not find that user in this server.', message.guild)] });
    }

    let targetRole = message.mentions.roles.first();
    if (!targetRole) {
      const roleId = args[1].replace(/[<@&>]/g, '');
      targetRole = message.guild.roles.cache.get(roleId);
    }
    if (!targetRole) {
      return message.channel.send({ embeds: [embed('ROLE NOT FOUND', '> Could not find that role in this server.', message.guild)] });
    }

    const hasRole = targetUser.roles.cache.has(targetRole.id);
    try {
      if (hasRole) {
        await targetUser.roles.remove(targetRole.id);
        return message.channel.send({
          embeds: [embed(
            'ROLE REMOVED',
            `> Removed **${targetRole.name}** from ${targetUser}.\n\n` +
            `> User: ${targetUser.user.tag}\n` +
            `> Removed by: ${message.author.tag}`,
            message.guild,
          )],
        });
      } else {
        await targetUser.roles.add(targetRole.id);
        return message.channel.send({
          embeds: [embed(
            'ROLE ADDED',
            `> Gave **${targetRole.name}** to ${targetUser}.\n\n` +
            `> User: ${targetUser.user.tag}\n` +
            `> Added by: ${message.author.tag}`,
            message.guild,
          )],
        });
      }
    } catch (error) {
      console.error('ROLE TOGGLE ERROR:', error);
      if (error.code === 50001) {
        return message.channel.send({
          embeds: [embed(
            'MISSING ACCESS',
            `> Bot cannot manage \`${targetRole.name}\`.\n\n` +
            `> Fix: move the bot's role ABOVE \`${targetRole.name}\` in Server Settings → Roles.`,
            message.guild,
          )],
        });
      }
      return message.channel.send({
        embeds: [embed('FAILED', `> Error: ${error.message}`, message.guild)],
      });
    }
  },
};
