'use strict';
const { dispatch } = require('../lib/http');

module.exports = dispatch({
  signup: require('../lib/routes/auth/signup'),
  login: require('../lib/routes/auth/login'),
  logout: require('../lib/routes/auth/logout'),
  me: require('../lib/routes/auth/me'),
});
