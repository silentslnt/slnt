const { EmbedBuilder } = require('discord.js');
const { isAdmin } = require('../utils/permissions');
const { CATEGORIES, buildLeaderboardEmbed } = require('./leaderboard.js');
const LiveLeaderboard = require('../models/liveLeaderboard.js');

module.exports = {
  name: 'livelb',
  description: 'Post a persistent auto-refreshing leaderboard (refreshes every 5 minutes). Admin only.',
  async execute({ message, args, client }) {
    if (!isAdmin(message)) {
      return message.channel.send({
        embeds: [new EmbedBuilder().setColor(0x000000).setTitle('ACCESS DENIED')
          .setDescription('> Only admins can set up a live leaderboard.')],
      });
    }

    const cat = (args[0] || 'coins').toLowerCase();
    if (!CATEGORIES[cat]) {
      return message.channel.send({
        embeds: [new EmbedBuilder().setColor(0x000000).setTitle('LIVELB — USAGE')
          .setDescription(
            `> Usage: \`.livelb <category> [#channel]\`\n\n` +
            Object.entries(CATEGORIES).map(([k, v]) => `> \`${k}\` — ${v.label}`).join('\n')
          )],
      });
    }

    const target = message.mentions.channels.first() || message.channel;
    const embed = await buildLeaderboardEmbed(cat, client);
    const msg = await target.send({ embeds: [embed] });

    await LiveLeaderboard.findOneAndUpdate(
      { category: cat },
      { category: cat, channelId: target.id, messageId: msg.id },
      { upsert: true },
    );

    if (target.id !== message.channel.id) {
      await message.channel.send(`Live **${CATEGORIES[cat].label}** leaderboard posted in ${target}, refreshes every 5 minutes.`);
    }
  },
};
