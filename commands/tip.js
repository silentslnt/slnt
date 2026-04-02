// commands/tip.js — Tip coins to another player
const { EmbedBuilder } = require('discord.js');
const { COLOR } = require('../utils/config');
const { requireAdmin } = require('../utils/permissions');
const { parseBet } = require('../utils/parseBet');

module.exports = {
  name: 'tip',
  aliases: ['send'],
  adminOnly: true,
  description: 'Send coins to another player. `.tip @user <amount>`',

  async execute({ message, args, userData, saveUserData, updateUserBalance }) {
    if (!await requireAdmin(message)) return;

    const target = message.mentions.users.first();
    // Support both ".tip @user 500" and ".tip 500 @user"
    const amountArg = args.find(a => !a.startsWith('<@'));
    const bet       = parseBet(amountArg, userData.balance || 0);

    if (!target || target.bot || target.id === message.author.id || !bet) {
      return message.channel.send({
        embeds: [new EmbedBuilder().setColor(COLOR.DEFAULT)
          .setTitle('˗ˏˋ 💸 Tip ˎˊ˗')
          .setDescription(
            '꒰ঌ Usage ໒꒱\n\n' +
            '`.tip @user <amount|all>`\n\n' +
            '**Examples:**\n' +
            '`.tip @Shiro 500` — send 500 coins\n' +
            '`.tip @Shiro all` — send all your coins'
          )],
      });
    }

    if ((userData.balance || 0) < bet) {
      return message.channel.send({
        content: `❌ You only have **${(userData.balance||0).toLocaleString()}** coins.`,
      });
    }

    // Atomic update both balances
    userData.balance = (userData.balance || 0) - bet;
    await saveUserData(userData);
    await updateUserBalance(target.id, bet);

    const embed = new EmbedBuilder()
      .setColor(COLOR.WIN)
      .setTitle('˗ˏˋ 💸 Tip Sent ˎˊ˗')
      .setDescription(
        `${message.author} sent **${bet.toLocaleString()}** coins to ${target}!\n\n` +
        `꒰ Your new balance: \`${userData.balance.toLocaleString()}\` ꒱`
      )
      .setFooter({ text: 'System • Tip' });

    await message.channel.send({ embeds: [embed] });
  },
};
