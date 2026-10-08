'use strict';
const db = require('../lib/db');
const v = require('../lib/validate');
const settings = require('../lib/settings');
const notify = require('../lib/notify');
const { route, readJson, ipHash, HttpError } = require('../lib/http');

// Tour requests from the contact page. The choices offered on the form come from admin Settings.
module.exports = route({
  POST: async (req) => {
    const body = await readJson(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid request.');

    // Hidden field that real visitors never fill in. Bots do.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      return { status: 201, body: { ok: true } };
    }

    const s = await settings.settings();
    const fullName = v.str(body.fullname, 'Name', { min: 2, max: 100 });
    const email = v.email(body.email);
    const phone = v.phone(body.phone);
    const interest = v.oneOf(body.interest, 'interest', settings.lines(s['cfg.interests']));
    const slot = v.oneOf(body.slot, 'time', settings.lines(s['cfg.slots']));
    const plan = v.str(body.plan, 'Membership', { required: false, max: 60 });
    const message = v.str(body.msg, 'Goals', { required: false, max: 1000 });

    const ip = ipHash(req);
    if (!(await db.rateLimit('booking:' + ip, 5, 3600))) {
      throw new HttpError(429, 'Too many requests. Please try again later.');
    }

    const { rows } = await db.query(
      `insert into bookings (full_name, email, phone, interest, slot, plan, message, ip_hash)
       values ($1,$2,$3,$4,$5,$6,$7,$8) returning id`,
      [fullName, email, phone || null, interest, slot, plan || null, message || null, ip]
    );
    await notify.tourRequest({ fullName, email, phone, interest, slot, plan, message }, req);
    return { status: 201, body: { ok: true, id: rows[0].id } };
  },
});
