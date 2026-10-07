'use strict';
// Integration tests. They run the real handlers and real SQL against a Postgres database.
// Run with: TEST_DATABASE_URL=postgres://... npm test
// Without TEST_DATABASE_URL the tests are skipped.

const { test, before, after } = require('node:test');

if (!process.env.TEST_DATABASE_URL) {
  test('integration tests need TEST_DATABASE_URL', { skip: 'TEST_DATABASE_URL is not set' }, () => {});
  return;
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-test-secret-test-secret';
process.env.PAYMENT_PROVIDER = 'test';

// Use the real `pg` driver when installed. Otherwise fall back to the test-only shim.
require('./helpers/use-pg-shim');

const assert = require('node:assert/strict');
const crypto = require('crypto');
const db = require('../lib/db');
const auth = require('../lib/auth');
const { migrate } = require('../db/migrate');
const content = require('../db/content');
const { createServer } = require('../server');

let server, base;
const run = crypto.randomBytes(4).toString('hex');
const ADMIN_EMAIL = 'admin-' + run + '@example.com';
const ADMIN_PASSWORD = 'admin-pass-' + run;

// Tiny cookie-aware client.
function client(ip) {
  let cookie = '';
  // Each client gets its own fake IP so the per-IP rate limits do not interfere across tests.
  ip = ip || '10.' + crypto.randomInt(256) + '.' + crypto.randomInt(256) + '.' + crypto.randomInt(256);
  return async function call(method, url, body, headers) {
    const res = await fetch(base + url, {
      method,
      headers: Object.assign({ 'Content-Type': 'application/json', Cookie: cookie, 'X-Forwarded-For': ip }, headers || {}),
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(';')[0].endsWith('=') ? '' : set.split(';')[0];
    let json = null;
    try { json = await res.json(); } catch (e) { /* no body */ }
    return { status: res.status, json, headers: res.headers };
  };
}

before(async () => {
  assert.ok(process.env.DATABASE_URL, 'Set TEST_DATABASE_URL to run the tests.');
  await migrate();
  // Seed content directly so the tests do not depend on the seed script's admin env vars.
  for (let i = 0; i < content.plans.length; i++) {
    const p = content.plans[i];
    await db.query(
      `insert into plans (slug,name,tag,monthly_price,annual_price,featured,features,excluded,sort)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9) on conflict (slug) do nothing`,
      [p[0], p[1], p[2], p[3], p[4], p[5], JSON.stringify(p[6]), JSON.stringify(p[7]), i]
    );
  }
  for (let i = 0; i < content.programs.length; i++) {
    await db.query(
      `insert into programs (slug,name,category,category_label,icon,description,duration,level,schedule,coach,sort)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (slug) do nothing`,
      content.programs[i].concat([i])
    );
  }
  for (let i = 0; i < content.trainers.length; i++) {
    await db.query(
      `insert into trainers (slug,name,initials,role,bio,cert,color,sort)
       values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (slug) do nothing`,
      content.trainers[i].concat([i])
    );
  }
  await db.query(
    `insert into members (email, full_name, password_hash, role) values ($1, 'Test Admin', $2, 'admin')`,
    [ADMIN_EMAIL, await auth.hashPassword(ADMIN_PASSWORD)]
  );
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = 'http://127.0.0.1:' + server.address().port;
});

after(async () => {
  try {
    await new Promise((r) => server.close(r));
    const like = "'%-" + run + "@example.com'";
    await db.query('delete from payments where member_id in (select id from members where email like ' + like + ')');
    await db.query('delete from members where email like ' + like);
    await db.query('delete from bookings where email like ' + like);
    await db.query("delete from rate_limits where key like 'booking:%' or key like 'signup:%' or key like 'login%' or key like 'checkout:%'");
  } finally {
    await db.close();
  }
});

test('content endpoints return seeded data', async () => {
  const c = client();
  const programs = await c('GET', '/api/programs');
  assert.equal(programs.status, 200);
  assert.equal(programs.json.programs.length, content.programs.length);
  assert.equal(programs.json.programs[0].categoryLabel, 'Strength');
  const plans = await c('GET', '/api/plans');
  assert.equal(plans.json.plans.length, 3);
  assert.deepEqual(plans.json.plans[1].features.length, 5);
  const trainers = await c('GET', '/api/trainers');
  assert.equal(trainers.json.trainers.length, 6);
});

test('wrong method returns 405', async () => {
  const r = await client()('DELETE', '/api/programs');
  assert.equal(r.status, 405);
});

test('booking validates input and saves a valid request', async () => {
  const c = client();
  const bad = await c('POST', '/api/bookings', { fullname: 'A', email: 'nope', interest: 'Strength', slot: 'Morning, 05:00 to 09:00' });
  assert.equal(bad.status, 400);
  const badChoice = await c('POST', '/api/bookings', { fullname: 'Test User', email: 't-' + run + '@example.com', interest: 'Hacking', slot: 'Morning, 05:00 to 09:00' });
  assert.equal(badChoice.status, 400);
  const ok = await c('POST', '/api/bookings', {
    fullname: 'Test User', email: 'book-' + run + '@example.com', phone: '+91 98765 43210',
    interest: 'Strength', slot: 'Morning, 05:00 to 09:00', plan: 'Aurum', msg: 'Want to start powerlifting.',
  });
  assert.equal(ok.status, 201);
  const { rows } = await db.query('select * from bookings where email = $1', ['book-' + run + '@example.com']);
  assert.equal(rows.length, 1);
  assert.equal(rows[0].status, 'new');
});

test('booking honeypot is accepted silently but not stored', async () => {
  const c = client();
  const email = 'bot-' + run + '@example.com';
  const r = await c('POST', '/api/bookings', {
    fullname: 'Bot User', email, interest: 'Strength', slot: 'Morning, 05:00 to 09:00', website: 'http://spam.example',
  });
  assert.equal(r.status, 201);
  const { rows } = await db.query('select 1 from bookings where email = $1', [email]);
  assert.equal(rows.length, 0);
});

test('cross-origin writes are rejected', async () => {
  const r = await client()('POST', '/api/bookings', { fullname: 'X Y' }, { Origin: 'https://evil.example' });
  assert.equal(r.status, 403);
});

test('signup, session, me, logout and login', async () => {
  const c = client();
  const email = 'member-' + run + '@example.com';
  const weak = await c('POST', '/api/auth/signup', { fullName: 'Test Member', email, password: 'short' });
  assert.equal(weak.status, 400);

  const up = await c('POST', '/api/auth/signup', { fullName: 'Test Member', email, password: 'correct horse battery' });
  assert.equal(up.status, 201);
  assert.equal(up.json.member.email, email);
  assert.equal(up.json.member.role, 'member');
  assert.ok(!('password_hash' in up.json.member) && !('passwordHash' in up.json.member));
  const cookie = up.headers.get('set-cookie');
  assert.match(cookie, /HttpOnly/);
  assert.match(cookie, /SameSite=Lax/);

  const dup = await client()('POST', '/api/auth/signup', { fullName: 'Again', email: email.toUpperCase(), password: 'correct horse battery' });
  assert.equal(dup.status, 409);

  const me = await c('GET', '/api/auth/me');
  assert.equal(me.status, 200);
  assert.equal(me.json.member.membershipStatus, 'none');

  await c('POST', '/api/auth/logout', {});
  assert.equal((await c('GET', '/api/auth/me')).status, 401);

  const wrong = await client()('POST', '/api/auth/login', { email, password: 'wrong password here' });
  assert.equal(wrong.status, 401);
  const unknown = await client()('POST', '/api/auth/login', { email: 'nobody-' + run + '@example.com', password: 'wrong password here' });
  assert.equal(unknown.status, 401);
  assert.equal(unknown.json.error, wrong.json.error);

  const login = await c('POST', '/api/auth/login', { email, password: 'correct horse battery' });
  assert.equal(login.status, 200);
  assert.equal((await c('GET', '/api/auth/me')).status, 200);
});

test('protected routes reject anonymous and non-admin users', async () => {
  const anon = client();
  assert.equal((await anon('GET', '/api/auth/me')).status, 401);
  assert.equal((await anon('POST', '/api/payments/checkout', { plan: 'aurum', billing: 'monthly' })).status, 401);
  assert.equal((await anon('GET', '/api/admin/bookings')).status, 401);

  const c = client();
  await c('POST', '/api/auth/signup', { fullName: 'Plain Member', email: 'plain-' + run + '@example.com', password: 'correct horse battery' });
  assert.equal((await c('GET', '/api/admin/bookings')).status, 403);
  assert.equal((await c('GET', '/api/admin/members')).status, 403);
  assert.equal((await c('PATCH', '/api/admin/bookings', { id: crypto.randomUUID(), status: 'closed' })).status, 403);
});

test('payment flow: server-side pricing, confirm, membership activates', async () => {
  const c = client();
  await c('POST', '/api/auth/signup', { fullName: 'Payer One', email: 'payer-' + run + '@example.com', password: 'correct horse battery' });

  assert.equal((await c('POST', '/api/payments/checkout', { plan: 'nope', billing: 'monthly' })).status, 404);
  assert.equal((await c('POST', '/api/payments/checkout', { plan: 'aurum', billing: 'weekly' })).status, 400);

  // A client-supplied amount must be ignored.
  const co = await c('POST', '/api/payments/checkout', { plan: 'aurum', billing: 'annual', amount: 1 });
  assert.equal(co.status, 201);
  assert.equal(co.json.payment.amountMinor, 22100 * 12 * 100);
  assert.equal(co.json.payment.status, 'pending');
  const ref = co.json.payment.ref;

  const before = await c('GET', '/api/auth/me');
  assert.equal(before.json.member.membershipStatus, 'none');

  const status = await c('GET', '/api/payments/status?ref=' + ref);
  assert.equal(status.json.payment.planName, 'Aurum');

  const paid = await c('POST', '/api/payments/confirm', { ref, outcome: 'success' });
  assert.equal(paid.status, 200);
  assert.equal(paid.json.status, 'paid');

  const again = await c('POST', '/api/payments/confirm', { ref, outcome: 'success' });
  assert.equal(again.status, 409);

  const after = await c('GET', '/api/auth/me');
  assert.equal(after.json.member.membershipStatus, 'active');
  assert.equal(after.json.member.plan, 'aurum');
  assert.equal(after.json.member.billing, 'annual');
  const until = new Date(after.json.member.membershipUntil).getTime();
  assert.ok(until > Date.now() + 360 * 86400000 && until < Date.now() + 370 * 86400000);

  const history = await c('GET', '/api/payments/status');
  assert.equal(history.json.payments.length, 1);
});

test('failed payment does not activate membership, and other members cannot touch it', async () => {
  const a = client();
  await a('POST', '/api/auth/signup', { fullName: 'Payer Two', email: 'payer2-' + run + '@example.com', password: 'correct horse battery' });
  const co = await a('POST', '/api/payments/checkout', { plan: 'essence', billing: 'monthly' });
  const ref = co.json.payment.ref;

  const b = client();
  await b('POST', '/api/auth/signup', { fullName: 'Intruder', email: 'intruder-' + run + '@example.com', password: 'correct horse battery' });
  assert.equal((await b('POST', '/api/payments/confirm', { ref, outcome: 'success' })).status, 404);
  assert.equal((await b('GET', '/api/payments/status?ref=' + ref)).status, 404);

  const fail = await a('POST', '/api/payments/confirm', { ref, outcome: 'failure' });
  assert.equal(fail.json.status, 'failed');
  assert.equal((await a('GET', '/api/auth/me')).json.member.membershipStatus, 'none');
});

test('admin can list and update bookings, members and payments', async () => {
  const admin = client();
  const login = await admin('POST', '/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
  assert.equal(login.status, 200);
  assert.equal(login.json.member.role, 'admin');

  const overview = await admin('GET', '/api/admin/overview');
  assert.equal(overview.status, 200);
  assert.ok(overview.json.overview.members >= 1);
  assert.ok(overview.json.overview.revenueMinor >= 22100 * 12 * 100);

  const bookings = await admin('GET', '/api/admin/bookings');
  const mine = bookings.json.bookings.find((b) => b.email === 'book-' + run + '@example.com');
  assert.ok(mine);

  const upd = await admin('PATCH', '/api/admin/bookings', { id: mine.id, status: 'contacted' });
  assert.equal(upd.status, 200);
  const filtered = await admin('GET', '/api/admin/bookings?status=contacted');
  assert.ok(filtered.json.bookings.some((b) => b.id === mine.id));
  assert.equal((await admin('GET', '/api/admin/bookings?status=bogus')).status, 400);
  assert.equal((await admin('PATCH', '/api/admin/bookings', { id: mine.id, status: 'bogus' })).status, 400);
  assert.equal((await admin('PATCH', '/api/admin/bookings', { id: 'not-a-uuid', status: 'new' })).status, 400);

  const members = await admin('GET', '/api/admin/members');
  assert.ok(members.json.members.length >= 2);
  assert.ok(!JSON.stringify(members.json).includes('password'));
  const payments = await admin('GET', '/api/admin/payments');
  assert.ok(payments.json.payments.some((p) => p.status === 'paid'));
});

test('SQL injection attempts are treated as plain text', async () => {
  const c = client();
  const r = await c('POST', '/api/auth/login', { email: "x@example.com' or '1'='1", password: "' or 1=1 --" });
  assert.equal(r.status, 400);
  const r2 = await c('POST', '/api/auth/login', { email: 'x-' + run + '@example.com', password: "' or 1=1 --" });
  assert.equal(r2.status, 401);
});

test('rate limits: bookings, sign-ups and sign-in attempts', async () => {
  const booking = { fullname: 'Rate Test', email: 'rate-' + run + '@example.com', interest: 'Strength', slot: 'Morning, 05:00 to 09:00' };
  const b = client();
  for (let i = 0; i < 5; i++) assert.equal((await b('POST', '/api/bookings', booking)).status, 201);
  assert.equal((await b('POST', '/api/bookings', booking)).status, 429);
  // A different IP is unaffected.
  assert.equal((await client()('POST', '/api/bookings', booking)).status, 201);

  const s = client();
  for (let i = 0; i < 5; i++) {
    const r = await s('POST', '/api/auth/signup', { fullName: 'Rate Member', email: 'rl' + i + '-' + run + '@example.com', password: 'correct horse battery' });
    assert.equal(r.status, 201);
  }
  assert.equal((await s('POST', '/api/auth/signup', { fullName: 'Rate Member', email: 'rl9-' + run + '@example.com', password: 'correct horse battery' })).status, 429);

  const l = client();
  for (let i = 0; i < 8; i++) {
    assert.equal((await l('POST', '/api/auth/login', { email: 'rl0-' + run + '@example.com', password: 'wrong password ' + i })).status, 401);
  }
  assert.equal((await l('POST', '/api/auth/login', { email: 'rl0-' + run + '@example.com', password: 'correct horse battery' })).status, 429);
});
