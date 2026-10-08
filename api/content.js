'use strict';
const { listRoute } = require('../lib/content');
const { dispatch, route } = require('../lib/http');
const settings = require('../lib/settings');
const pay = require('../lib/payments');
const mail = require('../lib/mail');

module.exports = dispatch({
  programs: listRoute(
    `select slug, name, category, category_label as "categoryLabel", icon, description,
            duration, level, schedule, coach, featured
     from programs where active order by sort, name`,
    'programs'
  ),
  trainers: listRoute(
    'select slug, name, initials, role, bio, cert, color, photo from trainers where active order by sort, name',
    'trainers'
  ),
  plans: listRoute(
    `select slug, name, tag, monthly_price as "monthlyPrice", annual_price as "annualPrice",
            featured, features, excluded
     from plans where active order by sort, name`,
    'plans'
  ),
  // Settings the public pages need. Nothing private here.
  settings: route({
    GET: async () => {
      const s = await settings.settings();
      const r = await settings.rules();
      return {
        body: {
          interests: settings.lines(s['cfg.interests']),
          slots: settings.lines(s['cfg.slots']),
          timezone: r.timezone,
          windowDays: r.windowDays,
          cancelHours: r.cancelHours,
          requireMembership: r.requireMembership,
          paymentProvider: pay.providerName(),
          emailEnabled: mail.configured(),
        },
        opts: { cache: 'public, s-maxage=30, stale-while-revalidate=120' },
      };
    },
  }),
});
