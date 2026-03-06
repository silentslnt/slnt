const { EmbedBuilder } = require('discord.js');
const mongoose = require('mongoose');

module.exports = {
  name: 'baltop',
  description: 'View the richest users on the server',
  async execute({ message, client }) {
    try {
      const User = mongoose.model('User');

      const topUsers = await User.find({})
        .sort({ balance: -1 })
        .limit(10)
        .lean();

      if (!topUsers || topUsers.length === 0) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#F5E6FF')
              .setTitle('✧˚₊‧ ❌ 𝔑𝔬 𝔘𝔰𝔢𝔯𝔰 𝔉𝔬𝔲𝔫𝔡 ‧₊˚✧')
              .setDescription('❌ No users found in the database.')
              .setFooter({ text: 'System • Economy Panel' })
          ]
        });
      }

      let leaderboard = '';

      for (let i = 0; i < topUsers.length; i++) {
        const user = topUsers[i];
        const rank = i + 1;

        let username = 'Unknown User';
        try {
          const discordUser = await client.users.fetch(user.userId);
          username = discordUser.username;
        } catch (err) {
          username = `User ${user.userId.slice(0, 8)}`;
        }

        const lineText = `${username} — ${user.balance.toLocaleString()} coins`;

        if (rank === 1) {
          // Top 1 boxed line
          leaderboard +=
            '╭──────────────────────────────╮\n' +
            `│  ① ${lineText}               │\n` +
            '╰──────────────────────────────╯\n';
        } else if (rank === 2) {
          // Top 2 boxed line
          leaderboard +=
            '╭──────────────────────────────╮\n' +
            `│  ② ${lineText}               │\n` +
            '╰──────────────────────────────╯\n';
        } else if (rank === 3) {
          // Top 3 boxed line
          leaderboard +=
            '╭──────────────────────────────╮\n' +
            `│  ③ ${lineText}               │\n` +
            '╰──────────────────────────────╯\n';
        } else {
          // Normal entries
          leaderboard += `**${rank}.** ${lineText}\n`;
        }
      }

      const currentUserData = await User.findOne({ userId: message.author.id });
      let userRankInfo = '';

      if (currentUserData) {
        const allUsers = await User.find({}).sort({ balance: -1 }).lean();
        const userRank = allUsers.findIndex(u => u.userId === message.author.id) + 1;

        if (userRank > 10) {
          userRankInfo =
            `\n\n**Your Rank:** #${userRank} - ${currentUserData.balance.toLocaleString()} coins`;
        }
      }

      const embed = new EmbedBuilder()
        .setTitle('˗ˏˋ 𐙚 💰 𝔅𝔞𝔩𝔞𝔫𝔠𝔢 𝕃𝕖𝕒𝕕𝕖𝕣𝕓𝕠𝕒𝕣𝕕 𐙚 ˎˊ˗')
        .setDescription(
          [
            'Top balance holders in the server',
            '────────────────────────────────────────',
            leaderboard + userRankInfo
          ].join('\n')
        )
        .setColor('#F5E6FF')
        .setFooter({ text: 'Keep earning to climb the ranks! ✧' })
        .setTimestamp();

      await message.channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error in baltop command:', error);
      message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F5E6FF')
            .setTitle('✧˚₊‧ ❌ 𝔈𝔯𝔯𝔬𝔯 ‧₊˚✧')
            .setDescription('❌ An error occurred while fetching the leaderboard.')
            .setFooter({ text: 'System • Internal Error' })
        ]
      });
    }
  },
};
