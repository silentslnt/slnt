const { EmbedBuilder } = require('discord.js');

module.exports = {
  name: 'setchannel',
  description: 'Set the keydrop channel (admin only)',
  async execute({ message, args, keydrop }) {
    return keydrop.setKeydropChannel(message, args);
  },
};
