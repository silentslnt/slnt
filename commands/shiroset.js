// commands/shiroset.js — Shiro's admin panel (direct: "make a raceset admin panel like you did for Sentinel… I want to
// manage things there"). Trusted list / OWNER_ID only. One card, pages by buttons, everything by clicks + small forms:
//   Home     — house balance at a glance, log channels
//   House    — the game ledger, adjust (+/−) or reset it
//   Players  — pick anyone: coins / SILV give or take, look at their wallet
//   Logs     — set the economy log channel and the live-wins channel; recent actions
const {
  ActionRowBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, MessageFlags,
  UserSelectMenuBuilder, ChannelSelectMenuBuilder, ChannelType,
} = require('discord.js');
const { isWhitelisted } = require('../utils/permissions');
const { card, button, row, ButtonStyle } = require('../utils/casino');
const { getBank, resetBank, adjustHouse, withdrawHouse } = require('../utils/houseBank');
const { debit, credit } = require('../utils/atomicInv');

const SILV_KEY = 'Silv token';
const fmt = (n) => (Math.floor(n || 0)).toLocaleString();

module.exports = {
  name: 'shiroset',
  aliases: ['sset', 'econpanel', 'shiropanel'],
  description: 'Owner/trusted only — Shiro admin panel: house balance, players, logs.',

  async execute({ message, getUserData, logAdminAction, AdminLog, getEconomyLogsChannel, setEconomyLogsChannel }) {
    if (!isWhitelisted(message) && message.author.id !== process.env.OWNER_ID) return;
    const guildName = message.guild?.name || 'Shiro';
    const state = { page: 'home', target: null };
    const winsCfg = () => {
      try { return JSON.parse(require('fs').readFileSync(require('path').join(__dirname, '..', 'vouch-config.json'), 'utf8')); } catch { return {}; }
    };
    const nav = () => row(
      button('ss_home', 'Home', state.page === 'home' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      button('ss_house', 'House', state.page === 'house' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      button('ss_players', 'Players', state.page === 'players' ? ButtonStyle.Primary : ButtonStyle.Secondary),
      button('ss_logs', 'Logs', state.page === 'logs' ? ButtonStyle.Primary : ButtonStyle.Secondary),
    );

    const render = async () => {
      const b = await getBank();
      if (state.page === 'house') {
        const games = Object.entries(b.games || {}).sort((x, y) => (y[1].net || 0) - (x[1].net || 0))
          .map(([g, v]) => `> **${g}** — ${(v.net || 0) >= 0 ? '+' : ''}${fmt(v.net)} over ${fmt(v.rounds)} rounds`).join('\n');
        const taxes = Object.entries(b.taxes || {}).map(([k, v]) => `> ${k.replace(/_/g, ' ')} — ${fmt(v)}`).join('\n');
        const edge = b.wagered ? (((b.wagered - b.paid) / b.wagered) * 100).toFixed(2) : '0.00';
        return card({
          title: '🏦 House',
          body: `# ${(b.balance || 0) >= 0 ? '+' : ''}${fmt(b.balance)} coins\n`
            + `> Wagered **${fmt(b.wagered)}** · paid back **${fmt(b.paid)}** · kept **${edge}%** · ${fmt(b.rounds)} rounds\n`
            + `> Fees & taxes **${fmt(b.fees)}**${b.adjusted ? ` · owner adjustments **${fmt(b.adjusted)}**` : ''}${b.withdrawn ? ` · paid out to players **${fmt(b.withdrawn)}**` : ''}\n\n`
            + `__**By game**__\n${games || '> No rounds yet.'}` + (taxes ? `\n\n__**Taxes**__\n${taxes}` : ''),
          rows: [nav(), row(button('ss_hadj', 'Adjust balance…'), button('ss_topay', 'Pay a player…', ButtonStyle.Success), button('ss_hreset', 'Reset ledger', ButtonStyle.Danger), button('ss_refresh', 'Refresh'))],
          footer: `${guildName} · the house balance is bookkeeping — not a user, never on a leaderboard`,
        });
      }
      if (state.page === 'players') {
        let body = '> Pick a player below.';
        const rows = [nav(), new ActionRowBuilder().addComponents(new UserSelectMenuBuilder().setCustomId('ss_pick').setPlaceholder('Pick a player…'))];
        if (state.target) {
          const d = await getUserData(state.target);
          const silv = d.inventory?.[SILV_KEY] || 0;
          const items = Object.entries(d.inventory || {}).filter(([k, n]) => k !== SILV_KEY && n > 0).slice(0, 12)
            .map(([k, n]) => `${k} ×${n}`).join(' · ');
          body = `**<@${state.target}>**\n> 🪙 Coins **${fmt(d.balance)}** · 💎 SILV **${fmt(silv)}** · earned **${fmt(d.totalEarned)}**\n`
            + `> Level ${d.level || 1} · streak ${d.streak || 0}\n${items ? `> ${items}` : '> Bag empty.'}`;
          rows.push(row(button('ss_cgive', 'Give coins'), button('ss_ctake', 'Take coins'), button('ss_sgive', 'Give SILV'), button('ss_stake', 'Take SILV')));
          rows.push(row(button('ss_hpay', 'Pay from house…', ButtonStyle.Success, false, '🏦')));
          body += `\n-# Pay from house moves coins out of the house balance (now ${fmt(b.balance)}) into their wallet — works on yourself too.`;
        }
        return card({ title: '👥 Players', body, rows, footer: `${guildName} · every change is logged` });
      }
      if (state.page === 'logs') {
        const logs = AdminLog ? await AdminLog.find({}).sort({ timestamp: -1 }).limit(10).lean() : [];
        const lines = logs.map((l) => `> <t:${Math.floor(new Date(l.timestamp).getTime() / 1000)}:R> **${l.adminUsername}** \`.${l.command}\` — ${l.action}`
          + (l.targetUsername ? ` → ${l.targetUsername}` : '') + (l.details ? ` \`${String(l.details).slice(0, 80)}\`` : '')).join('\n');
        const econ = getEconomyLogsChannel?.();
        const wins = winsCfg().winsChannelId;
        return card({
          title: '📜 Logs',
          body: `> Economy log channel: ${econ ? `<#${econ}>` : '**not set**'} — every admin action, conversion, payout, big win and SILV grant posts there.\n`
            + `> Live wins channel: ${wins ? `<#${wins}>` : '**not set**'} (\`/setup wins\`)\n\n__**Latest**__\n${lines || '> Nothing logged yet.'}`,
          rows: [nav(), new ActionRowBuilder().addComponents(new ChannelSelectMenuBuilder().setCustomId('ss_logch')
            .setPlaceholder('Set the economy log channel…').addChannelTypes(ChannelType.GuildText))],
          footer: `${guildName} · full history: .adminlogs [command|@user]`,
        });
      }
      const econ = getEconomyLogsChannel?.();
      return card({
        title: '⚙ Shiro panel',
        body: `> 🏦 House **${(b.balance || 0) >= 0 ? '+' : ''}${fmt(b.balance)}** coins · ${fmt(b.rounds)} rounds · taxes ${fmt(b.fees)}\n`
          + `> 📜 Logs ${econ ? `<#${econ}>` : '**not set** — open Logs'}\n\n-# House: the game ledger · Players: give/take coins and SILV · Logs: where everything is posted.`,
        rows: [nav()],
        footer: guildName,
      });
    };

    const msg = await message.channel.send(await render());
    const col = msg.createMessageComponentCollector({ time: 10 * 60_000 });

    const ask = async (i, title, label) => {
      const id = `ssm_${i.id}`;
      await i.showModal(new ModalBuilder().setCustomId(id).setTitle(title.slice(0, 45)).addComponents(
        new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('n').setLabel(label.slice(0, 45))
          .setStyle(TextInputStyle.Short).setRequired(true).setMaxLength(14))));
      const sub = await i.awaitModalSubmit({ time: 90_000, filter: (m) => m.customId === id && m.user.id === i.user.id }).catch(() => null);
      if (!sub) return [null, null];
      const n = parseInt(String(sub.fields.getTextInputValue('n')).replace(/[, ]/g, ''), 10);
      return [sub, Number.isFinite(n) ? n : null];
    };

    col.on('collect', async (i) => {
      if (i.user.id !== message.author.id) return i.reply({ content: 'Only whoever opened this panel can use it.', flags: MessageFlags.Ephemeral });
      const id = i.customId;
      try {
        if (['ss_home', 'ss_house', 'ss_players', 'ss_logs'].includes(id)) {
          state.page = id.slice(3);
          return i.update(await render());
        }
        if (id === 'ss_refresh') return i.update(await render());
        if (id === 'ss_topay') { state.page = 'players'; return i.update(await render()); }
        if (id === 'ss_pick') {
          state.target = i.values[0];
          return i.update(await render());
        }
        if (id === 'ss_logch') {
          await setEconomyLogsChannel(i.values[0]);
          await logAdminAction(i.user.id, i.user.username, 'shiroset', 'Set economy log channel', null, null, `#${i.values[0]}`);
          return i.update(await render());
        }
        if (id === 'ss_hreset') {
          await resetBank();
          await logAdminAction(i.user.id, i.user.username, 'shiroset', 'Reset the house ledger');
          return i.update(await render());
        }
        if (id === 'ss_hadj') {
          const [sub, n] = await ask(i, 'Adjust the house balance', 'Amount (+ adds, − takes)');
          if (!sub) return;
          if (!n) return sub.reply({ content: 'Enter a whole number, e.g. 50000 or -20000.', flags: MessageFlags.Ephemeral });
          await adjustHouse(n);
          await logAdminAction(i.user.id, i.user.username, 'shiroset', 'Adjusted the house balance', null, null, `${n > 0 ? '+' : ''}${n}`);
          await sub.reply({ content: `🏦 House ${n > 0 ? '+' : ''}${fmt(n)}.`, flags: MessageFlags.Ephemeral });
          return msg.edit(await render()).catch(() => {});
        }
        if (id === 'ss_hpay' && state.target) {
          const [sub, n] = await ask(i, 'Pay from the house balance', 'How many coins?');
          if (!sub) return;
          if (!n || n < 1) return sub.reply({ content: 'Enter a whole number, 1 or more.', flags: MessageFlags.Ephemeral });
          if (!(await withdrawHouse(n))) return sub.reply({ content: "❌ The house doesn't hold that much.", flags: MessageFlags.Ephemeral });
          await credit(state.target, { balance: n });
          const tu = await message.client.users.fetch(state.target).catch(() => null);
          await logAdminAction(i.user.id, i.user.username, 'shiroset', 'Paid from the house balance', state.target, tu?.username || state.target, `+${n}`);
          await sub.reply({ content: `🏦 Paid ${fmt(n)} coins from the house to <@${state.target}>.`, flags: MessageFlags.Ephemeral });
          return msg.edit(await render()).catch(() => {});
        }
        if (['ss_cgive', 'ss_ctake', 'ss_sgive', 'ss_stake'].includes(id) && state.target) {
          const silv = id.startsWith('ss_s');
          const give = id.endsWith('give');
          const [sub, n] = await ask(i, `${give ? 'Give' : 'Take'} ${silv ? 'SILV' : 'coins'}`, 'How many?');
          if (!sub) return;
          if (!n || n < 1) return sub.reply({ content: 'Enter a whole number, 1 or more.', flags: MessageFlags.Ephemeral });
          const what = silv ? { items: { [SILV_KEY]: n } } : { balance: n };
          let ok = true;
          if (give) await credit(state.target, what);
          else ok = await debit(state.target, what);
          const tu = await message.client.users.fetch(state.target).catch(() => null);
          if (ok) await logAdminAction(i.user.id, i.user.username, 'shiroset', `${give ? 'Gave' : 'Took'} ${silv ? 'SILV' : 'coins'}`,
            state.target, tu?.username || state.target, `${give ? '+' : '-'}${n}`);
          await sub.reply({ content: ok ? `✅ ${give ? 'Gave' : 'Took'} ${fmt(n)} ${silv ? 'SILV' : 'coins'}.` : '❌ They don\'t have that much.', flags: MessageFlags.Ephemeral });
          return msg.edit(await render()).catch(() => {});
        }
        return i.deferUpdate();
      } catch (e) {
        console.error('shiroset:', e);
        if (!i.replied && !i.deferred) i.reply({ content: 'Something went wrong.', flags: MessageFlags.Ephemeral }).catch(() => {});
      }
    });
    col.on('end', () => msg.edit({ components: msg.components }).catch(() => {}));
  },
};
