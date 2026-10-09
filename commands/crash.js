// commands/crash.js — the multiplier climbs until it crashes; cash out before it does.
// Crash point: P(reaching x) = 0.94 / x, so every cash-out target returns 94% on
// average (6% of rounds crash instantly at 1.00×). The server times everything.
const { card, button, row, takeBet, settle, WIN, LOSE, BLACK, ButtonStyle, replayRow, attachReplay } = require('../utils/casino');
const { casinoPayout, casinoLuck } = require('../utils/houseEdge');
const art = require('../utils/casinoArt');

const TICK_MS = 1500;
const GROWTH = 0.11;           // multiplier = e^(GROWTH * seconds)
const MAX_MULT = 100;
const active = new Set();

function rollCrash(luck) {
  const u = Math.random();
  const edge = 0.94 + luck;    // Luck Essence nudges it to 0.95 — still under 100% with Frenzy
  return Math.min(MAX_MULT, Math.max(1, Math.floor((edge / (1 - u)) * 100) / 100));
}

module.exports = {
  name: 'crash',
  aliases: ['cr'],
  description: 'Cash out before the multiplier crashes. `.crash <bet> [auto e.g. 2x]`',

  async execute(ctx) {
    const { message, args } = ctx;
    const uid = message.author.id;
    if (active.has(uid)) return message.channel.send('You already have a Crash round running.');
    const taken = await takeBet(ctx, args[0], {
      title: 'Crash',
      body: '> `.crash <bet>` — the multiplier climbs; press **Cash out** before it crashes.\n'
        + '> `.crash <bet> 2x` — auto cash-out at 2×.\n-# The longer you wait, the more it pays — and the likelier it crashes.',
    });
    if (!taken) return;
    const { bet, userData } = taken;
    const autoRaw = args[1] ? parseFloat(args[1].replace('x', '')) : NaN;
    const auto = Number.isFinite(autoRaw) && autoRaw >= 1.01 ? Math.min(MAX_MULT, autoRaw) : null;
    const crashAt = rollCrash(casinoLuck(userData));
    active.add(uid);

    const start = Date.now();
    const multAt = (t) => Math.min(MAX_MULT, Math.floor(Math.exp(GROWTH * (t / 1000)) * 100) / 100);
    const guild = message.guild?.name || 'Shiro';
    let done = false;

    const live = (m) => card({
      title: '🚀 Crash',
      body: `> Now worth **${Math.floor(bet * m).toLocaleString()}**`,
      image: { name: 'game.png', buffer: art.crash({ m, bet, auto }) },
      rows: [row(button('crash_out', `Cash out ×${m.toFixed(2)}`, ButtonStyle.Success))],
      accent: BLACK, footer: `${guild} · it can crash at any moment`,
    });
    const msg = await message.channel.send(live(1));

    const finish = async (cashed, at, i = null) => {
      if (done) return;
      done = true;
      clearInterval(timer);
      collector.stop();
      active.delete(uid);
      const payout = cashed ? casinoPayout(bet, bet * at, userData) : 0;
      const balance = await settle(ctx, { bet, payout, game: 'crash', detail: cashed ? `cashed at ×${at}` : `crashed at ×${crashAt}` });
      const view = (r) => card({
        rows: r ? [replayRow('crash', bet)] : [],
        title: cashed ? '🚀 Cashed out!' : '💥 Crashed',
        body: cashed ? `-# It would have crashed at ×${crashAt.toFixed(2)}.` : '',
        image: { name: 'game.png', buffer: art.crash({ m: cashed ? at : crashAt, crashed: !cashed, cashedAt: cashed ? at : null, bet, payout, balance }) },
        accent: cashed ? WIN : LOSE, footer: `${guild} · balance ${balance.toLocaleString()}`,
      });
      if (i) await i.update(view(true)).catch(() => {});
      else await msg.edit(view(true)).catch(() => {});
      attachReplay(msg, uid, { replay: { game: 'crash', bet }, final: () => view(false) });
    };

    const collector = msg.createMessageComponentCollector({ time: 120_000 });
    collector.on('collect', async (i) => {
      if (i.user.id !== uid) return i.reply({ content: 'Start your own with `.crash <bet>`.', ephemeral: true });
      const m = multAt(Date.now() - start);
      if (m >= crashAt) return finish(false, crashAt, i);
      return finish(true, m, i);
    });

    const timer = setInterval(async () => {
      if (done) return;
      const m = multAt(Date.now() - start);
      if (auto && auto <= m && auto < crashAt) return finish(true, auto);
      if (m >= crashAt) return finish(false, crashAt);
      await msg.edit(live(m)).catch(() => {});
    }, TICK_MS);
    if (crashAt <= 1.0) setTimeout(() => finish(false, crashAt), 600);
  },
};
