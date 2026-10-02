// commands/trade.js — one shared trade window (direct: "make Shiro trade like Sentinel's — advanced, not manual").
// .trade @user → they Accept → a CV2 window both players drive with buttons:
//   Add items (pick from your own bag, then how many) · Coins… (set an amount) · Clear my offer · Confirm · Cancel.
// Any change to either offer clears BOTH confirmations (no last-second swaps). When both confirm, the swap runs
// guarded and atomic (utils/atomicInv): each side is debited only if they still hold everything; if the second side
// fails, the first is credited back — nothing is ever half-moved. One open trade per player; 5 minutes idle closes it.
const {
  ActionRowBuilder, ButtonStyle, MessageFlags, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { card, button, row } = require('../utils/casino');
const { debit, credit } = require('../utils/atomicInv');

const activeTrades = new Map();   // userId -> trade (both players point at the same object)
const IDLE_MS = 5 * 60_000;
const ASK_MS = 60_000;
const fmt = (n) => Math.floor(n || 0).toLocaleString();

function offerText(o) {
  const items = Object.entries(o.items).filter(([, n]) => n > 0).map(([k, n]) => `${n}× ${k}`);
  const parts = [];
  if (o.coins) parts.push(`🪙 \`${fmt(o.coins)}\` coins *(−10% transfer tax on arrival)*`);
  if (items.length) parts.push(...items.map((s) => `• ${s}`));
  return parts.length ? parts.map((p) => `> ${p}`).join('\n') : '> *nothing yet*';
}

function windowCard(t, guildName, note = '', closed = false) {
  const side = (uid, o, ok) => `### ${ok ? '✅' : '⏳'} <@${uid}>${ok ? ' — confirmed' : ''}\n${offerText(o)}`;
  const body = `${side(t.a, t.offers[t.a], t.ok[t.a])}\n\n${side(t.b, t.offers[t.b], t.ok[t.b])}`
    + (note ? `\n\n${note}` : '')
    + (closed ? '' : '\n\n-# Any change clears both confirmations. Both confirm → the swap happens at once.');
  const rows = closed ? [] : [
    row(button('tr_items', 'Add items', ButtonStyle.Primary, false, '🎒'), button('tr_coins', 'Coins…', ButtonStyle.Primary, false, '🪙'),
      button('tr_clear', 'Clear my offer', ButtonStyle.Secondary)),
    row(button('tr_ok', 'Confirm', ButtonStyle.Success, false, '✅'), button('tr_unok', 'Unconfirm', ButtonStyle.Secondary),
      button('tr_cancel', 'Cancel trade', ButtonStyle.Danger)),
  ];
  return card({ title: '🤝 Trade', body, rows, footer: `${guildName} · only the two traders can use this` });
}

function endTrade(t) {
  if (activeTrades.get(t.a) === t) activeTrades.delete(t.a);
  if (activeTrades.get(t.b) === t) activeTrades.delete(t.b);
  t.status = 'closed';
}

module.exports = {
  name: 'trade',
  description: 'Trade items and coins with another player in one shared window.',

  async execute({ message, args, getUserData, client, logAdminAction }) {
    const me = message.author;
    const guildName = message.guild?.name || 'Shiro';
    const sub = (args[0] || '').toLowerCase();

    if (sub === 'cancel') {   // a stuck window can always be closed by typing
      const t = activeTrades.get(me.id);
      if (!t) return message.channel.send(card({ title: '🤝 Trade', body: '> You have no open trade.', footer: guildName }));
      if (t.status === 'swapping') return message.channel.send('That trade is finishing right now.');
      endTrade(t);
      t.collector?.stop('cancelled');
      return message.channel.send(card({ title: '🤝 Trade cancelled', body: `> <@${t.a}> ↔ <@${t.b}> — nothing moved.`, footer: guildName }));
    }

    const other = message.mentions.users.first();
    if (!other) {
      return message.channel.send(card({ title: '🤝 Trade', body: '> `.trade @user` opens a shared trade window with them.\n> `.trade cancel` closes yours.', footer: guildName }));
    }
    if (other.bot) return message.channel.send('❌ You can\'t trade with a bot.');
    if (other.id === me.id) return message.channel.send('❌ You can\'t trade with yourself.');
    if (activeTrades.has(me.id)) return message.channel.send('❌ You already have an open trade — finish it or `.trade cancel`.');
    if (activeTrades.has(other.id)) return message.channel.send('❌ They already have an open trade.');

    // reserve both seats right away so two requests can't overlap
    const t = { a: me.id, b: other.id, offers: { [me.id]: { coins: 0, items: {} }, [other.id]: { coins: 0, items: {} } },
      ok: { [me.id]: false, [other.id]: false }, status: 'asking', collector: null };
    activeTrades.set(me.id, t);
    activeTrades.set(other.id, t);

    const ask = await message.channel.send(card({
      title: '🤝 Trade request',
      body: `> <@${me.id}> wants to trade with <@${other.id}>.\n-# ${other.username}, accept within a minute.`,
      rows: [row(button('tr_accept', 'Accept', ButtonStyle.Success), button('tr_decline', 'Decline', ButtonStyle.Danger))],
      footer: guildName,
    }));
    const answer = await ask.awaitMessageComponent({ time: ASK_MS, filter: async (i) => {
      if (i.user.id === other.id || (i.user.id === me.id && i.customId === 'tr_decline')) return true;
      await i.reply({ content: 'This request isn\'t for you.', flags: MessageFlags.Ephemeral }).catch(() => {});
      return false;
    } }).catch(() => null);
    if (!answer || answer.customId === 'tr_decline') {
      endTrade(t);
      const why = !answer ? 'No answer — the request expired.' : answer.user.id === me.id ? 'Withdrawn.' : 'Declined.';
      const payload = card({ title: '🤝 Trade request', body: `> <@${me.id}> ↔ <@${other.id}> — ${why}`, footer: guildName });
      return answer ? answer.update(payload).catch(() => {}) : ask.edit(payload).catch(() => {});
    }
    t.status = 'open';
    await answer.update(windowCard(t, guildName));
    const msg = ask;

    const refresh = (note = '') => msg.edit(windowCard(t, guildName, note)).catch(() => {});
    const changed = () => { t.ok[t.a] = false; t.ok[t.b] = false; };

    const col = msg.createMessageComponentCollector({ idle: IDLE_MS });
    t.collector = col;
    col.on('collect', async (i) => {
      const uid = i.user.id;
      if (uid !== t.a && uid !== t.b) return i.reply({ content: 'Only the two traders can use this window.', flags: MessageFlags.Ephemeral });
      if (t.status !== 'open') return i.reply({ content: 'This trade is already finishing.', flags: MessageFlags.Ephemeral });
      const mine = t.offers[uid];
      try {
        if (i.customId === 'tr_cancel') {
          endTrade(t);
          col.stop('cancelled');
          return i.update(windowCard(t, guildName, `❌ <@${uid}> cancelled the trade — nothing moved.`, true));
        }
        if (i.customId === 'tr_clear') {
          mine.coins = 0; mine.items = {}; changed();
          return i.update(windowCard(t, guildName, `<@${uid}> cleared their offer.`));
        }
        if (i.customId === 'tr_unok') {
          t.ok[uid] = false;
          return i.update(windowCard(t, guildName));
        }
        if (i.customId === 'tr_coins') {
          const mid = `trc_${i.id}`;
          await i.showModal(new ModalBuilder().setCustomId(mid).setTitle('Coins in your offer').addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('n').setLabel('How many coins? (0 to remove)').setStyle(TextInputStyle.Short)
              .setRequired(true).setMaxLength(14).setValue(String(mine.coins || 0)))));
          const sub2 = await i.awaitModalSubmit({ time: 120_000, filter: (m) => m.customId === mid && m.user.id === uid }).catch(() => null);
          if (!sub2) return;
          const n = parseInt(String(sub2.fields.getTextInputValue('n')).replace(/[, ]/g, ''), 10);
          if (!Number.isFinite(n) || n < 0) return sub2.reply({ content: 'Enter a whole number.', flags: MessageFlags.Ephemeral });
          const fresh = await getUserData(uid);
          if (n > (fresh.balance || 0)) return sub2.reply({ content: `You only have \`${fmt(fresh.balance)}\` coins.`, flags: MessageFlags.Ephemeral });
          if (t.status !== 'open') return sub2.reply({ content: 'This trade is closed.', flags: MessageFlags.Ephemeral });
          mine.coins = n; changed();
          await sub2.deferUpdate().catch(() => sub2.reply({ content: 'Updated.', flags: MessageFlags.Ephemeral }).catch(() => {}));
          return refresh(`<@${uid}> set their coins to \`${fmt(n)}\`.`);
        }
        if (i.customId === 'tr_items') {
          const fresh = await getUserData(uid);
          const bag = Object.entries(fresh.inventory || {}).filter(([, n]) => n > 0)
            .sort((x, y) => y[1] - x[1]).slice(0, 25);
          if (!bag.length) return i.reply({ content: 'Your bag is empty.', flags: MessageFlags.Ephemeral });
          const pick = await i.reply({
            content: 'Pick an item to put in (or change how many).',
            components: [new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('tr_pick').setPlaceholder('Your bag…')
              .addOptions(bag.map(([k, n]) => ({ label: k.slice(0, 100), value: k.slice(0, 100), description: `You have ${n} · offering ${mine.items[k] || 0}` }))))],
            flags: MessageFlags.Ephemeral, withResponse: true,
          });
          const pm = pick.resource?.message || await i.fetchReply();
          const si = await pm.awaitMessageComponent({ time: 120_000, filter: (x) => x.user.id === uid }).catch(() => null);
          if (!si) return;
          const item = si.values[0];
          const have = (fresh.inventory || {})[item] || 0;
          const mid = `tri_${si.id}`;
          await si.showModal(new ModalBuilder().setCustomId(mid).setTitle('How many?').addComponents(new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId('n').setLabel(`${item}`.slice(0, 45)).setStyle(TextInputStyle.Short)
              .setPlaceholder(`0 to remove · you have ${have}`).setRequired(true).setMaxLength(9).setValue(String(mine.items[item] || 1)))));
          const sub2 = await si.awaitModalSubmit({ time: 120_000, filter: (m) => m.customId === mid && m.user.id === uid }).catch(() => null);
          if (!sub2) return;
          const n = parseInt(String(sub2.fields.getTextInputValue('n')).replace(/[, ]/g, ''), 10);
          const now = (await getUserData(uid)).inventory?.[item] || 0;
          if (!Number.isFinite(n) || n < 0) return sub2.reply({ content: 'Enter a whole number.', flags: MessageFlags.Ephemeral });
          if (n > now) return sub2.reply({ content: `You only have ${now}× ${item}.`, flags: MessageFlags.Ephemeral });
          if (t.status !== 'open') return sub2.reply({ content: 'This trade is closed.', flags: MessageFlags.Ephemeral });
          if (n === 0) delete mine.items[item]; else mine.items[item] = n;
          changed();
          await sub2.reply({ content: n ? `✅ ${n}× ${item} in your offer.` : `Removed ${item}.`, flags: MessageFlags.Ephemeral }).catch(() => {});
          return refresh(`<@${uid}> ${n ? `put in ${n}× **${item}**` : `took out **${item}**`}.`);
        }
        if (i.customId === 'tr_ok') {
          const empty = (o) => !o.coins && !Object.values(o.items).some((n) => n > 0);
          if (empty(t.offers[t.a]) && empty(t.offers[t.b])) return i.reply({ content: 'Both offers are empty.', flags: MessageFlags.Ephemeral });
          t.ok[uid] = true;
          if (!(t.ok[t.a] && t.ok[t.b])) return i.update(windowCard(t, guildName));
          // both confirmed — lock synchronously before any await
          t.status = 'swapping';
          await i.update(windowCard(t, guildName, '⏳ Swapping…', true));
          const A = { balance: t.offers[t.a].coins, items: { ...t.offers[t.a].items } };
          const B = { balance: t.offers[t.b].coins, items: { ...t.offers[t.b].items } };
          let result;
          if (!(await debit(t.a, A))) result = `❌ <@${t.a}> no longer has everything they offered — nothing moved.`;
          else if (!(await debit(t.b, B))) {
            await credit(t.a, A);
            result = `❌ <@${t.b}> no longer has everything they offered — nothing moved.`;
          } else {
            const { TRANSFER_TAX } = require('../utils/config');
            const taxA = Math.floor(A.balance * TRANSFER_TAX), taxB = Math.floor(B.balance * TRANSFER_TAX);
            await credit(t.b, { ...A, balance: A.balance - taxA, stats: { trades: 1 } });
            await credit(t.a, { ...B, balance: B.balance - taxB, stats: { trades: 1 } });
            if (taxA + taxB) require('../utils/houseBank').creditHouse(taxA + taxB, 'transfer');
            result = '✅ **Trade complete.** Everything changed hands.' + (taxA + taxB ? `\n-# ${Math.round(TRANSFER_TAX * 100)}% transfer tax on coins: ${fmt(taxA + taxB)}` : '');
            const ua = await client.users.fetch(t.a).catch(() => null);
            const ub = await client.users.fetch(t.b).catch(() => null);
            const sum = (o) => [o.coins ? `${o.coins} coins` : '', ...Object.entries(o.items).map(([k, n]) => `${n}x ${k}`)].filter(Boolean).join(', ') || 'nothing';
            await logAdminAction?.(t.a, ua?.username || t.a, 'trade', 'Trade completed', t.b, ub?.username || t.b,
              `${ua?.username || t.a} gave ${sum(t.offers[t.a])} / ${ub?.username || t.b} gave ${sum(t.offers[t.b])}`);
          }
          endTrade(t);
          col.stop('done');
          return msg.edit(windowCard(t, guildName, result, true)).catch(() => {});
        }
        return i.deferUpdate();
      } catch (e) {
        console.error('trade:', e);
        if (!i.replied && !i.deferred) i.reply({ content: 'Something went wrong — try again.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    });
    col.on('end', (_c, reason) => {
      if (t.status === 'open') {
        endTrade(t);
        msg.edit(windowCard(t, guildName, '⌛ The trade window closed after 5 quiet minutes — nothing moved.', true)).catch(() => {});
      } else if (reason !== 'done' && reason !== 'cancelled') {
        endTrade(t);
      }
    });
  },
};
