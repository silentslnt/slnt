// commands/battleship.js — Battleship against another player for coins. Each side gets a hidden 5×5 sea with a
// 3-ship fleet placed at random (sizes 3, 2, 2). Take turns firing from a menu of cells you haven't shot yet;
// sink all three ships to win the pot. 60s per shot or you forfeit.
const { ActionRowBuilder, StringSelectMenuBuilder } = require('discord.js');
const { card } = require('../utils/casino');
const { challenge } = require('../utils/wager');

const N = 5;
const SHIPS = [3, 2, 2];
const COLS = 'ABCDE';
const cellName = (x, y) => `${COLS[x]}${y + 1}`;

function fleet() {
  const taken = new Set();
  for (const len of SHIPS) {
    for (let tries = 0; tries < 200; tries++) {
      const horiz = Math.random() < 0.5;
      const x = Math.floor(Math.random() * (horiz ? N - len + 1 : N));
      const y = Math.floor(Math.random() * (horiz ? N : N - len + 1));
      const cells = Array.from({ length: len }, (_, k) => (horiz ? `${x + k},${y}` : `${x},${y + k}`));
      if (cells.some((c) => taken.has(c))) continue;
      cells.forEach((c) => taken.add(c));
      break;
    }
  }
  return taken;
}

function grid(shots, ships) {
  const head = '⬛' + ['🇦', '🇧', '🇨', '🇩', '🇪'].join('');
  const lines = [head];
  for (let y = 0; y < N; y++) {
    let line = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'][y];
    for (let x = 0; x < N; x++) {
      const k = `${x},${y}`;
      line += shots.has(k) ? (ships.has(k) ? '💥' : '⚪') : '🌊';
    }
    lines.push(line);
  }
  return lines.join('\n');
}

module.exports = {
  name: 'battleship',
  aliases: ['bship', 'sea'],
  description: 'Battleship against a player for coins. `.battleship @user <amount>`',

  async execute(ctx) {
    const w = await challenge(ctx, { title: 'Battleship', emoji: '🚢', usage: '> `.battleship @user <amount|all>` — sink their fleet first, take the pot.' });
    if (!w) return;
    const { msg, a, b, footer, finish } = w;
    const players = [a, b];
    const seas = [fleet(), fleet()];             // seas[i] = player i's ships
    const shots = [new Set(), new Set()];        // shots[i] = cells player i has fired at (on the other sea)
    const total = SHIPS.reduce((s, n) => s + n, 0);
    let turn = 0, last = '';
    const hits = (i) => [...shots[i]].filter((k) => seas[1 - i].has(k)).length;
    const view = (note, done = false, accent) => {
      const body = `**${a.username}** fires at ${b.username}'s sea — ${hits(0)}/${total} hit\n${grid(shots[0], seas[1])}\n\n`
        + `**${b.username}** fires at ${a.username}'s sea — ${hits(1)}/${total} hit\n${grid(shots[1], seas[0])}\n\n> ${note}`;
      const rows = [];
      if (!done) {
        const opts = [];
        for (let y = 0; y < N; y++) for (let x = 0; x < N; x++) if (!shots[turn].has(`${x},${y}`)) opts.push({ label: cellName(x, y), value: `${x},${y}` });
        rows.push(new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId('bs_fire')
          .setPlaceholder(`${players[turn].username}: fire at…`).addOptions(opts.slice(0, 25))));
      }
      return msg.edit(card({ title: '🚢 Battleship', body, rows, footer, accent })).catch(() => {});
    };
    await view(`${players[turn]} fires first — 60s a shot.`);
    for (;;) {
      const i = await msg.awaitMessageComponent({ time: 60_000, filter: (x) => x.customId === 'bs_fire' && x.user.id === players[turn].id }).catch(() => null);
      if (!i) {
        const res = await finish(players[1 - turn].id);
        return view(`${players[turn].username} didn't fire in time — forfeit. ${res}`, true, 0x3FA34D);
      }
      await i.deferUpdate().catch(() => {});
      const k = i.values[0];
      if (shots[turn].has(k)) continue;
      shots[turn].add(k);
      const [x, y] = k.split(',').map(Number);
      const hit = seas[1 - turn].has(k);
      last = `${players[turn].username} fires at **${cellName(x, y)}** — ${hit ? '💥 **HIT!**' : '⚪ miss.'}`;
      if (hits(turn) >= total) {
        const res = await finish(players[turn].id);
        return view(`${last}\n> **Fleet sunk!** ${res}`, true, 0x3FA34D);
      }
      turn = 1 - turn;
      await view(`${last}\n> ${players[turn]}'s shot — 60s.`);
    }
  },
};
