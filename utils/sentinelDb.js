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

module.exports = { awardPoints, grantItem };
