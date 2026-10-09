'use strict';
// Sends one real test email through your SMTP settings, without touching the database.
//
//   SMTP_URL='smtps://himanshu.yadav370000%40gmail.com:APP_PASSWORD@smtp.gmail.com:465' \
//   MAIL_FROM='AURUM Fitness <himanshu.yadav370000@gmail.com>' \
//   node scripts/test-email.js himanshu.ydv310210@gmail.com
//
// The "@" in the Gmail address must be written %40 inside SMTP_URL. APP_PASSWORD is a Google
// App Password (Google Account > Security > 2-Step Verification > App passwords), not your
// normal password.

const { parseSmtpUrl, smtpSend } = require('../lib/mail');

(async () => {
  const to = process.argv[2];
  const cfg = parseSmtpUrl(process.env.SMTP_URL);
  if (!cfg) { console.error('SMTP_URL is missing or not valid. See the comment at the top of this file.'); process.exit(2); }
  if (!to || !/@/.test(to)) { console.error('Usage: node scripts/test-email.js receiver@example.com'); process.exit(2); }
  const from = process.env.MAIL_FROM || 'AURUM Fitness <' + cfg.user + '>';
  try {
    await smtpSend(cfg, {
      from, to,
      subject: 'AURUM Fitness: email test',
      text: 'This is a test message from your AURUM Fitness website.\n\nIf you can read this, booking confirmations, receipts and owner alerts will reach people.\n',
    });
    console.log('Sent from ' + from + ' to ' + to + ' via ' + cfg.host + ':' + cfg.port + '. Check the inbox (and spam).');
  } catch (err) {
    console.error('Failed: ' + err.message);
    process.exit(1);
  }
})();
