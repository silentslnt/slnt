// commands/store.js — unified SILV race-system hub, sectioned: Bait, Points
// Items, Spells. Deliberately separate from .sh (Shiro's own economy shop)
// and .artifact (the rare weekly SILV shop) — this is specifically the
// "browse everything for the race game" entry point, mixing Aether-priced
// and SILV-priced sections in one place since a player doesn't care which
// currency backs an item, they just want to see what's buyable.
const { EmbedBuilder, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { POINTS_ITEMS, SPELLS } = require('../utils/config');
const { getPoints, spendPoints, grantItem, setArtifactEffect, getOwnedItems, getSpellDisplay, awardPoints } = require('../utils/sentinelDb');
const { trackStat } = require('../utils/achievements');
const { sendShopUI } = require('../utils/shopUI');

const SILV_KEY  = 'Silv token';
const SILV_ICON = '<:zzsilvtoken:1486364646796431427>';
const BLACK     = 0x000000;

let pointsItemsSeeded = false;
// Points Items reuse the exact effect-kind system artifacts use — races.py's
// _artifact_bonus() doesn't care where an owned item came from, only that
// artifact_effects has a row for its itemId. Push once per process instead
// of on every purchase.
async function ensurePointsItemsSeeded() {
  if (pointsItemsSeeded) return;
  pointsItemsSeeded = true;
  for (const [id, item] of Object.entries(POINTS_ITEMS)) {
    await setArtifactEffect(id, 'points_item', item.effectKind, item.effectValue, item.drawbackKind, item.drawbackValue);
  }
}

function footer(message) {
  return { text: message.guild?.name || 'Shiro' };
}

async function showHub(ctx) {
  const { message } = ctx;
  const c = new ContainerBuilder().setAccentColor(BLACK)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## 🏪 SILV Store\nEverything Shiro sells for Sentinel's RPG. Pick a section:\n\n` +
      `> 🪢 **Items** — Points trinkets (Aether)\n` +
      `> ✨ **Spells** — cast with Sentinel's \`,cast\` (SILV)\n` +
      `> ⚔ **Gear** — premium Sentinel gear (SILV)\n\n` +
      `-# Bait, potions & regular gear: Sentinel's \`,shop\` · SILV ↔ coins/Aether: \`.convert\``))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('storehub_items').setLabel('Items').setEmoji('🪢').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('storehub_spells').setLabel('Spells').setEmoji('✨').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('storehub_gear').setLabel('Gear').setEmoji('⚔').setStyle(ButtonStyle.Primary),
    ))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${message.guild?.name || 'Shiro'}`));
  const msg = await message.channel.send({ components: [c], flags: MessageFlags.IsComponentsV2 });
  const col = msg.createMessageComponentCollector({ time: 120_000 });
  col.on('collect', async (i) => {
    if (i.user.id !== message.author.id) return i.reply({ content: 'Open your own with `.store`.', ephemeral: true });
    await i.deferUpdate();
    const which = i.customId.split('_')[1];
    if (which === 'items') return showPointsItems(ctx);
    if (which === 'spells') return showSpells(ctx);
    return showGear(ctx);
  });
}

async function showPointsItems({ message }) {
  if (!message.guild) return message.channel.send('Must be used in a server.');
  await ensurePointsItemsSeeded();
  const guild = message.guild;

  await sendShopUI({
    message,
    title: 'POINTS ITEMS',
    headerDesc: `> Small stat trinkets, Aether-priced — weaker than the SILV Artifact Shop's Relics/Charms, but common and always in stock.`,
    footerName: guild.name,
    buyPrefix: 'store_pi_',
    getItems: async () => Object.entries(POINTS_ITEMS).map(([id, item]) => ({
      id, name: item.name, emoji: item.emoji,
      valueText: `${item.description}\n**${item.aetherCost.toLocaleString()}** Aether`,
    })),
    onBuy: async (interaction, itemId) => {
      const item = POINTS_ITEMS[itemId];
      if (!item) return { ok: false, message: 'Unknown item.' };
      const owned = await getOwnedItems(guild.id, interaction.user.id);
      if (owned.includes(itemId)) {
        return { ok: false, message: `You already own **${item.name}**.` };
      }
      const spent = await spendPoints(guild.id, interaction.user.id, item.aetherCost);
      if (!spent) {
        const have = await getPoints(guild.id, interaction.user.id);
        return { ok: false, message: `Not enough Aether. Need **${item.aetherCost.toLocaleString()}**, you have **${have.toLocaleString()}**.` };
      }
      const delivered = await grantItem(guild.id, interaction.user.id, itemId, 1);
      if (!delivered) {
        await awardPoints(guild.id, interaction.user.id, item.aetherCost); // refund — see races: never silently eat a payment for a failed delivery
        return { ok: false, message: `Aether was refunded — couldn't deliver **${item.name}** right now (Sentinel bridge unreachable). Try again shortly.` };
      }
      return { ok: true, message: `Bought **${item.name}** for **${item.aetherCost.toLocaleString()}** Aether — effect is live immediately.` };
    },
  });
}

async function showSpells({ message, getUserData, saveSpecificUserData, logAdminAction }) {
  if (!message.guild) return message.channel.send('Must be used in a server.');
  const guild = message.guild;

  await sendShopUI({
    message,
    title: 'SPELLS',
    headerDesc: '> Cast in SILV with `,cast <spell> @member` — delivered to your Sentinel inventory instantly.',
    footerName: guild.name,
    buyPrefix: 'store_sp_',
    getItems: async () => {
      const live = await getSpellDisplay();
      return Object.entries(SPELLS).map(([id, s]) => ({
        id, name: s.name, emoji: s.emoji,
        valueText: `${live[id]?.description || s.effect}${s.raceLocked ? `\n*(${s.raceLocked}s only)*` : ''}\n**${s.silvCost}** ${SILV_ICON}`,
      }));
    },
    onBuy: async (interaction, itemId) => {
      const s = SPELLS[itemId];
      if (!s) return { ok: false, message: 'Unknown spell.' };
      const userData = await getUserData(interaction.user.id);
      userData.inventory = userData.inventory || {};
      const silv = userData.inventory[SILV_KEY] || 0;
      if (silv < s.silvCost) {
        return { ok: false, message: `Not enough SILV. Need **${s.silvCost}**, you have **${silv}**.` };
      }
      userData.inventory[SILV_KEY] = silv - s.silvCost;
      userData.stats = userData.stats || {};
      userData.stats.silvSpent = (userData.stats.silvSpent || 0) + s.silvCost;
      await saveSpecificUserData(interaction.user.id, { inventory: userData.inventory, stats: userData.stats });
      await trackStat(userData, 'silvSpent', 0, { saveUserData: (d) => saveSpecificUserData(interaction.user.id, d) });
      const delivered = await grantItem(guild.id, interaction.user.id, itemId, 1);
      await logAdminAction(interaction.user.id, interaction.user.username, 'store', 'Spell Purchase', null, null, `${s.name} for ${s.silvCost} SILV${delivered ? '' : ' (DELIVERY FAILED)'}`);
      if (!delivered) {
        return { ok: true, message: `**${s.silvCost}** SILV was spent, but delivery to Sentinel failed (bridge unreachable). Contact an admin for a manual grant or refund — don't re-buy yet.` };
      }
      return { ok: true, message: `**${s.name}** delivered to your SILV inventory. Cast with \`,cast ${itemId} @member\`.` };
    },
  });
}

// SILV-priced premium gear — delivered into Sentinel's user_inventory as
// `gear_<id>`, equipped with Sentinel's ,inventory. ids MUST match Sentinel's
// cogs/gear.py GEAR table or the item does nothing. Mythics are otherwise
// only World Boss drops, so SILV is the one paid shortcut to them.
const PREMIUM_GEAR = {
  heavens_edge:     { name: "Heaven's Edge",       emoji: '🌟', silvCost: 60, stats: '+22 PWR · +5 DEF (weapon, Mythic)' },
  seraph_aegis:     { name: 'Aegis of the Seraph', emoji: '🪽', silvCost: 60, stats: '+20 DEF · +60 HP (armor, Mythic)' },
  eye_of_the_abyss: { name: 'Eye of the Abyss',    emoji: '👁', silvCost: 60, stats: '+12 LCK · +5 SPD (accessory, Mythic)' },
  bloodthorn_blade: { name: 'Bloodthorn Blade',    emoji: '🩸', silvCost: 25, stats: '+16 PWR · +3 LCK · −15 HP (weapon, Legendary)' },
  dragonhide:       { name: 'Dragonhide Mantle',   emoji: '🔥', silvCost: 25, stats: '+16 DEF · +40 HP · −3 SPD (armor, Legendary)' },
  crown_of_thorns:  { name: 'Crown of Thorns',     emoji: '👑', silvCost: 25, stats: '+8 PWR · +5 LCK · −6 DEF (accessory, Legendary)' },
};

async function showGear({ message, getUserData, saveSpecificUserData, logAdminAction }) {
  if (!message.guild) return message.channel.send('Must be used in a server.');
  const guild = message.guild;
  await sendShopUI({
    message,
    title: 'PREMIUM GEAR',
    headerDesc: "> Top-tier gear for Sentinel's RPG — lands in your `,inventory`, equip it there. Stats scale with your RP.",
    footerName: guild.name,
    buyPrefix: 'store_gear_',
    getItems: async () => Object.entries(PREMIUM_GEAR).map(([id, g]) => ({
      id, name: g.name, emoji: g.emoji, valueText: `${g.stats}\n**${g.silvCost}** ${SILV_ICON}`,
    })),
    onBuy: async (interaction, itemId) => {
      const g = PREMIUM_GEAR[itemId];
      if (!g) return { ok: false, message: 'Unknown item.' };
      const userData = await getUserData(interaction.user.id);
      userData.inventory = userData.inventory || {};
      const silv = userData.inventory[SILV_KEY] || 0;
      if (silv < g.silvCost) return { ok: false, message: `Not enough SILV. Need **${g.silvCost}**, you have **${silv}**.` };
      userData.inventory[SILV_KEY] = silv - g.silvCost;
      userData.stats = userData.stats || {};
      userData.stats.silvSpent = (userData.stats.silvSpent || 0) + g.silvCost;
      await saveSpecificUserData(interaction.user.id, { inventory: userData.inventory, stats: userData.stats });
      const delivered = await grantItem(guild.id, interaction.user.id, `gear_${itemId}`, 1);
      if (!delivered) {
        userData.inventory[SILV_KEY] = (userData.inventory[SILV_KEY] || 0) + g.silvCost; // refund, never eat a payment
        userData.stats.silvSpent -= g.silvCost;
        await saveSpecificUserData(interaction.user.id, { inventory: userData.inventory, stats: userData.stats });
        return { ok: false, message: `SILV refunded — couldn't reach Sentinel right now. Try again shortly.` };
      }
      await logAdminAction(interaction.user.id, interaction.user.username, 'store', 'Gear Purchase', null, null, `${g.name} for ${g.silvCost} SILV`);
      return { ok: true, message: `**${g.name}** delivered — equip it with Sentinel's \`,inventory\`.` };
    },
  });
}

module.exports = {
  name: 'store',
  aliases: ['market'],
  description: 'SILV race-system shop hub — Points Items, spells, gear. `.store [items|spells|gear]`',
  async execute({ message, args, getUserData, saveSpecificUserData, logAdminAction }) {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'bait')             return message.channel.send('Bait is sold in Sentinel\'s shop now — `,shop` → Fishing.');
    if (sub === 'gear')             return showGear({ message, getUserData, saveSpecificUserData, logAdminAction });
    if (sub === 'items' || sub === 'points') return showPointsItems({ message });
    if (sub === 'spells')           return showSpells({ message, getUserData, saveSpecificUserData, logAdminAction });
    return showHub({ message, getUserData, saveSpecificUserData, logAdminAction });
  },
};
