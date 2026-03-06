const { EmbedBuilder } = require('discord.js');

const ADMIN_ROLE_ID = '1454818862397653074';
const ADMIN_USER_IDS = [
  '1349792214124986419',
];

function canToggleKeydrops(member) {
  if (!member) return false;
  const hasRole = member.roles.cache.has(ADMIN_ROLE_ID);
  const isWhitelisted = ADMIN_USER_IDS.includes(member.user.id);
  return hasRole || isWhitelisted;
}

module.exports = {
  name: 'tkd',
  description: 'Toggle automatic keydrops on/off (admin only)',
  async execute({ message, args, keydrop }) {
    const member = message.member;

    // Check if user is not admin - silent block
    if (!canToggleKeydrops(member)) {
      return;
    }

    const action = args[0]?.toLowerCase();

    if (!action || !['on', 'off', 'status'].includes(action)) {
      const currentStatus = keydrop.areKeydropsEnabled();
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F5E6FF')
            .setTitle('✧˚₊‧ 𝕀𝕟𝕧𝕒𝕝𝕚𝕕 𝕌𝕤𝕒𝕘𝕖 ‧₊˚✧')
            .setDescription(
              [
                'Usage: `.togglekeydrops <on|off|status>`',
                '',
                'Examples:',
                '• `.togglekeydrops off` - Disable automatic keydrops',
                '• `.togglekeydrops on` - Enable automatic keydrops',
                '• `.togglekeydrops status` - Check current status',
                '',
                `**Current status:** ${currentStatus ? '✅ Enabled' : '❌ Disabled'}`,
              ].join('\n')
            )
            .setFooter({ text: 'System • Usage Hint' }),
        ],
      });
    }

    if (action === 'status') {
      const currentStatus = keydrop.areKeydropsEnabled();
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F5E6FF')
            .setTitle('✧˚₊‧ 🔑 𝕂𝕖𝕪𝕕𝕣𝕠𝕡 𝕊𝕪𝕤𝕥𝕖𝕞 𝕊𝕥𝕒𝕥𝕦𝕤 ‧₊˚✧')
            .setDescription(
              [
                `**Keydrops are currently:** ${currentStatus ? '✅ **ENABLED**' : '❌ **DISABLED**'}`,
                '',
                currentStatus
                  ? 'Keys will automatically drop in the keydrop channel.'
                  : 'Automatic key drops are paused.',
              ].join('\n')
            )
            .setFooter({ text: 'System • Keydrop Status' })
            .setTimestamp(),
        ],
      });
    }

    if (action === 'off') {
      if (!keydrop.areKeydropsEnabled()) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#F5E6FF')
              .setTitle('✧˚₊‧ ⚠️ 𝔸𝕝𝕣𝕖𝕒𝕕𝕪 𝔻𝕚𝕤𝕒𝕓𝕝𝕖𝕕 ‧₊˚✧')
              .setDescription('Keydrops are already disabled.')
              .setFooter({ text: 'System • Status Check' }),
          ],
        });
      }

      keydrop.setKeydropsEnabled(false);

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F5E6FF')
            .setTitle('✧˚₊‧ 🔒 𝕂𝕖𝕪𝕕𝕣𝕠𝕡𝕤 𝔻𝕚𝕤𝕒𝕓𝕝𝕖𝕕 ‧₊˚✧')
            .setDescription(
              [
                '꒰ঌ 𝔱𝔥𝔢 𝔠𝔢𝔩𝔢𝔰𝔱𝔦𝔞𝔩 𝔨𝔢𝔶𝔰 𝔥𝔞𝔳𝔢 𝔰𝔱𝔬𝔭𝔭𝔢𝔡 𝔣𝔞𝔩𝔩𝔦𝔫𝔤 ໒꒱',
                '',
                'Automatic keydrops are now **disabled**.',
                'Keys will not drop automatically.',
                '',
                '**Note:** Admin-spawned keys still work.',
              ].join('\n')
            )
            .setFooter({ text: 'System • Keydrops Disabled' })
            .setTimestamp(),
        ],
      });
    }

    if (action === 'on') {
      if (keydrop.areKeydropsEnabled()) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#F5E6FF')
              .setTitle('✧˚₊‧ ⚠️ 𝔸𝕝𝕣𝕖𝕒𝕕𝕪 𝔼𝕟𝕒𝕓𝕝𝕖𝕕 ‧₊˚✧')
              .setDescription('Keydrops are already enabled.')
              .setFooter({ text: 'System • Status Check' }),
          ],
        });
      }

      keydrop.setKeydropsEnabled(true);

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F5E6FF')
            .setTitle('✧˚₊‧ ✅ 𝕂𝕖𝕪𝕕𝕣𝕠𝕡𝕤 𝔼𝕟𝕒𝕓𝕝𝕖𝕕 ‧₊˚✧')
            .setDescription(
              [
                '꒰ঌ 𝔱𝔥𝔢 𝔠𝔢𝔩𝔢𝔰𝔱𝔦𝔞𝔩 𝔨𝔢𝔶𝔰 𝔴𝔦𝔩𝔩 𝔣𝔞𝔩𝔩 𝔞𝔤𝔞𝔦𝔫 ໒꒱',
                '',
                'Automatic keydrops are now **enabled**.',
                'Keys will start dropping in the keydrop channel.',
              ].join('\n')
            )
            .setFooter({ text: 'System • Keydrops Enabled' })
            .setTimestamp(),
        ],
      });
    }
  },

  canToggleKeydrops,
};
