'use strict';
const db = require('../../lib/db');
const auth = require('../../lib/auth');
const pay = require('../../lib/payments');
const v = require('../../lib/validate');
const { route, readJson, HttpError } = require('../../lib/http');

// Test-mode confirmation. A live provider confirms through a signed webhook instead,
// so this route refuses to run unless the test provider is active.
module.exports = route({
  POST: async (req) => {
    const member = await auth.requireMember(req);
    if ((process.env.PAYMENT_PROVIDER || 'test') !== 'test') {
      throw new HttpError(404, 'Not available.');
    }
    const body = await readJson(req);
    const ref = v.str(body.ref, 'Reference', { max: 80 });
    const outcome = v.oneOf(body.outcome, 'outcome', ['success', 'failure']);

    const { rows } = await db.query(
      'select id, status, provider from payments where provider_ref = $1 and member_id = $2',
      [ref, member.id]
    );
    const payment = rows[0];
    if (!payment || payment.provider !== 'test') throw new HttpError(404, 'Payment not found.');
    if (payment.status !== 'pending') throw new HttpError(409, 'This payment was already ' + payment.status + '.');

    if (outcome === 'success') await pay.markPaid(payment.id, member.id);
    else await pay.markFailed(payment.id, member.id);

    const out = await db.query('select status from payments where id = $1', [payment.id]);
    return { body: { ref, status: out.rows[0].status } };
  },
});
