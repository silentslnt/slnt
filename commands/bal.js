// commands/bal.js — the Shiro profile card (direct: "like the ,race card… a profile interface: their balance,
// a button to see their history of games, winnings, losses and any other needed thing"). One CV2 card with tabs:
// Overview · Game history · Stats · Bag. Anyone can look at anyone (`.bal @user`); only the one who opened it
// switches tabs.
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, SectionBuilder, ThumbnailBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const { xpProgress, progressBar } = require('../utils/xp');
const { getRank, getNextRank } = require('../utils/prestige');
const { playerHistory } = require('../utils/houseBank');
const { historyCard } = require('./history');

const SILV_ICON  = '<:zzsilvtoken:1486364646796431427>';
const WHITESWIRL = '<a:cwhiteswirl:1512869492492079184>';
const CSTAR      = '<a:cstar:1545032606603812954>';
const BLACK      = 0x000000;
const TABS = [['overview', 'Overview'], ['profile', 'Profile'], ['history', 'Game history'], ['stats', 'Stats'], ['bag', 'Bag']];
const KEY_TIERS = ['Common', 'Uncommon', 'Rare', 'Legendary', 'Mythical', 'Prismatic'];

const fmt = (n) => Math.round(n || 0).toLocaleString();
const signed = (n) => `${n < 0 ? '−' : '+'}${Math.abs(Math.round(n)).toLocaleString()}`;

function tabRow(tab, disabled = false) {
  return new ActionRowBuilder().addComponents(...TABS.map(([id, label]) => new ButtonBuilder()
    .setCustomId(`prof_${id}`).setLabel(label).setDisabled(disabled)
    .setStyle(id === tab ? ButtonStyle.Primary : ButtonStyle.Secondary)));
}

async function body(tab, target, data, own = false) {
  if (tab === 'profile') {   // what .profile shows (direct: "shouldn't .profile be on the bal card")
    const { TITLES, BADGES } = require('../utils/config');
    const rank = getRank(data.totalEarned || 0);
    const next = getNextRank ? getNextRank(data.totalEarned || 0) : null;
    const title = data.equippedTitle && TITLES[data.equippedTitle] ? TITLES[data.equippedTitle].name : null;
    const badges = (data.unlockedBadges || []).map((id) => BADGES[id]?.name).filter(Boolean).join('  ');
    let ess = '';
    try { ess = own ? require('../utils/essences').getActiveEssenceSummary(data) : ''; } catch { ess = ''; }
    const rp = next ? `${progressBar((data.totalEarned || 0) - rank.min, next.min - rank.min, 12)} → **${next.name}** in ${fmt(next.min - (data.totalEarned || 0))} earned`
      : 'Max rank reached';
    return [
      title ? `## ✨ ${title}` : '## No title equipped',
      (data.prestige || 0) > 0 ? `> Prestige **${data.prestige}**` : '',
      `> ${WHITESWIRL} Rank **${rank.name}**`,
      `> ${rp}`,
      '',
      '__**Badges**__',
      `> ${badges || 'None yet'}`,
      '',
      `__**Achievements**__ \`${(data.achievements || []).length}\` — \`.achievements\``,
      ess ? `\n__**Active essences**__\n${ess}` : '',
      '-# Change your title and badges with `.pf customize`.',
    ].filter((x) => x !== '').join('\n');
  }
  if (tab === 'overview') {
    const { level, current, needed } = xpProgress(data.xp || 0);
    const rank = getRank(data.totalEarned || 0);
    const next = getNextRank ? getNextRank(data.totalEarned || 0) : null;
    const silv = data.inventory?.['Silv token'] || 0;
    const rounds = await playerHistory(target.id, 200);
    const net = rounds.reduce((t, r) => t + (r.payout - r.bet), 0);
    const won = rounds.filter((r) => r.payout > r.bet).length;
    return [
      `# ${fmt(data.balance)} coins`,
      `> ${SILV_ICON} **${silv}** SILV *(= ${silv * 10} Robux)*`,
      `> ${CSTAR} Level **${level}** · ${WHITESWIRL} Rank **${rank.name}**` + (next && next.name ? ` · next **${next.name}**` : ''),
      `> 🔥 Daily streak **${data.dailyStreak || 0}** · 💰 Total earned **${fmt(data.totalEarned)}**`,
      '',
      `__**XP**__ *(Lv ${level})*`,
      `> ${progressBar(current, needed, 12)} ${current}/${needed}`,
      `-# Max bet **${fmt(require('../utils/parseBet').maxBetFor(data))}** — +10,000 every 10 levels (next at level ${(Math.floor(level / 10) + 1) * 10})`,
      '',
      '__**Games (last 200 rounds)**__',
      rounds.length
        ? `> **${signed(net)}** net · ${rounds.length} played · ${won} won (${Math.round((won / rounds.length) * 100)}%)`
        : '> No games yet.',
      '-# Game history shows every round — wins, losses and how each game treats you.',
    ].join('\n');
  }
  if (tab === 'stats') {
    const st = data.stats || {};
    const lines = [
      ['Games played', st.gamesPlayed], ['Games won', st.gamesWon], ['Coins won', st.coinsWon],
      ['Natural blackjacks', st.blackjack21], ['Keys opened', st.keysOpened], ['Daily claims', st.dailyClaims],
      ['Coins gifted', st.coinsGifted], ['Trades', st.tradesCompleted],
    ].filter(([, v]) => v).map(([k, v]) => `> ${k}: **${fmt(v)}**`);
    return ['## 📊 Stats', lines.join('\n') || '> Nothing yet.', '',
      `__**Achievements**__ \`${(data.achievements || []).length}\``,
      (data.achievements || []).slice(-8).map((a) => `> 🏅 ${typeof a === 'string' ? a : a.name || a.id}`).join('\n') || '> None yet.'].join('\n');
  }
  const inv = data.inventory || {};
  const keys = KEY_TIERS.filter((k) => inv[k]).map((k) => `> 🔑 ${k} key ×**${inv[k]}**`);
  const items = Object.entries(inv).filter(([k, v]) => !KEY_TIERS.includes(k) && k !== 'Silv token' && typeof v === 'number' && v > 0)
    .map(([k, v]) => `> ${k} ×**${v}**`);
  const chars = (data.characters || []).length;
  return ['## 🎒 Bag', `> ${SILV_ICON} SILV ×**${inv['Silv token'] || 0}**`, ...keys, ...items,
    chars ? `> 🃏 Characters **${chars}**` : '', (keys.length || items.length) ? '' : '> Nothing else yet.'].filter((x) => x !== '').join('\n');
}

// The wallet's own buttons (direct: "bal is basically the player's wallet — payout and other needed buttons there too").
// Only on your own card; each runs the real command for you.
function walletRow(disabled) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('bal_play').setLabel('Play').setEmoji('🎲').setStyle(ButtonStyle.Success).setDisabled(disabled),
    new ButtonBuilder().setCustomId('bal_convert').setLabel('Convert').setEmoji('💎').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('bal_payout').setLabel('Payout').setEmoji('💸').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('bal_daily').setLabel('Daily').setEmoji('📅').setStyle(ButtonStyle.Secondary).setDisabled(disabled),
    new ButtonBuilder().setCustomId('bal_recruits').setLabel('Recruits').setEmoji('🤝').setStyle(ButtonStyle.Secondary).setDisabled(disabled));
}

async function profile(tab, target, data, guild, disabled = false, own = false) {
  if (tab === 'history') return historyCard(target, null, guild, [tabRow(tab, disabled)]);
  const c = new ContainerBuilder().setAccentColor(BLACK)
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${target.username}\n-# Shiro profile`))
      .setThumbnailAccessory(new ThumbnailBuilder().setURL(target.displayAvatarURL({ dynamic: true }))))
    .addActionRowComponents(tabRow(tab, disabled))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(await body(tab, target, data, own)));
  if (own) c.addSeparatorComponents(new SeparatorBuilder()).addActionRowComponents(walletRow(disabled))
    .addActionRowComponents(new ActionRowBuilder().addComponents(   // the server's top players, one click away
      new ButtonBuilder().setCustomId('bal_leaderboard').setLabel('Top players').setEmoji('🏆').setStyle(ButtonStyle.Secondary).setDisabled(disabled)));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${guild}${own ? ' · only you can use these buttons' : ''}`));
  return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

module.exports = {
  name: 'bal',
  aliases: ['balance', 'b', 'coins'],
  adminOnly: false,
  description: 'Your Shiro profile — balance, SILV, level, game history, stats, bag. `.bal [@user]`',

  async execute({ message, userData, getUserData }) {
    const target = message.mentions.users.first() || message.author;
    let data = userData;
    if (target.id !== message.author.id) {
      data = await getUserData(target.id);
      if (!data) return message.channel.send('No data for that user.');
    }
    const guild = message.guild?.name || 'Shiro';
    const own = target.id === message.author.id;
    const msg = await message.channel.send(await profile('overview', target, data, guild, false, own));
    const collector = msg.createMessageComponentCollector({ time: 300_000 });
    collector.on('collect', async (i) => {
      if (i.user.id !== message.author.id) {
        return i.reply({ content: 'Open your own with `.bal`.', ephemeral: true }).catch(() => {});
      }
      if (i.customId === 'bal_recruits') {   // who you brought in, and what their wins have paid you
        const RB = require('../utils/referralBonus');
        const fresh = await getUserData(target.id);
        const rows = await RB.recruits(target.id);
        const from = fresh.refFrom || {};
        const list = rows.map((r) => `> <@${r.invitee_id}> — \`${fmt(from[String(r.invitee_id)] || 0)}\` coins`).join('\n');
        const c = new ContainerBuilder().setAccentColor(BLACK).addTextDisplayComponents(new TextDisplayBuilder().setContent(
          `## 🤝 Your recruits\n> Earned from their wins: **${fmt(fresh.refEarned || 0)}** coins\n`
          + `-# You get ${Math.round(RB.pct() * 100)}% of every win your validated recruits make in Shiro — paid by Shiro, never taken from them.\n\n`
          + (list || '> No validated recruits yet. Invite people to the server — once they really play Silvreign, they count.')));
        return i.reply({ components: [c], flags: MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral, allowedMentions: { parse: [] } }).catch(() => {});
      }
      if (i.customId.startsWith('bal_')) {
        await i.deferUpdate().catch(() => {});
        const cmd = i.customId.slice(4);
        await i.client.runAs?.(i, cmd, [], { private: cmd !== 'play' && cmd !== 'leaderboard' });   // Convert/Payout/Daily open privately — no channel flood
        const fresh = await getUserData(target.id);
        return msg.edit(await profile('overview', target, fresh, guild, false, own)).catch(() => {});
      }
      const tab = i.customId.replace('prof_', '');
      const fresh = await getUserData(target.id);
      await i.update(await profile(tab, target, fresh, guild, false, own)).catch(() => {});
    });
    collector.on('end', async () => {
      const fresh = await getUserData(target.id).catch(() => data);
      await msg.edit(await profile('overview', target, fresh || data, guild, true, own)).catch(() => {});
    });
  },
};
