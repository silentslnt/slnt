// utils/sentinelDb.js — writes to Sentinel's PostgreSQL for community points
// Shiro stays on MongoDB for its own data. This is a one-way bridge:
// gambling wins → member_points table in Sentinel's Postgres.
//
// Required Railway variable on Shiro: SENTINEL_DB_URL
// Value = the DATABASE_URL from Postgres-sentinel (internal URL)

const { Pool } = require('pg');

let _pool = null;

function _getPool() {
  if (!_pool) {
    const url = process.env.SENTINEL_DB_URL;
    if (!url) return null;
    _pool = new Pool({
      connectionString: url,
      ssl: { rejectUnauthorized: false },
      max: 3,
    });
    _pool.on('error', () => {}); // suppress unhandled rejection on disconnect
  }
  return _pool;
}

/**
 * Award community points in Sentinel's member_points table.
 * Silent no-op if SENTINEL_DB_URL is not set or DB is unreachable.
 */
async function awardPoints(guildId, userId, points) {
  if (!points || points <= 0) return;
  const pool = _getPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO member_points (guild_id, user_id, points)
       VALUES ($1, $2, $3)
       ON CONFLICT (guild_id, user_id)
       DO UPDATE SET points = member_points.points + EXCLUDED.points`,
      [guildId.toString(), userId.toString(), points],
    );
  } catch (err) {
    // Non-critical — never crash Shiro if Sentinel DB is down
    console.error('[sentinel-db] awardPoints failed:', err.message);
  }
}

/**
 * Read a member's current Aether (member_points.points) — needed now that
 * Shiro's new .store hub sells Aether-priced items (bait, points items)
 * and has to check/display a real balance, not just add to it. Returns 0 if
 * unreachable — callers must treat that as "can't afford it" (fail closed),
 * never as "they have infinite/unknown Aether."
 */
async function getPoints(guildId, userId) {
  const pool = _getPool();
  if (!pool) return 0;
  try {
    const res = await pool.query(
      `SELECT points FROM member_points WHERE guild_id=$1 AND user_id=$2`,
      [guildId.toString(), userId.toString()],
    );
    return res.rows[0]?.points || 0;
  } catch (err) {
    console.error('[sentinel-db] getPoints failed:', err.message);
    return 0;
  }
}

/**
 * Atomically deduct Aether if (and only if) the member has enough — the
 * `points >= $3` guard in the WHERE clause means this can never take a
 * balance negative even under concurrent spends, mirroring the same
 * atomic-reservation pattern used for artifact/exchange stock. Returns
 * true if the deduction happened, false if they couldn't afford it or the
 * DB was unreachable (fail closed either way).
 */
async function spendPoints(guildId, userId, amount) {
  if (!amount || amount <= 0) return true;
  const pool = _getPool();
  if (!pool) return false;
  try {
    const res = await pool.query(
      `UPDATE member_points SET points = points - $3
       WHERE guild_id=$1 AND user_id=$2 AND points >= $3`,
      [guildId.toString(), userId.toString(), amount],
    );
    return res.rowCount > 0;
  } catch (err) {
    console.error('[sentinel-db] spendPoints failed:', err.message);
    return false;
  }
}

/**
 * Grant fishing bait directly into Sentinel's member_races.fishing_bait —
 * lets Shiro's .store sell bait without duplicating races.py's fishing
 * logic, same "push a live write over the bridge" pattern as everything
 * else here. Silent no-op if unreachable (caller should not have already
 * deducted Aether when this fails — see .store's buy handler).
 */
async function addFishingBait(guildId, userId, amount) {
  if (!amount || amount <= 0) return false;
  const pool = _getPool();
  if (!pool) return false;
  try {
    // rowCount stays 0 if the member has no member_races row at all (never
    // picked a race in Sentinel) — callers MUST treat that as failure and
    // refund the Aether they already deducted, not silently eat the charge.
    const res = await pool.query(
      `UPDATE member_races SET fishing_bait = fishing_bait + $3
       WHERE guild_id=$1 AND user_id=$2`,
      [guildId.toString(), userId.toString(), amount],
    );
    return res.rowCount > 0;
  } catch (err) {
    console.error('[sentinel-db] addFishingBait failed:', err.message);
    return false;
  }
}

/**
 * Grant an item into Sentinel's user_inventory table (used for spells).
 * Silent no-op if SENTINEL_DB_URL is not set or DB is unreachable.
 */
async function grantItem(guildId, userId, item, qty = 1) {
  if (!item || qty <= 0) return;
  const pool = _getPool();
  if (!pool) return;
  try {
    await pool.query(
      `INSERT INTO user_inventory (guild_id, user_id, item, quantity)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (guild_id, user_id, item)
       DO UPDATE SET quantity = user_inventory.quantity + EXCLUDED.quantity`,
      [guildId.toString(), userId.toString(), item, qty],
    );
  } catch (err) {
    console.error('[sentinel-db] grantItem failed:', err.message);
  }
}

/**
 * Read a user's owned item ids (quantity > 0) from Sentinel's user_inventory.
 * Returns [] if SENTINEL_DB_URL is not set or DB is unreachable — callers
 * must treat that as "unknown", not "owns nothing", where it matters.
 */
async function getOwnedItems(guildId, userId) {
  const pool = _getPool();
  if (!pool) return [];
  try {
    const res = await pool.query(
      `SELECT item FROM user_inventory WHERE guild_id=$1 AND user_id=$2 AND quantity > 0`,
      [guildId.toString(), userId.toString()],
    );
    return res.rows.map(r => r.item);
  } catch (err) {
    console.error('[sentinel-db] getOwnedItems failed:', err.message);
    return [];
  }
}

/**
 * Remove an item entirely from a user's Sentinel inventory (admin tool —
 * e.g. clearing a Relic so a player can swap to a different one).
 */
async function removeItem(guildId, userId, item) {
  const pool = _getPool();
  if (!pool) return false;
  try {
    await pool.query(
      `DELETE FROM user_inventory WHERE guild_id=$1 AND user_id=$2 AND item=$3`,
      [guildId.toString(), userId.toString(), item],
    );
    return true;
  } catch (err) {
    console.error('[sentinel-db] removeItem failed:', err.message);
    return false;
  }
}

/**
 * Push an artifact's mechanical effect into Sentinel's artifact_effects
 * table — this is what races.py's _artifact_bonus() actually reads, so an
 * edit here takes effect immediately with no Sentinel redeploy. Mongo's
 * ArtifactPool keeps its own copy of these same fields for display in the
 * shop/panel; this call is what keeps Sentinel's copy live instead of
 * requiring races.py's ARTIFACT_EFFECTS dict to be hand-edited in sync.
 */
async function setArtifactEffect(itemId, tier, effectKind, effectValue, drawbackKind, drawbackValue) {
  const pool = _getPool();
  if (!pool) return false;
  try {
    await pool.query(
      `INSERT INTO artifact_effects (item_id, tier, effect_kind, effect_value, drawback_kind, drawback_value)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (item_id) DO UPDATE SET
         tier = $2, effect_kind = $3, effect_value = $4, drawback_kind = $5, drawback_value = $6`,
      [itemId, tier || null, effectKind || null, effectValue || 0, drawbackKind || null, drawbackValue || 0],
    );
    return true;
  } catch (err) {
    console.error('[sentinel-db] setArtifactEffect failed:', err.message);
    return false;
  }
}

/**
 * Read the live spell description/duration/race-lock text Sentinel owns
 * (spells.py SPELL_DESCRIPTIONS, pushed into spell_display on every
 * cog_load). Returns {} if unreachable — callers should fall back to their
 * own static copy rather than break the shop display when Sentinel's DB
 * is down.
 */
async function getSpellDisplay() {
  const pool = _getPool();
  if (!pool) return {};
  try {
    const res = await pool.query(`SELECT item_id, description, duration_sec, race_locked FROM spell_display`);
    const out = {};
    for (const row of res.rows) out[row.item_id] = row;
    return out;
  } catch (err) {
    console.error('[sentinel-db] getSpellDisplay failed:', err.message);
    return {};
  }
}

/**
 * Read every unclaimed row from Sentinel's pending_silv_grants table (races.py
 * ,fish's astronomically-rare SILV token drop — Sentinel can't credit SILV
 * itself since that's Shiro's Mongo-side currency, so it just records the
 * grant and leaves it for this side to actually deliver) and mark them
 * claimed in the same pass. Returns [] if unreachable or empty — callers
 * must not retry claiming, since marking-claimed already happened here.
 */
async function claimPendingSilvGrants() {
  const pool = _getPool();
  if (!pool) return [];
  const client = await pool.connect().catch(() => null);
  if (!client) return [];
  try {
    await client.query('BEGIN');
    const res = await client.query(
      `SELECT id, user_id, amount, source FROM pending_silv_grants
       WHERE claimed = FALSE FOR UPDATE SKIP LOCKED`,
    );
    if (res.rows.length) {
      const ids = res.rows.map(r => r.id);
      await client.query(
        `UPDATE pending_silv_grants SET claimed = TRUE WHERE id = ANY($1::bigint[])`,
        [ids],
      );
    }
    await client.query('COMMIT');
    return res.rows.map(r => ({ userId: r.user_id.toString(), amount: r.amount, source: r.source }));
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('[sentinel-db] claimPendingSilvGrants failed:', err.message);
    return [];
  } finally {
    client.release();
  }
}

module.exports = {
  awardPoints, grantItem, getOwnedItems, removeItem, setArtifactEffect, getSpellDisplay,
  claimPendingSilvGrants, getPoints, spendPoints, addFishingBait,
};
