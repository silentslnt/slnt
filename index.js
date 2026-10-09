require('dotenv').config();
require('./utils/cv2patch'); // every embed renders as a Components V2 card (see utils/cv2patch.js)
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const {
  Client, GatewayIntentBits, Collection, EmbedBuilder,
  ModalBuilder, TextInputBuilder, TextInputStyle,
  ActionRowBuilder, PermissionFlagsBits,
  REST, Routes, SlashCommandBuilder,
} = require('discord.js');
const keydrop = require('./commands/keydrop.js');
const winAnnouncer = require('./utils/winAnnouncer.js');
const { syncMissionProgress } = require('./utils/missions.js');
const CipherChallenge = require('./models/cipherChallenge.js');
const { getGameChannelId } = require('./utils/gameChannel.js');
const { KEYS_CHANNEL_ALLOWED } = require('./utils/commandRegistry.js');

// ── Vouch system config ────────────────────────────────────────
const VOUCH_CONFIG_FILE = path.join(__dirname, 'vouch-config.json');
function loadVouchConfig() {
  try { return JSON.parse(fs.readFileSync(VOUCH_CONFIG_FILE, 'utf8')); } catch(e) { return {}; }
}
// Loaded once at startup; all subsequent reads use this variable.
let vouchConfig = loadVouchConfig();

async function saveVouchConfig(c) {
  vouchConfig = c;
  winAnnouncer.updateCfg(c);
  await require('./utils/settings').set('vouch', c);   // MongoDB — the disk file doesn't survive a redeploy
}

// ── Economy/moderation log channel (auto-posts every logAdminAction call) ──
function getEconomyLogsChannel() {
  return vouchConfig.economyLogsChannelId || null;
}
async function setEconomyLogsChannel(channelId) {
  await saveVouchConfig({ ...vouchConfig, economyLogsChannelId: channelId });
}
const PENDING_VOUCHES = new Map();
const PENDING_SETUP   = new Map();
const VOUCH_DEFAULTS = {
  title:            '<:Golden_Star:1481125751758520373>'.repeat(5) + '  Verified Purchase',
  vouchedByLabel:   '🌟  Vouched by',
  vouchingForLabel: '✦  Vouching for',
  receivedLabel:    '<:Zsword:1466872460338008064>  Received',
  color:            '#FFD700',
};

// ===== MONGODB SETUP =====
// User model lives in models/user.js — it must be registered before any
// command runs mongoose.model('User') (e.g. leaderboard.js) or does a
// $set/updateOne with the new economy fields (missions, vault, xp, prestige,
// achievements, gift caps). Previously this file registered its own narrow
// inline schema first, which won under mongoose's models.User || model()
// guard — Mongoose's default strict mode then silently dropped every field
// not in that old schema on save (vault, missionProgress, xp, stats, etc.),
// so the whole new economy layer looked like it worked but never persisted.
const User = require('./models/user');

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

  // Auto-post to the configured moderation log channel, if set.
  const channelId = getEconomyLogsChannel();
  if (!channelId) return;
  try {
    const channel = await client.channels.fetch(channelId).catch(() => null);
    if (!channel) return;
    const target = targetUsername ? ` → **${targetUsername}**` : '';
    const detailsText = details ? ` \`${details}\`` : '';
    await channel.send({
      embeds: [
        new EmbedBuilder()
          .setColor(0x000000)
          .setTitle('ECONOMY LOG')
          .setDescription(`> **${adminUsername}** used \`.${command}\` — ${action}${target}${detailsText}`)
          .setTimestamp(),
      ],
    });
  } catch (error) {
    console.error('Error posting economy log:', error);
  }
}

// ===== RUN A COMMAND FROM A BUTTON =====
// (direct: "would you have to type to select a game on a website? no") — cards call client.runAs(interaction, 'mines', ['1000'])
// and the command runs exactly as if the clicker had typed it: same checks, same cooldowns, same atomic money moves.
async function runCommandAs(interaction, name, args = [], opts = {}) {
  const command = client.commands.get(name);
  if (!command) return false;
  const { Collection, MessageFlags: MF } = require('discord.js');
  // opts.private: everything the command posts goes to the clicker only (wallet buttons — no channel flood)
  let channel = opts.channel || interaction.channel;   // opts.channel: run it as if typed in another channel (panel → game channel)
  if (opts.private && channel) {
    channel = Object.create(interaction.channel);
    channel.send = (x) => interaction.followUp(typeof x === 'string'
      ? { content: x, flags: MF.Ephemeral }
      : { ...x, flags: (typeof x.flags === 'number' ? x.flags : 0) | MF.Ephemeral });
  }
  // <@id> args become real mentions (the .play card launches duels this way)
  const mentioned = new Collection();
  for (const a of args) {
    const m = /^<@!?(\d+)>$/.exec(String(a));
    if (m) { const u = await client.users.fetch(m[1]).catch(() => null); if (u) mentioned.set(u.id, u); }
  }
  const message = {
    author: interaction.user, member: interaction.member, guild: interaction.guild, guildId: interaction.guildId,
    channel, channelId: interaction.channelId, client, id: interaction.id,
    content: `${currentPrefix}${name} ${args.join(' ')}`.trim(), createdTimestamp: Date.now(),
    mentions: { users: mentioned, members: new Collection(), roles: new Collection(), channels: new Collection() },
    reply: (x) => channel.send(x), react: async () => {}, delete: async () => {},
  };
  if (!LOCK_EXEMPT_COMMANDS.has(command.name)) {
    if (usersInFlight.has(message.author.id)) {
      await interaction.followUp({ content: '⏳ Finish your current command first.', ephemeral: true }).catch(() => {});
      return true;
    }
    usersInFlight.add(message.author.id);
  }
  try {
    const userData = await getUserData(message.author.id);
    await require('./utils/cv2patch').asPlayer(message.author, command.name, () => command.execute({
      message, args, userData, saveUserData: makeSaver(message.author.id, userData), saveSpecificUserData: saveUserData,
      updateUserBalance, addKeyToInventory, getUserData, keydrop, guessGame, rarities, prefix: currentPrefix, setPrefix: savePrefix,
      client, logAdminAction, AdminLog, getEconomyLogsChannel, setEconomyLogsChannel,
    }));
  } catch (error) {
    if (error instanceof InsufficientFunds) {
      await interaction.followUp({ content: "You don't have enough coins for that anymore.", ephemeral: true }).catch(() => {});
    } else console.error(`runAs ${name}:`, error);
  } finally {
    usersInFlight.delete(message.author.id);
  }
  return true;
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
  const obj = user.toObject();

  // Roll missions over for a new day BEFORE the command runs and mutates any
  // stats — this is the one call site every command passes through, so it's
  // the only safe place to snapshot the day's baseline pre-mutation. If we
  // did this reactively (after a stat changes) instead, the very first
  // action of a new day would already be included in its own baseline and
  // silently not count toward that day's missions.
  const prevDate = obj.missionDate;
  syncMissionProgress(obj);
  if (obj.missionDate !== prevDate) {
    await User.updateOne({ userId }, { $set: {
      missionDate:     obj.missionDate,
      missionProgress: obj.missionProgress,
      missionBaseline: obj.missionBaseline,
    }});
  }

  snapInventory(obj);
  return obj;
}

// Inventory is saved as the CHANGE since it was loaded, never as a whole object (same reason as the balance,
// see makeSaver): a command that loaded your bag before a payout escrow, a SILV grant or another game used to
// write the old bag back — restoring spent SILV. getUserData tags each inventory with a hidden snapshot;
// saving applies per-key $inc deltas, and a spend the real bag can't cover is refused.
const INV_BASE = Symbol('invBase');
function snapInventory(obj) {
  obj.inventory = obj.inventory && typeof obj.inventory === 'object' ? obj.inventory : {};
  Object.defineProperty(obj.inventory, INV_BASE, {
    value: JSON.parse(JSON.stringify(obj.inventory)), writable: true, configurable: true, enumerable: false,
  });
}

async function applyUserUpdate(userId, data) {
  const upd = { ...data };
  delete upd._id; delete upd.__v; delete upd.userId;
  const set = {}, unset = {}, inc = {}, filter = { userId };
  const inv = upd.inventory;
  delete upd.inventory;
  if (inv && typeof inv === 'object') {
    const base = inv[INV_BASE];
    if (base) {
      for (const k of new Set([...Object.keys(base), ...Object.keys(inv)])) {
        const a = base[k], b = inv[k];
        const num = (v) => v === undefined || v === null || typeof v === 'number';
        if (num(a) && num(b)) {
          const d = (Number(b) || 0) - (Number(a) || 0);
          if (d) { inc[`inventory.${k}`] = d; if (d < 0) filter[`inventory.${k}`] = { $gte: -d }; }
        } else if (JSON.stringify(a) !== JSON.stringify(b)) {
          if (b === undefined) unset[`inventory.${k}`] = ''; else set[`inventory.${k}`] = b;
        }
      }
    } else {
      // No snapshot (a copied object) — fall back to per-key writes and flag it so it can be fixed.
      for (const [k, v] of Object.entries(inv)) set[`inventory.${k}`] = v;
      console.warn(`[inventory] absolute save without a snapshot for ${userId}: ${Object.keys(inv).join(', ')}`);
    }
  }
  Object.assign(set, upd);
  const op = {};
  if (Object.keys(set).length) op.$set = set;
  if (Object.keys(unset).length) op.$unset = unset;
  if (Object.keys(inc).length) op.$inc = inc;
  if (!Object.keys(op).length) return;
  const guarded = Object.keys(filter).length > 1;
  if (guarded) {
    const res = await User.findOneAndUpdate(filter, op, { new: true });
    if (!res) throw new InsufficientFunds('items changed while this was running');
  } else {
    await User.updateOne({ userId }, op, { upsert: true });
  }
  if (inv && inv[INV_BASE]) inv[INV_BASE] = JSON.parse(JSON.stringify(inv)); // the next save diffs from here
}

async function saveUserData(userId, userData) {
  await applyUserUpdate(userId, userData);
}

/**
 * A command's own saver. Balance is written as the CHANGE since this command loaded it, never as an absolute
 * number: long games (blackjack, crash, tower, mines…) used to write back a balance read minutes earlier,
 * erasing whatever happened meanwhile — lose everything in coinflip while a blackjack hand is open and the
 * blackjack result put the old balance back. A spend that the real balance can't cover is refused.
 */
class InsufficientFunds extends Error {}

function makeSaver(userId, userData) {
  let base = Number(userData.balance) || 0;
  return async (updated) => {
    const upd = { ...updated };
    if (Object.prototype.hasOwnProperty.call(upd, 'balance')) {
      const target = Number(upd.balance) || 0;
      delete upd.balance;
      const delta = target - base;
      if (delta < 0) {
        const res = await User.findOneAndUpdate({ userId, balance: { $gte: -delta } }, { $inc: { balance: delta } }, { new: true });
        if (!res) throw new InsufficientFunds('balance changed while this was running');
      } else if (delta > 0) {
        await User.updateOne({ userId }, { $inc: { balance: delta } }, { upsert: true });
      }
      base = target;
    }
    if (Object.keys(upd).length) await applyUserUpdate(userId, upd);
  };
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
let currentPrefix = loadPrefix();
client.runAs = runCommandAs;

// Ready event listener
client.once('clientReady', async () => {
  console.log(`✅ Logged in as ${client.user.tag}`);

  // Register slash commands
  if (!process.env.GUILD_ID) {
    console.error('⚠️  GUILD_ID env var not set — slash commands will not be registered');
  } else
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
    const commands = [
      new SlashCommandBuilder()
        .setName('vouch')
        .setDescription('Leave a vouch for Shiro / Silv Market')
        .addUserOption(opt =>
          opt.setName('user')
            .setDescription('Tag the staff member who helped you (optional)')
            .setRequired(false)
        )
        .addAttachmentOption(opt =>
          opt.setName('image')
            .setDescription('Screenshot of your trade/delivery (optional)')
            .setRequired(false)
        )
        .toJSON(),
      new SlashCommandBuilder()
        .setName('setup')
        .setDescription('Configure bot settings')
        .addSubcommand(sub =>
          sub.setName('vouch')
            .setDescription('Set the vouch channel + configure embed appearance')
            .addChannelOption(opt =>
              opt.setName('channel')
                .setDescription('Channel to post vouches in')
                .setRequired(true)
            )
        )
        .addSubcommand(sub =>
          sub.setName('wins')
            .setDescription('Set the channel where big wins are announced')
            .addChannelOption(opt =>
              opt.setName('channel')
                .setDescription('Channel for win announcements (3x+ multiplier or 2000+ coins)')
                .setRequired(true)
            )
        )
        .toJSON(),
    ];
    await rest.put(
      Routes.applicationGuildCommands(client.user.id, process.env.GUILD_ID),
      { body: commands }
    );
    console.log('✅ Slash commands registered (/vouch, /setup vouch, /setup wins)');
  } catch(e) { console.error('Failed to register slash commands:', e.message); }

  await recoverCipherChallenges();

  setInterval(refreshLiveLeaderboards, 5 * 60 * 1000);
  refreshLiveLeaderboards();

  setInterval(claimPendingSilvTokens, 60 * 1000);
  claimPendingSilvTokens();

  // Weekly game board: pays last week's top 10 once (claimed in Mongo), checked every 10 minutes.
  const WL = require('./utils/weeklyLive');
  const payWeekly = () => WL.weekTick(client, logAdminAction).catch((e) => console.error('weekly boards:', e.message));
  setInterval(payWeekly, 10 * 60 * 1000);
  payWeekly();
  setInterval(() => WL.refresh(client).catch((e) => console.error('weekly live board:', e.message)), 5 * 60 * 1000);
  // Supporter role: weekly coins (once per ISO week each, see utils/supporter.js)
  const paySupporters = () => require('./utils/supporter').tick(client, logAdminAction).catch((e) => console.error('supporter pay:', e.message));
  setInterval(paySupporters, 30 * 60 * 1000);
  paySupporters();
  // Community events (rain / high roll): pick up a live one after a restart, auto events every few hours.
  client.logAdminAction = logAdminAction;
  const EV = require('./utils/events');
  EV.resume(client).catch((e) => console.error('event resume:', e.message));
  setInterval(() => EV.tick(client).catch((e) => console.error('auto event:', e.message)), 5 * 60 * 1000);
});

// Sentinel's ,fish command can drop an astronomically rare SILV token — it
// can't credit SILV itself (Mongo-side currency, lives here), so it writes
// an unclaimed row to pending_silv_grants and this poller delivers it: credit
// the balance, DM the winner, done. Runs every minute; SKIP LOCKED on the
// Sentinel side means this is safe even if it somehow overlaps a slow run.
async function claimPendingSilvTokens() {
  const { claimPendingSilvGrants } = require('./utils/sentinelDb.js');
  let grants;
  try {
    grants = await claimPendingSilvGrants();
  } catch (err) {
    console.error('Failed to claim pending SILV grants:', err.message);
    return;
  }
  for (const grant of grants) {
    try {
      // SILV lives in inventory['Silv token'] — this used to add the grant to the COIN balance by mistake.
      // A `coins:` source (Sentinel giveaway prizes) is a coin grant instead.
      const isCoins = String(grant.source || '').startsWith('coins:');
      await User.updateOne({ userId: grant.userId }, { $inc: isCoins ? { balance: grant.amount } : { 'inventory.Silv token': grant.amount } }, { upsert: true });
      const user = await client.users.fetch(grant.userId).catch(() => null);
      if (user) {
        const src = String(grant.source || '');
        const why = src.includes('giveaway:')
          ? `🎉 **Your giveaway prize has been delivered.**`
          : src.startsWith('invite:')
          ? `🎟 **Your invite has been validated** — <@${src.split(':')[1]}> joined, began their journey and really played.`
          : src.startsWith('dungeon:')
            ? '🌀 **SILV you carried out of a dungeon has been claimed.**'
            : '✨ **A SILV Token you caught fishing has been claimed.**';
        await user.send({
          embeds: [
            new EmbedBuilder()
              .setColor(0x000000)
              .setDescription(`${why}\n\n> +\`${grant.amount.toLocaleString()}\` ${isCoins ? 'coins added to your wallet' : 'SILV added to your inventory'}.`),
          ],
        }).catch(() => {});
      }
      // every SILV that lands is logged (direct: "I should see all logs… even when people earn silv from inviting or playing")
      const src = String(grant.source || 'sentinel');
      await logAdminAction(grant.userId, user?.username || grant.userId, 'silvgrant', `+${grant.amount} ${isCoins ? 'coins' : 'SILV'} from Sentinel`,
        grant.userId, user?.username || grant.userId, src);
    } catch (err) {
      console.error(`Failed to credit SILV token grant to ${grant.userId}:`, err.message);
    }
  }
}

// Refreshes every .livelb board on a 5-minute interval. Reads fresh from
// Mongo each tick (not an in-memory cache) so whatever .livelb last set is
// always what gets refreshed, including right after a restart with no extra
// recovery step needed.
async function refreshLiveLeaderboards() {
  const LiveLeaderboard = require('./models/liveLeaderboard.js');
  const { buildLeaderboardEmbed } = require('./commands/leaderboard.js');

  let boards;
  try {
    boards = await LiveLeaderboard.find({});
  } catch (err) {
    console.error('Failed to load live leaderboards:', err.message);
    return;
  }

  for (const board of boards) {
    try {
      const channel = await client.channels.fetch(board.channelId);
      const msg = await channel.messages.fetch(board.messageId);
      const embed = await buildLeaderboardEmbed(board.category, client);
      await msg.edit({ embeds: [embed] });
    } catch (err) {
      // Channel or message gone — clean up so we stop trying every 5 minutes.
      await LiveLeaderboard.deleteOne({ category: board.category }).catch(() => {});
    }
  }
}

// Restores commands/cipher.js's in-flight challenges after a restart. The bet
// is deducted the moment a challenge starts, so losing the in-memory Map to a
// restart used to strand that bet in an unwinnable, unresolvable limbo —
// no way to submit the answer, and no failure message either. Still-valid
// challenges get their remaining timer re-armed (fully resumable, can still
// be won); already-expired ones are resolved as a loss the same way the
// normal timeout does. `attempts` resets to what was last persisted (0) since
// that's a low-stakes counter, not worth writing to Mongo on every keystroke.
async function recoverCipherChallenges() {
  let rows;
  try {
    rows = await CipherChallenge.find({});
  } catch (err) {
    console.error('Failed to load cipher challenges for recovery:', err.message);
    return;
  }
  if (!rows.length) return;

  global.activeChallenges = global.activeChallenges || new Map();
  const { EmbedBuilder: Embed } = require('discord.js');

  for (const row of rows) {
    const elapsed = Date.now() - row.startTime;
    const remaining = row.timeLimit - elapsed;

    if (remaining <= 0) {
      await CipherChallenge.deleteOne({ userId: row.userId }).catch(() => {});
      try {
        const channel = await client.channels.fetch(row.channelId);
        const latestUser = await getUserData(row.userId);
        await channel.send({
          embeds: [new Embed()
            .setColor(0x000000)
            .setTitle('TIME EXPIRED')
            .setDescription(
              `> <@${row.userId}>, your cipher challenge expired while the bot was restarting.\n\n` +
              `> The correct answer was: \`${row.answer}\`\n` +
              `> Lost: **${row.betAmount.toLocaleString()}** coins\n` +
              `> Balance: **${latestUser.balance.toLocaleString()}** coins`
            )],
        });
      } catch { /* channel/user may be gone — bet loss already stands either way */ }
      continue;
    }

    const challenge = {
      userId: row.userId, channelId: row.channelId, answer: row.answer,
      startTime: row.startTime, timeLimit: row.timeLimit, speedBonus: row.speedBonus,
      betAmount: row.betAmount, baseReward: row.baseReward, speedReward: row.speedReward,
      attempts: row.attempts || 0,
    };
    challenge.timeoutId = setTimeout(async () => {
      if (!global.activeChallenges || !global.activeChallenges.has(row.userId)) return;
      global.activeChallenges.delete(row.userId);
      await CipherChallenge.deleteOne({ userId: row.userId }).catch(() => {});
      try {
        const channel = await client.channels.fetch(row.channelId);
        const latestUser = await getUserData(row.userId);
        await channel.send({
          embeds: [new Embed()
            .setColor(0x000000)
            .setTitle('TIME EXPIRED')
            .setDescription(
              `> <@${row.userId}>, you ran out of time.\n\n` +
              `> The correct answer was: \`${row.answer}\`\n` +
              `> Lost: **${row.betAmount.toLocaleString()}** coins\n` +
              `> Balance: **${latestUser.balance.toLocaleString()}** coins`
            )],
        });
      } catch { /* best-effort */ }
    }, remaining);

    global.activeChallenges.set(row.userId, challenge);
  }
  console.log(`Recovered ${rows.length} in-flight cipher challenge(s) after restart.`);
}

// ── Prefix config ─────────────────────────────────────────────
const PREFIX_FILE = path.join(__dirname, 'prefix.json');
function loadPrefix() {
  try { return JSON.parse(fs.readFileSync(PREFIX_FILE, 'utf8')).prefix || '.'; } catch(e) { return '.'; }
}
async function savePrefix(p) {
  currentPrefix = p;
  await require('./utils/settings').set('prefix', p);   // MongoDB — the disk file doesn't survive a redeploy
}

// Global cooldowns
const cooldowns = new Map();
const notHereSeen = new Map();   // user id → last 'Not here' notice (throttle)
const COOLDOWN_MS = 5000;

// Per-user in-flight lock — the 5s per-command cooldown above blocks spamming
// the SAME command twice, but cooldowns are tracked per command name, so two
// DIFFERENT balance-touching commands (e.g. .sh buy + .tip) fired in the same
// instant aren't blocked by it. Since every command independently reads
// userData fresh and writes it back later, two commands racing in that gap
// could both read the same pre-spend balance and both succeed.
//
// This closes it for "quick" commands (resolve in one pass, no waiting on
// user interaction) by only allowing one in flight per user at a time.
// Long-running interactive commands (duel challenges, blackjack, mines,
// trade, minigames waiting on reactions/collectors for up to several
// minutes) are deliberately EXCLUDED — locking for their whole duration
// would stop a player from checking .bal or buying something while they
// have a pending duel, which is normal, legitimate concurrent use. Those
// commands already guard against their own specific races via their own
// active-game Maps (activeGames/activeDuels/SESSIONS/activeTrades/etc.).
const usersInFlight = new Set();
const LOCK_EXEMPT_COMMANDS = new Set([
  'duel', 'blackjack', 'mines', 'minesweeper', 'trade',
  'hangman', 'wordscramble', 'guess', 'cipher', 'crash', 'tower', 'cups',
  'rpsduel', 'flipduel', 'connect4', 'battleship', 'scratch', 'leaderboard',
]);

// Load commands dynamically (exclude keydrop.js)
const commandsPath = path.join(__dirname, 'commands');
let commandsModule = null;

if (fs.existsSync(commandsPath)) {
  const commandFiles = fs
    .readdirSync(commandsPath)
    .filter(file => file.endsWith('.js') && file !== 'keydrop.js');

  const loaded = [];
  for (const file of commandFiles) {
    try {
      const command = require(path.join(commandsPath, file));
      if (command.name && command.execute) {
        loaded.push(command);
      }
    } catch (error) {
      console.error(`Error loading command ${file}:`, error);
    }
  }

  // Register primary names first so no alias can ever shadow a real command.
  for (const command of loaded) {
    client.commands.set(command.name, command);
    if (command.name === 'commands') {
      commandsModule = command;
    }
  }
  for (const command of loaded) {
    for (const alias of command.aliases || []) {
      if (client.commands.has(alias)) {
        console.warn(`Skipping alias '${alias}' for ${command.name} — already taken by ${client.commands.get(alias).name}`);
        continue;
      }
      client.commands.set(alias, command);
    }
  }
  for (const command of loaded) {
    console.log(`Loaded command: ${command.name}${command.aliases?.length ? ` (aliases: ${command.aliases.join(', ')})` : ''}`);
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
      if (!userAnswer.startsWith(currentPrefix)) {
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
          await User.updateOne({ userId }, { $inc: { balance: finalReward } }, { upsert: true }); // never an absolute write

          // Remove challenge
          global.activeChallenges.delete(userId);
          await CipherChallenge.deleteOne({ userId }).catch(() => {});

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
          await CipherChallenge.deleteOne({ userId }).catch(() => {});

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

        await User.updateOne({ userId: message.author.id },
          { $inc: { balance: rewardAmount, [`inventory.${wonRarity}`]: 1 } }, { upsert: true }); // atomic

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

  // Fixed 'shiro ' secondary prefix works everywhere regardless of the
  // configured currentPrefix (Dank Memer-style, direct request) — additive,
  // the configured prefix keeps working exactly as before.
  const SECONDARY_PREFIXES = ['shiro ', 'Shiro ', 'SHIRO '];
  if (!message.content.startsWith(currentPrefix) && !SECONDARY_PREFIXES.some((p) => message.content.startsWith(p))) {
    require('./utils/weeklyLive').countChat(message);   // weekly chatters board (commands don't count)
  }
  const matchedPrefix = message.content.startsWith(currentPrefix)
    ? currentPrefix
    : SECONDARY_PREFIXES.find(p => message.content.startsWith(p));
  if (!matchedPrefix) return;

  const args = message.content.slice(matchedPrefix.length).trim().split(/ +/);
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

  // Keys/game channel restriction — single source of truth now (see
  // utils/gameChannel.js and utils/commandRegistry.js's KEYS_CHANNEL_ALLOWED
  // comment for why this used to be two separate, disagreeing lists).
  // (The old rule here only let a short allowlist run IN the game channel, which is why `.weekly` and most
  // commands silently did nothing there.) Now: command channels from `.shiroset` → Games.
  if (!require('./utils/gameChannel').commandAllowed(message.channel, message.member, command.name)) {
    // Say where it works instead of silence (direct: ".bal just gets ignored") — once per user per 30s, then it tidies up.
    const gc = require('./utils/gameChannel');
    const key = message.author.id;
    const last = notHereSeen.get(key) || 0;
    if (Date.now() - last > 30_000) {
      notHereSeen.set(key, Date.now());
      const where = gc.getCommandChannels().slice(0, 5).map((id) => `<#${id}>`).join(' · ');
      message.reply({ content: `<:xmark:1547659816783061153> Not here — Shiro commands work in ${where || 'the game channels'}.`,
                      allowedMentions: { repliedUser: false } })
        .then((m) => setTimeout(() => m.delete().catch(() => {}), 8000)).catch(() => {});
    }
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
        `⏳ Wait **${remaining}s** before using \`${currentPrefix}${command.name}\` again.`
      );
    }
  }

  timestamps.set(message.author.id, now);
  setTimeout(() => timestamps.delete(message.author.id), COOLDOWN_MS);

  // Per-user in-flight lock (see declaration above) — skip for long-running
  // interactive commands, apply to everything else.
  const useLock = !LOCK_EXEMPT_COMMANDS.has(command.name);
  if (useLock) {
    if (usersInFlight.has(message.author.id)) {
      return message.channel.send('⏳ Finish your current command first.');
    }
    usersInFlight.add(message.author.id);
  }

  // Execute command
  try {
    const userData = await getUserData(message.author.id);

    await require('./utils/cv2patch').asPlayer(message.author, command.name, () => command.execute({
      message,
      args,
      userData,
      saveUserData: makeSaver(message.author.id, userData),
      saveSpecificUserData: saveUserData,
      updateUserBalance,
      addKeyToInventory,
      getUserData,
      keydrop,
      guessGame,
      rarities,
      prefix: currentPrefix,
      setPrefix: savePrefix,
      client,
      logAdminAction,
      AdminLog,
      getEconomyLogsChannel,
      setEconomyLogsChannel,
    }));
  } catch (error) {
    if (error instanceof InsufficientFunds) {
      return message.channel.send("You don't have enough coins for that anymore — your balance changed while it was running.").catch(() => {});
    }
    console.error(`Error executing ${command.name}:`, error);
    const errorEmbed = new EmbedBuilder()
      .setTitle('Command Error')
      .setDescription('An error occurred executing that command.')
      .setColor('Red')
      .setTimestamp();
    message.channel.send({ embeds: [errorEmbed] });
  } finally {
    if (useLock) usersInFlight.delete(message.author.id);
  }
});

// ===== SLASH COMMAND INTERACTIONS =====
client.on('interactionCreate', async (interaction) => {
  // Payout staff buttons (Paid / Reject) — must keep working after restarts, so they're routed here.
  try {
    if (await require('./commands/payout').handleInteraction(interaction)) return;
  } catch (e) { console.error('payout interaction failed:', e); }
  try {
    if (await require('./utils/weeklyLive').handleInteraction(interaction)) return;
  } catch (e) { console.error('weekly notify failed:', e); }
  try {
    if (await require('./utils/events').handleInteraction(interaction)) return;
  } catch (e) { console.error('event join failed:', e); }

  // /setup vouch — admin: pick channel then appearance modal
  if (interaction.isChatInputCommand() && interaction.commandName === 'setup') {
    const isAdmin = interaction.member?.permissions.has(PermissionFlagsBits.ManageGuild);
    if (!isAdmin) return interaction.reply({ content: '❌ You need Manage Server permission.', ephemeral: true });
    if (interaction.options.getSubcommand() === 'wins') {
      const ch  = interaction.options.getChannel('channel');
      vouchConfig.winsChannelId = ch.id;
      await saveVouchConfig(vouchConfig);
      return interaction.reply({ content: `✅ Win announcements will post to <#${ch.id}> (triggers at 3× multiplier or 2,000+ coin profit).`, ephemeral: true });
    }

    if (interaction.options.getSubcommand() === 'vouch') {
      const ch  = interaction.options.getChannel('channel');
      const cfg = vouchConfig;
      PENDING_SETUP.set(interaction.user.id, ch.id);

      const modal = new ModalBuilder()
        .setCustomId('setup_vouch_modal')
        .setTitle('⚙️ Vouch Embed Appearance');
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('sv_title')
            .setLabel('Embed title (emojis + text, full control)')
            .setStyle(TextInputStyle.Short)
            .setValue(cfg.title || VOUCH_DEFAULTS.title)
            .setMaxLength(256)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('sv_vouched_by')
            .setLabel('"Vouched by" field label')
            .setStyle(TextInputStyle.Short)
            .setValue(cfg.vouchedByLabel || VOUCH_DEFAULTS.vouchedByLabel)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('sv_vouching_for')
            .setLabel('"Vouching for" field label')
            .setStyle(TextInputStyle.Short)
            .setValue(cfg.vouchingForLabel || VOUCH_DEFAULTS.vouchingForLabel)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('sv_received')
            .setLabel('"Received" field label')
            .setStyle(TextInputStyle.Short)
            .setValue(cfg.receivedLabel || VOUCH_DEFAULTS.receivedLabel)
            .setRequired(true)
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId('sv_color')
            .setLabel('Embed color (hex, e.g. #FFD700)')
            .setStyle(TextInputStyle.Short)
            .setValue(cfg.color || VOUCH_DEFAULTS.color)
            .setRequired(true)
        )
      );
      return interaction.showModal(modal);
    }
    return interaction.reply({ content: '❌ Unknown subcommand.', ephemeral: true });
  }

  // setup vouch modal submit
  if (interaction.isModalSubmit() && interaction.customId === 'setup_vouch_modal') {
    const channelId = PENDING_SETUP.get(interaction.user.id);
    PENDING_SETUP.delete(interaction.user.id);
    if (!channelId) return interaction.reply({ content: '❌ Setup expired — run `/setup vouch` again.', ephemeral: true });

    const colorRaw = interaction.fields.getTextInputValue('sv_color').trim();
    const hex = colorRaw.replace(/^#/, '');
    if (!/^[0-9a-fA-F]{6}$/.test(hex)) {
      return interaction.reply({ content: '❌ Invalid color — use a 6-digit hex like `#FFD700`', ephemeral: true });
    }

    const cfg = { ...vouchConfig };
    cfg.channelId      = channelId;
    cfg.color          = `#${hex}`;
    cfg.title          = interaction.fields.getTextInputValue('sv_title').trim();
    cfg.vouchedByLabel = interaction.fields.getTextInputValue('sv_vouched_by').trim();
    cfg.vouchingForLabel = interaction.fields.getTextInputValue('sv_vouching_for').trim();
    cfg.receivedLabel  = interaction.fields.getTextInputValue('sv_received').trim();
    await saveVouchConfig(cfg);

    return interaction.reply({
      content: [
        `✅ Vouch setup saved!`,
        `📢 Channel: <#${channelId}>`,
        `🎨 Color: \`${cfg.color}\``,
        `📝 Title: ${cfg.title}`,
        `💡 Tip: type \\:emojiname: in any channel to get the \`<:name:id>\` code you can paste here.`,
        `🏷️ Labels: \`${cfg.vouchedByLabel}\` · \`${cfg.vouchingForLabel}\` · \`${cfg.receivedLabel}\``,
      ].join('\n'),
      ephemeral: true,
    });
  }

  // /vouch — anyone, store options then show modal
  if (interaction.isChatInputCommand() && interaction.commandName === 'vouch') {
    const taggedUser = interaction.options.getUser('user');
    const attachment = interaction.options.getAttachment('image');
    PENDING_VOUCHES.set(interaction.user.id, {
      taggedUser: taggedUser ? { id: taggedUser.id } : null,
      imageUrl: attachment?.url || null,
    });
    const modal = new ModalBuilder()
      .setCustomId('vouch_modal')
      .setTitle('✦ Leave a Vouch');
    modal.addComponents(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('vouch_item')
          .setLabel('What did you receive?')
          .setPlaceholder('e.g. Perm Dragon Fruit — Blox Fruits')
          .setStyle(TextInputStyle.Short)
          .setMaxLength(120)
          .setRequired(true)
      ),
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId('vouch_review')
          .setLabel('Your honest review')
          .setPlaceholder('Tell others about your experience...')
          .setStyle(TextInputStyle.Paragraph)
          .setMinLength(10)
          .setMaxLength(500)
          .setRequired(true)
      )
    );
    return interaction.showModal(modal);
  }

  // vouch modal submit
  if (interaction.isModalSubmit() && interaction.customId === 'vouch_modal') {
    await interaction.deferReply({ ephemeral: true });
    const item    = interaction.fields.getTextInputValue('vouch_item');
    const review  = interaction.fields.getTextInputValue('vouch_review');
    const pending = PENDING_VOUCHES.get(interaction.user.id) || {};
    PENDING_VOUCHES.delete(interaction.user.id);
    const { taggedUser, imageUrl } = pending;

    const cfg = vouchConfig;
    if (!cfg.channelId) {
      return interaction.editReply({ content: '❌ Vouch channel not set — ask an admin to run `/setup vouch #channel`.' });
    }

    const embedColor       = cfg.color          ? parseInt(cfg.color.replace('#', ''), 16) : 0xFFD700;
    const EMBED_TITLE      = cfg.title           || VOUCH_DEFAULTS.title;
    const LBL_VOUCHED_BY   = cfg.vouchedByLabel  || VOUCH_DEFAULTS.vouchedByLabel;
    const LBL_VOUCHING_FOR = cfg.vouchingForLabel|| VOUCH_DEFAULTS.vouchingForLabel;
    const LBL_RECEIVED     = cfg.receivedLabel   || VOUCH_DEFAULTS.receivedLabel;

    let fields;
    if (taggedUser) {
      fields = [
        { name: LBL_VOUCHED_BY,   value: `<@${interaction.user.id}>`, inline: true },
        { name: LBL_VOUCHING_FOR, value: `<@${taggedUser.id}>`,        inline: true },
        { name: LBL_RECEIVED,     value: item,                         inline: false },
      ];
    } else {
      fields = [
        { name: LBL_VOUCHED_BY, value: `<@${interaction.user.id}>`, inline: false },
        { name: LBL_RECEIVED,   value: item,                         inline: false },
      ];
    }

    const embed = new EmbedBuilder()
      .setColor(embedColor)
      .setAuthor({
        name: `${interaction.user.username} left a vouch`,
        iconURL: interaction.user.displayAvatarURL({ dynamic: true }),
      })
      .setTitle(EMBED_TITLE)
      .setDescription(`*"${review}"*`)
      .addFields(...fields)
      .setFooter({ text: 'Silv Market · silvmarket.shop', iconURL: 'https://silvmarket.shop/images/logo.png' })
      .setTimestamp();

    if (imageUrl) embed.setImage(imageUrl);

    try {
      const ch   = await interaction.guild.channels.fetch(cfg.channelId);
      const ping = taggedUser ? `<@${taggedUser.id}>` : undefined;
      await ch.send({ content: ping, embeds: [embed] });
      return interaction.editReply({ content: '✅ Your vouch has been posted — thank you!' });
    } catch(e) {
      console.error('Vouch post error:', e.message);
      return interaction.editReply({ content: '❌ Could not post vouch — channel not found or inaccessible.' });
    }
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

    // Settings live in MongoDB (Railway's disk is wiped on every deploy); the old files only seed it once.
    const settings = require('./utils/settings');
    await settings.load({ vouch: loadVouchConfig(), prefix: loadPrefix(), gameChannelId: require('./utils/gameChannel').fileValue });
    vouchConfig = settings.get('vouch', vouchConfig) || {};
    winAnnouncer.updateCfg(vouchConfig);
    currentPrefix = settings.get('prefix', currentPrefix) || '.';

    await client.login(process.env.DISCORD_TOKEN);
    console.log('🔄 Bot login initiated...');
  } catch (err) {
    console.error('❌ Failed to start bot:', err);
    process.exit(1);
  }
}

startBot();

