'use strict';
const db = require('../../db');
const auth = require('../../auth');
const v = require('../../validate');
const { route, readJson, ipHash, HttpError } = require('../../http');

module.exports = route({
  POST: async (req, res) => {
    const body = await readJson(req);
    const email = v.email(body.email);
    const password = typeof body.password === 'string' ? body.password.slice(0, 200) : '';
    if (!password) throw new HttpError(400, 'Password is required.');

    const ip = ipHash(req);
    const withinLimit =
      (await db.rateLimit('login-ip:' + ip, 30, 900)) &&
      (await db.rateLimit('login:' + ip + ':' + email, 8, 900));
    if (!withinLimit) throw new HttpError(429, 'Too many sign-in attempts. Please wait a few minutes.');

    const { rows } = await db.query(
      `select id, email, full_name, role, plan_slug, billing, membership_status, membership_until, created_at, password_hash
       from members where lower(email) = $1`,
      [email]
    );
    const member = rows[0];
    let ok = false;
    if (member) ok = await auth.verifyPassword(password, member.password_hash);
    else await auth.burnTime(password);
    if (!ok) throw new HttpError(401, 'Email or password is incorrect.');

    await auth.createSession(res, member.id);
    return { body: { member: auth.publicMember(member) } };
  },
});
