require('dotenv').config();
const fs = require('fs');
const path = require('path');
const express = require('express');
const mongoose = require('mongoose');
const { Client, GatewayIntentBits, Collection, EmbedBuilder } = require('discord.js');
const keydrop = require('./commands/keydrop.js');

// Start Express server to keep bot awake
const app = express();
const PORT = process.env.PORT || 3000;
app.get('/', (req, res) => res.send('Bot is running'));
app.listen(PORT, () => console.log(`Web server started on port ${PORT}`));

// ===== MONGODB SETUP =====
const userSchema = new mongoose.Schema({
  userId: { type: String, unique: true, required: true },
  balance: { type: Number, default: 0 },
  inventory: { type: Object, default: {} },
  lastDaily: { type: Date, default: null },
  characters: { type: Array, default: [] },
  profileColor: { type: String, default: null },
  profileBio: { type: String, default: null },
  profileBanner: { type: String, default: null },
});

const User = mongoose.model('User', userSchema);

const adminLogSchema = new mongoose.Schema({
  adminId: { type: String, required: true },
  adminUsername: { type: String, required: true },
  command: { type: String, required: true },
  action: { type: String, required: true },
  targetUserId: { type: String },
  targetUsername: { type: String },
  details: { type: String },
  timestamp: { type: Date, default: Date.now },
});

const AdminLog = mongoose.model('AdminLog', adminLogSchema);

async function logAdminAction(
  adminId,
  adminUsername,
  command,
  action,
  targetUserId = null,
  targetUsername = null,
  details = ''
) {
  try {
    const log = new AdminLog({
      adminId,
      adminUsername,
      command,
      action,
      targetUserId,
      targetUsername,
      details,
      timestamp: new Date(),
    });
    await log.save();
  } catch (error) {
    console.error('Error logging admin action:', error);
  }
}

// ===== DB HELPERS =====
async function getUserData(userId) {
  let user = await User.findOne({ userId });
  if (!user) {
    user = new User({
      userId,
      balance: 0,
      inventory: {},
      lastDaily: null,
      characters: [],
    });
    await user.save();
  }
  return user.toObject();
}

async function saveUserData(userId, userData) {
  await User.updateOne({ userId }, { $set: userData }, { upsert: true });
}

async function updateUserBalance(userId, amount) {
  const user = await User.findOneAndUpdate(
    { userId },
    { $inc: { balance: amount } },
    { upsert: true, new: true }
  );
  return user.toObject();
}

async function addKeyToInventory(userId, rarity, quantity) {
  const user = await getUserData(userId);
  user.inventory = user.inventory || {};
  user.inventory[rarity] = (user.inventory[rarity] || 0) + quantity;
  await saveUserData(userId, { inventory: user.inventory });
}

// ===== DISCORD CLIENT SETUP =====
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildMembers,
  ],
});

client.commands = new Collection();
const prefix = '.';

// Ready event listener
client.once('ready', () => {
  console.log(`✅ Logged in as ${client.user.tag}`);
});

// Global cooldowns
const cooldowns = new Map();
const COOLDOWN_MS = 5000;

// Load commands dynamically (exclude keydrop.js)
const commandsPath = path.join(__dirname, 'commands');
let commandsModule = null;

if (fs.existsSync(commandsPath)) {
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter(file => file.endsWith('.js') && file !== 'keydrop.js');

  for (const file of commandFiles) {
    try {
      const command = require(path.join(commandsPath, file));
      if (command.name && command.execute) {
        client.commands.set(command.name, command);
        console.log(`Loaded command: ${command.name}`);
        
        if (command.name === 'commands') {
          commandsModule = command;
        }
      }
    } catch (error) {
      console.error(`Error loading command ${file}:`, error);
    }
  }
}

// Rarity config
const rarities = [
  { name: 'Prismatic', chance: 0.0001 },
  { name: 'Mythical', chance: 0.001 },
  { name: 'Legendary', chance: 0.01 },
  { name: 'Rare', chance: 0.05 },
  { name: 'Uncommon', chance: 0.10 },
  { name: 'Common', chance: 0.20 },
];

const rewardsByRarity = {
  Prismatic: { min: 500, max: 1000 },
  Mythical: { min: 300, max: 600 },
  Legendary: { min: 200, max: 400 },
  Rare: { min: 100, max: 200 },
  Uncommon: { min: 50, max: 100 },
  Common: { min: 10, max: 50 },
};

let guessGame = {
  active: false,
  number: null,
  channelId: null,
};

function getRandomRarity() {
  const roll = Math.random();
  let cumulative = 0;
  for (const rarity of rarities) {
    cumulative += rarity.chance;
    if (roll <= cumulative) return rarity.name;
  }
  return rarities[rarities.length - 1].name;
}

// ===== MESSAGE HANDLER =====
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const userId = message.author.id;

  // ===== CIPHER GAME ANSWER CHECKER =====
  if (global.activeChallenges && global.activeChallenges.has(userId)) {
    const challenge = global.activeChallenges.get(userId);
    
    // Check if message is in the same channel
    if (message.channel.id === challenge.channelId) {
      const userAnswer = message.content.toUpperCase().trim();
      
      // Ignore if it's a command
      if (!userAnswer.startsWith(prefix)) {
        challenge.attempts++;

        // Check if answer matches
        if (userAnswer === challenge.answer) {
          const timeTaken = Date.now() - challenge.startTime;
          const timeInSeconds = Math.floor(timeTaken / 1000);
          
          // Clear timeout
          clearTimeout(challenge.timeoutId);
          
          // Determine reward based on time
          let finalReward = challenge.baseReward;
          let rewardType = 'Normal Clear';
          let rewardColor = 'Green';
          
          if (timeTaken < challenge.speedBonus) {
            finalReward = challenge.speedReward;
            rewardType = '⚡ SPEED BONUS!';
            rewardColor = 'Gold';
          }

          // Add reward to user balance
          const userData = await getUserData(userId);
          userData.balance += finalReward;
          await saveUserData(userId, userData);

          // Remove challenge
          global.activeChallenges.delete(userId);

          // Calculate profit
          const profit = finalReward - challenge.betAmount;

          // Send success embed
          const successEmbed = new EmbedBuilder()
            .setColor(rewardColor)
            .setTitle('🎉 CHALLENGE COMPLETED!')
            .setDescription(
              `${message.author} **CRACKED THE CODE!**\n\n` +
              `✅ **Correct Answer:** \`${challenge.answer}\`\n` +
              `⏱️ **Time Taken:** ${timeInSeconds} seconds\n` +
              `🎯 **Attempts:** ${challenge.attempts}\n\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n` +
              `💰 **Bet Amount:** ${challenge.betAmount} coins\n` +
              `🏆 **${rewardType}:** ${finalReward} coins\n` +
              `📈 **Net Profit:** +${profit} coins\n` +
              `💳 **New Balance:** ${userData.balance} coins\n` +
              `━━━━━━━━━━━━━━━━━━━━━━━━━━━\n\n` +
              `${timeTaken < challenge.speedBonus ? '⚡ **LIGHTNING FAST!** You earned the 3x multiplier!' : '🎊 Well done, Code Breaker!'}`
            )
            .setTimestamp();

          message.channel.send({ embeds: [successEmbed] });
          return;

        } else if (challenge.attempts >= 10) {
          // Too many wrong attempts
          clearTimeout(challenge.timeoutId);
          global.activeChallenges.delete(userId);

          const userData = await getUserData(userId);
          const failEmbed = new EmbedBuilder()
            .setColor('Red')
            .setTitle('❌ TOO MANY ATTEMPTS!')
            .setDescription(
              `${message.author}, you've made too many incorrect attempts!\n\n` +
              `**The correct answer was:** \`${challenge.answer}\`\n\n` +
              `💀 **Lost:** ${challenge.betAmount} coins\n` +
              `📊 **Current Balance:** ${userData.balance} coins\n` +
              `*Practice your cipher skills and try again!*`
            )
            .setTimestamp();

          message.channel.send({ embeds: [failEmbed] });
          return;

        } else {
          // Wrong answer but still has attempts left
          message.react('❌');
          
          if (challenge.attempts === 3 || challenge.attempts === 6) {
            message.channel.send({
              embeds: [
                new EmbedBuilder()
                  .setColor('Orange')
                  .setTitle('❌ Incorrect!')
                  .setDescription(
                    `That's not right, ${message.author}.\n\n` +
                    `🎯 **Attempts Used:** ${challenge.attempts}/10\n` +
                    `⏰ Time is ticking... Keep trying!`
                  )
              ]
            });
          }
          return;
        }
      }
    }
  }

  // Passive key drop
  try {
    await keydrop.handleKeyDrop(message, client);
  } catch (error) {
    console.error('Error in keydrop:', error);
  }

  // Guessing game
  if (guessGame.active && message.channel.id === guessGame.channelId) {
    const guess = parseInt(message.content);
    if (!isNaN(guess)) {
      if (guess === guessGame.number) {
        const wonRarity = getRandomRarity();
        const rewardRange = rewardsByRarity[wonRarity] || { min: 10, max: 50 };
        const rewardAmount =
          Math.floor(Math.random() * (rewardRange.max - rewardRange.min + 1)) + rewardRange.min;

        const userData = await getUserData(message.author.id);
        userData.inventory = userData.inventory || {};
        userData.inventory[wonRarity] = (userData.inventory[wonRarity] || 0) + 1;
        userData.balance += rewardAmount;

        await saveUserData(message.author.id, {
          inventory: userData.inventory,
          balance: userData.balance,
        });

        const winEmbed = new EmbedBuilder()
          .setTitle('Game Winner!')
          .setDescription(
            `${message.author} guessed **${guessGame.number}** and won a **${wonRarity}** key with **${rewardAmount} coins**!`
          )
          .setColor('Gold')
          .setTimestamp();

        message.channel.send({ embeds: [winEmbed] });

        guessGame.active = false;
        guessGame.number = null;
        guessGame.channelId = null;
      }
      return;
    }
  }

  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  const command = client.commands.get(commandName);
  if (!command) return;

  // ===== CHECK IF COMMANDS ARE DISABLED =====
  if (commandsModule && !commandsModule.areCommandsEnabled()) {
    if (!commandsModule.canToggleCommands(message.member)) {
      return;
    }
  }

  if (commandName === 'commands') {
    if (!commandsModule || !commandsModule.canToggleCommands(message.member)) {
      return;
    }
  }

  // Keys channel restriction
  const KEYS_CHANNEL_ID = '1401925188991582338';
  const allowedInKeysChannel = ['tkd','admin','claim', 'redeem', 'hangman', 'inventory', 'inv', 'bal', 'baltop', 'profile', 'setchannel','commands','cipher'];

  if (message.channel.id === KEYS_CHANNEL_ID && !allowedInKeysChannel.includes(command.name)) {
    return;
  }

  // Cooldown check
  if (!cooldowns.has(command.name)) {
    cooldowns.set(command.name, new Map());
  }

  const now = Date.now();
  const timestamps = cooldowns.get(command.name);

  if (timestamps.has(message.author.id)) {
    const expirationTime = timestamps.get(message.author.id) + COOLDOWN_MS;
    if (now < expirationTime) {
      const remaining = ((expirationTime - now) / 1000).toFixed(1);
      return message.channel.send(
        `⏳ Wait **${remaining}s** before using \`${prefix}${command.name}\` again.`
      );
    }
  }

  timestamps.set(message.author.id, now);
  setTimeout(() => timestamps.delete(message.author.id), COOLDOWN_MS);

  // Execute command
  try {
    const userData = await getUserData(message.author.id);

    await command.execute({
      message,
      args,
      userData,
      saveUserData: (updatedData) => saveUserData(message.author.id, updatedData),
      updateUserBalance,
      addKeyToInventory,
      getUserData,
      keydrop,
      guessGame,
      rarities,
      prefix,
      client,
      logAdminAction,
      AdminLog,
    });
  } catch (error) {
    console.error(`Error executing ${command.name}:`, error);
    const errorEmbed = new EmbedBuilder()
      .setTitle('Command Error')
      .setDescription('An error occurred executing that command.')
      .setColor('Red')
      .setTimestamp();
    message.channel.send({ embeds: [errorEmbed] });
  }
});

// ===== START BOT =====
async function startBot() {
  try {
    mongoose.connection.on('error', (err) => {
      console.error('❌ MongoDB connection error:', err);
    });

    mongoose.connection.on('disconnected', () => {
      console.log('⚠️ MongoDB disconnected');
    });

    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected to MongoDB');

    await client.login(process.env.DISCORD_TOKEN);
    console.log('🔄 Bot login initiated...');
  } catch (err) {
    console.error('❌ Failed to start bot:', err);
    process.exit(1);
  }
}

startBot();
