'use strict';
const auth = require('../../lib/auth');
const { route } = require('../../lib/http');

module.exports = route({
  GET: async (req) => {
    const member = await auth.requireMember(req);
    return { body: { member: auth.publicMember(member) } };
  },
});
