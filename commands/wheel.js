// commands/wheel.js — spin the wheel of fortune. 50 segments; the multipliers
// below average 0.91× per spin (a 9% house edge).
const { card, takeBet, settle, WIN, LOSE } = require('../utils/casino');
const { casinoPayout } = require('../utils/houseEdge');

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
    const strip = (c) => [-2, -1, 0, 1, 2].map((o) => WHEEL[(c + o + WHEEL.length) % WHEEL.length][1]).join(' ');
    let cur = Math.floor(Math.random() * WHEEL.length);
    const msg = await message.channel.send(card({ title: '🎡 Wheel', body: `# ${strip(cur)}\n> ${'　'.repeat(2)}🔺\n> Spinning…`, footer: guild }));
    for (const step of [7, 5, 3, 2]) {
      await sleep(650);
      cur = (cur + step) % WHEEL.length;
      await msg.edit(card({ title: '🎡 Wheel', body: `# ${strip(cur)}\n> ${'　'.repeat(2)}🔺\n> Spinning…`, footer: guild })).catch(() => {});
    }
    const [mult] = WHEEL[land];
    const payout = mult > 0 ? casinoPayout(bet, bet * mult, userData) : 0;
    const balance = await settle(ctx, { bet, payout, game: 'wheel', detail: `landed ×${mult}` });
    await sleep(650);
    await msg.edit(card({
      title: mult >= 1 ? '🎡 Winner' : '🎡 Wheel',
      body: `# ${strip(land)}\n> ${'　'.repeat(2)}🔺\n> Landed on **×${mult}** — ${payout - bet >= 0 ? `**+${(payout - bet).toLocaleString()}**` : `**−${(bet - payout).toLocaleString()}**`} coins.`,
      accent: payout > bet ? WIN : LOSE, footer: `${guild} · balance ${balance.toLocaleString()}\n${legend}`,
    })).catch(() => {});
  },
};
