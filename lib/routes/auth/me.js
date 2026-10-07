'use strict';
const auth = require('../../auth');
const { route } = require('../../http');

module.exports = route({
  GET: async (req) => {
    const member = await auth.requireMember(req);
    return { body: { member: auth.publicMember(member) } };
  },
});
