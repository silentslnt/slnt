// commands/tower.js — climb floor by floor; each floor hides a trap behind one
// of the doors. Cash out whenever you like. Multiplier after n floors =
// 0.94 / P(surviving n floors) — a 6% house edge at every floor.
const { card, button, row, takeBet, settle, WIN, LOSE, BLACK, ButtonStyle } = require('../utils/casino');
const { casinoPayout } = require('../utils/houseEdge');

const FLOORS = 8;
// difficulty -> [doors per floor, safe doors]
const MODES = { easy: [3, 2], medium: [2, 1], hard: [3, 1] };
const EDGE = 0.94;
const active = new Set();

function multiplier(mode, floors) {
  if (floors === 0) return 1;
  const [doors, safe] = MODES[mode];
  return Math.floor((EDGE / Math.pow(safe / doors, floors)) * 100) / 100;
}

module.exports = {
  name: 'tower',
  aliases: ['tw'],
  description: 'Climb the tower, avoid the traps, cash out any time. `.tower <bet> [easy|medium|hard]`',

  async execute(ctx) {
    const { message, args } = ctx;
    const uid = message.author.id;
    if (active.has(uid)) return message.channel.send('You already have a Tower run going.');
    const mode = MODES[(args[1] || '').toLowerCase()] ? args[1].toLowerCase() : 'easy';
    const taken = await takeBet(ctx, args[0], {
      title: 'Tower',
      body: '> `.tower <bet> [easy|medium|hard]` — pick a door on each floor. A trap ends the run.\n'
        + `> **Easy** 2 safe of 3 · **Medium** 1 safe of 2 · **Hard** 1 safe of 3 — ${FLOORS} floors.\n-# Cash out any time to keep what you've climbed.`,
    });
    if (!taken) return;
    const { bet, userData } = taken;
    active.add(uid);
    const [doors, safe] = MODES[mode];
    const guild = message.guild?.name || 'Shiro';
    let floor = 0;
    let traps = null;           // trap doors for the current floor
    const history = [];
    const newFloor = () => {
      const idx = [...Array(doors).keys()].sort(() => Math.random() - 0.5);
      traps = new Set(idx.slice(0, doors - safe));
    };
    newFloor();

    const view = () => {
      const now = multiplier(mode, floor);
      const next = multiplier(mode, floor + 1);
      const doorRow = row(...[...Array(doors).keys()].map((d) => button(`tw_door_${d}`, `Door ${d + 1}`, ButtonStyle.Primary)));
      const cash = row(button('tw_cash', floor ? `Cash out ×${now} (${Math.floor(bet * now).toLocaleString()})` : 'Cash out', ButtonStyle.Success, floor === 0));
      const tower = [...Array(FLOORS).keys()].reverse()
        .map((f) => `\`${String(f + 1).padStart(2)}\` ${f < floor ? '🟩' : f === floor ? '➡️' : '⬛'}  ×${multiplier(mode, f + 1)}`).join('\n');
      return card({
        title: `🗼 Tower — ${mode}`,
        body: `${tower}\n\n> Floor **${floor + 1}/${FLOORS}** · pick a door · next: **×${next}**`,
        rows: [doorRow, cash], accent: BLACK, footer: `${guild} · ${safe} safe door${safe > 1 ? 's' : ''} of ${doors} per floor`,
      });
    };
    const msg = await message.channel.send(view());
    const collector = msg.createMessageComponentCollector({ time: 180_000 });
    let over = false;

    const end = async (i, cashed) => {
      over = true;
      collector.stop();
      active.delete(uid);
      const m = multiplier(mode, floor);
      const payout = cashed ? casinoPayout(bet, bet * m, userData) : 0;
      const balance = await settle(ctx, { bet, payout, game: 'tower', detail: `${floor} floors (${mode})` });
      const result = card({
        title: cashed ? (floor >= FLOORS ? '🏆 Top of the tower!' : '🗼 Cashed out') : '💥 Trap!',
        body: cashed
          ? `> Climbed **${floor}** floor${floor === 1 ? '' : 's'} — **×${m}** → **+${(payout - bet).toLocaleString()}** coins.`
          : `> Floor ${floor + 1} was a trap. You lost **${bet.toLocaleString()}** coins.${history.length ? `\n> Made it past ${history.length} floor${history.length === 1 ? '' : 's'}.` : ''}`,
        accent: cashed ? WIN : LOSE, footer: `${guild} · balance ${balance.toLocaleString()}`,
      });
      if (i) await i.update(result).catch(() => {});
      else await msg.edit(result).catch(() => {});
    };

    collector.on('collect', async (i) => {
      if (i.user.id !== uid) return i.reply({ content: 'Start your own with `.tower <bet>`.', ephemeral: true });
      if (over) return i.deferUpdate().catch(() => {});
      if (i.customId === 'tw_cash') return end(i, true);
      const d = parseInt(i.customId.split('_')[2], 10);
      if (traps.has(d)) return end(i, false);
      history.push(d);
      floor += 1;
      if (floor >= FLOORS) return end(i, true);
      newFloor();
      await i.update(view()).catch(() => {});
    });
    collector.on('end', async (_c, reason) => {
      if (over) return;
      // Timed out: bank what was climbed so nobody loses a run to a timeout.
      await end(null, floor > 0).catch(() => {});
    });
  },
};
