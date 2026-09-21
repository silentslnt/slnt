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

module.exports = { awardPoints, grantItem, getOwnedItems, removeItem, setArtifactEffect };
