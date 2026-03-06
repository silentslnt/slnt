const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');

// Active battles: key = channelId, value = battleState
const activeBattles = new Map();

// Health by tier
const healthByTier = {
  'S+': 250,
  'S': 210,
  'A': 170,
  'B': 150,
  'C': 125,
  'D': 100
};

// Move usage limits by damage tier
const moveUsageLimits = {
  'S+': 2,
  'S': 4,
  'A': 7,
  'A-S': 7,
  'A+': 7,
  'B-A': 10,
  'B': 12,
  'C-B': 15,
  'C': 20,
  'D': 25,
  'Utility': 999,
  'Varies': 5
};

// Damage calculation based on move tier
function calculateDamage(moveDamage) {
  const damageMap = {
    'S+': { min: 100, max: 190 },
    'S': { min: 90, max: 150 },
    'A': { min: 70, max: 90 },
    'A-S': { min: 80, max: 100 },
    'A+': { min: 80, max: 100 },
    'B-A': { min: 60, max: 80 },
    'B': { min: 50, max: 70 },
    'C-B': { min: 40, max: 50 },
    'C': { min: 20, max: 50 },
    'D': { min: 0, max: 20 },
    'Utility': { min: 0, max: 0 },
    'Varies': { min: 90, max: 130 }
  };

  const damageStr = String(moveDamage).toUpperCase();
  if (damageStr.includes('S') || damageStr.includes('A')) {
    const range = damageMap['A'] || { min: 80, max: 100 };
    return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
  }

  const range = damageMap[moveDamage] || { min: 30, max: 50 };
  return Math.floor(Math.random() * (range.max - range.min + 1)) + range.min;
}

// Check if attack is dodged (1% chance)
function checkDodge() {
  const dodgeChance = 0.01; // 1% chance
  return Math.random() < dodgeChance;
}

// Get move usage limit
function getMoveUsageLimit(moveDamage) {
  const limit = moveUsageLimits[moveDamage];
  if (limit) return limit;

  const damageStr = String(moveDamage).toUpperCase();
  if (damageStr.includes('S+')) return 2;
  if (damageStr.includes('S')) return 4;
  if (damageStr.includes('A')) return 7;
  if (damageStr.includes('B')) return 12;
  if (damageStr.includes('C')) return 20;
  if (damageStr.includes('D')) return 25;

  return 999;
}

// Initialize character for battle with move tracking
function initCharacter(char) {
  return {
    name: char.name,
    series: char.series,
    tier: char.tier,
    moves: char.moves.map(move => ({
      ...move,
      usesRemaining: getMoveUsageLimit(move.damage),
      maxUses: getMoveUsageLimit(move.damage)
    })),
    currentHealth: healthByTier[char.tier] || 100,
    maxHealth: healthByTier[char.tier] || 100
  };
}

module.exports = {
  name: 'battle',
  description: 'Battle another player with your characters',
  async execute({ message, args, userData, getUserData }) {
    const subcommand = args[0]?.toLowerCase();

    // CHALLENGE ANOTHER PLAYER
    if (!subcommand || message.mentions.users.first()) {
      const opponent = message.mentions.users.first();

      if (!opponent) {
        return message.channel.send('Usage: `.battle @user` to challenge someone!');
      }

      if (opponent.bot) {
        return message.channel.send('❌ You cannot battle bots!');
      }

      if (opponent.id === message.author.id) {
        return message.channel.send('❌ You cannot battle yourself!');
      }

      if (activeBattles.has(message.channel.id)) {
        return message.channel.send('❌ There is already an active battle in this channel!');
      }

      const challengerChars = userData.characters || [];
      if (challengerChars.length === 0) {
        return message.channel.send('❌ You don\'t have any characters! Use `.roll` to get some.');
      }

      const opponentData = await getUserData(opponent.id);
      const opponentChars = opponentData.characters || [];
      if (opponentChars.length === 0) {
        return message.channel.send(`❌ ${opponent.username} doesn't have any characters!`);
      }

      const battleState = {
        challenger: message.author.id,
        opponent: opponent.id,
        challengerTeam: [],
        opponentTeam: [],
        turn: null,
        currentRound: 0,
        status: 'setup',
        challengerReady: false,
        opponentReady: false
      };

      activeBattles.set(message.channel.id, battleState);

      const embed = new EmbedBuilder()
        .setTitle('˗ˏˋ 𐙚 ⚔️ 𝔅𝔞𝔱𝔱𝔩𝔢 ℭ𝔥𝔞𝔩𝔩𝔢𝔫𝔤𝔢! 𐙚 ˎˊ˗')
        .setDescription(
          `${message.author} has challenged ${opponent} to a battle!\n\n` +
          '꒰ঌ Both players may choose up to **4 characters** for their team ໒꒱\n\n' +
          '**Commands:**\n' +
          '`.battle add <character name>` - Add character to team\n' +
          '`.battle remove <character name>` - Remove character from team\n' +
          '`.battle team` - View your team\n' +
          '`.battle ready` - Confirm team (both must be ready)\n' +
          '`.battle cancel` - Cancel battle'
        )
        .setColor('#F5E6FF')
        .setTimestamp();

      return message.channel.send({ embeds: [embed] });
    }

    // Check if there's an active battle
    const battle = activeBattles.get(message.channel.id);
    if (!battle) {
      return message.channel.send('❌ No active battle in this channel. Use `.battle @user` to start one!');
    }

    const userId = message.author.id;
    const isChallenger = userId === battle.challenger;
    const isOpponent = userId === battle.opponent;

    if (!isChallenger && !isOpponent) {
      return message.channel.send('❌ You are not part of this battle!');
    }

    // ADD CHARACTER TO TEAM
    if (subcommand === 'add') {
      if (battle.status !== 'setup') {
        return message.channel.send('❌ Battle has already started!');
      }

      const charName = args.slice(1).join(' ').trim();
      if (!charName) {
        return message.channel.send('Usage: `.battle add <character name>`');
      }

      const myTeam = isChallenger ? battle.challengerTeam : battle.opponentTeam;
      if (myTeam.length >= 4) {
        return message.channel.send('❌ Your team is full! Maximum 4 characters.');
      }

      const chars = userData.characters || [];
      const char = chars.find(c => c.name.toLowerCase().trim() === charName.toLowerCase().trim());

      if (!char) {
        return message.channel.send(`❌ You don't own **${charName}**.`);
      }

      if (myTeam.some(c => c.name.toLowerCase() === charName.toLowerCase())) {
        return message.channel.send(`❌ **${char.name}** is already in your team!`);
      }

      myTeam.push(initCharacter(char));

      return message.channel.send(`✅ Added **${char.name}** (${char.tier}) to your team! (${myTeam.length}/4)`);
    }

    // REMOVE CHARACTER FROM TEAM
    if (subcommand === 'remove') {
      if (battle.status !== 'setup') {
        return message.channel.send('❌ Battle has already started!');
      }

      const charName = args.slice(1).join(' ').trim();
      if (!charName) {
        return message.channel.send('Usage: `.battle remove <character name>`');
      }

      const myTeam = isChallenger ? battle.challengerTeam : battle.opponentTeam;
      const index = myTeam.findIndex(c => c.name.toLowerCase().trim() === charName.toLowerCase().trim());

      if (index === -1) {
        return message.channel.send(`❌ **${charName}** is not in your team.`);
      }

      const removed = myTeam.splice(index, 1)[0];
      return message.channel.send(`✅ Removed **${removed.name}** from your team.`);
    }

    // VIEW TEAM
    if (subcommand === 'team') {
      const myTeam = isChallenger ? battle.challengerTeam : battle.opponentTeam;

      if (myTeam.length === 0) {
        return message.channel.send('❌ Your team is empty! Use `.battle add <character name>`');
      }

      const teamList = myTeam.map((c, i) =>
        `${i + 1}. **${c.name}** (${c.tier}) - HP: ${c.currentHealth}/${c.maxHealth}`
      ).join('\n');

      const embed = new EmbedBuilder()
        .setTitle(`˗ˏˋ 𐙚 ${message.author.username}'𝕤 𝕋𝕖𝕒𝕞 𐙚 ˎˊ˗`)
        .setDescription(teamList)
        .setColor('#F5E6FF')
        .setFooter({ text: `${myTeam.length}/4 characters selected` })
        .setTimestamp();

      return message.channel.send({ embeds: [embed] });
    }

    // READY TO START
    if (subcommand === 'ready') {
      if (battle.status !== 'setup') {
        return message.channel.send('❌ Battle has already started!');
      }

      const myTeam = isChallenger ? battle.challengerTeam : battle.opponentTeam;

      if (myTeam.length === 0) {
        return message.channel.send('❌ You must add at least 1 character to your team!');
      }

      if (isChallenger) {
        battle.challengerReady = true;
      } else {
        battle.opponentReady = true;
      }

      message.channel.send(`✅ ${message.author.username} is ready!`);

      if (battle.challengerReady && battle.opponentReady) {
        battle.status = 'active';
        battle.turn = battle.challenger;
        battle.currentRound = 1;

        const challenger = await message.client.users.fetch(battle.challenger);
        const opponent = await message.client.users.fetch(battle.opponent);

        const startEmbed = new EmbedBuilder()
          .setTitle('˗ˏˋ 𐙚 ⚔️ 𝔅𝔞𝔱𝔱𝔩𝔢 𝔖𝔱𝔞𝔯𝔱! 𐙚 ˎˊ˗')
          .setDescription(
            `${challenger.username} vs ${opponent.username}\n\n` +
            `**Round 1**\n` +
            `꒰ঌ ${challenger.username}'s turn begins! ໒꒱`
          )
          .setColor('#F5E6FF')
          .setTimestamp();

        await message.channel.send({ embeds: [startEmbed] });

        const currentChar = battle.challengerTeam[0];
        const movesList = currentChar.moves.map((m, i) =>
          `${i + 1}. **${m.name}** (${m.damage}) - ${m.usesRemaining}/${m.maxUses} uses`
        ).join('\n');

        const moveEmbed = new EmbedBuilder()
          .setTitle(`⭐ ${currentChar.name} - HP: ${currentChar.currentHealth}/${currentChar.maxHealth}`)
          .setDescription(
            `**Choose your move:**\n${movesList}\n\n` +
            'Type `.battle attack <move number>` to attack!'
          )
          .setColor('#C1FFD7')
          .setTimestamp();

        return message.channel.send({ embeds: [moveEmbed] });
      }

      return;
    }

    // ATTACK
    if (subcommand === 'attack') {
      if (battle.status !== 'active') {
        return message.channel.send('❌ Battle hasn\'t started yet!');
      }

      if (userId !== battle.turn) {
        return message.channel.send('❌ It\'s not your turn!');
      }

      const moveNum = parseInt(args[1]);
      if (isNaN(moveNum) || moveNum < 1) {
        return message.channel.send('Usage: `.battle attack <move number>`');
      }

      const attackerTeam = isChallenger ? battle.challengerTeam : battle.opponentTeam;
      const defenderTeam = isChallenger ? battle.opponentTeam : battle.challengerTeam;

      const attacker = attackerTeam.find(c => c.currentHealth > 0);
      if (!attacker) {
        return message.channel.send('❌ All your characters are defeated!');
      }

      if (moveNum > attacker.moves.length) {
        return message.channel.send(`❌ Invalid move! Choose 1-${attacker.moves.length}`);
      }

      const move = attacker.moves[moveNum - 1];

      if (move.usesRemaining <= 0) {
        return message.channel.send(`❌ **${move.name}** has no uses left! Choose another move.`);
      }

      const defender = defenderTeam.find(c => c.currentHealth > 0);
      if (!defender) {
        const winner = await message.client.users.fetch(userId);
        const loser = await message.client.users.fetch(isChallenger ? battle.opponent : battle.challenger);

        activeBattles.delete(message.channel.id);

        const winEmbed = new EmbedBuilder()
          .setTitle('˗ˏˋ 𐙚 🏆 𝔅𝔞𝔱𝔱𝔩𝔢 𝔈𝔫𝔡𝔢𝔡! 𐙚 ˎˊ˗')
          .setDescription(`${winner} gracefully triumphs over ${loser}!`)
          .setColor('#F5E6FF')
          .setTimestamp();

        return message.channel.send({ embeds: [winEmbed] });
      }

      move.usesRemaining--;

      const isDodged = checkDodge();

      let actionEmbed;

      if (isDodged) {
        actionEmbed = new EmbedBuilder()
          .setTitle(`⭐ ${attacker.name} used ${move.name}!`)
          .setDescription(
            `🪽 **${defender.name} DODGED THE ATTACK!**\n\n` +
            `**${defender.name}** - HP: ${defender.currentHealth}/${defender.maxHealth}\n` +
            `**${move.name}** - ${move.usesRemaining}/${move.maxUses} uses remaining`
          )
          .setColor('#F5E6FF')
          .setTimestamp();
      } else {
        const damage = calculateDamage(move.damage);
        defender.currentHealth = Math.max(0, defender.currentHealth - damage);

        actionEmbed = new EmbedBuilder()
          .setTitle(`⭐ ${attacker.name} used ${move.name}!`)
          .setDescription(
            `💥 Dealt **${damage}** damage to ${defender.name}!\n\n` +
            `**${defender.name}** - HP: ${defender.currentHealth}/${defender.maxHealth}\n` +
            `**${move.name}** - ${move.usesRemaining}/${move.maxUses} uses remaining`
          )
          .setColor('#FFB3C6')
          .setTimestamp();
      }

      await message.channel.send({ embeds: [actionEmbed] });

      if (!isDodged && defender.currentHealth === 0) {
        await message.channel.send(`💀 **${defender.name}** has been defeated!`);

        if (defenderTeam.every(c => c.currentHealth === 0)) {
          const winner = await message.client.users.fetch(userId);
          const loser = await message.client.users.fetch(isChallenger ? battle.opponent : battle.challenger);

          activeBattles.delete(message.channel.id);

          const winEmbed = new EmbedBuilder()
            .setTitle('˗ˏˋ 𐙚 🏆 𝔅𝔞𝔱𝔱𝔩𝔢 𝔈𝔫𝔡𝔢𝔡! 𐙚 ˎˊ˗')
            .setDescription(`${winner} wins the celestial duel against ${loser}!`)
            .setColor('#F5E6FF')
            .setTimestamp();

          return message.channel.send({ embeds: [winEmbed] });
        }
      }

      battle.turn = isChallenger ? battle.opponent : battle.challenger;
      battle.currentRound++;

      const nextPlayer = await message.client.users.fetch(battle.turn);
      const nextTeam = battle.turn === battle.challenger ? battle.challengerTeam : battle.opponentTeam;
      const nextChar = nextTeam.find(c => c.currentHealth > 0);

      const movesList = nextChar.moves.map((m, i) =>
        `${i + 1}. **${m.name}** (${m.damage}) - ${m.usesRemaining}/${m.maxUses} uses`
      ).join('\n');

      const nextTurnEmbed = new EmbedBuilder()
        .setTitle(`Round ${battle.currentRound} - ˗ˏˋ 𐙚 ${nextPlayer.username}'𝕤 𝕋𝕦𝕣𝕟 𐙚 ˎˊ˗`)
        .setDescription(
          `**${nextChar.name}** - HP: ${nextChar.currentHealth}/${nextChar.maxHealth}\n\n` +
          `**Choose your move:**\n${movesList}\n\n` +
          'Type `.battle attack <move number>` to attack!'
        )
        .setColor('#C1FFD7')
        .setTimestamp();

      return message.channel.send({ embeds: [nextTurnEmbed] });
    }

    // CANCEL BATTLE
    if (subcommand === 'cancel') {
      activeBattles.delete(message.channel.id);
      return message.channel.send('❌ Battle cancelled.');
    }

    // DEFAULT HELP
    return message.channel.send(
      '**Battle Commands:**\n' +
      '`.battle @user` - Challenge someone\n' +
      '`.battle add <character name>` - Add to team\n' +
      '`.battle remove <character name>` - Remove from team\n' +
      '`.battle team` - View your team\n' +
      '`.battle ready` - Start battle\n' +
      '`.battle attack <move#>` - Attack (during battle)\n' +
      '`.battle cancel` - Cancel battle'
    );
  }
};
