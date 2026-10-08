'use strict';
const { dispatch } = require('../lib/http');
const m = require('../lib/routes/admin/manage');

module.exports = dispatch({
  overview: m.overview,
  bookings: m.tourRequests,
  members: m.members,
  payments: m.payments,
  programs: m.programs,
  trainers: m.trainers,
  plans: m.plans,
  sessions: m.sessions,
  classbookings: m.classBookings,
  subscribers: m.subscribers,
  outbox: m.outbox,
  content: m.content,
  settings: m.settingsRoute,
  media: m.media,
  export: m.exportRoute,
});
