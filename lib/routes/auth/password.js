'use strict';
const db = require('../../db');
const auth = require('../../auth');
const v = require('../../validate');
const { route, readJson, ipHash, HttpError } = require('../../http');

module.exports = route({
  POST: async (req, res) => {
    const member = await auth.requireMember(req);
    const body = await readJson(req);
    const current = typeof body.current === 'string' ? body.current.slice(0, 200) : '';
    const next = v.password(body.password);
    if (!(await db.rateLimit('chgpw:' + member.id, 10, 900))) throw new HttpError(429, 'Too many attempts. Please wait a few minutes.');
    const { rows } = await db.query('select password_hash from members where id = $1', [member.id]);
    if (!rows[0] || !(await auth.verifyPassword(current, rows[0].password_hash))) {
      throw new HttpError(400, 'Your current password is incorrect.');
    }
    await db.query('update members set password_hash = $2 where id = $1', [member.id, await auth.hashPassword(next)]);
    // End every other session, then keep this device signed in.
    await auth.destroyAllSessions(member.id);
    await auth.createSession(res, member.id);
    return { body: { ok: true } };
  },
});
