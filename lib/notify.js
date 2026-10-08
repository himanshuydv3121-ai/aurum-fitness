'use strict';
// The emails the site sends. Each function records the message in the outbox and sends it when
// SMTP is configured. None of them throw.

const mail = require('./mail');
const settings = require('./settings');

function baseUrl(req) {
  if (process.env.SITE_URL) return process.env.SITE_URL.replace(/\/+$/, '');
  if (!req) return '';
  const proto = String(req.headers['x-forwarded-proto'] || 'https').split(',')[0].trim();
  const host = req.headers['x-forwarded-host'] || req.headers.host || '';
  return host ? proto + '://' + host : '';
}

function when(value, tz) {
  try {
    return new Intl.DateTimeFormat('en-IN', { timeZone: tz, weekday: 'long', day: 'numeric', month: 'long', hour: 'numeric', minute: '2-digit' }).format(new Date(value));
  } catch (e) {
    return new Date(value).toISOString();
  }
}

function money(minor, currency) {
  const sym = !currency || currency === 'INR' ? 'Rs ' : currency + ' ';
  return sym + (Number(minor) / 100).toLocaleString('en-IN');
}

async function brand() {
  return settings.get('cfg.brand_name');
}

async function sign(text) {
  return text + '\n\n' + (await brand()) + '\n';
}

async function welcome(member, req) {
  const b = await brand();
  return mail.send({
    to: member.email,
    kind: 'welcome',
    subject: 'Welcome to ' + b,
    text: await sign('Hi ' + member.full_name.split(/\s+/)[0] + ',\n\nYour account is ready. You can choose a membership and book classes here:\n' + baseUrl(req) + '/account'),
  });
}

async function tourRequest(lead, req) {
  const b = await brand();
  await mail.send({
    to: lead.email,
    kind: 'tour',
    subject: 'We received your tour request',
    text: await sign('Hi ' + lead.fullName.split(/\s+/)[0] + ',\n\nThanks for asking about ' + b + '. A coach will contact you within one working day to confirm your private tour.\n\nYou asked for: ' + lead.interest + ', ' + lead.slot + '.'),
  });
  return mail.notifyOwner(
    'New tour request from ' + lead.fullName,
    [
      'Name: ' + lead.fullName,
      'Email: ' + lead.email,
      'Phone: ' + (lead.phone || '-'),
      'Interested in: ' + lead.interest,
      'Preferred time: ' + lead.slot,
      'Membership: ' + (lead.plan || '-'),
      'Goals: ' + (lead.message || '-'),
      '',
      'Manage requests: ' + baseUrl(req) + '/admin',
    ].join('\n'),
    'owner-tour'
  );
}

async function bookingConfirmed(member, session, req) {
  const tz = (await settings.rules()).timezone;
  return mail.send({
    to: member.email,
    kind: 'booking',
    subject: 'Booked: ' + session.programName,
    text: await sign('Hi ' + member.fullName.split(/\s+/)[0] + ',\n\nYou are booked into ' + session.programName + ' on ' + when(session.startsAt, tz) + '.\n\nNeed to cancel? You can do it from your account until ' + (await settings.rules()).cancelHours + ' hours before the class:\n' + baseUrl(req) + '/account'),
  });
}

async function bookingCancelled(member, session, byClub) {
  const tz = (await settings.rules()).timezone;
  return mail.send({
    to: member.email,
    kind: 'booking',
    subject: (byClub ? 'Class cancelled: ' : 'Booking cancelled: ') + session.programName,
    text: await sign('Hi ' + member.fullName.split(/\s+/)[0] + ',\n\n' + (byClub ? 'We have had to cancel ' : 'Your booking for ') + session.programName + ' on ' + when(session.startsAt, tz) + (byClub ? '. Sorry for the change. You can book another session from your account.' : ' is cancelled.')),
  });
}

async function paymentReceipt(member, payment, planName, req) {
  await mail.send({
    to: member.email,
    kind: 'receipt',
    subject: 'Payment received: ' + planName,
    text: await sign('Hi ' + member.fullName.split(/\s+/)[0] + ',\n\nWe received ' + money(payment.amount_minor, payment.currency) + ' for the ' + planName + ' plan (' + payment.billing + '). Your membership is active.\n\nReference: ' + payment.provider_ref + '\n' + baseUrl(req) + '/account'),
  });
  return mail.notifyOwner(
    'Payment received: ' + member.fullName + ' (' + planName + ')',
    member.fullName + ' (' + member.email + ') paid ' + money(payment.amount_minor, payment.currency) + ' for ' + planName + ' (' + payment.billing + ').\nReference: ' + payment.provider_ref,
    'owner-payment'
  );
}

async function offlineOrder(member, payment, planName, req) {
  await mail.send({
    to: member.email,
    kind: 'receipt',
    subject: 'Your ' + planName + ' membership is reserved',
    text: await sign('Hi ' + member.fullName.split(/\s+/)[0] + ',\n\nWe reserved the ' + planName + ' plan (' + payment.billing + ') for you. Please pay ' + money(payment.amount_minor, payment.currency) + ' at the front desk and quote reference ' + payment.provider_ref + '. Your membership starts as soon as we confirm payment.'),
  });
  return mail.notifyOwner(
    'Payment to collect: ' + member.fullName + ' (' + planName + ')',
    member.fullName + ' (' + member.email + ') reserved ' + planName + ' (' + payment.billing + ') for ' + money(payment.amount_minor, payment.currency) + '.\nReference: ' + payment.provider_ref + '\nMark it paid in the admin panel once collected: ' + baseUrl(req) + '/admin',
    'owner-payment'
  );
}

async function passwordReset(member, link) {
  return mail.send({
    to: member.email,
    kind: 'reset',
    subject: 'Reset your password',
    text: await sign('Hi ' + member.full_name.split(/\s+/)[0] + ',\n\nUse this link to choose a new password. It works for one hour.\n' + link + '\n\nIf you did not ask for this, you can ignore this email.'),
  });
}

async function newsletterWelcome(email, link) {
  const b = await brand();
  return mail.send({
    to: email,
    kind: 'newsletter',
    subject: 'You are subscribed to ' + b,
    text: await sign('Thanks for subscribing. We will send schedule changes, new programs and member events.\n\nUnsubscribe any time: ' + link),
  });
}

module.exports = {
  baseUrl, welcome, tourRequest, bookingConfirmed, bookingCancelled, paymentReceipt, offlineOrder, passwordReset, newsletterWelcome,
};
