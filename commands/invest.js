// commands/invest.js
const { EmbedBuilder } = require('discord.js');
const { INVESTMENT_CAP, INVESTMENT_RETURN } = require('../utils/config');
const { progressBar } = require('../utils/xp');
const { trackStat } = require('../utils/achievements');

const CHECK = '<:check:1547659779877642360>';
const BLACK = 0x000000;
const LOCK_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

module.exports = {
  name: 'invest',
  aliases: ['vault', 'iv'],
  description: 'Lock coins in the vault for 24h to earn 10% profit. `.invest <amount|all>`',

  async execute({ message, args, userData, saveUserData }) {
    const sub = (args[0] || '').toLowerCase();
    const guildName = message.guild?.name || 'Shiro';

    // ── Check active vault ────────────────────────────────────────────────────
    const vault = userData.vault || null;

    if (sub === 'collect' || sub === 'claim') {
      if (!vault) return message.channel.send('You have no active vault investment.');
      const now  = Date.now();
      const ends = new Date(vault.endsAt).getTime();
      if (now < ends) {
        const remaining = ends - now;
        const h = Math.floor(remaining / 3600_000);
        const m = Math.floor((remaining % 3600_000) / 60_000);
        return message.channel.send({
          embeds: [new EmbedBuilder().setColor(BLACK)
            .setTitle('VAULT STILL LOCKED')
            .setDescription(
              `> Matures in **${h}h ${m}m**\n\n` +
              `> Locked: **${vault.amount.toLocaleString()}** coins\n` +
              `> Returns: **${Math.floor(vault.amount * INVESTMENT_RETURN).toLocaleString()}** coins\n\n` +
              `-# Open it early with \`.invest break\` (no profit).`
            )
            .setFooter({ text: guildName })],
        });
      }
      // Collect
      const returns = Math.floor(vault.amount * INVESTMENT_RETURN);
      userData.balance = (userData.balance || 0) + returns;
      userData.totalEarned = (userData.totalEarned || 0) + returns;
      userData.vault = null;
      userData.stats = userData.stats || {};
      userData.stats.investments = (userData.stats.investments || 0) + 1;
      await saveUserData({ balance: userData.balance, totalEarned: userData.totalEarned, vault: null, stats: userData.stats });
      await trackStat(userData, 'investments', 0, { message, saveUserData });

      return message.channel.send({
        embeds: [new EmbedBuilder().setColor(BLACK)
          .setTitle('VAULT COLLECTED')
          .setDescription(
            `> ${CHECK} Your investment matured\n\n` +
            `> Invested: **${vault.amount.toLocaleString()}**\n` +
            `> Returned: **${returns.toLocaleString()}** (+${Math.floor((INVESTMENT_RETURN - 1) * 100)}%)\n` +
            `> Profit: **+${(returns - vault.amount).toLocaleString()}** coins\n\n` +
            `> New balance: **${userData.balance.toLocaleString()}**`
          )
          .setFooter({ text: guildName })],
      });
    }

    // Break vault early (no profit, just return coins)
    if (sub === 'break') {
      if (!vault) return message.channel.send('No active vault to break.');
      userData.balance = (userData.balance || 0) + vault.amount;
      userData.vault   = null;
      await saveUserData({ balance: userData.balance, vault: null });
      return message.channel.send({
        embeds: [new EmbedBuilder().setColor(BLACK)
          .setTitle('VAULT BROKEN EARLY')
          .setDescription(
            `> You broke your vault early — no profit\n\n` +
            `> Returned: **${vault.amount.toLocaleString()}** coins (no interest)\n` +
            `> Balance: **${userData.balance.toLocaleString()}**\n\n` +
            `-# Buy a Vault Key in \`.sh utility\` to break early WITH profit.`
          )
          .setFooter({ text: guildName })],
      });
    }

    // ── View vault status ─────────────────────────────────────────────────────
    if (!sub || sub === 'status') {
      if (!vault) {
        return message.channel.send({
          embeds: [new EmbedBuilder().setColor(BLACK)
            .setTitle('INVESTMENT VAULT')
            .setDescription(
              `> Lock coins for **24 hours** to earn **10% profit**\n\n` +
              `> Max lockable: **${INVESTMENT_CAP.toLocaleString()}** coins\n` +
              `> Returns: **${(INVESTMENT_RETURN * 100).toFixed(0)}%** of locked amount\n\n` +
              `__**Commands**__\n` +
              `> \`.invest <amount|all>\` — lock coins\n` +
              `> \`.invest collect\` — collect after 24h\n` +
              `> \`.invest break\` — retrieve early (no profit)\n\n` +
              `-# Buy a Vault Key in \`.sh utility\` to collect early WITH profit.`
            )
            .setFooter({ text: guildName })],
        });
      }

      const now     = Date.now();
      const ends    = new Date(vault.endsAt).getTime();
      const elapsed = now - new Date(vault.startedAt).getTime();
      const total   = ends - new Date(vault.startedAt).getTime();
      const ready   = now >= ends;

      const bar = progressBar(Math.min(elapsed, total), total);
      const remaining = Math.max(0, ends - now);
      const h = Math.floor(remaining / 3600_000);
      const m = Math.floor((remaining % 3600_000) / 60_000);

      return message.channel.send({
        embeds: [new EmbedBuilder().setColor(BLACK)
          .setTitle(ready ? 'VAULT STATUS — READY' : 'VAULT STATUS')
          .setDescription(
            `> Locked: **${vault.amount.toLocaleString()}** coins\n` +
            `> Returns: **${Math.floor(vault.amount * INVESTMENT_RETURN).toLocaleString()}** coins\n\n` +
            `> ${bar} ${ready ? 'Mature' : `${h}h ${m}m remaining`}\n\n` +
            (ready
              ? `-# Ready to collect — use \`.invest collect\`.`
              : `-# Come back when the vault matures.`)
          )
          .setFooter({ text: guildName })],
      });
    }

    // ── Lock new investment ───────────────────────────────────────────────────
    if (vault) {
      return message.channel.send('You already have a vault active. Collect it first with `.invest collect`.');
    }

    const balance = userData.balance || 0;
    let amount;
    if (sub === 'all' || sub === 'max') {
      amount = Math.min(balance, INVESTMENT_CAP);
    } else {
      amount = parseInt(sub, 10);
    }

    if (!amount || isNaN(amount) || amount <= 0) return message.channel.send('Invalid amount.');
    if (amount > INVESTMENT_CAP) return message.channel.send(`Max lockable is **${INVESTMENT_CAP.toLocaleString()}** coins.`);
    if (balance < amount) return message.channel.send('Insufficient balance.');

    userData.balance = balance - amount;
    userData.vault = {
      amount,
      startedAt: new Date(),
      endsAt:    new Date(Date.now() + LOCK_DURATION_MS),
    };
    await saveUserData({ balance: userData.balance, vault: userData.vault });

    return message.channel.send({
      embeds: [new EmbedBuilder().setColor(BLACK)
        .setTitle('VAULT LOCKED')
        .setDescription(
          `> Your coins are locked in the vault\n\n` +
          `> Locked: **${amount.toLocaleString()}** coins\n` +
          `> Returns: **${Math.floor(amount * INVESTMENT_RETURN).toLocaleString()}** coins (+${Math.floor((INVESTMENT_RETURN - 1) * 100)}%)\n` +
          `> Matures in: **24 hours**\n\n` +
          `-# Use \`.invest collect\` after 24 hours.`
        )
        .setFooter({ text: guildName })],
    });
  },
};
