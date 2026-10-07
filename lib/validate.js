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

module.exports = { str, email, phone, oneOf, password, uuid };
