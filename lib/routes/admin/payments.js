'use strict';
const db = require('../../db');
const auth = require('../../auth');
const { route } = require('../../http');

module.exports = route({
  GET: async (req) => {
    await auth.requireAdmin(req);
    const { rows } = await db.query(
      `select p.provider_ref as ref, p.status, p.billing, p.amount_minor as "amountMinor", p.currency, p.provider,
              p.created_at as "createdAt", p.paid_at as "paidAt", pl.name as "planName",
              m.full_name as "memberName", m.email as "memberEmail"
       from payments p
       join plans pl on pl.slug = p.plan_slug
       join members m on m.id = p.member_id
       order by p.created_at desc limit 200`
    );
    return { body: { payments: rows } };
  },
});
