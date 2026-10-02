// commands/mines.js — Mines on one CV2 card: a 5×5 board, 6 mines, every safe tile raises the multiplier.
// Bets are taken atomically (casino.takeBet) and paid by increment (casino.settle) — a 5-minute board can never
// overwrite coins that arrive meanwhile. Left alone: it cashes you out (or refunds you if you never dug).
const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { takeBet, settle, replayRow, attachReplay, WIN, LOSE, BLACK } = require('../utils/casino');
const { pickUniqueIndices } = require('../utils/rng');
const { casinoPayout } = require('../utils/houseEdge');

const SESSIONS = new Map();
const GRID = 25;
const FIXED_MINES = 6;   // one board for everyone (direct: "no game should let the user select the difficulty")

// 6% edge: the multiplier is 0.94 / P(surviving that many reveals)
function calcMultiplier(mines, revealed) {
  if (revealed === 0) return 1.0;
  let prob = 1;
  for (let i = 0; i < revealed; i++) prob *= (GRID - mines - i) / (GRID - i);
  return Math.max(1.01, Math.round((0.94 / prob) * 100) / 100);
}

function safeCount(s) {
  let n = 0;
  for (const i of s.revealed) if (!s.mines.has(i)) n++;
  return n;
}

function render(s, status, guildName) {
  const found = safeCount(s);
  const multi = calcMultiplier(FIXED_MINES, found);
  const next = calcMultiplier(FIXED_MINES, found + 1);
  const accent = s.ended ? (s.result === 'boom' ? LOSE : s.result === 'cash' ? WIN : BLACK) : BLACK;
  const c = new ContainerBuilder().setAccentColor(accent)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## 💣 Mines\n# ×${multi.toFixed(2)}\n`
      + `> Bet **${s.bet.toLocaleString()}** · worth **${Math.floor(s.bet * multi).toLocaleString()}** now`
      + (s.ended ? '' : ` · next tile ×${next.toFixed(2)}`)
      + `\n> 💎 ${found} found · 💣 ${FIXED_MINES} hidden · ${GRID - FIXED_MINES - found} safe left`
      + (status ? `\n\n${status}` : '')))
    .addSeparatorComponents(new SeparatorBuilder());
  for (let r = 0; r < 5; r++) {
    const row = new ActionRowBuilder();
    for (let col = 0; col < 5; col++) {
      const idx = r * 5 + col;
      const shown = s.revealed.has(idx);
      const mine = s.mines.has(idx);
      const b = new ButtonBuilder().setCustomId(`mines_tile_${idx}`);
      if (shown) b.setEmoji(mine ? '💥' : '💎').setStyle(mine ? ButtonStyle.Danger : ButtonStyle.Success).setDisabled(true);
      else b.setLabel('·').setStyle(ButtonStyle.Secondary).setDisabled(s.ended);
      row.addComponents(b);
    }
    c.addActionRowComponents(row);
  }
  if (!s.ended) {
    c.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('mines_cashout')
      .setLabel(`Cash out ×${multi.toFixed(2)} (+${Math.max(0, Math.floor(s.bet * multi) - s.bet).toLocaleString()})`)
      .setEmoji('💰').setStyle(ButtonStyle.Primary).setDisabled(found === 0)));
  } else if (s.replay) {
    c.addActionRowComponents(replayRow('mines', s.bet));
  }
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${guildName} · ${FIXED_MINES} mines in 25 tiles, every board`));
  return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

module.exports = {
  name: 'mines',
  aliases: ['mine', 'mn'],
  description: 'Mines game. `.mines <bet>` — one board for everyone, ' + FIXED_MINES + ' mines.',

  async execute(ctx) {
    const { message, args } = ctx;
    const uid = message.author.id;
    if (SESSIONS.has(uid)) return message.channel.send('You already have a Mines board open — dig or cash out.');
    const taken = await takeBet(ctx, args[0], {
      title: '💣 Mines',
      body: `> \`.mines <bet>\` — ${FIXED_MINES} mines hide in 25 tiles. Every safe tile raises the multiplier; cash out before you hit one.\n> Or with buttons: \`.play\``,
    });
    if (!taken) return;
    const { bet, userData } = taken;
    const g = message.guild?.name || 'Shiro';
    const s = { bet, mines: new Set(pickUniqueIndices(GRID, FIXED_MINES)), revealed: new Set(), ended: false, result: null, replay: false };
    SESSIONS.set(uid, s);
    const msg = await message.channel.send(render(s, '', g));
    let col;

    const end = async (result, i = null) => {
      if (s.ended) return;
      s.ended = true;
      s.result = result;
      SESSIONS.delete(uid);
      if (col) col.stop('done');
      const found = safeCount(s);
      const multi = calcMultiplier(FIXED_MINES, found);
      let payout = 0;
      let status;
      if (result === 'boom') status = `💥 **Boom.** You hit a mine — **−${bet.toLocaleString()}** coins.`;
      else if (result === 'refund') { payout = bet; status = '⏱ Left alone before the first dig — your bet is back.'; }
      else {
        payout = casinoPayout(bet, Math.floor(bet * multi), userData);
        status = found === GRID - FIXED_MINES ? `🏆 **Perfect board!** Every safe tile — **+${(payout - bet).toLocaleString()}** coins.`
          : `💰 **Cashed out at ×${multi.toFixed(2)}** — **+${(payout - bet).toLocaleString()}** coins.` + (result === 'idle' ? ' (left alone — cashed out for you)' : '');
        s.result = 'cash';
      }
      for (const m of s.mines) s.revealed.add(m);
      const balance = await settle(ctx, { bet, payout, game: 'mines', detail: `${found} safe tiles, ${FIXED_MINES} mines` });
      s.replay = true;
      const view = render(s, `${status}\n> Balance **${balance.toLocaleString()}**`, g);
      if (i) await i.update(view).catch(() => msg.edit(view).catch(() => {}));
      else await msg.edit(view).catch(() => {});
      const finalText = `${status}\n> Balance **${balance.toLocaleString()}**`;
      attachReplay(msg, uid, { replay: { game: 'mines', bet }, final: () => { s.replay = false; return render(s, finalText, g); } });
    };

    let busy = false;
    col = msg.createMessageComponentCollector({ time: 5 * 60_000, filter: (i) => i.customId.startsWith('mines_') });
    col.on('collect', async (i) => {
      if (i.user.id !== uid) return i.reply({ content: 'Not your board — `.mines <bet>`.', ephemeral: true });
      if (s.ended || busy) return i.deferUpdate().catch(() => {});
      busy = true;
      try {
        if (i.customId === 'mines_cashout') return await end('cash', i);
        const idx = parseInt(i.customId.slice('mines_tile_'.length), 10);
        if (s.revealed.has(idx)) return i.deferUpdate();
        s.revealed.add(idx);
        if (s.mines.has(idx)) return await end('boom', i);
        if (safeCount(s) === GRID - FIXED_MINES) return await end('cash', i);
        return await i.update(render(s, '', g));
      } finally { busy = false; }
    });
    col.on('end', (_c, reason) => {
      if (reason !== 'done' && !s.ended) end(safeCount(s) > 0 ? 'idle' : 'refund');
    });
  },
};
