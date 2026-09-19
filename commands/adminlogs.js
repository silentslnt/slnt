const { EmbedBuilder } = require('discord.js');
const { requireAdmin } = require('../utils/permissions');

module.exports = {
  name: 'adminlogs',
  aliases: ['al'],
  description: 'View admin command logs from the past 7 days (Admin only)',
  async execute({ message, AdminLog, client }) {
    if (!await requireAdmin(message)) return;

    try {
      // Get logs from past 7 days
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

      const logs = await AdminLog.find({
        timestamp: { $gte: sevenDaysAgo }
      })
        .sort({ timestamp: -1 })
        .limit(50)
        .lean();

      if (!logs || logs.length === 0) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#F5E6FF')
              .setTitle('📋 𝔄𝔡𝔪𝔦𝔫 𝕃𝕠𝕘𝕤')
              .setDescription('No admin actions recorded in the past 7 days.')
              .setFooter({ text: 'System • Log Viewer' })
              .setTimestamp()
          ]
        });
      }

      // Group logs into chunks of 10 for better readability
      const logsPerPage = 10;
      const totalPages = Math.ceil(logs.length / logsPerPage);
      const firstPageLogs = logs.slice(0, logsPerPage);

      // Build log entries
      let logText = '';
      for (const log of firstPageLogs) {
        const date = new Date(log.timestamp);
        const dateStr = date.toLocaleString('en-US', {
          month: 'short',
          day: 'numeric',
          hour: '2-digit',
          minute: '2-digit'
        });

        const target = log.targetUsername ? ` → **${log.targetUsername}**` : '';
        const details = log.details ? ` \`${log.details}\`` : '';

        logText += `\`${dateStr}\` **${log.adminUsername}** used \`.${log.command}\` - ${log.action}${target}${details}\n`;
      }

      const embed = new EmbedBuilder()
        .setTitle('✧˚₊‧ 📋 𝔄𝔡𝔪𝔦𝔫 ℂ𝔬𝔪𝔪𝔞𝔫𝔡 𝕃𝕠𝕘𝕤 ‧₊˚✧')
        .setDescription(
          [
            '꒰ঌ 𝔓𝔞𝔰𝔱 𝟟 𝔡𝔞𝔶𝔰 𝔬𝔣 𝔞𝔠𝔱𝔦𝔬𝔫𝔰 ໒꒱',
            '',
            logText || 'No logs to display'
          ].join('\n')
        )
        .setColor('#F5E6FF')
        .setFooter({
          text: `Page 1/${totalPages} • Showing ${firstPageLogs.length} of ${logs.length} logs`
        })
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });

    } catch (error) {
      console.error('Error fetching admin logs:', error);
      message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F5E6FF')
            .setTitle('✧˚₊‧ ❌ 𝔈𝔯𝔯𝔬𝔯 ‧₊˚✧')
            .setDescription('Failed to retrieve admin logs. Check console for details.')
            .setFooter({ text: 'System • Internal Error' })
        ]
      });
    }
  }
};
