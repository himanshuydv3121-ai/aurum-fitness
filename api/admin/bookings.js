'use strict';
const db = require('../../lib/db');
const auth = require('../../lib/auth');
const v = require('../../lib/validate');
const { route, readJson, query, HttpError } = require('../../lib/http');

const STATUSES = ['new', 'contacted', 'toured', 'closed'];

module.exports = route({
  GET: async (req) => {
    await auth.requireAdmin(req);
    const status = query(req).get('status');
    const params = [];
    let where = '';
    if (status) {
      v.oneOf(status, 'status', STATUSES);
      params.push(status);
      where = 'where status = $1';
    }
    const { rows } = await db.query(
      `select id, full_name as "fullName", email, phone, interest, slot, plan, message, status, created_at as "createdAt"
       from bookings ${where} order by created_at desc limit 200`,
      params
    );
    return { body: { bookings: rows } };
  },

  PATCH: async (req) => {
    await auth.requireAdmin(req);
    const body = await readJson(req);
    const id = v.uuid(body.id, 'booking id');
    const status = v.oneOf(body.status, 'status', STATUSES);
    const { rowCount } = await db.query('update bookings set status = $2 where id = $1', [id, status]);
    if (!rowCount) throw new HttpError(404, 'Booking not found.');
    return { body: { ok: true, id, status } };
  },
});
