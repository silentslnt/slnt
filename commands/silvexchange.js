// commands/silvexchange.js — daily-rotating coins-for-SILV exchange.
// Same appearance pattern as the Artifact Shop (random subset of the pool,
// tiny fixed stock, first-come-first-served) but resets every UTC day and
// is always open — this is the real, common, play-driven way to earn SILV
// tokens now, alongside the rare Robux purchase / 28-day streak bonus.
//
// UI matches Dank Memer's shop pattern: item cards with an inline Buy
// button each, plus ◀ ▶ pagination — not just a `.silvexchange buy <id>`
// text command (still works, kept for convenience/muscle memory).
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { SilvExchangePool, SilvExchangeDay } = require('../models/silvExchange');
const { requireWhitelisted } = require('../utils/permissions');

const SILV_KEY  = 'Silv token';
const SILV_ICON = '<:zzsilvtoken:1486364646796431427>';
const BLACK     = 0x000000;
const PAGE_SIZE = 3;

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

// ── Shared purchase logic (used by both the Buy button and the text command) ──
// Always re-fetches the buyer's CURRENT balance rather than trusting whatever
// userData was loaded when the shop message was first opened — a button can
// be clicked minutes later, after other commands may have changed it.
async function purchaseItem({ dayKey, itemId, userId, username, getUserData, saveSpecificUserData, logAdminAction }) {
  const doc = await getOrCreateDay(dayKey);
  const item = doc.items.find(i => i.itemId === itemId);
  if (!item) return { ok: false, message: "That exchange isn't in stock today." };

  const userData = await getUserData(userId);
  const coins = userData.balance || 0;
  if (coins < item.coinCost) {
    return { ok: false, message: `Not enough coins. Need **${item.coinCost.toLocaleString()}**, you have **${coins.toLocaleString()}**.` };
  }

  // Atomic, race-safe reservation — $gt: 0 guard means two concurrent buyers
  // can never both claim the last unit.
  const reserved = await SilvExchangeDay.findOneAndUpdate(
    { dayKey, 'items.itemId': itemId, 'items.remainingStock': { $gt: 0 } },
    { $inc: { 'items.$.remainingStock': -1 } },
  );
  if (!reserved) {
    return { ok: false, message: `${item.emoji} **${item.name}** just sold out — you were too slow.` };
  }

  const newBalance = coins - item.coinCost;
  const inventory = userData.inventory || {};
  inventory[SILV_KEY] = (inventory[SILV_KEY] || 0) + item.silvAmount;
  await saveSpecificUserData(userId, { balance: newBalance, inventory });

  await logAdminAction(
    userId, username, 'silvexchange', 'Silv Exchange',
    null, null, `${item.coinCost} coins for ${item.silvAmount} SILV`
  );

  return {
    ok: true,
    item,
    newSilv: inventory[SILV_KEY],
    message: `Spent **${item.coinCost.toLocaleString()}** coins for **${item.silvAmount}** ${SILV_ICON}. New SILV balance: **${inventory[SILV_KEY].toLocaleString()}**`,
  };
}

// ── Paginated card UI (Dank Memer-style: item cards + inline Buy buttons) ──

function buildEmbed(doc, page, totalPages, resetsIn, guildName) {
  const pageItems = doc.items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const embed = new EmbedBuilder()
    .setColor(BLACK)
    .setTitle('SILV EXCHANGE')
    .setDescription(`> Resets in **${resetsIn}**. Coins → SILV, first-come-first-served.`)
    .setFooter({ text: `${guildName || 'Shiro'} · Page ${page + 1}/${totalPages}` });

  for (const it of pageItems) {
    const soldOut = it.remainingStock <= 0;
    embed.addFields({
      name: `${it.emoji} ${it.name}${soldOut ? ' — SOLD OUT' : ''}`,
      value:
        `${it.description}\n` +
        `**${it.coinCost.toLocaleString()}** coins → **${it.silvAmount}** ${SILV_ICON}\n` +
        `${soldOut ? '0' : it.remainingStock}/${it.totalStock} left`,
      inline: true,
    });
  }
  return embed;
}

function buildComponents(doc, page, totalPages) {
  const pageItems = doc.items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const rows = [];

  if (pageItems.length) {
    const buyRow = new ActionRowBuilder();
    for (const it of pageItems) {
      buyRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`sx_buy_${it.itemId}`)
          .setLabel(`Buy ${it.name}`.slice(0, 80))
          .setStyle(ButtonStyle.Primary)
          .setDisabled(it.remainingStock <= 0),
      );
    }
    rows.push(buyRow);
  }

  if (totalPages > 1) {
    rows.push(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('sx_prev').setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId('sx_next').setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
    ));
  }
  return rows;
}

async function showExchange({ message, getUserData, saveSpecificUserData, logAdminAction }) {
  const dayKey = todayKey();
  const doc = await getOrCreateDay(dayKey);

  if (!doc.items.length) {
    return message.channel.send('The Silv Exchange has nothing in stock today — check back after reset.');
  }

  let page = 0;
  const totalPages = Math.ceil(doc.items.length / PAGE_SIZE);
  const guildName = message.guild?.name;

  const msg = await message.channel.send({
    embeds: [buildEmbed(doc, page, totalPages, fmtCountdown(msUntilUtcMidnight()), guildName)],
    components: buildComponents(doc, page, totalPages),
  });

  const collector = msg.createMessageComponentCollector({ time: 120000 });

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== message.author.id) {
      return interaction.reply({ content: "This isn't your shop menu — run `.silvexchange` yourself.", ephemeral: true });
    }

    if (interaction.customId === 'sx_prev' || interaction.customId === 'sx_next') {
      page = interaction.customId === 'sx_prev' ? Math.max(0, page - 1) : Math.min(totalPages - 1, page + 1);
      const freshDoc = await getOrCreateDay(dayKey);
      return interaction.update({
        embeds: [buildEmbed(freshDoc, page, totalPages, fmtCountdown(msUntilUtcMidnight()), guildName)],
        components: buildComponents(freshDoc, page, totalPages),
      });
    }

    if (interaction.customId.startsWith('sx_buy_')) {
      const itemId = interaction.customId.slice('sx_buy_'.length);
      const result = await purchaseItem({
        dayKey, itemId, userId: interaction.user.id, username: interaction.user.username,
        getUserData, saveSpecificUserData, logAdminAction,
      });
      await interaction.reply({ content: (result.ok ? '✅ ' : '') + result.message, ephemeral: true });

      const freshDoc = await getOrCreateDay(dayKey);
      await msg.edit({
        embeds: [buildEmbed(freshDoc, page, totalPages, fmtCountdown(msUntilUtcMidnight()), guildName)],
        components: buildComponents(freshDoc, page, totalPages),
      }).catch(() => {});
    }
  });

  collector.on('end', () => {
    msg.edit({ components: [] }).catch(() => {});
  });
}

async function buyExchange({ message, args, getUserData, saveSpecificUserData, logAdminAction }) {
  const dayKey = todayKey();
  const itemId = (args[0] || '').toLowerCase();
  if (!itemId) return message.channel.send('Usage: `.silvexchange buy <id>`');

  const result = await purchaseItem({
    dayKey, itemId, userId: message.author.id, username: message.author.username,
    getUserData, saveSpecificUserData, logAdminAction,
  });

  if (!result.ok) return message.channel.send(result.message);
  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(BLACK).setTitle('EXCHANGE COMPLETE')
      .setDescription(`> ${result.message}`)
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
  description: 'Daily coins-for-SILV exchange. `.silvexchange` to view (with Buy buttons), `.silvexchange buy <id>` also works.',
  async execute({ message, args, getUserData, saveSpecificUserData, logAdminAction }) {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'buy')    return buyExchange({ message, args: args.slice(1), getUserData, saveSpecificUserData, logAdminAction });
    if (sub === 'add')    return poolAdd({ message, args: args.slice(1) });
    if (sub === 'remove') return poolRemove({ message, args: args.slice(1) });
    if (sub === 'pool')   return poolList({ message });
    if (sub === 'reroll') return forceReroll({ message });
    return showExchange({ message, getUserData, saveSpecificUserData, logAdminAction });
  },
};
