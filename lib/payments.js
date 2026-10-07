'use strict';
// Payment provider layer.
//
// Only a "test" provider ships with the project. It records a pending payment and lets the
// signed-in member confirm or fail it from the checkout page. No card data is collected and
// no money moves.
//
// To go live, add an entry to `providers` for Razorpay or Stripe that:
//   create(payment)  -> creates an order with the provider and returns { ref, checkoutUrl }
// then verify the provider's webhook signature in a new api/payments/webhook.js route and mark
// the payment paid with markPaid(). Keep secret keys in environment variables only.

const crypto = require('crypto');
const db = require('./db');
const { HttpError } = require('./http');

const providers = {
  test: {
    async create() {
      return { ref: 'test_' + crypto.randomBytes(12).toString('hex') };
    },
  },
};

function activeProvider() {
  const name = process.env.PAYMENT_PROVIDER || 'test';
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
async function markPaid(paymentId, memberId) {
  return db.tx(async (client) => {
    const { rows } = await client.query(
      "update payments set status = 'paid', paid_at = now() where id = $1 and member_id = $2 and status = 'pending' returning plan_slug, billing",
      [paymentId, memberId]
    );
    if (!rows[0]) return null;
    const { plan_slug, billing } = rows[0];
    const interval = billing === 'annual' ? '1 year' : '1 month';
    await client.query(
      `update members set plan_slug = $2, billing = $3, membership_status = 'active',
         membership_until = (case when membership_status = 'active' and membership_until > now()
                                  then membership_until else now() end) + $4::interval
       where id = $1`,
      [memberId, plan_slug, billing, interval]
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

module.exports = { activeProvider, chargeFor, markPaid, markFailed };
