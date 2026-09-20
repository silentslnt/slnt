// commands/shop.js
const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const {
  ESSENCES, TITLES, BADGES, BUNDLES, UTILITY_ITEMS, SPELLS,
} = require('../utils/config');
const { activateEssence } = require('../utils/essences');
const { trackStat, checkAchievements } = require('../utils/achievements');
const { awardPoints, grantItem } = require('../utils/sentinelDb');
const { isAdmin } = require('../utils/permissions');

const SILV_KEY  = 'Silv token';
const SILV_ICON = '<:zzsilvtoken:1486364646796431427>';
const CHECK     = '<:check:1547659779877642360>';
const XMARK     = '<:xmark:1547659816783061153>';
const SPARKLE   = '<a:csparkle:1512498380142674010>';
const PRESENT   = '<:cpresent:1512497697381154826>';
const WHITESTAR = '<a:cwhitestar:1512498079662735461>';
const CROSS     = '<a:ccross:1512497030348542122>';
const WHITESWIRL = '<a:cwhiteswirl:1512869492492079184>';
const BLACKSWIRL = '<a:cblackswirl:1512496801394065688>';
const BLACK      = 0x000000;

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

function footer(message) {
  return { text: message.guild?.name || 'Shiro' };
}

// ─────────────────────────────────────────────────────────────────────────────
module.exports = {
  name: 'shop',
  aliases: ['sh', 'store'],
  adminOnly: false,
  description: 'Browse and buy from the shop. `.sh [section] [buy <id>]`',

  async execute({ message, args, userData, saveUserData, logAdminAction }) {
    const sub = (args[0] || '').toLowerCase();

    // Admin-only dynamic item management
    if (sub === 'add')    return isAdmin(message) ? handleAddItem({ message, args: args.slice(1) }) : deny(message);
    if (sub === 'remove') return isAdmin(message) ? handleRemoveItem({ message, args: args.slice(1) }) : deny(message);

    if (sub === 'buy')    return handleBuy({ message, args: args.slice(1), userData, saveUserData, logAdminAction });
    if (sub === 'essences' || sub === 'ess') return showEssenceShop({ message });
    if (sub === 'bundles' || sub === 'bun')  return showBundleShop({ message });
    if (sub === 'cosmetics' || sub === 'cos') return showCosmeticsShop({ message });
    if (sub === 'utility' || sub === 'util') return showUtilityShop({ message });
    if (sub === 'aether' || sub === 'ae')    return showAetherShop({ message, userData });
    if (sub === 'spells' || sub === 'sp')    return showSpellShop({ message });
    return showMainShop({ message });
  },
};

// ─────────────────────────────────────────────────────────────────────────────
//  SHOW SECTIONS
// ─────────────────────────────────────────────────────────────────────────────

async function showMainShop({ message }) {
  const embed = new EmbedBuilder()
    .setColor(BLACK)
    .setTitle('SHOP')
    .setDescription(
      `> **1** ${SILV_ICON} SILV = **10** Robux\n\n` +
      `__**Sections**__\n` +
      `> ${SPARKLE} \`.sh essences\` — active boosts (SILV)\n` +
      `> ${PRESENT} \`.sh bundles\` — value packs (SILV)\n` +
      `> ${WHITESTAR} \`.sh cosmetics\` — titles & badges (SILV)\n` +
      `> ${CROSS} \`.sh utility\` — utility items (coins)\n` +
      `> ${WHITESWIRL} \`.sh aether\` — Aether packs (coins)\n` +
      `> ${BLACKSWIRL} \`.sh spells\` — SILV race spells (SILV)\n` +
      `> \`.sh items\` — admin-added items\n\n` +
      `-# Buy with \`.sh buy <item_id> [amount]\`. Check your SILV with \`.inv\`, coins with \`.bal\`.`
    )
    .setThumbnail(message.guild.iconURL())
    .setFooter(footer(message));
  return message.channel.send({ embeds: [embed] });
}

async function showEssenceShop({ message }) {
  let desc = '__**Essences**__\n> Temporary buffs, activated immediately on purchase.\n\n';
  for (const [id, e] of Object.entries(ESSENCES)) {
    desc += `> ${e.emoji} **${e.name}** \`${id}\`\n`;
    desc += `> ${e.effect} · ${formatMs(e.durationMs)} · ${e.silvCost} ${SILV_ICON}\n\n`;
  }
  desc += `-# Buy: \`.sh buy <essence_id>\` — e.g. \`.sh buy luck_essence\``;
  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(BLACK).setTitle('ESSENCE SHOP').setDescription(desc).setFooter(footer(message))],
  });
}

async function showBundleShop({ message }) {
  let desc = '__**Bundles**__\n> Value packs, priced in SILV.\n\n';
  for (const [id, b] of Object.entries(BUNDLES)) {
    desc += `> ${PRESENT} **${b.name}** \`${id}\`\n`;
    desc += `> ${b.description} · ${b.silvCost} ${SILV_ICON}\n\n`;
  }
  desc += `-# Buy: \`.sh buy <bundle_id>\` — e.g. \`.sh buy lucky_bundle\``;
  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(BLACK).setTitle('BUNDLE SHOP').setDescription(desc).setFooter(footer(message))],
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
  const desc =
    `__**Titles**__ *(shown on \`.profile\`)*\n${titleLines}\n` +
    `__**Badges**__ *(shown on \`.profile\`)*\n${badgeLines}\n` +
    `-# Buy: \`.sh buy <item_id>\` · Equip: \`.profile customize title <id>\``;
  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(BLACK).setTitle('COSMETICS SHOP').setDescription(desc).setFooter(footer(message))],
  });
}

async function showUtilityShop({ message }) {
  let desc = '__**Utility Items**__\n> Consumables, priced in coins.\n\n';
  for (const [id, item] of Object.entries(UTILITY_ITEMS)) {
    desc += `> ${item.emoji} **${item.name}** \`${id}\`\n`;
    desc += `> ${item.description} · ${item.coinCost.toLocaleString()} coins\n\n`;
  }
  desc += `-# Buy: \`.sh buy <item_id>\` — e.g. \`.sh buy insurance_slip\``;
  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(BLACK).setTitle('UTILITY SHOP').setDescription(desc).setFooter(footer(message))],
  });
}

async function showAetherShop({ message, userData }) {
  const coins = userData.balance || 0;
  let desc = `__**Aether Exchange**__\n> Convert Shiro coins into Aether — your community standing in SILV.\n\n> Your coins: **${coins.toLocaleString()}**\n\n`;
  for (const [id, p] of Object.entries(AETHER_PACKS)) {
    const bonus = id === 'aether_100' ? '' : id === 'aether_500' ? ' *(+12% value)*' : id === 'aether_1000' ? ' *(+25% value)*' : ' *(+30% value)*';
    desc += `> ${WHITESWIRL} **${p.label}** \`${id}\`\n> ${p.coins.toLocaleString()} coins${bonus}\n\n`;
  }
  desc += `-# Buy: \`.sh buy <pack_id>\``;
  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(BLACK).setTitle('AETHER EXCHANGE').setDescription(desc).setFooter(footer(message))],
  });
}

async function showSpellShop({ message }) {
  let desc = '__**Spells**__\n> Cast in SILV with `,cast <spell> @member` — delivered to your Sentinel inventory instantly.\n\n';
  for (const [id, s] of Object.entries(SPELLS)) {
    desc += `> ${s.emoji} **${s.name}** \`${id}\`${s.raceLocked ? ` *(${s.raceLocked}s only)*` : ''}\n`;
    desc += `> ${s.effect} · ${s.silvCost} ${SILV_ICON}\n\n`;
  }
  desc += `-# Buy: \`.sh buy <spell_id>\` — e.g. \`.sh buy shield\``;
  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(BLACK).setTitle('SPELL SHOP').setDescription(desc).setFooter(footer(message))],
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  BUY HANDLER
// ─────────────────────────────────────────────────────────────────────────────
async function handleBuy({ message, args, userData, saveUserData, logAdminAction }) {
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
    if (!message.guild) return message.channel.send(`${XMARK} Must be used in a server.`);

    userData.balance = coins - pack.coins;
    await saveUserData({ balance: userData.balance });
    await awardPoints(message.guild.id, message.author.id, pack.pts);
    await logAdminAction(message.author.id, message.author.username, 'shop', 'Aether Purchase', null, null, `${pack.coins.toLocaleString()} coins → ${pack.pts.toLocaleString()} Aether`);

    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(BLACK)
          .setTitle('AETHER ACQUIRED')
          .setDescription(
            `> ${WHITESWIRL} **+${pack.pts.toLocaleString()} Aether** added to your community standing\n\n` +
            `> Coins spent: **${pack.coins.toLocaleString()}**\n` +
            `> Balance: **${userData.balance.toLocaleString()}**\n\n` +
            `-# Check your Aether with \`,pts\` in SILV.`
          )
          .setFooter(footer(message)),
      ],
    });
  }

  // ── SPELL (delivered to Sentinel's user_inventory, cast with `,cast`) ────
  if (SPELLS[itemId]) {
    if (!message.guild) return message.channel.send(`${XMARK} Must be used in a server.`);
    const s    = SPELLS[itemId];
    const cost = s.silvCost * amount;
    if (silv < cost) return notEnoughSilv(message, cost, silv);

    userData.inventory[SILV_KEY] = silv - cost;
    userData.stats = userData.stats || {};
    userData.stats.silvSpent = (userData.stats.silvSpent || 0) + cost;
    await saveUserData({ inventory: userData.inventory, stats: userData.stats });
    await trackStat(userData, 'silvSpent', 0, { message, saveUserData });
    await grantItem(message.guild.id, message.author.id, itemId, amount);
    await logAdminAction(message.author.id, message.author.username, 'shop', 'Spell Purchase', null, null, `${amount}× ${s.name} for ${cost} SILV`);

    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(BLACK)
          .setTitle('SPELL DELIVERED')
          .setDescription(
            `> ${s.emoji} **${amount}× ${s.name}** added to your SILV inventory\n\n` +
            `> ${SILV_ICON} SILV spent: **${cost}**\n\n` +
            `-# Use \`,cast ${itemId} @member\` in SILV to cast it.`
          )
          .setFooter(footer(message)),
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
          .setColor(BLACK)
          .setTitle('ESSENCE ACTIVATED')
          .setDescription(
            `> ${e.emoji} **${e.name}** is now active\n\n` +
            `> ${e.effect} · ${formatMs(e.durationMs)}\n\n` +
            `-# ${SILV_KEY}: ${silv} → **${userData.inventory[SILV_KEY]}**`
          )
          .setFooter(footer(message)),
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
      return message.channel.send(`${XMARK} You already own this title! Equip it with \`.profile customize title ${itemId}\``);
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
      return message.channel.send(`${XMARK} You already own this badge!`);
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
    return bought(message, `**${amount}× ${u.emoji} ${u.name}**`, `Spent: ${total.toLocaleString()} coins`);
  }

  // ── DB ITEM ────────────────────────────────────────────────────────────────
  try {
    const item = await ShopItem.findOne({ itemId });
    if (!item) return message.channel.send(`${XMARK} No item with ID \`${itemId}\` found. Check \`.sh\` for available items.`);

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
      return message.channel.send('This item has no price configured.');
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
    return message.channel.send(`${XMARK} Something went wrong.`);
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
    return message.channel.send(`${XMARK} Item \`${itemId}\` already exists.`);
  }
  await new ShopItem({ itemId, name, category, priceCoins, priceSilv, spawnChance, roleId, roleDays }).save();
  shopCache.lastRollTime = 0; // force refresh
  return message.channel.send(`${CHECK} **${name}** added to shop.`);
}

async function handleRemoveItem({ message, args }) {
  const itemId = args.join('_').toLowerCase();
  if (!itemId) return message.channel.send('Usage: `.sh remove item_id`');
  const item = await ShopItem.findOneAndDelete({ itemId });
  shopCache.lastRollTime = 0;
  return item
    ? message.channel.send(`${CHECK} **${item.name}** removed.`)
    : message.channel.send(`${XMARK} No item \`${itemId}\` found.`);
}

// ─────────────────────────────────────────────────────────────────────────────
//  HELPERS
// ─────────────────────────────────────────────────────────────────────────────
function deny(message) {
  return message.channel.send({ embeds: [new EmbedBuilder().setColor(BLACK).setTitle('ACCESS DENIED').setDescription(`${XMARK} Admins only.`).setFooter(footer(message))] });
}

function notEnoughSilv(message, need, have) {
  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(BLACK).setTitle('NOT ENOUGH SILV')
      .setDescription(`> Need: **${need}** ${SILV_ICON}\n> Have: **${have}** ${SILV_ICON}\n> Missing: **${need - have}** ${SILV_ICON}`)
      .setFooter(footer(message))],
  });
}

function notEnoughCoins(message, need, have) {
  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(BLACK).setTitle('NOT ENOUGH COINS')
      .setDescription(`> Need: **${need.toLocaleString()}** coins\n> Have: **${have.toLocaleString()}** coins\n> Missing: **${(need - have).toLocaleString()}** coins`)
      .setFooter(footer(message))],
  });
}

function bought(message, itemStr, note) {
  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(BLACK).setTitle('PURCHASE COMPLETE')
      .setDescription(`> ${CHECK} You purchased ${itemStr}\n\n> ${note}`)
      .setFooter(footer(message))],
  });
}

function formatMs(ms) {
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (h > 0) return `${h}h ${m > 0 ? m + 'm' : ''}`.trim();
  return `${m}m`;
}
