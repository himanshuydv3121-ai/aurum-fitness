'use strict';
// TEST-ONLY stand-in for the `pg` package.
//
// The integration tests use the real `pg` driver whenever it is installed. This shim is used only
// when `pg` cannot be installed (for example in a locked-down sandbox). It speaks just enough of the
// Postgres wire protocol (simple query, trust authentication, no TLS) to run the project's real
// SQL against a local Postgres. It is never loaded by the application itself.

const net = require('net');
const { EventEmitter } = require('events');

function literal(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'number') {
    if (!Number.isFinite(v)) throw new Error('Non-finite number parameter');
    return String(v);
  }
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (v instanceof Date) return "'" + v.toISOString() + "'";
  const s = typeof v === 'object' ? JSON.stringify(v) : String(v);
  if (s.indexOf('\0') !== -1) throw new Error('NUL byte in parameter');
  return "'" + s.replace(/'/g, "''") + "'";
}

function inline(text, params) {
  if (!params || !params.length) return text;
  return text.replace(/\$(\d+)/g, (m, n) => {
    const i = Number(n) - 1;
    if (i >= params.length) throw new Error('Missing parameter $' + n);
    return literal(params[i]);
  });
}

function convert(oid, text) {
  if (text === null) return null;
  switch (oid) {
    case 16: return text === 't';
    case 21: case 23: case 26: return Number(text);
    case 700: case 701: return Number(text);
    case 114: case 3802: return JSON.parse(text);
    case 1184: case 1114:
      return new Date(text.replace(' ', 'T').replace(/([+-]\d\d)$/, '$1:00') + (oid === 1114 ? 'Z' : ''));
    default: return text;
  }
}

class Client {
  constructor(cfg) {
    this.cfg = cfg;
    this.buf = Buffer.alloc(0);
    this.chain = Promise.resolve();
    this.pending = null;
  }

  connect() {
    return new Promise((resolve, reject) => {
      const sock = net.connect({ host: this.cfg.host, port: this.cfg.port });
      this.sock = sock;
      this.ready = { resolve, reject };
      sock.on('error', (err) => {
        if (this.ready) { this.ready.reject(err); this.ready = null; }
        else if (this.pending) { this.pending.reject(err); this.pending = null; }
      });
      sock.on('data', (d) => { this.buf = Buffer.concat([this.buf, d]); this.drain(); });
      const params = 'user\0' + this.cfg.user + '\0database\0' + this.cfg.database + '\0\0';
      const body = Buffer.from(params);
      const head = Buffer.alloc(8);
      head.writeInt32BE(8 + body.length, 0);
      head.writeInt32BE(196608, 4);
      sock.write(Buffer.concat([head, body]));
    });
  }

  drain() {
    while (this.buf.length >= 5) {
      const type = String.fromCharCode(this.buf[0]);
      const len = this.buf.readInt32BE(1);
      if (this.buf.length < 1 + len) return;
      const payload = this.buf.subarray(5, 1 + len);
      this.buf = this.buf.subarray(1 + len);
      this.handle(type, payload);
    }
  }

  handle(type, p) {
    if (type === 'R') {
      if (p.readInt32BE(0) !== 0) {
        const err = new Error('pg-shim only supports trust authentication');
        if (this.ready) { this.ready.reject(err); this.ready = null; }
      }
    } else if (type === 'Z') {
      if (this.ready) { this.ready.resolve(); this.ready = null; }
      else if (this.pending) {
        const q = this.pending;
        this.pending = null;
        if (q.error) q.reject(q.error); else q.resolve(q.result);
      }
    } else if (!this.pending) {
      // startup chatter such as ParameterStatus and BackendKeyData
    } else if (type === 'T') {
      const q = this.pending;
      let o = 2;
      q.fields = [];
      for (let i = 0; i < p.readInt16BE(0); i++) {
        const end = p.indexOf(0, o);
        const name = p.toString('utf8', o, end);
        o = end + 1;
        const oid = p.readInt32BE(o + 6);
        o += 18;
        q.fields.push({ name, oid });
      }
      q.result = { rows: [], rowCount: 0, fields: q.fields };
    } else if (type === 'D') {
      const q = this.pending;
      let o = 2;
      const row = {};
      for (let i = 0; i < p.readInt16BE(0); i++) {
        const l = p.readInt32BE(o);
        o += 4;
        let text = null;
        if (l >= 0) { text = p.toString('utf8', o, o + l); o += l; }
        row[q.fields[i].name] = convert(q.fields[i].oid, text);
      }
      q.result.rows.push(row);
    } else if (type === 'C') {
      const q = this.pending;
      const tag = p.toString('utf8', 0, p.length - 1);
      const n = Number(tag.split(' ').pop());
      const rows = q.result ? q.result.rows : [];
      q.result = { rows, rowCount: Number.isFinite(n) ? n : rows.length, command: tag.split(' ')[0] };
      q.fields = null;
    } else if (type === 'E') {
      const q = this.pending;
      const err = new Error('Postgres error');
      let o = 0;
      while (o < p.length && p[o] !== 0) {
        const code = String.fromCharCode(p[o]);
        const end = p.indexOf(0, o + 1);
        const val = p.toString('utf8', o + 1, end);
        o = end + 1;
        if (code === 'M') err.message = val;
        if (code === 'C') err.code = val;
      }
      q.error = err;
    }
  }

  query(text, params) {
    const sql = inline(text, params);
    const run = () => new Promise((resolve, reject) => {
      this.pending = { resolve, reject, result: { rows: [], rowCount: 0 }, error: null };
      const body = Buffer.from(sql + '\0');
      const head = Buffer.alloc(5);
      head[0] = 'Q'.charCodeAt(0);
      head.writeInt32BE(4 + body.length, 1);
      this.sock.write(Buffer.concat([head, body]));
    });
    const next = this.chain.then(run, run);
    this.chain = next.catch(() => {});
    return next;
  }

  release() { this.sock.end(); }
  end() { this.sock.end(); return Promise.resolve(); }
}

class Pool extends EventEmitter {
  constructor(opts) {
    super();
    const u = new URL(opts.connectionString);
    this.cfg = {
      host: u.hostname,
      port: Number(u.port) || 5432,
      user: decodeURIComponent(u.username || 'postgres'),
      database: u.pathname.slice(1) || 'postgres',
    };
    this.shared = null;
  }

  async connect() {
    const c = new Client(this.cfg);
    await c.connect();
    return c;
  }

  async query(text, params) {
    if (!this.shared) {
      const c = new Client(this.cfg);
      this.shared = c.connect().then(() => c);
    }
    return (await this.shared).query(text, params);
  }

  async end() {
    if (this.shared) { const c = await this.shared; this.shared = null; await c.end(); }
  }
}

module.exports = { Pool };
