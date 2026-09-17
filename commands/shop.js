// commands/shop.js
const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const {
  ESSENCES, TITLES, BADGES, BUNDLES, UTILITY_ITEMS,
  COLOR,
} = require('../utils/config');
const { activateEssence } = require('../utils/essences');
const { trackStat, checkAchievements } = require('../utils/achievements');
const { awardPoints } = require('../utils/sentinelDb');

const SILV_KEY  = 'Silv token';
const SILV_ICON = '<:SILV_TOKEN:1447678878448484555>';

// Aether packs — spend Shiro coins to earn community points in Sentinel
const AETHER_PACKS = {
  aether_100:  { label: '100 Aether',    coins: 5_000,   pts: 100  },
  aether_500:  { label: '500 Aether',    coins: 22_000,  pts: 500  },
  aether_1000: { label: '1,000 Aether',  coins: 40_000,  pts: 1000 },
  aether_5000: { label: '5,000 Aether',  coins: 175_000, pts: 5000 },
};

// ── Dynamic shop items (DB-backed) ────────────────────────────────────────────
const shopItemSchema = new mongoose.Schema({
  itemId:      { type: String, required: true },
  name:        { type: String, required: true },
  category:    { type: String, required: true },
  priceCoins:  { type: Number, default: 0 },
  priceSilv:   { type: Number, default: 0 },
  spawnChance: { type: Number, default: 100 },
  roleId:      { type: String, default: null },
  roleDays:    { type: Number, default: 0 },
});

const ShopItem = mongoose.models.ShopItem || mongoose.model('ShopItem', shopItemSchema);

// ── Shop cache ────────────────────────────────────────────────────────────────
let shopCache = { lastRollTime: 0, itemsByCategory: {} };
const SHOP_REFRESH_MS = 4 * 60 * 60 * 1000;

// ── Admin check ───────────────────────────────────────────────────────────────
const { isAdmin } = require('../utils/permissions');

// ── parseQuotedArgs ───────────────────────────────────────────────────────────
function parseQuotedArgs(str) {
  const parts = [];
  let cur = '', inQ = false;
  for (const ch of str) {
    if (ch === '"') { inQ = !inQ; }
    else if (ch === ' ' && !inQ) { if (cur) { parts.push(cur); cur = ''; } }
    else { cur += ch; }
  }
  if (cur) parts.push(cur);
  return parts;
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  name: 'shop',
  aliases: ['sh', 'store'],
  adminOnly: false,
  description: 'Browse and buy from the shop. `.sh [section] [buy <id>]`',

  async execute({ message, args, userData, saveUserData }) {
    const sub = (args[0] || '').toLowerCase();

    // Admin-only dynamic item management
    if (sub === 'add')    return isAdmin(message) ? handleAddItem({ message, args: args.slice(1) }) : deny(message);
    if (sub === 'remove') return isAdmin(message) ? handleRemoveItem({ message, args: args.slice(1) }) : deny(message);

    if (sub === 'buy')    return handleBuy({ message, args: args.slice(1), userData, saveUserData });
    if (sub === 'essences' || sub === 'ess') return showEssenceShop({ message });
    if (sub === 'bundles' || sub === 'bun')  return showBundleShop({ message });
    if (sub === 'cosmetics' || sub === 'cos') return showCosmeticsShop({ message });
    if (sub === 'utility' || sub === 'util') return showUtilityShop({ message });
    if (sub === 'aether' || sub === 'ae')    return showAetherShop({ message, userData });
    return showMainShop({ message });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
//  SHOW SECTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function showMainShop({ message }) {
  const embed = new EmbedBuilder()
    .setColor(COLOR.SHOP)
    .setTitle('˗ˏˋ 𐙚 🛍 𝕂𝕆ℕ  𝕊𝕙𝕠𝕡 𐙚 ˎˊ˗')
    .setDescription(
      '╭─────────────────────────────╮\n' +
      `│  1 ${SILV_ICON} SILV = 10 Robux  │\n` +
      '╰─────────────────────────────╯\n\n' +
      '꒰ঌ Browse each section or buy directly ໒꒱\n\n' +
      `**Sections:**\n` +
      `✨ \`.sh essences\` — Active boosts (SILV)\n` +
      `🎁 \`.sh bundles\`  — Value packs (SILV)\n` +
      `🎨 \`.sh cosmetics\`— Titles & Badges (SILV)\n` +
      `🛠 \`.sh utility\`  — Utility items (coins)\n` +
      `✦ \`.sh aether\`   — Aether packs (coins)\n` +
      `🗃 \`.sh items\`    — Admin-added items\n\n` +
      `**Buying:** \`.sh buy <item_id> [amount]\``
    )
    .setThumbnail(message.guild.iconURL())
    .addFields(
      { name: `${SILV_ICON} Your SILV`, value: `**${userData_silv(message) || '?'}**`, inline: true },
      { name: '💰 Your Coins', value: `**(use .bal)**`, inline: true },
    )
    .setFooter({ text: 'Shop refreshes every 4 hours' })
    .setTimestamp();
  return message.channel.send({ embeds: [embed] });
}

function userData_silv(message) { return '(see .inv)'; }

async function showEssenceShop({ message }) {
  let desc = '꒰ঌ Essences grant powerful temporary buffs ໒꒱\n꒰ঌ Activated immediately on purchase ໒꒱\n\n';
  for (const [id, e] of Object.entries(ESSENCES)) {
    desc += `${e.emoji} **${e.name}** \`${id}\`\n`;
    desc += `> **Effect:** ${e.effect}\n`;
    desc += `> **Duration:** ${formatMs(e.durationMs)}\n`;
    desc += `> **Cost:** ${e.silvCost} ${SILV_ICON}\n\n`;
  }
  return message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR.ESSENCE)
        .setTitle('˗ˏˋ 𐙚 ✨ 𝔈𝔰𝔰𝔢𝔫𝔠𝔢 𝔖𝔥𝔬𝔭 𐙚 ˎˊ˗')
        .setDescription(desc)
        .setFooter({ text: `Buy: .sh buy <essence_id>  |  e.g. .sh buy luck_essence` }),
    ],
  });
}

async function showBundleShop({ message }) {
  let desc = '꒰ঌ Bundles offer massive value for SILV ໒꒱\n\n';
  for (const [id, b] of Object.entries(BUNDLES)) {
    desc += `🎁 **${b.name}** \`${id}\`\n`;
    desc += `> ${b.description}\n`;
    desc += `> **Cost:** ${b.silvCost} ${SILV_ICON}\n\n`;
  }
  return message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR.WIN)
        .setTitle('˗ˏˋ 𐙚 🎁 𝔅𝔲𝔫𝔡𝔩𝔢 𝔖𝔥𝔬𝔭 𐙚 ˎˊ˗')
        .setDescription(desc)
        .setFooter({ text: `Buy: .sh buy <bundle_id>  |  e.g. .sh buy lucky_bundle` }),
    ],
  });
}

async function showCosmeticsShop({ message }) {
  let titleLines = '';
  for (const [id, t] of Object.entries(TITLES)) {
    titleLines += `> **${t.name}** \`${id}\` — ${t.silvCost} ${SILV_ICON}\n`;
  }
  let badgeLines = '';
  for (const [id, b] of Object.entries(BADGES)) {
    badgeLines += `> **${b.name}** \`${id}\` — ${b.silvCost} ${SILV_ICON}\n`;
  }
  return message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor('#E879F9')
        .setTitle('˗ˏˋ 𐙚 🎨 ℭ𝔬𝔰𝔪𝔢𝔱𝔦𝔠𝔰 𝔖𝔥𝔬𝔭 𐙚 ˎˊ˗')
        .setDescription(
          '꒰ঌ Show off your style ໒꒱\n\n' +
          '**Titles** (shown on `.profile`)\n' + titleLines + '\n' +
          '**Badges** (shown on `.profile`)\n' + badgeLines
        )
        .setFooter({ text: `Buy: .sh buy <item_id>  |  Equip: .profile customize title <id>` }),
    ],
  });
}

async function showUtilityShop({ message }) {
  let desc = '꒰ঌ Useful consumable items (bought with coins) ໒꒱\n\n';
  for (const [id, item] of Object.entries(UTILITY_ITEMS)) {
    desc += `${item.emoji} **${item.name}** \`${id}\`\n`;
    desc += `> ${item.description}\n`;
    desc += `> **Cost:** ${item.coinCost.toLocaleString()} 💰\n\n`;
  }
  return message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor(COLOR.DEFAULT)
        .setTitle('˗ˏˋ 𐙚 🛠 𝕌𝕥𝕚𝕝𝕚𝕥𝕪 𝔖𝔥𝔬𝔭 𐙚 ˎˊ˗')
        .setDescription(desc)
        .setFooter({ text: `Buy: .sh buy <item_id>  |  e.g. .sh buy insurance_slip` }),
    ],
  });
}

async function showAetherShop({ message, userData }) {
  const coins = userData.balance || 0;
  let desc = `꒰ঌ Convert Shiro coins into **Aether** — your community standing in SILV ໒꒱\n\n💰 Your coins: **${coins.toLocaleString()}**\n\n`;
  for (const [id, p] of Object.entries(AETHER_PACKS)) {
    const bonus = id === 'aether_100' ? '' : id === 'aether_500' ? ' *(+12% value)*' : id === 'aether_1000' ? ' *(+25% value)*' : ' *(+30% value)*';
    desc += `✦ **${p.label}** \`${id}\`\n> **Cost:** ${p.coins.toLocaleString()} coins${bonus}\n\n`;
  }
  desc += `Use \`.sh buy <pack_id>\` to convert.`;
  return message.channel.send({
    embeds: [
      new EmbedBuilder()
        .setColor('#c5edff')
        .setTitle('˗ˏˋ 𐙚 ✦ Aether Exchange 𐙚 ˎˊ˗')
        .setDescription(desc)
        .setFooter({ text: 'Aether builds your clan rank and race standing in SILV' }),
    ],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  BUY HANDLER
// ─────────────────────────────────────────────────────────────────────────────
async function handleBuy({ message, args, userData, saveUserData }) {
  const itemId = (args[0] || '').toLowerCase();
  let amount = Math.max(1, parseInt(args[1] || '1', 10) || 1);
  if (!itemId) return message.channel.send('Usage: `.sh buy <item_id> [amount]`');

  userData.inventory = userData.inventory || {};
  const silv         = userData.inventory[SILV_KEY] || 0;
  const coins        = userData.balance || 0;

  // ── AETHER PACK ──────────────────────────────────────────────────────────
  if (AETHER_PACKS[itemId]) {
    const pack = AETHER_PACKS[itemId];
    if (coins < pack.coins) return notEnoughCoins(message, pack.coins, coins);
    if (!message.guild) return message.channel.send('❌ Must be used in a server.');

    userData.balance = coins - pack.coins;
    await saveUserData({ balance: userData.balance });
    await awardPoints(message.guild.id, message.author.id, pack.pts);

    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#c5edff')
          .setTitle('˗ˏˋ 𐙚 ✦ Aether Acquired 𐙚 ˎˊ˗')
          .setDescription(
            `꒰ঌ **+${pack.pts.toLocaleString()} Aether** added to your community standing ໒꒱\n\n` +
            `💰 Coins spent: **${pack.coins.toLocaleString()}**\n` +
            `💰 Balance: **${userData.balance.toLocaleString()}**\n\n` +
            `-# Check your Aether with \`,pts\` in SILV.`
          )
          .setFooter({ text: 'System • Aether Exchange' })
          .setTimestamp(),
      ],
    });
  }

  // ── ESSENCE ──────────────────────────────────────────────────────────────
  if (ESSENCES[itemId]) {
    const e    = ESSENCES[itemId];
    const cost = e.silvCost * amount;
    if (silv < cost) return notEnoughSilv(message, cost, silv);

    userData.inventory[SILV_KEY] = silv - cost;
    for (let i = 0; i < amount; i++) activateEssence(userData, itemId);
    
    userData.stats = userData.stats || {};
    userData.stats.silvSpent = (userData.stats.silvSpent || 0) + cost;
    
    await saveUserData({ inventory: userData.inventory, activeEssences: userData.activeEssences, stats: userData.stats });
    await trackStat(userData, 'silvSpent', 0, { message, saveUserData });

    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(COLOR.ESSENCE)
          .setTitle('˗ˏˋ 𐙚 ✨ 𝔈𝔰𝔰𝔢𝔫𝔠𝔢 𝔸𝕔𝕥𝔦𝕧𝕒𝕥𝕖𝕕 𐙚 ˎˊ˗')
          .setDescription(
            `${e.emoji} **${e.name}** is now active!\n\n` +
            `> **Effect:** ${e.effect}\n` +
            `> **Duration:** ${formatMs(e.durationMs)}\n\n` +
            `꒰ঌ ${SILV_KEY}: ${silv} → **${userData.inventory[SILV_KEY]}** ໒꒱`
          )
          .setFooter({ text: 'System • Essence Activated' }),
      ],
    });
  }

  // ── TITLE ────────────────────────────────────────────────────────────────
  if (TITLES[itemId]) {
    const t    = TITLES[itemId];
    const cost = t.silvCost;
    if (silv < cost) return notEnoughSilv(message, cost, silv);
    userData.unlockedTitles = userData.unlockedTitles || [];
    if (userData.unlockedTitles.includes(itemId)) {
      return message.channel.send('❌ You already own this title! Equip it with `.profile customize title ' + itemId + '`');
    }
    userData.inventory[SILV_KEY] = silv - cost;
    userData.unlockedTitles.push(itemId);
    userData.stats = userData.stats || {};
    userData.stats.silvSpent = (userData.stats.silvSpent || 0) + cost;
    await saveUserData({ inventory: userData.inventory, unlockedTitles: userData.unlockedTitles, stats: userData.stats });
    return bought(message, `**${t.name}** title`, `Equip with: \`.profile customize title ${itemId}\``);
  }

  // ── BADGE ────────────────────────────────────────────────────────────────
  if (BADGES[itemId]) {
    const b    = BADGES[itemId];
    const cost = b.silvCost;
    if (silv < cost) return notEnoughSilv(message, cost, silv);
    userData.unlockedBadges = userData.unlockedBadges || [];
    if (userData.unlockedBadges.includes(itemId)) {
      return message.channel.send('❌ You already own this badge!');
    }
    userData.inventory[SILV_KEY] = silv - cost;
    userData.unlockedBadges.push(itemId);
    await saveUserData({ inventory: userData.inventory, unlockedBadges: userData.unlockedBadges });
    await checkAchievements(userData, { message, saveUserData });
    return bought(message, `**${b.name}** badge`, 'Now visible on your `.profile`!');
  }

  // ── BUNDLE ────────────────────────────────────────────────────────────────
  if (BUNDLES[itemId]) {
    const bun = BUNDLES[itemId];
    if (silv < bun.silvCost) return notEnoughSilv(message, bun.silvCost, silv);
    userData.inventory[SILV_KEY] = silv - bun.silvCost;
    const c = bun.contents;
    // Apply contents
    if (c.coins)    { userData.balance = (userData.balance || 0) + c.coins; userData.totalEarned = (userData.totalEarned || 0) + c.coins; }
    if (c.keys)     { for (const [rarity, qty] of Object.entries(c.keys)) userData.inventory[rarity] = (userData.inventory[rarity] || 0) + qty; }
    if (c.badges)   { userData.unlockedBadges = userData.unlockedBadges || []; for (const b of c.badges) if (!userData.unlockedBadges.includes(b)) userData.unlockedBadges.push(b); }
    if (c.essences) { for (const [eid, qty] of Object.entries(c.essences)) { for (let i = 0; i < qty; i++) activateEssence(userData, eid); } }
    userData.stats = userData.stats || {};
    userData.stats.silvSpent = (userData.stats.silvSpent || 0) + bun.silvCost;
    await saveUserData({ balance: userData.balance, inventory: userData.inventory, unlockedBadges: userData.unlockedBadges, activeEssences: userData.activeEssences, totalEarned: userData.totalEarned, stats: userData.stats });
    await trackStat(userData, 'silvSpent', 0, { message, saveUserData });
    return bought(message, `**${bun.name}**`, bun.description);
  }

  // ── UTILITY ITEM ─────────────────────────────────────────────────────────
  if (UTILITY_ITEMS[itemId]) {
    const u      = UTILITY_ITEMS[itemId];
    const total  = u.coinCost * amount;
    if (coins < total) return notEnoughCoins(message, total, coins);
    userData.balance           = coins - total;
    const invKey               = u.name;
    userData.inventory[invKey] = (userData.inventory[invKey] || 0) + amount;
    await saveUserData({ balance: userData.balance, inventory: userData.inventory });
    return bought(message, `**${amount}× ${u.emoji} ${u.name}**`, `💰 Spent: ${total.toLocaleString()} coins`, true);
  }

  // ── DB ITEM ────────────────────────────────────────────────────────────────
  try {
    const item = await ShopItem.findOne({ itemId });
    if (!item) return message.channel.send(`❌ No item with ID \`${itemId}\` found. Check \`.sh\` for available items.`);

    if (item.roleId && amount > 1) amount = 1;
    const totalCoins = item.priceCoins * amount;
    const totalSilv  = item.priceSilv  * amount;

    if (item.priceSilv > 0) {
      if (silv < totalSilv) return notEnoughSilv(message, totalSilv, silv);
      userData.inventory[SILV_KEY] = silv - totalSilv;
    } else if (item.priceCoins > 0) {
      if (coins < totalCoins) return notEnoughCoins(message, totalCoins, coins);
      userData.balance = coins - totalCoins;
    } else {
      return message.channel.send('⚠ This item has no price configured.');
    }

    userData.inventory[item.name] = (userData.inventory[item.name] || 0) + amount;

    if (item.roleId) {
      try {
        const member = await message.guild.members.fetch(message.author.id);
        const role   = message.guild.roles.cache.get(item.roleId);
        if (role && !member.roles.cache.has(item.roleId)) {
          await member.roles.add(role);
          if (item.roleDays > 0) {
            setTimeout(async () => {
              const fresh = await message.guild.members.fetch(message.author.id).catch(() => null);
              if (fresh?.roles.cache.has(item.roleId)) await fresh.roles.remove(role).catch(() => {});
            }, item.roleDays * 86400_000);
          }
        }
      } catch (e) { console.error('Shop role error:', e); }
    }

    await saveUserData({ balance: userData.balance, inventory: userData.inventory });
    return bought(message, `**${amount}× ${item.name}**`, `Owned: ${userData.inventory[item.name]}×`);

  } catch (err) {
    console.error('Shop buy error:', err);
    return message.channel.send('❌ Something went wrong.');
  }
}

// ─────────────────────────────────────────────────────────────────────────────
//  ADMIN: ADD / REMOVE
// ─────────────────────────────────────────────────────────────────────────────
async function handleAddItem({ message, args }) {
  const parsed = parseQuotedArgs(args.join(' '));
  if (parsed.length < 5) {
    return message.channel.send(
      '```\n.shop add "item name" "category" (coins) (silv) (chance%) ["roleId"] [days]\n```'
    );
  }
  const [name, category] = parsed;
  const priceCoins  = Number(parsed[2]);
  const priceSilv   = Number(parsed[3]);
  const spawnChance = Number(parsed[4]);
  const roleId      = parsed[5] || null;
  const roleDays    = Number(parsed[6] || 0);
  const itemId      = name.toLowerCase().replace(/\s+/g, '_');

  if (await ShopItem.findOne({ itemId })) {
    return message.channel.send(`❌ Item \`${itemId}\` already exists.`);
  }
  await new ShopItem({ itemId, name, category, priceCoins, priceSilv, spawnChance, roleId, roleDays }).save();
  shopCache.lastRollTime = 0; // force refresh
  return message.channel.send(`✅ **${name}** added to shop.`);
}

async function handleRemoveItem({ message, args }) {
  const itemId = args.join('_').toLowerCase();
  if (!itemId) return message.channel.send('Usage: `.sh remove item_id`');
  const item = await ShopItem.findOneAndDelete({ itemId });
  shopCache.lastRollTime = 0;
  return item
    ? message.channel.send(`✅ **${item.name}** removed.`)
    : message.channel.send(`❌ No item \`${itemId}\` found.`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function deny(message) {
  return message.channel.send({ embeds: [new EmbedBuilder().setColor(COLOR.DEFAULT).setTitle('˗ˏˋ 𐙚 𝔸𝕔𝕔𝕖𝕤𝕤 𝔻𝕖𝕟𝕚𝕖𝕕 𐙚 ˎˊ˗').setDescription('Admins only.')] });
}

function notEnoughSilv(message, need, have) {
  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(COLOR.LOSS).setTitle('✧˚₊‧ ✖ Not Enough SILV ‧₊˚✧')
      .setDescription(`**Need:** ${need} ${SILV_ICON}\n**Have:** ${have} ${SILV_ICON}\n**Missing:** ${need - have} ${SILV_ICON}`)],
  });
}

function notEnoughCoins(message, need, have) {
  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(COLOR.LOSS).setTitle('✧˚₊‧ ✖ Not Enough Coins ‧₊˚✧')
      .setDescription(`**Need:** ${need.toLocaleString()} 💰\n**Have:** ${have.toLocaleString()} 💰\n**Missing:** ${(need - have).toLocaleString()} 💰`)],
  });
}

function bought(message, itemStr, note, coins = false) {
  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(COLOR.WIN).setTitle('˗ˏˋ 𐙚 ✅ ℙ𝕦𝕣𝕔𝕙𝕒𝕤𝕖 ℂ𝕠𝕞𝕡𝕝𝕖𝕥𝕖 𐙚 ˎˊ˗')
      .setDescription(`꒰ঌ You purchased ${itemStr} ໒꒱\n\n${note}`)
      .setFooter({ text: 'System • Shop' }).setTimestamp()],
  });
}

function formatMs(ms) {
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (h > 0) return `${h}h ${m > 0 ? m + 'm' : ''}`.trim();
  return `${m}m`;
}