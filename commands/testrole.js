const { EmbedBuilder } = require('discord.js');
const { requireWhitelisted } = require('../utils/permissions');

module.exports = {
  name: 'r',
  description: 'Toggle role on/off for a user (restricted access)',
  async execute({ message, args }) {
    // Can grant/remove ANY role including the real admin role — a command
    // like this must never trust "has some role" alone (that's exactly
    // how a stale/mislabeled role becomes a privilege-escalation path),
    // so it's gated at the strict whitelist tier, not requireAdmin.
    if (!await requireWhitelisted(message)) return;

    // Parse arguments
    if (args.length < 2) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('Orange')
            .setTitle('⚠️ Invalid Usage')
            .setDescription('**Usage:** `.r @user @role` or `.r <userId> <roleId>`\n**Toggles role on/off!**')
        ]
      });
    }

    // Get user (mention or ID)
    let targetUser = message.mentions.members.first();
    if (!targetUser) {
      const userId = args[0].replace(/[<@!>]/g, '');
      targetUser = await message.guild.members.fetch(userId).catch(() => null);
    }

    if (!targetUser) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setTitle('❌ User Not Found')
            .setDescription('Could not find that user in this server.')
        ]
      });
    }

    // Get role (mention or ID)
    let targetRole = message.mentions.roles.first();
    if (!targetRole) {
      const roleId = args[1].replace(/[<@&>]/g, '');
      targetRole = message.guild.roles.cache.get(roleId);
    }

    if (!targetRole) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('Red')
            .setTitle('❌ Role Not Found')
            .setDescription('Could not find that role in this server.')
        ]
      });
    }

    // TOGGLE LOGIC: ADD if they don't have it, REMOVE if they do
    if (targetUser.roles.cache.has(targetRole.id)) {
      // REMOVE role
      try {
        await targetUser.roles.remove(targetRole.id);
        
        const removeEmbed = new EmbedBuilder()
          .setColor('Blue')
          .setTitle('✅ Role Removed!')
          .setDescription(`Successfully removed **${targetRole.name}** from ${targetUser}! ❌`)
          .addFields(
            { name: 'User', value: `${targetUser.user.tag}`, inline: true },
            { name: 'Role', value: `${targetRole.name}`, inline: true },
            { name: 'Removed By', value: `${message.author.tag}`, inline: true }
          )
          .setTimestamp();
        
        message.channel.send({ embeds: [removeEmbed] });
        
      } catch (error) {
        console.error('ROLE REMOVE ERROR:', error);
        
        if (error.code === 50001) {
          return message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('Red')
                .setTitle('❌ Missing Access')
                .setDescription(
                  `**Bot cannot manage \`${targetRole.name}\` role!**\n\n` +
                  `**Fix:** Move **bot role ABOVE** \`${targetRole.name}\` in Server Settings → Roles`
                )
            ]
          });
        }
        
        message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setTitle('❌ Failed to Remove Role')
              .setDescription(`Error: ${error.message}`)
          ]
        });
      }
      
    } else {
      // ADD role
      try {
        await targetUser.roles.add(targetRole.id);
        
        const addEmbed = new EmbedBuilder()
          .setColor('Green')
          .setTitle('✅ Role Added!')
          .setDescription(`Successfully gave **${targetRole.name}** to ${targetUser}! 👑`)
          .addFields(
            { name: 'User', value: `${targetUser.user.tag}`, inline: true },
            { name: 'Role', value: `${targetRole.name}`, inline: true },
            { name: 'Added By', value: `${message.author.tag}`, inline: true }
          )
          .setTimestamp();
        
        message.channel.send({ embeds: [addEmbed] });
        
      } catch (error) {
        console.error('ROLE ADD ERROR:', error);
        
        if (error.code === 50001) {
          return message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('Red')
                .setTitle('❌ Missing Access')
                .setDescription(
                  `**Bot cannot assign \`${targetRole.name}\` role!**\n\n` +
                  `**Fix:** Move **bot role ABOVE** \`${targetRole.name}\` in Server Settings → Roles`
                )
            ]
          });
        }
        
        message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('Red')
              .setTitle('❌ Failed to Add Role')
              .setDescription(`Error: ${error.message}`)
          ]
        });
      }
    }
  },
};
