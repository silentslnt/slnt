const { EmbedBuilder } = require('discord.js');

// Track active trades: key = userId, value = tradeState
const activeTrades = new Map();

// Helper function to find item in inventory (case-insensitive)
function findInventoryItem(inventory, itemName) {
  if (!inventory) return null;
  const lowerName = itemName.toLowerCase().trim();
  for (const key of Object.keys(inventory)) {
    if (key.toLowerCase().trim() === lowerName) {
      return key; // Return actual key from inventory
    }
  }
  return null;
}

module.exports = {
  name: 'trade',
  description: 'Trade items and currency with other users',
  async execute({ message, args, userData, saveUserData, getUserData, client }) {
    const sub = (args[0] || '').toLowerCase();
    const userId = message.author.id;

    // START TRADE - check if first arg is a mention OR if sub is 'start'
    const targetUser = message.mentions.users.first();

    if (targetUser || sub === 'start') {
      if (!targetUser) {
        return message.channel.send('Usage: `.trade @user` to start a trade');
      }

      if (targetUser.bot) {
        return message.channel.send('❌ You cannot trade with bots!');
      }

      if (targetUser.id === userId) {
        return message.channel.send('❌ You cannot trade with yourself!');
      }

      if (activeTrades.has(userId)) {
        return message.channel.send('❌ You already have an active trade! Finish or cancel it first.');
      }

      if (activeTrades.has(targetUser.id)) {
        return message.channel.send('❌ That user already has an active trade!');
      }

      // Create trade session
      activeTrades.set(userId, {
        initiator: userId,
        partner: targetUser.id,
        channelId: message.channel.id,
        initiatorOffer: { currency: 0, items: {} },
        partnerOffer: { currency: 0, items: {} },
        initiatorConfirmed: false,
        partnerConfirmed: false,
        status: 'open',
      });

      activeTrades.set(targetUser.id, activeTrades.get(userId));

      const headerBlock =
        '╭──────────────────────────────╮\n' +
        '│        Trade Started        │\n' +
        '╰──────────────────────────────╯';

      const embed = new EmbedBuilder()
        .setTitle('˗ˏˋ 𐙚 🤝 Trade Session 𐙚 ˎˊ˗')
        .setDescription(
          [
            headerBlock,
            '',
            `${message.author} wants to trade with ${targetUser}.`,
            '',
            '**Commands:**',
            '`.trade offer currency <amount>` - Offer coins',
            '`.trade offer item <item name> <amount>` - Offer inventory items',
            '`.trade remove currency <amount>` - Remove coins from offer',
            '`.trade remove item <item name> <amount>` - Remove items from offer',
            '`.trade view` - View current offers',
            '`.trade confirm` - Confirm your side',
            '`.trade cancel` - Cancel trade',
          ].join('\n')
        )
        .setColor('#F5E6FF')
        .setTimestamp()
        .setFooter({ text: 'System • Trading Desk' });

      return message.channel.send({ embeds: [embed] });
    }

    // Check if user has active trade
    const trade = activeTrades.get(userId);
    if (!trade) {
      return message.channel.send("❌ You don't have an active trade. Use `.trade @user` to start one.");
    }

    // OFFER CURRENCY OR ITEMS
    if (sub === 'offer') {
      const offerType = args[1]?.toLowerCase();

      if (offerType === 'currency') {
        const amount = parseInt(args[2]);

        if (isNaN(amount) || amount <= 0) {
          return message.channel.send('❌ Please specify a valid positive amount.');
        }

        if (userData.balance < amount) {
          return message.channel.send(`❌ You don't have ${amount} coins! Your balance: ${userData.balance}`);
        }

        const isInitiator = userId === trade.initiator;
        const offer = isInitiator ? trade.initiatorOffer : trade.partnerOffer;

        offer.currency += amount;

        // Reset confirmations
        trade.initiatorConfirmed = false;
        trade.partnerConfirmed = false;

        return message.channel.send(
          `✅ Added **${amount}** coins to your offer. Total: **${offer.currency}** coins`
        );
      }

      if (offerType === 'item') {
        // Parse item name (collect all words until we hit a number)
        let itemNameParts = [];
        let amount = null;

        for (let i = 2; i < args.length; i++) {
          const parsed = parseInt(args[i]);
          if (!isNaN(parsed) && parsed > 0) {
            amount = parsed;
            break;
          }
          itemNameParts.push(args[i]);
        }

        const itemNameInput = itemNameParts.join(' ').trim();

        if (!itemNameInput || !amount || amount <= 0) {
          return message.channel.send('Usage: `.trade offer item <item name> <amount>`');
        }

        // Find actual item name in inventory (case-insensitive)
        const actualItemName = findInventoryItem(userData.inventory, itemNameInput);

        if (!actualItemName) {
          return message.channel.send(
            `❌ You don't have any item called **${itemNameInput}** in your inventory.`
          );
        }

        const userItems = userData.inventory[actualItemName] || 0;
        const isInitiator = userId === trade.initiator;
        const offer = isInitiator ? trade.initiatorOffer : trade.partnerOffer;
        const alreadyOffered = offer.items[actualItemName] || 0;

        if (userItems < alreadyOffered + amount) {
          return message.channel.send(
            `❌ You don't have enough **${actualItemName}**. You have: ${userItems}, already offered: ${alreadyOffered}.`
          );
        }

        offer.items[actualItemName] = alreadyOffered + amount;

        // Reset confirmations
        trade.initiatorConfirmed = false;
        trade.partnerConfirmed = false;

        return message.channel.send(
          `✅ Added **${amount} ${actualItemName}** to your offer. Total: **${offer.items[actualItemName]}**`
        );
      }

      return message.channel.send(
        'Usage: `.trade offer currency <amount>` or `.trade offer item <item name> <amount>`'
      );
    }

    // REMOVE FROM OFFER
    if (sub === 'remove') {
      const removeType = args[1]?.toLowerCase();

      if (removeType === 'currency') {
        const amount = parseInt(args[2]);

        if (isNaN(amount) || amount <= 0) {
          return message.channel.send('❌ Please specify a valid positive amount.');
        }

        const isInitiator = userId === trade.initiator;
        const offer = isInitiator ? trade.initiatorOffer : trade.partnerOffer;

        if (offer.currency < amount) {
          return message.channel.send(`❌ You only offered ${offer.currency} coins.`);
        }

        offer.currency -= amount;

        // Reset confirmations
        trade.initiatorConfirmed = false;
        trade.partnerConfirmed = false;

        return message.channel.send(
          `✅ Removed **${amount}** coins from your offer. Remaining: **${offer.currency}** coins`
        );
      }

      if (removeType === 'item') {
        // Parse item name (collect all words until we hit a number)
        let itemNameParts = [];
        let amount = null;

        for (let i = 2; i < args.length; i++) {
          const parsed = parseInt(args[i]);
          if (!isNaN(parsed) && parsed > 0) {
            amount = parsed;
            break;
          }
          itemNameParts.push(args[i]);
        }

        const itemNameInput = itemNameParts.join(' ').trim();

        if (!itemNameInput || !amount || amount <= 0) {
          return message.channel.send('Usage: `.trade remove item <item name> <amount>`');
        }

        const isInitiator = userId === trade.initiator;
        const offer = isInitiator ? trade.initiatorOffer : trade.partnerOffer;

        // Find actual item name in offer (case-insensitive)
        const lowerInput = itemNameInput.toLowerCase();
        let actualItemName = null;
        for (const key of Object.keys(offer.items)) {
          if (key.toLowerCase() === lowerInput) {
            actualItemName = key;
            break;
          }
        }

        if (!actualItemName) {
          return message.channel.send(`❌ You haven't offered any **${itemNameInput}**.`);
        }

        const offered = offer.items[actualItemName] || 0;

        if (offered < amount) {
          return message.channel.send(`❌ You only offered ${offered} ${actualItemName}.`);
        }

        offer.items[actualItemName] = offered - amount;
        if (offer.items[actualItemName] === 0) {
          delete offer.items[actualItemName];
        }

        // Reset confirmations
        trade.initiatorConfirmed = false;
        trade.partnerConfirmed = false;

        return message.channel.send(
          `✅ Removed **${amount} ${actualItemName}** from your offer.`
        );
      }

      return message.channel.send(
        'Usage: `.trade remove currency <amount>` or `.trade remove item <item name> <amount>`'
      );
    }

    // VIEW TRADE
    if (sub === 'view') {
      const initiator = await client.users.fetch(trade.initiator);
      const partner = await client.users.fetch(trade.partner);

      const initiatorItems =
        Object.entries(trade.initiatorOffer.items)
          .map(([k, v]) => `${v}x ${k}`)
          .join(', ') || 'None';

      const partnerItems =
        Object.entries(trade.partnerOffer.items)
          .map(([k, v]) => `${v}x ${k}`)
          .join(', ') || 'None';

      const offerBlock =
        '╭──────────────────────────────╮\n' +
        '│      Current Trade View      │\n' +
        '╰──────────────────────────────╯';

      const embed = new EmbedBuilder()
        .setTitle('˗ˏˋ 𐙚 🤝 Trade Overview 𐙚 ˎˊ˗')
        .setDescription(
          [
            offerBlock,
            '',
            'Both players must confirm with `.trade confirm` to finish the trade.',
          ].join('\n')
        )
        .addFields(
          {
            name: `${initiator.username}'s Offer ${trade.initiatorConfirmed ? '✅' : '❌'}`,
            value: `**Coins:** ${trade.initiatorOffer.currency}\n**Items:** ${initiatorItems}`,
            inline: false,
          },
          {
            name: `${partner.username}'s Offer ${trade.partnerConfirmed ? '✅' : '❌'}`,
            value: `**Coins:** ${trade.partnerOffer.currency}\n**Items:** ${partnerItems}`,
            inline: false,
          }
        )
        .setColor('#F5E6FF')
        .setTimestamp()
        .setFooter({ text: 'System • Trading Desk' });

      return message.channel.send({ embeds: [embed] });
    }

    // CONFIRM TRADE
    if (sub === 'confirm') {
      const isInitiator = userId === trade.initiator;

      if (isInitiator) {
        trade.initiatorConfirmed = true;
      } else {
        trade.partnerConfirmed = true;
      }

      if (!trade.initiatorConfirmed || !trade.partnerConfirmed) {
        return message.channel.send(
          `✅ ${message.author.username} confirmed. Waiting for the other person to confirm.`
        );
      }

      // Both confirmed - execute trade
      const initiatorData = await getUserData(trade.initiator);
      const partnerData = await getUserData(trade.partner);

      // Validate both users still have what they offered
      if (initiatorData.balance < trade.initiatorOffer.currency) {
        activeTrades.delete(trade.initiator);
        activeTrades.delete(trade.partner);
        return message.channel.send(
          "❌ Trade failed. Initiator doesn't have enough coins anymore."
        );
      }

      if (partnerData.balance < trade.partnerOffer.currency) {
        activeTrades.delete(trade.initiator);
        activeTrades.delete(trade.partner);
        return message.channel.send(
          "❌ Trade failed. Partner doesn't have enough coins anymore."
        );
      }

      // Validate items
      for (const [itemName, amount] of Object.entries(trade.initiatorOffer.items)) {
        if ((initiatorData.inventory?.[itemName] || 0) < amount) {
          activeTrades.delete(trade.initiator);
          activeTrades.delete(trade.partner);
          return message.channel.send(
            `❌ Trade failed. Initiator doesn't have enough ${itemName}.`
          );
        }
      }

      for (const [itemName, amount] of Object.entries(trade.partnerOffer.items)) {
        if ((partnerData.inventory?.[itemName] || 0) < amount) {
          activeTrades.delete(trade.initiator);
          activeTrades.delete(trade.partner);
          return message.channel.send(
            `❌ Trade failed. Partner doesn't have enough ${itemName}.`
          );
        }
      }

      // Execute trade - update inventories and balances
      initiatorData.inventory = initiatorData.inventory || {};
      partnerData.inventory = partnerData.inventory || {};

      // Transfer currency
      initiatorData.balance -= trade.initiatorOffer.currency;
      initiatorData.balance += trade.partnerOffer.currency;

      partnerData.balance -= trade.partnerOffer.currency;
      partnerData.balance += trade.initiatorOffer.currency;

      // Transfer items from initiator to partner
      for (const [itemName, amount] of Object.entries(trade.initiatorOffer.items)) {
        initiatorData.inventory[itemName] =
          (initiatorData.inventory[itemName] || 0) - amount;
        partnerData.inventory[itemName] =
          (partnerData.inventory[itemName] || 0) + amount;
      }

      // Transfer items from partner to initiator
      for (const [itemName, amount] of Object.entries(trade.partnerOffer.items)) {
        partnerData.inventory[itemName] =
          (partnerData.inventory[itemName] || 0) - amount;
        initiatorData.inventory[itemName] =
          (initiatorData.inventory[itemName] || 0) + amount;
      }

      // Clean up zero entries
      for (const inv of [initiatorData.inventory, partnerData.inventory]) {
        for (const key in inv) {
          if (inv[key] === 0) delete inv[key];
        }
      }

      // Save to database - use appropriate method based on who is calling
      if (userId === trade.initiator) {
        await saveUserData({
          balance: initiatorData.balance,
          inventory: initiatorData.inventory,
        });
        const User = require('mongoose').model('User');
        await User.updateOne(
          { userId: trade.partner },
          { $set: { balance: partnerData.balance, inventory: partnerData.inventory } }
        );
      } else {
        await saveUserData({
          balance: partnerData.balance,
          inventory: partnerData.inventory,
        });
        const User = require('mongoose').model('User');
        await User.updateOne(
          { userId: trade.initiator },
          { $set: { balance: initiatorData.balance, inventory: initiatorData.inventory } }
        );
      }

      const initiator = await client.users.fetch(trade.initiator);
      const partner = await client.users.fetch(trade.partner);

      const doneBlock =
        '╭──────────────────────────────╮\n' +
        '│        Trade Complete        │\n' +
        '╰──────────────────────────────╯';

      const embed = new EmbedBuilder()
        .setTitle('˗ˏˋ 𐙚 ✅ Trade Completed 𐙚 ˎˊ˗')
        .setDescription(
          [
            doneBlock,
            '',
            `Trade between ${initiator} and ${partner} finished successfully.`,
          ].join('\n')
        )
        .setColor('#C1FFD7')
        .setTimestamp()
        .setFooter({ text: 'System • Trading Desk' });

      message.channel.send({ embeds: [embed] });

      activeTrades.delete(trade.initiator);
      activeTrades.delete(trade.partner);
      return;
    }

    // CANCEL TRADE
    if (sub === 'cancel') {
      const initiator = await client.users.fetch(trade.initiator);
      const partner = await client.users.fetch(trade.partner);

      activeTrades.delete(trade.initiator);
      activeTrades.delete(trade.partner);

      const cancelBlock =
        '╭──────────────────────────────╮\n' +
        '│         Trade Cancelled      │\n' +
        '╰──────────────────────────────╯';

      const embed = new EmbedBuilder()
        .setTitle('˗ˏˋ 𐙚 ❌ Trade Cancelled 𐙚 ˎˊ˗')
        .setDescription(
          [
            cancelBlock,
            '',
            `Trade between ${initiator} and ${partner} was cancelled.`,
          ].join('\n')
        )
        .setColor('#FFB3C6')
        .setTimestamp()
        .setFooter({ text: 'System • Trading Desk' });

      return message.channel.send({ embeds: [embed] });
    }

    // Default help
    return message.channel.send(
      '**Trade Commands:**\n' +
        '`.trade @user` - Start trade\n' +
        '`.trade offer currency <amount>` - Offer coins\n' +
        '`.trade offer item <item name> <amount>` - Offer any inventory item\n' +
        '`.trade remove currency <amount>` - Remove coins\n' +
        '`.trade remove item <item name> <amount>` - Remove items\n' +
        '`.trade view` - View offers\n' +
        '`.trade confirm` - Confirm trade\n' +
        '`.trade cancel` - Cancel trade'
    );
  },
};
