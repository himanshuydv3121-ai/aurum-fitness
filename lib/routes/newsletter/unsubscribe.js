'use strict';
const db = require('../../db');
const v = require('../../validate');
const { route, readJson, HttpError } = require('../../http');

module.exports = route({
  POST: async (req) => {
    const body = await readJson(req);
    const token = v.str(body.token, 'Link', { max: 80 });
    const { rowCount } = await db.query('update subscribers set active = false where token = $1', [token]);
    if (!rowCount) throw new HttpError(404, 'That unsubscribe link is not valid.');
    return { body: { ok: true } };
  },
});
