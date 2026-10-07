'use strict';
const fs = require('fs');
const path = require('path');
const db = require('../lib/db');

async function migrate() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf8');
  await db.query(sql);
  console.log('Schema is up to date.');
}

module.exports = { migrate };

if (require.main === module) {
  migrate()
    .catch((err) => { console.error('Migration failed:', err.message); process.exitCode = 1; })
    .finally(() => db.close());
}
