'use strict';
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const security = require('../lib/security');

test('vercel.json carries the same security headers as lib/security.js', () => {
  const cfg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'vercel.json'), 'utf8'));
  const set = {};
  for (const h of cfg.headers[0].headers) set[h.key] = h.value;
  assert.deepStrictEqual(set, security.HEADERS);
});

test('CSP allows the inline script every page carries, and nothing unsafe for scripts', () => {
  const script = 'document.documentElement.classList.add("js")';
  const hash = "'sha256-" + crypto.createHash('sha256').update(script).digest('base64') + "'";
  assert.ok(security.CSP.includes(hash));
  const scriptSrc = security.CSP.split('; ').find((d) => d.startsWith('script-src'));
  assert.ok(!scriptSrc.includes('unsafe-inline') && !scriptSrc.includes('unsafe-eval'));
  for (const f of fs.readdirSync(path.join(__dirname, '..', 'templates')).filter((x) => /^[a-z]/.test(x) && !x.startsWith('_'))) {
    const html = fs.readFileSync(path.join(__dirname, '..', 'templates', f), 'utf8');
    const inline = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1]);
    for (const s of inline) assert.strictEqual(s, script, f + ' has an inline script the CSP would block');
  }
});

test('HSTS is set for two years', () => {
  assert.match(security.HEADERS['Strict-Transport-Security'], /max-age=63072000/);
});
