// utils/weeklyLive.js — the live weekly board + chatters board (direct: "a role that pings every time it updates…
// a simple button press to be notified, press again removes it… top 10 active chatters: 1st 3 SILV, 2nd and 3rd 1,
// the rest 1k coins… I can post it in shiroset").
//
// One card shows both weekly boards (games from weeklyBoard.js, chat from WeeklyChat). It is edited silently every
// 5 minutes; when the top 3 of either board changes it is REPOSTED with a ping of the notify role — at most once per
// PING_GAP so it never spams. The week's results also ping. 🔔 Notify me (persistent `wk_ping`) toggles the role.
//
// Chat counting is spam-guarded so it can't be farmed for SILV: a message only counts if it has ≥ MIN_CHARS characters,
// isn't the same text as that player's last one, and comes ≥ CHAT_GAP after their last counted message. Bots never count.
const mongoose = require('mongoose');
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const W = require('./weeklyBoard');
const settings = require('./settings');

const MIN_CHARS = 4;
const CHAT_GAP = 15_000;
const PING_GAP = 3 * 60 * 60 * 1000;
const CHAT_PRIZES = [{ silv: 3 }, { silv: 1 }, { silv: 1 }, ...Array(7).fill({ coins: 1_000 })];

const chatSchema = new mongoose.Schema({ week: { type: Number, index: true }, userId: String, msgs: Number });
chatSchema.index({ week: 1, userId: 1 }, { unique: true });
const WeeklyChat = mongoose.models.WeeklyChat || mongoose.model('WeeklyChat', chatSchema);
const Meta = mongoose.models.Meta;

const last = new Map();   // userId -> { at, text }

function countChat(message) {
  if (message.author.bot || !message.guild) return;
  const text = (message.content || '').trim().toLowerCase();
  if (text.length < MIN_CHARS) return;
  const prev = last.get(message.author.id);
  const now = Date.now();
  if (prev && (now - prev.at < CHAT_GAP || prev.text === text)) return;
  last.set(message.author.id, { at: now, text });
  if (last.size > 5000) last.delete(last.keys().next().value);
  WeeklyChat.updateOne({ week: W.weekNo(), userId: message.author.id }, { $inc: { msgs: 1 } }, { upsert: true }).catch(() => {});
}

const topChat = (week = W.weekNo(), n = 10) => WeeklyChat.find({ week }).sort({ msgs: -1 }).limit(n).lean();
const chatPrize = (p) => (p.silv ? `${p.silv} SILV` : `${p.coins.toLocaleString()} coins`);

function cfg() { return settings.get('weeklyLive', {}) || {}; }
async function setCfg(patch) { await settings.set('weeklyLive', { ...cfg(), ...patch }); }

// custom emojis (direct: "use <:silvcrown:…> for the trophy and fitted custom emojis")
const E = {
  crown: '<:silvcrown:1553472614591111270>', silv: '<:zzsilvtoken:1486364646796431427>',
  games: '<a:ccards:1512497151417254190>', chat: '<a:cmail:1512498140417232966>',
  p1: '<a:cyellowhalo:1512869545100972063>', p2: '<a:cwhitestar:1512498079662735461>', p3: '<a:cstar:1545032606603812954>',
  clock: '<:cclock:1512497249765163159>',
};
const PLACE = [E.p1, E.p2, E.p3];
const pz = (p) => (p.silv ? `**${p.silv}** ${E.silv}` : `${p.coins.toLocaleString()} coins${p.aether ? ` + ${p.aether.toLocaleString()} Aether` : ''}`);

/** One board: podium (1–3), then 4–10 with their numbers, then one line for the prize still open below them. */
function boardLines(rows, prizes, unit) {
  const out = [];
  for (let i = 0; i < prizes.length; i++) {
    const r = rows[i];
    const mark = i < 3 ? PLACE[i] : `\`${String(i + 1).padStart(2, '0')}\``;
    if (r) out.push(`${mark} <@${r.userId}> · ${r[unit].toLocaleString()} ${unit === 'plays' ? 'plays' : 'msgs'} — ${pz(prizes[i])}`);
    else if (i < 3) out.push(`${mark} *open* — ${pz(prizes[i])}`);
  }
  const filled = Math.max(3, rows.length);
  if (filled < prizes.length) out.push(`-# ${filled + 1}th–${prizes.length}th still open · ${pz(prizes[filled])} each`);
  return out.join('\n');
}

async function render(guildName = 'Shiro') {
  const week = W.weekNo();
  const [games, chat] = await Promise.all([W.top(week), topChat(week)]);
  const ends = Math.floor(W.weekEnds(week) / 1000);
  const c = new ContainerBuilder().setAccentColor(0xC9CCD6)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## ${E.crown} Weekly boards\n-# ${E.clock} Ends <t:${ends}:R> · paid automatically · updates every 5 minutes`))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `### ${E.games} Most active players\n-# every game round of ${W.MIN_BET.toLocaleString()}+ coins is one play\n${boardLines(games, W.PRIZES, 'plays')}`))
    .addSeparatorComponents(new SeparatorBuilder())
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `### ${E.chat} Most active chatters\n-# real messages only — spam and repeats don't count\n${boardLines(chat, CHAT_PRIZES, 'msgs')}`))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('wk_ping').setLabel('Notify me').setEmoji({ id: '1512496943920713860', name: 'telephone', animated: true })
        .setStyle(ButtonStyle.Secondary)))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${guildName} · Notify me pings you when the top 3 changes · press again to stop`));
  const key = [games.slice(0, 3).map((r) => r.userId).join(','), chat.slice(0, 3).map((r) => r.userId).join(',')].join('|');
  return { payload: { components: [c], flags: MessageFlags.IsComponentsV2, allowedMentions: { parse: [] } }, key };
}

/** Post (or move) the live card to a channel. */
async function post(client, channel) {
  const old = cfg();
  const { payload, key } = await render(channel.guild?.name);
  const msg = await channel.send(payload);
  if (old.channelId && old.messageId) {
    const ch = await client.channels.fetch(old.channelId).catch(() => null);
    await ch?.messages.delete(old.messageId).catch(() => {});
  }
  await setCfg({ channelId: channel.id, messageId: msg.id, lastKey: key });
  return msg;
}

/** Repost at the bottom with a role ping (old card deleted). */
async function repostWithPing(client, why) {
  const c = cfg();
  const ch = c.channelId && await client.channels.fetch(c.channelId).catch(() => null);
  if (!ch) return;
  const { payload, key } = await render(ch.guild?.name);
  const role = c.roleId;
  const ping = role ? { content: `<@&${role}> ${why}`, allowedMentions: { roles: [role] } } : {};
  // CV2 messages can't carry `content`, so the ping is its own small message right above the card
  const pingMsg = role ? await ch.send(ping).catch(() => null) : null;
  const msg = await ch.send(payload).catch(() => null);
  if (!msg) return;
  await ch.messages.delete(c.messageId).catch(() => {});
  if (c.pingMessageId) await ch.messages.delete(c.pingMessageId).catch(() => {});
  await setCfg({ messageId: msg.id, lastKey: key, lastPingAt: Date.now(), pingMessageId: pingMsg?.id || null });
}

// Top-3 chatters role (direct: "the top 3 will get this role called crowned"): the current week's top 3 chatters
// hold it, synced on every refresh. Set in .shiroset → Games; holders tracked so dropped players lose it.
const CROWN_DEFAULT = '1488413385228812418';
async function syncCrown(client) {
  const c = cfg();
  const roleId = c.crownRoleId === undefined ? CROWN_DEFAULT : c.crownRoleId;
  if (!roleId) return;
  const ch = c.channelId && await client.channels.fetch(c.channelId).catch(() => null);
  const guild = ch?.guild || (process.env.GUILD_ID && await client.guilds.fetch(process.env.GUILD_ID).catch(() => null));
  const role = guild && (guild.roles.cache.get(roleId) || await guild.roles.fetch(roleId).catch(() => null));
  if (!role) return;
  const want = (await topChat(W.weekNo(), 3)).map((r) => r.userId);
  const had = Array.isArray(c.crownHolders) ? c.crownHolders : [];
  for (const id of had.filter((x) => !want.includes(x))) {
    const m = await guild.members.fetch(id).catch(() => null);
    if (m?.roles.cache.has(role.id)) await m.roles.remove(role, 'No longer a top 3 chatter this week').catch(() => {});
  }
  for (const id of want) {
    const m = await guild.members.fetch(id).catch(() => null);
    if (m && !m.roles.cache.has(role.id)) await m.roles.add(role, 'Top 3 chatter this week').catch(() => {});
  }
  if (want.join() !== had.join()) await setCfg({ crownHolders: want });
}

async function refresh(client) {
  await syncCrown(client).catch((e) => console.error('crown role:', e.message));
  const c = cfg();
  if (!c.channelId || !c.messageId) return;
  const ch = await client.channels.fetch(c.channelId).catch(() => null);
  if (!ch) return setCfg({ channelId: null, messageId: null });
  const { payload, key } = await render(ch.guild?.name);
  if (c.lastKey && key !== c.lastKey && key.replace('|', '') && Date.now() - (c.lastPingAt || 0) >= PING_GAP) {
    return repostWithPing(client, 'the weekly top 3 just changed.');
  }
  const msg = await ch.messages.fetch(c.messageId).catch(() => null);
  if (!msg) return setCfg({ messageId: null });   // deleted — repost from .shiroset
  await msg.edit(payload).catch(() => {});
  if (key !== c.lastKey) await setCfg({ lastKey: key });
}

/** Pay last week's chatters once (Meta claim). */
async function payChat(client, logAdminAction) {
  const week = W.weekNo() - 1;
  const claimed = await Meta.findOneAndUpdate({ key: `weekly_chat_paid_${week}` }, { $setOnInsert: { value: Date.now() } },
    { upsert: true, new: false }).catch(() => 'err');
  if (claimed) return null;
  const rows = await topChat(week);
  if (!rows.length) return null;
  const { credit } = require('./atomicInv');
  const lines = [];
  for (let i = 0; i < rows.length; i++) {
    const p = CHAT_PRIZES[i];
    if (p.silv) await credit(rows[i].userId, { items: { 'Silv token': p.silv } });
    else await credit(rows[i].userId, { balance: p.coins, totalEarned: p.coins });
    lines.push(`> **${i + 1}.** <@${rows[i].userId}> — ${rows[i].msgs.toLocaleString()} msgs · **${chatPrize(p)}**`);
    logAdminAction?.(client.user.id, 'Shiro', 'weeklychat', `Weekly chatters #${i + 1}: ${chatPrize(p)}`, rows[i].userId, rows[i].userId)?.catch?.(() => {});
  }
  return lines;
}

/** Called every 10 min: pays both boards when a week closes, posts the results, pings once. */
async function weekTick(client, logAdminAction) {
  const games = await W.payWeek(client, logAdminAction).catch((e) => { console.error('weekly board:', e.message); return null; });
  const chat = await payChat(client, logAdminAction).catch((e) => { console.error('weekly chat:', e.message); return null; });
  if (!chat) {
    if (games) await repostWithPing(client, 'last week\'s board was paid — a new week has started.').catch(() => {});
    return;
  }
  const c = cfg();
  const ch = await client.channels.fetch(c.channelId || require('./config').GAME_CHANNEL_ID).catch(() => null);
  if (ch) {
    const { card } = require('./casino');
    await ch.send({ ...card({ title: '💬 Weekly chatters — results', body: `-# Last week's most active chatters.\n${chat.join('\n')}`,
      footer: 'A new week has started' }), allowedMentions: { parse: [] } }).catch(() => {});
  }
  await repostWithPing(client, 'last week\'s boards were paid — a new week has started.').catch(() => {});
}

/** 🔔 Notify me — toggle the role. Returns true if it handled the interaction. */
async function handleInteraction(interaction) {
  if (!interaction.isButton() || interaction.customId !== 'wk_ping') return false;
  const roleId = cfg().roleId;
  const role = roleId && interaction.guild?.roles.cache.get(roleId);
  if (!role) {
    await interaction.reply({ content: 'Leaderboard pings aren\'t set up yet — staff can make the ping role in `.shiroset` → Games.', flags: MessageFlags.Ephemeral });
    return true;
  }
  const member = interaction.member;
  try {
    if (member.roles.cache.has(role.id)) {
      await member.roles.remove(role, 'Leaderboard pings: off');
      await interaction.reply({ content: '🔕 You won\'t be pinged about the weekly boards any more.', flags: MessageFlags.Ephemeral });
    } else {
      await member.roles.add(role, 'Leaderboard pings: on');
      await interaction.reply({ content: `🔔 You'll be pinged (${role}) when the weekly top 3 changes and when prizes are paid. Press again to stop.`,
        flags: MessageFlags.Ephemeral, allowedMentions: { parse: [] } });
    }
  } catch {
    await interaction.reply({ content: 'I couldn\'t change that role — my role needs to be above it.', flags: MessageFlags.Ephemeral }).catch(() => {});
  }
  return true;
}

module.exports = { syncCrown, CROWN_DEFAULT, boardLines, countChat, topChat, render, post, refresh, weekTick, handleInteraction, cfg, setCfg, CHAT_PRIZES, chatPrize };
