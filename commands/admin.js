const { EmbedBuilder } = require('discord.js');

const ADMIN_ROLE_ID = '1454818862397653074'; // admin role
const ADMIN_USER_IDS = [
  '1349792214124986419', // add yourself
  // 'ANOTHER_USER_ID',
];

const validRarities = [
  'Prismatic', 'Mythical', 'Legendary', 'Rare', 'Uncommon', 'Common',
];

const SILV_TOKEN_KEY = 'Silv token';

function toProperCase(str) {
  return str.charAt(0).toUpperCase() + str.slice(1).toLowerCase();
}

module.exports = {
  name: 'admin',
  description:
    'Admin commands: give/remove currency, silv tokens, keys, or inventory items; reset user data, spawn keys.',
  async execute({ message, args, getUserData, keydrop, logAdminAction }) {
    if (args.length < 1) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F5E6FF')
            .setTitle('✧˚₊‧ 𝕀𝕟𝕧𝕒𝕝𝕚𝕕 𝕌𝕤𝕒𝕘𝕖 ‧₊˚✧')
            .setDescription(
              [
                '꒰ঌ 𝔄𝔡𝔪𝔦𝔫 𝔓𝔞𝔫𝔢𝔩 ໒꒱',
                '',
                'Valid commands: give, remove, reset, spawn',
              ].join('\n'),
            )
            .setFooter({ text: 'System • Admin Help' }),
        ],
      });
    }

    const subcommand = args[0].toLowerCase();

    // allow if user has admin role OR is in ADMIN_USER_IDS
    const hasAdminRole = message.member.roles.cache.has(ADMIN_ROLE_ID);
    const isAdminUser = ADMIN_USER_IDS.includes(message.author.id);
    const hasAdmin = hasAdminRole || isAdminUser;

    if (!hasAdmin) {
      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F5E6FF')
            .setTitle('˗ˏˋ 𐙚 𝔸𝕔𝕔𝕖𝕤𝕤 𝔻𝕖𝕟𝕚𝕖𝕕 𐙚 ˎˊ˗')
            .setDescription(
              [
                '꒰ঌ 𝔗𝔥𝔦𝔰 𝔭𝔞𝔫𝔢𝔩 𝔦𝔰 𝔯𝔢𝔰𝔢𝔯𝔳𝔢𝔡 𝔣𝔬𝔯 𝔥𝔦𝔤𝔥𝔢𝔯 𝔞𝔫𝔤𝔢𝔩𝔰 ໒꒱',
                '',
                'Only approved users can use admin commands.',
              ].join('\n'),
            )
            .setFooter({ text: 'System • Permission Check' }),
        ],
      });
    }

    // ===== GIVE / REMOVE =====
    if (subcommand === 'give' || subcommand === 'remove') {
      const type = args[1]?.toLowerCase();
      if (!['currency', 'keys', 'silv', 'item'].includes(type)) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#F5E6FF')
              .setTitle('✧˚₊‧ 𝕀𝕟𝕧𝕒𝕝𝕚𝕕 𝕋𝕪𝕡𝕖 ‧₊˚✧')
              .setDescription('Type must be "currency", "silv", "keys", or "item".')
              .setFooter({ text: 'System • Argument Error' }),
          ],
        });
      }

      // ===== REMOVE/GIVE ITEM (CUSTOM INVENTORY ITEM WITH SPACES + AMOUNT) =====
      if (type === 'item') {
        const userMention = message.mentions.users.first();
        if (!userMention) {
          return message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#F5E6FF')
                .setTitle('✧˚₊‧ 𝕀𝕟𝕧𝕒𝕝𝕚𝕕 𝕌𝕤𝕒𝕘𝕖 ‧₊˚✧')
                .setDescription(
                  `Usage: \`.admin ${subcommand} item <item name> <amount> @user\`\n` +
                  'Example: `.admin remove item Silv token 5 @user`',
                )
                .setFooter({ text: 'System • Usage Hint' }),
            ],
          });
        }

        // Extract full args and find amount (last arg before mention)
        const mentionString = `<@${userMention.id}>`;
        const fullArgs = args.slice(2).join(' '); // everything after "remove item"
        const withoutMention = fullArgs.replace(mentionString, '').trim();
        
        // Split to get amount (last word) and item name (rest)
        const parts = withoutMention.split(' ');
        const amountStr = parts[parts.length - 1];
        const amount = parseInt(amountStr);
        
        if (isNaN(amount) || amount <= 0) {
          return message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#F5E6FF')
                .setTitle('✧˚₊‧ 𝕀𝕟𝕧𝕒𝕝𝕚𝕕 𝔸𝕞𝕠𝕦𝕟𝕥 ‧₊˚✧')
                .setDescription(
                  'Please provide a valid amount.\n' +
                  'Example: `.admin remove item Silv token 5 @user`',
                )
                .setFooter({ text: 'System • Usage Hint' }),
            ],
          });
        }

        const itemName = parts.slice(0, -1).join(' ').trim();

        if (!itemName) {
          return message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#F5E6FF')
                .setTitle('✧˚₊‧ 𝕀𝕟𝕧𝕒𝕝𝕚𝕕 𝕌𝕤𝕒𝕘𝕖 ‧₊˚✧')
                .setDescription(
                  'Please provide an item name.\n' +
                  'Example: `.admin remove item Mystery Box 3 @user`',
                )
                .setFooter({ text: 'System • Usage Hint' }),
            ],
          });
        }

        const userId = userMention.id;
        const targetData = await getUserData(userId);
        const User = require('mongoose').model('User');

        targetData.inventory = targetData.inventory || {};

        if (subcommand === 'remove') {
          const currentAmount = targetData.inventory[itemName] || 0;

          if (currentAmount === 0) {
            return message.channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor('#F5E6FF')
                  .setTitle('✧˚₊‧ 𝕀𝕥𝕖𝕞 ℕ𝕠𝕥 𝔽𝕠𝕦𝕟𝕕 ‧₊˚✧')
                  .setDescription(
                    `${userMention.username} does not have **${itemName}** in their inventory.`,
                  )
                  .setFooter({ text: 'System • Inventory Check' }),
              ],
            });
          }

          if (currentAmount < amount) {
            return message.channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor('#F5E6FF')
                  .setTitle('✧˚₊‧ 𝕀𝕟𝕤𝕦𝕗𝕗𝕚𝕔𝕚𝕖𝕟𝕥 𝕀𝕥𝕖𝕞𝕤 ‧₊˚✧')
                  .setDescription(
                    `${userMention.username} only has **${currentAmount}x ${itemName}** but you tried to remove **${amount}x**.`,
                  )
                  .setFooter({ text: 'System • Inventory Check' }),
              ],
            });
          }

          targetData.inventory[itemName] = currentAmount - amount;
          if (targetData.inventory[itemName] === 0) {
            delete targetData.inventory[itemName];
          }

          await User.updateOne(
            { userId },
            { $set: { inventory: targetData.inventory } },
            { upsert: true },
          );

          await logAdminAction(
            message.author.id,
            message.author.username,
            'admin',
            'Remove Item',
            userId,
            userMention.username,
            `Removed ${amount}x ${itemName}`,
          );

          return message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#F5E6FF')
                .setTitle('✧˚₊‧ 𝕀𝕥𝕖𝕞 ℝ𝕖𝕞𝕠𝕧𝕖𝕕 ‧₊˚✧')
                .setDescription(
                  [
                    `Removed **${amount}x ${itemName}** from ${userMention.username}.`,
                    `Remaining: **${targetData.inventory[itemName] || 0}x**`,
                    '',
                    '₊˚ෆ 𝔠𝔢𝔩𝔢𝔰𝔱𝔦𝔞𝔩 𝔩𝔢𝔡𝔤𝔢𝔯 𝔲𝔭𝔡𝔞𝔱𝔢𝔡 ෆ˚₊',
                  ].join('\n'),
                )
                .setFooter({ text: 'System • Admin Action Logged' }),
            ],
          });
        } else {
          // GIVE ITEM
          targetData.inventory[itemName] = (targetData.inventory[itemName] || 0) + amount;

          await User.updateOne(
            { userId },
            { $set: { inventory: targetData.inventory } },
            { upsert: true },
          );

          await logAdminAction(
            message.author.id,
            message.author.username,
            'admin',
            'Give Item',
            userId,
            userMention.username,
            `Gave ${amount}x ${itemName}`,
          );

          return message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#F5E6FF')
                .setTitle('✧˚₊‧ 𝕀𝕥𝕖𝕞 𝔾𝕚𝕧𝕖𝕟 ‧₊˚✧')
                .setDescription(
                  [
                    `Gave **${amount}x ${itemName}** to ${userMention.username}.`,
                    `New total: **${targetData.inventory[itemName]}x**`,
                    '',
                    '˗ˏˋ 𐙚 𝔦𝔫𝔳𝔢𝔫𝔱𝔬𝔯𝔶 𝔥𝔞𝔰 𝔟𝔢𝔢𝔫 𝔟𝔩𝔢𝔰𝔰𝔢𝔡 𐙚 ˎˊ˗',
                  ].join('\n'),
                )
                .setFooter({ text: 'System • Admin Action Logged' }),
            ],
          });
        }
      }

      // ===== EXISTING LOGIC FOR KEYS/SILV/CURRENCY =====
      let rarityKey = null;
      let amountIndex = 2;

      if (type === 'keys') {
        const rarityArg = args[2];
        rarityKey = toProperCase(rarityArg);
        amountIndex++;
        if (!validRarities.includes(rarityKey)) {
          return message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#F5E6FF')
                .setTitle('✧˚₊‧ 𝕀𝕟𝕧𝕒𝕝𝕚𝕕 ℝ𝕒𝕣𝕚𝕥𝕪 ‧₊˚✧')
                .setDescription(`Valid rarities: ${validRarities.join(', ')}`)
                .setFooter({ text: 'System • Rarity List' }),
            ],
          });
        }
      }

      const amount = parseInt(args[amountIndex]);
      const userMention = message.mentions.users.first();

      if (!userMention || isNaN(amount) || amount <= 0) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#F5E6FF')
              .setTitle('✧˚₊‧ 𝕀𝕟𝕧𝕒𝕝𝕚𝕕 𝔸𝕣𝕘𝕦𝕞𝕖𝕟𝕥𝕤 ‧₊˚✧')
              .setDescription(
                `Usage: .admin ${subcommand} ${type}${
                  type === 'keys' ? ' <rarity>' : ''
                } <amount> <@user>`,
              )
              .setFooter({ text: 'System • Usage Hint' }),
          ],
        });
      }

      const userId = userMention.id;
      const targetData = await getUserData(userId);
      const User = require('mongoose').model('User');

      if (subcommand === 'give') {
        if (type === 'keys') {
          targetData.inventory = targetData.inventory || {};
          targetData.inventory[rarityKey] =
            (targetData.inventory[rarityKey] || 0) + amount;
          await User.updateOne(
            { userId },
            { $set: { inventory: targetData.inventory } },
            { upsert: true },
          );

          await logAdminAction(
            message.author.id,
            message.author.username,
            'admin',
            'Give Keys',
            userId,
            userMention.username,
            `${amount}x ${rarityKey}`,
          );

          return message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#F5E6FF')
                .setTitle('✧˚₊‧ 𝕂𝕖𝕪𝕤 𝔾𝕚𝕧𝕖𝕟 ‧₊˚✧')
                .setDescription(
                  [
                    `Gave ${amount} ${rarityKey} key(s) to ${userMention.username}.`,
                    '',
                    '˗ˏˋ 𐙚 𝔦𝔫𝔳𝔢𝔫𝔱𝔬𝔯𝔶 𝔥𝔞𝔰 𝔟𝔢𝔢𝔫 𝔟𝔩𝔢𝔰𝔰𝔢𝔡 𐙚 ˎˊ˗',
                  ].join('\n'),
                )
                .setFooter({ text: 'System • Admin Action Logged' }),
            ],
          });
        } else if (type === 'silv') {
          targetData.inventory = targetData.inventory || {};
          targetData.inventory[SILV_TOKEN_KEY] =
            (targetData.inventory[SILV_TOKEN_KEY] || 0) + amount;

          await User.updateOne(
            { userId },
            { $set: { inventory: targetData.inventory } },
            { upsert: true },
          );

          await logAdminAction(
            message.author.id,
            message.author.username,
            'admin',
            'Give Silv',
            userId,
            userMention.username,
            `${amount} Silv token(s)`,
          );

          return message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#F5E6FF')
                .setTitle('✧˚₊‧ 𝕊𝕚𝕝𝕧 𝕋𝕠𝕜𝕖𝕟𝕤 𝔾𝕚𝕧𝕖𝕟 ‧₊˚✧')
                .setDescription(
                  [
                    `Gave ${amount} **Silv token(s)** to ${userMention.username}.`,
                    '',
                    'ෆ 𝔠𝔢𝔩𝔢𝔰𝔱𝔦𝔞𝔩 𝔰𝔦𝔩𝔳 𝔣𝔩𝔬𝔴𝔰 𝔱𝔬 𝔱𝔥𝔢𝔦𝔯 𝔦𝔫𝔳𝔢𝔫𝔱𝔬𝔯𝔶 ෆ',
                  ].join('\n'),
                )
                .setFooter({ text: 'System • Admin Action Logged' }),
            ],
          });
        } else {
          targetData.balance = (targetData.balance || 0) + amount;
          await User.updateOne(
            { userId },
            { $set: { balance: targetData.balance } },
            { upsert: true },
          );

          await logAdminAction(
            message.author.id,
            message.author.username,
            'admin',
            'Give Currency',
            userId,
            userMention.username,
            `${amount} coins`,
          );

          return message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#F5E6FF')
                .setTitle('✧˚₊‧ ℂ𝕦𝕣𝕣𝕖𝕟𝕔𝕪 𝔸𝕕𝕕𝕖𝕕 ‧₊˚✧')
                .setDescription(
                  [
                    `Added ${amount} coins to ${userMention.username}.`,
                    '',
                    'ෆ 𝔟𝔞𝔩𝔞𝔫𝔠𝔢 𝔟𝔩𝔢𝔰𝔰𝔢𝔡 𝔟𝔶 𝔥𝔦𝔤𝔥𝔢𝔯 𝔟𝔢𝔦𝔫𝔤𝔰 ෆ',
                  ].join('\n'),
                )
                .setFooter({ text: 'System • Admin Action Logged' }),
            ],
          });
        }
      } else {
        // REMOVE
        if (type === 'keys') {
          targetData.inventory = targetData.inventory || {};
          if (
            !targetData.inventory[rarityKey] ||
            targetData.inventory[rarityKey] < amount
          ) {
            return message.channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor('#F5E6FF')
                  .setTitle('✧˚₊‧ 𝕀𝕟𝕤𝕦𝕗𝕗𝕚𝕔𝕚𝕖𝕟𝕥 𝕂𝕖𝕪𝕤 ‧₊˚✧')
                  .setDescription(
                    `${userMention.username} does not have enough ${rarityKey} key(s).`,
                  )
                  .setFooter({ text: 'System • Inventory Check' }),
              ],
            });
          }
          targetData.inventory[rarityKey] -= amount;
          if (targetData.inventory[rarityKey] === 0) {
            delete targetData.inventory[rarityKey];
          }
          await User.updateOne(
            { userId },
            { $set: { inventory: targetData.inventory } },
            { upsert: true },
          );

          await logAdminAction(
            message.author.id,
            message.author.username,
            'admin',
            'Remove Keys',
            userId,
            userMention.username,
            `${amount}x ${rarityKey}`,
          );

          return message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#F5E6FF')
                .setTitle('✧˚₊‧ 𝕂𝕖𝕪𝕤 ℝ𝕖𝕞𝕠𝕧𝕖𝕕 ‧₊˚✧')
                .setDescription(
                  [
                    `Removed ${amount} ${rarityKey} key(s) from ${userMention.username}.`,
                    '',
                    '⋆｡˚ ✩ 𝔠𝔢𝔩𝔢𝔰𝔱𝔦𝔞𝔩 𝔯𝔢𝔠𝔬𝔯𝔡𝔰 𝔞𝔡𝔧𝔲𝔰𝔱𝔢𝔡 ✩ ˚｡⋆',
                  ].join('\n'),
                )
                .setFooter({ text: 'System • Admin Action Logged' }),
            ],
          });
        } else if (type === 'silv') {
          targetData.inventory = targetData.inventory || {};
          const currentSilv = targetData.inventory[SILV_TOKEN_KEY] || 0;
          if (currentSilv < amount) {
            return message.channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor('#F5E6FF')
                  .setTitle('✧˚₊‧ 𝕀𝕟𝕤𝕦𝕗𝕗𝕚𝕔𝕚𝕖𝕟𝕥 𝕊𝕚𝕝𝕧 ‧₊˚✧')
                  .setDescription(
                    `${userMention.username} does not have enough Silv tokens.`,
                  )
                  .setFooter({ text: 'System • Inventory Check' }),
              ],
            });
          }

          targetData.inventory[SILV_TOKEN_KEY] = currentSilv - amount;
          if (targetData.inventory[SILV_TOKEN_KEY] === 0) {
            delete targetData.inventory[SILV_TOKEN_KEY];
          }

          await User.updateOne(
            { userId },
            { $set: { inventory: targetData.inventory } },
            { upsert: true },
          );

          await logAdminAction(
            message.author.id,
            message.author.username,
            'admin',
            'Remove Silv',
            userId,
            userMention.username,
            `${amount} Silv token(s)`,
          );

          return message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#F5E6FF')
                .setTitle('✧˚₊‧ 𝕊𝕚𝕝𝕧 𝕋𝕠𝕜𝕖𝕟𝕤 ℝ𝕖𝕞𝕠𝕧𝕖𝕕 ‧₊˚✧')
                .setDescription(
                  [
                    `Removed ${amount} **Silv token(s)** from ${userMention.username}.`,
                    '',
                    '₊˚ෆ 𝔠𝔢𝔩𝔢𝔰𝔱𝔦𝔞𝔩 𝔩𝔢𝔡𝔤𝔢𝔯 𝔲𝔭𝔡𝔞𝔱𝔢𝔡 ෆ˚₊',
                  ].join('\n'),
                )
                .setFooter({ text: 'System • Admin Action Logged' }),
            ],
          });
        } else {
          if (targetData.balance < amount) {
            return message.channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor('#F5E6FF')
                  .setTitle('✧˚₊‧ 𝕀𝕟𝕤𝕦𝕗𝕗𝕚𝕔𝕚𝕖𝕟𝕥 ℂ𝕦𝕣𝕣𝕖𝕟𝕔𝕪 ‧₊˚✧')
                  .setDescription(
                    `${userMention.username} does not have enough coins.`,
                  )
                  .setFooter({ text: 'System • Balance Check' }),
              ],
            });
          }
          targetData.balance -= amount;
          await User.updateOne(
            { userId },
            { $set: { balance: targetData.balance } },
            { upsert: true },
          );

          await logAdminAction(
            message.author.id,
            message.author.username,
            'admin',
            'Remove Currency',
            userId,
            userMention.username,
            `${amount} coins`,
          );

          return message.channel.send({
            embeds: [
              new EmbedBuilder()
                .setColor('#F5E6FF')
                .setTitle('✧˚₊‧ ℂ𝕦𝕣𝕣𝕖𝕟𝕔𝕪 ℝ𝕖𝕞𝕠𝕧𝕖𝕕 ‧₊˚✧')
                .setDescription(
                  [
                    `Removed ${amount} coins from ${userMention.username}.`,
                    '',
                    '₊˚ෆ 𝔠𝔢𝔩𝔢𝔰𝔱𝔦𝔞𝔩 𝔩𝔢𝔡𝔤𝔢𝔯 𝔲𝔭𝔡𝔞𝔱𝔢𝔡 ෆ˚₊',
                  ].join('\n'),
                )
                .setFooter({ text: 'System • Admin Action Logged' }),
            ],
          });
        }
      }
    }

    // ===== RESET =====
    if (subcommand === 'reset') {
      const userMention = message.mentions.users.first();
      if (!userMention) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#F5E6FF')
              .setTitle('✧˚₊‧ 𝕀𝕟𝕧𝕒𝕝𝕚𝕕 𝕌𝕤𝕒𝕘𝕖 ‧₊˚✧')
              .setDescription('Usage: `.admin reset <@user>`')
              .setFooter({ text: 'System • Usage Hint' }),
          ],
        });
      }
      const userId = userMention.id;
      const targetData = await getUserData(userId);
      if (
        !targetData ||
        (targetData.balance === 0 &&
          Object.keys(targetData.inventory || {}).length === 0)
      ) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#F5E6FF')
              .setTitle('✧˚₊‧ 𝕌𝕤𝕖𝕣 ℕ𝕠𝕥 𝔽𝕠𝕦𝕟𝕕 ‧₊˚✧')
              .setDescription(
                `No significant data found for user ${userMention.username}.`,
              )
              .setFooter({ text: 'System • Data Check' }),
          ],
        });
      }

      const User = require('mongoose').model('User');
      await User.updateOne(
        { userId },
        { $set: { balance: 0, inventory: {} } },
        { upsert: true },
      );

      await logAdminAction(
        message.author.id,
        message.author.username,
        'admin',
        'Reset User',
        userId,
        userMention.username,
        'Balance and inventory reset',
      );

      return message.channel.send({
        embeds: [
          new EmbedBuilder()
            .setColor('#F5E6FF')
            .setTitle('✧˚₊‧ 𝕌𝕤𝕖𝕣 𝔻𝕒𝕥𝕒 ℝ𝕖𝕤𝕖𝕥 ‧₊˚✧')
            .setDescription(
              [
                `Reset user data for ${userMention.username}.`,
                '',
                '꒰ঌ 𝔱𝔥𝔢𝔦𝔯 𝔰𝔩𝔞𝔱𝔢 𝔥𝔞𝔰 𝔟𝔢𝔢𝔫 𝔴𝔦𝔭𝔢𝔡 𝔠𝔩𝔢𝔞𝔫 ໒꒱',
              ].join('\n'),
            )
            .setFooter({ text: 'System • Admin Action Logged' }),
        ],
      });
    }

    // ===== SPAWN KEY =====
    if (subcommand === 'spawn') {
      const rarityArg = args[1];
      const channelId = args[2];

      if (!rarityArg || !channelId) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#F5E6FF')
              .setTitle('✧˚₊‧ 𝕀𝕟𝕧𝕒𝕝𝕚𝕕 𝕌𝕤𝕒𝕘𝕖 ‧₊˚✧')
              .setDescription(
                'Usage: `.admin spawn <rarity> <channel_id>`\n' +
                  'Example: `.admin spawn Legendary 1405349401945178152`\n\n' +
                  'Valid rarities: ' +
                  validRarities.join(', '),
              )
              .setFooter({ text: 'System • Usage Hint' }),
          ],
        });
      }

      const rarityKey = toProperCase(rarityArg);

      if (!validRarities.includes(rarityKey)) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#F5E6FF')
              .setTitle('✧˚₊‧ 𝕀𝕟𝕧𝕒𝕝𝕚𝕕 ℝ𝕒𝕣𝕚𝕥𝕪 ‧₊˚✧')
              .setDescription(`Valid rarities: ${validRarities.join(', ')}`)
              .setFooter({ text: 'System • Rarity List' }),
          ],
        });
      }

      const channel = message.client.channels.cache.get(channelId);
      if (!channel) {
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#F5E6FF')
              .setTitle('✧˚₊‧ ℂ𝕙𝕒𝕟𝕟𝕖𝕝 ℕ𝕠𝕥 𝔽𝕠𝕦𝕟𝕕 ‧₊˚✧')
              .setDescription(
                `Channel with ID ${channelId} not found. Make sure the ID is correct.`,
              )
              .setFooter({ text: 'System • Channel Check' }),
          ],
        });
      }

      try {
        const result = await keydrop.spawnKey(
          rarityKey,
          channelId,
          message.client,
        );

        if (result.success) {
          await logAdminAction(
            message.author.id,
            message.author.username,
            'admin',
            'Spawn Key',
            null,
            null,
            `${rarityKey} in channel ${channelId}`,
          );
        }

        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#F5E6FF')
              .setTitle(
                result.success
                  ? '✧˚₊‧ 🔑 𝕂𝕖𝕪 𝕊𝕡𝕒𝕨𝕟𝕖𝕕 ‧₊˚✧'
                  : '✧˚₊‧ ❌ 𝔈𝔯𝔯𝔬𝔯 ‧₊˚✧',
              )
              .setDescription(
                result.success
                  ? [
                      '˗ˏˋ 𐙚 𝔞 𝔠𝔢𝔩𝔢𝔰𝔱𝔦𝔞𝔩 𝔨𝔢𝔶 𝔥𝔞𝔰 𝔡𝔢𝔰𝔠𝔢𝔫𝔡𝔢𝔡 𐙚 ˎˊ˗',
                      '',
                      result.message,
                    ].join('\n')
                  : result.message,
              )
              .addFields(
                result.success
                  ? {
                      name: '⋆ ˚｡ 𝕂𝕖𝕪𝕕𝕣𝕠𝕡 𝔻𝕖𝕥𝕒𝕚𝕝𝕤 ｡˚ ⋆',
                      value: `• Rarity: **${rarityKey}**\n• Channel: <#${channelId}>`,
                      inline: false,
                    }
                  : {
                      name: '⋆ ˚｡ 𝕀𝕟𝕗𝕠 ｡˚ ⋆',
                      value: 'Check your parameters and try again.',
                      inline: false,
                    },
              )
              .setFooter({ text: 'System • Keydrop Control' })
              .setTimestamp(),
          ],
        });
      } catch (error) {
        console.error('Error spawning key:', error);
        return message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#F5E6FF')
              .setTitle('✧˚₊‧ ❌ 𝔈𝔯𝔯𝔬𝔯 ‧₊˚✧')
              .setDescription(
                'Failed to spawn key. Check console for details.',
              )
              .setFooter({ text: 'System • Internal Error' }),
          ],
        });
      }
    }

    // ===== FALLBACK =====
    return message.channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#F5E6FF')
          .setTitle('✧˚₊‧ 𝕀𝕟𝕧𝕒𝕝𝕚𝕕 ℂ𝕠𝕞𝕞𝕒𝕟𝕕 ‧₊˚✧')
          .setDescription('Valid commands: give, remove, reset, spawn')
          .setFooter({ text: 'System • Admin Help' }),
      ],
    });
  },
};
