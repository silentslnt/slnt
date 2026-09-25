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
- Missions — 3 daily missions seeded by date, reward coins + XP. **Fixed a long-standing bug**: `commands/missions.js` only ever read `missionProgress[id].progress`, but nothing anywhere ever wrote to it from actual gameplay — every mission's progress bar was permanently stuck at 0/N regardless of what anyone did. `utils/missions.js` (`syncMissionProgress`) is now the single source of truth: derives today's progress as `(current lifetime stat) - (stat value snapshotted at the start of today)`, called from `checkAchievements()` (persists it) and `getUserData()` in index.js (rolls the day over BEFORE any command can mutate a stat, avoiding an off-by-one on the first action of a new day).
- Achievements — 22 auto-tracked. Announce on unlock. Same call site (`checkAchievements`) now also drives mission progress — see above.
- Investment Vault — lock up to 5000 coins 24h, collect 10% profit.
- Artifact Shop (`.artifact` / `.ashop`) — rare, time-gated P2W item rotation. Opens Friday 6PM UTC → Sunday midnight UTC (pure function of current time in `utils/artifactSchedule.js`, no cron dependency, self-heals across restarts). Only a random 2-5 item subset of the admin-managed pool (`ArtifactPool` in `models/artifact.js`) rolls into stock each window, each with a tiny fixed stock reserved atomically (`ArtifactWindow` + MongoDB `$gt: 0` guard) so two concurrent buyers can never both claim the last unit. Pool management (`.artifact add/remove/pool`) is whitelist-only since it defines what money can buy from nothing.

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
- .mines / .duel / .gift / .tip / .invest

**All 14 of the above (plus .duel/.gift/.tip/.invest) had a regression where every one of them required the PLAYER to already be a Discord admin just to run the command** (`adminOnly: true` + `requireAdmin()` at the top of `execute()` — reported by a player getting "Access Denied" on `.hl`). This was pure mistake, not intended — none of these need an admin check; `parseBet()`'s `MAX_BET` cap was always the real anti-abuse limit. Fixed by removing the gate from all 14 files. `lottery.js`'s `requireAdmin` on its `draw` subcommand only is correct and was left alone. **Lesson for future permission-check passes: always ask "who is this command FOR" before adding a gate — a batch fix must be sanity-checked file by file, not applied uniformly.**

`dice.js`, `hl.js`, `minesweeper.js`, and `rps.js` also never called `trackStat`/`checkAchievements` at all — zero stats, zero achievements, zero mission progress from those 4 games. Fixed to match the other 6 (gamesPlayed/gamesWon/coinsWon tracked consistently across all 10 gambling games now).

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
**Reskinned mid-session to match Sentinel's Bleed style** — this is now the canonical style for any NEW or edited embed:
- Color: `0x000000` (black) always, not the old lavender
- Plain ALL-CAPS titles (no decorative unicode brackets/fonts in titles — custom emoji and fancy fonts don't render reliably in embed titles anyway)
- `__**Label**__` for section headers in the description body
- `> text` blockquotes for body content
- `-# text` for small footnotes
- Real custom server emojis in the body — never generic/random ones
- **Reskin complete** as of 2026-09-20 — every command file uses this style: shop.js, help.js, bal.js, daily.js, achievements.js, leaderboard.js, missions.js, invest.js, profile.js, duel.js, gift.js, blackjack.js, slots.js, coinflip.js, roulette.js, dice.js, rps.js, hl.js, minesweeper.js, mines.js, plinko.js, trade.js, tip.js, lottery.js, adminlogs.js, inventory.js, open.js, claim.js, mysterybox.js, prefix.js, togkey.js, cipher.js, characters.js, guess.js, testrole.js, commands.js, hangman.js, ws.js, keydrop.js, characterroll.js, battle.js.
- **Still old style** (shared utilities, not per-command files): `utils/permissions.js`'s deny embed, `utils/achievements.js`'s achievement-unlock embed. Reskin these if touched next.
- hangman.js's ASCII gallows art was literally empty placeholder backticks (7 identical blank blocks) before this pass — added real progressive stage art.
- Old style for reference (now legacy, don't use for new work): Win #C1FFD7 / Loss #FFB3C6 / Warning #FFD580 / Prestige #FFD700, title format `˗ˏˋ 𐙚 TITLE 𐙚 ˎˊ˗`, flavor text `꒰ঌ text here ໒꒱`

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
- Before adding a permission check to a command, ask "who is this FOR" — a batch fix that mechanically adds `requireAdmin`/`adminOnly` to a list of files must be sanity-checked per file. All 14 gambling/economy commands got locked to admin-only by mistake this way; see Gambling section.
- Verify a feature end-to-end (bought → delivered → actually consumed by the thing it's supposed to affect) before building more on top of it. Cloak (Sentinel spell) and the missions progress system were both fully wired UI-and-purchase-wise but silently did nothing underneath for a long time.
- Any new spell/item added in Sentinel's `cogs/spells.py` needs a matching entry in this repo's `utils/config.js` SPELLS in the same pass, or it exists with zero purchase path (happened with Wrath/Bloodlust).

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
## Sentinel RPG bridge — premium gear (`.store gear`)
`commands/store.js` `PREMIUM_GEAR` sells Sentinel gear for SILV, delivered to Sentinel's `user_inventory` as `gear_<id>` via `grantItem` (SILV refunded if delivery fails). ids must match Sentinel's `cogs/gear.py` `GEAR`. Sentinel also now has `,exchange` (Aether → SILV via `pending_silv_grants`), closed by default — the owner opens it with Sentinel's `,shopset price silv_token <aether>`.
