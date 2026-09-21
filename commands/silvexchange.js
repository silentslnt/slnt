// commands/silvexchange.js — daily-rotating coins-for-SILV exchange.
// Same appearance pattern as the Artifact Shop (random subset of the pool,
// tiny fixed stock, first-come-first-served) but resets every UTC day and
// is always open — this is the real, common, play-driven way to earn SILV
// tokens now, alongside the rare Robux purchase / 28-day streak bonus.
const { EmbedBuilder } = require('discord.js');
const { SilvExchangePool, SilvExchangeDay } = require('../models/silvExchange');
const { requireWhitelisted } = require('../utils/permissions');

const SILV_KEY  = 'Silv token';
const SILV_ICON = '<:zzsilvtoken:1486364646796431427>';
const BLACK     = 0x000000;

function todayKey() {
  const d = new Date();
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}-${String(d.getUTCDate()).padStart(2, '0')}`;
}

function msUntilUtcMidnight() {
  const now = new Date();
  const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1));
  return next.getTime() - now.getTime();
}

function fmtCountdown(ms) {
  const totalMin = Math.ceil(ms / 60000);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h ? `${h}h ${m}m` : `${m}m`;
}

// 3-6 items roll in each day, never more than the pool has.
function rollSelection(pool) {
  const shuffled = [...pool].sort(() => Math.random() - 0.5);
  const count = Math.min(shuffled.length, 3 + Math.floor(Math.random() * 4)); // 3-6
  return shuffled.slice(0, count);
}

async function getOrCreateDay(dayKey) {
  let doc = await SilvExchangeDay.findOne({ dayKey });
  if (doc) return doc;

  const pool = await SilvExchangePool.find({ active: true });
  const chosen = rollSelection(pool);
  const items = chosen.map(p => ({
    itemId: p.itemId, name: p.name, emoji: p.emoji, description: p.description,
    coinCost: p.coinCost, silvAmount: p.silvAmount,
    remainingStock: p.stock, totalStock: p.stock,
  }));

  try {
    doc = await SilvExchangeDay.create({ dayKey, items });
  } catch (err) {
    if (err.code === 11000) return SilvExchangeDay.findOne({ dayKey });
    throw err;
  }
  return doc;
}

async function showExchange({ message }) {
  const dayKey = todayKey();
  const doc = await getOrCreateDay(dayKey);
  const resetsIn = fmtCountdown(msUntilUtcMidnight());

  if (!doc.items.length) {
    return message.channel.send('The Silv Exchange has nothing in stock today — check back after reset.');
  }

  let desc = `> Resets in **${resetsIn}**.\n\n`;
  for (const it of doc.items) {
    const soldOut = it.remainingStock <= 0;
    desc += `> ${it.emoji} **${it.name}** \`${it.itemId}\`${soldOut ? ' — **SOLD OUT**' : ''}\n`;
    desc += `> ${it.description}\n`;
    desc += `> ${it.coinCost.toLocaleString()} coins → **${it.silvAmount}** ${SILV_ICON} · ${soldOut ? '0' : it.remainingStock}/${it.totalStock} left\n\n`;
  }
  desc += `-# Buy: \`.silvexchange buy <id>\` — first-come-first-served, resets daily at 00:00 UTC.`;

  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(BLACK).setTitle('SILV EXCHANGE').setDescription(desc)
      .setFooter({ text: message.guild?.name || 'Shiro' })],
  });
}

async function buyExchange({ message, args, userData, saveUserData, logAdminAction }) {
  const dayKey = todayKey();
  const itemId = (args[0] || '').toLowerCase();
  if (!itemId) return message.channel.send('Usage: `.silvexchange buy <id>`');

  const doc = await getOrCreateDay(dayKey);
  const item = doc.items.find(i => i.itemId === itemId);
  if (!item) return message.channel.send("That exchange isn't in stock today.");

  const coins = userData.balance || 0;
  if (coins < item.coinCost) {
    return message.channel.send(`Not enough coins. Need **${item.coinCost.toLocaleString()}**, you have **${coins.toLocaleString()}**.`);
  }

  // Same atomic reservation pattern as the Artifact Shop — $gt: 0 guard means
  // two concurrent buyers can never both claim the last unit.
  const reserved = await SilvExchangeDay.findOneAndUpdate(
    { dayKey, 'items.itemId': itemId, 'items.remainingStock': { $gt: 0 } },
    { $inc: { 'items.$.remainingStock': -1 } },
  );
  if (!reserved) {
    return message.channel.send(`${item.emoji} **${item.name}** just sold out — you were too slow.`);
  }

  userData.balance = coins - item.coinCost;
  userData.inventory = userData.inventory || {};
  userData.inventory[SILV_KEY] = (userData.inventory[SILV_KEY] || 0) + item.silvAmount;
  await saveUserData({ balance: userData.balance, inventory: userData.inventory });

  await logAdminAction(
    message.author.id, message.author.username, 'silvexchange', 'Silv Exchange',
    null, null, `${item.coinCost} coins for ${item.silvAmount} SILV`
  );

  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(BLACK).setTitle('EXCHANGE COMPLETE')
      .setDescription(
        `> Spent **${item.coinCost.toLocaleString()}** coins for **${item.silvAmount}** ${SILV_ICON}.\n\n` +
        `-# New SILV balance: **${userData.inventory[SILV_KEY].toLocaleString()}**`
      )
      .setFooter({ text: message.guild?.name || 'Shiro' })],
  });
}

// ── Admin pool management (whitelist only — controls the SILV mint rate) ──

async function poolAdd({ message, args }) {
  if (!await requireWhitelisted(message)) return;
  // .silvexchange add <itemId> <coinCost> <silvAmount> <stock> "<name>" "<description>" [emoji]
  const parts = [];
  let cur = '', inQ = false;
  for (const ch of args.join(' ')) {
    if (ch === '"') { inQ = !inQ; continue; }
    if (ch === ' ' && !inQ) { if (cur) { parts.push(cur); cur = ''; } continue; }
    cur += ch;
  }
  if (cur) parts.push(cur);

  const [itemId, coinCost, silvAmount, stock, name, description, emoji] = parts;
  if (!itemId || !coinCost || !silvAmount || !stock || !name || !description) {
    return message.channel.send(
      'Usage: `.silvexchange add <id> <coinCost> <silvAmount> <stock> "<name>" "<description>" [emoji]`'
    );
  }
  await SilvExchangePool.findOneAndUpdate(
    { itemId },
    {
      itemId, name, description,
      coinCost: Number(coinCost), silvAmount: Number(silvAmount), stock: Number(stock),
      emoji: emoji || '🪙', active: true,
    },
    { upsert: true }
  );
  return message.channel.send(`Added **${name}** \`${itemId}\` to the Silv Exchange pool.`);
}

async function poolRemove({ message, args }) {
  if (!await requireWhitelisted(message)) return;
  const itemId = (args[0] || '').toLowerCase();
  if (!itemId) return message.channel.send('Usage: `.silvexchange remove <id>`');
  await SilvExchangePool.findOneAndUpdate({ itemId }, { active: false });
  return message.channel.send(`Removed \`${itemId}\` from the Silv Exchange pool.`);
}

async function poolList({ message }) {
  if (!await requireWhitelisted(message)) return;
  const pool = await SilvExchangePool.find({ active: true });
  if (!pool.length) return message.channel.send('No exchange offers in the pool yet.');
  const desc = pool.map(p =>
    `> ${p.emoji} **${p.name}** \`${p.itemId}\` — ${p.coinCost.toLocaleString()} coins → ${p.silvAmount} SILV, stock ${p.stock}/day`
  ).join('\n');
  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(BLACK).setTitle('SILV EXCHANGE POOL').setDescription(desc)],
  });
}

// Exchange is always open (no schedule gate like Artifact Shop), so "spawn
// anytime" here means forcing a fresh rotation right now instead of waiting
// for the next UTC midnight reset.
async function forceReroll({ message }) {
  if (!await requireWhitelisted(message)) return;
  const dayKey = todayKey();
  await SilvExchangeDay.deleteOne({ dayKey });
  await getOrCreateDay(dayKey);
  return message.channel.send('Silv Exchange re-rolled — use `.silvexchange` to see the new stock.');
}

module.exports = {
  name: 'silvexchange',
  aliases: ['exchange', 'sx'],
  description: 'Daily coins-for-SILV exchange. `.silvexchange` to view, `.silvexchange buy <id>` to purchase.',
  async execute({ message, args, userData, saveUserData, logAdminAction }) {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'buy')    return buyExchange({ message, args: args.slice(1), userData, saveUserData, logAdminAction });
    if (sub === 'add')    return poolAdd({ message, args: args.slice(1) });
    if (sub === 'remove') return poolRemove({ message, args: args.slice(1) });
    if (sub === 'pool')   return poolList({ message });
    if (sub === 'reroll') return forceReroll({ message });
    return showExchange({ message });
  },
};
