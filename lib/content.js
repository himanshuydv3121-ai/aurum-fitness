'use strict';
const db = require('./db');
const { route } = require('./http');

const CACHE = 'public, s-maxage=30, stale-while-revalidate=120';

// Read-only list endpoints for site content.
function listRoute(sql, key) {
  return route({
    GET: async () => {
      const { rows } = await db.query(sql);
      return { body: { [key]: rows }, opts: { cache: CACHE } };
    },
  });
}

module.exports = { listRoute };
