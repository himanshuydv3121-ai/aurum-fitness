'use strict';
const { dispatch } = require('../lib/http');

module.exports = dispatch({
  checkout: require('../lib/routes/payments/checkout'),
  confirm: require('../lib/routes/payments/confirm'),
  verify: require('../lib/routes/payments/verify'),
  webhook: require('../lib/routes/payments/webhook'),
  status: require('../lib/routes/payments/status'),
});
