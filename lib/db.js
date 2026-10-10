'use strict';
const { Pool } = require('pg');

// The Neon/Vercel Postgres integration provides POSTGRES_URL. Accept it when DATABASE_URL is not set.
if (!process.env.DATABASE_URL && process.env.POSTGRES_URL) process.env.DATABASE_URL = process.env.POSTGRES_URL;

let pool;

function isLocal(url) {
  try {
    const h = new URL(url).hostname;
    return h === 'localhost' || h === '127.0.0.1' || h === '::1';
  } catch (e) {
    return false;
  }
}

function getPool() {
  if (pool) return pool;
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set');
  pool = new Pool({
    connectionString: url,
    // Hosted Postgres providers require TLS. Local development does not.
    ssl: isLocal(url) ? false : { rejectUnauthorized: false },
    // One connection per serverless instance keeps us under provider limits.
    max: process.env.VERCEL ? 1 : 5,
    idleTimeoutMillis: 10000,
    connectionTimeoutMillis: 8000,
  });
  pool.on('error', (err) => console.error('pg pool error:', err.message));
  return pool;
}

function query(text, params) {
  return getPool().query(text, params);
}

// Runs fn(client) inside a transaction.
async function tx(fn) {
  const client = await getPool().connect();
  try {
    await client.query('begin');
    const out = await fn(client);
    await client.query('commit');
    return out;
  } catch (err) {
    try { await client.query('rollback'); } catch (e) { /* ignore */ }
    throw err;
  } finally {
    client.release();
  }
}

// Fixed-window counter stored in Postgres, so limits hold across serverless instances.
// Returns true when the caller is still within the limit.
async function rateLimit(key, max, windowSeconds) {
  const { rows } = await query(
    `insert into rate_limits (key, window_start, count) values ($1, now(), 1)
     on conflict (key) do update set
       window_start = case when rate_limits.window_start < now() - make_interval(secs => $2::double precision)
                           then now() else rate_limits.window_start end,
       count = case when rate_limits.window_start < now() - make_interval(secs => $2::double precision)
                    then 1 else rate_limits.count + 1 end
     returning count`,
    [key, windowSeconds]
  );
  return rows[0].count <= max;
}

async function close() {
  if (pool) { await pool.end(); pool = undefined; }
}

module.exports = { query, tx, rateLimit, close };
