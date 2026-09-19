# CLAUDE.md — Shiro Bot Context File

## What This Bot Is
Shiro is a Discord economy bot built for a large, active server. It runs a full virtual economy
Shiro — Archcat ( Created by Silent )
Guardian of SILV, watcher of fortune and risk.

Those who play here are beneath Shiro’s gaze.
centered around **SILV tokens** — a premium currency where **1 SILV = 10 Robux**. The shop is
designed to make SILV so valuable in-game that members rarely choose to cash out to Robux.
The bot is owned and operated by **silentslnt** (gibbs).

---

## Stack
- **Runtime:** Node.js
- **Library:** discord.js v14
- **Database:** MongoDB Atlas (Mongoose ODM)
- **Hosting:** Railway (auto-deploys from GitHub on push)
- **Prefix:** `.` (dot)
- **Bot username:** Shirokotsu#3881

---

## Repo & Hosting
- **GitHub:** https://github.com/silentslnt/slnt
- **Local path:** `C:\Users\gibbs\Downloads\Projects\slnt`
- **DB Cluster:** `kon.ghu3wok.mongodb.net`
- **DB Name:** `kon`
- **DB User:** `slntsilent`
- **Railway env vars:** `DISCORD_TOKEN`, `MONGO_URI`, `PORT=3000`

---

## File Structure
```
slnt/
├── commands/          ← one file per command
├── models/
│   └── User.js        ← full user schema
├── utils/
│   ├── config.js      ← ALL constants and item defs (edit this first)
│   ├── permissions.js ← isAdmin(), requireAdmin()
│   ├── parseBet.js    ← handles "all" / "max" bets
│   ├── essences.js    ← essence activation + multipliers
│   ├── xp.js          ← level math, addXP(), progressBar()
│   ├── achievements.js← auto-checks + announces achievements
│   ├── prestige.js    ← rank lookups, passive income
│   └── commandRegistry.js ← alias map, public vs admin sets
├── index.js
├── package.json
└── .gitignore         ← must contain .env and node_modules/
```

---

## Permission System
**Non-admin (anyone):**
.bal .b .leaderboard .lb .profile .pf .inventory .inv .achievements .ach .daily .day .missions .ms .help .h .redeem .rd, dueling, rolling, battling, shop, 

**Admin-only:** All gambling, gifting, and all .admin commands.

**Admin Role ID:** 1454818862397653074
**Admin User IDs:** 1432513881653121047, 1349792214124986419, 730860363884527646

---

## Economy Overview

### Currencies
- Coins (main, earned through games/dailies)
- SILV Tokens — 1 SILV = 10 Robux (premium, shop-focused)
- Fragments — planned (100 = 1 SILV)
- Celestial Dust — planned (from Prismatic/Mythical keys)

### Key Config Values
```js
ADMIN_ROLE_ID:      '1454818862397653074'
KEYDROP_CHANNEL_ID: '1472342562093404324'
GAME_CHANNEL_ID:    '1401925188991582338'
SILV_TOKEN_KEY:     'Silv token'
MAX_BET:            50_000
GIFT_DAILY_CAP:     10_000
INVESTMENT_CAP:     5_000
INVESTMENT_RETURN:  1.10
```

---

## Shop (most important feature)
Designed so SILV is almost always more valuable spent in-game than cashed to Robux.

Sections: essences / bundles / cosmetics / utility / admin items

### Essences
| ID | Effect | Duration | Cost |
|---|---|---|---|
| xp_essence | 2x XP | 1h | 2 SILV |
| echo_essence | 2x message rewards | 1h | 2 SILV |
| aura_essence | 2x coin gains | 30m | 3 SILV |
| frenzy_essence | 2x minigame payouts | 30m | 3 SILV |
| luck_essence | +15% gambling win | 1h | 5 SILV |
| flow_essence | 50% cooldown reduction | 1h | 4 SILV |
| key_essence | 3x key drop rate | 2h | 6 SILV |
| dream_essence | 50 passive coins/hr | 4h | 4 SILV |

---

## Progression
- XP & Levels — every game, daily, mission. Level-up announced in channel.
- Prestige Ranks — 6 ranks (Wanderer to Ascendant) based on total coins earned.
- Daily Streak — 1x to 3x multiplier. Day 7: +1000 coins + key. Day 28: +10000 + 1 SILV.
- Missions — 3 daily missions seeded by date. Reward coins + XP.
- Achievements — 22 auto-tracked. Announce on unlock.
- Investment Vault — lock up to 5000 coins 24h, collect 10% profit.

---

## Gambling 
- .blackjack / .bj — natural 21 = 2.5x, Insurance Slip negates loss
- .slots / .sl — jackpot pool grows 5% per bet, triple diamond wins it
- .coinflip / .cf — 5-flip streak = +50% bonus
- .roulette / .rl
- .dice / .d
- .rps
- .highlow / .hl
- .minesweeper / .mine

---

## Key Rarities
- Prismatic 0.5% — 800-2000 coins
- Mythical 1.5% — 500-1500 coins
- Legendary 8% — 300-1000 coins
- Rare 20% — 150-600 coins
- Uncommon 35% — 75-300 coins
- Common 35% — 25-150 coins

Keydrop: 2.5% chance per message in keydrop channel. Toggleable with .tkd.

---

## Embed Style
- Default color: #F5E6FF (lavender)
- Win: #C1FFD7 | Loss: #FFB3C6 | Warning: #FFD580 | Prestige: #FFD700
- Title format: ˗ˏˋ 𐙚 TITLE 𐙚 ˎˊ˗
- Flavor text: ꒰ঌ text here ໒꒱
- Progress bars: ▓▓▓▓▓░░░░░
- Font: Fraktur 𝔎𝔬𝔫 for titles, Double-Struck 𝕂𝕠𝕟 for sub-labels

---

## Deploy a Change
```bash
git add .
git commit -m "describe change"
git push origin main
```
Railway auto-redeploys in ~60-90 seconds.

---

## Common Gotchas
- MONGO_URI password has @ in it — encode as %40
- MongoDB Atlas must allow 0.0.0.0/0 for Railway
- Never push .env to GitHub
- All config lives in utils/config.js — change there, not in command files
- saveUserData = current user only. saveSpecificUserData(userId, data) for others.

---

## Pending Features
- Random events system (Celestial Rain, Key Storm, Double Down Hour, Meteor Drop)
- Fragments + Celestial Dust currencies
- Passive income cron (hourly tick)
- Prestige mode (reset coins for Prestige Points)
- Clan/Crew system
- Seasonal events
- Fix: client.once('ready') -> client.once('clientReady')
- Delete stray pakage.json typo file from repo