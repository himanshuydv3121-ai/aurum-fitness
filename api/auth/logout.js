'use strict';
const auth = require('../../lib/auth');
const { route } = require('../../lib/http');

module.exports = route({
  POST: async (req, res) => {
    await auth.destroySession(req, res);
    return { body: { ok: true } };
  },
});
