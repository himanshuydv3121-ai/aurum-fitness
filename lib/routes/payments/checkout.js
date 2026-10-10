'use strict';
const db = require('../../db');
const auth = require('../../auth');
const pay = require('../../payments');
const notify = require('../../notify');
const v = require('../../validate');
const { route, readJson, HttpError } = require('../../http');

module.exports = route({
  POST: async (req) => {
    const member = await auth.requireMember(req);
    const body = await readJson(req);
    const slug = v.str(body.plan, 'Plan', { max: 40 });
    const billing = v.oneOf(body.billing, 'billing period', ['monthly', 'annual']);

    // The price always comes from the database, never from the browser.
    const { rows } = await db.query('select slug, name, monthly_price, annual_price from plans where slug = $1 and active', [slug]);
    const plan = rows[0];
    if (!plan) throw new HttpError(404, 'That plan does not exist.');

    if (!(await db.rateLimit('checkout:' + member.id, 20, 3600))) {
      throw new HttpError(429, 'Too many checkout attempts. Please try again later.');
    }

    const provider = pay.activeProvider();
    const amount = pay.chargeFor(plan, billing);
    const { ref, client } = await provider.impl.create({ member, plan, billing, amount });

    const ins = await db.query(
      `insert into payments (member_id, plan_slug, billing, amount_minor, currency, provider, provider_ref)
       values ($1,$2,$3,$4,'INR',$5,$6) returning id, status`,
      [member.id, plan.slug, billing, amount, provider.name, ref]
    );
    if (provider.name === 'offline') {
      await notify.offlineOrder(
        { email: member.email, fullName: member.full_name },
        { amount_minor: amount, currency: 'INR', billing, provider_ref: ref },
        plan.name,
        req
      );
    }
    return {
      status: 201,
      body: {
        payment: {
          id: ins.rows[0].id, ref, status: ins.rows[0].status, provider: provider.name,
          plan: plan.slug, planName: plan.name, billing, amountMinor: amount, currency: 'INR',
        },
        client: client || null,
        checkoutUrl: '/checkout?ref=' + encodeURIComponent(ref),
      },
    };
  },
});
