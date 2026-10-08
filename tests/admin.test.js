'use strict';
// Integration tests for the owner admin API, class timetable and booking.
// Run with: TEST_DATABASE_URL=postgres://... node --test tests/admin.test.js

const { test, before, after } = require('node:test');

if (!process.env.TEST_DATABASE_URL) {
  test('integration tests need TEST_DATABASE_URL', { skip: 'TEST_DATABASE_URL is not set' }, () => {});
  return;
}

process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret-test-secret-test-secret';
process.env.PAYMENT_PROVIDER = 'test';
delete process.env.SMTP_URL;

require('./helpers/use-pg-shim');

const assert = require('node:assert/strict');
const crypto = require('crypto');
const db = require('../lib/db');
const auth = require('../lib/auth');
const settings = require('../lib/settings');
const { migrate } = require('../db/migrate');
const { createServer } = require('../server');

let server, base;
const run = crypto.randomBytes(4).toString('hex');
const ADMIN_EMAIL = 'adm-' + run + '@example.com';
const ADMIN_PASSWORD = 'admin-pass-' + run;
const PROG = 'Test Class ' + run;

function client() {
  let cookie = '';
  const ip = '10.' + crypto.randomInt(256) + '.' + crypto.randomInt(256) + '.' + crypto.randomInt(256);
  return async function call(method, url, body, headers) {
    const res = await fetch(base + url, {
      method,
      headers: Object.assign({ 'Content-Type': 'application/json', Cookie: cookie, 'X-Forwarded-For': ip }, headers || {}),
      body: body === undefined ? undefined : (typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)),
    });
    const set = res.headers.get('set-cookie');
    if (set) cookie = set.split(',').map((c) => c.split(';')[0]).filter((c) => /^aurum_session=/.test(c) || /^__Host-/.test(c))[0] || cookie;
    let json = null;
    try { json = await res.clone().json(); } catch (e) { /* not json */ }
    return { status: res.status, json, res };
  };
}

async function login(call, email, password) {
  const r = await call('POST', '/api/auth/login', { email, password });
  assert.equal(r.status, 200, JSON.stringify(r.json));
}

let admin, programSlug;

before(async () => {
  await migrate();
  await db.query(
    `insert into members (email, full_name, password_hash, role) values ($1, 'Test Owner', $2, 'admin')`,
    [ADMIN_EMAIL, await auth.hashPassword(ADMIN_PASSWORD)]
  );
  server = createServer();
  await new Promise((r) => server.listen(0, r));
  base = 'http://127.0.0.1:' + server.address().port;
  admin = client();
  await login(admin, ADMIN_EMAIL, ADMIN_PASSWORD);
});

after(async () => {
  try {
    await new Promise((r) => server.close(r));
    const like = "'%-" + run + "@example.com'";
    await db.query('delete from class_bookings where member_id in (select id from members where email like ' + like + ')');
    await db.query('delete from payments where member_id in (select id from members where email like ' + like + ')');
    await db.query('delete from members where email like ' + like);
    if (programSlug) await db.query("delete from programs where slug = '" + programSlug + "'");
    await db.query("delete from site_content where key like 'cfg.%' or key like 'test.%'");
    await db.query("delete from subscribers where email like " + like);
    await db.query("delete from rate_limits where key like 'book:%' or key like 'signup:%' or key like 'login%' or key like 'newsletter%'");
  } finally {
    await db.close();
  }
});

test('admin API rejects anonymous users and members', async () => {
  const anon = client();
  for (const a of ['programs', 'trainers', 'plans', 'sessions', 'classbookings', 'subscribers', 'outbox', 'content', 'settings', 'export']) {
    assert.equal((await anon('GET', '/api/admin/' + a)).status, 401, a);
  }
  const m = client();
  const s = await m('POST', '/api/auth/signup', { fullName: 'Plain Member', email: 'plain-' + run + '@example.com', password: 'member-pass-' + run });
  assert.equal(s.status, 201);
  assert.equal((await m('GET', '/api/admin/programs')).status, 403);
  assert.equal((await m('PUT', '/api/admin/settings', { 'cfg.notify_email': 'x@example.com' })).status, 403);
});

test('owner creates a program with a weekly schedule and sessions appear', async () => {
  const c = await admin('POST', '/api/admin/programs', {
    name: PROG, categoryLabel: 'Strength', icon: 'bar', description: 'A test class.', duration: '45 min', level: 3,
    coach: 'Coach T', days: '0,1,2,3,4,5,6', startTime: '23:30', capacity: 2, featured: true,
  });
  assert.equal(c.status, 201, JSON.stringify(c.json));
  programSlug = c.json.slug;
  assert.ok(programSlug);

  const bad = await admin('POST', '/api/admin/programs', { name: 'x', categoryLabel: 'S', icon: 'nope', level: 3, capacity: 2 });
  assert.equal(bad.status, 400);

  const pub = await client()('GET', '/api/programs');
  const found = pub.json.programs.find((p) => p.slug === programSlug);
  assert.ok(found);
  assert.equal(found.featured, true);

  const list = await client()('GET', '/api/classes/sessions?program=' + programSlug);
  assert.equal(list.status, 200);
  assert.ok(list.json.sessions.length >= 25, 'sessions: ' + list.json.sessions.length);
  assert.equal(list.json.sessions[0].seatsLeft, 2);

  // Hiding the program removes it from the public site and from booking.
  const upd = await admin('PUT', '/api/admin/programs', Object.assign({ categoryLabel: found.categoryLabel, capacity: 2, level: 3 }, found, { active: false, days: '0,1,2,3,4,5,6', startTime: '23:30' }));
  assert.equal(upd.status, 200, JSON.stringify(upd.json));
  const pub2 = await client()('GET', '/api/programs');
  assert.ok(!pub2.json.programs.some((p) => p.slug === programSlug));
  const upd2 = await admin('PUT', '/api/admin/programs', Object.assign({ categoryLabel: found.categoryLabel, capacity: 2, level: 3 }, found, { active: true, days: '0,1,2,3,4,5,6', startTime: '23:30' }));
  assert.equal(upd2.status, 200);
});

test('members book classes, capacity is enforced, cancel works', async () => {
  const list = await client()('GET', '/api/classes/sessions?program=' + programSlug);
  const session = list.json.sessions[0];
  const people = [];
  for (let i = 0; i < 3; i++) {
    const c = client();
    const s = await c('POST', '/api/auth/signup', { fullName: 'Booker ' + i, email: 'bk' + i + '-' + run + '@example.com', password: 'member-pass-' + run });
    assert.equal(s.status, 201, JSON.stringify(s.json));
    people.push(c);
  }
  assert.equal((await client()('POST', '/api/classes/book', { sessionId: session.id })).status, 401);
  const b0 = await people[0]('POST', '/api/classes/book', { sessionId: session.id });
  assert.equal(b0.status, 201, JSON.stringify(b0.json));
  assert.equal((await people[0]('POST', '/api/classes/book', { sessionId: session.id })).status, 409, 'duplicate');
  assert.equal((await people[1]('POST', '/api/classes/book', { sessionId: session.id })).status, 201);
  const full = await people[2]('POST', '/api/classes/book', { sessionId: session.id });
  assert.equal(full.status, 409);
  assert.match(full.json.error, /full/i);

  const mine = await people[0]('GET', '/api/classes/mine');
  assert.equal(mine.json.bookings.length, 1);
  assert.equal(mine.json.bookings[0].upcoming, true);

  // Owner sees the bookings and the seat count.
  const ab = await admin('GET', '/api/admin/classbookings');
  assert.ok(ab.json.bookings.filter((b) => b.programName === PROG).length >= 2);

  // Member cancels, a seat frees up, and the waiting member can book.
  const cancel = await people[0]('POST', '/api/classes/cancel', { id: b0.json.id });
  assert.equal(cancel.status, 200, JSON.stringify(cancel.json));
  assert.equal((await people[2]('POST', '/api/classes/book', { sessionId: session.id })).status, 201);
  // Another member cannot cancel someone else's booking.
  const other = await people[1]('GET', '/api/classes/mine');
  assert.equal((await people[2]('POST', '/api/classes/cancel', { id: other.json.bookings[0].id })).status, 404);

  // Owner cancels the whole session: bookings are cancelled and the class disappears.
  const sc = await admin('PATCH', '/api/admin/sessions', { id: session.id, capacity: 2, notes: 'Coach away', cancelled: true });
  assert.equal(sc.status, 200, JSON.stringify(sc.json));
  const after = await people[1]('GET', '/api/classes/mine');
  assert.equal(after.json.bookings[0].status, 'cancelled');
  assert.ok(!(await client()('GET', '/api/classes/sessions?program=' + programSlug)).json.sessions.some((s) => s.id === session.id));
  const outbox = await admin('GET', '/api/admin/outbox');
  assert.ok(outbox.json.messages.some((m) => /bk1-/.test(m.to)));
});

test('require-membership setting blocks booking for non-members', async () => {
  const set = await admin('PUT', '/api/admin/settings', { values: { 'cfg.require_membership': 'true' } });
  assert.equal(set.status, 200, JSON.stringify(set.json));
  settings.invalidate();
  const list = await client()('GET', '/api/classes/sessions?program=' + programSlug);
  assert.equal(list.json.requireMembership, true);
  const c = client();
  await c('POST', '/api/auth/signup', { fullName: 'No Plan', email: 'np-' + run + '@example.com', password: 'member-pass-' + run });
  const r = await c('POST', '/api/classes/book', { sessionId: list.json.sessions[0].id });
  assert.equal(r.status, 403);
  await admin('PUT', '/api/admin/settings', { values: { 'cfg.require_membership': 'false' } });
  settings.invalidate();
});

test('settings are validated and text edits are stored and reset', async () => {
  assert.equal((await admin('PUT', '/api/admin/settings', { values: { 'cfg.timezone': 'Not/AZone' } })).status, 400);
  assert.equal((await admin('PUT', '/api/admin/settings', { values: { 'theme.gold': 'red; }</style>' } })).status, 400);
  assert.equal((await admin('PUT', '/api/admin/settings', { values: { 'cfg.cancel_hours': '-3' } })).status, 400);
  assert.equal((await admin('PUT', '/api/admin/settings', { values: { 'bogus.key': 'x' } })).status, 400);
  const ok = await admin('PUT', '/api/admin/settings', { values: { 'cfg.cancel_hours': '6', 'social.instagram': 'https://instagram.com/aurum' } });
  assert.equal(ok.status, 200, JSON.stringify(ok.json));
  settings.invalidate();
  const pub = await client()('GET', '/api/settings');
  assert.equal(pub.status, 200);
  assert.ok(!JSON.stringify(pub.json).includes('notify'));

  const put = await admin('PUT', '/api/admin/content', { set: { 'test.hero.title': 'New headline' } });
  assert.equal(put.status, 200, JSON.stringify(put.json));
  assert.equal((await admin('PUT', '/api/admin/content', { set: { 'cfg.timezone': 'x' } })).status, 400);
  assert.equal((await admin('PUT', '/api/admin/content', { set: { 'bad key!': 'x' } })).status, 400);
  const got = await admin('GET', '/api/admin/content');
  assert.equal(got.json.edits['test.hero.title'], 'New headline');
  await admin('PUT', '/api/admin/content', { reset: ['test.hero.title'] });
  const got2 = await admin('GET', '/api/admin/content');
  assert.equal(got2.json.edits['test.hero.title'], undefined);
});

test('newsletter signup, duplicate handling and admin export', async () => {
  const c = client();
  const e = 'news-' + run + '@example.com';
  const s = await c('POST', '/api/newsletter/subscribe', { email: e });
  
  assert.equal((await c('POST', '/api/newsletter/subscribe', { email: 'nope' })).status, 400);
  const subs = await admin('GET', '/api/admin/subscribers');
  assert.equal(subs.json.subscribers.filter((x) => x.email === e).length, 1);
  const csv = await admin('GET', '/api/admin/export?what=subscribers');
  assert.equal(csv.status, 200);
  assert.match(csv.res.headers.get('content-type'), /csv/);
  assert.equal((await admin('GET', '/api/admin/export?what=bogus')).status, 400);
});

test('owner manages members safely', async () => {
  const members = await admin('GET', '/api/admin/members');
  const me = members.json.members.find((m) => m.email === ADMIN_EMAIL);
  const plain = members.json.members.find((m) => m.email === 'plain-' + run + '@example.com');
  assert.ok(me && plain);
  // Cannot demote or deactivate yourself.
  assert.equal((await admin('PATCH', '/api/admin/members', { id: me.id, role: 'member' })).status, 409);
  assert.equal((await admin('PATCH', '/api/admin/members', { id: me.id, active: false })).status, 409);
  // Deactivated members cannot sign in.
  const off = await admin('PATCH', '/api/admin/members', { id: plain.id, active: false });
  assert.equal(off.status, 200, JSON.stringify(off.json));
  const c = client();
  assert.equal((await c('POST', '/api/auth/login', { email: plain.email, password: 'member-pass-' + run })).status, 401);
  await admin('PATCH', '/api/admin/members', { id: plain.id, active: true });
});

test('image upload checks the file type and serves it back', async () => {
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==', 'base64');
  const up = await admin('POST', '/api/admin/media', png, { 'Content-Type': 'image/png' });
  assert.equal(up.status, 201, JSON.stringify(up.json));
  assert.match(up.json.url, /^\/media\/[0-9a-f-]{36}$/);
  const got = await fetch(base + up.json.url);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/png');
  assert.equal(Buffer.from(await got.arrayBuffer()).length, png.length);
  const bad = await admin('POST', '/api/admin/media', Buffer.from('<script>alert(1)</script>'), { 'Content-Type': 'image/png' });
  assert.equal(bad.status, 400);
});
