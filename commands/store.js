// commands/store.js — unified SILV race-system hub, sectioned: Bait, Points
// Items, Spells. Deliberately separate from .sh (Shiro's own economy shop)
// and .artifact (the rare weekly SILV shop) — this is specifically the
// "browse everything for the race game" entry point, mixing Aether-priced
// and SILV-priced sections in one place since a player doesn't care which
// currency backs an item, they just want to see what's buyable.
const { EmbedBuilder, ContainerBuilder, TextDisplayBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { SPELLS } = require('../utils/config');
const { grantItem, getSpellDisplay } = require('../utils/sentinelDb');
const { trackStat } = require('../utils/achievements');
const { sendShopUI } = require('../utils/shopUI');

const SILV_KEY  = 'Silv token';
const SILV_ICON = '<:zzsilvtoken:1486364646796431427>';
const BLACK     = 0x000000;

function footer(message) {
  return { text: message.guild?.name || 'Shiro' };
}

function hubPayload(message) {
  const c = new ContainerBuilder().setAccentColor(BLACK)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## ${SILV_ICON} SILV Store\nPremium items for Sentinel's RPG, paid in SILV tokens:\n\n` +
      `> ✨ **Spells** — cast with Sentinel's \`,cast\`\n` +
      `> ⚔ **Gear** — the strongest Sentinel gear + Revive Token\n\n` +
      `-# Everything bought with Aether (gear, potions, bait, rods, trinkets) is in Sentinel's \`,shop\`. Coins → SILV → Aether: \`.convert\``))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('storehub_spells').setLabel('Spells').setEmoji('✨').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('storehub_gear').setLabel('Gear').setEmoji('⚔').setStyle(ButtonStyle.Primary),
    ))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${message.guild?.name || 'Shiro'}`));
  return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

// One card for the whole store: sections replace the hub in place and their
// Back button brings the hub back — nothing ever posts a second message.
async function showHub(ctx, interaction = null) {
  const { message } = ctx;
  let msg;
  if (interaction) {
    await interaction.update(hubPayload(message));
    msg = interaction.message;
  } else {
    msg = await message.channel.send(hubPayload(message));
  }
  const col = msg.createMessageComponentCollector({ time: 120_000, filter: (i) => i.customId.startsWith('storehub_') });
  col.on('collect', async (i) => {
    if (i.user.id !== message.author.id) return i.reply({ content: 'Open your own with `.store`.', ephemeral: true });
    col.stop('nav');
    const next = { ...ctx, interaction: i, onBack: (b) => showHub(ctx, b) };
    if (i.customId === 'storehub_spells') return showSpells(next);
    return showGear(next);
  });
  col.on('end', (_c, reason) => {
    if (reason === 'time') msg.edit({ components: [] }).catch(() => {});
  });
}

async function showSpells({ message, interaction, onBack, getUserData, saveSpecificUserData, logAdminAction }) {
  if (!message.guild) return message.channel.send('Must be used in a server.');
  const guild = message.guild;

  await sendShopUI({
    message, interaction, onBack,
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
  // Not gear — delivered raw (no gear_ prefix). Sentinel's ,race revive restores a lives-out wipe within 14 days.
  revive_token:     { name: 'Revive Token',        emoji: '✨', silvCost: 100, stats: 'Lost every life and got wiped? Buy this, then `,race revive` in Sentinel (within 14 days, before beginning again)', raw: true },
};

async function showGear({ message, interaction, onBack, getUserData, saveSpecificUserData, logAdminAction }) {
  if (!message.guild) return message.channel.send('Must be used in a server.');
  const guild = message.guild;
  await sendShopUI({
    message, interaction, onBack,
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
      const delivered = await grantItem(guild.id, interaction.user.id, g.raw ? itemId : `gear_${itemId}`, 1);
      if (!delivered) {
        userData.inventory[SILV_KEY] = (userData.inventory[SILV_KEY] || 0) + g.silvCost; // refund, never eat a payment
        userData.stats.silvSpent -= g.silvCost;
        await saveSpecificUserData(interaction.user.id, { inventory: userData.inventory, stats: userData.stats });
        return { ok: false, message: `SILV refunded — couldn't reach Sentinel right now. Try again shortly.` };
      }
      await logAdminAction(interaction.user.id, interaction.user.username, 'store', 'Gear Purchase', null, null, `${g.name} for ${g.silvCost} SILV`);
      return { ok: true, message: g.raw ? `**${g.name}** delivered — use it with Sentinel's \`,race revive\`.` : `**${g.name}** delivered — equip it with Sentinel's \`,inventory\`.` };
    },
  });
}

module.exports = {
  name: 'store',
  aliases: ['market'],
  description: 'SILV store — premium spells & gear for Sentinel\'s RPG. `.store [spells|gear]`',
  async execute({ message, args, getUserData, saveSpecificUserData, logAdminAction }) {
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'bait')             return message.channel.send('Bait is sold in Sentinel\'s shop now — `,shop` → Fishing.');
    if (sub === 'gear')             return showGear({ message, getUserData, saveSpecificUserData, logAdminAction });
    if (sub === 'items' || sub === 'points') return message.channel.send('Trinkets are sold for Aether in Sentinel\'s shop now — `,shop` → Trinkets.');
    if (sub === 'spells')           return showSpells({ message, getUserData, saveSpecificUserData, logAdminAction });
    return showHub({ message, getUserData, saveSpecificUserData, logAdminAction });
  },
};
