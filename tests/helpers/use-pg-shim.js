'use strict';
// Preload with `node -r ./tests/helpers/use-pg-shim.js ...` to run against the test-only pg shim
// when the real `pg` package cannot be installed. Does nothing when `pg` is available.
try {
  require.resolve('pg');
} catch (e) {
  const Module = require('module');
  const shim = require.resolve('./pg-shim');
  const original = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    return request === 'pg' ? shim : original.call(this, request, ...rest);
  };
}
