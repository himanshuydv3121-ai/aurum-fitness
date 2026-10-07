'use strict';
const { listRoute } = require('../lib/content');

module.exports = listRoute(
  'select slug, name, initials, role, bio, cert, color from trainers order by sort',
  'trainers'
);
