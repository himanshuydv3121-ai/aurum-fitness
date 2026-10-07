'use strict';
const { listRoute } = require('../lib/content');
const { dispatch } = require('../lib/http');

module.exports = dispatch({
  programs: listRoute(
    `select slug, name, category, category_label as "categoryLabel", icon, description,
            duration, level, schedule, coach
     from programs order by sort`,
    'programs'
  ),
  trainers: listRoute(
    'select slug, name, initials, role, bio, cert, color from trainers order by sort',
    'trainers'
  ),
  plans: listRoute(
    `select slug, name, tag, monthly_price as "monthlyPrice", annual_price as "annualPrice",
            featured, features, excluded
     from plans order by sort`,
    'plans'
  ),
});
