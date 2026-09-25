// commands/overunder.js — roll 1–100 and call over or under a number you pick.
// Riskier calls pay more: payout = 94% of the fair odds (a 6% house edge).
const { card, button, row, takeBet, settle, WIN, LOSE, BLACK, ButtonStyle } = require('../utils/casino');
const { casinoPayout, casinoLuck } = require('../utils/houseEdge');

const EDGE = 0.94;

function payoutFor(side, target) {
  const chance = side === 'over' ? (100 - target) / 100 : (target - 1) / 100;
  return { chance, mult: Math.floor((EDGE / chance) * 100) / 100 };
}

module.exports = {
  name: 'overunder',
  aliases: ['ou', 'roll100'],
  description: 'Roll 1–100: over or under your number. `.ou <bet> <over|under> <5-95>`',

  async execute(ctx) {
    const { message, args } = ctx;
    const side = (args[1] || '').toLowerCase().startsWith('o') ? 'over' : (args[1] || '').toLowerCase().startsWith('u') ? 'under' : null;
    const target = parseInt(args[2], 10);
    const usage = {
      title: 'Over / Under',
      body: '> `.ou <bet> over 50` — win if the roll is **over** 50 (1.88×)\n> `.ou <bet> under 20` — win if it\'s **under** 20 (4.94×)\n'
        + '-# Pick any number 5–95. The less likely your call, the more it pays.',
    };
    if (!side || !(target >= 5 && target <= 95)) {
      return message.channel.send(card({ title: usage.title, body: usage.body, footer: message.guild?.name || 'Shiro' }));
    }
    const { chance, mult } = payoutFor(side, target);
    const taken = await takeBet(ctx, args[0], usage);
    if (!taken) return;
    const { bet, userData } = taken;
    const guild = message.guild?.name || 'Shiro';
    // Luck Essence shifts the roll by 1 in the caller's favour at most.
    let roll = Math.floor(Math.random() * 100) + 1;
    if (casinoLuck(userData) && Math.random() < 0.5) roll += side === 'over' ? 1 : -1;
    roll = Math.max(1, Math.min(100, roll));
    const won = side === 'over' ? roll > target : roll < target;
    const payout = won ? casinoPayout(bet, bet * mult, userData) : 0;
    const balance = await settle(ctx, { bet, payout, game: 'overunder', detail: `${side} ${target}, rolled ${roll}` });
    const bar = '▰'.repeat(Math.round(roll / 5)) + '▱'.repeat(20 - Math.round(roll / 5));
    await message.channel.send(card({
      title: won ? '🎲 Called it' : '🎲 Missed',
      body: `# ${roll}\n\`${bar}\`\n> You called **${side} ${target}** (${Math.round(chance * 100)}% · ×${mult}) — `
        + (won ? `**+${(payout - bet).toLocaleString()}** coins.` : `lost **${bet.toLocaleString()}**.`),
      accent: won ? WIN : LOSE, footer: `${guild} · balance ${balance.toLocaleString()}`,
    }));
  },
};
