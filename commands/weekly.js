// commands/weekly.js — this week's game board: the 10 most active players (rounds of 1,000+ coins), and what they'd win.
const { card } = require('../utils/casino');
const W = require('../utils/weeklyBoard');

module.exports = {
  name: 'weekly',
  aliases: ['wlb', 'weeklylb', 'weekboard'],
  adminOnly: false,
  description: "This week's game board — top 10 most active players win SILV, coins and Aether.",

  async execute({ message }) {
    const week = W.weekNo();
    const rows = await W.top(week);
    const ends = Math.floor(W.weekEnds(week) / 1000);
    const lines = W.PRIZES.map((p, i) => {
      const r = rows[i];
      return `> **${i + 1}.** ${r ? `<@${r.userId}> — ${r.plays.toLocaleString()} plays` : '*open*'} · ${W.prizeText(p)}`;
    });
    const me = await require('mongoose').model('WeeklyPlay').findOne({ week, userId: message.author.id }).lean();
    return message.channel.send({ ...card({
      title: '🏆 Weekly game board',
      body: `-# Every game round with a bet of **${W.MIN_BET.toLocaleString()}+** coins is one play. Ends <t:${ends}:R>.\n${lines.join('\n')}\n\n`
        + `> You: **${(me?.plays || 0).toLocaleString()}** plays this week`,
      footer: `${message.guild?.name || 'Shiro'} · paid automatically when the week ends · SILV for the top 3`,
    }), allowedMentions: { parse: [] } });
  },
};
