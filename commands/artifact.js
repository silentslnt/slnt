// commands/artifact.js — Artifact Shop: rare, time-gated, tiny-stock P2W items.
// Opens Friday 18:00 UTC -> Sunday 23:59:59 UTC each week. Only a random
// subset of the pool rolls into stock each window, and each one that does has
// a tiny fixed stock server-wide, first-come-first-served, gone once sold out
// until the pool rolls again next window.
const {
  EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { ArtifactPool, ArtifactWindow, ArtifactOverride } = require('../models/artifact');
const { getWindow } = require('../utils/artifactSchedule');
const { requireWhitelisted, isWhitelisted } = require('../utils/permissions');
const { grantItem, getOwnedItems, removeItem, setArtifactEffect } = require('../utils/sentinelDb');
const { sendShopUI } = require('../utils/shopUI');

const SILV_KEY  = 'Silv token';
const SILV_ICON = '<:zzsilvtoken:1486364646796431427>';
const BLACK     = 0x000000;

// The 8 artifacts designed in docs/artifact_spell_expansion.md — auto-seeded
// into the pool the first time ANYONE touches the Artifact Shop (view, buy,
// forceopen, panel), so `.artifact forceopen` always has something to put in
// stock instead of requiring the owner to manually run `.artifact add` eight
// times first. Fully editable/removable afterward via the pool commands or
// the `.artifact panel` UI — this is just a sane starting catalog, not a
// locked default.
const DEFAULT_ARTIFACTS = [
  { itemId: 'philosophers_stone', name: "Philosopher's Stone", emoji: '🪨', tier: 'relic',
    description: 'Turns fortune to gold — but gold is not food.',
    priceSilv: 40, stock: 1, effectKind: 'rp_mult', effectValue: 0.15,
    drawbackKind: 'aether_mult', drawbackValue: -0.10 },
  { itemId: 'crown_of_the_hollow', name: 'Crown of the Hollow', emoji: '👑', tier: 'relic',
    description: 'Power borrowed from the part of you already fading.',
    priceSilv: 45, stock: 1, effectKind: 'duel_roll', effectValue: 12,
    drawbackKind: 'corruption_mult', drawbackValue: 0.50 },
  { itemId: 'sea_iron_shackle', name: 'Sea-Iron Shackle', emoji: '⛓', tier: 'relic',
    description: 'Steady hands, heavy soul.',
    priceSilv: 45, stock: 1, effectKind: 'rob_success', effectValue: 0.15,
    drawbackKind: 'willpower_regen', drawbackValue: -3 },
  { itemId: 'ashbound_coal', name: 'Ashbound Coal', emoji: '🔥', tier: 'charm',
    description: 'Feeds the fire in you a little more every time.',
    priceSilv: 15, stock: 3, effectKind: 'chaos_mult', effectValue: 0.10,
    drawbackKind: 'corruption_mult', drawbackValue: 0.15 },
  { itemId: 'silver_thread', name: 'Silver Thread', emoji: '🕊', tier: 'charm',
    description: 'Ties you tighter to the Order, looser to yourself.',
    priceSilv: 15, stock: 3, effectKind: 'order_mult', effectValue: 0.10,
    drawbackKind: 'rp_mult', drawbackValue: -0.05 },
  { itemId: 'wardens_eye', name: "Warden's Eye", emoji: '👁', tier: 'charm',
    description: 'Everyone knows your name. Not everyone respects your hands.',
    priceSilv: 18, stock: 2, effectKind: 'bounty_mult', effectValue: 0.20,
    drawbackKind: 'rob_success', drawbackValue: -0.05 },
  { itemId: 'fading_ember', name: 'Fading Ember', emoji: '🕯', tier: 'charm',
    description: 'Warm enough to last. Not hot enough to strike.',
    priceSilv: 12, stock: 3, effectKind: 'willpower_regen', effectValue: 5,
    drawbackKind: 'duel_roll', drawbackValue: -5 },
  { itemId: 'gravekeepers_coin', name: "Gravekeeper's Coin", emoji: '🪙', tier: 'charm',
    description: "Greed always has a price — this one's just deferred.",
    priceSilv: 15, stock: 3, effectKind: 'aether_mult', effectValue: 0.12,
    drawbackKind: 'corruption_rob_fail_mult', drawbackValue: 0.10 },
  { itemId: 'race_reset_token', name: 'Race Reset Token', emoji: '🔄', tier: 'relic',
    description: 'Undo a choice you thought was permanent. Consumed on use via ,race reroll — no mechanical effect while owned.',
    priceSilv: 60, stock: 1, effectKind: null, effectValue: 0,
    drawbackKind: null, drawbackValue: 0 },
];

// Items added to DEFAULT_ARTIFACTS after an install's pool was already
// seeded won't retroactively appear — ensureSeeded's insertMany only runs
// once, on an empty pool. This backfills any DEFAULT_ARTIFACTS entry that's
// missing from an already-seeded pool, so a mid-session addition (like the
// race reset token) doesn't require the owner to manually .artifact add it.
async function backfillNewDefaults() {
  for (const a of DEFAULT_ARTIFACTS) {
    const exists = await ArtifactPool.exists({ itemId: a.itemId });
    if (exists) continue;
    try {
      await ArtifactPool.create({ ...a, roleId: null, roleDays: 0, active: true });
      await setArtifactEffect(a.itemId, a.tier, a.effectKind, a.effectValue, a.drawbackKind, a.drawbackValue);
    } catch (err) {
      if (err.code !== 11000) console.error(`[artifact] backfill of ${a.itemId} failed:`, err.message);
    }
  }
}

async function ensureSeeded() {
  const count = await ArtifactPool.countDocuments();
  if (count > 0) {
    await backfillNewDefaults();
    return;
  }
  try {
    await ArtifactPool.insertMany(
      DEFAULT_ARTIFACTS.map(a => ({ ...a, roleId: null, roleDays: 0, active: true })),
      { ordered: false },
    );
  } catch (err) {
    // E11000 = another process seeded it first between our count and insert — fine.
    if (err.code !== 11000) console.error('[artifact] auto-seed failed:', err.message);
    return;
  }
  // Push the defaults' mechanical effects into Sentinel's Postgres too —
  // without this, races.py would fall back to its ARTIFACT_EFFECTS dict,
  // which is fine (it's seeded with the same set), but pushing here means a
  // fresh install's artifacts are live-editable from day one instead of only
  // after the first manual seteffect edit.
  for (const a of DEFAULT_ARTIFACTS) {
    await setArtifactEffect(a.itemId, a.tier, a.effectKind, a.effectValue, a.drawbackKind, a.drawbackValue);
  }
}

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
    tier: a.tier, effectKind: a.effectKind, effectValue: a.effectValue,
    drawbackKind: a.drawbackKind, drawbackValue: a.drawbackValue,
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

async function showShop({ message, getUserData, saveSpecificUserData, logAdminAction }) {
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
  if (!doc.items.length) {
    return message.channel.send('The Artifact Shop is open, but nothing rolled into stock this week — check back next window.');
  }
  const closesIn = fmtCountdown(win.end.getTime() - Date.now());

  await sendShopUI({
    message,
    title: 'ARTIFACT SHOP',
    headerDesc: `> Closes in **${closesIn}**. First-come-first-served, no reservations.`,
    footerName: message.guild?.name,
    buyPrefix: 'art_shop_buy_',
    getItems: async () => {
      const win2 = await getWindow();
      const fresh = await getOrCreateWindow(win2);
      return fresh.items.map(it => {
        const soldOut = it.remainingStock <= 0;
        const tierTag = it.tier === 'relic' ? 'RELIC — 1 max' : it.tier === 'charm' ? 'CHARM' : null;
        return {
          id: it.itemId, name: it.name, emoji: it.emoji, soldOut,
          valueText: `${it.description}${tierTag ? `\n\`${tierTag}\`` : ''}\n` +
            `**${it.priceSilv.toLocaleString()}** ${SILV_ICON} · ${soldOut ? '0' : it.remainingStock}/${it.totalStock} left`,
        };
      });
    },
    onBuy: (interaction, itemId) => performArtifactPurchase({
      userId: interaction.user.id, username: interaction.user.username,
      guild: interaction.guild, itemId, getUserData, saveSpecificUserData, logAdminAction,
    }),
  });
}

// Shared purchase core — same split as shop.js's performPurchase: always
// re-fetches the buyer's current SILV via getUserData rather than trusting
// a snapshot from when the shop menu opened, and returns a result object
// instead of sending anything itself so both the button and the text
// `.artifact buy <id>` path render it their own way.
async function performArtifactPurchase({ userId, username, guild, itemId, getUserData, saveSpecificUserData, logAdminAction }) {
  const win = await getWindow();
  if (!win.isOpen) return { ok: false, message: 'The Artifact Shop is closed right now.' };

  const doc = await getOrCreateWindow(win);
  const item = doc.items.find(i => i.itemId === itemId);
  if (!item) return { ok: false, message: "That artifact isn't in stock this window." };

  if (item.tier === 'relic' && guild) {
    const relicPool = await ArtifactPool.find({ tier: 'relic' });
    const relicIds = new Set(relicPool.map(a => a.itemId));
    const owned = await getOwnedItems(guild.id, userId);
    const ownsOtherRelic = owned.some(i => relicIds.has(i) && i !== itemId);
    if (ownsOtherRelic) {
      return {
        ok: false,
        message: `${item.emoji} **${item.name}** is a **Relic** — only one may be carried at a time. ` +
          `You already hold a different Relic; an admin can clear it with \`.artifact clearitem @user <id>\` if you want to swap.`,
      };
    }
  }

  const userData = await getUserData(userId);
  userData.inventory = userData.inventory || {};
  const silv = userData.inventory[SILV_KEY] || 0;
  if (silv < item.priceSilv) {
    return { ok: false, message: `Not enough SILV. Need **${item.priceSilv.toLocaleString()}**, you have **${silv.toLocaleString()}**.` };
  }

  // Atomic, race-safe stock reservation — the $gt: 0 guard means two concurrent
  // buyers can never both decrement the last unit. Whoever's update lands first
  // wins; the loser's query matches nothing and modifiedCount is 0.
  const reserved = await ArtifactWindow.findOneAndUpdate(
    { windowStart: win.start, 'items.itemId': itemId, 'items.remainingStock': { $gt: 0 } },
    { $inc: { 'items.$.remainingStock': -1 } },
  );
  if (!reserved) {
    return { ok: false, message: `${item.emoji} **${item.name}** just sold out — you were too slow.` };
  }

  userData.inventory[SILV_KEY] = silv - item.priceSilv;
  await saveSpecificUserData(userId, { inventory: userData.inventory });

  if (item.roleId && guild) {
    try {
      const role = await guild.roles.fetch(item.roleId);
      const member = await guild.members.fetch(userId);
      if (role) await member.roles.add(role, `Artifact Shop: ${item.name}`);
    } catch { /* role grant is best-effort, purchase already succeeded */ }
  }
  // Always land in user_inventory (not just when there's no role) so Sentinel's
  // races.py ARTIFACT_EFFECTS lookup can see it — a relic/charm with BOTH a role
  // and a passive effect needs both grants, not one or the other.
  let delivered = true;
  if (guild && (item.effectKind || !item.roleId)) {
    delivered = await grantItem(guild.id, userId, itemId, 1);
  }

  await logAdminAction(
    userId, username, 'artifact', 'Artifact Purchase',
    null, null, `${item.name} for ${item.priceSilv} SILV${delivered ? '' : ' (DELIVERY FAILED)'}`
  );

  if (!delivered) {
    return {
      ok: true,
      title: 'SILV CHARGED — DELIVERY FAILED',
      description: `${item.emoji} **${item.name}**'s effect couldn't be delivered to Sentinel right now (bridge unreachable), though your stock slot and SILV are already spent. Contact an admin for a manual grant — don't re-buy, the stock is gone either way.`,
    };
  }
  return {
    ok: true,
    title: 'ARTIFACT ACQUIRED',
    description: `${item.emoji} **${item.name}** is yours. ${item.description} SILV spent: **${item.priceSilv.toLocaleString()}**.`,
  };
}

// Thin wrapper for the text `.artifact buy <id>` path — same core as the
// shop UI's Buy button.
async function buyArtifact({ message, args, getUserData, saveSpecificUserData, logAdminAction }) {
  const itemId = (args[0] || '').toLowerCase();
  if (!itemId) return message.channel.send('Usage: `.artifact buy <id>`');

  const result = await performArtifactPurchase({
    userId: message.author.id, username: message.author.username,
    guild: message.guild, itemId, getUserData, saveSpecificUserData, logAdminAction,
  });

  if (!result.ok) return message.channel.send(result.message);
  return message.channel.send({
    embeds: [new EmbedBuilder().setColor(BLACK).setTitle(result.title)
      .setDescription(`> ${result.description}`)
      .setFooter({ text: message.guild?.name || 'Shiro' })],
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

// Sets/clears the mechanical effect on a pool item — kept separate from
// poolAdd so admins can tune an existing artifact's numbers without
// re-typing the full add command (and risking a typo'd description/price).
// Valid effectKind/drawbackKind values: see docs/artifact_spell_expansion.md.
// This PUSHES to Sentinel's artifact_effects table (setArtifactEffect) in the
// same call — that table is what races.py actually reads, so this takes
// effect immediately in-game, not just in the shop's display text.
async function poolSetEffect({ message, args }) {
  if (!await requireWhitelisted(message)) return;
  // .artifact seteffect <id> <relic|charm|none> <effectKind|-> <effectValue> [drawbackKind|-] [drawbackValue]
  const [itemId, tier, effectKind, effectValue, drawbackKind, drawbackValue] = args;
  if (!itemId || !tier || !effectKind || effectValue === undefined) {
    return message.channel.send(
      'Usage: `.artifact seteffect <id> <relic|charm|none> <effectKind|-> <effectValue> [drawbackKind|-] [drawbackValue]`'
    );
  }
  const update = {
    tier,
    effectKind: effectKind === '-' ? null : effectKind,
    effectValue: Number(effectValue) || 0,
    drawbackKind: !drawbackKind || drawbackKind === '-' ? null : drawbackKind,
    drawbackValue: Number(drawbackValue) || 0,
  };
  const doc = await ArtifactPool.findOneAndUpdate({ itemId: itemId.toLowerCase() }, update);
  if (!doc) return message.channel.send(`No pool item with id \`${itemId}\`. Add it first with \`.artifact add\`.`);
  const pushed = await setArtifactEffect(
    itemId.toLowerCase(), update.tier, update.effectKind, update.effectValue, update.drawbackKind, update.drawbackValue
  );
  return message.channel.send(
    `Updated \`${itemId}\` — tier **${tier}**, effect \`${update.effectKind}\`=${update.effectValue}${update.drawbackKind ? `, drawback \`${update.drawbackKind}\`=${update.drawbackValue}` : ''}.` +
    (pushed ? '' : '\n-# ⚠ Could not reach Sentinel\'s DB — this is only saved in Shiro right now, the in-game bonus is unchanged until the push succeeds.')
  );
}

// Admin escape hatch for the one-Relic-at-a-time rule — removes one item
// from a member's Sentinel inventory so they can buy a different Relic.
async function clearItem({ message, args }) {
  if (!await requireWhitelisted(message)) return;
  const target = message.mentions.users.first();
  const itemId = (args[1] || '').toLowerCase();
  if (!target || !itemId) return message.channel.send('Usage: `.artifact clearitem @user <id>`');
  await removeItem(message.guild.id, target.id, itemId);
  return message.channel.send(`Removed \`${itemId}\` from ${target.tag}'s inventory.`);
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

// ── Admin panel — button/select/modal driven, no memorizing subcommand syntax.
// This is the answer to "how do I see the stock, see the items, manipulate
// it" — everything in poolAdd/poolRemove/poolSetEffect/forceOpen/forceClose
// above is also reachable here without typing a single argument by hand.

function fmtItemLine(a) {
  const tierTag = a.tier === 'relic' ? 'RELIC·1max' : a.tier === 'charm' ? 'CHARM' : 'plain';
  const eff = a.effectKind ? `${a.effectKind}=${a.effectValue}` : 'no effect';
  const draw = a.drawbackKind ? `, ${a.drawbackKind}=${a.drawbackValue}` : '';
  return `> ${a.active ? a.emoji : '🚫'} **${a.name}** \`${a.itemId}\` \`${tierTag}\`${a.active ? '' : ' *(retired)*'}\n` +
         `> ${a.priceSilv.toLocaleString()} SILV · stock ${a.stock}/window · ${eff}${draw}`;
}

async function buildPanel() {
  await ensureSeeded();
  const win = await getWindow();
  const pool = await ArtifactPool.find({}).sort({ itemId: 1 });

  const statusLine = win.isOpen
    ? `🟢 **Open** — closes in ${fmtCountdown(win.end.getTime() - Date.now())}${win.forced ? ' *(forced open)*' : ''}`
    : `🔴 **Closed** — opens in ${fmtCountdown(win.nextStart.getTime() - Date.now())}`;

  const desc = pool.length
    ? `${statusLine}\n\n` + pool.map(fmtItemLine).join('\n\n')
    : `${statusLine}\n\nPool is empty — this shouldn't normally happen (auto-seed failed). Use the Add Item button below.`;

  const embed = new EmbedBuilder()
    .setColor(BLACK)
    .setTitle('ARTIFACT SHOP — ADMIN PANEL')
    .setDescription(desc)
    .setFooter({ text: 'Select an item below to remove it, retire/restore it, or edit its effect.' });

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('art_forceopen').setLabel('Force Open 24h').setStyle(ButtonStyle.Success),
    new ButtonBuilder().setCustomId('art_forceclose').setLabel('Force Close').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('art_add').setLabel('Add Item').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('art_refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary),
  );

  const rows = [controlRow];
  if (pool.length) {
    const select = new StringSelectMenuBuilder()
      .setCustomId('art_select')
      .setPlaceholder('Select an artifact to manage...')
      .addOptions(pool.slice(0, 25).map(a => ({
        label: `${a.name} (${a.itemId})`,
        description: `${a.tier} · ${a.priceSilv} SILV · ${a.active ? 'active' : 'retired'}`,
        value: a.itemId,
        emoji: a.emoji || undefined,
      })));
    rows.push(new ActionRowBuilder().addComponents(select));
  }

  return { embeds: [embed], components: rows };
}

function itemManageRow(itemId, active) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId(`art_editeffect_${itemId}`).setLabel('Edit Effect').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId(`art_toggle_${itemId}`).setLabel(active ? 'Retire' : 'Restore').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId(`art_delete_${itemId}`).setLabel('Delete Permanently').setStyle(ButtonStyle.Danger),
  );
}

async function panel({ message }) {
  if (!await requireWhitelisted(message)) return;
  const view = await buildPanel();
  const panelMsg = await message.channel.send(view);

  const collector = panelMsg.createMessageComponentCollector({ time: 15 * 60 * 1000 });

  collector.on('collect', async (interaction) => {
    if (!isWhitelisted({ author: interaction.user })) {
      return interaction.reply({ content: 'Owner-level whitelist only.', ephemeral: true });
    }

    try {
      if (interaction.customId === 'art_forceopen') {
        await ArtifactOverride.findOneAndUpdate(
          { key: 'singleton' }, { key: 'singleton', endsAt: new Date(Date.now() + 24 * 60 * 60 * 1000) }, { upsert: true },
        );
        await interaction.update(await buildPanel());
      } else if (interaction.customId === 'art_forceclose') {
        await ArtifactOverride.deleteOne({ key: 'singleton' });
        await interaction.update(await buildPanel());
      } else if (interaction.customId === 'art_refresh') {
        await interaction.update(await buildPanel());
      } else if (interaction.customId === 'art_add') {
        const modal = new ModalBuilder().setCustomId('art_modal_add').setTitle('Add Artifact');
        const fields = [
          ['itemId', 'Item ID (lowercase, no spaces)', 'e.g. amulet_of_silence'],
          ['name', 'Display Name', "e.g. Amulet of Silence"],
          ['priceStock', 'Price (SILV) and Stock — "price stock"', 'e.g. 20 3'],
          ['description', 'Description (flavor text)', 'Shown in the shop listing'],
          ['emoji', 'Emoji (optional, defaults to 🏺)', '🏺'],
        ];
        modal.addComponents(fields.map(([id, label, placeholder]) =>
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId(id).setLabel(label).setPlaceholder(placeholder)
              .setStyle(TextInputStyle.Short).setRequired(id !== 'emoji'),
          )
        ));
        await interaction.showModal(modal);
      } else if (interaction.customId === 'art_select') {
        const itemId = interaction.values[0];
        const item = await ArtifactPool.findOne({ itemId });
        if (!item) return interaction.reply({ content: 'That item no longer exists.', ephemeral: true });
        await interaction.reply({
          embeds: [new EmbedBuilder().setColor(BLACK).setTitle(item.name).setDescription(fmtItemLine(item))],
          components: [itemManageRow(item.itemId, item.active)],
          ephemeral: true,
        });
      } else if (interaction.customId.startsWith('art_toggle_')) {
        const itemId = interaction.customId.replace('art_toggle_', '');
        const current = await ArtifactPool.findOne({ itemId });
        if (!current) return interaction.reply({ content: 'That item no longer exists.', ephemeral: true });
        const updated = await ArtifactPool.findOneAndUpdate({ itemId }, { active: !current.active }, { new: true });
        await interaction.reply({ content: `\`${itemId}\` is now **${updated.active ? 'active' : 'retired'}**.`, ephemeral: true });
        await panelMsg.edit(await buildPanel()).catch(() => {});
      } else if (interaction.customId.startsWith('art_delete_')) {
        const itemId = interaction.customId.replace('art_delete_', '');
        await ArtifactPool.deleteOne({ itemId });
        await interaction.reply({ content: `\`${itemId}\` permanently deleted from the pool.`, ephemeral: true });
        await panelMsg.edit(await buildPanel()).catch(() => {});
      } else if (interaction.customId.startsWith('art_editeffect_')) {
        const itemId = interaction.customId.replace('art_editeffect_', '');
        const item = await ArtifactPool.findOne({ itemId });
        if (!item) return interaction.reply({ content: 'That item no longer exists.', ephemeral: true });
        const modal = new ModalBuilder().setCustomId(`art_modal_effect_${itemId}`).setTitle(`Effect: ${item.name}`.slice(0, 45));
        const fields = [
          ['tier', 'Tier (relic / charm / none)', item.tier || 'none'],
          ['effectKind', 'Effect kind (see artifact_spell_expansion.md)', item.effectKind || '-'],
          ['effectValue', 'Effect value (e.g. 0.15 or 12)', String(item.effectValue ?? 0)],
          ['drawbackKind', 'Drawback kind (- for none)', item.drawbackKind || '-'],
          ['drawbackValue', 'Drawback value', String(item.drawbackValue ?? 0)],
        ];
        modal.addComponents(fields.map(([id, label, val]) =>
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId(id).setLabel(label).setValue(val)
              .setStyle(TextInputStyle.Short).setRequired(id !== 'drawbackKind'),
          )
        ));
        await interaction.showModal(modal);
      }
    } catch (err) {
      console.error('[artifact panel] interaction failed:', err.message);
    }
  });

  collector.on('end', () => panelMsg.edit({ components: [] }).catch(() => {}));

  // Modal submissions arrive as a separate event on the client, not the
  // component collector — listen narrowly for this panel message's modals
  // and clean the listener up when the panel's own collector ends.
  const modalHandler = async (interaction) => {
    if (!interaction.isModalSubmit()) return;
    if (!isWhitelisted({ author: interaction.user })) return;

    if (interaction.customId === 'art_modal_add') {
      const itemId = interaction.fields.getTextInputValue('itemId').toLowerCase().trim();
      const name = interaction.fields.getTextInputValue('name').trim();
      const [priceSilv, stock] = interaction.fields.getTextInputValue('priceStock').trim().split(/\s+/).map(Number);
      const description = interaction.fields.getTextInputValue('description').trim();
      const emoji = interaction.fields.getTextInputValue('emoji')?.trim() || '🏺';
      if (!itemId || !priceSilv || !stock) {
        return interaction.reply({ content: 'Invalid input — need a valid item ID and "price stock" as two numbers.', ephemeral: true });
      }
      await ArtifactPool.findOneAndUpdate(
        { itemId },
        { itemId, name, description, priceSilv, stock, emoji, active: true },
        { upsert: true },
      );
      await interaction.reply({ content: `Added **${name}** \`${itemId}\`. Select it in the panel to set its effect.`, ephemeral: true });
    } else if (interaction.customId.startsWith('art_modal_effect_')) {
      const itemId = interaction.customId.replace('art_modal_effect_', '');
      const tier = interaction.fields.getTextInputValue('tier').trim();
      const effectKindRaw = interaction.fields.getTextInputValue('effectKind').trim();
      const effectValue = Number(interaction.fields.getTextInputValue('effectValue').trim()) || 0;
      const drawbackKindRaw = interaction.fields.getTextInputValue('drawbackKind').trim();
      const drawbackValue = Number(interaction.fields.getTextInputValue('drawbackValue').trim()) || 0;
      const resolvedTier = ['relic', 'charm'].includes(tier) ? tier : 'none';
      const resolvedEffectKind = effectKindRaw === '-' ? null : effectKindRaw;
      const resolvedDrawbackKind = !drawbackKindRaw || drawbackKindRaw === '-' ? null : drawbackKindRaw;
      await ArtifactPool.findOneAndUpdate({ itemId }, {
        tier: resolvedTier,
        effectKind: resolvedEffectKind,
        effectValue,
        drawbackKind: resolvedDrawbackKind,
        drawbackValue,
      });
      const pushed = await setArtifactEffect(itemId, resolvedTier, resolvedEffectKind, effectValue, resolvedDrawbackKind, drawbackValue);
      await interaction.reply({
        content: `Updated \`${itemId}\`'s effect — live in-game immediately.` +
          (pushed ? '' : "\n⚠ Couldn't reach Sentinel's DB — saved in Shiro only, the in-game bonus is unchanged until this succeeds."),
        ephemeral: true,
      });
    } else {
      return;
    }
    panelMsg.edit(await buildPanel()).catch(() => {});
  };
  message.client.on('interactionCreate', modalHandler);
  collector.on('end', () => message.client.removeListener('interactionCreate', modalHandler));
}

module.exports = {
  name: 'artifact',
  aliases: ['artifacts', 'ashop'],
  description: 'Rare weekly Artifact Shop. `.artifact` to view, `.artifact buy <id>` to purchase, `.artifact panel` for the admin dashboard.',
  async execute({ message, args, getUserData, saveSpecificUserData, logAdminAction }) {
    await ensureSeeded();
    const sub = (args[0] || '').toLowerCase();
    if (sub === 'buy')       return buyArtifact({ message, args: args.slice(1), getUserData, saveSpecificUserData, logAdminAction });
    if (sub === 'add')       return poolAdd({ message, args: args.slice(1) });
    if (sub === 'remove')    return poolRemove({ message, args: args.slice(1) });
    if (sub === 'pool')      return poolList({ message });
    if (sub === 'seteffect') return poolSetEffect({ message, args: args.slice(1) });
    if (sub === 'clearitem') return clearItem({ message, args: args.slice(1) });
    if (sub === 'forceopen') return forceOpen({ message, args: args.slice(1) });
    if (sub === 'forceclose') return forceClose({ message });
    if (sub === 'panel')     return panel({ message });
    return showShop({ message, getUserData, saveSpecificUserData, logAdminAction });
  },
};
