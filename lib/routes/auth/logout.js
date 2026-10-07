'use strict';
const auth = require('../../auth');
const { route } = require('../../http');

module.exports = route({
  POST: async (req, res) => {
    await auth.destroySession(req, res);
    return { body: { ok: true } };
  },
});
