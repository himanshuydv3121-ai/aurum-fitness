'use strict';
// Site settings and owner text edits. Both live in one table (site_content) and are cached
// briefly in memory so a page view does not need a query every time.

const db = require('./db');

const THEME_KEYS = ['gold', 'gold_hi', 'gold_lo', 'ink', 'coal', 'bone'];

// Built-in defaults. Only values that differ are stored in the database.
const DEFAULTS = {
  'cfg.require_membership': 'false',
  'cfg.cancel_hours': '4',
  'cfg.window_days': '30',
  'cfg.timezone': 'Asia/Kolkata',
  'cfg.notify_email': '',
  'cfg.brand_name': 'AURUM Fitness',
  'cfg.interests': 'Strength\nConditioning\nMind and Body\nRecovery\nNot sure yet',
  'cfg.slots': 'Morning, 05:00 to 09:00\nMidday, 11:00 to 15:00\nEvening, 17:00 to 21:00',
  'theme.gold': '#d6b25e',
  'theme.gold_hi': '#f2d98f',
  'theme.gold_lo': '#8f7433',
  'theme.ink': '#0b0a08',
  'theme.coal': '#12100d',
  'theme.bone': '#efe8da',
  'social.instagram': '',
  'social.facebook': '',
  'social.youtube': '',
  'social.x': '',
  'social.whatsapp': '',
};

// Pages that can have their own search title and description.
const SEO_PAGES = ['index', 'about', 'programs', 'trainers', 'membership', 'contact'];

let cache = null;
let cachedAt = 0;
const TTL_MS = 10000;

async function load() {
  if (cache && Date.now() - cachedAt < TTL_MS) return cache;
  try {
    const { rows } = await db.query('select key, value from site_content');
    cache = new Map(rows.map((r) => [r.key, r.value]));
    cachedAt = Date.now();
  } catch (err) {
    // Before the first migration the table does not exist. Fall back to defaults.
    if (!cache) cache = new Map();
    cachedAt = Date.now() - TTL_MS + 2000;
  }
  return cache;
}

function invalidate() {
  cache = null;
  cachedAt = 0;
}

async function get(key) {
  const m = await load();
  return m.has(key) ? m.get(key) : DEFAULTS[key];
}

// All settings (not text edits), with defaults filled in.
async function settings() {
  const m = await load();
  const out = {};
  Object.keys(DEFAULTS).forEach((k) => { out[k] = m.has(k) ? m.get(k) : DEFAULTS[k]; });
  SEO_PAGES.forEach((p) => {
    ['title', 'description'].forEach((f) => {
      const k = 'seo.' + p + '.' + f;
      out[k] = m.has(k) ? m.get(k) : '';
    });
  });
  return out;
}

// Text edits only (keys that look like page text, not settings).
async function textEdits() {
  const m = await load();
  const out = {};
  m.forEach((v, k) => {
    if (!/^(cfg|theme|social|seo|seed)\./.test(k)) out[k] = v;
  });
  return out;
}

async function rules() {
  const s = await settings();
  const hours = Number(s['cfg.cancel_hours']);
  const days = Number(s['cfg.window_days']);
  return {
    requireMembership: s['cfg.require_membership'] === 'true',
    cancelHours: Number.isFinite(hours) ? hours : 4,
    windowDays: Number.isFinite(days) && days > 0 ? Math.min(days, 90) : 30,
    timezone: s['cfg.timezone'] || 'Asia/Kolkata',
  };
}

function lines(value) {
  return String(value || '').split(/\r?\n/).map((s) => s.trim()).filter(Boolean);
}

module.exports = { DEFAULTS, THEME_KEYS, SEO_PAGES, load, invalidate, get, settings, textEdits, rules, lines };
