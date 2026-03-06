const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'bal',
  description: 'Check your balance or another user\'s balance',
  async execute({ message, args, userData, getUserData }) {
    try {
      // Get the user to check balance for (mentioned user or message author)
      const targetUser = message.mentions.users.first() || message.author;
      const targetId = targetUser.id;

      // Fetch target user's data from MongoDB
      const targetData = await getUserData(targetId);
      const balance = (targetData.balance || 0);

      // Create response embed (angelic style)
      const embed = new EmbedBuilder()
        .setColor('#F5E6FF')
        .setTitle(`˗ˏˋ 𐙚 ${targetUser.username}'𝕤 𝔹𝕒𝕝𝕒𝕟𝕔𝕖 𐙚 ˎˊ˗`)
        .setDescription(
          [
            '꒰ঌ 𝔞𝔠𝔠𝔬𝔲𝔫𝔱 𝔰𝔲𝔪𝔪𝔞𝔯𝔶 ໒꒱',
            '',
            `💰 Balance: **${balance}** coins`
          ].join('\n')
        )
        .setTimestamp()
        .setFooter({ text: 'System • Economy Panel' });

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error in balance command:', error);
      message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F5E6FF')
            .setTitle('✧˚₊‧ ❌ 𝔈𝔯𝔯𝔬𝔯 ‧₊˚✧')
            .setDescription('❌ Something went wrong while fetching balance.')
            .setFooter({ text: 'System • Internal Error' })
        ]
      });
    }
  },
};
