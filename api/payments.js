'use strict';
const { dispatch } = require('../lib/http');

module.exports = dispatch({
  checkout: require('../lib/routes/payments/checkout'),
  confirm: require('../lib/routes/payments/confirm'),
  status: require('../lib/routes/payments/status'),
});
