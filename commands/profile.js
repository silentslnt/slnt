// commands/profile.js
const { EmbedBuilder } = require('discord.js');
const { TITLES, BADGES } = require('../utils/config');
const { xpProgress, progressBar } = require('../utils/xp');
const { getRank, getNextRank } = require('../utils/prestige');
const { getActiveEssenceSummary } = require('../utils/essences');
const { trackStat } = require('../utils/achievements');

const CHECK      = '<:check:1547659779877642360>';
const XMARK      = '<:xmark:1547659816783061153>';
const SILV_ICON  = '<:zzsilvtoken:1486364646796431427>';
const CSTAR      = '<a:cstar:1545032606603812954>';
const CSPARKLE   = '<a:csparkle:1512498380142674010>';
const BLACK      = 0x000000;

module.exports = {
  name: 'profile',
  aliases: ['pf', 'p'],
  adminOnly: false,
  description: 'View your profile (or another user\'s). `.pf [@user]`',

  async execute({ message, args, userData, saveUserData, getUserData }) {
    // Customize subcommand
    if (args[0] === 'customize') {
      return handleCustomize({ message, args: args.slice(1), userData, saveUserData });
    }

    const target = message.mentions.users.first() || message.author;
    let data     = userData;
    if (target.id !== message.author.id) {
      data = await getUserData(target.id);
      if (!data) return message.channel.send('That user has no profile yet.');
    } else {
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

    const equippedTitleId = data.equippedTitle;
    const titleDisplay    = equippedTitleId && TITLES[equippedTitleId]
      ? TITLES[equippedTitleId].name
      : null;

    const ownedBadges = (data.unlockedBadges || [])
      .map(id => BADGES[id]?.name)
      .filter(Boolean)
      .join('  ') || 'None yet';

    const achCount = (data.achievements || []).length;

    let rankProgress;
    if (nextRank) {
      const curr = data.totalEarned || 0;
      const toGo = nextRank.min - curr;
      const bar  = progressBar(curr - rank.min, nextRank.min - rank.min);
      rankProgress = `${bar} → **${nextRank.name}** in ${toGo.toLocaleString()} earned`;
    } else {
      rankProgress = 'Max rank reached';
    }

    const embed = new EmbedBuilder()
      .setTitle(`PROFILE — ${target.username.toUpperCase()}`)
      .setColor(BLACK)
      .setThumbnail(target.displayAvatarURL({ dynamic: true }))
      .setDescription(
        (titleDisplay ? `> ${CSPARKLE} **${titleDisplay}**\n` : '') +
        (prestige > 0 ? `> Prestige **${prestige}**\n` : '') +
        `> Rank: **${rank.name}**\n\n` +

        `__**Economy**__\n` +
        `> Balance: **${balance.toLocaleString()}** coins\n` +
        `> SILV Tokens: **${silv}** ${SILV_ICON}\n` +
        `> Total earned: **${(data.totalEarned || 0).toLocaleString()}**\n` +
        `> Daily streak: **${streak}** days\n\n` +

        `__**Level & XP**__\n` +
        `> **Level ${level}** — ${current.toLocaleString()}/${needed.toLocaleString()} XP\n` +
        `> ${xpBar}\n\n` +

        `__**Rank Progress**__ *(${rank.name})*\n` +
        `> ${rankProgress}\n\n` +

        `__**Badges**__\n> ${ownedBadges}\n\n` +

        `__**Achievements**__\n> ${CSTAR} **${achCount}** unlocked — see \`.achievements\`\n\n` +

        `__**Stats**__\n` +
        `> Games played: **${data.stats?.gamesPlayed || 0}** · Games won: **${data.stats?.gamesWon || 0}** · Keys opened: **${data.stats?.keysOpened || 0}**` +

        (activeEss && target.id === message.author.id
          ? `\n\n__**Active Essences**__\n${activeEss}`
          : '')
      )
      .setFooter({ text: message.guild?.name || 'Shiro' });

    return message.channel.send({ embeds: [embed] });
  },
};

// ── Profile customization ─────────────────────────────────────────────────────
async function handleCustomize({ message, args, userData, saveUserData }) {
  const type = (args[0] || '').toLowerCase();
  const id   = (args[1] || '').toLowerCase();

  if (type === 'title') {
    if (!id || !TITLES[id]) return message.channel.send(`${XMARK} Unknown title. Buy titles with \`.sh cosmetics\``);
    if (!(userData.unlockedTitles || []).includes(id)) {
      return message.channel.send(`${XMARK} You don't own this title. Buy it with \`.sh buy ${id}\``);
    }
    userData.equippedTitle = id;
    await saveUserData({ equippedTitle: id });
    return message.channel.send(`${CHECK} Title set to **${TITLES[id].name}** — visible on your \`.profile\`.`);
  }

  return message.channel.send(
    '**Profile Customization**\n' +
    '`.profile customize title <id>` — set your title\n\n' +
    'Available types: `title`'
  );
}
