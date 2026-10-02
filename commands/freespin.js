// commands/freespin.js — one free spin a day (direct: "a free spin… but do not give too much").
// Mostly small coin prizes; the Sentinel prizes (Aether, a Healing Draught, a clue scroll) and a very rare
// 1 SILV keep it worth pressing without printing money. The claim is atomic: lastFreeSpin is set only if
// 24h have passed, in one update, so two fast presses can't spin twice.
const { card, button, row, ButtonStyle, WIN } = require('../utils/casino');
const User = require('../models/user');
const sdb = require('../utils/sentinelDb');

const DAY_MS = 24 * 60 * 60 * 1000;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
// [label, emoji, weight, kind, amount]
const PRIZES = [
  ['100 coins', '⬛', 300, 'coins', 100],
  ['250 coins', '🟫', 260, 'coins', 250],
  ['500 coins', '🟦', 180, 'coins', 500],
  ['1,000 coins', '🟩', 90, 'coins', 1000],
  ['2,500 coins', '🟨', 30, 'coins', 2500],
  ['750 Aether', '💠', 80, 'aether', 750],
  ['Healing Draught', '🧪', 45, 'item', 'item_potion'],
  ['Easy clue scroll', '📜', 13, 'item', 'clue_easy'],
  ['1 SILV token', '💎', 2, 'silv', 1],
];
const TOTAL = PRIZES.reduce((a, p) => a + p[2], 0);
const pick = () => { let r = Math.random() * TOTAL; for (const p of PRIZES) { r -= p[2]; if (r < 0) return p; } return PRIZES[0]; };

module.exports = {
  name: 'freespin',
  aliases: ['fs', 'dailyspin', 'free'],
  adminOnly: false,
  description: 'One free spin a day — coins, Aether, Sentinel items, and a rare SILV.',

  async execute({ message, logAdminAction }) {
    const uid = message.author.id;
    const guild = message.guild?.name || 'Shiro';
    const now = new Date();
    const claimed = await User.findOneAndUpdate(
      { userId: uid, $or: [{ lastFreeSpin: null }, { lastFreeSpin: { $lte: new Date(now - DAY_MS) } }] },
      { $set: { lastFreeSpin: now } }, { new: false },
    );
    if (!claimed) {
      const u = await User.findOne({ userId: uid }).lean();
      const next = Math.floor((new Date(u?.lastFreeSpin || now).getTime() + DAY_MS) / 1000);
      return message.channel.send(card({ title: '🎡 Free spin', body: `> Already spun today — your next free spin is <t:${next}:R>.\n-# Play more with \`.play\``, footer: guild }));
    }
    const prize = pick();
    const strip = (c) => [-2, -1, 0, 1, 2].map((o) => PRIZES[(c + o + PRIZES.length * 3) % PRIZES.length][1]).join(' ');
    let cur = Math.floor(Math.random() * PRIZES.length);
    const msg = await message.channel.send(card({ title: '🎡 Free spin', body: `# ${strip(cur)}\n> 　　🔺\n> Spinning…`, footer: guild }));
    for (const step of [4, 3, 2]) {
      await sleep(600);
      cur = (cur + step) % PRIZES.length;
      await msg.edit(card({ title: '🎡 Free spin', body: `# ${strip(cur)}\n> 　　🔺\n> Spinning…`, footer: guild })).catch(() => {});
    }
    const [label, , , kind, amount] = prize;
    let ok = true;
    const gid = message.guild?.id;
    if (kind === 'coins') await User.updateOne({ userId: uid }, { $inc: { balance: amount, totalEarned: amount } });
    else if (kind === 'silv') await User.updateOne({ userId: uid }, { $inc: { 'inventory.Silv token': amount } });
    else if (kind === 'aether') ok = gid ? await sdb.awardPoints(gid, uid, amount) : false;
    else if (kind === 'item') ok = gid ? await sdb.grantItem(gid, uid, amount, 1) : false;
    if (!ok) await User.updateOne({ userId: uid }, { $inc: { balance: 500, totalEarned: 500 } });   // Sentinel unreachable — never leave them empty-handed
    if (kind === 'silv') logAdminAction?.(uid, message.author.username, 'freespin', 'Free spin: 1 SILV', uid, message.author.username).catch?.(() => {});
    const land = PRIZES.indexOf(prize);
    await sleep(600);
    return msg.edit(card({
      title: '🎡 Free spin',
      body: `# ${strip(land)}\n> 　　🔺\n> You won **${ok ? label : '500 coins'}**${kind === 'aether' || kind === 'item' ? (ok ? ' — it\'s in Sentinel' : ' (Sentinel was busy, so coins instead)') : ''}!\n-# Next free spin <t:${Math.floor((now.getTime() + DAY_MS) / 1000)}:R>`,
      accent: WIN,
      rows: [row(button('fs_play', 'Play a game', ButtonStyle.Success, false, '🎲'))],
      footer: guild,
    })).then((m) => {
      const col = m.createMessageComponentCollector({ time: 120_000 });
      col.on('collect', async (i) => {
        if (i.user.id !== uid) return i.reply({ content: 'Spin your own — `.freespin`.', ephemeral: true }).catch(() => {});
        await i.deferUpdate().catch(() => {});
        return i.client.runAs(i, 'play', []);
      });
      col.on('end', () => m.edit({ components: m.components }).catch(() => {}));
    }).catch(() => {});
  },
};
