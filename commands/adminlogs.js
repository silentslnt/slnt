const { EmbedBuilder } = require('discord.js');
const { requireAdmin } = require('../utils/permissions');

const BLACK = 0x000000;

module.exports = {
  name: 'adminlogs',
  aliases: ['al'],
  description: 'View economy/moderation logs. `.adminlogs [command|@user]` — e.g. `.adminlogs gift`, `.adminlogs @user`',
  async execute({ message, args, AdminLog }) {
    if (!await requireAdmin(message)) return;

    try {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const query = { timestamp: { $gte: sevenDaysAgo } };
      const mentioned = message.mentions.users.first();
      const filterArg = (args[0] || '').toLowerCase();

      let filterLabel = 'all actions';
      if (mentioned) {
        query.$or = [{ adminId: mentioned.id }, { targetUserId: mentioned.id }];
        filterLabel = `involving ${mentioned.username}`;
      } else if (filterArg) {
        query.command = filterArg;
        filterLabel = `\`.${filterArg}\` only`;
      }

      const logs = await AdminLog.find(query)
        .sort({ timestamp: -1 })
        .limit(25)
        .lean();

      if (!logs || logs.length === 0) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor(BLACK)
              .setTitle('MODERATION LOGS')
              .setDescription(`> No actions recorded (${filterLabel}) in the past 7 days.`)
              .setFooter({ text: message.guild?.name || 'Shiro' }),
          ],
        });
      }

      let logText = '';
      for (const log of logs) {
        const date = new Date(log.timestamp);
        const dateStr = date.toLocaleString('en-US', {
          month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit',
        });

        const target  = log.targetUsername ? ` → **${log.targetUsername}**` : '';
        const details = log.details ? ` \`${log.details}\`` : '';

        logText += `> \`${dateStr}\` **${log.adminUsername}** used \`.${log.command}\` — ${log.action}${target}${details}\n`;
      }

      const embed = new EmbedBuilder()
        .setTitle('MODERATION LOGS')
        .setDescription(
          `-# Past 7 days — ${filterLabel}\n\n${logText}`
        )
        .setColor(BLACK)
        .setFooter({ text: `Showing ${logs.length} (max 25) — ${message.guild?.name || 'Shiro'}` });

      await message.channel.send({ embeds: [embed] });

    } catch (error) {
      console.error('Error fetching admin logs:', error);
      message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(BLACK)
            .setTitle('ERROR')
            .setDescription('Failed to retrieve logs. Check console for details.')
            .setFooter({ text: message.guild?.name || 'Shiro' }),
        ],
      });
    }
  }
};
