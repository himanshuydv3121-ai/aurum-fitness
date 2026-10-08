'use strict';
const db = require('../../db');
const auth = require('../../auth');
const classes = require('../../classes');
const notify = require('../../notify');
const v = require('../../validate');
const { route, readJson, HttpError } = require('../../http');

module.exports = route({
  POST: async (req) => {
    const member = await auth.requireMember(req);
    const body = await readJson(req);
    const sessionId = v.uuid(body.sessionId, 'class');
    if (!(await db.rateLimit('book:' + member.id, 30, 3600))) {
      throw new HttpError(429, 'Too many bookings. Please try again later.');
    }
    const booking = await classes.book(member, sessionId);
    await notify.bookingConfirmed(
      { email: member.email, fullName: member.full_name },
      { programName: booking.programName, startsAt: booking.startsAt },
      req
    );
    return { status: 201, body: { ok: true, id: booking.id } };
  },
});
