// utils/shopUI.js — shared Dank Memer-style shop UI: item cards + inline Buy
// buttons + ◀ ▶ pagination. Originally built one-off for silvexchange.js and
// artifact.js's admin panel; extracted here so every shop section (essences,
// bundles, cosmetics, utility, aether, spells, the main .artifact shop) uses
// the exact same interaction pattern instead of drifting into N slightly
// different copies.
//
// Callers hand over a flat list of already-formatted item cards (id, label,
// value text, disabled flag) and a buy handler; this module owns rendering,
// pagination, the button collector, and re-rendering after every buy/nav.
const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

const PAGE_SIZE = 3;
const COLLECTOR_MS = 120_000;

function buildEmbed({ title, headerDesc, items, page, totalPages, footerName, color = 0x000000 }) {
  const pageItems = items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setFooter({ text: `${footerName || 'Shiro'} · Page ${page + 1}/${totalPages}` });
  if (headerDesc) embed.setDescription(headerDesc);
  for (const it of pageItems) {
    embed.addFields({
      name: `${it.emoji ? it.emoji + ' ' : ''}${it.name}${it.soldOut ? ' — SOLD OUT' : ''}`,
      value: it.valueText,
      inline: true,
    });
  }
  return embed;
}

function buildComponents({ items, page, totalPages, buyPrefix, hasBack }) {
  const pageItems = items.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE);
  const rows = [];

  if (pageItems.length) {
    const buyRow = new ActionRowBuilder();
    for (const it of pageItems) {
      buyRow.addComponents(
        new ButtonBuilder()
          .setCustomId(`${buyPrefix}buy_${it.id}`)
          .setLabel(`Buy ${it.name}`.slice(0, 80))
          .setStyle(ButtonStyle.Primary)
          .setDisabled(!!it.disabled || !!it.soldOut),
      );
    }
    rows.push(buyRow);
  }

  const nav = new ActionRowBuilder();
  if (hasBack) nav.addComponents(new ButtonBuilder().setCustomId(`${buyPrefix}back`).setLabel('Back').setEmoji('<a:carrow:1512498181391388802>').setStyle(ButtonStyle.Secondary));
  if (totalPages > 1) {
    nav.addComponents(
      new ButtonBuilder().setCustomId(`${buyPrefix}prev`).setLabel('◀').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
      new ButtonBuilder().setCustomId(`${buyPrefix}next`).setLabel('▶').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
    );
  }
  if (nav.components.length) rows.push(nav);
  return rows;
}

/**
 * @param {object} opts
 *   message       — the triggering message (used for channel + author check)
 *   interaction   — optional: a button press on an existing card (e.g. a hub).
 *                   The shop then REPLACES that card in place instead of
 *                   posting a new message (no channel flood).
 *   onBack        — optional async (interaction) => void — shows a Back
 *                   button that hands the card back to the caller (the hub).
 *   title         — embed title
 *   headerDesc    — optional text above the item cards
 *   footerName    — guild name for the footer
 *   buyPrefix     — unique customId prefix for this shop instance's buttons
 *   getItems      — async () => [{id, name, emoji, valueText, disabled, soldOut}]
 *                   called fresh on open AND after every buy/nav.
 *   onBuy         — async (interaction, itemId) => { ok: bool, message: str }
 *                   Must NOT reply to the interaction itself — sendShopUI
 *                   handles the ephemeral reply and the card re-render.
 */
async function sendShopUI({ message, interaction: opener, onBack, title, headerDesc, footerName, buyPrefix, getItems, onBuy }) {
  let items = await getItems();
  const hasBack = !!onBack;
  if (!items.length) {
    const empty = { content: 'Nothing available here right now — check back later.', embeds: [], components: [] };
    return opener ? opener.reply({ ...empty, ephemeral: true }) : message.channel.send(empty.content);
  }

  let page = 0;
  const totalPages = () => Math.max(1, Math.ceil(items.length / PAGE_SIZE));
  const payload = () => ({
    embeds: [buildEmbed({ title, headerDesc, items, page, totalPages: totalPages(), footerName })],
    components: buildComponents({ items, page, totalPages: totalPages(), buyPrefix, hasBack }),
  });

  let msg;
  if (opener) {
    await opener.update(payload());
    msg = opener.message;
  } else {
    msg = await message.channel.send(payload());
  }

  const collector = msg.createMessageComponentCollector({ time: COLLECTOR_MS, filter: (i) => i.customId.startsWith(buyPrefix) });

  collector.on('collect', async (interaction) => {
    if (interaction.user.id !== message.author.id) {
      return interaction.reply({ content: "This isn't your shop menu — run the command yourself.", ephemeral: true });
    }

    const id = interaction.customId;
    if (id === `${buyPrefix}back` && onBack) {
      collector.stop('back');
      return onBack(interaction);
    }
    if (id === `${buyPrefix}prev` || id === `${buyPrefix}next`) {
      page = id === `${buyPrefix}prev` ? Math.max(0, page - 1) : Math.min(totalPages() - 1, page + 1);
      items = await getItems();
      return interaction.update(payload());
    }

    if (id.startsWith(`${buyPrefix}buy_`)) {
      const itemId = id.slice(`${buyPrefix}buy_`.length);
      const result = await onBuy(interaction, itemId);
      await interaction.reply({ content: (result.ok ? '✅ ' : '') + result.message, ephemeral: true });
      items = await getItems();
      await msg.edit(payload()).catch(() => {});
    }
  });

  collector.on('end', (_c, reason) => {
    if (reason === 'time') msg.edit({ components: [] }).catch(() => {});
  });

  return msg;
}

module.exports = { sendShopUI, PAGE_SIZE };
