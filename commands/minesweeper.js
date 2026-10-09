// commands/minesweeper.js — a 12-tile board, 4 mines, clear all 8 safe tiles for a huge payout. Buttons, one CV2 card.
// Bets are atomic (casino.takeBet / settle). Cancelling refunds ONLY before the first pick — the old typed version
// refunded after picks too, which let anyone walk away from a bad board for free.
const { ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { takeBet, settle, replayRow, attachReplay, WIN, LOSE, BLACK, themeFor } = require('../utils/casino');
const { maxBetFor } = require('../utils/parseBet');

const SIZE = 12;
const MINES = 4;
const games = new Map();

function nCr(n, k) {
  let r = 1;
  for (let i = 0; i < k; i++) r = (r * (n - i)) / (i + 1);
  return r;
}
// fair odds of clearing the board = 1 / C(12, 4); it pays 92% of that
const CLEAR_MULT = Math.round(0.92 * nCr(SIZE, MINES) * 100) / 100;

function board() {
  const g = Array(SIZE).fill(false);
  for (let i = 0; i < MINES; i++) g[i] = true;
  for (let i = g.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [g[i], g[j]] = [g[j], g[i]];
  }
  return g;
}

function render(s, status, guildName) {
  const safeLeft = SIZE - MINES - s.picks.size;
  const accent = s.over ? (s.result === 'clear' ? WIN : s.result === 'boom' ? LOSE : themeFor('Minesweeper')) : themeFor('Minesweeper');
  const c = new ContainerBuilder().setAccentColor(accent)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## 🧨 Minesweeper\n> **${s.bet.toLocaleString()}** on the board · clear it for **×${CLEAR_MULT}** (**${Math.floor(s.bet * CLEAR_MULT).toLocaleString()}**)\n`
      + `> ✅ ${s.picks.size} safe · ${safeLeft} to go · 💣 ${MINES} hidden in ${SIZE}` + (status ? `\n\n${status}` : '')))
    .addSeparatorComponents(new SeparatorBuilder());
  for (let r = 0; r < 3; r++) {
    const row = new ActionRowBuilder();
    for (let col = 0; col < 4; col++) {
      const i = r * 4 + col;
      const open = s.picks.has(i) || s.over;
      const b = new ButtonBuilder().setCustomId(`ms_t_${i}`);
      if (open && s.grid[i]) b.setEmoji(s.picks.has(i) ? '💥' : '💣').setStyle(ButtonStyle.Danger).setDisabled(true);
      else if (open) b.setEmoji('✅').setStyle(s.picks.has(i) ? ButtonStyle.Success : ButtonStyle.Secondary).setDisabled(true);
      else b.setLabel(String(i + 1)).setStyle(ButtonStyle.Secondary);
      row.addComponents(b);
    }
    c.addActionRowComponents(row);
  }
  if (!s.over && s.picks.size === 0) {
    c.addActionRowComponents(new ActionRowBuilder().addComponents(new ButtonBuilder().setCustomId('ms_cancel')
      .setLabel('Walk away (refund — only before your first pick)').setStyle(ButtonStyle.Secondary)));
  }
  if (s.over && s.replay) c.addActionRowComponents(replayRow('minesweeper', s.bet));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${guildName} · all or nothing — no cashing out halfway`));
  return { components: [c], flags: MessageFlags.IsComponentsV2 };
}

module.exports = {
  name: 'minesweeper',
  aliases: ['msw'],
  description: `Minesweeper: ${SIZE} tiles, ${MINES} mines, clear them all for ×${CLEAR_MULT}. \`.minesweeper <bet>\``,

  async execute(ctx) {
    const { message, args } = ctx;
    const uid = message.author.id;
    if (games.has(uid)) return message.channel.send('You already have a Minesweeper board open.');
    const raw = (args[0] || '').toLowerCase() === 'start' ? args[1] : args[0];
    const taken = await takeBet(ctx, raw, {
      title: '🧨 Minesweeper',
      body: `> \`.minesweeper <bet>\` — ${SIZE} tiles, ${MINES} mines. Uncover all ${SIZE - MINES} safe tiles to win **×${CLEAR_MULT}**. One mine and it's gone.\n> Or with buttons: \`.play\``,
    });
    if (!taken) return;
    const { bet } = taken;
    const limit = maxBetFor(taken.userData);
    if (bet > limit) {   // refund anything over the table limit
      await settle(ctx, { bet, payout: bet, game: 'minesweeper', detail: 'over max bet' });
      return message.channel.send(`Max bet is **${limit.toLocaleString()}** coins — your bet was returned.`);
    }
    const g = message.guild?.name || 'Shiro';
    const s = { bet, grid: board(), picks: new Set(), over: false, result: null, replay: false };
    games.set(uid, s);
    const msg = await message.channel.send(render(s, '', g));
    let col;

    const end = async (result, i = null) => {
      if (s.over) return;
      s.over = true;
      s.result = result;
      games.delete(uid);
      if (col) col.stop('done');
      const payout = result === 'clear' ? Math.floor(bet * CLEAR_MULT) : result === 'refund' ? bet : 0;
      const balance = await settle(ctx, { bet, payout, game: 'minesweeper', detail: result === 'clear' ? 'board cleared' : undefined });
      const status = result === 'clear' ? `🏆 **Board cleared!** **+${(payout - bet).toLocaleString()}** coins.`
        : result === 'refund' ? '↩ You walked away — bet returned.'
          : result === 'idle' ? '⏱ Left alone mid-board — the bet is lost.'
            : `💥 **Boom.** **−${bet.toLocaleString()}** coins.`;
      const text = `${status}\n> Balance **${balance.toLocaleString()}**`;
      s.replay = result !== 'refund';
      const view = render(s, text, g);
      if (i) await i.update(view).catch(() => msg.edit(view).catch(() => {}));
      else await msg.edit(view).catch(() => {});
      if (s.replay) attachReplay(msg, uid, { replay: { game: 'minesweeper', bet }, final: () => { s.replay = false; return render(s, text, g); } });
    };

    let busy = false;
    col = msg.createMessageComponentCollector({ time: 5 * 60_000, filter: (i) => i.customId.startsWith('ms_') });
    col.on('collect', async (i) => {
      if (i.user.id !== uid) return i.reply({ content: 'Not your board — `.minesweeper <bet>`.', ephemeral: true });
      if (s.over || busy) return i.deferUpdate().catch(() => {});
      busy = true;
      try {
        if (i.customId === 'ms_cancel') {
          if (s.picks.size) return i.deferUpdate();
          return await end('refund', i);
        }
        const t = parseInt(i.customId.slice(5), 10);
        if (s.picks.has(t)) return i.deferUpdate();
        s.picks.add(t);
        if (s.grid[t]) return await end('boom', i);
        if (s.picks.size >= SIZE - MINES) return await end('clear', i);
        return await i.update(render(s, '', g));
      } finally { busy = false; }
    });
    // left alone: before a pick it's a refund, after one the board is forfeit (no free exit from a bad board)
    col.on('end', (_c, reason) => { if (reason !== 'done' && !s.over) end(s.picks.size ? 'idle' : 'refund'); });
  },
};
