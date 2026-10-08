'use strict';
const auth = require('../../auth');
const classes = require('../../classes');
const settings = require('../../settings');
const { route } = require('../../http');

module.exports = route({
  GET: async (req) => {
    const member = await auth.requireMember(req);
    const rows = await classes.memberBookings(member.id);
    const rules = await settings.rules();
    return {
      body: {
        timezone: rules.timezone,
        cancelHours: rules.cancelHours,
        bookings: rows.map((b) => ({
          id: b.id, status: b.cancelled ? 'cancelled' : b.status, programName: b.programName, coach: b.coach,
          duration: b.duration, startsAt: b.startsAt, upcoming: b.upcoming, canCancel: b.canCancel,
        })),
      },
    };
  },
});
