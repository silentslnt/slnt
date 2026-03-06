const { EmbedBuilder } = require('discord.js');

// ROLE THAT UNLOCKS EXCLUSIVE PROFILE + CUSTOMIZATION
const EXCLUSIVE_ROLE_ID = '1452178800459645026';

// Inventory key for Silv tokens (same as shop)
const SILV_TOKEN_KEY = 'Silv token';

module.exports = {
  name: 'profile',
  description: 'View a profile. Special role = exclusive customizable profile.',
  async execute({ message, args, userData, saveUserData, getUserData }) {
    const mentioned = message.mentions.users.first();
    const targetUser = mentioned || message.author;
    const isSelf = targetUser.id === message.author.id;

    const sub = args[0]?.toLowerCase();

    // Load DB data for the TARGET user
    const targetData = isSelf
      ? userData
      : await getUserData(targetUser.id);

    // Fetch GuildMember for role checks
    const targetMember = await message.guild.members
      .fetch(targetUser.id)
      .catch(() => null);
    const isExclusive = !!targetMember?.roles.cache.has(EXCLUSIVE_ROLE_ID);

    // CUSTOMIZATION ONLY: self + .profile customize ...
    if (isSelf && sub === 'customize') {
      return handleCustomize({
        message,
        args: args.slice(1),
        userData,
        saveUserData,
      });
    }

    // SHOW PROFILE (self or other)
    return showProfile({
      message,
      targetUser,
      userData: targetData,
      isExclusive,
      isSelf,
    });
  },
};

// =============== CUSTOMIZATION HELPERS (SELF ONLY) ===============

async function handleCustomize({ message, args, userData, saveUserData }) {
  const option = args[0]?.toLowerCase();

  if (!option) {
    return message.channel.send(
      '**Exclusive Profile Customization:**\n' +
        '`.profile customize color #HEXCODE`\n' +
        '`.profile customize bio <text>`\n' +
        '`.profile customize banner <text>`',
    );
  }

  // Color: ONLY users with exclusive role can change it
  if (option === 'color') {
    const member = message.member;
    const hasRole = member.roles.cache.has(EXCLUSIVE_ROLE_ID);
    if (!hasRole) {
      return message.channel.send(
        '❌ Only exclusive members can change profile color.',
      );
    }

    const color = args[1];
    if (!color || !/^#[0-9A-F]{6}$/i.test(color)) {
      return message.channel.send(
        'Usage: `.profile customize color #HEXCODE`',
      );
    }

    userData.profileColor = color;
    await saveUserData({ profileColor: color });
    return message.channel.send(`✅ Profile color set to **${color}**`);
  }

  if (option === 'bio') {
    const bio = args.slice(1).join(' ');
    if (!bio)
      return message.channel.send('Usage: `.profile customize bio <text>`');
    if (bio.length > 100)
      return message.channel.send('❌ Bio must be ≤ 100 characters.');

    userData.profileBio = bio;
    await saveUserData({ profileBio: bio });
    return message.channel.send('✅ Bio updated.');
  }

  if (option === 'banner') {
    const banner = args.slice(1).join(' ');
    if (!banner)
      return message.channel.send(
        'Usage: `.profile customize banner <text>`',
      );
    if (banner.length > 50)
      return message.channel.send('❌ Banner must be ≤ 50 characters.');

    userData.profileBanner = banner;
    await saveUserData({ profileBanner: banner });
    return message.channel.send('✅ Banner updated.');
  }

  return message.channel.send('Unknown option. Use: `color`, `bio`, or `banner`.');
}

// =============== PROFILE DISPLAY ===============

function showProfile({ message, targetUser, userData, isExclusive, isSelf }) {
  // Debug: see what color is coming from DB
  console.log('PROFILE DEBUG', {
    id: targetUser.id,
    username: targetUser.username,
    profileColor: userData.profileColor,
  });

  // Persistent profile fields (from Mongo)
  const color = userData.profileColor || '#2b2d31';
  const bio = userData.profileBio || 'No bio set.';
  const banner = userData.profileBanner || null;

  // Economy (Silv uses same key as inventory/shop)
  const coins = userData.balance || 0;
  const silv = userData.inventory?.[SILV_TOKEN_KEY] || 0;

  // Characters
  const chars = userData.characters || [];
  const charCount = Array.isArray(chars) ? chars.length : 0;

  const tiers = (Array.isArray(chars) ? chars : []).reduce((acc, ch) => {
    if (!ch?.tier) return acc;
    acc[ch.tier] = (acc[ch.tier] || 0) + 1;
    return acc;
  }, {});

  // Header box
  let header =
    '╭──────────────────────────────────────────╮\n' +
    `│  ${targetUser.username.toUpperCase().padEnd(38)} │\n`;

  if (isExclusive) {
    header += '│  ⭐ EXCLUSIVE MEMBER ⭐                  │\n';
    if (banner) {
      header += `│  ✨ ${banner.padEnd(34)} ✨ │\n`;
    }
  }

  header += '╰──────────────────────────────────────────╯';

  const embed = new EmbedBuilder()
    .setTitle(`˗ˏˋ 𐙚 ${targetUser.username}'s Profile 𐙚 ˎˊ˗`)
    .setDescription(`${header}\n\n**Bio:** _${bio}_`)
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    .setColor(color) // always use stored color
    .setTimestamp();

  // Economy field
  embed.addFields({
    name: '💰 ECONOMY',
    value:
      `• Coins: \`${coins.toLocaleString()}\`\n` +
      `• <:SILV_TOKEN:1447678878448484555> SILV Tokens: \`${silv}\``,
    inline: true,
  });

  // Characters field
  let charText = `• Total: **${charCount}**`;
  if (charCount > 0) {
    if (tiers.S) charText += `\n• S Tier: ${tiers.S}`;
    if (tiers.A) charText += `\n• A Tier: ${tiers.A}`;
    if (tiers.B) charText += `\n• B Tier: ${tiers.B}`;
    if (tiers.C) charText += `\n• C Tier: ${tiers.C}`;
  }

  embed.addFields({
    name: '⭐ CHARACTERS',
    value: charText,
    inline: true,
  });

  // Achievements
  const achievements = [];
  if (charCount >= 10) achievements.push('⭐ Character Enthusiast');
  if (charCount >= 50) achievements.push('🌟 Character Master');
  if (silv >= 5) achievements.push('🜂 SILV Holder');
  if (isExclusive) achievements.push('✨ Exclusive Profile');

  if (achievements.length) {
    embed.addFields({
      name: '🏆 ACHIEVEMENTS',
      value: achievements.join(' • '),
      inline: false,
    });
  }

  // Show customization help only for self + exclusive role
  if (isSelf && isExclusive) {
    embed.addFields({
      name: '⚙️ PROFILE CUSTOMIZATION',
      value:
        '`.profile customize color #HEXCODE`\n' +
        '`.profile customize bio <text>`\n' +
        '`.profile customize banner <text>`',
      inline: false,
    });
  }

  return message.channel.send({ embeds: [embed] });
}

