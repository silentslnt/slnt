// commands/battleship.js — Battleship against another player for coins (direct: "how does this simulate battleship,
// can't even pick where to put the boat… realistic games… good picture art").
// 1) PLACEMENT — each player opens a private harbour (only they see it): pick a column and row for the bow, turn the
//    ship, Place it; or Random. A ghost hull shows where it'll go (green fits, red doesn't). 2 minutes; anyone not
//    ready gets a random fleet. 2) BATTLE — turns; fire from the menus at cells you haven't hit. Sinking a ship reveals
//    it. Sink the whole fleet, take the pot. "My fleet" shows your own sea privately any time. 60s a shot — a missed
//    turn fires at random, two missed in a row forfeits.
const { ActionRowBuilder, StringSelectMenuBuilder, ButtonStyle, MessageFlags } = require('discord.js');
const { card, button, row } = require('../utils/casino');
const { challenge } = require('../utils/wager');
const art = require('../utils/gameArt');

const N = 6;
const SHIPS = [['Cruiser', 3], ['Destroyer', 2], ['Patrol boat', 2]];
const COLS = 'ABCDEF';
const PLACE_MS = 120_000, SHOT_MS = 60_000;
const WIN = 0x3FA34D;
const cellName = (x, y) => `${COLS[x]}${y + 1}`;
const PRIVATE = MessageFlags.IsComponentsV2 | MessageFlags.Ephemeral;

function cellsOf(x, y, len, horiz) {
  return Array.from({ length: len }, (_, k) => (horiz ? [x + k, y] : [x, y + k]));
}
function fits(cells, fleet) {
  const taken = new Set(fleet.flat().map(([x, y]) => `${x},${y}`));
  return cells.every(([x, y]) => x >= 0 && y >= 0 && x < N && y < N && !taken.has(`${x},${y}`));
}
function randomFleet() {
  for (;;) {
    const fleet = [];
    for (const [, len] of SHIPS) {
      for (let t = 0; t < 300; t++) {
        const horiz = Math.random() < 0.5;
        const c = cellsOf(Math.floor(Math.random() * N), Math.floor(Math.random() * N), len, horiz);
        if (fits(c, fleet)) { fleet.push(c); break; }
      }
    }
    if (fleet.length === SHIPS.length) return fleet;
  }
}

module.exports = {
  name: 'battleship',
  aliases: ['bship', 'sea'],
  description: 'Battleship against a player for coins. `.battleship @user <amount>`',
  randomFleet, fits, cellsOf,

  async execute(ctx) {
    const w = await challenge(ctx, { title: 'Battleship', emoji: '🚢', usage: '> `.battleship @user <amount|all>` — place your fleet, sink theirs first, take the pot.' });
    if (!w) return;
    const { msg, a, b, footer, finish } = w;
    const players = [a, b];
    const names = [a.username, b.username];
    const idx = (uid) => players.findIndex((p) => p.id === uid);
    const fleets = [null, null];                                              // final fleets
    const harbour = [0, 1].map(() => ({ ships: [], x: 0, y: 0, horiz: true }));
    const seas = [0, 1].map(() => ({ shots: new Map(), sunk: new Set() }));   // seas[k] = player k's waters
    let phase = 'place', turn = 0, over = false;
    const missed = [0, 0];

    const seaArt = (aim = null) => ({
      name: 'sea.png',
      buffer: art.battleship({ n: N, names, turn: phase === 'battle' && !over ? turn : null, aim,
        seas: [0, 1].map((k) => ({ ...seas[k], ships: fleets[k] || [] })) }),
    });

    // ── placement ──
    const placeUntil = Math.floor((Date.now() + PLACE_MS) / 1000);
    const placeCard = () => card({
      title: '🚢 Battleship — man the harbour',
      body: players.map((p, k) => `> ${fleets[k] ? '✅' : '⚓'} **${p.username}** — ${fleets[k] ? 'fleet ready' : 'placing…'}`).join('\n')
        + `\n-# ${SHIPS.map(([n, l]) => `${n} (${l})`).join(' · ')} on a ${N}×${N} sea · <t:${placeUntil}:R> anyone not ready gets a random fleet.`,
      footer, image: seaArt(),
      rows: [row(button('bs_place', 'Place my fleet', ButtonStyle.Primary, false, '⚓'), button('bs_rand', 'Random fleet', ButtonStyle.Secondary, false, '🎲'))],
    });
    const harbourView = (k, note = '') => {
      const h = harbour[k];
      const cur = h.ships.length;
      const done = cur >= SHIPS.length;
      const ghost = done ? null : (() => { const c = cellsOf(h.x, h.y, SHIPS[cur][1], h.horiz); return { cells: c, ok: fits(c, h.ships) }; })();
      const body = (!done
        ? `> Placing your **${SHIPS[cur][0]}** (${SHIPS[cur][1]}) — bow at **${cellName(h.x, h.y)}**, ${h.horiz ? 'facing right ↔' : 'facing down ↕'}`
        : '> Every ship is in the water. Press **Ready**.') + (note ? `\n-# ${note}` : '');
      const colSel = new StringSelectMenuBuilder().setCustomId('bh_col').setPlaceholder(`Column: ${COLS[h.x]}`).setDisabled(done)
        .addOptions([...COLS].map((c, x) => ({ label: `Column ${c}`, value: String(x), default: x === h.x })));
      const rowSel = new StringSelectMenuBuilder().setCustomId('bh_row').setPlaceholder(`Row: ${h.y + 1}`).setDisabled(done)
        .addOptions(Array.from({ length: N }, (_, y) => ({ label: `Row ${y + 1}`, value: String(y), default: y === h.y })));
      return {
        ...card({
          title: '⚓ Your harbour', body, footer: 'Only you can see this',
          image: { name: 'harbour.png', buffer: art.fleetView({ n: N, ships: h.ships, ghost }) },
          rows: [
            new ActionRowBuilder().addComponents(colSel),
            new ActionRowBuilder().addComponents(rowSel),
            row(button('bh_turn', h.horiz ? 'Turn ↕' : 'Turn ↔', ButtonStyle.Secondary, done),
              button('bh_put', done ? 'Placed' : `Place ${SHIPS[cur][0]}`, ButtonStyle.Success, done || !ghost.ok),
              button('bh_undo', 'Undo', ButtonStyle.Secondary, !cur),
              button('bh_rand', 'Random', ButtonStyle.Secondary),
              button('bh_ready', 'Ready', ButtonStyle.Primary, !done)),
          ],
        }),
        flags: PRIVATE,
      };
    };

    let readyCheck = async () => {};
    const openHarbour = async (i, k) => {
      const resp = await i.reply({ ...harbourView(k), withResponse: true }).catch(() => null);
      const hm = resp?.resource?.message;
      if (!hm) return;
      const hc = hm.createMessageComponentCollector({ time: PLACE_MS + 10_000, filter: (x) => x.customId.startsWith('bh_') });
      hc.on('collect', async (x) => {
        if (phase !== 'place' || fleets[k]) return x.reply({ content: 'Your fleet is already set — the battle is on the main card.', ephemeral: true }).catch(() => {});
        const h = harbour[k];
        let note = '';
        if (x.customId === 'bh_col') h.x = Number(x.values[0]);
        else if (x.customId === 'bh_row') h.y = Number(x.values[0]);
        else if (x.customId === 'bh_turn') h.horiz = !h.horiz;
        else if (x.customId === 'bh_put') {
          const c = cellsOf(h.x, h.y, SHIPS[h.ships.length][1], h.horiz);
          if (fits(c, h.ships)) h.ships.push(c); else note = "It doesn't fit there.";
        } else if (x.customId === 'bh_undo') h.ships.pop();
        else if (x.customId === 'bh_rand') { h.ships = randomFleet(); note = 'A random fleet — Undo to move ships yourself.'; }
        else if (x.customId === 'bh_ready' && h.ships.length === SHIPS.length) {
          fleets[k] = h.ships.map((s) => s.slice());
          hc.stop();
          await x.update(harbourView(k, 'Ready — the battle starts on the main card.')).catch(() => {});
          return readyCheck();
        }
        await x.update(harbourView(k, note)).catch(() => {});
      });
    };

    await new Promise((resolve) => {
      const col = msg.createMessageComponentCollector({ time: PLACE_MS, filter: (i) => i.customId === 'bs_place' || i.customId === 'bs_rand' });
      readyCheck = async () => {
        if (fleets[0] && fleets[1]) { col.stop('ready'); return; }
        await msg.edit(placeCard()).catch(() => {});
      };
      col.on('collect', async (i) => {
        const k = idx(i.user.id);
        if (k < 0) return i.reply({ content: "This battle isn't yours.", ephemeral: true }).catch(() => {});
        if (fleets[k]) return i.reply({ content: 'Your fleet is already in the water.', ephemeral: true }).catch(() => {});
        if (i.customId === 'bs_rand') {
          fleets[k] = randomFleet();
          await i.reply({ ...card({ title: '⚓ Your fleet', body: '> A random fleet — ready.', footer: 'Only you can see this',
            image: { name: 'fleet.png', buffer: art.fleetView({ n: N, ships: fleets[k] }) } }), flags: PRIVATE }).catch(() => {});
          return readyCheck();
        }
        await openHarbour(i, k);
      });
      col.on('end', () => resolve());
      msg.edit(placeCard()).catch(() => {});
    });
    for (const k of [0, 1]) if (!fleets[k]) fleets[k] = harbour[k].ships.length === SHIPS.length ? harbour[k].ships : randomFleet();
    phase = 'battle';

    // ── battle ──
    const open = (k) => {   // cells player k hasn't fired at yet (they fire into the other sea)
      const out = [];
      for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!seas[1 - k].shots.has(`${x},${y}`)) out.push([x, y]);
      return out;
    };
    const battleCard = (note, { aim = null, accent, done = false } = {}) => {
      const rows = [];
      if (!done) {
        const cells = open(turn);
        for (const [lo, hi, ph] of [[0, 3, 'rows 1–3'], [3, 6, 'rows 4–6']]) {
          const opts = cells.filter(([, y]) => y >= lo && y < hi).map(([x, y]) => ({ label: cellName(x, y), value: `${x},${y}` }));
          if (opts.length) rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`bs_fire_${lo}`)
            .setPlaceholder(`${names[turn]}: fire at… (${ph})`).addOptions(opts)));
        }
        rows.push(row(button('bs_me', 'My fleet', ButtonStyle.Secondary, false, '⚓')));
      }
      return card({ title: '🚢 Battleship', body: note, footer, accent, rows, image: seaArt(aim) });
    };
    const deadline = () => `<t:${Math.floor((Date.now() + SHOT_MS) / 1000)}:R>`;

    const fireAt = (k, x, y) => {   // player k fires into sea 1-k
      const target = seas[1 - k];
      const ship = fleets[1 - k].findIndex((c) => c.some(([sx, sy]) => sx === x && sy === y));
      target.shots.set(`${x},${y}`, ship >= 0 ? 'hit' : 'miss');
      let line = `**${names[k]}** fires at **${cellName(x, y)}** — ${ship >= 0 ? '💥 **HIT!**' : '💦 miss.'}`;
      if (ship >= 0 && fleets[1 - k][ship].every(([sx, sy]) => target.shots.get(`${sx},${sy}`) === 'hit')) {
        target.sunk.add(ship);
        line += ` **${names[1 - k]}'s ${SHIPS[ship][0]} goes down!**`;
      }
      return { line, won: target.sunk.size === SHIPS.length };
    };

    await msg.edit(battleCard(`> Both fleets are in the water. **${names[turn]}** fires first — ${deadline()}`)).catch(() => {});
    await new Promise((resolve) => {
      let timer;
      const col = msg.createMessageComponentCollector({ filter: (i) => i.customId.startsWith('bs_') });
      const end = async (text, accent) => {
        over = true; clearTimeout(timer); col.stop();
        await msg.edit(battleCard(text, { accent, done: true })).catch(() => {});
        resolve();
      };
      const shoot = async (k, x, y, i) => {
        const { line, won } = fireAt(k, x, y);
        if (won) {
          over = true;
          if (i) await i.deferUpdate().catch(() => {});
          const res = await finish(players[k].id);
          return end(`> ${line}\n> **The whole fleet is sunk!** ${res}`, WIN);
        }
        turn = 1 - turn;
        arm();
        const p = battleCard(`> ${line}\n> **${names[turn]}**'s shot — ${deadline()}`, { aim: [1 - turn, [x, y]] });
        if (i) await i.update(p).catch(() => {}); else await msg.edit(p).catch(() => {});
      };
      const arm = () => {
        clearTimeout(timer);
        timer = setTimeout(async () => {
          if (over) return;
          missed[turn] += 1;
          if (missed[turn] >= 2) {
            over = true;
            const res = await finish(players[1 - turn].id);
            return end(`> **${names[turn]}** missed two turns — forfeit. ${res}`, WIN);
          }
          const cells = open(turn);
          const [x, y] = cells[Math.floor(Math.random() * cells.length)];
          await shoot(turn, x, y, null);
        }, SHOT_MS);
      };
      arm();
      col.on('collect', async (i) => {
        if (over) return i.deferUpdate().catch(() => {});
        const k = idx(i.user.id);
        if (k < 0) return i.reply({ content: "This battle isn't yours.", ephemeral: true }).catch(() => {});
        if (i.customId === 'bs_me') {
          return i.reply({ ...card({ title: '⚓ Your fleet', body: `> ${SHIPS.length - seas[k].sunk.size} of ${SHIPS.length} ships afloat.`, footer: 'Only you can see this',
            image: { name: 'fleet.png', buffer: art.fleetView({ n: N, ships: fleets[k], shots: seas[k].shots, sunk: seas[k].sunk }) } }),
          flags: PRIVATE }).catch(() => {});
        }
        if (!i.isStringSelectMenu()) return i.deferUpdate().catch(() => {});
        if (k !== turn) return i.reply({ content: `It's ${names[turn]}'s shot.`, ephemeral: true }).catch(() => {});
        const [x, y] = i.values[0].split(',').map(Number);
        if (seas[1 - k].shots.has(`${x},${y}`)) return i.reply({ content: 'You already fired there.', ephemeral: true }).catch(() => {});
        missed[k] = 0;
        await shoot(k, x, y, i);
      });
    });
  },
};
