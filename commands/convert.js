// commands/convert.js — one CV2 card for SILV conversions.
//   Coins → SILV   (COINS_PER_SILV coins = 1 SILV)   — the only way to MAKE SILV from play
//   SILV  → Aether (AETHER_PER_SILV Aether per SILV) — one-way into Sentinel's RPG
// SILV is real value (1 SILV = 10 Robux), so there is deliberately no
// Aether → SILV path and coin → SILV has a daily cap.
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, MessageFlags,
} = require('discord.js');
const { awardPoints } = require('../utils/sentinelDb');

const SILV_KEY = 'Silv token';
const COINS_PER_SILV = 100_000;
const AETHER_PER_SILV = 10_000;
const COIN_TO_SILV_DAILY_CAP = 5;
const ACCENT = 0x000000;
const busy = new Set();

function todayKey() { return new Date().toISOString().slice(0, 10); }

function card(userData, note, guildName) {
  const silv = userData.inventory?.[SILV_KEY] || 0;
  const coins = userData.balance || 0;
  const conv = userData.silvConvert || {};
  const usedToday = conv.day === todayKey() ? conv.count || 0 : 0;
  const c = new ContainerBuilder().setAccentColor(ACCENT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## 💎 SILV Conversion\n` +
      `**Coins:** \`${coins.toLocaleString()}\` · **SILV:** \`${silv}\`\n\n` +
      `__**Coins → SILV**__\n> \`${COINS_PER_SILV.toLocaleString()}\` coins = **1 SILV** · \`${COIN_TO_SILV_DAILY_CAP - usedToday}\`/${COIN_TO_SILV_DAILY_CAP} left today\n` +
      `__**SILV → Aether**__ *(Sentinel's RPG currency)*\n> **1 SILV** = \`${AETHER_PER_SILV.toLocaleString()}\` Aether — one-way, Aether can't become SILV`,
    ))
    .addSeparatorComponents(new SeparatorBuilder())
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cv_c2s_1').setLabel('Buy 1 SILV').setEmoji('💎').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('cv_c2s_5').setLabel('Buy 5 SILV').setEmoji('💎').setStyle(ButtonStyle.Secondary),
    ))
    .addActionRowComponents(new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('cv_s2a_1').setLabel('1 SILV → Aether').setEmoji('💠').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId('cv_s2a_5').setLabel('5 SILV → Aether').setEmoji('💠').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('cv_s2a_10').setLabel('10 SILV → Aether').setEmoji('💠').setStyle(ButtonStyle.Secondary),
    ));
  if (note) c.addTextDisplayComponents(new TextDisplayBuilder().setContent(note));
  c.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${guildName} · 1 SILV = 10 Robux · rates: \`.rate\``));
  return c;
}

module.exports = {
  name: 'convert',
  aliases: ['swap', 'conversion'],
  description: 'Convert coins → SILV and SILV → Aether (Sentinel). One card, buttons.',
  COINS_PER_SILV,
  AETHER_PER_SILV,

  async execute({ message, userData, getUserData, saveSpecificUserData, logAdminAction }) {
    if (!message.guild) return message.channel.send('Must be used in a server.');
    const guild = message.guild;
    const msg = await message.channel.send({ components: [card(userData, '', guild.name)], flags: MessageFlags.IsComponentsV2 });
    const collector = msg.createMessageComponentCollector({ time: 120_000 });

    collector.on('collect', async (i) => {
      if (i.user.id !== message.author.id) return i.reply({ content: 'Open your own with `.convert`.', ephemeral: true });
      if (busy.has(i.user.id)) return i.deferUpdate();
      busy.add(i.user.id);
      try {
        const [, kind, nStr] = i.customId.split('_');
        const n = parseInt(nStr, 10);
        const data = await getUserData(i.user.id); // fresh at click time
        data.inventory = data.inventory || {};
        const silv = data.inventory[SILV_KEY] || 0;
        let note;
        if (kind === 'c2s') {
          const conv = data.silvConvert && data.silvConvert.day === todayKey() ? data.silvConvert : { day: todayKey(), count: 0 };
          const cost = n * COINS_PER_SILV;
          if (conv.count + n > COIN_TO_SILV_DAILY_CAP) note = `❌ Daily limit — ${COIN_TO_SILV_DAILY_CAP - conv.count} left today.`;
          else if ((data.balance || 0) < cost) note = `❌ Need \`${cost.toLocaleString()}\` coins.`;
          else {
            data.balance -= cost;
            data.inventory[SILV_KEY] = silv + n;
            conv.count += n;
            data.silvConvert = conv;
            await saveSpecificUserData(i.user.id, { balance: data.balance, inventory: data.inventory, silvConvert: data.silvConvert });
            await logAdminAction(i.user.id, i.user.username, 'convert', 'Coins → SILV', null, null, `${cost} coins → ${n} SILV`);
            note = `✅ \`${cost.toLocaleString()}\` coins → **${n} SILV**.`;
          }
        } else {
          if (silv < n) note = `❌ You have \`${silv}\` SILV.`;
          else {
            data.inventory[SILV_KEY] = silv - n;
            await saveSpecificUserData(i.user.id, { inventory: data.inventory });
            const ok = await awardPoints(guild.id, i.user.id, n * AETHER_PER_SILV);
            if (!ok) {
              data.inventory[SILV_KEY] = silv; // refund — never eat SILV on a failed bridge write
              await saveSpecificUserData(i.user.id, { inventory: data.inventory });
              note = '❌ Sentinel is unreachable right now — your SILV was refunded.';
            } else {
              await logAdminAction(i.user.id, i.user.username, 'convert', 'SILV → Aether', null, null, `${n} SILV → ${n * AETHER_PER_SILV} Aether`);
              note = `✅ **${n} SILV** → \`${(n * AETHER_PER_SILV).toLocaleString()}\` Aether in Sentinel.`;
            }
          }
        }
        await i.update({ components: [card(data, note, guild.name)], flags: MessageFlags.IsComponentsV2 });
      } finally {
        busy.delete(i.user.id);
      }
    });
    collector.on('end', () => msg.edit({ components: [card(userData, '-# Expired — run `.convert` again.', guild.name)] }).catch(() => {}));
  },
};
