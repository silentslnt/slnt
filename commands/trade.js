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
  async execute({ message, args, userData, saveUserData, getUserData, client, logAdminAction }) {
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
        status: 'open', // open -> completing -> deleted from map on success/cancel
      });

      activeTrades.set(targetUser.id, activeTrades.get(userId));

      const embed = new EmbedBuilder()
        .setTitle('TRADE SESSION')
        .setDescription(
          `> ${message.author} wants to trade with ${targetUser}.\n\n` +
          '__**Commands**__\n' +
          '> `.trade offer currency <amount>` — offer coins\n' +
          '> `.trade offer item <item name> <amount>` — offer inventory items\n' +
          '> `.trade remove currency <amount>` — remove coins from offer\n' +
          '> `.trade remove item <item name> <amount>` — remove items from offer\n' +
          '> `.trade view` — view current offers\n' +
          '> `.trade confirm` — confirm your side\n' +
          '> `.trade cancel` — cancel trade'
        )
        .setColor(0x000000)
        .setFooter({ text: message.guild?.name || 'Shiro' });

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

      const embed = new EmbedBuilder()
        .setTitle('TRADE OVERVIEW')
        .setDescription('-# Both players must confirm with `.trade confirm` to finish the trade.')
        .addFields(
          {
            name: `${initiator.username}'s Offer ${trade.initiatorConfirmed ? '✅' : '❌'}`,
            value: `Coins: **${trade.initiatorOffer.currency}**\nItems: ${initiatorItems}`,
            inline: false,
          },
          {
            name: `${partner.username}'s Offer ${trade.partnerConfirmed ? '✅' : '❌'}`,
            value: `Coins: **${trade.partnerOffer.currency}**\nItems: ${partnerItems}`,
            inline: false,
          }
        )
        .setColor(0x000000)
        .setFooter({ text: message.guild?.name || 'Shiro' });

      return message.channel.send({ embeds: [embed] });
    }

    // CONFIRM TRADE
    if (sub === 'confirm') {
      // Already being fulfilled (or done) — block re-entry. Without this, a
      // player spamming .trade confirm while the first confirm's async
      // fulfillment (several awaits below) is still in flight could re-enter
      // this branch a second time and double-execute the transfer.
      if (trade.status !== 'open') {
        return message.channel.send('This trade is already being processed.');
      }

      const isInitiator = userId === trade.initiator;

      if (isInitiator) {
        trade.initiatorConfirmed = true;
      } else {
        trade.partnerConfirmed = true;
      }

      if (!trade.initiatorConfirmed || !trade.partnerConfirmed) {
        return message.channel.send(
          `${message.author.username} confirmed. Waiting for the other person to confirm.`
        );
      }

      // Both confirmed — lock the trade synchronously (no await above this
      // line since the flags were set) before doing any async work.
      trade.status = 'completing';

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

      // 'Complete a trade' mission/achievement was permanently stuck at 0 —
      // this stat was declared in the schema and referenced by the mission
      // pool and trade_1 achievement, but nothing ever incremented it for
      // either side of a completed trade.
      initiatorData.stats = initiatorData.stats || {};
      initiatorData.stats.trades = (initiatorData.stats.trades || 0) + 1;
      partnerData.stats = partnerData.stats || {};
      partnerData.stats.trades = (partnerData.stats.trades || 0) + 1;

      // Save to database - use appropriate method based on who is calling
      if (userId === trade.initiator) {
        await saveUserData({
          balance: initiatorData.balance,
          inventory: initiatorData.inventory,
          stats: initiatorData.stats,
        });
        const User = require('mongoose').model('User');
        await User.updateOne(
          { userId: trade.partner },
          { $set: { balance: partnerData.balance, inventory: partnerData.inventory, stats: partnerData.stats } }
        );
      } else {
        await saveUserData({
          balance: partnerData.balance,
          inventory: partnerData.inventory,
          stats: partnerData.stats,
        });
        const User = require('mongoose').model('User');
        await User.updateOne(
          { userId: trade.initiator },
          { $set: { balance: initiatorData.balance, inventory: initiatorData.inventory, stats: initiatorData.stats } }
        );
      }

      const initiator = await client.users.fetch(trade.initiator);
      const partner = await client.users.fetch(trade.partner);

      const initiatorItemsSummary = Object.entries(trade.initiatorOffer.items).map(([k, v]) => `${v}x ${k}`).join(', ') || 'nothing';
      const partnerItemsSummary   = Object.entries(trade.partnerOffer.items).map(([k, v]) => `${v}x ${k}`).join(', ') || 'nothing';
      await logAdminAction(
        initiator.id, initiator.username, 'trade', 'Trade Completed', partner.id, partner.username,
        `${initiator.username} gave ${trade.initiatorOffer.currency} coins + ${initiatorItemsSummary} / ${partner.username} gave ${trade.partnerOffer.currency} coins + ${partnerItemsSummary}`,
      );

      const embed = new EmbedBuilder()
        .setTitle('TRADE COMPLETED')
        .setDescription(`> Trade between ${initiator} and ${partner} finished successfully.`)
        .setColor(0x000000)
        .setFooter({ text: message.guild?.name || 'Shiro' });

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

      const embed = new EmbedBuilder()
        .setTitle('TRADE CANCELLED')
        .setDescription(`> Trade between ${initiator} and ${partner} was cancelled.`)
        .setColor(0x000000)
        .setFooter({ text: message.guild?.name || 'Shiro' });

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
