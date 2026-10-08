'use strict';
const crypto = require('crypto');
const { promisify } = require('util');
const db = require('./db');
const { HttpError } = require('./http');

const scrypt = promisify(crypto.scrypt);
const COOKIE = 'aurum_session';
const HINT = 'aurum_hint';
const SESSION_DAYS = 14;

async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const hash = await scrypt(password, salt, 64);
  return 'scrypt:' + salt.toString('hex') + ':' + hash.toString('hex');
}

async function verifyPassword(password, stored) {
  const parts = String(stored || '').split(':');
  if (parts.length !== 3 || parts[0] !== 'scrypt') return false;
  const salt = Buffer.from(parts[1], 'hex');
  const expected = Buffer.from(parts[2], 'hex');
  const actual = await scrypt(password, salt, expected.length);
  return crypto.timingSafeEqual(actual, expected);
}

// Runs a hash so unknown emails take about as long as wrong passwords.
let dummy;
async function burnTime(password) {
  if (!dummy) dummy = await hashPassword('dummy-password-for-timing');
  await verifyPassword(password, dummy);
}

function sha256(s) {
  return crypto.createHash('sha256').update(s).digest('hex');
}

function secureFlag() {
  return process.env.VERCEL || process.env.NODE_ENV === 'production' ? '; Secure' : '';
}

async function createSession(res, memberId) {
  const token = crypto.randomBytes(32).toString('base64url');
  await db.query(
    "insert into sessions (token_hash, member_id, expires_at) values ($1, $2, now() + make_interval(days => $3))",
    [sha256(token), memberId, SESSION_DAYS]
  );
  // The second cookie is readable by page scripts. It only says "a session probably exists" so the
  // site can skip asking the server who is signed in for visitors who are not. It grants nothing.
  res.setHeader('Set-Cookie', [
    COOKIE + '=' + token + '; HttpOnly; Path=/; SameSite=Lax; Max-Age=' + SESSION_DAYS * 86400 + secureFlag(),
    HINT + '=1; Path=/; SameSite=Lax; Max-Age=' + SESSION_DAYS * 86400 + secureFlag(),
  ]);
}

function readCookie(req, name) {
  const header = req.headers.cookie || '';
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0 && part.slice(0, i).trim() === name) return part.slice(i + 1).trim();
  }
  return null;
}

async function destroySession(req, res) {
  const token = readCookie(req, COOKIE);
  if (token) await db.query('delete from sessions where token_hash = $1', [sha256(token)]);
  res.setHeader('Set-Cookie', [
    COOKIE + '=; HttpOnly; Path=/; SameSite=Lax; Max-Age=0' + secureFlag(),
    HINT + '=; Path=/; SameSite=Lax; Max-Age=0' + secureFlag(),
  ]);
}

// Signs a member out everywhere, for example after a password change.
async function destroyAllSessions(memberId) {
  await db.query('delete from sessions where member_id = $1', [memberId]);
}

const MEMBER_COLUMNS =
  'm.id, m.email, m.full_name, m.phone, m.role, m.plan_slug, m.billing, m.membership_status, m.membership_until, m.created_at';

async function getMember(req) {
  const token = readCookie(req, COOKIE);
  if (!token) return null;
  const { rows } = await db.query(
    'select ' + MEMBER_COLUMNS + ' from sessions s join members m on m.id = s.member_id ' +
    'where s.token_hash = $1 and s.expires_at > now() and m.active',
    [sha256(token)]
  );
  if (!rows[0]) return null;
  const m = rows[0];
  // A lapsed membership reads as expired without needing a background job.
  if (m.membership_status === 'active' && m.membership_until && new Date(m.membership_until) < new Date()) {
    m.membership_status = 'expired';
  }
  return m;
}

async function requireMember(req) {
  const m = await getMember(req);
  if (!m) throw new HttpError(401, 'Sign in to continue.');
  return m;
}

async function requireAdmin(req) {
  const m = await requireMember(req);
  if (m.role !== 'admin') throw new HttpError(403, 'Admin access only.');
  return m;
}

function publicMember(m) {
  return {
    id: m.id,
    email: m.email,
    fullName: m.full_name,
    phone: m.phone || '',
    role: m.role,
    plan: m.plan_slug,
    billing: m.billing,
    membershipStatus: m.membership_status,
    membershipUntil: m.membership_until,
    createdAt: m.created_at,
  };
}

module.exports = {
  sha256, destroyAllSessions, hashPassword, verifyPassword, burnTime, createSession, destroySession,
  getMember, requireMember, requireAdmin, publicMember,
};
