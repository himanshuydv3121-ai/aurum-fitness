'use strict';
const { dispatch } = require('../lib/http');

module.exports = dispatch({
  overview: require('../lib/routes/admin/overview'),
  bookings: require('../lib/routes/admin/bookings'),
  members: require('../lib/routes/admin/members'),
  payments: require('../lib/routes/admin/payments'),
});
