'use strict';
const db = require('../../lib/db');
const auth = require('../../lib/auth');
const { route } = require('../../lib/http');

module.exports = route({
  GET: async (req) => {
    await auth.requireAdmin(req);
    const { rows } = await db.query(
      `select id, full_name as "fullName", email, role, plan_slug as plan, billing,
              case when membership_status = 'active' and membership_until < now() then 'expired' else membership_status end as "membershipStatus",
              membership_until as "membershipUntil", created_at as "createdAt"
       from members order by created_at desc limit 200`
    );
    return { body: { members: rows } };
  },
});
