'use strict';
const { HttpError } = require('./http');

const EMAIL_RE = /^[^\s@]{1,64}@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^[0-9+()\-\s]{6,20}$/;

function str(value, field, { min = 0, max = 200, required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, field + ' is required.');
    return '';
  }
  if (typeof value !== 'string') throw new HttpError(400, field + ' must be text.');
  const v = value.trim();
  if (required && v.length < Math.max(min, 1)) throw new HttpError(400, field + ' is required.');
  if (v.length && v.length < min) throw new HttpError(400, field + ' must be at least ' + min + ' characters.');
  if (v.length > max) throw new HttpError(400, field + ' must be at most ' + max + ' characters.');
  return v;
}

function email(value) {
  const v = str(value, 'Email', { max: 254 }).toLowerCase();
  if (!EMAIL_RE.test(v)) throw new HttpError(400, 'Enter a valid email address.');
  return v;
}

function phone(value) {
  const v = str(value, 'Phone', { required: false, max: 20 });
  if (v && !PHONE_RE.test(v)) throw new HttpError(400, 'Enter a valid phone number.');
  return v;
}

function oneOf(value, field, allowed, { required = true } = {}) {
  if ((value === undefined || value === null || value === '') && !required) return '';
  if (typeof value !== 'string' || allowed.indexOf(value) === -1) {
    throw new HttpError(400, 'Choose a valid ' + field + '.');
  }
  return value;
}

function password(value) {
  if (typeof value !== 'string') throw new HttpError(400, 'Password is required.');
  if (value.length < 10) throw new HttpError(400, 'Password must be at least 10 characters.');
  if (value.length > 200) throw new HttpError(400, 'Password must be at most 200 characters.');
  return value;
}

function uuid(value, field) {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)) {
    throw new HttpError(400, 'Invalid ' + field + '.');
  }
  return value;
}

function int(value, field, { min = 0, max = 1000000000, required = true } = {}) {
  if (value === undefined || value === null || value === '') {
    if (required) throw new HttpError(400, field + ' is required.');
    return null;
  }
  const n = typeof value === 'number' ? value : Number(String(value).trim());
  if (!Number.isInteger(n)) throw new HttpError(400, field + ' must be a whole number.');
  if (n < min || n > max) throw new HttpError(400, field + ' must be between ' + min + ' and ' + max + '.');
  return n;
}

function bool(value) {
  return value === true || value === 'true' || value === 1 || value === '1';
}

function slugify(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

// Images are either an uploaded file (/media/<id>) or an https address. Empty is allowed.
function image(value, field) {
  const v = str(value, field, { required: false, max: 500 });
  if (!v) return '';
  if (/^\/media\/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)) return v;
  if (/^https:\/\/[^\s"'<>]+$/i.test(v)) return v;
  throw new HttpError(400, field + ' must be an uploaded image or an https link.');
}

function webUrl(value, field) {
  const v = str(value, field, { required: false, max: 300 });
  if (v && !/^https:\/\/[^\s"'<>]+$/i.test(v)) throw new HttpError(400, field + ' must start with https://');
  return v;
}

function hexColor(value, field) {
  const v = str(value, field, { max: 7 });
  if (!/^#[0-9a-f]{6}$/i.test(v)) throw new HttpError(400, field + ' must be a colour like #d6b25e.');
  return v.toLowerCase();
}

function timeOfDay(value, field) {
  const v = str(value, field, { required: false, max: 5 });
  if (!v) return '';
  if (!/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new HttpError(400, field + ' must look like 06:30.');
  return v;
}

// Days of the week as numbers 0 (Sunday) to 6 (Saturday). Returns a comma list such as "1,3,5".
function weekdays(value) {
  const list = Array.isArray(value) ? value : String(value || '').split(',').filter(Boolean);
  const set = new Set();
  list.forEach((d) => {
    const n = Number(d);
    if (!Number.isInteger(n) || n < 0 || n > 6) throw new HttpError(400, 'Days must be between Sunday and Saturday.');
    set.add(n);
  });
  return Array.from(set).sort((a, b) => a - b).join(',');
}

function timezone(value) {
  const v = str(value, 'Time zone', { max: 60 });
  try { new Intl.DateTimeFormat('en', { timeZone: v }); } catch (e) { throw new HttpError(400, 'That time zone is not recognised.'); }
  return v;
}

module.exports = {
  str, email, phone, oneOf, password, uuid, int, bool, slugify, image, webUrl, hexColor, timeOfDay, weekdays, timezone,
};
