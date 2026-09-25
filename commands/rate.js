// commands/rate.js — Show SILV ↔ coins ↔ Robux conversion rates
const { EmbedBuilder } = require('discord.js');
const { COLOR, SILV_PER_ROBUX } = require('../utils/config');

// 1 Robux ≈ $0.0125 USD (Roblox standard rate)
const ROBUX_TO_USD = 0.0125;

module.exports = {
  name: 'rate',
  aliases: ['rates'],
  adminOnly: false,
  description: 'Show SILV coin conversion rates. `.rate [amount]`',

  async execute({ message, args, userData }) {
    const rawAmount = parseInt(args[0]) || 1;
    const amount    = Math.max(1, Math.min(rawAmount, 1_000_000_000));

    // 1 SILV = 10 Robux (from config)
    const { COINS_PER_SILV } = require('./convert'); // single source of truth for the rate

    const silvValue  = amount / COINS_PER_SILV;
    const robuxValue = silvValue * SILV_PER_ROBUX;
    const usdValue   = robuxValue * ROBUX_TO_USD;

    const userCoins  = userData?.balance || 0;
    const userSilv   = (userData?.inventory?.['Silv token'] || 0)  // real key — 'silv_token' was never set, so this always showed 0;
    const userRobux  = userSilv * SILV_PER_ROBUX;

    const embed = new EmbedBuilder()
      .setColor(COLOR.PRESTIGE)
      .setTitle('˗ˏˋ 💎 SILV Rate ˎˊ˗')
      .setDescription(
        `**꒰ঌ Exchange Rates ໒꒱**\n\n` +
        `\`${COINS_PER_SILV.toLocaleString()} coins\` = **1 SILV token** (\`.convert\`)\n` +
        `\`1 SILV\` = **${SILV_PER_ROBUX} Robux**\n` +
        `\`1 Robux\` = **$${ROBUX_TO_USD} USD**\n` +
        `\`1 SILV\` = **$${(SILV_PER_ROBUX * ROBUX_TO_USD).toFixed(3)} USD**`
      )
      .addFields(
        {
          name: `꒰ ${amount.toLocaleString()} coins ꒱`,
          value: [
            `≈ **${silvValue.toFixed(4)} SILV**`,
            `≈ **${robuxValue.toFixed(1)} Robux**`,
            `≈ **$${usdValue.toFixed(4)} USD**`,
          ].join('\n'),
          inline: true,
        },
        {
          name: '꒰ Your Wallet ꒱',
          value: [
            `Coins: \`${userCoins.toLocaleString()}\``,
            `SILV: \`${userSilv}\` ≈ ${userRobux} R$`,
            `Net: ≈ $${((userSilv * SILV_PER_ROBUX + userCoins / COINS_PER_SILV * SILV_PER_ROBUX) * ROBUX_TO_USD).toFixed(2)} USD`,
          ].join('\n'),
          inline: true,
        }
      )
      .setFooter({ text: 'System • Rate  |  1 SILV = 10 Robux' });

    await message.channel.send({ embeds: [embed] });
  },
};
