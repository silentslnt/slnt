// commands/wheel.js — spin the wheel of fortune. 50 segments; the multipliers
// below average 0.91× per spin (a 9% house edge).
const { card, takeBet, settle, WIN, LOSE, replayRow, attachReplay } = require('../utils/casino');
const { casinoPayout } = require('../utils/houseEdge');
const art = require('../utils/casinoArt');

// [multiplier, segments, emoji]
const SEGMENTS = [[0, 18, '⬛'], [0.5, 8, '🟫'], [1.2, 10, '🟦'], [1.5, 7, '🟩'], [2, 4, '🟨'], [3, 2, '🟧'], [5, 1, '🟥']];
const WHEEL = SEGMENTS.flatMap(([m, n, e]) => Array(n).fill([m, e]));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

module.exports = {
  name: 'wheel',
  aliases: ['wh', 'fortune'],
  description: 'Spin the wheel — 0× to 5×. `.wheel <bet>`',

  async execute(ctx) {
    const { message, args } = ctx;
    const legend = SEGMENTS.map(([m, n, e]) => `${e} **${m}×** (${n}/50)`).join(' · ');
    const taken = await takeBet(ctx, args[0], { title: 'Wheel', body: `> \`.wheel <bet>\` — spin once, win what it lands on.\n> ${legend}` });
    if (!taken) return;
    const { bet, userData } = taken;
    const guild = message.guild?.name || 'Shiro';
    const land = Math.floor(Math.random() * WHEEL.length);
    const strip = (c) => [-2, -1, 0, 1, 2].map((o) => WHEEL[(c + o + WHEEL.length) % WHEEL.length]);
    const spinning = (c) => card({ title: '🎡 Wheel', body: '-# Spinning…', footer: guild, image: { name: 'game.png', buffer: art.wheel({ strip: strip(c), bet }) } });
    let cur = Math.floor(Math.random() * WHEEL.length);
    const msg = await message.channel.send(spinning(cur));
    for (const step of [7, 5, 3, 2]) {
      await sleep(650);
      cur = (cur + step) % WHEEL.length;
      await msg.edit(spinning(cur)).catch(() => {});
    }
    const [mult] = WHEEL[land];
    const payout = mult > 0 ? casinoPayout(bet, bet * mult, userData) : 0;
    const balance = await settle(ctx, { bet, payout, game: 'wheel', detail: `landed ×${mult}` });
    await sleep(650);
    const final = (r) => card({
      rows: r ? [replayRow('wheel', bet)] : [],
      title: mult >= 1 ? '🎡 Winner' : '🎡 Wheel',
      body: `-# ${legend}`,
      image: { name: 'game.png', buffer: art.wheel({ strip: strip(land), mult, bet, payout, balance }) },
      accent: payout > bet ? WIN : LOSE, footer: guild,
    });
    await msg.edit(final(true)).catch(() => {});
    attachReplay(msg, message.author.id, { replay: { game: 'wheel', bet }, final: () => final(false) });
  },
};
