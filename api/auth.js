'use strict';
const { dispatch } = require('../lib/http');

module.exports = dispatch({
  signup: require('../lib/routes/auth/signup'),
  login: require('../lib/routes/auth/login'),
  logout: require('../lib/routes/auth/logout'),
  me: require('../lib/routes/auth/me'),
  forgot: require('../lib/routes/auth/forgot'),
  reset: require('../lib/routes/auth/reset'),
  profile: require('../lib/routes/auth/profile'),
  password: require('../lib/routes/auth/password'),
});
