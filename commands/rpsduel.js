// commands/rpsduel.js — Rock Paper Scissors against another player for coins. Both pick in secret (the card never
// shows a pick until both are in); a tie replays, up to 3 times, then it's a draw.
const { card, button, row } = require('../utils/casino');
const { ButtonStyle } = require('discord.js');
const { challenge } = require('../utils/wager');

const PICKS = { r: ['Rock', '🪨'], p: ['Paper', '📄'], s: ['Scissors', '✂️'] };
const BEATS = { r: 's', p: 'r', s: 'p' };

module.exports = {
  name: 'rpsduel',
  aliases: ['rpsd', 'rpsvs'],
  description: 'Rock Paper Scissors against a player for coins. `.rpsduel @user <amount>`',

  async execute(ctx) {
    const w = await challenge(ctx, { title: 'RPS Duel', emoji: '✊', usage: '> `.rpsduel @user <amount|all>` — both pick in secret, winner takes the pot.' });
    if (!w) return;
    const { msg, a, b, footer, finish } = w;
    const rows = [row(...Object.entries(PICKS).map(([k, [l, e]]) => button(`rpsd_${k}`, l, ButtonStyle.Primary, false, e)))];
    for (let round = 1; round <= 3; round++) {
      const pick = {};
      await msg.edit(card({ title: '✊ RPS Duel', body: `> ${a} vs ${b} — round ${round}\n-# Both pick — nobody sees yours until both are in. 45s.`, rows, footer })).catch(() => {});
      await new Promise((resolve) => {
        const col = msg.createMessageComponentCollector({ time: 45_000 });
        col.on('collect', async (i) => {
          if (![a.id, b.id].includes(i.user.id)) return i.reply({ content: 'Not your duel.', ephemeral: true }).catch(() => {});
          pick[i.user.id] = i.customId.slice(5);
          await i.reply({ content: `You picked **${PICKS[pick[i.user.id]][0]}** ${PICKS[pick[i.user.id]][1]}.`, ephemeral: true }).catch(() => {});
          if (pick[a.id] && pick[b.id]) col.stop();
        });
        col.on('end', resolve);
      });
      const pa = pick[a.id], pb = pick[b.id];
      if (!pa || !pb) {   // whoever didn't pick forfeits; nobody picked = a draw
        const winner = pa ? a.id : pb ? b.id : null;
        const res = await finish(winner);
        return msg.edit(card({ title: '✊ RPS Duel', body: `> ${winner ? `<@${pa ? b.id : a.id}> didn't pick — forfeit.` : 'Nobody picked.'}\n> ${res}`, footer })).catch(() => {});
      }
      const line = `> ${a.username} ${PICKS[pa][1]} vs ${PICKS[pb][1]} ${b.username}`;
      if (pa === pb) {
        if (round < 3) { await msg.edit(card({ title: '✊ RPS Duel', body: `${line}\n> Tie — again!`, footer })).catch(() => {}); await new Promise((r) => setTimeout(r, 1500)); continue; }
        const res = await finish(null);
        return msg.edit(card({ title: '✊ RPS Duel', body: `${line}\n> Three ties. ${res}`, footer })).catch(() => {});
      }
      const res = await finish(BEATS[pa] === pb ? a.id : b.id);
      return msg.edit(card({ title: '✊ RPS Duel', body: `${line}\n> ${res}`, footer, accent: 0x3FA34D })).catch(() => {});
    }
  },
};
