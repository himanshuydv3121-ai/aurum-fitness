'use strict';
const db = require('../../lib/db');
const auth = require('../../lib/auth');
const { route, query, HttpError } = require('../../lib/http');

const COLUMNS = `p.provider_ref as ref, p.status, p.billing, p.amount_minor as "amountMinor", p.currency,
  p.created_at as "createdAt", p.paid_at as "paidAt", p.plan_slug as plan, pl.name as "planName", p.provider`;

// With ?ref= returns one of the member's payments. Without it, returns their history.
module.exports = route({
  GET: async (req) => {
    const member = await auth.requireMember(req);
    const ref = query(req).get('ref');
    if (ref) {
      const { rows } = await db.query(
        'select ' + COLUMNS + ' from payments p join plans pl on pl.slug = p.plan_slug where p.provider_ref = $1 and p.member_id = $2',
        [ref.slice(0, 80), member.id]
      );
      if (!rows[0]) throw new HttpError(404, 'Payment not found.');
      return { body: { payment: rows[0] } };
    }
    const { rows } = await db.query(
      'select ' + COLUMNS + ' from payments p join plans pl on pl.slug = p.plan_slug where p.member_id = $1 order by p.created_at desc limit 50',
      [member.id]
    );
    return { body: { payments: rows } };
  },
});
