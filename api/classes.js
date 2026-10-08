'use strict';
const { dispatch } = require('../lib/http');

module.exports = dispatch({
  sessions: require('../lib/routes/classes/sessions'),
  book: require('../lib/routes/classes/book'),
  cancel: require('../lib/routes/classes/cancel'),
  mine: require('../lib/routes/classes/mine'),
});
