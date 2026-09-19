// commands/leaderboard.js
const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const { levelFromXP } = require('../utils/xp');

const BLACK = 0x000000;
const MEDAL = ['🥇', '🥈', '🥉'];

const CATEGORIES = {
  coins:    { label: 'Richest Users',      sort: { balance: -1 },      display: u => `${u.balance?.toLocaleString() || 0} coins`    },
  silv:     { label: 'SILV Token Holders', sort: {},                   display: u => `${(u.inventory?.['Silv token'] || 0)} SILV`,  special: 'silv'  },
  streak:   { label: 'Longest Streaks',    sort: { dailyStreak: -1 },  display: u => `${u.dailyStreak || 0} days`                   },
  level:    { label: 'Highest Level',      sort: { xp: -1 },           display: u => `Level ${levelFromXP(u.xp || 0)}`              },
  prestige: { label: 'Most Prestigious',   sort: { prestige: -1 },     display: u => `Prestige ${u.prestige || 0}`                  },
  earned:   { label: 'Lifetime Earners',   sort: { totalEarned: -1 },  display: u => `${(u.totalEarned || 0).toLocaleString()} earned` },
};

module.exports = {
  name: 'leaderboard',
  aliases: ['lb', 'baltop'],
  adminOnly: false,
  description: 'View server leaderboards. `.lb [coins|silv|streak|level|prestige|earned]`',

  async execute({ message, args, client }) {
    const cat   = (args[0] || 'coins').toLowerCase();
    const config = CATEGORIES[cat];

    if (!config) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor(BLACK)
            .setTitle('LEADERBOARD CATEGORIES')
            .setDescription(
              Object.entries(CATEGORIES).map(([k, v]) => `> \`${k}\` — ${v.label}`).join('\n')
            )
            .setFooter({ text: 'Usage: .lb [category]' }),
        ],
      });
    }

    try {
      const User     = mongoose.model('User');
      let topUsers;

      if (config.special === 'silv') {
        // SILV is in inventory so sort in JS
        const allUsers = await User.find({}).lean();
        topUsers = allUsers
          .map(u => ({ ...u, _silvCount: (u.inventory?.['Silv token'] || 0) }))
          .sort((a, b) => b._silvCount - a._silvCount)
          .slice(0, 10);
      } else {
        topUsers = await User.find({}).sort(config.sort).limit(10).lean();
      }

      if (!topUsers || topUsers.length === 0) {
        return message.channel.send('꒰ঌ No data found yet ໒꒱');
      }

      let leaderboard = '';
      for (let i = 0; i < topUsers.length; i++) {
        const user   = topUsers[i];
        const rank   = i + 1;
        let username = 'Unknown';
        try {
          const fetched = client.users.cache.get(user.userId) ?? await client.users.fetch(user.userId);
          username = fetched.username;
        } catch {
          username = `User…${user.userId.slice(-4)}`;
        }

        const value = config.display(user);
        const badge = rank <= 3 ? MEDAL[i] : `\`#${rank}\``;
        leaderboard += `> ${badge} **${username}** — ${value}\n`;
      }

      // Caller's own rank
      const allSorted = config.special === 'silv'
        ? (await User.find({}).lean())
            .sort((a, b) => (b.inventory?.['Silv token'] || 0) - (a.inventory?.['Silv token'] || 0))
        : await User.find({}).sort(config.sort).lean();

      const selfIdx  = allSorted.findIndex(u => u.userId === message.author.id);
      let selfRankInfo = '';
      if (selfIdx >= 10) {
        const selfData = allSorted[selfIdx];
        selfRankInfo   = `\n> Your rank: **#${selfIdx + 1}** — ${config.display(selfData)}`;
      }

      const embed = new EmbedBuilder()
        .setTitle(config.label.toUpperCase())
        .setDescription(leaderboard + selfRankInfo)
        .setColor(BLACK)
        .setFooter({ text: `Categories: ${Object.keys(CATEGORIES).join(', ')} — .lb [category]` });

      return message.channel.send({ embeds: [embed] });

    } catch (err) {
      console.error('Leaderboard error:', err);
      return message.channel.send('Failed to load leaderboard.');
    }
  },
};