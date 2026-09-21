// commands/artifact.js — Artifact Shop: rare, time-gated, tiny-stock P2W items.
// Opens Friday 18:00 UTC -> Sunday 23:59:59 UTC each week. Only a random
// subset of the pool rolls into stock each window, and each one that does has
// a tiny fixed stock server-wide, first-come-first-served, gone once sold out
// until the pool rolls again next window.
const { EmbedBuilder } = require('discord.js');
const { ArtifactPool, ArtifactWindow, ArtifactOverride } = require('../models/artifact');
const { getWindow } = require('../utils/artifactSchedule');
const { requireWhitelisted } = require('../utils/permissions');
const { grantItem } = require('../utils/sentinelDb');

const SILV_KEY  = 'Silv token';
const SILV_ICON = '<:zzsilvtoken:1486364646796431427>';
const BLACK     = 0x000000;

function fmtCountdown(ms) {
  if (ms <= 0) return 'now';
  const totalMin = Math.ceil(ms / 60000);
  const d = Math.floor(totalMin / 1440);
  const h = Math.floor((totalMin % 1440) / 60);
  const m = totalMin % 60;
  const parts = [];
  if (d) parts.push(`${d}d`);
  if (h) parts.push(`${h}h`);
  if (!d && m) parts.push(`${m}m`);
  return parts.join(' ') || '<1m';
}

// Randomly picks how many + which artifacts from the pool roll into a window.
// 2-5 items, never more than the pool actually has.
function rollSelection(pool) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const count = Math.min(shuffled.length, 2 + Math.floor(Math.random() * 4)); // 2-5
  return shuffled.slice(0, count);
}

async function getOrCreateWindow(win) {
  let doc = await ArtifactWindow.findOne({ windowStart: win.start });
  if (doc) return doc;

  const pool = await ArtifactPool.find({ active: true });
  const chosen = rollSelection(pool);
  const items = chosen.map(a => ({
    itemId: a.itemId, name: a.name, emoji: a.emoji, description: a.description,
    priceSilv: a.priceSilv, remainingStock: a.stock, totalStock: a.stock,
    roleId: a.roleId, roleDays: a.roleDays,
  }));

  try {
    // Unique index on windowStart makes this race-safe — if two users trigger
    // generation in the same instant, the loser's insert throws E11000 and we
    // just re-fetch the winner's doc instead of rolling two different rosters.
    doc = await ArtifactWindow.create({ windowStart: win.start, windowEnd: win.end, items });
  } catch (err) {
    if (err.code === 11000) return ArtifactWindow.findOne({ windowStart: win.start });
    throw err;
  }
  return doc;
}

async function showShop({ message }) {
  const win = await getWindow();

  if (!win.isOpen) {
    const eta = fmtCountdown(win.nextStart.getTime() - Date.now());
    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(BLACK)
          .setTitle('ARTIFACT SHOP — CLOSED')
          .setDescription(
            `> The Artifact Shop is closed right now.\n\n` +
            `> Opens **Friday 6PM UTC**, closes **Sunday midnight UTC**.\n` +
            `> Next opening: **${eta}**\n\n` +
            `-# Rare artifacts, tiny stock, first-come-first-served. Not every artifact appears every week.`
          )
          .setFooter({ text: message.guild?.name || 'Shiro' }),
      ],
    });
  }

  const doc = await getOrCreateWindow(win);
  const closesIn = fmtCountdown(win.end.getTime() - Date.now());

  if (!doc.items.length) {
    return message.channel.send('The Artifact Shop is open, but nothing rolled into stock this week — check back next window.');
  }

  let desc = `> Closes in **${closesIn}**.\n\n`;
  for (const it of doc.items) {
    const soldOut = it.remainingStock <= 0;
    desc += `> ${it.emoji} **${it.name}** \`${it.itemId}\`${soldOut ? ' — **SOLD OUT**' : ''}\n`;
    desc += `> ${it.description}\n`;
    desc += `> ${it.priceSilv.toLocaleString()} ${SILV_ICON} · ${soldOut ? '0' : it.remainingStock}/${it.totalStock} left\n\n`;
  }
  desc += `-# Buy: \`.artifact buy <id>\` — first-come-first-served, no reservations.`;

  return message.channel.send({
    embeds: [
      new EmbedBuilder().setColor(BLACK).setTitle('ARTIFACT SHOP').setDescription(desc)
        .setFooter({ text: message.guild?.name || 'Shiro' }),
    ],
  });
}

async function buyArtifact({ message, args, userData, saveUserData, logAdminAction }) {
  const win = await getWindow();
  if (!win.isOpen) return message.channel.send('The Artifact Shop is closed right now.');

  const itemId = (args[0] || '').toLowerCase();
  if (!itemId) return message.channel.send('Usage: `.artifact buy <id>`');

  const doc = await getOrCreateWindow(win);
  const item = doc.items.find(i => i.itemId === itemId);
  if (!item) return message.channel.send("That artifact isn't in stock this window.");

  userData.inventory = userData.inventory || {};
  const silv = userData.inventory[SILV_KEY] || 0;
  if (silv < item.priceSilv) {
    return message.channel.send(
      `Not enough SILV. Need **${item.priceSilv.toLocaleString()}**, you have **${silv.toLocaleString()}**.`
    );
  }

  // Atomic, race-safe stock reservation — the $gt: 0 guard means two concurrent
  // buyers can never both decrement the last unit. Whoever's update lands first
  // wins; the loser's query matches nothing and modifiedCount is 0.
  const reserved = await ArtifactWindow.findOneAndUpdate(
    { windowStart: win.start, 'items.itemId': itemId, 'items.remainingStock': { $gt: 0 } },
    { $inc: { 'items.$.remainingStock': -1 } },
  );
  if (!reserved) {
    return message.channel.send(`${item.emoji} **${item.name}** just sold out — you were too slow.`);
  }

  userData.inventory[SILV_KEY] = silv - item.priceSilv;
  await saveUserData({ inventory: userData.inventory });

  if (item.roleId && message.guild) {
    try {
      const role = await message.guild.roles.fetch(item.roleId);
      if (role) await message.member.roles.add(role, `Artifact Shop: ${item.name}`);
    } catch { /* role grant is best-effort, purchase already succeeded */ }
  } else if (message.guild) {
    await grantItem(message.guild.id, message.author.id, itemId, 1);
  }

  await logAdminAction(
    message.author.id, message.author.username, 'artifact', 'Artifact Purchase',
    null, null, `${item.name} for ${item.priceSilv} SILV`
  );

  return message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(BLACK)
        .setTitle('ARTIFACT ACQUIRED')
        .setDescription(
          `> ${item.emoji} **${item.name}** is yours.\n\n` +
          `> ${item.description}\n\n` +
          `-# ${SILV_ICON} SILV spent: **${item.priceSilv.toLocaleString()}**`
        )
        .setFooter({ text: message.guild?.name || 'Shiro' }),
    ],
  });
}

// ── Admin pool management (whitelist only — this defines what money can buy) ──

async function poolAdd({ message, args }) {
  if (!await requireWhitelisted(message)) return;
  // .artifact add <itemId> <priceSilv> <stock> "<name>" "<description>" [emoji] [roleId]
  const parts = [];
  let cur = '', inQ = false;
  for (const ch of args.join(' ')) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ' ' && !inQ) { if (cur) { parts.push(cur); cur = ''; } continue; }
    cur += ch;
  }
  if (cur) parts.push(cur);

  const [itemId, priceSilv, stock, name, description, emoji, roleId] = parts;
  if (!itemId || !priceSilv || !stock || !name || !description) {
    return message.channel.send(
      'Usage: `.artifact add <id> <priceSilv> <stock> "<name>" "<description>" [emoji] [roleId]`'
    );
  }
  await ArtifactPool.findOneAndUpdate(
    { itemId },
    {
      itemId, name, description,
      priceSilv: Number(priceSilv), stock: Number(stock),
      emoji: emoji || '🏺', roleId: roleId || null, active: true,
    },
    { upsert: true }
  );
  return message.channel.send(`Added **${name}** \`${itemId}\` to the artifact pool.`);
}

async function poolRemove({ message, args }) {
  if (!await requireWhitelisted(message)) return;
  const itemId = (args[0] || '').toLowerCase();
  if (!itemId) return message.channel.send('Usage: `.artifact remove <id>`');
  await ArtifactPool.findOneAndUpdate({ itemId }, { active: false });
  return message.channel.send(`Removed \`${itemId}\` from the artifact pool (won't roll into future windows).`);
}

async function poolList({ message }) {
  if (!await requireWhitelisted(message)) return;
  const pool = await ArtifactPool.find({ active: true });
  if (!pool.length) return message.channel.send('No artifacts in the pool yet.');
  const desc = pool.map(a =>
    `> ${a.emoji} **${a.name}** \`${a.itemId}\` — ${a.priceSilv.toLocaleString()} SILV, stock ${a.stock}/window`
  ).join('\n');
  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(BLACK).setTitle('ARTIFACT POOL').setDescription(desc)],
  });
}

// ── Force open/close (whitelist — bypasses the Fri-Sun schedule entirely) ──

async function forceOpen({ message, args }) {
  if (!await requireWhitelisted(message)) return;
  const hours = Number(args[0]) || 24;
  await ArtifactOverride.findOneAndUpdate(
    { key: 'singleton' },
    { key: 'singleton', endsAt: new Date(Date.now() + hours * 60 * 60 * 1000) },
    { upsert: true },
  );
  return message.channel.send(`Artifact Shop force-opened for **${hours}h**, bypassing the normal schedule. Use \`.artifact\` to see what rolled in.`);
}

async function forceClose({ message }) {
  if (!await requireWhitelisted(message)) return;
  await ArtifactOverride.deleteOne({ key: 'singleton' });
  return message.channel.send('Artifact Shop override cleared — back to the normal Fri-Sun schedule.');
}

module.exports = {
  name: 'artifact',
  aliases: ['artifacts', 'ashop'],
  description: 'Rare weekly Artifact Shop. `.artifact` to view, `.artifact buy <id>` to purchase.',
  async execute({ message, args, userData, saveUserData, logAdminAction }) {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'buy')       return buyArtifact({ message, args: args.slice(1), userData, saveUserData, logAdminAction });
    if (sub === 'add')       return poolAdd({ message, args: args.slice(1) });
    if (sub === 'remove')    return poolRemove({ message, args: args.slice(1) });
    if (sub === 'pool')      return poolList({ message });
    if (sub === 'forceopen') return forceOpen({ message, args: args.slice(1) });
    if (sub === 'forceclose') return forceClose({ message });
    return showShop({ message });
  },
};
