// commands/weekly.js — this week's boards: the 10 most active players (rounds of 1,000+ coins) and the 10 most active
// chatters, with what each place wins. Same card as the live board (utils/weeklyLive.js), incl. 🔔 Notify me.
module.exports = {
  name: 'weekly',
  aliases: ['wlb', 'weeklylb', 'weekboard'],
  adminOnly: false,
  description: "This week's boards — top 10 players and top 10 chatters win SILV and coins.",

  async execute({ message }) {
    const { payload } = await require('../utils/weeklyLive').render(message.guild?.name);
    return message.channel.send(payload);
  },
};
