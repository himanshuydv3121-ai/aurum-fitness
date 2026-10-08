'use strict';
const db = require('../../db');
const auth = require('../../auth');
const pay = require('../../payments');
const v = require('../../validate');
const { route, readJson, HttpError } = require('../../http');

// Called by the browser after Razorpay Checkout succeeds. The signature proves the payment is
// genuine, so the browser cannot mark a payment paid by itself.
module.exports = route({
  POST: async (req) => {
    const member = await auth.requireMember(req);
    const body = await readJson(req);
    const ref = v.str(body.ref, 'Reference', { max: 80 });
    const paymentId = v.str(body.razorpayPaymentId, 'Payment id', { max: 80 });
    const signature = v.str(body.razorpaySignature, 'Signature', { max: 200 });

    const { rows } = await db.query(
      'select id, status, provider from payments where provider_ref = $1 and member_id = $2',
      [ref, member.id]
    );
    const payment = rows[0];
    if (!payment || payment.provider !== 'razorpay') throw new HttpError(404, 'Payment not found.');
    if (payment.status === 'paid') return { body: { ref, status: 'paid' } };
    if (payment.status !== 'pending') throw new HttpError(409, 'This payment was already ' + payment.status + '.');

    if (!pay.verifyCheckoutSignature(ref, paymentId, signature)) {
      throw new HttpError(400, 'The payment could not be verified. If money left your account, contact the club with reference ' + ref + '.');
    }
    if (await pay.markPaid(payment.id, member.id, paymentId)) await pay.afterPaid(payment.id, req);
    const out = await db.query('select status from payments where id = $1', [payment.id]);
    return { body: { ref, status: out.rows[0].status } };
  },
});
