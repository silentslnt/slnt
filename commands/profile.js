// commands/profile.js
const { EmbedBuilder } = require('discord.js');
const { COLOR, TITLES, BADGES, PRESTIGE_RANKS } = require('../utils/config');
const { xpProgress, progressBar } = require('../utils/xp');
const { getRank, getNextRank } = require('../utils/prestige');
const { getActiveEssenceSummary } = require('../utils/essences');
const { trackStat } = require('../utils/achievements');

module.exports = {
  name: 'profile',
  aliases: ['pf', 'p'],
  adminOnly: false,
  description: 'View your profile (or another user\'s). `.pf [@user]`',

  async execute({ message, args, userData, saveUserData, getUserData }) {
    const target = message.mentions.users.first() || message.author;
    let data     = userData;
    if (target.id !== message.author.id) {
      data = await getUserData(target.id);
      if (!data) return message.channel.send('❌ That user has no profile yet.');
    } else {
      // track profile viewed
      await trackStat(userData, 'profileViewed', 1, { message, saveUserData });
    }

    const balance    = data.balance || 0;
    const silv       = data.inventory?.['Silv token'] || 0;
    const { level, current, needed } = xpProgress(data.xp || 0);
    const xpBar      = progressBar(current, needed);
    const streak     = data.dailyStreak || 0;
    const rank       = getRank(data.totalEarned || 0);
    const nextRank   = getNextRank(data.totalEarned || 0);
    const prestige   = data.prestige || 0;
    const activeEss  = getActiveEssenceSummary(data);

    // Equipped title
    const equippedTitleId = data.equippedTitle;
    const titleDisplay    = equippedTitleId && TITLES[equippedTitleId]
      ? TITLES[equippedTitleId].name
      : null;

    // Badges
    const ownedBadges = (data.unlockedBadges || [])
      .map(id => BADGES[id]?.name)
      .filter(Boolean)
      .join('  ') || '_None yet_';

    // Achievements count
    const achCount = (data.achievements || []).length;

    // Rank progress
    let rankProgress = '';
    if (nextRank) {
      const curr  = data.totalEarned || 0;
      const toGo  = nextRank.min - curr;
      const bar   = progressBar(curr - rank.min, nextRank.min - rank.min);
      rankProgress = `${bar} → **${nextRank.name}** in ${toGo.toLocaleString()} earned`;
    } else {
      rankProgress = '🏆 **Max rank reached!**';
    }

    const embed = new EmbedBuilder()
      .setTitle(`˗ˏˋ 𐙚 🪞 𝒫𝓇𝑜𝒻𝒾𝓁𝑒 — ${target.username} 𐙚 ˎˊ˗`)
      .setColor(COLOR.DEFAULT)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setDescription(
        (titleDisplay ? `✦ **${titleDisplay}**\n` : '') +
        (prestige > 0  ? `🔥 **Prestige ${prestige}**\n` : '') +
        `\n꒰ঌ Rank: **${rank.name}** ໒꒱`
      )
      .addFields(
        // ── Economy ──────────────────────────────────────────────
        {
          name: '─── 💰 Economy',
          value:
            `**Balance:** ${balance.toLocaleString()} coins\n` +
            `**SILV Tokens:** ${silv} 💎\n` +
            `**Total Earned:** ${(data.totalEarned || 0).toLocaleString()}\n` +
            `**Daily Streak:** 🔥 ${streak} days`,
          inline: false,
        },
        // ── Level / XP ───────────────────────────────────────────
        {
          name: '─── 📈 Level & XP',
          value:
            `**Level ${level}** — ${current.toLocaleString()} / ${needed.toLocaleString()} XP\n` +
            `${xpBar}`,
          inline: false,
        },
        // ── Rank Progress ────────────────────────────────────────
        {
          name: `─── ⭐ Rank: ${rank.name}`,
          value: rankProgress,
          inline: false,
        },
        // ── Badges ───────────────────────────────────────────────
        {
          name: '─── 🎖 Badges',
          value: ownedBadges,
          inline: false,
        },
        // ── Achievements ─────────────────────────────────────────
        {
          name: '─── 🏆 Achievements',
          value: `${achCount} unlocked — see \`.achievements\``,
          inline: true,
        },
        // ── Stats ────────────────────────────────────────────────
        {
          name: '─── 🎮 Stats',
          value:
            `Games Played: ${data.stats?.gamesPlayed || 0}\n` +
            `Games Won: ${data.stats?.gamesWon || 0}\n` +
            `Keys Opened: ${data.stats?.keysOpened || 0}`,
          inline: true,
        },
      )
      .setFooter({ text: `System • Profile${activeEss ? ' • Essences active' : ''}` })
      .setTimestamp();

    // Active essences panel
    if (activeEss && target.id === message.author.id) {
      embed.addFields({ name: '─── ✨ Active Essences', value: activeEss, inline: false });
    }

    // Customize subcommand
    if (args[0] === 'customize') {
      return handleCustomize({ message, args: args.slice(1), userData, saveUserData });
    }

    return message.channel.send({ embeds: [embed] });
  },
};

// ── Profile customization ─────────────────────────────────────────────────────
async function handleCustomize({ message, args, userData, saveUserData }) {
  const type = (args[0] || '').toLowerCase();
  const id   = (args[1] || '').toLowerCase();

  if (type === 'title') {
    if (!id || !TITLES[id]) return message.channel.send(`❌ Unknown title. Buy titles with \`.sh cosmetics\``);
    if (!(userData.unlockedTitles || []).includes(id)) {
      return message.channel.send(`❌ You don't own this title. Buy it with \`.sh buy ${id}\``);
    }
    userData.equippedTitle = id;
    await saveUserData({ equippedTitle: id });
    return message.channel.send(`✅ Title set to **${TITLES[id].name}**! Visible on your \`.profile\`.`);
  }

  return message.channel.send(
    '**Profile Customization**\n' +
    '`.profile customize title <id>` — Set your title\n\n' +
    'Available types: `title`'
  );
}