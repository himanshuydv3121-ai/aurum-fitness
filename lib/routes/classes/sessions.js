'use strict';
const auth = require('../../auth');
const classes = require('../../classes');
const settings = require('../../settings');
const { route, query } = require('../../http');

// Public: upcoming bookable sessions with seats left. If the visitor is signed in, their own
// bookings are marked so the page can show "Booked".
module.exports = route({
  GET: async (req) => {
    const slug = (query(req).get('program') || '').slice(0, 60) || null;
    const member = await auth.getMember(req).catch(() => null);
    const rows = await classes.listUpcoming({ programSlug: slug, memberId: member ? member.id : null });
    const rules = await settings.rules();
    return {
      body: {
        timezone: rules.timezone,
        requireMembership: rules.requireMembership,
        sessions: rows.map((s) => ({
          id: s.id, programSlug: s.programSlug, programName: s.programName, duration: s.duration, coach: s.coach,
          startsAt: s.startsAt, capacity: s.capacity, seatsLeft: s.seatsLeft, notes: s.notes, bookedByMe: s.bookedByMe,
        })),
      },
    };
  },
});
