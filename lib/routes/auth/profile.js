'use strict';
const db = require('../../db');
const auth = require('../../auth');
const v = require('../../validate');
const { route, readJson } = require('../../http');

module.exports = route({
  PATCH: async (req) => {
    const member = await auth.requireMember(req);
    const body = await readJson(req);
    const fullName = v.str(body.fullName, 'Name', { min: 2, max: 100 });
    const phone = v.phone(body.phone);
    await db.query('update members set full_name = $2, phone = $3 where id = $1', [member.id, fullName, phone || null]);
    member.full_name = fullName;
    member.phone = phone;
    return { body: { member: auth.publicMember(member) } };
  },
});
