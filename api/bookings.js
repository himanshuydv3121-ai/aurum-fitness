'use strict';
const db = require('../lib/db');
const v = require('../lib/validate');
const { route, readJson, ipHash, HttpError } = require('../lib/http');

const INTERESTS = ['Strength', 'Conditioning', 'Mind and Body', 'Recovery', 'Not sure yet'];
const SLOTS = ['Morning, 05:00 to 09:00', 'Midday, 11:00 to 15:00', 'Evening, 17:00 to 21:00'];
const PLANS = ['Essence', 'Aurum', 'Obsidian'];

module.exports = route({
  POST: async (req) => {
    const body = await readJson(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new HttpError(400, 'Invalid request.');

    // Hidden field that real visitors never fill in. Bots do.
    if (typeof body.website === 'string' && body.website.trim() !== '') {
      return { status: 201, body: { ok: true } };
    }

    const fullName = v.str(body.fullname, 'Name', { min: 2, max: 100 });
    const email = v.email(body.email);
    const phone = v.phone(body.phone);
    const interest = v.oneOf(body.interest, 'interest', INTERESTS);
    const slot = v.oneOf(body.slot, 'time', SLOTS);
    const plan = v.oneOf(body.plan, 'membership', PLANS, { required: false });
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
    return { status: 201, body: { ok: true, id: rows[0].id } };
  },
});
