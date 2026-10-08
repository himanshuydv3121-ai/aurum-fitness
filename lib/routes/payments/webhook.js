'use strict';
const db = require('../../db');
const pay = require('../../payments');
const { route, readRaw, HttpError } = require('../../http');

// Razorpay calls this when a payment is captured, whether or not the member's browser came back.
// The signature is checked against the exact bytes received, so the body is read raw.
module.exports = route({
  POST: async (req) => {
    if (!process.env.RAZORPAY_WEBHOOK_SECRET) throw new HttpError(503, 'Webhook is not configured.');
    const raw = await readRaw(req, 200 * 1024);
    if (!pay.verifyWebhookSignature(raw, req.headers['x-razorpay-signature'])) {
      throw new HttpError(400, 'Bad signature.');
    }
    let event;
    try { event = JSON.parse(raw.toString('utf8')); } catch (e) { throw new HttpError(400, 'Bad payload.'); }

    const name = event && event.event;
    if (name === 'payment.captured' || name === 'order.paid') {
      const entity = event.payload && event.payload.payment && event.payload.payment.entity;
      const orderEntity = event.payload && event.payload.order && event.payload.order.entity;
      const orderId = (entity && entity.order_id) || (orderEntity && orderEntity.id);
      const paymentId = entity && entity.id;
      if (orderId) {
        const { rows } = await db.query(
          "select id from payments where provider_ref = $1 and provider = 'razorpay' and status = 'pending'",
          [String(orderId).slice(0, 80)]
        );
        if (rows[0] && (await pay.markPaid(rows[0].id, null, paymentId ? String(paymentId).slice(0, 80) : null))) {
          await pay.afterPaid(rows[0].id, req);
        }
      }
    }
    return { body: { ok: true } };
  },
});
