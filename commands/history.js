// commands/history.js — your casino record: every round you played (last 200), wins and losses, net, streaks,
// and how each game has treated you. `.history [@user] [game]`
const { card, BLACK, WIN, LOSE } = require('../utils/casino');
const { playerHistory } = require('../utils/houseBank');

const bar = (part, total, n = 12) => {
  const f = total > 0 ? Math.round((part / total) * n) : 0;
  return '▰'.repeat(f) + '▱'.repeat(n - f);
};
const fmt = (n) => `${n < 0 ? '−' : '+'}${Math.abs(Math.round(n)).toLocaleString()}`;

module.exports = {
  name: 'history',
  aliases: ['hist', 'record', 'gamblelog'],
  description: 'Your casino history — wins, losses, net and every recent round. `.history [@user] [game]`',

  async execute({ message, args }) {
    const target = message.mentions.users.first() || message.author;
    const game = args.find((a) => !a.startsWith('<@'))?.toLowerCase();
    let rounds = await playerHistory(target.id);
    if (game) rounds = rounds.filter((r) => r.game === game);
    const guild = message.guild?.name || 'Shiro';
    if (!rounds.length) {
      return message.channel.send(card({ title: `📜 ${target.username}'s record`, body: '> No rounds yet' + (game ? ` in **${game}**.` : '.'), footer: guild }));
    }
    const wins = rounds.filter((r) => r.payout > r.bet);
    const losses = rounds.filter((r) => r.payout < r.bet);
    const wagered = rounds.reduce((t, r) => t + r.bet, 0);
    const net = rounds.reduce((t, r) => t + (r.payout - r.bet), 0);
    const best = rounds.reduce((b, r) => (r.payout - r.bet > (b ? b.payout - b.bet : 0) ? r : b), null);
    const worst = rounds.reduce((b, r) => (r.payout - r.bet < (b ? b.payout - b.bet : 0) ? r : b), null);
    // current streak
    let streak = 0;
    const firstWin = rounds[0].payout > rounds[0].bet;
    for (const r of rounds) {
      if ((r.payout > r.bet) !== firstWin || r.payout === r.bet) break;
      streak++;
    }
    const perGame = {};
    for (const r of rounds) {
      const g = (perGame[r.game] = perGame[r.game] || { n: 0, net: 0, w: 0 });
      g.n++; g.net += r.payout - r.bet; if (r.payout > r.bet) g.w++;
    }
    const games = Object.entries(perGame).sort((a, b) => b[1].n - a[1].n).slice(0, 8)
      .map(([g, v]) => `> **${g}** · ${v.n} played · ${Math.round((v.w / v.n) * 100)}% won · \`${fmt(v.net)}\``).join('\n');
    const recent = rounds.slice(0, 12).map((r) => {
      const d = r.payout - r.bet;
      const icon = d > 0 ? '🟩' : d < 0 ? '🟥' : '⬜';
      return `${icon} \`${r.game.padEnd(11)}\` bet ${r.bet.toLocaleString()} → \`${fmt(d)}\` <t:${Math.floor(new Date(r.at).getTime() / 1000)}:R>`;
    }).join('\n');
    const body = [
      `# \`${fmt(net)}\``,
      `> **${rounds.length}** rounds · **${wins.length}** won · **${losses.length}** lost · wagered **${wagered.toLocaleString()}**`,
      `> \`${bar(wins.length, rounds.length)}\` ${Math.round((wins.length / rounds.length) * 100)}% won`,
      `> Streak: **${streak} ${firstWin ? 'win' : 'loss'}${streak === 1 ? '' : (firstWin ? 's' : 'es')}**`
        + (best && best.payout > best.bet ? ` · best **${fmt(best.payout - best.bet)}** (${best.game})` : '')
        + (worst && worst.payout < worst.bet ? ` · worst **${fmt(worst.payout - worst.bet)}** (${worst.game})` : ''),
      '',
      '__**By game**__', games,
      '',
      '__**Recent rounds**__', recent,
    ].join('\n');
    return message.channel.send(card({
      title: `📜 ${target.username}'s record${game ? ` — ${game}` : ''}`,
      body, accent: net > 0 ? WIN : net < 0 ? LOSE : BLACK,
      footer: `${guild} · last ${rounds.length} rounds · the house always wins in the long run`,
    }));
  },
};
