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
        .setColor('#F5E6FF')
        .setTitle('✧˚₊‧ ❌ 𝔠𝔞𝔫’𝔱 𝔠𝔩𝔞𝔦𝔪 𝔞 𝔨𝔢𝔶 ‧₊˚✧')
        .setDescription(
          '꒰ঌ There is no claimable key right now, or it has already been claimed ໒꒱'
        );

      const replyMsg = await message.reply({ embeds: [replyEmbed] });

      // Delete this reply after 5 seconds so only the claimer briefly sees it
      setTimeout(() => {
        replyMsg.delete().catch(() => {});
      }, 5000);

      return;
    }

    // Optional personal success message (public announce is done in keydrop.js)
    const successEmbed = new EmbedBuilder()
      .setColor('#C1FFD7')
      .setTitle('˗ˏˋ 𐙚 🔑 𝔎𝔢𝔶 𝔠𝔩𝔞𝔦𝔪𝔢𝔡 𐙚 ˎˊ˗')
      .setDescription(
        '꒰ঌ You successfully claimed the key! It has been gently placed into your inventory ໒꒱'
      );

    const successMsg = await message.reply({ embeds: [successEmbed] });

    // Also delete personal success message after 5 seconds
    setTimeout(() => {
      successMsg.delete().catch(() => {});
    }, 5000);
  },
};
