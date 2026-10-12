'use strict';
// Security headers shared by the page renderer, the API helper and the dev server.
// vercel.json carries the same set for static files; tests/security.test.js keeps the two in step.

// Hash of the one inline script every page carries: document.documentElement.classList.add("js")
const INLINE_SCRIPT_HASH = "'sha256-qOhFsq0QMV2REqNwk5hGH5bZE9SkX6gt6yeyKdYPv+U='";

const CSP = [
  "default-src 'self'",
  "script-src 'self' " + INLINE_SCRIPT_HASH + ' https://checkout.razorpay.com',
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' https://fonts.gstatic.com",
  "img-src 'self' data: blob: https://*.razorpay.com",
  "connect-src 'self' https://api.razorpay.com https://lumberjack.razorpay.com",
  'frame-src https://api.razorpay.com https://checkout.razorpay.com',
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  'upgrade-insecure-requests',
].join('; ');

const HEADERS = {
  'Strict-Transport-Security': 'max-age=63072000; includeSubDomains',
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(self "https://checkout.razorpay.com")',
  'Cross-Origin-Opener-Policy': 'same-origin-allow-popups',
  'X-Permitted-Cross-Domain-Policies': 'none',
};

function apply(res) {
  for (const k of Object.keys(HEADERS)) res.setHeader(k, HEADERS[k]);
}

module.exports = { HEADERS, CSP, apply };
