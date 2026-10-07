'use strict';
const { listRoute } = require('../lib/content');

module.exports = listRoute(
  `select slug, name, category, category_label as "categoryLabel", icon, description,
          duration, level, schedule, coach
   from programs order by sort`,
  'programs'
);
