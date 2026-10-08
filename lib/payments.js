'use strict';
// Payment provider layer.
//
// PAYMENT_PROVIDER selects how members pay:
//   test      Records a pending payment and lets the member confirm it on the checkout page.
//             No card is charged and no money moves. For trying the site out.
//   offline   Reserves the plan. The member pays at the front desk and the owner marks the
//             payment paid in the admin panel. Needs no payment account.
//   razorpay  Real payments through Razorpay Checkout (UPI, cards, netbanking). Needs
//             RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET. Add RAZORPAY_WEBHOOK_SECRET and point a
//             Razorpay webhook at /api/payments/webhook so payments settle even if the member
//             closes the browser before returning to the site.

const crypto = require('crypto');
const db = require('./db');
const notify = require('./notify');
const { HttpError } = require('./http');

function razorpayBase() {
  return (process.env.RAZORPAY_API_BASE || 'https://api.razorpay.com/v1').replace(/\/+$/, '');
}

function razorpayConfigured() {
  return !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

const providers = {
  test: {
    async create() {
      return { ref: 'test_' + crypto.randomBytes(12).toString('hex') };
    },
  },

  offline: {
    async create() {
      return { ref: 'AUR-' + crypto.randomBytes(4).toString('hex').toUpperCase() };
    },
  },

  razorpay: {
    async create({ member, plan, billing, amount }) {
      if (!razorpayConfigured()) throw new HttpError(501, 'Online payments are not set up yet.');
      const auth = Buffer.from(process.env.RAZORPAY_KEY_ID + ':' + process.env.RAZORPAY_KEY_SECRET).toString('base64');
      let res;
      try {
        res = await fetch(razorpayBase() + '/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: 'Basic ' + auth },
          body: JSON.stringify({
            amount,
            currency: 'INR',
            receipt: 'aur_' + crypto.randomBytes(6).toString('hex'),
            notes: { plan: plan.slug, billing, member: member.id },
          }),
        });
      } catch (err) {
        throw new HttpError(502, 'The payment service is unreachable. Please try again.');
      }
      if (!res.ok) {
        console.error('Razorpay order failed:', res.status, await res.text().catch(() => ''));
        throw new HttpError(502, 'The payment service refused the request. Please try again.');
      }
      const order = await res.json();
      return {
        ref: order.id,
        client: { keyId: process.env.RAZORPAY_KEY_ID, orderId: order.id, amount: order.amount, currency: order.currency },
      };
    },
  },
};

function providerName() {
  return process.env.PAYMENT_PROVIDER || 'test';
}

function activeProvider() {
  const name = providerName();
  const p = providers[name];
  if (!p) throw new HttpError(501, 'Payment provider "' + name + '" is not configured.');
  return { name, impl: p };
}

// Charge amount in paise. Monthly bills one month. Annual bills twelve months at the annual rate.
function chargeFor(plan, billing) {
  const rupees = billing === 'annual' ? plan.annual_price * 12 : plan.monthly_price;
  return rupees * 100;
}

// Marks a pending payment paid and activates the member's plan, all in one transaction.
// memberId is optional: a webhook knows the payment but not who is signed in.
async function markPaid(paymentId, memberId, providerPaymentId) {
  return db.tx(async (client) => {
    const { rows } = await client.query(
      `update payments set status = 'paid', paid_at = now(), provider_payment_id = coalesce($3, provider_payment_id)
       where id = $1 and ($2::uuid is null or member_id = $2::uuid) and status = 'pending'
       returning member_id, plan_slug, billing`,
      [paymentId, memberId || null, providerPaymentId || null]
    );
    if (!rows[0]) return null;
    const { member_id, plan_slug, billing } = rows[0];
    const interval = billing === 'annual' ? '1 year' : '1 month';
    await client.query(
      `update members set plan_slug = $2, billing = $3, membership_status = 'active',
         membership_until = (case when membership_status = 'active' and membership_until > now()
                                  then membership_until else now() end) + $4::interval
       where id = $1`,
      [member_id, plan_slug, billing, interval]
    );
    return rows[0];
  });
}

async function markFailed(paymentId, memberId) {
  const { rowCount } = await db.query(
    "update payments set status = 'failed' where id = $1 and member_id = $2 and status = 'pending'",
    [paymentId, memberId]
  );
  return rowCount === 1;
}

// Sends the receipt and the owner alert after a payment settles. Never throws.
async function afterPaid(paymentId, req) {
  try {
    const { rows } = await db.query(
      `select p.provider_ref, p.billing, p.amount_minor, p.currency, pl.name as plan_name,
              m.email, m.full_name as "fullName"
       from payments p join plans pl on pl.slug = p.plan_slug join members m on m.id = p.member_id
       where p.id = $1`,
      [paymentId]
    );
    const r = rows[0];
    if (!r) return;
    await notify.paymentReceipt({ email: r.email, fullName: r.fullName }, r, r.plan_name, req);
  } catch (err) {
    console.error('Receipt email failed:', err.message);
  }
}

function safeEqualHex(a, b) {
  const x = Buffer.from(String(a || ''), 'utf8');
  const y = Buffer.from(String(b || ''), 'utf8');
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}

// Razorpay returns razorpay_signature = HMAC_SHA256(order_id + "|" + payment_id, key_secret).
function verifyCheckoutSignature(orderId, paymentId, signature) {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(orderId + '|' + paymentId).digest('hex');
  return safeEqualHex(expected, signature);
}

// Webhook signature = HMAC_SHA256(raw request body, webhook secret).
function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
  return safeEqualHex(expected, signature);
}

module.exports = {
  providerName, activeProvider, chargeFor, markPaid, markFailed, afterPaid, razorpayConfigured,
  verifyCheckoutSignature, verifyWebhookSignature,
};
