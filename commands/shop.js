const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');

// ================== CONFIG ==================
const SHOP_ADMIN_ROLE_ID = '1454818862397653074';
const SHOP_ADMIN_USER_IDS = [
  '1349792214124986419', // add yourself
  // 'ANOTHER_USER_ID',
];

const SILV_TOKEN_KEY = 'Silv token';

const SILV_TOKEN_ITEM = {
  id: 'silv_token',
  name: 'Silv token',
  priceCoins: 100000,
  emoji: '<:SILV_TOKEN:1447678878448484555>',
  description: 'A shiny coin for exchanging robux and more!',
  category: 'Currency',
  spawnChance: 80,
};

// ================== CATEGORIES WITH SPACES + CUSTOM EMOJIS ==================
const CATEGORY_EMOJIS = {
  Currency: '💰',
  Weapons: '⚔️',
  Armor: '🛡️',
  Roles: '👑',
  Skins: '🎨',
  Items: '📦',
  Cosmetics: '✨',
  Exclusive: '💎',
  Mythical: '🧿',
  'Silv Shop': '<:zzPlatinum:1423148989590540430>',
  'Rare Items': '⭐',
  'Special Roles': '🏆',
  'VIP Lounge': '💎',
  'Event Items': '🎉',
};

let shopCache = {
  lastRollTime: 0,
  itemsByCategory: {},
};
const SHOP_REFRESH_MS = 4 * 60 * 60 * 1000;

const shopItemSchema = new mongoose.Schema({
  itemId: { type: String, required: true },
  name: { type: String, required: true },
  category: { type: String, required: true },
  priceCoins: { type: Number, default: 0 },
  priceSilv: { type: Number, default: 0 },
  spawnChance: { type: Number, default: 100 },
  roleId: { type: String, default: null },
  roleDays: { type: Number, default: 0 },
});

const ShopItem =
  mongoose.models.ShopItem || mongoose.model('ShopItem', shopItemSchema);

module.exports = {
  name: 'shop',
  description: 'Open the daily shop',
  async execute({ message, args, userData, saveUserData }) {
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'add') {
      return handleAddItem({ message, args: args.slice(1) });
    }

    if (sub === 'remove') {
      return handleRemoveItem({ message, args: args.slice(1) });
    }

    if (sub === 'buy') {
      return handleBuy({
        message,
        args: args.slice(1),
        userData,
        saveUserData,
      });
    }

    return showShop({ message });
  },
};

function isShopAdmin(member) {
  const hasRole = member.roles.cache.has(SHOP_ADMIN_ROLE_ID);
  const isWhitelisted = SHOP_ADMIN_USER_IDS.includes(member.id);
  return hasRole || isWhitelisted;
}

// ================== PARSE WITH QUOTE SUPPORT ==================
function parseQuotedArgs(argsString) {
  const parts = [];
  let current = '';
  let inQuotes = false;
  
  for (let i = 0; i < argsString.length; i++) {
    const char = argsString[i];
    
    if (char === '"') {
      inQuotes = !inQuotes;
    } else if (char === ' ' && !inQuotes) {
      if (current) {
        parts.push(current);
        current = '';
      }
    } else {
      current += char;
    }
  }
  
  if (current) parts.push(current);
  
  return parts;
}

function parseAddArgs(args) {
  // Join args back and parse with quotes
  const argsString = args.join(' ');
  const parsed = parseQuotedArgs(argsString);
  
  if (parsed.length < 5) return null;

  const name = parsed[0];
  const category = parsed[1];
  const priceCoins = Number(parsed[2]);
  const priceSilv = Number(parsed[3]);
  const spawnChance = Number(parsed[4]);
  
  // Generate itemId from name (lowercase, replace spaces with underscores)
  const itemId = name.toLowerCase().replace(/\s+/g, '_');
  
  let roleId = null;
  let roleDays = 0;

  // Handle role args if present
  if (parsed.length >= 7) {
    roleId = parsed[5];
    roleDays = Number(parsed[6]) || 0;
  }

  // VALIDATION
  if (!name || !category || 
      Number.isNaN(priceCoins) || priceCoins < 0 ||
      Number.isNaN(priceSilv) || priceSilv < 0 ||
      Number.isNaN(spawnChance) || spawnChance < 0 || spawnChance > 100) {
    return null;
  }

  return { name, itemId, category, priceCoins, priceSilv, spawnChance, roleId, roleDays };
}

// ================== ADMIN: ADD ITEM ==================
async function handleAddItem({ message, args }) {
  const member = message.member;
  if (!isShopAdmin(member)) {
    const embed = new EmbedBuilder()
      .setTitle('✧˚₊‧ ✖ PERMISSION DENIED ‧₊˚✧')
      .setDescription('You **cannot** manage the shop.')
      .setColor('#e74c3c');
    return message.channel.send({ embeds: [embed] });
  }

  const parsed = parseAddArgs(args);
  if (!parsed) {
    const embed = new EmbedBuilder()
      .setTitle('˗ˏˋ 📜 SHOP ADD USAGE ˎˊ˗')
      .setDescription(
        [
          '```',
          '.shop add "item name" "category" (coins) (silv) (chance%) ["roleId"] [days]',
          '',
          '✅ .shop add "Mystery Box" "Exclusive" 0 1 60',
          '✅ .shop add "Silv Invites" "Silv Shop" 0 1 80',
          '✅ .shop add "Diamond Sword" "Weapons" 1000 0 25',
          '✅ .shop add "VIP Role" "Special Roles" 0 5 75 "123456789" 30',
          '',
          'Note: Use quotes for multi-word names/categories',
          '```',
        ].join('\n'),
      )
      .setColor('#f1c40f');
    return message.channel.send({ embeds: [embed] });
  }

  const { name, itemId, category, priceCoins, priceSilv, spawnChance, roleId, roleDays } = parsed;

  if (roleDays && (Number.isNaN(roleDays) || roleDays < 0)) {
    const embed = new EmbedBuilder()
      .setTitle('✧˚₊‧ ✖ INVALID ROLE TIME ‧₊˚✧')
      .setDescription('Role time must be **0 or a positive number of days**.')
      .setColor('#e74c3c');
    return message.channel.send({ embeds: [embed] });
  }

  const existing = await ShopItem.findOne({ itemId });
  if (existing || itemId === SILV_TOKEN_ITEM.id) {
    const embed = new EmbedBuilder()
      .setTitle('✧˚₊‧ ✖ ITEM ALREADY EXISTS ‧₊˚✧')
      .setDescription(`Item ID \`${itemId}\` is already in the shop.`)
      .setColor('#e74c3c');
    return message.channel.send({ embeds: [embed] });
  }

  const item = new ShopItem({
    itemId,
    name,
    category,
    priceCoins,
    priceSilv,
    spawnChance,
    roleId: roleId || null,
    roleDays,
  });

  await item.save();

  const catEmoji = CATEGORY_EMOJIS[category] || '📦';

  const embed = new EmbedBuilder()
    .setTitle('˗ˏˋ 𐙚 ✅ SHOP ITEM ADDED 𐙚 ˎˊ˗')
    .setDescription(
      [
        `**${name}** \`(${itemId})\``,
        '',
        `**Category**  »  ${catEmoji} ${category}`,
        `**Coins**     »  ${priceCoins.toLocaleString()} 💰`,
        `**Silv**      »  ${priceSilv} ${SILV_TOKEN_ITEM.emoji}`,
        `**Chance**    »  ${spawnChance}%`,
        roleId ? `**Role**      »  <@&${roleId}>` : '',
        roleDays ? `**Role time** »  ${roleDays} day(s)` : '',
      ]
        .filter(Boolean)
        .join('\n'),
    )
    .setColor('#2ecc71');
  return message.channel.send({ embeds: [embed] });
}

// ================== ADMIN: REMOVE ITEM ==================
async function handleRemoveItem({ message, args }) {
  const member = message.member;
  if (!isShopAdmin(member)) {
    const embed = new EmbedBuilder()
      .setTitle('✧˚₊‧ ✖ PERMISSION DENIED ‧₊˚✧')
      .setDescription('You **cannot** manage the shop.')
      .setColor('#e74c3c');
    return message.channel.send({ embeds: [embed] });
  }

  const itemId = (args.join(' ') || '').toLowerCase().replace(/\s+/g, '_');
  if (!itemId) {
    const embed = new EmbedBuilder()
      .setTitle('˗ˏˋ 📜 SHOP REMOVE USAGE ˎˊ˗')
      .setDescription('```\n.shop remove item_id\n\nExample: .shop remove mystery_box\n```')
      .setColor('#f1c40f');
    return message.channel.send({ embeds: [embed] });
  }

  if (itemId === SILV_TOKEN_ITEM.id) {
    const embed = new EmbedBuilder()
      .setTitle('🛡 PROTECTED ITEM')
      .setDescription('**Silv token** is a core shop item and **cannot** be removed.')
      .setColor('#e67e22');
    return message.channel.send({ embeds: [embed] });
  }

  const item = await ShopItem.findOne({ itemId });
  if (!item) {
    const embed = new EmbedBuilder()
      .setTitle('✧˚₊‧ ✖ ITEM NOT FOUND ‧₊˚✧')
      .setDescription(`No item with ID \`${itemId}\` exists in the shop.`)
      .setColor('#e74c3c');
    return message.channel.send({ embeds: [embed] });
  }

  await ShopItem.deleteOne({ itemId });

  const embed = new EmbedBuilder()
    .setTitle('˗ˏˋ 🗑 ITEM REMOVED ˎˊ˗')
    .setDescription(`**${item.name}** \`(${itemId})\` was removed from the shop.`)
    .setColor('#e74c3c');
  return message.channel.send({ embeds: [embed] });
}

// ================== BUY - ALL ITEMS GO TO INVENTORY ==================
async function handleBuy({ message, args, userData, saveUserData }) {
  const itemId = (args[0] || '').toLowerCase();
  let amount = Number(args[1] || 1);

  if (!itemId) {
    const embed = new EmbedBuilder()
      .setTitle('˗ˏˋ 📜 SHOP BUY USAGE ˎˊ˗')
      .setDescription('```\n.shop buy item_id [amount]\n\nExample: .shop buy mystery_box 2\n```')
      .setColor('#f1c40f');
    return message.channel.send({ embeds: [embed] });
  }

  if (Number.isNaN(amount) || amount <= 0) amount = 1;

  userData.inventory = userData.inventory || {};
  const coins = userData.balance || 0;
  const silv = userData.inventory[SILV_TOKEN_ITEM.name] || 0;

  // ---- BUY SILV TOKEN ----
  if (itemId === SILV_TOKEN_ITEM.id) {
    const totalPrice = SILV_TOKEN_ITEM.priceCoins * amount;
    if (coins < totalPrice) {
      const missing = totalPrice - coins;
      const embed = new EmbedBuilder()
        .setTitle('✧˚₊‧ ✖ NOT ENOUGH COINS ‧₊˚✧')
        .setDescription([
          `**Needed**   »  ${totalPrice.toLocaleString()} 💰`,
          `**You have** »  ${coins.toLocaleString()} 💰`,
          `**Missing**  »  ${missing.toLocaleString()} 💰`,
        ].join('\n'))
        .setColor('#e74c3c');
      return message.channel.send({ embeds: [embed] });
    }

    userData.balance = coins - totalPrice;
    userData.inventory[SILV_TOKEN_ITEM.name] = (userData.inventory[SILV_TOKEN_ITEM.name] || 0) + amount;
  } else {
    // ---- BUY NORMAL ITEM ----
    const item = await ShopItem.findOne({ itemId });
    if (!item) {
      const embed = new EmbedBuilder()
        .setTitle('✧˚₊‧ ✖ ITEM NOT FOUND ‧₊˚✧')
        .setDescription(`No item with ID \`${itemId}\` exists in the shop.`)
        .setColor('#e74c3c');
      return message.channel.send({ embeds: [embed] });
    }

    // Force amount = 1 for roles
    if (item.roleId && amount > 1) amount = 1;
    
    const totalCoins = item.priceCoins * amount;
    const totalSilv = item.priceSilv * amount;

    // Payment logic
    if (item.priceSilv > 0) {
      if (silv < totalSilv) {
        const missing = totalSilv - silv;
        const embed = new EmbedBuilder()
          .setTitle('✧˚₊‧ ✖ NOT ENOUGH SILV ‧₊˚✧')
          .setDescription([
            `**Needed**   »  ${totalSilv} ${SILV_TOKEN_ITEM.emoji}`,
            `**You have** »  ${silv} ${SILV_TOKEN_ITEM.emoji}`,
            `**Missing**  »  ${missing} ${SILV_TOKEN_ITEM.emoji}`,
          ].join('\n'))
          .setColor('#e74c3c');
        return message.channel.send({ embeds: [embed] });
      }
      userData.inventory[SILV_TOKEN_ITEM.name] = silv - totalSilv;
    } else if (item.priceCoins > 0) {
      if (coins < totalCoins) {
        const missing = totalCoins - coins;
        const embed = new EmbedBuilder()
          .setTitle('✧˚₊‧ ✖ NOT ENOUGH COINS ‧₊˚✧')
          .setDescription([
            `**Needed**   »  ${totalCoins.toLocaleString()} 💰`,
            `**You have** »  ${coins.toLocaleString()} 💰`,
            `**Missing**  »  ${missing.toLocaleString()} 💰`,
          ].join('\n'))
          .setColor('#e74c3c');
        return message.channel.send({ embeds: [embed] });
      }
      userData.balance = coins - totalCoins;
    } else {
      const embed = new EmbedBuilder()
        .setTitle('⚠ NO PRICE SET')
        .setDescription('This item has **no price** configured.')
        .setColor('#f1c40f');
      return message.channel.send({ embeds: [embed] });
    }

    // ADD TO INVENTORY (ALWAYS for non-Silv items)
    const inventoryKey = item.name;
    userData.inventory[inventoryKey] = (userData.inventory[inventoryKey] || 0) + amount;

    // Give role if needed
    if (item.roleId) {
      try {
        const member = await message.guild.members.fetch(message.author.id);
        const role = message.guild.roles.cache.get(item.roleId);
        if (role && !member.roles.cache.has(item.roleId)) {
          await member.roles.add(role);
          if (item.roleDays && item.roleDays > 0) {
            const ms = item.roleDays * 24 * 60 * 60 * 1000;
            setTimeout(async () => {
              try {
                const freshMember = await message.guild.members.fetch(message.author.id);
                if (freshMember.roles.cache.has(item.roleId)) {
                  await freshMember.roles.remove(role);
                }
              } catch (e) {
                console.error('Failed to remove timed role:', e);
              }
            }, ms);
          }
        }
      } catch (err) {
        console.error('SHOP ROLE ERROR:', err);
      }
    }
  }

  // Save data
  await saveUserData({ balance: userData.balance, inventory: userData.inventory });

  // Success embed
  let embed;
  if (itemId === SILV_TOKEN_ITEM.id) {
    embed = new EmbedBuilder()
      .setTitle('˗ˏˋ 𐙚 ✅ PURCHASE COMPLETE 𐙚 ˎˊ˗')
      .setDescription(`꒰ঌ You bought **${amount}x** ${SILV_TOKEN_ITEM.emoji} **${SILV_TOKEN_ITEM.name}** ໒꒱`)
      .addFields(
        { name: '💰 New Balance', value: `**${userData.balance.toLocaleString()}** coins`, inline: true },
        { name: `${SILV_TOKEN_ITEM.emoji} Total Silv tokens`, value: `**${userData.inventory[SILV_TOKEN_ITEM.name]}x**`, inline: true }
      )
      .setColor('#27ae60')
      .setTimestamp()
      .setFooter({ text: 'System • Shop' });
  } else {
    const item = await ShopItem.findOne({ itemId });
    const fields = [
      { name: '💰 New Balance', value: `**${userData.balance.toLocaleString()}** coins`, inline: true },
      { name: `${SILV_TOKEN_ITEM.emoji} Silv tokens`, value: `**${userData.inventory[SILV_TOKEN_ITEM.name] || 0}x**`, inline: true },
      { name: '📦 Total Owned', value: `**${userData.inventory[item.name] || amount}x**`, inline: false },
    ];

    if (item.roleId) {
      fields.splice(2, 0, {
        name: '👑 Role',
        value: item.roleDays && item.roleDays > 0 ? `<@&${item.roleId}> for **${item.roleDays} day(s)**` : `<@&${item.roleId}> (permanent)`,
        inline: false,
      });
    }

    embed = new EmbedBuilder()
      .setTitle('˗ˏˋ 𐙚 ✅ PURCHASE COMPLETE 𐙚 ˎˊ˗')
      .setDescription(`꒰ঌ You bought **${amount}x** **${item.name}** \`(${item.itemId})\` ໒꒱`)
      .addFields(fields)
      .setColor('#27ae60')
      .setTimestamp()
      .setFooter({ text: 'System • Shop' });
  }

  return message.channel.send({ embeds: [embed] });
}

// ================== VIEW SHOP (.shop) ==================
async function showShop({ message }) {
  const now = Date.now();

  if (!shopCache.lastRollTime || now - shopCache.lastRollTime >= SHOP_REFRESH_MS) {
    let items = await ShopItem.find({}).sort({ category: 1, name: 1 });

    items = items.filter(it => {
      if (it.spawnChance >= 100) return true;
      return Math.random() * 100 < it.spawnChance;
    });

    const byCategory = {};

    const silvRoll = Math.random() * 100;
    if (silvRoll < SILV_TOKEN_ITEM.spawnChance) {
      byCategory[SILV_TOKEN_ITEM.category] = byCategory[SILV_TOKEN_ITEM.category] || [];
      byCategory[SILV_TOKEN_ITEM.category].push({
        itemId: SILV_TOKEN_ITEM.id,
        name: SILV_TOKEN_ITEM.name,
        priceCoins: SILV_TOKEN_ITEM.priceCoins,
        priceSilv: 0,
        roleId: null,
        spawnChance: SILV_TOKEN_ITEM.spawnChance,
        roleDays: 0,
      });
    }

    for (const it of items) {
      byCategory[it.category] = byCategory[it.category] || [];
      byCategory[it.category].push(it.toObject());
    }

    shopCache.lastRollTime = now;
    shopCache.itemsByCategory = byCategory;
  }

  const byCategory = shopCache.itemsByCategory || {};

  const embed = new EmbedBuilder()
    .setTitle('˗ˏˋ 🛍  D A I L Y   S H O P  𐙚 ˎˊ˗')
    .setDescription([
      '╭─────────── • ───────────╮',
      '**Use** `.shop buy ITEM_ID [amount]` **to purchase.**',
      `${SILV_TOKEN_ITEM.emoji} **Silv token** has an **80%** chance each refresh.`,
      '',
      '**Shop refreshes every 4 hours.**',
      '╰─────────── • ───────────╯',
    ].join('\n'))
    .setColor('#9b59b6')
    .setThumbnail(message.guild.iconURL())
    .setTimestamp();

  if (Object.keys(byCategory).length === 0) {
    embed.addFields({
      name: '🛒  TODAY\'S SHOP',
      value: '**Nothing spawned this cycle.**\nCome back after the next refresh.',
      inline: false,
    });
    embed.setFooter({ text: 'Shop refreshes every 4 hours', iconURL: message.author.displayAvatarURL() });
    return message.channel.send({ embeds: [embed] });
  }

  for (const [category, list] of Object.entries(byCategory)) {
    const emoji = CATEGORY_EMOJIS[category] || '📦';
    let value = '';

    for (const it of list) {
      const useSilv = it.priceSilv && it.priceSilv > 0;
      const priceText = useSilv ? `${it.priceSilv} ${SILV_TOKEN_ITEM.emoji}` : `${it.priceCoins.toLocaleString()} 💰`;
      const chanceText = `${it.spawnChance ?? 100}%`;
      const roleInfo = it.roleId ? 
        (it.roleDays && it.roleDays > 0 ? `\n> **Role**   »  <@&${it.roleId}> for **${it.roleDays} day(s)**` : `\n> **Role**   »  <@&${it.roleId}>`) : '';

      value += `\n**${it.name}** \`${it.itemId}\`\n> **Price**  »  ${priceText}\n> **Chance** »  ${chanceText}${roleInfo}\n`;
    }

    embed.addFields({
      name: `${emoji}  ${category.toUpperCase()}`,
      value: value || 'No items spawned in this category.',
      inline: false,
    });
  }

  embed.setFooter({ text: 'Shop refreshes every 4 hours', iconURL: message.author.displayAvatarURL() });
  return message.channel.send({ embeds: [embed] });
}
