// commands/shop.js
const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');
const {
  ESSENCES, TITLES, BADGES, BUNDLES, UTILITY_ITEMS, SPELLS,
} = require('../utils/config');
const { activateEssence } = require('../utils/essences');
const { trackStat, checkAchievements } = require('../utils/achievements');
const { awardPoints, grantItem, getSpellDisplay } = require('../utils/sentinelDb');
const { isAdmin } = require('../utils/permissions');
const { sendShopUI } = require('../utils/shopUI');

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
  aliases: ['sh'],
  adminOnly: false,
  description: 'Browse and buy from the shop. `.sh [section] [buy <id>]`',

  async execute({ message, args, userData, saveUserData, getUserData, saveSpecificUserData, logAdminAction }) {
    const sub = (args[0] || '').toLowerCase();
    const ctx = { message, getUserData, saveSpecificUserData, logAdminAction };

    // Admin-only dynamic item management
    if (sub === 'add')    return isAdmin(message) ? handleAddItem({ message, args: args.slice(1) }) : deny(message);
    if (sub === 'remove') return isAdmin(message) ? handleRemoveItem({ message, args: args.slice(1) }) : deny(message);

    if (sub === 'buy')    return handleBuy({ message, args: args.slice(1), getUserData, saveSpecificUserData, logAdminAction });
    if (sub === 'essences' || sub === 'ess') return showEssenceShop(ctx);
    if (sub === 'bundles' || sub === 'bun')  return showBundleShop(ctx);
    if (sub === 'cosmetics' || sub === 'cos') return showCosmeticsShop(ctx);
    if (sub === 'utility' || sub === 'util') return showUtilityShop(ctx);
    if (sub === 'aether' || sub === 'ae')    return showAetherShop(ctx);
    if (sub === 'spells' || sub === 'sp')    return showSpellShop(ctx);
    if (sub === 'items')  return showDynamicShop(ctx);
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

// Each buyPrefix below must be unique across every shop section so button
// customIds from two different open shop menus (e.g. essences + spells open
// in the same channel at once) never collide with each other.

async function showEssenceShop({ message, getUserData, saveSpecificUserData, logAdminAction }) {
  await sendShopUI({
    message,
    title: 'ESSENCE SHOP',
    headerDesc: '> Temporary buffs, activated immediately on purchase.',
    footerName: message.guild?.name,
    buyPrefix: 'sh_ess_',
    getItems: async () => Object.entries(ESSENCES).map(([id, e]) => ({
      id, name: e.name, emoji: e.emoji,
      valueText: `${e.effect}\n**${e.silvCost}** ${SILV_ICON} · ${formatMs(e.durationMs)}`,
    })),
    onBuy: (interaction, itemId) => performPurchase({
      userId: interaction.user.id, username: interaction.user.username,
      guild: interaction.guild, itemId, amount: 1,
      getUserData, saveSpecificUserData, logAdminAction,
    }),
  });
}

async function showBundleShop({ message, getUserData, saveSpecificUserData, logAdminAction }) {
  await sendShopUI({
    message,
    title: 'BUNDLE SHOP',
    headerDesc: '> Value packs, priced in SILV.',
    footerName: message.guild?.name,
    buyPrefix: 'sh_bun_',
    getItems: async () => Object.entries(BUNDLES).map(([id, b]) => ({
      id, name: b.name, emoji: PRESENT,
      valueText: `${b.description}\n**${b.silvCost}** ${SILV_ICON}`,
    })),
    onBuy: (interaction, itemId) => performPurchase({
      userId: interaction.user.id, username: interaction.user.username,
      guild: interaction.guild, itemId, amount: 1,
      getUserData, saveSpecificUserData, logAdminAction,
    }),
  });
}

async function showCosmeticsShop({ message, getUserData, saveSpecificUserData, logAdminAction }) {
  await sendShopUI({
    message,
    title: 'COSMETICS SHOP',
    headerDesc: '> Titles & badges — shown on `.profile`. Equip a title with `.profile customize title <id>`.',
    footerName: message.guild?.name,
    buyPrefix: 'sh_cos_',
    getItems: async () => {
      const userData = await getUserData(message.author.id);
      const ownedTitles = userData.unlockedTitles || [];
      const ownedBadges = userData.unlockedBadges || [];
      const titleItems = Object.entries(TITLES).map(([id, t]) => ({
        id, name: t.name, emoji: '🪪',
        valueText: `Title · **${t.silvCost}** ${SILV_ICON}${ownedTitles.includes(id) ? '\n*(owned)*' : ''}`,
        disabled: ownedTitles.includes(id),
      }));
      const badgeItems = Object.entries(BADGES).map(([id, b]) => ({
        id, name: b.name, emoji: '🎖',
        valueText: `Badge · **${b.silvCost}** ${SILV_ICON}${ownedBadges.includes(id) ? '\n*(owned)*' : ''}`,
        disabled: ownedBadges.includes(id),
      }));
      return [...titleItems, ...badgeItems];
    },
    onBuy: (interaction, itemId) => performPurchase({
      userId: interaction.user.id, username: interaction.user.username,
      guild: interaction.guild, itemId, amount: 1,
      getUserData, saveSpecificUserData, logAdminAction,
    }),
  });
}

async function showUtilityShop({ message, getUserData, saveSpecificUserData, logAdminAction }) {
  await sendShopUI({
    message,
    title: 'UTILITY SHOP',
    headerDesc: '> Consumables, priced in coins.',
    footerName: message.guild?.name,
    buyPrefix: 'sh_util_',
    getItems: async () => Object.entries(UTILITY_ITEMS).map(([id, item]) => ({
      id, name: item.name, emoji: item.emoji,
      valueText: `${item.description}\n**${item.coinCost.toLocaleString()}** coins`,
    })),
    onBuy: (interaction, itemId) => performPurchase({
      userId: interaction.user.id, username: interaction.user.username,
      guild: interaction.guild, itemId, amount: 1,
      getUserData, saveSpecificUserData, logAdminAction,
    }),
  });
}

async function showAetherShop({ message, getUserData, saveSpecificUserData, logAdminAction }) {
  await sendShopUI({
    message,
    title: 'AETHER EXCHANGE',
    headerDesc: '> Convert Shiro coins into Aether — your community standing in SILV.',
    footerName: message.guild?.name,
    buyPrefix: 'sh_ae_',
    getItems: async () => Object.entries(AETHER_PACKS).map(([id, p]) => {
      const bonus = id === 'aether_100' ? '' : id === 'aether_500' ? ' (+12% value)' : id === 'aether_1000' ? ' (+25% value)' : ' (+30% value)';
      return {
        id, name: p.label, emoji: WHITESWIRL,
        valueText: `**${p.coins.toLocaleString()}** coins${bonus}`,
      };
    }),
    onBuy: (interaction, itemId) => performPurchase({
      userId: interaction.user.id, username: interaction.user.username,
      guild: interaction.guild, itemId, amount: 1,
      getUserData, saveSpecificUserData, logAdminAction,
    }),
  });
}

async function showSpellShop({ message, getUserData, saveSpecificUserData, logAdminAction }) {
  await sendShopUI({
    message,
    title: 'SPELL SHOP',
    headerDesc: '> Cast in SILV with `,cast <spell> @member` — delivered to your Sentinel inventory instantly.',
    footerName: message.guild?.name,
    buyPrefix: 'sh_sp_',
    getItems: async () => {
      // Live text from Sentinel (spells.py is the actual mechanical source of
      // truth) takes priority — falls back to the static SPELLS[id].effect
      // copy only if Sentinel's DB is unreachable, so the shop never breaks.
      const live = await getSpellDisplay();
      return Object.entries(SPELLS).map(([id, s]) => ({
        id, name: s.name, emoji: s.emoji,
        valueText: `${live[id]?.description || s.effect}${s.raceLocked ? `\n*(${s.raceLocked}s only)*` : ''}\n**${s.silvCost}** ${SILV_ICON}`,
      }));
    },
    onBuy: (interaction, itemId) => performPurchase({
      userId: interaction.user.id, username: interaction.user.username,
      guild: interaction.guild, itemId, amount: 1,
      getUserData, saveSpecificUserData, logAdminAction,
    }),
  });
}

// Admin-added dynamic items (`.sh add`) — same button UI, `.sh items` to view.
async function showDynamicShop({ message, getUserData, saveSpecificUserData, logAdminAction }) {
  await sendShopUI({
    message,
    title: 'SHOP — ADMIN ITEMS',
    headerDesc: '> Items added by server admins.',
    footerName: message.guild?.name,
    buyPrefix: 'sh_dyn_',
    getItems: async () => {
      const dbItems = await ShopItem.find({});
      return dbItems.map(item => ({
        id: item.itemId, name: item.name,
        valueText: item.priceSilv > 0
          ? `**${item.priceSilv.toLocaleString()}** ${SILV_ICON}`
          : `**${item.priceCoins.toLocaleString()}** coins`,
      }));
    },
    onBuy: (interaction, itemId) => performPurchase({
      userId: interaction.user.id, username: interaction.user.username,
      guild: interaction.guild, itemId, amount: 1,
      getUserData, saveSpecificUserData, logAdminAction,
    }),
  });
}

// ─────────────────────────────────────────────────────────────────────────────
//  BUY HANDLER
// ─────────────────────────────────────────────────────────────────────────────
// Shared purchase core — used by BOTH the text `.sh buy <id>` path and every
// button's onBuy callback, so the two paths can never drift out of sync with
// each other the way handleBuy's old copy-pasted-per-section logic risked.
// Always re-fetches the buyer's CURRENT data via getUserData rather than
// trusting a userData snapshot from when a shop menu was first opened — a
// button can sit for up to the full collector window before being clicked.
// Returns { ok, title, description } on success or { ok: false, message } on
// failure — never sends anything itself, callers decide how to present it.
async function performPurchase({ userId, username, guild, itemId, amount, getUserData, saveSpecificUserData, logAdminAction }) {
  amount = Math.max(1, amount || 1);
  const userData = await getUserData(userId);
  userData.inventory = userData.inventory || {};
  const silv  = userData.inventory[SILV_KEY] || 0;
  const coins = userData.balance || 0;
  const saveUserData = (data) => saveSpecificUserData(userId, data);

  // ── AETHER PACK ──────────────────────────────────────────────────────────
  if (AETHER_PACKS[itemId]) {
    const pack = AETHER_PACKS[itemId];
    if (coins < pack.coins) return notEnoughResult(pack.coins, coins, 'coins');
    if (!guild) return { ok: false, message: 'Must be used in a server.' };

    userData.balance = coins - pack.coins;
    await saveUserData({ balance: userData.balance });
    await awardPoints(guild.id, userId, pack.pts);
    await logAdminAction(userId, username, 'shop', 'Aether Purchase', null, null, `${pack.coins.toLocaleString()} coins → ${pack.pts.toLocaleString()} Aether`);
    return { ok: true, title: 'AETHER ACQUIRED', description: `+**${pack.pts.toLocaleString()}** Aether. Coins spent: **${pack.coins.toLocaleString()}**. Balance: **${userData.balance.toLocaleString()}**.` };
  }

  // ── SPELL (delivered to Sentinel's user_inventory, cast with `,cast`) ────
  if (SPELLS[itemId]) {
    if (!guild) return { ok: false, message: 'Must be used in a server.' };
    const s    = SPELLS[itemId];
    const cost = s.silvCost * amount;
    if (silv < cost) return notEnoughResult(cost, silv, 'SILV');

    userData.inventory[SILV_KEY] = silv - cost;
    userData.stats = userData.stats || {};
    userData.stats.silvSpent = (userData.stats.silvSpent || 0) + cost;
    await saveUserData({ inventory: userData.inventory, stats: userData.stats });
    await trackStat(userData, 'silvSpent', 0, { saveUserData });
    await grantItem(guild.id, userId, itemId, amount);
    await logAdminAction(userId, username, 'shop', 'Spell Purchase', null, null, `${amount}× ${s.name} for ${cost} SILV`);
    return { ok: true, title: 'SPELL DELIVERED', description: `**${amount}× ${s.name}** added to your SILV inventory. SILV spent: **${cost}**. Use \`,cast ${itemId} @member\` in SILV to cast it.` };
  }

  // ── ESSENCE ──────────────────────────────────────────────────────────────
  if (ESSENCES[itemId]) {
    const e    = ESSENCES[itemId];
    const cost = e.silvCost * amount;
    if (silv < cost) return notEnoughResult(cost, silv, 'SILV');

    userData.inventory[SILV_KEY] = silv - cost;
    for (let i = 0; i < amount; i++) activateEssence(userData, itemId);
    userData.stats = userData.stats || {};
    userData.stats.silvSpent = (userData.stats.silvSpent || 0) + cost;
    await saveUserData({ inventory: userData.inventory, activeEssences: userData.activeEssences, stats: userData.stats });
    await trackStat(userData, 'silvSpent', 0, { saveUserData });
    return { ok: true, title: 'ESSENCE ACTIVATED', description: `**${e.name}** is now active — ${e.effect} for ${formatMs(e.durationMs)}. SILV: ${silv} → **${userData.inventory[SILV_KEY]}**.` };
  }

  // ── TITLE ────────────────────────────────────────────────────────────────
  if (TITLES[itemId]) {
    const t    = TITLES[itemId];
    const cost = t.silvCost;
    if (silv < cost) return notEnoughResult(cost, silv, 'SILV');
    userData.unlockedTitles = userData.unlockedTitles || [];
    if (userData.unlockedTitles.includes(itemId)) {
      return { ok: false, message: 'You already own this title! Equip it with `.profile customize title <id>`.' };
    }
    userData.inventory[SILV_KEY] = silv - cost;
    userData.unlockedTitles.push(itemId);
    userData.stats = userData.stats || {};
    userData.stats.silvSpent = (userData.stats.silvSpent || 0) + cost;
    await saveUserData({ inventory: userData.inventory, unlockedTitles: userData.unlockedTitles, stats: userData.stats });
    return { ok: true, title: 'PURCHASE COMPLETE', description: `**${t.name}** title purchased. Equip with: \`.profile customize title ${itemId}\`.` };
  }

  // ── BADGE ────────────────────────────────────────────────────────────────
  if (BADGES[itemId]) {
    const b    = BADGES[itemId];
    const cost = b.silvCost;
    if (silv < cost) return notEnoughResult(cost, silv, 'SILV');
    userData.unlockedBadges = userData.unlockedBadges || [];
    if (userData.unlockedBadges.includes(itemId)) {
      return { ok: false, message: 'You already own this badge!' };
    }
    userData.inventory[SILV_KEY] = silv - cost;
    userData.unlockedBadges.push(itemId);
    await saveUserData({ inventory: userData.inventory, unlockedBadges: userData.unlockedBadges });
    await checkAchievements(userData, { saveUserData });
    return { ok: true, title: 'PURCHASE COMPLETE', description: `**${b.name}** badge purchased — now visible on your \`.profile\`!` };
  }

  // ── BUNDLE ────────────────────────────────────────────────────────────────
  if (BUNDLES[itemId]) {
    const bun = BUNDLES[itemId];
    if (silv < bun.silvCost) return notEnoughResult(bun.silvCost, silv, 'SILV');
    userData.inventory[SILV_KEY] = silv - bun.silvCost;
    const c = bun.contents;
    if (c.coins)    { userData.balance = (userData.balance || 0) + c.coins; userData.totalEarned = (userData.totalEarned || 0) + c.coins; }
    if (c.keys)     { for (const [rarity, qty] of Object.entries(c.keys)) userData.inventory[rarity] = (userData.inventory[rarity] || 0) + qty; }
    if (c.badges)   { userData.unlockedBadges = userData.unlockedBadges || []; for (const b of c.badges) if (!userData.unlockedBadges.includes(b)) userData.unlockedBadges.push(b); }
    if (c.essences) { for (const [eid, qty] of Object.entries(c.essences)) { for (let i = 0; i < qty; i++) activateEssence(userData, eid); } }
    userData.stats = userData.stats || {};
    userData.stats.silvSpent = (userData.stats.silvSpent || 0) + bun.silvCost;
    await saveUserData({ balance: userData.balance, inventory: userData.inventory, unlockedBadges: userData.unlockedBadges, activeEssences: userData.activeEssences, totalEarned: userData.totalEarned, stats: userData.stats });
    await trackStat(userData, 'silvSpent', 0, { saveUserData });
    return { ok: true, title: 'PURCHASE COMPLETE', description: `**${bun.name}** purchased. ${bun.description}` };
  }

  // ── UTILITY ITEM ─────────────────────────────────────────────────────────
  if (UTILITY_ITEMS[itemId]) {
    const u      = UTILITY_ITEMS[itemId];
    const total  = u.coinCost * amount;
    if (coins < total) return notEnoughResult(total, coins, 'coins');
    userData.balance           = coins - total;
    const invKey               = u.name;
    userData.inventory[invKey] = (userData.inventory[invKey] || 0) + amount;
    await saveUserData({ balance: userData.balance, inventory: userData.inventory });
    return { ok: true, title: 'PURCHASE COMPLETE', description: `**${amount}× ${u.name}** purchased. Spent: ${total.toLocaleString()} coins.` };
  }

  // ── DB ITEM ────────────────────────────────────────────────────────────────
  try {
    const item = await ShopItem.findOne({ itemId });
    if (!item) return { ok: false, message: `No item with ID \`${itemId}\` found. Check \`.sh\` for available items.` };

    if (item.roleId && amount > 1) amount = 1;
    const totalCoins = item.priceCoins * amount;
    const totalSilv  = item.priceSilv  * amount;

    if (item.priceSilv > 0) {
      if (silv < totalSilv) return notEnoughResult(totalSilv, silv, 'SILV');
      userData.inventory[SILV_KEY] = silv - totalSilv;
    } else if (item.priceCoins > 0) {
      if (coins < totalCoins) return notEnoughResult(totalCoins, coins, 'coins');
      userData.balance = coins - totalCoins;
    } else {
      return { ok: false, message: 'This item has no price configured.' };
    }

    userData.inventory[item.name] = (userData.inventory[item.name] || 0) + amount;

    if (item.roleId && guild) {
      try {
        const member = await guild.members.fetch(userId);
        const role   = guild.roles.cache.get(item.roleId);
        if (role && !member.roles.cache.has(item.roleId)) {
          await member.roles.add(role);
          if (item.roleDays > 0) {
            setTimeout(async () => {
              const fresh = await guild.members.fetch(userId).catch(() => null);
              if (fresh?.roles.cache.has(item.roleId)) await fresh.roles.remove(role).catch(() => {});
            }, item.roleDays * 86400_000);
          }
        }
      } catch (e) { console.error('Shop role error:', e); }
    }

    await saveUserData({ balance: userData.balance, inventory: userData.inventory });
    return { ok: true, title: 'PURCHASE COMPLETE', description: `**${amount}× ${item.name}** purchased. Owned: ${userData.inventory[item.name]}×.` };

  } catch (err) {
    console.error('Shop buy error:', err);
    return { ok: false, message: 'Something went wrong.' };
  }
}

function notEnoughResult(need, have, currency) {
  return { ok: false, message: `Not enough ${currency}. Need **${need.toLocaleString()}**, you have **${have.toLocaleString()}** (missing **${(need - have).toLocaleString()}**).` };
}

// Thin wrapper for the text `.sh buy <id> [amount]` path — same core as every
// button, just fetches fresh data and renders the result as a channel embed
// instead of an ephemeral reply.
async function handleBuy({ message, args, getUserData, saveSpecificUserData, logAdminAction }) {
  const itemId = (args[0] || '').toLowerCase();
  const amount = Math.max(1, parseInt(args[1] || '1', 10) || 1);
  if (!itemId) return message.channel.send('Usage: `.sh buy <item_id> [amount]`');

  const result = await performPurchase({
    userId: message.author.id, username: message.author.username,
    guild: message.guild, itemId, amount,
    getUserData, saveSpecificUserData, logAdminAction,
  });

  if (!result.ok) return message.channel.send(result.message);
  return bought(message, result.title, result.description);
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

function bought(message, title, description) {
  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(BLACK).setTitle(title)
      .setDescription(`> ${CHECK} ${description}`)
      .setFooter(footer(message))],
  });
}

function formatMs(ms) {
  const h = Math.floor(ms / 3600_000);
  const m = Math.floor((ms % 3600_000) / 60_000);
  if (h > 0) return `${h}h ${m > 0 ? m + 'm' : ''}`.trim();
  return `${m}m`;
}
