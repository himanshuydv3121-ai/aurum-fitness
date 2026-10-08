'use strict';
// Local development server. On Vercel the files in /api run as serverless functions and
// /public is served statically. This file reproduces that so you can run everything locally.

const http = require('http');
const fs = require('fs');
const path = require('path');

try { process.loadEnvFile && fs.existsSync('.env') && process.loadEnvFile('.env'); } catch (e) { /* no .env */ }

const PUBLIC_DIR = path.join(__dirname, 'public');
const API_DIR = path.join(__dirname, 'api');
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.json': 'application/json; charset=utf-8',
};

// Mirrors the rewrites in vercel.json so local URLs match production.
function rewrite(pathname, search) {
  let m = pathname.match(/^\/api\/(programs|trainers|plans|settings)\/?$/);
  if (m) return { pathname: '/api/content', search: 'action=' + m[1] + (search ? '&' + search : '') };
  m = pathname.match(/^\/media\/([0-9a-f-]{36})\/?$/);
  if (m) return { pathname: '/api/media', search: 'id=' + m[1] + (search ? '&' + search : '') };
  m = pathname.match(/^\/api\/(auth|payments|admin|classes|newsletter)\/([a-z]+)\/?$/);
  if (m) return { pathname: '/api/' + m[1], search: 'action=' + m[2] + (search ? '&' + search : '') };
  return { pathname, search };
}

function createServer() {
  return http.createServer(async (req, res) => {
    let pathname;
    try {
      const u = new URL(req.url, 'http://localhost');
      pathname = decodeURIComponent(u.pathname);
      if (pathname.startsWith('/api/') || pathname.startsWith('/media/')) {
        const r = rewrite(pathname, u.search.replace(/^\?/, ''));
        pathname = r.pathname;
        req.url = r.pathname + (r.search ? '?' + r.search : '');
      }
    } catch (e) {
      res.statusCode = 400;
      return res.end('Bad request');
    }

    if (pathname.startsWith('/api/')) {
      const name = pathname.slice(5).replace(/\/$/, '');
      if (!/^[a-z][a-z0-9\-/]*$/.test(name)) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        return res.end('{"error":"Not found."}');
      }
      const file = path.join(API_DIR, name + '.js');
      if (!file.startsWith(API_DIR + path.sep) || !fs.existsSync(file)) {
        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        return res.end('{"error":"Not found."}');
      }
      return require(file)(req, res);
    }

    let rel = pathname === '/' ? '/index.html' : pathname;
    const file = path.join(PUBLIC_DIR, rel);
    if (!file.startsWith(PUBLIC_DIR + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain');
      return res.end('Not found');
    }
    res.setHeader('Content-Type', TYPES[path.extname(file)] || 'application/octet-stream');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    fs.createReadStream(file).pipe(res);
  });
}

module.exports = { createServer };

if (require.main === module) {
  const port = Number(process.env.PORT) || 3000;
  createServer().listen(port, () => console.log('AURUM running at http://localhost:' + port));
}
