'use strict';
const db = require('../../db');
const auth = require('../../auth');
const notify = require('../../notify');
const v = require('../../validate');
const { route, readJson, ipHash, HttpError } = require('../../http');

module.exports = route({
  POST: async (req, res) => {
    const body = await readJson(req);
    const fullName = v.str(body.fullName, 'Name', { min: 2, max: 100 });
    const email = v.email(body.email);
    const password = v.password(body.password);
    const phone = v.phone(body.phone);

    if (!(await db.rateLimit('signup:' + ipHash(req), 5, 3600))) {
      throw new HttpError(429, 'Too many sign-ups from this network. Please try again later.');
    }

    const hash = await auth.hashPassword(password);
    let member;
    try {
      const { rows } = await db.query(
        `insert into members (email, full_name, password_hash, phone) values ($1,$2,$3,$4)
         returning id, email, full_name, phone, role, plan_slug, billing, membership_status, membership_until, created_at`,
        [email, fullName, hash, phone || null]
      );
      member = rows[0];
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'An account with this email already exists. Try signing in.');
      throw err;
    }
    await auth.createSession(res, member.id);
    await notify.welcome(member, req);
    return { status: 201, body: { member: auth.publicMember(member) } };
  },
});
