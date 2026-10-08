'use strict';
const crypto = require('crypto');
const db = require('../../db');
const auth = require('../../auth');
const notify = require('../../notify');
const v = require('../../validate');
const { route, readJson, ipHash, HttpError } = require('../../http');

const GENERIC = 'If that email belongs to an account, we have sent a link to reset the password.';

module.exports = route({
  POST: async (req) => {
    const body = await readJson(req);
    const email = v.email(body.email);
    const ip = ipHash(req);
    if (!(await db.rateLimit('forgot-ip:' + ip, 8, 3600)) || !(await db.rateLimit('forgot:' + email, 3, 3600))) {
      throw new HttpError(429, 'Too many reset requests. Please try again later.');
    }
    const { rows } = await db.query('select id, email, full_name from members where lower(email) = $1 and active', [email]);
    const member = rows[0];
    if (member) {
      const token = crypto.randomBytes(32).toString('base64url');
      await db.query(
        "insert into password_resets (token_hash, member_id, expires_at) values ($1, $2, now() + interval '1 hour')",
        [auth.sha256(token), member.id]
      );
      await notify.passwordReset(member, notify.baseUrl(req) + '/login?reset=' + token);
    }
    return { body: { ok: true, message: GENERIC } };
  },
});
