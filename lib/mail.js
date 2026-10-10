'use strict';
// Email. Every message is recorded in the outbox table. When SMTP_URL is set the message is also
// sent; otherwise it is only logged, so the owner can still read it in the admin panel.
//
//   SMTP_URL    smtps://user:pass@smtp.gmail.com:465     (implicit TLS)
//               smtp://user:pass@smtp.example.com:587    (STARTTLS)
//               smtp+plain://localhost:2525              (no TLS, for tests only)
//   MAIL_FROM   "AURUM Fitness <hello@yourdomain.com>"   (defaults to the SMTP user)
//   OWNER_EMAIL where tour requests and new-member alerts go, unless set in admin Settings

const net = require('net');
const tls = require('tls');
const os = require('os');
const crypto = require('crypto');
const db = require('./db');
const settings = require('./settings');

// Must stay inside the 10 second serverless limit, because emails are sent while the request waits.
const TIMEOUT_MS = 7000;

function parseSmtpUrl(value) {
  if (!value) return null;
  let u;
  try { u = new URL(value); } catch (e) { return null; }
  const mode = u.protocol === 'smtps:' ? 'ssl' : u.protocol === 'smtp+plain:' ? 'plain' : u.protocol === 'smtp:' ? 'starttls' : null;
  if (!mode) return null;
  return {
    mode,
    host: u.hostname,
    port: Number(u.port) || (mode === 'ssl' ? 465 : mode === 'plain' ? 25 : 587),
    user: decodeURIComponent(u.username || ''),
    pass: decodeURIComponent(u.password || ''),
  };
}

function mimeWord(s) {
  return /^[\x20-\x7e]*$/.test(s) ? s : '=?UTF-8?B?' + Buffer.from(s, 'utf8').toString('base64') + '?=';
}

function address(value) {
  const m = String(value).match(/<([^>]+)>/);
  return (m ? m[1] : String(value)).trim();
}

function buildMessage({ from, to, subject, text }) {
  const body = Buffer.from(text.replace(/\r?\n/g, '\r\n'), 'utf8').toString('base64').replace(/(.{76})/g, '$1\r\n');
  const fromHeader = /<.+>/.test(from) ? from.replace(/^(.*?)\s*</, (m, name) => (name ? mimeWord(name.replace(/^"|"$/g, '')) + ' <' : '<')) : from;
  return [
    'From: ' + fromHeader,
    'To: ' + to,
    'Subject: ' + mimeWord(subject.replace(/[\r\n]+/g, ' ')),
    'Date: ' + new Date().toUTCString(),
    'Message-ID: <' + crypto.randomBytes(12).toString('hex') + '@' + (address(from).split('@')[1] || 'localhost') + '>',
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset=UTF-8',
    'Content-Transfer-Encoding: base64',
    '',
    body,
  ].join('\r\n');
}

// A small SMTP client: enough for transactional mail through a normal provider.
function smtpSend(cfg, { from, to, subject, text }) {
  return new Promise((resolve, reject) => {
    let sock;
    let buffer = '';
    let waiting = null;
    let done = false;
    const timer = setTimeout(() => fail(new Error('SMTP timed out')), TIMEOUT_MS);

    function fail(err) {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sock && sock.destroy(); } catch (e) { /* ignore */ }
      reject(err);
    }
    function finish() {
      if (done) return;
      done = true;
      clearTimeout(timer);
      try { sock.end(); } catch (e) { /* ignore */ }
      resolve();
    }

    function onData(chunk) {
      buffer += chunk.toString('utf8');
      for (;;) {
        const lines = buffer.split('\r\n');
        if (lines.length < 2) return;
        // A reply is complete when a line has a space (not a dash) after the 3-digit code.
        let end = -1;
        for (let i = 0; i < lines.length - 1; i++) {
          if (/^\d{3} /.test(lines[i]) || /^\d{3}$/.test(lines[i])) { end = i; break; }
        }
        if (end === -1) return;
        const reply = lines.slice(0, end + 1);
        buffer = lines.slice(end + 1).join('\r\n');
        const code = Number(reply[end].slice(0, 3));
        const w = waiting;
        waiting = null;
        if (w) w({ code, text: reply.join('\n') });
      }
    }

    function expect(okCodes) {
      return new Promise((res, rej) => {
        waiting = (r) => (okCodes.indexOf(r.code) !== -1 ? res(r) : rej(new Error('SMTP ' + r.text.slice(0, 200))));
      });
    }
    function cmd(line, okCodes) {
      const p = expect(okCodes);
      sock.write(line + '\r\n');
      return p;
    }

    async function conversation() {
      await expect([220]);
      const name = os.hostname() || 'localhost';
      let r = await cmd('EHLO ' + name, [250]);
      if (cfg.mode === 'starttls') {
        await cmd('STARTTLS', [220]);
        sock.removeListener('data', onData);
        sock = tls.connect({ socket: sock, servername: cfg.host });
        sock.on('data', onData);
        sock.on('error', fail);
        await new Promise((res, rej) => { sock.once('secureConnect', res); sock.once('error', rej); });
        r = await cmd('EHLO ' + name, [250]);
      }
      if (cfg.user) {
        const token = Buffer.from('\0' + cfg.user + '\0' + cfg.pass, 'utf8').toString('base64');
        await cmd('AUTH PLAIN ' + token, [235]);
      }
      await cmd('MAIL FROM:<' + address(from) + '>', [250]);
      await cmd('RCPT TO:<' + address(to) + '>', [250, 251]);
      await cmd('DATA', [354]);
      const msg = buildMessage({ from, to, subject, text }).replace(/^\./gm, '..');
      await cmd(msg + '\r\n.', [250]);
      try { sock.write('QUIT\r\n'); } catch (e) { /* ignore */ }
    }

    const onConnect = () => {
      sock.on('data', onData);
      conversation().then(finish, fail);
    };
    if (cfg.mode === 'ssl') {
      sock = tls.connect({ host: cfg.host, port: cfg.port, servername: cfg.host }, onConnect);
    } else {
      sock = net.connect({ host: cfg.host, port: cfg.port }, onConnect);
    }
    sock.on('error', fail);
  });
}

function fromAddress(cfg, brand) {
  if (process.env.MAIL_FROM) return process.env.MAIL_FROM;
  if (cfg && /@/.test(cfg.user)) return brand + ' <' + cfg.user + '>';
  return brand + ' <noreply@localhost>';
}

// Records the message and sends it when SMTP is configured. Never throws: a failed email must
// not break the action that triggered it. Resolves to the outbox status.
async function send({ to, subject, text, kind }) {
  if (!to || !/@/.test(to)) return 'skipped';
  let id = null;
  const cfg = parseSmtpUrl(process.env.SMTP_URL);
  try {
    const { rows } = await db.query(
      "insert into outbox (to_addr, subject, body, kind, status) values ($1,$2,$3,$4,$5) returning id",
      [to, subject, text, kind || '', cfg ? 'queued' : 'logged']
    );
    id = rows[0].id;
  } catch (err) {
    console.error('Could not record email:', err.message);
  }
  if (!cfg) return 'logged';
  try {
    const brand = await settings.get('cfg.brand_name');
    await smtpSend(cfg, { from: fromAddress(cfg, brand), to, subject, text });
    if (id) await db.query("update outbox set status = 'sent' where id = $1", [id]);
    return 'sent';
  } catch (err) {
    console.error('Email failed:', err.message);
    if (id) {
      try { await db.query("update outbox set status = 'failed', error = $2 where id = $1", [id, String(err.message).slice(0, 300)]); } catch (e) { /* ignore */ }
    }
    return 'failed';
  }
}

async function ownerAddress() {
  const configured = await settings.get('cfg.notify_email');
  return configured || process.env.OWNER_EMAIL || '';
}

async function notifyOwner(subject, text, kind) {
  const to = await ownerAddress();
  if (!to) return 'skipped';
  return send({ to, subject, text, kind: kind || 'owner' });
}

function configured() {
  return !!parseSmtpUrl(process.env.SMTP_URL);
}

module.exports = { send, notifyOwner, configured, parseSmtpUrl, smtpSend };
