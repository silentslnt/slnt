// commands/payout.js — SILV → Robux payouts (direct: "simple neat system, no staff needed… no bugs no exploits").
//
// Player: `.payout` → Request → a form (how much SILV, gamepass link) → the bot tells them the exact price to put
// on the gamepass and checks it against Roblox → Confirm. The SILV goes into escrow the moment they confirm (one
// guarded atomic debit), the request is posted in the payout channel and the notify role is pinged. Whoever buys
// the pass presses Paid; Reject (or the player cancelling before it's handled) refunds the escrow exactly once —
// every status change is an atomic open→X transition, so a double click can never pay or refund twice.
//
// Owner: `.payout setup #channel @role`, `.payout fee on|off`, `.payout open|close`.
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle,
  MessageFlags, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits,
} = require('discord.js');
const { Payout, PayoutConfig } = require('../models/payout');
const { debit, credit } = require('../utils/atomicInv');
const { ADMIN_USER_IDS } = require('../utils/config');

const SILV_KEY = 'Silv token';
const SILV_ICON = '<:zzsilvtoken:1486364646796431427>';
const ROBUX_PER_SILV = 10;          // 100 SILV = 1,000 Robux
const MIN_SILV = 100;
const ROBLOX_CUT = 0.30;            // Roblox keeps 30% of every gamepass sale
const PASS_RE = /^(?:https?:\/\/)?(?:www\.|web\.)?roblox\.com\/game-pass\/(\d{3,15})(?:[/?#].*)?$/i;
const busy = new Set();

const V2 = MessageFlags.IsComponentsV2;
const EPH = MessageFlags.Ephemeral;
const text = (s) => new TextDisplayBuilder().setContent(s);
const box = (accent = 0x000000) => new ContainerBuilder().setAccentColor(accent);
const fmt = (n) => Number(n || 0).toLocaleString();

function priceFor(robux, cfg) {
  return cfg?.coverFee ? Math.ceil(robux / (1 - ROBLOX_CUT)) : robux;
}

function isStaff(member, cfg) {
  if (!member) return false;
  if (ADMIN_USER_IDS.includes(member.id)) return true;
  if (member.permissions?.has(PermissionFlagsBits.ManageGuild)) return true;
  return !!(cfg?.roleId && member.roles?.cache?.has(cfg.roleId));
}

/** Ask Roblox what the pass costs. Returns {ok, price, forSale, name, owner} or {ok:false} if Roblox didn't answer. */
async function passInfo(id) {
  const urls = [
    `https://apis.roblox.com/game-passes/v1/game-passes/${id}/product-info`,
    `https://economy.roblox.com/v1/game-pass/${id}/game-pass-product-info`,
  ];
  for (const url of urls) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(6000) });
      if (res.status === 404 || res.status === 400) return { ok: true, missing: true };
      if (!res.ok) continue;
      const j = await res.json();
      const price = j.PriceInRobux ?? j.priceInRobux ?? j.price ?? null;
      return {
        ok: true,
        price: price == null ? null : Number(price),
        forSale: j.IsForSale ?? j.isForSale ?? price != null,
        name: j.Name || j.name || '',
        owner: j.Creator?.Name || j.creator?.name || '',
      };
    } catch { /* try the next one */ }
  }
  return { ok: false };
}

function statusLine(p) {
  return { open: '🟡 Waiting to be paid', paid: '🟢 Paid', rejected: '🔴 Rejected — SILV refunded', cancelled: '⚪ Cancelled — SILV refunded' }[p.status];
}

// ── The player's card ─────────────────────────────────────────────────────────
async function playerCard(user, guild, cfg, live = true) {
  const fresh = await require('mongoose').model('User').findOne({ userId: user.id }).lean();
  const silv = fresh?.inventory?.[SILV_KEY] || 0;
  const open = await Payout.findOne({ userId: user.id, status: 'open' }).lean();
  const recent = await Payout.find({ userId: user.id }).sort({ createdAt: -1 }).limit(5).lean();
  const ready = cfg?.channelId && cfg.open !== false;
  const c = box().addTextDisplayComponents(text(
    `## ${SILV_ICON} Payout\n` +
    `# ${fmt(silv)} SILV\n-# = ${fmt(silv * ROBUX_PER_SILV)} Robux · 100 SILV = 1,000 Robux · minimum ${MIN_SILV} SILV`))
    .addSeparatorComponents(new SeparatorBuilder());
  if (open) {
    c.addTextDisplayComponents(text(
      `__**Your request**__\n> **${fmt(open.silv)} SILV → ${fmt(open.robux)} Robux** · ${statusLine(open)}\n` +
      `> Gamepass priced **${fmt(open.price)} Robux** · [link](${open.gamepassUrl})\n` +
      `-# Sent ${`<t:${Math.floor(new Date(open.createdAt).getTime() / 1000)}:R>`}. You'll get a DM when it's paid. Cancelling refunds your SILV.`));
  } else {
    c.addTextDisplayComponents(text(
      '__**How it works**__\n' +
      '> 1. Press **Request payout** and enter how much SILV and your gamepass link\n' +
      '> 2. Set your gamepass to the **exact price** the bot gives you (and put it on sale)\n' +
      '> 3. Press **Confirm** — your SILV is held until the pass is bought\n' +
      '> 4. You get a DM when you\'re paid. Rejected requests are refunded automatically.' +
      (cfg?.coverFee ? '' : `\n-# Roblox keeps 30% of gamepass sales, so a ${fmt(1000)} Robux pass pays you ${fmt(700)}.`)));
  }
  if (recent.length) {
    c.addSeparatorComponents(new SeparatorBuilder()).addTextDisplayComponents(text('__**History**__\n' + recent.map((p) =>
      `> ${fmt(p.silv)} SILV → ${fmt(p.robux)} Robux · ${statusLine(p)}${p.note ? ` · ${p.note}` : ''}`).join('\n')));
  }
  const row = new ActionRowBuilder();
  if (open) {
    row.addComponents(new ButtonBuilder().setCustomId('po_cancel').setLabel('Cancel my request').setStyle(ButtonStyle.Danger));
  } else {
    row.addComponents(new ButtonBuilder().setCustomId('po_request').setLabel('Request payout').setStyle(ButtonStyle.Success)
      .setDisabled(!ready || silv < MIN_SILV));
  }
  row.addComponents(new ButtonBuilder().setCustomId('po_refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary));
  if (live) c.addActionRowComponents(row);
  const why = !ready ? (cfg?.channelId ? 'Payouts are closed right now.' : 'Payouts aren\'t set up here yet.')
    : silv < MIN_SILV && !open ? `You need ${fmt(MIN_SILV - silv)} more SILV to request a payout.` : '';
  c.addTextDisplayComponents(text(`-# ${why ? why + ' · ' : ''}${guild.name}`));
  return { components: [c], flags: V2 };
}

// ── The request posted for staff ──────────────────────────────────────────────
function staffCard(p, user) {
  const done = p.status !== 'open';
  const c = box(done ? (p.status === 'paid' ? 0x2ecc71 : 0x555555) : 0xF1C40F)
    .addTextDisplayComponents(text(
      `## ${SILV_ICON} Payout request\n` +
      `> **Player:** <@${p.userId}>${user ? ` (${user.username})` : ''}\n` +
      `> **Amount:** ${fmt(p.silv)} SILV → **${fmt(p.robux)} Robux**\n` +
      `> **Buy this gamepass:** [${p.passName || `#${p.gamepassId}`}](${p.gamepassUrl}) — must cost **${fmt(p.price)} Robux**\n` +
      (p.passOwner ? `> **Pass made by:** ${p.passOwner}\n` : '') +
      (p.verified ? '> ✅ Price checked with Roblox when it was sent\n' : '> ⚠ Roblox couldn\'t be reached — check the price before buying\n') +
      `> **Status:** ${statusLine(p)}${p.handledBy ? ` by <@${p.handledBy}>` : ''}${p.note ? ` · ${p.note}` : ''}`));
  if (!done) {
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`po_paid:${p._id}`).setLabel('Paid').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`po_rej:${p._id}`).setLabel('Reject & refund').setStyle(ButtonStyle.Danger)));
  }
  c.addTextDisplayComponents(text(`-# Request ${p._id} · <t:${Math.floor(new Date(p.createdAt).getTime() / 1000)}:f>`));
  return c;
}

async function refreshStaff(client, p) {
  if (!p.channelId || !p.messageId) return;
  const ch = await client.channels.fetch(p.channelId).catch(() => null);
  const msg = ch && await ch.messages.fetch(p.messageId).catch(() => null);
  if (msg) await msg.edit({ components: [staffCard(p, null)], flags: V2, allowedMentions: { parse: [] } }).catch(() => {});
}

async function dm(client, userId, body) {
  const u = await client.users.fetch(userId).catch(() => null);
  if (u) await u.send({ components: [box().addTextDisplayComponents(text(body))], flags: V2 }).catch(() => {});
}

// ── Request flow (form → price check → confirm) ───────────────────────────────
async function startRequest(i, cfg, logAdminAction) {
  const modalId = `pom_${i.id}`;
  await i.showModal(new ModalBuilder().setCustomId(modalId).setTitle('Request a payout').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('silv').setLabel(`How much SILV? (min ${MIN_SILV})`)
      .setStyle(TextInputStyle.Short).setPlaceholder(String(MIN_SILV)).setRequired(true).setMaxLength(7)),
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('link').setLabel('Your gamepass link')
      .setStyle(TextInputStyle.Short).setPlaceholder('https://www.roblox.com/game-pass/123456789/…').setRequired(true).setMaxLength(200))));
  let sub;
  try {
    sub = await i.awaitModalSubmit({ time: 300_000, filter: (m) => m.customId === modalId && m.user.id === i.user.id });
  } catch { return; }
  const silv = Number(String(sub.fields.getTextInputValue('silv')).replace(/[,\s]/g, ''));
  const link = sub.fields.getTextInputValue('link').trim();
  const m = link.match(PASS_RE);
  if (!Number.isInteger(silv) || silv < MIN_SILV) return sub.reply({ content: `❌ Enter a whole number of SILV, at least ${MIN_SILV}.`, flags: EPH });
  if (!m) return sub.reply({ content: '❌ That isn\'t a gamepass link. It looks like `https://www.roblox.com/game-pass/123456789/name`.', flags: EPH });
  const have = (await require('mongoose').model('User').findOne({ userId: i.user.id }).lean())?.inventory?.[SILV_KEY] || 0;
  if (have < silv) return sub.reply({ content: `❌ You have ${fmt(have)} SILV.`, flags: EPH });
  const robux = silv * ROBUX_PER_SILV;
  const price = priceFor(robux, cfg);
  const passId = m[1];
  const url = `https://www.roblox.com/game-pass/${passId}`;

  const card = (note = '') => {
    const c = box().addTextDisplayComponents(text(
      `## Set your gamepass price\n# ${fmt(price)} Robux\n` +
      `> Payout: **${fmt(silv)} SILV → ${fmt(robux)} Robux**\n` +
      `> Gamepass: ${url}\n` +
      (cfg.coverFee ? `-# That price covers Roblox's 30% cut, so you receive the full ${fmt(robux)}.\n`
        : `-# Roblox keeps 30%, so you'll receive about ${fmt(Math.floor(robux * (1 - ROBLOX_CUT)))} Robux.\n`) +
      '> 1. Open the pass on Roblox → **Sales** → turn **Item for Sale** on\n' +
      `> 2. Set the price to exactly **${fmt(price)}** and save\n` +
      '> 3. Press **Confirm** — the bot checks the price with Roblox' + (note ? `\n\n${note}` : '')));
    c.addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('poc_yes').setLabel('Confirm').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId('poc_no').setLabel('Cancel').setStyle(ButtonStyle.Secondary)));
    return { components: [c], flags: V2 };
  };
  const reply = await sub.reply({ ...card(), flags: V2 | EPH, withResponse: true }).then((r) => r.resource?.message).catch(() => null);
  if (!reply) return;
  const col = reply.createMessageComponentCollector({ time: 600_000 });
  col.on('collect', async (b) => {
    if (b.customId === 'poc_no') {
      col.stop();
      return b.update({ components: [box().addTextDisplayComponents(text('Cancelled — nothing was taken.'))], flags: V2 });
    }
    if (busy.has(b.user.id)) return b.reply({ content: '⏳ One moment…', flags: EPH });
    busy.add(b.user.id);
    try {
      await b.deferUpdate();
      const cfgNow = await PayoutConfig.findOne({ guildId: b.guild.id }).lean();
      if (!cfgNow?.channelId || cfgNow.open === false) return b.editReply(card('❌ Payouts are closed right now.'));
      if (priceFor(robux, cfgNow) !== price) return b.editReply(card('❌ The payout rules just changed — start again with `.payout`.'));
      const info = await passInfo(passId);
      if (info.ok && info.missing) return b.editReply(card('❌ Roblox says that gamepass doesn\'t exist. Check the link.'));
      if (info.ok && info.price != null && info.price !== price) {
        return b.editReply(card(`❌ Your gamepass costs **${fmt(info.price)}** right now — set it to exactly **${fmt(price)}**, then press Confirm again.`));
      }
      if (info.ok && info.forSale === false) return b.editReply(card('❌ Your gamepass isn\'t on sale — turn **Item for Sale** on, then Confirm again.'));
      if (await Payout.exists({ userId: b.user.id, status: 'open' })) return b.editReply(card('❌ You already have a payout waiting.'));
      // Escrow: one guarded atomic debit — the SILV must really be there right now.
      if (!(await debit(b.user.id, { items: { [SILV_KEY]: silv } }))) return b.editReply(card(`❌ You don't have ${fmt(silv)} SILV anymore.`));
      let p;
      try {
        p = await Payout.create({
          userId: b.user.id, guildId: b.guild.id, silv, robux, price, gamepassId: passId, gamepassUrl: url,
          passName: info.name || '', passOwner: info.owner || '', verified: !!(info.ok && info.price != null),
        });
      } catch (e) {
        await credit(b.user.id, { items: { [SILV_KEY]: silv } }); // never keep escrow without a request
        const dup = e && e.code === 11000;
        return b.editReply(card(dup ? '❌ You (or that gamepass) already have a payout waiting.' : '❌ Something went wrong — your SILV was refunded.'));
      }
      const ch = await b.client.channels.fetch(cfgNow.channelId).catch(() => null);
      const ping = cfgNow.roleId ? `<@&${cfgNow.roleId}>` : '';
      const posted = ch && await ch.send({
        components: [...(ping ? [text(`${ping} — new payout request`)] : []), staffCard(p, b.user)], flags: V2,
        allowedMentions: { roles: cfgNow.roleId ? [cfgNow.roleId] : [] },
      }).catch(() => null);
      if (!posted) { // nowhere to post it — undo everything
        const undone = await Payout.findOneAndUpdate({ _id: p._id, status: 'open' }, { status: 'cancelled', note: 'payout channel unreachable' });
        if (undone) await credit(b.user.id, { items: { [SILV_KEY]: silv } });
        return b.editReply(card('❌ The payout channel is unreachable — your SILV was refunded. Tell staff.'));
      }
      await Payout.updateOne({ _id: p._id }, { channelId: posted.channelId, messageId: posted.id });
      await logAdminAction?.(b.user.id, b.user.username, 'payout', 'Payout requested', null, null, `${silv} SILV → ${robux} Robux · pass ${passId} @ ${price}`);
      col.stop();
      await b.editReply({ components: [box(0x2ecc71).addTextDisplayComponents(text(
        `## ✅ Payout requested\n> **${fmt(silv)} SILV** is held for your **${fmt(robux)} Robux** payout.\n` +
        '> Keep the gamepass on sale at the same price until you\'re paid — you\'ll get a DM.\n' +
        '-# Changed your mind? `.payout` → Cancel refunds it (until it\'s paid).'))], flags: V2 });
    } finally {
      busy.delete(b.user.id);
    }
  });
}

// ── Buttons that must work forever (staff card) ───────────────────────────────
async function handleInteraction(interaction) {
  if (!interaction.isButton() || !/^po_(paid|rej):/.test(interaction.customId)) return false;
  const [kind, id] = interaction.customId.split(':');
  const cfg = await PayoutConfig.findOne({ guildId: interaction.guildId }).lean();
  if (!isStaff(interaction.member, cfg)) {
    await interaction.reply({ content: 'Only staff (or the payout role) can handle payouts.', flags: EPH }).catch(() => {});
    return true;
  }
  const client = interaction.client;
  if (kind === 'po_paid') {
    const p = await Payout.findOneAndUpdate({ _id: id, status: 'open' },
      { status: 'paid', handledBy: interaction.user.id, handledAt: new Date() }, { new: true }).catch(() => null);
    if (!p) { await interaction.reply({ content: 'Already handled.', flags: EPH }).catch(() => {}); return true; }
    await interaction.update({ components: [staffCard(p, null)], flags: V2, allowedMentions: { parse: [] } }).catch(() => {});
    await dm(client, p.userId, `## ${SILV_ICON} You've been paid\n> Your gamepass was bought — **${fmt(p.robux)} Robux** for **${fmt(p.silv)} SILV**.\n-# Roblox can hold sales as pending for a few days before the Robux shows.`);
    return true;
  }
  // Reject: ask for a short reason, then refund exactly once.
  const modalId = `porj_${interaction.id}`;
  await interaction.showModal(new ModalBuilder().setCustomId(modalId).setTitle('Reject & refund').addComponents(
    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('why').setLabel('Reason (sent to the player)')
      .setStyle(TextInputStyle.Short).setRequired(false).setMaxLength(120).setPlaceholder('e.g. wrong price, pass not for sale'))));
  let sub;
  try {
    sub = await interaction.awaitModalSubmit({ time: 120_000, filter: (m) => m.customId === modalId && m.user.id === interaction.user.id });
  } catch { return true; }
  const why = sub.fields.getTextInputValue('why').trim();
  const p = await Payout.findOneAndUpdate({ _id: id, status: 'open' },
    { status: 'rejected', handledBy: interaction.user.id, handledAt: new Date(), note: why }, { new: true }).catch(() => null);
  if (!p) { await sub.reply({ content: 'Already handled.', flags: EPH }).catch(() => {}); return true; }
  await credit(p.userId, { items: { [SILV_KEY]: p.silv } });
  await sub.deferUpdate().catch(() => {});
  await refreshStaff(client, p);
  await dm(client, p.userId, `## Payout rejected\n> Your **${fmt(p.silv)} SILV** was refunded.${why ? `\n> Reason: ${why}` : ''}\n-# Fix it and request again with \`.payout\`.`);
  return true;
}

module.exports = {
  name: 'payout',
  aliases: ['cashout', 'withdraw'],
  adminOnly: false,
  description: `Cash SILV out for Robux (min ${MIN_SILV} SILV = ${MIN_SILV * ROBUX_PER_SILV} Robux). Staff: \`.payout setup #channel @role\`, \`.payout fee on|off\`, \`.payout open|close\`.`,
  handleInteraction,
  _internals: { playerCard, staffCard, priceFor, passInfo },

  async execute({ message, args, logAdminAction }) {
    if (!message.guild) return message.channel.send('Use this in the server.');
    const guild = message.guild;
    const sub = (args[0] || '').toLowerCase();
    if (['setup', 'fee', 'open', 'close'].includes(sub)) {
      const cfg0 = await PayoutConfig.findOne({ guildId: guild.id }).lean();
      if (!(ADMIN_USER_IDS.includes(message.author.id) || message.member?.permissions.has(PermissionFlagsBits.ManageGuild))) {
        return message.channel.send('❌ Only admins can change payout settings.');
      }
      if (sub === 'setup') {
        const ch = message.mentions.channels.first();
        const role = message.mentions.roles.first();
        if (!ch) return message.channel.send('Usage: `.payout setup #channel @role` — requests post in the channel and ping the role.');
        await PayoutConfig.updateOne({ guildId: guild.id }, { channelId: ch.id, roleId: role?.id || null }, { upsert: true });
        return message.channel.send(`✅ Payout requests will post in ${ch}${role ? ` and ping **${role.name}**` : ''}.`);
      }
      if (sub === 'fee') {
        const on = (args[1] || '').toLowerCase() === 'on';
        await PayoutConfig.updateOne({ guildId: guild.id }, { coverFee: on }, { upsert: true });
        return message.channel.send(on
          ? '✅ Players will be told to price their pass so they receive the full amount after Roblox\'s 30% (1,000 Robux → a 1,429 pass).'
          : '✅ Players will be told to price their pass at the payout amount (1,000 Robux → a 1,000 pass; they receive 700 after Roblox\'s cut).');
      }
      await PayoutConfig.updateOne({ guildId: guild.id }, { open: sub === 'open' }, { upsert: true });
      return message.channel.send(sub === 'open' ? '✅ Payouts are open.' : '✅ Payouts are closed — nobody can request until you `.payout open`.' + (cfg0 ? '' : ''));
    }

    let cfg = await PayoutConfig.findOne({ guildId: guild.id }).lean();
    const msg = await message.channel.send(await playerCard(message.author, guild, cfg));
    const col = msg.createMessageComponentCollector({ time: 300_000 });
    col.on('collect', async (i) => {
      if (i.user.id !== message.author.id) return i.reply({ content: 'Open your own with `.payout`.', flags: EPH }).catch(() => {});
      cfg = await PayoutConfig.findOne({ guildId: guild.id }).lean();
      if (i.customId === 'po_request') return startRequest(i, cfg, logAdminAction);
      if (i.customId === 'po_cancel') {
        const p = await Payout.findOneAndUpdate({ userId: i.user.id, status: 'open' },
          { status: 'cancelled', handledBy: i.user.id, handledAt: new Date(), note: 'cancelled by the player' }, { new: true });
        if (p) {
          await credit(i.user.id, { items: { [SILV_KEY]: p.silv } });
          await refreshStaff(i.client, p);
        }
        await i.update(await playerCard(i.user, guild, cfg)).catch(() => {});
        return i.followUp({ content: p ? `✅ Cancelled — **${fmt(p.silv)} SILV** refunded.` : 'Nothing to cancel — it was already handled.', flags: EPH }).catch(() => {});
      }
      return i.update(await playerCard(i.user, guild, cfg)).catch(() => {});
    });
    col.on('end', async () => msg.edit(await playerCard(message.author, guild, cfg, false)).catch(() => {}));
  },
};
