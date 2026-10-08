'use strict';
const db = require('../lib/db');
const { query } = require('../lib/http');

// Serves uploaded images. Files are immutable (new upload, new id), so they cache for a year.
module.exports = async function handler(req, res) {
  const id = query(req).get('id') || '';
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)) {
    res.statusCode = 404;
    return res.end('Not found');
  }
  try {
    const { rows } = await db.query("select content_type, encode(data, 'base64') as b64 from media where id = $1", [id]);
    if (!rows[0]) {
      res.statusCode = 404;
      return res.end('Not found');
    }
    const bytes = Buffer.from(rows[0].b64, 'base64');
    res.statusCode = 200;
    res.setHeader('Content-Type', rows[0].content_type);
    res.setHeader('Content-Length', bytes.length);
    res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox");
    res.end(req.method === 'HEAD' ? undefined : bytes);
  } catch (err) {
    console.error('media error:', err.message);
    res.statusCode = 500;
    res.end('Error');
  }
};
