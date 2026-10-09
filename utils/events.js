// utils/events.js — community events (direct: "a thing to keep community active in shiro, I need events, rain events
// and etc that I manage in shiroset"; Loot.gg-style rain and roll events).
//   RAIN  — a pot of coins rains on the channel: everyone who presses Join before it ends splits it evenly.
//   ROLL  — everyone who joins rolls 1–100 when it ends; the top three take 50 / 30 / 20% of the pot.
// One live event per server, shown on one card (drawn picture, live entrant count). Paid by the house ledger
// (`creditHouse(-pot)`), anything not handed out goes back. Who may join: has played Shiro (some XP), account at least
// `minAccountDays` old, and holds the Player role when one is set — so alts can't farm a rain.
// Auto events (`auto.on`): every `auto.every` hours (±20%) one starts by itself in the events channel.
// The live event is kept in Meta (`events_live`), so a restart picks it back up (or pays it out if it ended meanwhile).
const crypto = require('crypto');
const mongoose = require('mongoose');
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder,
  AttachmentBuilder, MessageFlags, ButtonStyle,
} = require('discord.js');
const settings = require('./settings');
const { creditHouse } = require('./houseBank');
const { credit } = require('./atomicInv');
const { button, row } = require('./casino');

const META = 'events_live';
const ACCENT = { rain: 0x5DADE2, roll: 0xE67E22 };
const SPLIT = [0.5, 0.3, 0.2];
const fmt = (n) => Math.floor(n || 0).toLocaleString();
const Meta = () => mongoose.model('Meta');

function cfg() {
  return {
    channelId: null, playerRoleId: null, pingRoleId: null, minAccountDays: 7,
    auto: { on: false, every: 6, amount: 20_000, minutes: 2 }, lastAuto: 0,
    ...(settings.get('events', {}) || {}),
  };
}
async function setCfg(patch) {
  await settings.set('events', { ...cfg(), ...patch });
}

let live = null;      // { kind, pot, guildId, channelId, messageId, endsAt, by, entrants: [ids], names: {id: name} }
let timer = null;
let editTimer = null;

async function save() {
  await Meta().updateOne({ key: META }, { $set: { value: live } }, { upsert: true }).catch(() => {});
}

// ── pictures ──
function art(kind, { pot, joined, results = null, ended = false }) {
  const { createCanvas } = require('@napi-rs/canvas');
  require('./gameArt');   // registers the fonts
  const w = 760, h = 300;
  const cv = createCanvas(w, h);
  const ctx = cv.getContext('2d');
  const g = ctx.createLinearGradient(0, 0, 0, h);
  if (kind === 'rain') { g.addColorStop(0, '#0B1E3A'); g.addColorStop(1, '#04101F'); } else { g.addColorStop(0, '#3A1606'); g.addColorStop(1, '#150702'); }
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
  const rnd = (() => { let s = 7; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
  if (kind === 'rain') {
    for (let k = 0; k < 4; k++) {                  // clouds
      ctx.fillStyle = `rgba(150,170,200,${0.10 + k * 0.03})`;
      for (let j = 0; j < 6; j++) { ctx.beginPath(); ctx.arc(80 + k * 190 + j * 26, 26 + (j % 2) * 10, 34, 0, Math.PI * 2); ctx.fill(); }
    }
    for (let k = 0; k < 46; k++) {                 // falling coins, edge-on and face-on
      const x = rnd() * w, y = 50 + rnd() * (h - 70), r = 7 + rnd() * 9, sq = 0.25 + rnd() * 0.75;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() - 0.5); ctx.scale(sq, 1);
      const cg = ctx.createRadialGradient(-r * 0.3, -r * 0.3, 1, 0, 0, r);
      cg.addColorStop(0, '#FFF4C4'); cg.addColorStop(0.5, '#E9C46A'); cg.addColorStop(1, '#8A6414');
      ctx.fillStyle = cg; ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.fill();
      ctx.strokeStyle = 'rgba(255,248,214,0.6)'; ctx.lineWidth = 1.2; ctx.beginPath(); ctx.arc(0, 0, r * 0.7, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
      ctx.strokeStyle = 'rgba(233,196,106,0.18)'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(x, y - r - 2); ctx.lineTo(x, y - r - 14); ctx.stroke();
    }
  } else {
    for (let k = 0; k < 14; k++) {                 // tumbling dice in the dark
      const x = 30 + rnd() * (w - 60), y = 40 + rnd() * (h - 120), s = 18 + rnd() * 14;
      ctx.save(); ctx.translate(x, y); ctx.rotate(rnd() * 1.4 - 0.7); ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#F4F1EA'; ctx.beginPath(); ctx.roundRect(-s / 2, -s / 2, s, s, 4); ctx.fill();
      ctx.fillStyle = '#B71C1C'; const pips = 1 + Math.floor(rnd() * 6);
      for (let p = 0; p < pips; p++) { ctx.beginPath(); ctx.arc(-s / 4 + (p % 3) * s / 4, -s / 5 + Math.floor(p / 3) * s / 2.5, 2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
  }
  const v = ctx.createRadialGradient(w / 2, h / 2, 60, w / 2, h / 2, w * 0.6);
  v.addColorStop(0, 'rgba(0,0,0,0)'); v.addColorStop(1, 'rgba(0,0,0,0.6)');
  ctx.fillStyle = v; ctx.fillRect(0, 0, w, h);
  const band = ctx.createRadialGradient(w / 2, 120, 20, w / 2, 120, 300);   // a soft dark plate so the title reads
  band.addColorStop(0, 'rgba(0,0,0,0.6)'); band.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = band; ctx.fillRect(0, 0, w, h);
  const T = (s, x, y, size, color, font = 'Montserrat') => {
    ctx.font = `${size}px ${font}`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(0,0,0,0.7)'; ctx.fillText(s, x + 2, y + 2); ctx.fillStyle = color; ctx.fillText(s, x, y);
  };
  T(kind === 'rain' ? 'COIN RAIN' : 'HIGH ROLL', w / 2, 92, 48, '#FFF1B8', 'Cinzel');
  T(`${fmt(pot)} coins`, w / 2, 150, 34, '#E9C46A');
  if (results && results.length) {
    results.slice(0, 3).forEach((r, k) => {
      const x = w / 2 + (k - 1) * 230, y = 228;
      ctx.fillStyle = 'rgba(8,10,16,0.8)'; ctx.beginPath(); ctx.roundRect(x - 105, y - 30, 210, 60, 18); ctx.fill();
      ctx.strokeStyle = ['#FFD86B', '#D8DCE6', '#D08A4A'][k]; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.roundRect(x - 105, y - 30, 210, 60, 18); ctx.stroke();
      ctx.font = '18px Montserrat'; let n = r.name; while (n.length > 1 && ctx.measureText(n).width > 120) n = n.slice(0, -2) + '…';
      T(`${n}`, x - 22, y, 18, '#F2F2F5'); T(String(r.roll), x + 70, y, 26, ['#FFD86B', '#D8DCE6', '#D08A4A'][k]);
    });
  } else {
    T(ended ? `${joined} joined` : `${joined} in · press Join`, w / 2, 222, 22, '#CFE8F7');
  }
  return cv.toBuffer('image/png');
}

function view(ev, { ended = false, results = null, note = '' } = {}) {
  const joined = ev.entrants.length;
  const c = new ContainerBuilder().setAccentColor(ACCENT[ev.kind]);
  const head = ev.kind === 'rain' ? '☔ Coin Rain' : '🎲 High Roll';
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`## ${head}`));
  c.addMediaGalleryComponents(new MediaGalleryBuilder().addItems(new MediaGalleryItemBuilder().setURL('attachment://event.png')));
  let body;
  if (!ended) {
    body = (ev.kind === 'rain'
      ? `> **${fmt(ev.pot)}** coins are coming down — everyone who joins splits them evenly.\n> Right now that's **${fmt(joined ? ev.pot / joined : ev.pot)}** each.`
      : `> Join, and when it ends everyone rolls **1–100**. Top three take **50 / 30 / 20%** of **${fmt(ev.pot)}**.`)
      + `\n> **${joined}** joined · ends <t:${Math.floor(ev.endsAt / 1000)}:R>`;
  } else {
    body = note;
  }
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(body));
  if (!ended) {
    c.addSeparatorComponents(new SeparatorBuilder());
    c.addActionRowComponents(row(button('ev_join', ev.kind === 'rain' ? 'Join the rain' : 'Join the roll', ButtonStyle.Success, false, ev.kind === 'rain' ? '☔' : '🎲')));
    const req = cfg();
    c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Anyone who has played Shiro${req.playerRoleId ? ' and holds the Player role' : ''} · accounts ${req.minAccountDays}+ days old`));
  }
  return {
    components: [c], flags: MessageFlags.IsComponentsV2, attachments: [],
    files: [new AttachmentBuilder(art(ev.kind, { pot: ev.pot, joined, results, ended }), { name: 'event.png' })],
  };
}

async function channelOf(client, ev) {
  return client.channels.fetch(ev.channelId).catch(() => null);
}

/** Start an event. Returns an error string or null. */
async function start(client, { kind, pot, minutes = 2, channelId, by = 'staff' }) {
  if (live) return 'An event is already running.';
  if (!['rain', 'roll'].includes(kind)) return 'Unknown event.';
  pot = Math.floor(pot);
  if (!(pot >= 100)) return 'The pot has to be at least 100 coins.';
  minutes = Math.max(1, Math.min(30, Math.floor(minutes || 2)));
  const ch = channelId && await client.channels.fetch(channelId).catch(() => null);
  if (!ch) return 'Set the events channel first.';
  live = { kind, pot, guildId: ch.guildId, channelId: ch.id, messageId: null, endsAt: Date.now() + minutes * 60_000, by, entrants: [], names: {} };
  creditHouse(-pot, kind === 'rain' ? 'rain' : 'roll_event');   // the house funds it
  const c = cfg();
  const msg = await ch.send({ ...view(live), allowedMentions: { roles: c.pingRoleId ? [c.pingRoleId] : [] } }).catch(() => null);
  if (!msg) { creditHouse(pot, 'event_refund'); live = null; return "I couldn't post in that channel."; }
  if (c.pingRoleId) await ch.send({ content: `<@&${c.pingRoleId}> ${kind === 'rain' ? '☔ Coin rain' : '🎲 High roll'} — **${fmt(pot)}** coins!`, allowedMentions: { roles: [c.pingRoleId] } })
    .then((m) => setTimeout(() => m.delete().catch(() => {}), 60_000)).catch(() => {});
  live.messageId = msg.id;
  await save();
  arm(client);
  return null;
}

function arm(client) {
  clearTimeout(timer);
  timer = setTimeout(() => finish(client).catch((e) => console.error('event finish:', e)), Math.max(0, live.endsAt - Date.now()));
}

async function finish(client, cancelled = false) {
  if (!live) return;
  const ev = live;
  live = null;
  clearTimeout(timer); clearTimeout(editTimer);
  await Meta().deleteOne({ key: META }).catch(() => {});
  const ch = await channelOf(client, ev);
  const msg = ch && await ch.messages.fetch(ev.messageId).catch(() => null);
  let note, results = null, paidOut = 0;
  if (cancelled || !ev.entrants.length) {
    creditHouse(ev.pot, 'event_refund');
    note = cancelled ? '> Called off.' : '> Nobody joined — the pot goes back.';
  } else if (ev.kind === 'rain') {
    const share = Math.floor(ev.pot / ev.entrants.length);
    for (const uid of ev.entrants) await credit(uid, { balance: share, totalEarned: share });
    paidOut = share * ev.entrants.length;
    creditHouse(ev.pot - paidOut, 'event_refund');
    note = `> **${ev.entrants.length}** caught **${fmt(share)}** coins each.\n-# ${ev.entrants.slice(0, 40).map((u) => ev.names[u] || u).join(' · ')}${ev.entrants.length > 40 ? ' …' : ''}`;
  } else {
    results = ev.entrants.map((uid, k) => ({ uid, name: ev.names[uid] || uid, roll: crypto.randomInt(1, 101), k }))
      .sort((x, y) => y.roll - x.roll || x.k - y.k);
    const n = Math.min(3, results.length);
    const weights = n === 1 ? [1] : n === 2 ? [0.65, 0.35] : SPLIT;
    const lines = [];
    for (let k = 0; k < n; k++) {
      const prize = Math.floor(ev.pot * weights[k]);
      paidOut += prize;
      await credit(results[k].uid, { balance: prize, totalEarned: prize });
      lines.push(`> ${['🥇', '🥈', '🥉'][k]} <@${results[k].uid}> rolled **${results[k].roll}** — **${fmt(prize)}** coins`);
    }
    creditHouse(ev.pot - paidOut, 'event_refund');
    const rest = results.slice(n, 15).map((r) => `${r.name} ${r.roll}`).join(' · ');
    note = lines.join('\n') + (rest ? `\n-# ${rest}${results.length > 15 ? ' …' : ''}` : '');
  }
  if (msg) await msg.edit({ ...view(ev, { ended: true, results, note }), allowedMentions: { parse: [] } }).catch(() => {});
  else if (ch) await ch.send({ ...view(ev, { ended: true, results, note }), allowedMentions: { parse: [] } }).catch(() => {});
  try {
    const { logAdminAction } = client;
    logAdminAction?.('events', 'events', 'event', `${ev.kind} ended`, null, null, `pot ${ev.pot} · ${ev.entrants.length} joined · paid ${paidOut}`)?.catch?.(() => {});
  } catch { /* logging is best-effort */ }
}

async function eligible(interaction) {
  const c = cfg();
  const u = interaction.user;
  if (u.bot) return 'Bots can\'t join.';
  if (Date.now() - u.createdTimestamp < c.minAccountDays * 86_400_000) return `Your account has to be at least ${c.minAccountDays} days old.`;
  if (c.playerRoleId && !interaction.member?.roles?.cache?.has(c.playerRoleId)) return `You need the <@&${c.playerRoleId}> role to join.`;
  const me = await mongoose.model('User').findOne({ userId: u.id }, { xp: 1 }).lean().catch(() => null);
  if (!me || !(me.xp > 0)) return 'Play a Shiro game first — then you can join events.';
  return null;
}

/** Routed from index.js interactionCreate. Returns true if it handled the click. */
async function handleInteraction(interaction) {
  if (!interaction.isButton() || interaction.customId !== 'ev_join') return false;
  if (!live || interaction.message.id !== live.messageId) {
    await interaction.reply({ content: 'This event has ended.', ephemeral: true }).catch(() => {});
    return true;
  }
  if (live.entrants.includes(interaction.user.id)) {
    await interaction.reply({ content: "You're already in.", ephemeral: true }).catch(() => {});
    return true;
  }
  const why = await eligible(interaction);
  if (why) { await interaction.reply({ content: why, ephemeral: true, allowedMentions: { parse: [] } }).catch(() => {}); return true; }
  live.entrants.push(interaction.user.id);
  live.names[interaction.user.id] = interaction.member?.displayName || interaction.user.username;
  await interaction.reply({ content: live.kind === 'rain' ? "☔ You're in — the coins land when it ends." : "🎲 You're in — everyone rolls when it ends.", ephemeral: true }).catch(() => {});
  save();
  if (!editTimer) {   // redraw the card at most every 4s
    const client = interaction.client;
    editTimer = setTimeout(async () => {
      editTimer = null;
      if (!live) return;
      const ch = await channelOf(client, live);
      const msg = ch && await ch.messages.fetch(live.messageId).catch(() => null);
      if (msg && live) await msg.edit(view(live)).catch(() => {});
    }, 4000);
  }
  return true;
}

/** After a restart: pick up the live event (pay it out if it ended while the bot was down). */
async function resume(client) {
  const doc = await Meta().findOne({ key: META }).lean().catch(() => null);
  if (!doc || !doc.value) return;
  live = doc.value;
  if (Date.now() >= live.endsAt) return finish(client);
  arm(client);
}

/** Auto events: every `auto.every` hours (±20%), one starts in the events channel. Rain and roll alternate. */
async function tick(client) {
  const c = cfg();
  if (!c.auto.on || !c.channelId || live) return;
  const gap = c.auto.every * 3_600_000 * (0.8 + 0.4 * ((c.lastAuto % 1000) / 1000));
  if (Date.now() - (c.lastAuto || 0) < gap) return;
  const kind = c.lastKind === 'rain' ? 'roll' : 'rain';
  await setCfg({ lastAuto: Date.now(), lastKind: kind });
  const err = await start(client, { kind, pot: c.auto.amount, minutes: c.auto.minutes, channelId: c.channelId, by: 'auto' });
  if (err) console.error('auto event:', err);
}

/** Give every member holding the Player role coins or SILV (direct: "a command that lets me give all to players").
 *  Returns { n, error }. */
async function giveAll(guild, { amount, silv = false }) {
  const c = cfg();
  if (!c.playerRoleId) return { n: 0, error: 'Set the Player role first (`.shiroset` → Events).' };
  await guild.members.fetch().catch(() => null);
  const role = guild.roles.cache.get(c.playerRoleId);
  if (!role) return { n: 0, error: "That role doesn't exist any more." };
  const ids = [...role.members.values()].filter((m) => !m.user.bot).map((m) => m.id);
  for (const uid of ids) await credit(uid, silv ? { items: { 'Silv token': amount } } : { balance: amount });
  return { n: ids.length, error: null };
}

module.exports = { art, cfg, setCfg, start, finish, handleInteraction, resume, tick, giveAll, isLive: () => !!live, liveInfo: () => live };
