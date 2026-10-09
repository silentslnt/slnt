// utils/wager.js — player-vs-player wagers (direct: "RPS / coinflip wagers, connect 4, battleship").
// challenge(): an Accept/Decline card for the opponent (60s). On accept BOTH stakes are taken atomically (each only if
// that player's balance still covers it; the first is refunded if the second can't pay). The game then calls
// finish(winnerId | null): the winner gets both stakes minus WAGER_FEE, a draw refunds both. Players only ever see
// "fee" — never where it goes (direct).
const User = require('../models/user');
const { card, button, row } = require('./casino');
const { ButtonStyle } = require('discord.js');
const { parseBet } = require('./parseBet');

const WAGER_FEE = 0.05;
const busy = new Set();   // one wager at a time per player
const fmt = (n) => Math.floor(n || 0).toLocaleString();

async function take(uid, bet) {
  return !!(await User.findOneAndUpdate({ userId: uid, balance: { $gte: bet } }, { $inc: { balance: -bet } }, { new: true }));
}
async function give(uid, n) {
  if (n > 0) await User.updateOne({ userId: uid }, { $inc: { balance: n } }, { upsert: true });
}

/** Returns { msg, finish(winnerId|null) } once accepted and staked, or null (declined / can't pay / busy). */
async function challenge(ctx, { title, emoji, usage }) {
  const { message, args, getUserData } = ctx;
  const a = message.author;
  const b = message.mentions.users.first();
  const footer = message.guild?.name || 'Shiro';
  const me = await getUserData(a.id);
  const bet = parseBet(args.find((x) => !/^<@!?\d+>$/.test(x)), me);
  if (!b || !bet) { await message.channel.send(card({ title: `${emoji} ${title}`, body: usage, footer })); return null; }
  if (b.id === a.id || b.bot) { await message.channel.send('Pick another player.'); return null; }
  if (busy.has(a.id) || busy.has(b.id)) { await message.channel.send('One of you is already in a wager.'); return null; }
  if ((me.balance || 0) < bet) { await message.channel.send(`You only have **${fmt(me.balance)}** coins.`); return null; }
  busy.add(a.id); busy.add(b.id);
  const free = () => { busy.delete(a.id); busy.delete(b.id); };
  const msg = await message.channel.send({
    ...card({ title: `${emoji} ${title}`, body: `> ${a} challenges ${b} — **${fmt(bet)}** coins each.\n`
      + `-# Winner takes the pot (${Math.round(WAGER_FEE * 100)}% fee). ${b.username}: 60 seconds to answer.`,
    rows: [row(button('wg_yes', 'Accept', ButtonStyle.Success), button('wg_no', 'Decline', ButtonStyle.Danger))], footer }),
    allowedMentions: { users: [b.id] },
  });
  // Every click is answered (an unanswered click shows "didn't respond in time"): only the challenged player can
  // accept; the challenger can call it off; anyone else is told it isn't theirs.
  const ans = await new Promise((resolve) => {
    const col = msg.createMessageComponentCollector({ time: 60_000, filter: (i) => i.customId === 'wg_yes' || i.customId === 'wg_no' });
    col.on('collect', async (i) => {
      if (i.user.id === b.id || (i.user.id === a.id && i.customId === 'wg_no')) { col.stop('answered'); return resolve(i); }
      const why = i.user.id === a.id ? `Waiting for ${b.username} to accept.` : 'This challenge isn\'t for you.';
      await i.reply({ content: why, ephemeral: true }).catch(() => {});
    });
    col.on('end', (_c, reason) => { if (reason !== 'answered') resolve(null); });
  });
  if (!ans || ans.customId === 'wg_no') {
    free();
    const why = !ans ? `${b.username} didn't answer.` : ans.user.id === a.id ? 'Called off.' : `${b.username} declined.`;
    if (ans) await ans.update(card({ title: `${emoji} ${title}`, body: `> ${why}`, footer })).catch(() => {});
    else await msg.edit(card({ title: `${emoji} ${title}`, body: `> ${why}`, footer, rows: [] })).catch(() => {});
    return null;
  }
  await ans.deferUpdate().catch(() => {});
  if (!(await take(a.id, bet))) { free(); await msg.edit(card({ title: `${emoji} ${title}`, body: `> ${a.username} can't cover the stake any more.`, footer })).catch(() => {}); return null; }
  if (!(await take(b.id, bet))) {
    await give(a.id, bet); free();
    await msg.edit(card({ title: `${emoji} ${title}`, body: `> ${b.username} can't cover the stake.`, footer })).catch(() => {});
    return null;
  }
  let done = false;
  const finish = async (winnerId) => {
    if (done) return '';
    done = true; free();
    if (!winnerId) { await give(a.id, bet); await give(b.id, bet); return `Draw — both stakes returned.`; }
    const pot = bet * 2;
    const fee = Math.floor(pot * WAGER_FEE);
    await give(winnerId, pot - fee);
    require('./houseBank').creditHouse(fee, 'wager_fee');
    require('./referralBonus').onWin(winnerId, bet - fee).catch(() => {});
    ctx.logAdminAction?.(winnerId, winnerId === a.id ? a.username : b.username, title.toLowerCase(), 'Wager won', null, null,
      `${fmt(pot - fee)} coins (${fmt(fee)} fee)`).catch?.(() => {});
    return `<@${winnerId}> takes **${fmt(pot - fee)}** coins.`;
  };
  return { msg, a, b, bet, footer, finish };
}

module.exports = { challenge, WAGER_FEE, busy };
