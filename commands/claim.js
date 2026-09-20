// commands/claim.js
const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'redeem',
  description: 'Claim the currently dropped key',
  /**
   * @param {Object} ctx
   * @param {import('discord.js').Message} ctx.message
   * @param {Function} ctx.addKeyToInventory
   * @param {Object} ctx.keydrop
   * @param {import('discord.js').Client} ctx.client
   */
  async execute({ message, addKeyToInventory, keydrop, client }) {
    const userId = message.author.id;

    // Try to claim using keydrop.js logic
    const success = await keydrop.claimKey(userId, addKeyToInventory, client);

    // If claimKey returned false, either there is no key or it was already claimed
    if (!success) {
      const replyEmbed = new EmbedBuilder()
        .setColor(0x000000)
        .setTitle('CAN\'T CLAIM')
        .setDescription('> There is no claimable key right now, or it has already been claimed.');

      const replyMsg = await message.reply({ embeds: [replyEmbed] });

      // Delete this reply after 5 seconds so only the claimer briefly sees it
      setTimeout(() => {
        replyMsg.delete().catch(() => {});
      }, 5000);

      return;
    }

    // Optional personal success message (public announce is done in keydrop.js)
    const successEmbed = new EmbedBuilder()
      .setColor(0x000000)
      .setTitle('KEY CLAIMED')
      .setDescription('> Added to your inventory.');

    const successMsg = await message.reply({ embeds: [successEmbed] });

    // Also delete personal success message after 5 seconds
    setTimeout(() => {
      successMsg.delete().catch(() => {});
    }, 5000);
  },
};
