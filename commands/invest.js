// commands/invest.js
const { EmbedBuilder } = require('discord.js');
const { COLOR, INVESTMENT_CAP, INVESTMENT_RETURN } = require('../utils/config');
const { requireAdmin } = require('../utils/permissions');
const { progressBar } = require('../utils/xp');
const { trackStat } = require('../utils/achievements');

const LOCK_DURATION_MS = 24 * 60 * 60 * 1000; // 24 hours

module.exports = {
  name: 'invest',
  aliases: ['vault', 'iv'],
  adminOnly: true,
  description: 'Lock coins in the vault for 24h to earn 10% profit. `.invest <amount|all>`',

  async execute({ message, args, userData, saveUserData }) {
    if (!await requireAdmin(message)) return;

    const sub = (args[0] || '').toLowerCase();

    // ── Check active vault ────────────────────────────────────────────────────
    const vault = userData.vault || null;

    if (sub === 'collect' || sub === 'claim') {
      if (!vault) return message.channel.send('꒰ঌ You have no active vault investment ໒꒱');
      const now  = Date.now();
      const ends = new Date(vault.endsAt).getTime();
      if (now < ends) {
        const remaining = ends - now;
        const h = Math.floor(remaining / 3600_000);
        const m = Math.floor((remaining % 3600_000) / 60_000);
        return message.channel.send({
          embeds: [new EmbedBuilder().setColor(COLOR.WARNING)
            .setTitle('˗ˏˋ 𐙚 🗝️ Vault Still Locked 𐙚 ˎˊ˗')
            .setDescription(
              `꒰ঌ Your vault matures in **${h}h ${m}m** ໒꒱\n\n` +
              `Locked: **${vault.amount.toLocaleString()}** coins\n` +
              `Returns: **${Math.floor(vault.amount * INVESTMENT_RETURN).toLocaleString()}** coins\n\n` +
              `💡 You can open it early with \`.invest break\` (no profit).`
            )
            .setFooter({ text: 'System • Investment Vault' })],
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
        embeds: [new EmbedBuilder().setColor(COLOR.WIN)
          .setTitle('˗ˏˋ 𐙚 🏦 Vault Collected! 𐙚 ˎˊ˗')
          .setDescription(
            `꒰ঌ Your investment matured! ໒꒱\n\n` +
            `Invested: **${vault.amount.toLocaleString()}**\n` +
            `Returned: **${returns.toLocaleString()}** (+${Math.floor((INVESTMENT_RETURN - 1) * 100)}%)\n` +
            `Profit: **+${(returns - vault.amount).toLocaleString()}** coins\n\n` +
            `💼 New Balance: **${userData.balance.toLocaleString()}**`
          )
          .setFooter({ text: 'System • Investment Vault' }).setTimestamp()],
      });
    }

    // Break vault early (no profit, just return coins)
    if (sub === 'break') {
      if (!vault) return message.channel.send('꒰ঌ No active vault to break ໒꒱');
      userData.balance = (userData.balance || 0) + vault.amount;
      userData.vault   = null;
      await saveUserData({ balance: userData.balance, vault: null });
      return message.channel.send({
        embeds: [new EmbedBuilder().setColor(COLOR.WARNING)
          .setTitle('˗ˏˋ 𐙚 🔓 Vault Broken Early 𐙚 ˎˊ˗')
          .setDescription(
            `꒰ঌ You broke your vault early — no profit ໒꒱\n\n` +
            `Returned: **${vault.amount.toLocaleString()}** coins (no interest)\n` +
            `💼 Balance: **${userData.balance.toLocaleString()}**\n\n` +
            `💡 Tip: Use \`.sh buy vault_key\` to break early WITH profit!`
          )
          .setFooter({ text: 'System • Investment Vault' })],
      });
    }

    // ── View vault status ─────────────────────────────────────────────────────
    if (!sub || sub === 'status') {
      if (!vault) {
        return message.channel.send({
          embeds: [new EmbedBuilder().setColor(COLOR.DEFAULT)
            .setTitle('˗ˏˋ 𐙚 🏦 𝕀𝕟𝕧𝕖𝕤𝕥𝕞𝕖𝕟𝕥 𝕍𝕒𝕦𝕝𝕥 𐙚 ˎˊ˗')
            .setDescription(
              '꒰ঌ Lock coins for **24 hours** to earn **10% profit** ໒꒱\n\n' +
              `📦 Max lockable: **${INVESTMENT_CAP.toLocaleString()}** coins\n` +
              `📈 Returns: **${(INVESTMENT_RETURN * 100).toFixed(0)}%** of locked amount\n\n` +
              '**Commands:**\n' +
              '`.invest <amount|all>` — Lock coins\n' +
              '`.invest collect` — Collect after 24h\n' +
              '`.invest break` — Retrieve early (no profit)\n\n' +
              '💡 Buy a **Vault Key** in the shop to collect early WITH profit!'
            )
            .setFooter({ text: 'System • Investment Vault' })],
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
        embeds: [new EmbedBuilder().setColor(ready ? COLOR.WIN : COLOR.DEFAULT)
          .setTitle(`˗ˏˋ 𐙚 🏦 Vault Status ${ready ? '— ✅ Ready!' : ''} 𐙚 ˎˊ˗`)
          .setDescription(
            `💰 Locked: **${vault.amount.toLocaleString()}** coins\n` +
            `📈 Returns: **${Math.floor(vault.amount * INVESTMENT_RETURN).toLocaleString()}** coins\n\n` +
            `${bar} ${ready ? '✅ Mature!' : `${h}h ${m}m remaining`}\n\n` +
            (ready
              ? '꒰ঌ Ready to collect! Use `.invest collect` ໒꒱'
              : '꒰ঌ Come back when the vault matures ໒꒱')
          )
          .setFooter({ text: 'System • Investment Vault' })],
      });
    }

    // ── Lock new investment ───────────────────────────────────────────────────
    if (vault) {
      return message.channel.send(`❌ You already have a vault active. Collect it first with \`.invest collect\`.`);
    }

    const balance = userData.balance || 0;
    let amount;
    if (sub === 'all' || sub === 'max') {
      amount = Math.min(balance, INVESTMENT_CAP);
    } else {
      amount = parseInt(sub, 10);
    }

    if (!amount || isNaN(amount) || amount <= 0) return message.channel.send('❌ Invalid amount.');
    if (amount > INVESTMENT_CAP) return message.channel.send(`❌ Max lockable is **${INVESTMENT_CAP.toLocaleString()}** coins.`);
    if (balance < amount) return message.channel.send('❌ Insufficient balance.');

    userData.balance = balance - amount;
    userData.vault = {
      amount,
      startedAt: new Date(),
      endsAt:    new Date(Date.now() + LOCK_DURATION_MS),
    };
    await saveUserData({ balance: userData.balance, vault: userData.vault });

    return message.channel.send({
      embeds: [new EmbedBuilder().setColor(COLOR.ESSENCE)
        .setTitle('˗ˏˋ 𐙚 🔒 Vault Locked 𐙚 ˎˊ˗')
        .setDescription(
          `꒰ঌ Your coins are locked in the vault! ໒꒱\n\n` +
          `💰 Locked: **${amount.toLocaleString()}** coins\n` +
          `📈 Returns: **${Math.floor(amount * INVESTMENT_RETURN).toLocaleString()}** coins (+${Math.floor((INVESTMENT_RETURN-1)*100)}%)\n` +
          `⏰ Matures in: **24 hours**\n\n` +
          `💡 Use \`.invest collect\` after 24 hours!`
        )
        .setFooter({ text: 'System • Investment Vault' }).setTimestamp()],
    });
  },
};