// commands/convert.js — one CV2 card for SILV conversions.
//   Coins → SILV   (COINS_PER_SILV coins = 1 SILV)   — the only way to MAKE SILV from play
//   SILV  → Aether (AETHER_PER_SILV Aether per SILV) — one-way into Sentinel's RPG
// SILV is real value (1 SILV = 10 Robux), so there is deliberately no
// Aether → SILV path and coin → SILV has a daily cap.
const {
  ContainerBuilder, TextDisplayBuilder, SeparatorBuilder, ActionRowBuilder,
  ButtonBuilder, ButtonStyle, MessageFlags, SectionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle,
} = require('discord.js');
const { awardPoints } = require('../utils/sentinelDb');

const SILV_KEY = 'Silv token';
const COINS_PER_SILV = 100_000;
const AETHER_PER_SILV = 10_000;
const COIN_TO_SILV_DAILY_CAP = 5;
const ACCENT = 0x000000;
const busy = new Set();

function todayKey() { return new Date().toISOString().slice(0, 10); }

function card(userData, guildName) {
  const silv = userData.inventory?.[SILV_KEY] || 0;
  const coins = userData.balance || 0;
  const conv = userData.silvConvert || {};
  const left = COIN_TO_SILV_DAILY_CAP - (conv.day === todayKey() ? conv.count || 0 : 0);
  return new ContainerBuilder().setAccentColor(ACCENT)
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(
      `## 💎 Convert\n-# Coins \`${coins.toLocaleString()}\` · SILV \`${silv}\``))
    .addSeparatorComponents(new SeparatorBuilder())
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**Coins → SILV**\n-# ${COINS_PER_SILV.toLocaleString()} coins each · ${left} left today`))
      .setButtonAccessory(new ButtonBuilder().setCustomId('cv_c2s').setLabel('Convert').setStyle(ButtonStyle.Primary)))
    .addSectionComponents(new SectionBuilder()
      .addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `**SILV → Aether**\n-# ${AETHER_PER_SILV.toLocaleString()} Aether each · for Sentinel's RPG · one-way`))
      .setButtonAccessory(new ButtonBuilder().setCustomId('cv_s2a').setLabel('Convert').setStyle(ButtonStyle.Secondary)))
    .addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# ${guildName} · 1 SILV = 10 Robux`));
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
    const msg = await message.channel.send({ components: [card(userData, guild.name)], flags: MessageFlags.IsComponentsV2 });
    const collector = msg.createMessageComponentCollector({ time: 120_000 });

    collector.on('collect', async (i) => {
      if (i.user.id !== message.author.id) return i.reply({ content: 'Open your own with `.convert`.', flags: MessageFlags.Ephemeral });
      const kind = i.customId.split('_')[1];
      const modalId = `cvm_${kind}_${i.id}`;
      await i.showModal(new ModalBuilder().setCustomId(modalId)
        .setTitle(kind === 'c2s' ? 'Coins → SILV' : 'SILV → Aether')
        .addComponents(new ActionRowBuilder().addComponents(
          new TextInputBuilder().setCustomId('n').setLabel(kind === 'c2s' ? 'How many SILV to buy?' : 'How many SILV to convert?')
            .setStyle(TextInputStyle.Short).setPlaceholder('1').setRequired(true).setMaxLength(4))));
      let sub;
      try {
        sub = await i.awaitModalSubmit({ time: 60_000, filter: (m) => m.customId === modalId && m.user.id === i.user.id });
      } catch { return; }
      const n = parseInt(sub.fields.getTextInputValue('n'), 10);
      if (!Number.isInteger(n) || n < 1) return sub.reply({ content: '❌ Enter a whole number, 1 or more.', flags: MessageFlags.Ephemeral });
      if (busy.has(i.user.id)) return sub.reply({ content: '⏳ One conversion at a time.', flags: MessageFlags.Ephemeral });
      busy.add(i.user.id);
      let note;
      try {
        const data = await getUserData(i.user.id); // fresh at submit time
        data.inventory = data.inventory || {};
        const silv = data.inventory[SILV_KEY] || 0;
        if (kind === 'c2s') {
          const conv = data.silvConvert && data.silvConvert.day === todayKey() ? data.silvConvert : { day: todayKey(), count: 0 };
          const cost = n * COINS_PER_SILV;
          if (conv.count + n > COIN_TO_SILV_DAILY_CAP) note = `❌ Daily limit — you can buy ${COIN_TO_SILV_DAILY_CAP - conv.count} more today.`;
          else if ((data.balance || 0) < cost) note = `❌ That needs \`${cost.toLocaleString()}\` coins — you have \`${(data.balance || 0).toLocaleString()}\`.`;
          else {
            data.balance -= cost;
            data.inventory[SILV_KEY] = silv + n;
            conv.count += n;
            data.silvConvert = conv;
            await saveSpecificUserData(i.user.id, { balance: data.balance, inventory: data.inventory, silvConvert: data.silvConvert });
            await logAdminAction(i.user.id, i.user.username, 'convert', 'Coins → SILV', null, null, `${cost} coins → ${n} SILV`);
            note = `✅ \`${cost.toLocaleString()}\` coins → **${n} SILV**.`;
          }
        } else if (silv < n) {
          note = `❌ You have \`${silv}\` SILV.`;
        } else {
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
        await sub.reply({ content: note, flags: MessageFlags.Ephemeral });
        await msg.edit({ components: [card(data, guild.name)] }).catch(() => {});
      } finally {
        busy.delete(i.user.id);
      }
    });
    collector.on('end', () => msg.edit({ components: [card(userData, guild.name)] }).catch(() => {}));
  },
};
