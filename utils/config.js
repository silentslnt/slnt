// ============================================================
//  KON BOT — Central Configuration
// ============================================================

module.exports = {
  // ── ROLES ──────────────────────────────────────────────────
  ADMIN_ROLE_ID:       '1454818862397653074',
  MOD_ROLE_ID:         '1450358872782147726',
  EXCLUSIVE_ROLE_ID:   '1452178800459645026',

  ADMIN_USER_IDS: [
    '1432513881653121047',
    '1349792214124986419',
    '730860363884527646',
  ],

  // ── CHANNELS ───────────────────────────────────────────────
  KEYDROP_CHANNEL_ID:  '1472342562093404324',
  GAME_CHANNEL_ID:     '1401925188991582338',

  // ── ECONOMY ────────────────────────────────────────────────
  MAX_BET:             50_000,      // cap on all-in / per-bet
  SILV_PER_ROBUX:      10,          // 1 SILV = 10 Robux
  INVESTMENT_CAP:      5_000,       // max coins lockable per vault cycle
  INVESTMENT_RETURN:   1.10,        // 10% profit
  GIFT_DAILY_CAP:      10_000,      // max coins you can gift per day

  // ── XP ─────────────────────────────────────────────────────
  XP_PER_GAME:         25,
  XP_PER_WIN:          50,
  XP_PER_DAILY:        100,
  XP_PER_MISSION:      200,
  XP_LEVEL_BASE:       500,         // XP needed for level 1→2
  XP_LEVEL_SCALE:      1.25,        // multiplier per level

  // ── PRESTIGE RANKS ─────────────────────────────────────────
  PRESTIGE_RANKS: [
    { name: 'Wanderer',   min: 0,         bonus: 0,    passive: 0  },
    { name: 'Pilgrim',    min: 5_000,     bonus: 0.05, passive: 0  },
    { name: 'Seeker',     min: 25_000,    bonus: 0.10, passive: 0  },
    { name: 'Oracle',     min: 100_000,   bonus: 0.15, passive: 10 },
    { name: 'Celestial',  min: 500_000,   bonus: 0.20, passive: 20 },
    { name: 'Ascendant',  min: 2_000_000, bonus: 0.25, passive: 30 },
  ],

  // ── DAILY STREAKS ──────────────────────────────────────────
  DAILY_BASE:          100,
  STREAK_TIERS: [
    { days: 1,  multiplier: 1.0  },
    { days: 4,  multiplier: 1.5  },
    { days: 8,  multiplier: 2.0  },
    { days: 15, multiplier: 2.5  },
    { days: 31, multiplier: 3.0  },
  ],
  WEEKLY_BONUS_COINS:  1_000,
  WEEKLY_BONUS_KEY:    'Common',
  MONTHLY_BONUS_COINS: 10_000,
  MONTHLY_BONUS_SILV:  1,
  MONTHLY_BADGE:       '🌙 Lunar Devotee',

  // ── EMBED COLORS ───────────────────────────────────────────
  COLOR: {
    DEFAULT:   '#F5E6FF',
    WIN:       '#C1FFD7',
    LOSS:      '#FFB3C6',
    WARNING:   '#FFD580',
    ADMIN:     '#8B5CF6',
    PRESTIGE:  '#FFD700',
    ESSENCE:   '#A78BFA',
    MISSIONS:  '#60A5FA',
    SHOP:      '#9b59b6',
  },

  // ── ESSENCE DEFINITIONS ────────────────────────────────────
  ESSENCES: {
    xp_essence: {
      name: 'XP Essence',
      emoji: '✨',
      effect: '2× XP gain',
      durationMs: 60 * 60 * 1000,        // 1 hour
      silvCost: 2,
      type: 'xp',
    },
    echo_essence: {
      name: 'Echo Essence',
      emoji: '💬',
      effect: '2× message rewards',
      durationMs: 60 * 60 * 1000,
      silvCost: 2,
      type: 'message',
    },
    aura_essence: {
      name: 'Aura Essence',
      emoji: '💰',
      effect: '2× coin gains (not casino payouts)',
      durationMs: 30 * 60 * 1000,        // 30 min
      silvCost: 3,
      type: 'coins',
    },
    frenzy_essence: {
      name: 'Frenzy Essence',
      emoji: '🎮',
      effect: '2× minigame rewards · +5% winnings in casino games',
      durationMs: 30 * 60 * 1000,
      silvCost: 3,
      type: 'frenzy',
    },
    luck_essence: {
      name: 'Luck Essence',
      emoji: '🍀',
      effect: '+1% win chance in casino games',
      durationMs: 60 * 60 * 1000,
      silvCost: 5,
      type: 'luck',
    },
    flow_essence: {
      name: 'Flow Essence',
      emoji: '⏩',
      effect: '50% reduced cooldowns',
      durationMs: 60 * 60 * 1000,
      silvCost: 4,
      type: 'flow',
    },
    key_essence: {
      name: 'Key Essence',
      emoji: '🔑',
      effect: '3× key drop rate',
      durationMs: 2 * 60 * 60 * 1000,   // 2 hours
      silvCost: 6,
      type: 'keys',
    },
    dream_essence: {
      name: 'Dream Essence',
      emoji: '🌙',
      effect: '50 passive coins/hr',
      durationMs: 4 * 60 * 60 * 1000,   // 4 hours
      silvCost: 4,
      type: 'passive',
    },
  },

  // ── COSMETIC TITLES ────────────────────────────────────────
  TITLES: {
    wanderer_title:   { name: '✦ Wanderer',          silvCost: 3  },
    oracle_title:     { name: '⭐ The Oracle',        silvCost: 8  },
    celestial_title:  { name: '✧ Celestial Drifter', silvCost: 12 },
    lucky_title:      { name: '🍀 Lucky Star',        silvCost: 10 },
    shadow_title:     { name: '🌑 Shadow Keeper',     silvCost: 10 },
    ascendant_title:  { name: '👑 Ascendant',         silvCost: 20 },
    silv_title:       { name: '💎 SILV Holder',       silvCost: 15 },
    prestige_title:   { name: '🔥 Prestigious',       silvCost: 18 },
  },

  // ── BADGES ─────────────────────────────────────────────────
  BADGES: {
    star_badge:    { name: '⭐ Star',          silvCost: 3 },
    moon_badge:    { name: '🌙 Moon',          silvCost: 3 },
    flame_badge:   { name: '🔥 Flame',         silvCost: 4 },
    crown_badge:   { name: '👑 Crown',         silvCost: 6 },
    diamond_badge: { name: '💎 Diamond',       silvCost: 8 },
    angel_badge:   { name: '🪽 Angel',         silvCost: 5 },
  },

  // ── BUNDLES ────────────────────────────────────────────────
  BUNDLES: {
    starter_pack: {
      name: '✨ Starter Pack',
      silvCost: 1,
      contents: { coins: 500, keys: { Common: 1 }, essences: { luck_essence: 1 } },
      description: '500 coins + 1 Common key + 1 Luck Essence',
    },
    lucky_bundle: {
      name: '🍀 Lucky Bundle',
      silvCost: 5,
      contents: { keys: { Legendary: 3 }, essences: { luck_essence: 2 } },
      description: '3 Legendary keys + 2 Luck Essences',
    },
    grinder_pack: {
      name: '⚡ Grinder Pack',
      silvCost: 8,
      contents: { coins: 5_000, essences: { xp_essence: 2, aura_essence: 2 } },
      description: '5,000 coins + 2 XP Essences + 2 Aura Essences',
    },
    celestial_bundle: {
      name: '🌌 Celestial Bundle',
      silvCost: 15,
      contents: { keys: { Prismatic: 1 }, essences: { dream_essence: 1 }, badges: ['angel_badge'] },
      description: '1 Prismatic key + 1 Dream Essence + 🪽 Angel badge',
    },
    weekly_deal: {
      name: '📅 Weekly Deal',
      silvCost: 3,
      contents: { coins: 1_500, essences: { frenzy_essence: 1, flow_essence: 1 } },
      description: '1,500 coins + 1 Frenzy + 1 Flow Essence — refreshes weekly',
    },
  },

  // ── SILV SPELLS (sold here, cast in Sentinel via `,cast`) ──
  // itemId here MUST match the spell key in Sentinel's cogs/spells.py
  // (SPELL_DURATIONS / SPELL_DESCRIPTIONS). Race-locked spells are
  // sellable to anyone — Sentinel enforces the race check at cast time.
  SPELLS: {
    mute:       { name: 'Mute',       emoji: '💀', effect: 'Silence a member for 30 min + 20-30 Willpower damage.', silvCost: 2 },
    jail:       { name: 'Jail',       emoji: '💀', effect: 'Silence a member for 1h + 30-40 Willpower damage.',     silvCost: 3 },
    curse:      { name: 'Curse',      emoji: '🌀', effect: "Freeze a member's XP gains for 2 hours.",             silvCost: 3 },
    drain:      { name: 'Drain',      emoji: '🌀', effect: "Steal 5–15% of a member's Aether instantly.",         silvCost: 6 },
    shield:     { name: 'Shield',     emoji: '🪽', effect: 'Block the next spell cast against you (4h).',         silvCost: 4 },
    cloak:      { name: 'Cloak',      emoji: '🪽', effect: 'Untargetable by rob/duel/drain for 6 hours.',         silvCost: 4 },
    purify:     { name: 'Purify',     emoji: '🪽', effect: 'Remove all active debuffs from yourself instantly.',  silvCost: 5 },
    smite:      { name: 'Smite',      emoji: '🪽', effect: 'Angel only — 45m Silence + Willpower damage + drain 10% of their RP.',      silvCost: 8, raceLocked: 'angel' },
    corruption: { name: 'Corruption', emoji: '😈', effect: 'Demon only — 3h curse + drain 8% of their Aether.',   silvCost: 8, raceLocked: 'demon' },
    wrath:      { name: 'Wrath',      emoji: '🐉', effect: 'Dragon only — 1h Silence + Willpower damage + drain 12% of their Aether.',  silvCost: 8, raceLocked: 'dragon' },
    bloodlust:  { name: 'Bloodlust',  emoji: '🩸', effect: 'Vampire only — 1h Silence + Willpower damage + drain 10% of their Aether.', silvCost: 8, raceLocked: 'vampire' },
    ward:       { name: 'Ward',       emoji: '🛡️', effect: 'Halves incoming Willpower damage for 3h — but -10% RP earned while active.', silvCost: 7 },
    frenzy:     { name: 'Frenzy',     emoji: '💢', effect: '+20 to your next duel roll (consumed on use) — but a loss while active costs 20 extra Willpower.', silvCost: 6 },
    ashen_pact: { name: 'Ashen Pact', emoji: '🔥', effect: 'Demon only — instant +150 Chaos, permanent +25 Despair. No undo.', silvCost: 9, raceLocked: 'demon' },
    sanctuary:  { name: 'Sanctuary',  emoji: '✨', effect: 'Angel only — instantly clears Silence and fully restores Willpower. Own 24h cooldown.', silvCost: 9, raceLocked: 'angel' },
  },

  // ── SHOP UTILITY ITEMS (coin-priced) ───────────────────────
  UTILITY_ITEMS: {
    insurance_slip: {
      name: 'Insurance Slip',
      emoji: '🛡️',
      coinCost: 1_000,
      description: 'Negate your next gambling loss (bet returned). 1 use.',
    },
    reroll_token: {
      name: 'Reroll Token',
      emoji: '🔄',
      coinCost: 500,
      description: 'Reroll your daily minigame result once.',
    },
    lucky_charm: {
      name: 'Lucky Charm',
      emoji: '🐇',
      coinCost: 750,
      description: '+1 extra attempt in Cipher or Hangman.',
    },
    mystery_scroll: {
      name: 'Mystery Scroll',
      emoji: '📜',
      coinCost: 2_000,
      description: 'Opens to reveal a random shop item at 50% off.',
    },
    vault_key: {
      name: 'Vault Key',
      emoji: '🗝️',
      coinCost: 3_000,
      description: 'Unlock your Investment Vault early without penalty.',
    },
  },

  // ── POINTS ITEMS (SILV race system, Aether-priced) ──────────
  // Deliberately weaker/cheaper than the SILV Artifact Shop's Relics/Charms
  // (see commands/artifact.js) — same benefit+drawback shape (Rogue Lineage/
  // Deepwoken inspired), reuses the SAME effect kinds races.py's
  // _artifact_bonus() already knows how to read, so no Sentinel-side code
  // change was needed to support this catalog — it's mechanically identical
  // to an artifact as far as races.py is concerned, just sold differently
  // (common, Aether, no weekly rotation/stock limit) via .store in Shiro.
  POINTS_ITEMS: {
    frayed_rope: {
      name: 'Frayed Rope', emoji: '🪢', aetherCost: 300,
      description: 'A little extra haul from ,work/,hunt/,fish, at the cost of some Race Points.',
      effectKind: 'aether_mult', effectValue: 0.05,
      drawbackKind: 'rp_mult', drawbackValue: -0.03,
    },
    lucky_penny: {
      name: 'Lucky Penny', emoji: '🪙', aetherCost: 300,
      description: 'A little extra Race Points from everything, at the cost of some Aether income.',
      effectKind: 'rp_mult', effectValue: 0.05,
      drawbackKind: 'aether_mult', drawbackValue: -0.03,
    },
    cracked_lens: {
      name: 'Cracked Lens', emoji: '🔍', aetherCost: 250,
      description: 'Notoriety travels faster — more bounty per hit, but your rob aim suffers slightly.',
      effectKind: 'bounty_mult', effectValue: 0.08,
      drawbackKind: 'rob_success', drawbackValue: -0.03,
    },
    old_bandage: {
      name: 'Old Bandage', emoji: '🩹', aetherCost: 200,
      description: 'Willpower regenerates a little faster, but you hit a little softer in duels.',
      effectKind: 'willpower_regen', effectValue: 2,
      drawbackKind: 'duel_roll', drawbackValue: -2,
    },
    chalk_ward: {
      name: 'Chalk Ward', emoji: '⚪', aetherCost: 250,
      description: 'A touch more Order from doing good, at a small cost to Race Points.',
      effectKind: 'order_mult', effectValue: 0.06,
      drawbackKind: 'rp_mult', drawbackValue: -0.02,
    },
    ashen_coin: {
      name: 'Ashen Coin', emoji: '🖤', aetherCost: 250,
      description: 'A touch more Chaos from dark acts, but failed robs hurt more.',
      effectKind: 'chaos_mult', effectValue: 0.06,
      drawbackKind: 'despair_rob_fail_mult', drawbackValue: 0.05,
    },
  },

  // ── MISSIONS POOL ──────────────────────────────────────────
  MISSIONS_POOL: [
    { id: 'win_5_games',   label: '🎮 Win 5 minigame bets',          target: 5,  field: 'gamesWon',   reward: { coins: 500  } },
    { id: 'open_3_keys',   label: '🔑 Open 3 keys',                  target: 3,  field: 'keysOpened', reward: { coins: 300  } },
    { id: 'use_essence',   label: '✨ Use 2 essences',               target: 2,  field: 'essencesUsed', reward: { coins: 400 } },
    { id: 'daily_claim',   label: '📅 Claim your daily reward',      target: 1,  field: 'dailyClaimed', reward: { coins: 200 } },
    { id: 'win_1000',      label: '💰 Win 1,000 coins gambling',     target: 1000, field: 'coinsWon',  reward: { coins: 600, xp: 100 } },
    { id: 'trade_once',    label: '🤝 Complete a trade',             target: 1,  field: 'trades',     reward: { coins: 350 } },
    { id: 'check_profile', label: '🪞 Check your profile',           target: 1,  field: 'profileViewed', reward: { coins: 100, xp: 50 } },
    { id: 'gamble_5',      label: '🎲 Play any gambling game 5 times', target: 5, field: 'gamesPlayed', reward: { coins: 400 } },
    { id: 'silv_buy',      label: '💎 Buy any item with SILV',       target: 1,  field: 'silvSpent',  reward: { coins: 500, xp: 150 } },
    { id: 'inv_check',     label: '📦 Check your inventory',         target: 1,  field: 'invChecked', reward: { xp: 75   } },
  ],

  // ── ACHIEVEMENTS ───────────────────────────────────────────
  ACHIEVEMENTS: [
    { id: 'first_daily',    name: '🌅 First Light',         desc: 'Claim your first daily reward'       },
    { id: 'streak_7',       name: '🔥 Week Warrior',        desc: 'Reach a 7-day streak'                },
    { id: 'streak_30',      name: '🌙 Lunar Devotee',       desc: 'Reach a 30-day streak'               },
    { id: 'streak_100',     name: '⭐ Celestial Steadfast', desc: 'Reach a 100-day streak'              },
    { id: 'rich_1',         name: '💰 Coin Hoarder',        desc: 'Reach 100,000 coins'                 },
    { id: 'rich_2',         name: '🏦 Millionaire',         desc: 'Reach 1,000,000 coins'               },
    { id: 'gambler_100',    name: '🎰 High Roller',         desc: 'Play 100 gambling games'             },
    { id: 'wins_50',        name: '🏆 Victorious',          desc: 'Win 50 gambling games'               },
    { id: 'keys_opened_50', name: '🔑 Vault Raider',        desc: 'Open 50 keys total'                  },
    { id: 'silv_5',         name: '💎 SILV Holder',         desc: 'Own 5 or more SILV tokens'           },
    { id: 'silv_25',        name: '💎💎 SILV Baron',        desc: 'Own 25 or more SILV tokens'          },
    { id: 'prestige_1',     name: '🔥 Prestigious',         desc: 'Reach Prestige 1'                    },
    { id: 'level_10',       name: '📈 Level 10',            desc: 'Reach level 10'                      },
    { id: 'level_50',       name: '🚀 Level 50',            desc: 'Reach level 50'                      },
    { id: 'missions_7',     name: '📋 Mission Specialist',  desc: 'Complete 7 daily missions'           },
    { id: 'trade_1',        name: '🤝 Deal Maker',          desc: 'Complete your first trade'           },
    { id: 'invest_1',       name: '📊 Investor',            desc: 'Complete your first investment'      },
    { id: 'cf_5_streak',    name: '🪙 Coin Legend',         desc: 'Win 5 coinflips in a row'            },
    { id: 'blackjack_21',   name: '♠ Natural',              desc: 'Hit 21 in blackjack'                 },
    { id: 'essence_10',     name: '✨ Essence Adept',       desc: 'Use 10 essences total'               },
    { id: 'all_badges',     name: '🎖 Badge Collector',     desc: 'Own every available badge'           },
  ],
};