'use strict';
const db = require('../../db');
const auth = require('../../auth');
const { route } = require('../../http');

module.exports = route({
  GET: async (req) => {
    await auth.requireAdmin(req);
    const { rows } = await db.query(`
      select
        (select count(*)::int from bookings) as bookings,
        (select count(*)::int from bookings where status = 'new') as "newBookings",
        (select count(*)::int from members) as members,
        (select count(*)::int from members where membership_status = 'active' and membership_until > now()) as "activeMembers",
        (select count(*)::int from payments where status = 'paid') as "paidPayments",
        (select coalesce(sum(amount_minor), 0)::bigint from payments where status = 'paid') as "revenueMinor"`);
    const o = rows[0];
    o.revenueMinor = Number(o.revenueMinor);
    return { body: { overview: o } };
  },
});
