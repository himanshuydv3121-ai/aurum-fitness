'use strict';
const db = require('../../db');
const auth = require('../../auth');
const v = require('../../validate');
const { route, readJson, ipHash, HttpError } = require('../../http');

module.exports = route({
  POST: async (req) => {
    const body = await readJson(req);
    const token = v.str(body.token, 'Reset link', { max: 100 });
    const password = v.password(body.password);
    if (!(await db.rateLimit('reset:' + ipHash(req), 20, 3600))) {
      throw new HttpError(429, 'Too many attempts. Please try again later.');
    }
    const hash = await auth.hashPassword(password);
    const memberId = await db.tx(async (client) => {
      const { rows } = await client.query(
        `update password_resets set used_at = now()
         where token_hash = $1 and used_at is null and expires_at > now() returning member_id`,
        [auth.sha256(token)]
      );
      if (!rows[0]) return null;
      await client.query('update members set password_hash = $2 where id = $1', [rows[0].member_id, hash]);
      await client.query('delete from sessions where member_id = $1', [rows[0].member_id]);
      return rows[0].member_id;
    });
    if (!memberId) throw new HttpError(400, 'This reset link is invalid or has expired. Ask for a new one.');
    return { body: { ok: true } };
  },
});
