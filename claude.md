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
## Who sells what (rule: one place per currency)
- **Shiro `.sh`** — Shiro's own economy: essences, bundles, cosmetics, utility, admin items. Button hub; each section replaces the hub in place with a Back button.
- **Shiro `.store`** — SILV-priced items for Sentinel's RPG: Spells, premium Gear (+ Revive Token). Same in-place hub. Points Items (Aether trinkets) were moved OUT to Sentinel's `,shop` → Trinkets; `.store items` points there.
- **Shiro `.artifact`** — the weekend Artifact Shop (Fri 18:00 → Sun 23:59 UTC, random stock). Sentinel's `,shop` → Premium and `,guide` mention it.
- **Shiro `.convert`** — coins → SILV (100k, 5/day) and SILV → Aether (10k/SILV). The only coins→Aether path: `.sh aether` packs were removed (they were a second, inconsistent rate).
- **Sentinel `,shop`** — everything priced in Aether (gear, potions, bait, lures, rods, trinkets) + a Premium page that lists the SILV items and says to buy them with `shiro store`.

## Sentinel RPG bridge — premium gear (`.store gear`)
`commands/store.js` `PREMIUM_GEAR` sells Sentinel gear for SILV, delivered to Sentinel's `user_inventory` as `gear_<id>` via `grantItem` (SILV refunded if delivery fails). ids must match Sentinel's `cogs/gear.py` `GEAR`, and Sentinel's `PREMIUM_SILV` list (shown on its `,shop` Premium page) must be kept in sync by hand. Sentinel has NO Aether → SILV path (SILV = 10 Robux).

## SILV conversion (`.convert`, commands/convert.js) — CV2 card
- Coins → SILV: `COINS_PER_SILV` = 100,000 coins per SILV, `COIN_TO_SILV_DAILY_CAP` = 5/day (tracked on `userData.silvConvert`). `.rate` reads the same constant.
- SILV → Aether: `AETHER_PER_SILV` = 10,000, one-way into Sentinel via `awardPoints` (returns true/false; SILV is refunded on failure).

## UI rules
- `utils/cv2patch.js` (required at the top of index.js) converts every `{ embeds: [...] }` send/reply/edit/update/followUp into a Components V2 container automatically, falling back to the embed if Discord rejects it. New commands should still build CV2 directly (ContainerBuilder/SectionBuilder) — see `commands/convert.js`.
- **Never flood the channel.** A button press edits the card it's on (`interaction.update`) or answers ephemerally — it never posts a new public message. `utils/shopUI.js` `sendShopUI({ interaction, onBack })` opens a shop section in place of the hub card; collectors filter by customId prefix so a hub and its section never double-handle a click; a collector's `end` only strips buttons on `time`, not on navigation. Games edit their own card for results (blackjack does now).

## Casino rules (house edge — `utils/houseEdge.js`)
Every house game returns LESS than it takes on average, even with essences. A winner got lucky; the house wins over time.
- Frenzy = +5% of WINNINGS (profit only) in casino games; Luck = +1 point win chance; Aura never touches casino payouts. Use `casinoPayout(bet, gross, userData)` / `casinoLuck(userData)` in every casino game.
- Returns (checked by simulation): coinflip 94% (47% × 2), blackjack ~94%, dice 85%, rps ~92% (win 1.9×, draw refunds 85%), roulette ~95–97% (number 35×, green 17×), slots ~68% + jackpot, plinko ~94% (big multipliers on the edges only — the old tables paid 110/143/408%), mines 94% (one fixed board: 6 mines — no difficulty picking), minesweeper 92% of fair odds, crash 94%, tower 94%, cups 93%, wheel 91%, over/under 94%.
- Coinflip is a fair 50/50 with a 10% fee off the winnings (shown to the player as "fee", never as "house"); streak bonus is 25% of the bet every 5 wins. ~95% return.
- **Casino ledger** (`utils/houseBank.js`, `.house` — trusted list / OWNER_ID only): every casino round calls `recordRound(game, bet, payout, fee)` (settle() does it for the CV2 games). Stored in the Mongo `Meta` collection under `house_bank`; it is NOT a user balance and never appears on leaderboards or `.bal`.
- Hi-Lo (`.hl`) was removed — it paid ~115% with basic play.
- New CV2 games share `utils/casino.js` (`takeBet` / `settle` on fresh user data, `card` builder): `.crash`, `.tower`, `.cups`, `.wheel`, `.ou`.


## Casino integrity (direct: "there should be no payout or easy money methods whatsoever")
- **Balances are written as changes, never absolutes.** `index.js makeSaver(userId, userData)` is every command's `saveUserData`: a `balance` in the update becomes `$inc` of (new − the value this command loaded); a spend the live balance can't cover throws `InsufficientFunds` (answered, not logged as an error). Long games (blackjack, crash, tower, mines, cups…) used to write back a balance read minutes earlier and erase anything that happened meanwhile — play coinflip while a blackjack hand is open and the old balance came back (24 → 150).
- `utils/casino.js` `takeBet` is an atomic conditional `$inc` (`balance >= bet`); `settle` pays with `$inc`.
- **Fair shuffles only** — `utils/shuffle.js` (Fisher–Yates + `crypto.randomInt`). `sort(() => Math.random() - 0.5)` is biased: Tower's Easy door 2 was a trap 19% of the time instead of 33% and Hard door 3 50% instead of 67%, so always picking them beat the house. Never use the sort trick.
- Blackjack settles once (`busy`/`settled`/`finalized` flags): two fast reactions used to run the dealer's turn and pay twice.
- **`.history [@user] [game]`** (aka hist/record/gamblelog) — the player's last 200 rounds (`CasinoRound` in utils/houseBank.js, written by `recordRound(game, bet, payout, fee, userId)`; every game passes the user id): net, W/L, win-rate bar, streak, best/worst, per-game net, recent rounds.
- **SILV grants from Sentinel** (`claimPendingSilvTokens` in index.js): credit `inventory['Silv token']` — it used to add them to the COIN balance by mistake (fishing SILV paid as coins). Sources: fishing drop, `invite:<userId>` (Sentinel's invite reward, 1 SILV per validated recruit), `dungeon:<gate>` (1–2 SILV rarely found in Sentinel's B/A/S-rank dungeon chests); the DM names the source.
- **`.bal` is the profile card** (commands/bal.js, CV2): header with avatar, tab row (Overview · Game history · Stats · Bag), body. Overview = coins, SILV, level/rank/XP bar, streak, total earned, casino net over the last 200 rounds; Game history = `history.js historyCard(target, game, guild, rows)` (shared with `.history`); Stats = stats + recent achievements; Bag = SILV, keys, items, characters. Only the opener switches tabs (5 min), others open their own.

## Payouts (`.payout`, commands/payout.js, models/payout.js)
SILV → Robux, no staff judgement needed. 100 SILV = 1,000 Robux (`ROBUX_PER_SILV` 10), minimum `MIN_SILV` 100.
- Player: `.payout` card → **Request payout** → form (SILV amount + gamepass link, `PASS_RE`) → the bot shows the exact gamepass price
  (`priceFor`: the payout amount, or ÷0.7 to cover Roblox's 30% when `.payout fee on`) → **Confirm** checks the pass with Roblox's
  product-info API (price must match, must be on sale; Roblox unreachable = allowed but flagged "not verified").
- Confirm = ONE guarded atomic debit of the SILV into escrow (`utils/atomicInv.debit`), then a `Payout` doc (unique partial index: one open
  request per player AND per gamepass), then the request card is posted in the payout channel pinging the notify role. Any failure after the
  debit refunds it.
- Staff card buttons `po_paid:<id>` / `po_rej:<id>` are routed in index.js `interactionCreate` (work after restarts). Status changes are atomic
  `open → paid|rejected|cancelled`, so a double click can't pay or refund twice. Reject asks for a reason, refunds, DMs. Paid DMs the player.
  Who can press them: `ADMIN_USER_IDS`, Manage Server, or the notify role.
- The player can Cancel while it's open (refund). Last 5 requests shown on their card.
- Owner: `.payout setup #channel @role`, `.payout fee on|off`, `.payout open|close`.

## Atomic writes (no lost updates)
- `getUserData` tags `inventory` with a hidden snapshot (`INV_BASE`); every save (`makeSaver`, `saveSpecificUserData`) goes through
  `applyUserUpdate`, which writes inventory as per-key `$inc` deltas and refuses a spend the real bag can't cover (`InsufficientFunds`).
  Never `$set` a whole `inventory` again, and never copy it (`{...inv}` loses the snapshot and logs a warning).
- Other players' balances are never written as absolute numbers: trade, duel, gift, silvexchange, convert, cipher/guess rewards use
  `utils/atomicInv` (`debit` = guarded `$gte` + `$inc`, `credit` = `$inc`).


## Owner panel, game floor, wallet
- **`.shiroset`** (aka sset/econpanel/shiropanel, trusted list / OWNER_ID): one card — Home (house + log status), **House** (ledger by game, taxes, **Adjust balance…** via `houseBank.adjustHouse`, Reset), **Players** (UserSelect → wallet; Give/Take coins and SILV via `atomicInv` credit/debit, every change logged), **Logs** (set the economy log channel by ChannelSelect, shows the live-wins channel, last 10 actions). `.house` still works.
- **`client.runAs(interaction, name, args)`** (index.js `runCommandAs`): runs any command as the clicker with the normal context (lock, atomic saver) — how cards launch games without typing.
- **`.play`** (aka casino/games/hub): the casino floor — game select → bet buttons (100 · 1k · 5k · 10k · 50k · All in · Custom…) → side buttons where the game has one (coinflip, roulette, rps) → Play runs the game via `runAs`.
- **`.bal` wallet row** on your own card: Play · Convert · Payout · Daily (each via `runAs`); only the owner can press them.
- **SILV → coins** in `.convert`: 1 SILV = 100,000 gross, **50% tax** to the house (`houseBank.creditHouse(tax, 'silv_exchange')`, shown under Taxes).
- **No difficulty picking**: Mines is one board (6 mines, 6% edge; the card no longer counts revealed mines as safe tiles after a cash-out), Plinko always the high table, Minesweeper always 12 tiles / 4 mines.
- **Live pulls**: `winAnnouncer.announcePull(client, {userId, prize, source})` posts to the live-wins channel (`/setup wins`) — Mystery Box SILV. Sentinel posts its own pulls (fishing / dungeon / S-Gate SILV, mythic gear) in its main channel.
- **Logs**: every SILV claimed from Sentinel (`claimPendingSilvTokens`, with the source), Mystery Box SILV, monthly daily SILV and every `.shiroset` action go through `logAdminAction` → the economy log channel.

## Trade window (commands/trade.js)
`.trade @user` → Accept/Decline request (60s) → ONE shared CV2 window both players drive: **Add items** (ephemeral pick from your own bag → modal for how many, 0 removes), **Coins…** (modal, checked against your balance), Clear my offer, Confirm / Unconfirm, Cancel. Any change clears both confirmations. Both confirm → status locks synchronously, then `atomicInv.debit` side A, debit side B (on failure A is credited back), credit both (+`stats.trades`), logged via `logAdminAction`. One open trade per player (`activeTrades`, seats reserved at request time), 5 min idle closes it, `.trade cancel` closes a stuck one. No tax.

## SILV store purchases (commands/store.js)
Spells and premium gear (`PREMIUM_GEAR`: 4 Mythic at 60 SILV — Heaven's Edge, Aegis of the Seraph, Eye of the Abyss, Greatsword of Ruin — and 7 Legendary at 25 — Bloodthorn Blade, Dragonhide, Crown of Thorns, Twin Shadow Daggers, Gatebreaker Mail, Castle Lord's Signet, Colossus Heart; ids must match Sentinel's `cogs/gear.py GEAR`) are bought with a guarded `atomicInv.debit` of `Silv token`; a failed Sentinel delivery credits the SILV back automatically (spells too — no more "contact an admin"). Never use the Unicode-15 🪽 in component emojis (it broke cards) — 🕊 instead.

## Casino card system (utils/casino.js)
- `gameResult(opts)` — every finished game: `# headline`, `>` lines, WIN/LOSE accent, footer; `opts.replay = { game, bet, extra, picks }` adds **Again · Double · Half · Casino floor** (and a pick row: heads/tails, red/black/green, rock/paper/scissors). `attachReplay(msg, uid, opts)` wires it (owner only, `client.runAs` → the real command, same checks/atomic bets); after 2 min it edits to `opts.final()` (games with their own board) or the card without buttons.
- Rebuilt on `takeBet`/`settle` (atomic, never overwrites balances): Blackjack (buttons Hit/Stand/Double down, no reactions; Insurance Slip debited atomically on a bust), Mines (board inside the card; left alone = cash out, or refund before the first dig), Minesweeper (12 tiles/4 mines, button board; refund ONLY before the first pick — the old `cancel` refunded mid-board, an exploit).
- Coinflip, dice, rps, roulette, slots, plinko keep their money code but end on `gameResult` with frame animations; crash/tower/cups/wheel/over-under got the replay row.
- `utils/cv2patch.js` (every other embed): SHOUTED titles become Title Case, inline fields collapse into one `**Name** value · …` strip, block fields render as `__**Name**__` + `>` lines.
