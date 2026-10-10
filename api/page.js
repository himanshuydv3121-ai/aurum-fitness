'use strict';
const page = require('../lib/page');
const { query, send } = require('../lib/http');

// Serves every HTML page. vercel.json rewrites /about to /api/page?name=about and so on.
module.exports = async function handler(req, res) {
  const name = query(req).get('name') || 'index';
  try {
    const out = await page.render(name, name === 'index' ? '/' : '/' + name);
    if (!out) return send(res, 404, { error: 'Not found.' });
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    // Owner edits show up within about 15 seconds. Private pages are never cached.
    res.setHeader('Cache-Control', out.private ? 'no-store' : 'public, max-age=0, s-maxage=15, stale-while-revalidate=60');
    res.end(out.html);
  } catch (err) {
    console.error('page render failed:', err.message);
    res.statusCode = 500;
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    res.end('Something went wrong. Please try again.');
  }
};
