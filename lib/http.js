'use strict';
const crypto = require('crypto');

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function send(res, status, body, opts) {
  opts = opts || {};
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', opts.cache || 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.end(JSON.stringify(body));
}

const MAX_BODY = 20 * 1024;

async function readJson(req) {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
    try {
      return JSON.parse(Buffer.isBuffer(req.body) ? req.body.toString('utf8') : String(req.body));
    } catch (e) {
      throw new HttpError(400, 'Request body must be valid JSON.');
    }
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request body is too large.');
    chunks.push(chunk);
  }
  if (!size) throw new HttpError(400, 'Request body is empty.');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch (e) {
    throw new HttpError(400, 'Request body must be valid JSON.');
  }
}

function secret() {
  const s = process.env.SESSION_SECRET;
  if (s && s.length >= 16) return s;
  if (process.env.VERCEL || process.env.NODE_ENV === 'production') {
    throw new Error('SESSION_SECRET is not set');
  }
  return 'dev-only-secret-do-not-use-in-production';
}

function clientIp(req) {
  const fwd = req.headers['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return (req.socket && req.socket.remoteAddress) || 'unknown';
}

function ipHash(req) {
  return crypto.createHmac('sha256', secret()).update(clientIp(req)).digest('hex').slice(0, 32);
}

// Blocks cross-site form posts. Browsers send Origin on every non-GET fetch.
function checkOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const host = req.headers['x-forwarded-host'] || req.headers.host;
  let originHost;
  try { originHost = new URL(origin).host; } catch (e) { throw new HttpError(403, 'Bad origin.'); }
  if (originHost !== host) throw new HttpError(403, 'Cross-origin requests are not allowed.');
}

// route({ GET: fn, POST: fn }) returns a (req, res) handler.
function route(methods) {
  return async function handler(req, res) {
    try {
      const m = req.method === 'HEAD' ? 'GET' : req.method;
      const fn = methods[m];
      if (!fn) {
        res.setHeader('Allow', Object.keys(methods).join(', '));
        return send(res, 405, { error: 'Method not allowed.' });
      }
      if (m !== 'GET') checkOrigin(req);
      const out = await fn(req, res);
      if (out && !res.writableEnded) send(res, out.status || 200, out.body, out.opts);
    } catch (err) {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      console.error('API error:', err && err.stack ? err.stack : err);
      send(res, 500, { error: 'Something went wrong on our side. Please try again.' });
    }
  };
}

function query(req) {
  return new URL(req.url, 'http://localhost').searchParams;
}

// Groups several endpoints into one serverless function. vercel.json rewrites
// /api/<group>/<name> to /api/<group>?action=<name>, so public URLs stay the same.
function dispatch(table) {
  return function handler(req, res) {
    const action = query(req).get('action');
    const target = action && Object.prototype.hasOwnProperty.call(table, action) ? table[action] : null;
    if (!target) return send(res, 404, { error: 'Not found.' });
    return target(req, res);
  };
}

module.exports = { HttpError, send, readJson, route, dispatch, ipHash, clientIp, query, secret };
