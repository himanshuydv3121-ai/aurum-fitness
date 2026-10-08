'use strict';
// Sets the admin password from ADMIN_EMAIL and ADMIN_PASSWORD, creating the account if needed.
// Use it if the owner is locked out: ADMIN_EMAIL=you@x.com ADMIN_PASSWORD=... npm run admin:reset
const db = require('../lib/db');
const auth = require('../lib/auth');

async function main() {
  const email = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || '';
  if (!email || password.length < 10) throw new Error('Set ADMIN_EMAIL and an ADMIN_PASSWORD of at least 10 characters.');
  const hash = await auth.hashPassword(password);
  const { rows } = await db.query(
    `insert into members (email, full_name, password_hash, role) values ($1, 'AURUM Admin', $2, 'admin')
     on conflict (lower(email)) do update set password_hash = $2, role = 'admin', active = true returning id`,
    [email, hash]
  );
  await db.query('delete from sessions where member_id = $1', [rows[0].id]);
  console.log('Admin password reset for', email);
}

main().catch((e) => { console.error(e.message); process.exitCode = 1; }).finally(() => db.close());
