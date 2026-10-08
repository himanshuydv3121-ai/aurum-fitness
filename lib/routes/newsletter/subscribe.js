'use strict';
const crypto = require('crypto');
const db = require('../../db');
const notify = require('../../notify');
const v = require('../../validate');
const { route, readJson, ipHash, HttpError } = require('../../http');

module.exports = route({
  POST: async (req) => {
    const body = await readJson(req);
    if (typeof body.website === 'string' && body.website.trim() !== '') return { status: 201, body: { ok: true } };
    const email = v.email(body.email);
    if (!(await db.rateLimit('news:' + ipHash(req), 10, 3600))) {
      throw new HttpError(429, 'Too many requests. Please try again later.');
    }
    const token = crypto.randomBytes(24).toString('base64url');
    const { rows } = await db.query(
      `insert into subscribers (email, token) values ($1, $2)
       on conflict (lower(email)) do update set active = true
       returning token, (xmax = 0) as inserted`,
      [email, token]
    );
    if (rows[0].inserted) await notify.newsletterWelcome(email, notify.baseUrl(req) + '/unsubscribe?token=' + rows[0].token);
    return { status: 201, body: { ok: true } };
  },
});
