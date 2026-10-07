'use strict';
const { listRoute } = require('../lib/content');

module.exports = listRoute(
  `select slug, name, tag, monthly_price as "monthlyPrice", annual_price as "annualPrice",
          featured, features, excluded
   from plans order by sort`,
  'plans'
);
