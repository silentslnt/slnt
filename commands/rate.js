// commands/rate.js — Show SILV ↔ coins ↔ Robux conversion rates
const { EmbedBuilder } = require('discord.js');
const { COLOR, SILV_PER_ROBUX } = require('../utils/config');

// 1 Robux ≈ $0.0125 USD (Roblox standard rate)
const ROBUX_TO_USD = 0.0125;

module.exports = {
  name: 'rate',
  aliases: ['convert', 'rates'],
  adminOnly: false,
  description: 'Show SILV coin conversion rates. `.rate [amount]`',

  async execute({ message, args, userData }) {
    const rawAmount = parseInt(args[0]) || 1;
    const amount    = Math.max(1, Math.min(rawAmount, 1_000_000_000));

    // 1 SILV = 10 Robux (from config)
    const COINS_PER_SILV = 10_000; // assumption: 10,000 coins = 1 SILV (shop economy)

    const silvValue  = amount / COINS_PER_SILV;
    const robuxValue = silvValue * SILV_PER_ROBUX;
    const usdValue   = robuxValue * ROBUX_TO_USD;

    const userCoins  = userData?.balance || 0;
    const userSilv   = (userData?.inventory?.silv_token || 0);
    const userRobux  = userSilv * SILV_PER_ROBUX;

    const embed = new EmbedBuilder()
      .setColor(COLOR.PRESTIGE)
      .setTitle('˗ˏˋ 💎 SILV Rate ˎˊ˗')
      .setDescription(
        `**꒰ঌ Exchange Rates ໒꒱**\n\n` +
        `\`10,000 coins\` = **1 SILV token**\n` +
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
