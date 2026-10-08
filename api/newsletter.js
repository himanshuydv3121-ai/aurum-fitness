'use strict';
const { dispatch } = require('../lib/http');

module.exports = dispatch({
  subscribe: require('../lib/routes/newsletter/subscribe'),
  unsubscribe: require('../lib/routes/newsletter/unsubscribe'),
});
