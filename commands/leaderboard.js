// commands/leaderboard.js
const { EmbedBuilder, ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, StringSelectMenuBuilder,
  MessageFlags } = require('discord.js');
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

// Shared by both the one-shot .lb command and livelb.js's auto-refresh.
async function buildLeaderboardEmbed(cat, client, viewerId = null) {
  const config = CATEGORIES[cat];
  if (!config) return null;

  const User = mongoose.model('User');
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
    return new EmbedBuilder().setColor(BLACK).setTitle(config.label.toUpperCase())
      .setDescription('> No data found yet.');
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

  let selfRankInfo = '';
  if (viewerId) {
    const allSorted = config.special === 'silv'
      ? (await User.find({}).lean())
          .sort((a, b) => (b.inventory?.['Silv token'] || 0) - (a.inventory?.['Silv token'] || 0))
      : await User.find({}).sort(config.sort).lean();

    const selfIdx = allSorted.findIndex(u => u.userId === viewerId);
    if (selfIdx >= 10) {
      selfRankInfo = `\n> Your rank: **#${selfIdx + 1}** — ${config.display(allSorted[selfIdx])}`;
    }
  }

  return new EmbedBuilder()
    .setTitle(config.label.toUpperCase())
    .setDescription(leaderboard + selfRankInfo)
    .setColor(BLACK)
    .setFooter({ text: `Categories: ${Object.keys(CATEGORIES).join(', ')} — .lb [category]` });
}

// ── The board card (direct: "Shiro lb needs a dropdown + decor like Silvreign's") ──────────────────────────────
const CROWN = '<:Csilvcrown:1553472614591111270>';
const HALO = '<a:cyellowhalo:1512869545100972063>';
const STAR = '<a:cwhitestar:1512498079662735461>';
const PODIUM = [CROWN, HALO, STAR];
const PLACE = ['1st', '2nd', '3rd'];
const CAT_EMOJI = { coins: '🪙', silv: '💎', streak: '🔥', level: '⭐', prestige: '🏵', earned: '📈' };

async function sortedUsers(cat, limit) {
  const User = mongoose.model('User');
  const config = CATEGORIES[cat];
  if (config.special === 'silv') {
    const q = User.find({ 'inventory.Silv token': { $gt: 0 } }).sort({ 'inventory.Silv token': -1 });
    return (limit ? q.limit(limit) : q).lean();
  }
  const q = User.find({}).sort(config.sort);
  return (limit ? q.limit(limit) : q).lean();
}

async function nameOf(client, id) {
  try { return (client.users.cache.get(id) ?? await client.users.fetch(id)).username; } catch { return `User…${String(id).slice(-4)}`; }
}

async function buildBoard(cat, client, viewerId, guildName, disabled = false) {
  const config = CATEGORIES[cat];
  const top = await sortedUsers(cat, 10);
  const c = new ContainerBuilder().setAccentColor(BLACK);
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${CAT_EMOJI[cat] || '🏆'} ${config.label}\n-# Shiro leaderboard · pick another board below`));
  c.addSeparatorComponents(new SeparatorBuilder());
  if (!top.length) {
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent('> No one on this board yet.'));
  } else {
    const names = await Promise.all(top.map((u) => nameOf(client, u.userId)));
    const podium = top.slice(0, 3).map((u, k) => `${PODIUM[k]} **${PLACE[k]} · ${names[k]}**\n-# ${config.display(u)}`).join('\n');
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### Podium\n${podium}`));
    if (top.length > 3) {
      c.addSeparatorComponents(new SeparatorBuilder());
      c.addTextDisplayComponents(new TextDisplayBuilder().setContent('### Contenders\n' + top.slice(3).map((u, k) =>
        `\`${String(k + 4).padStart(2, '0')}\` **${names[k + 3]}** — ${config.display(u)}`).join('\n')));
    }
  }
  if (viewerId) {
    const idx = top.findIndex((u) => u.userId === viewerId);
    let you = idx >= 0 ? `> You're **#${idx + 1}** on this board.` : '';
    if (idx < 0) {
      const all = await sortedUsers(cat, 500);
      const j = all.findIndex((u) => u.userId === viewerId);
      you = j >= 0 ? `> You're **#${j + 1}** — ${config.display(all[j])}` : "> You're not on this board yet.";
    }
    c.addSeparatorComponents(new SeparatorBuilder());
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### You\n${you}`));
  }
  const sel = new StringSelectMenuBuilder().setCustomId('lb_pick').setPlaceholder('Switch board…').setDisabled(disabled)
    .addOptions(Object.entries(CATEGORIES).map(([k, v]) => ({ label: v.label, value: k, emoji: CAT_EMOJI[k], default: k === cat })));
  c.addActionRowComponents(new ActionRowBuilder().addComponents(sel));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${guildName}`));
  return { components: [c], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } };
}

module.exports = {
  name: 'leaderboard',
  aliases: ['lb', 'baltop'],
  adminOnly: false,
  description: 'View server leaderboards. `.lb [coins|silv|streak|level|prestige|earned]`',
  CATEGORIES,
  buildLeaderboardEmbed,
  buildBoard,

  async execute({ message, args, client }) {
    const cat   = (args[0] || 'coins').toLowerCase();
    const config = CATEGORIES[cat];
    const guildName = message.guild?.name || 'Shiro';

    if (config) {   // one card with a board picker
      let current = cat;
      const msg = await message.channel.send(await buildBoard(current, client, message.author.id, guildName));
      const col = msg.createMessageComponentCollector({ time: 300_000 });
      col.on('collect', async (i) => {
        if (i.customId !== 'lb_pick') return;
        if (i.user.id !== message.author.id) return i.reply({ content: 'Open your own with `.lb`.', ephemeral: true }).catch(() => {});
        current = i.values[0];
        await i.deferUpdate().catch(() => {});
        await msg.edit(await buildBoard(current, client, message.author.id, guildName)).catch(() => {});
      });
      col.on('end', async () => { await msg.edit(await buildBoard(current, client, message.author.id, guildName, true)).catch(() => {}); });
      return;
    }

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
      const embed = await buildLeaderboardEmbed(cat, client, message.author.id);
      return message.channel.send({ embeds: [embed] });
    } catch (err) {
      console.error('Leaderboard error:', err);
      return message.channel.send('Failed to load leaderboard.');
    }
  },
};