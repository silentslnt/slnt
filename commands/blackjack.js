// commands/blackjack.js — blackjack on one CV2 card with buttons (Hit · Stand · Double down), no reactions.
// The bet is taken atomically (casino.takeBet) and paid by increment (casino.settle), so nothing a player does
// elsewhere mid-hand is ever overwritten. A natural 21 pays 2.5× (a push if the dealer has one too).
// Dealer stands on 17. An Insurance Slip (inventory) returns the bet once if you bust.
const { card, button, row, takeBet, settle, gameResult, attachReplay, BLACK, ButtonStyle } = require('../utils/casino');
const { casinoPayout } = require('../utils/houseEdge');
const { debit, credit } = require('../utils/atomicInv');
const User = require('../models/user');
const art = require('../utils/casinoArt');

const active = new Set();
const SUITS = ['♠', '♥', '♦', '♣'];

function draw() {
  const values = [2, 3, 4, 5, 6, 7, 8, 9, 10, 10, 10, 10, 11];
  const val = values[Math.floor(Math.random() * values.length)];
  const face = val === 11 ? 'A' : val === 10 ? ['10', 'J', 'Q', 'K'][Math.floor(Math.random() * 4)] : String(val);
  return { val, display: `${face}${SUITS[Math.floor(Math.random() * 4)]}` };
}

function value(hand) {
  let sum = hand.reduce((t, c) => t + c.val, 0);
  let aces = hand.filter((c) => c.val === 11).length;
  while (sum > 21 && aces-- > 0) sum -= 10;
  return sum;
}

const show = (hand) => hand.map((c) => `\`${c.display}\``).join(' ');

module.exports = {
  name: 'blackjack',
  aliases: ['bj'],
  description: 'Play blackjack. `.bj <amount|all>`',

  async execute(ctx) {
    const { message, args } = ctx;
    const uid = message.author.id;
    if (active.has(uid)) return message.channel.send('You already have a blackjack hand going.');
    const taken = await takeBet(ctx, args[0], {
      title: '♠ Blackjack',
      body: '> `.bj <amount|all>` — beat the dealer to 21. **Hit** for a card, **Stand** to hold, **Double down** to double the bet for one last card.\n'
        + '> A natural 21 pays **2.5×**. Dealer stands on 17.\n> Or with buttons: `.play`',
    });
    if (!taken) return;
    let { bet } = taken;
    const { userData } = taken;
    const baseBet = bet;
    active.add(uid);
    const g = message.guild?.name || 'Shiro';
    const player = [draw(), draw()];
    const dealer = [draw(), draw()];
    let doubled = false;
    let done = false;

    const table = (note, reveal = false) => card({
      title: '♠ Blackjack',
      body: note ? `-# ${note}` : '',
      image: { name: 'game.png', buffer: art.blackjack({ dealer, player, hide: !reveal, dv: reveal ? value(dealer) : '?', pv: value(player), bet, doubled }) },
      rows: reveal ? [] : [row(
        button('bj_hit', 'Hit', ButtonStyle.Primary, false, '🃏'),
        button('bj_stand', 'Stand', ButtonStyle.Secondary, false, '✋'),
        button('bj_double', `Double down (${(bet * 2).toLocaleString()})`, ButtonStyle.Success, player.length !== 2 || doubled, '💰'),
      )],
      accent: BLACK, footer: `${g} · dealer stands on 17`,
    });

    const msg = await message.channel.send(table(value(player) === 21 ? 'Blackjack!' : 'Hit or stand?'));
    let col;

    const finish = async (i = null) => {
      if (done) return;
      done = true;
      if (col) col.stop('done');
      const pv = value(player);
      const natural = player.length === 2 && pv === 21 && !doubled;
      if (pv <= 21 && !natural) while (value(dealer) < 17) dealer.push(draw());
      const dv = value(dealer);
      let payout = 0;
      let head;
      let won = null;
      if (pv > 21) {
        head = `Bust — ${pv}`; won = false;
        // An Insurance Slip pays out at most once a UTC day: claim the day first, then spend the slip
        const today = new Date().toISOString().slice(0, 10);
        const claimed = await User.updateOne({ userId: uid, insuranceDay: { $ne: today } }, { $set: { insuranceDay: today } })
          .then((r) => r.modifiedCount > 0).catch(() => false);
        if (claimed && await debit(uid, { items: { 'Insurance Slip': 1 } })) { payout = bet; head = 'Bust — your Insurance Slip returned the bet'; won = null; }
        else if (claimed) await User.updateOne({ userId: uid }, { $set: { insuranceDay: '' } }).catch(() => {});   // no slip: the day stays free
      } else if (natural) {
        if (dv === 21 && dealer.length === 2) { payout = bet; head = 'Both blackjack — push'; }
        else { payout = casinoPayout(bet, bet * 2.5, userData); head = 'BLACKJACK — 2.5×'; won = true; }
      } else if (dv > 21) { payout = casinoPayout(bet, bet * 2, userData); head = `Dealer busts at ${dv} — you win`; won = true; }
      else if (pv > dv) { payout = casinoPayout(bet, bet * 2, userData); head = `${pv} beats ${dv} — you win`; won = true; }
      else if (pv === dv) { payout = bet; head = `${pv} each — push`; }
      else { head = `${dv} beats ${pv} — dealer wins`; won = false; }
      const balance = await settle(ctx, { bet, payout, game: 'blackjack', detail: natural ? 'Natural Blackjack' : doubled ? 'doubled down' : undefined });
      if (natural && won) await credit(uid, { stats: { blackjack21: 1 } });
      active.delete(uid);
      const opts = {
        emoji: '♠', game: 'Blackjack', won, headline: head,
        lines: [
          `Dealer ${show(dealer)} · **${dv}**`,
          `You ${show(player)} · **${pv}**`,
          won === true ? `**+${(payout - bet).toLocaleString()}** coins` : payout === bet ? 'Bet returned' : `**−${bet.toLocaleString()}** coins`,
          `Balance **${balance.toLocaleString()}**`,
        ],
        footer: g, replay: { game: 'blackjack', bet: baseBet },
        art: art.blackjack({ dealer, player, dv, pv, bet, payout, balance, doubled }),
      };
      if (i) await i.update(gameResult(opts)).catch(() => msg.edit(gameResult(opts)).catch(() => {}));
      else await msg.edit(gameResult(opts)).catch(() => {});
      attachReplay(msg, uid, opts);
    };

    let busy = false;
    col = msg.createMessageComponentCollector({ time: 90_000, filter: (i) => i.customId.startsWith('bj_') });
    col.on('collect', async (i) => {
      if (i.user.id !== uid) return i.reply({ content: 'Deal yourself in with `.bj <bet>`.', ephemeral: true });
      if (done || busy) return i.deferUpdate().catch(() => {});
      busy = true;
      try {
        if (i.customId === 'bj_hit') {
          player.push(draw());
          if (value(player) >= 21) return await finish(i);
          return await i.update(table('Hit or stand?'));
        }
        if (i.customId === 'bj_stand') return await finish(i);
        if (i.customId === 'bj_double') {
          if (player.length !== 2 || doubled) return i.deferUpdate();
          const ok = await User.findOneAndUpdate({ userId: uid, balance: { $gte: bet } }, { $inc: { balance: -bet } }, { new: true });
          if (!ok) return i.reply({ content: `You need another **${bet.toLocaleString()}** coins to double.`, ephemeral: true });
          bet *= 2;
          doubled = true;
          player.push(draw());
          return await finish(i);
        }
      } finally { busy = false; }
    });
    col.on('end', (_c, reason) => { if (reason !== 'done' && !done) finish(); });   // left alone = you stand
    if (value(player) === 21) setTimeout(() => finish(), 900);
  },
};
