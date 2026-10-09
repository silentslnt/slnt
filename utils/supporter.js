// utils/supporter.js — weekly coins for the Supporter role (direct: "supporter role in shiroset gets 2k coins/week").
// The role and amount are set on the `.shiroset` Home page. Every 30 minutes each holder is paid once per ISO week:
// the week is claimed on the user's own doc in the same update that adds the coins, so nobody is ever paid twice.
const settings = require('./settings');
const User = require('../models/user');

const DEFAULT_AMOUNT = 2_000;

function weekKey(d = new Date()) {
  const t = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const y0 = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  return `${t.getUTCFullYear()}-W${Math.ceil(((t - y0) / 86400000 + 1) / 7)}`;
}

const cfg = () => ({ roleId: settings.get('supporterRoleId', null), amount: settings.get('supporterWeekly', DEFAULT_AMOUNT) });

async function tick(client, logAdminAction) {
  const { roleId, amount } = cfg();
  if (!roleId || !(amount > 0)) return;
  const wk = weekKey();
  for (const guild of client.guilds.cache.values()) {
    const role = guild.roles.cache.get(roleId);
    if (!role) continue;
    await guild.members.fetch().catch(() => null);
    for (const m of role.members.values()) {
      if (m.user.bot) continue;
      const paid = await User.updateOne({ userId: m.id, supporterWeek: { $ne: wk } },
        { $set: { supporterWeek: wk }, $inc: { balance: amount } }, { upsert: true })
        .then((r) => (r.modifiedCount || r.upsertedCount) > 0).catch(() => false);   // a dup-key on upsert = already paid
      if (!paid) continue;
      await logAdminAction?.(client.user.id, 'Shiro', 'supporter', 'Weekly supporter coins', m.id, m.user.username, `+${amount}`).catch(() => {});
      m.send(`💖 Thanks for supporting **${guild.name}** — your weekly **${amount.toLocaleString()}** coins are in your wallet.`).catch(() => {});
    }
  }
}

module.exports = { tick, cfg, weekKey, DEFAULT_AMOUNT };
