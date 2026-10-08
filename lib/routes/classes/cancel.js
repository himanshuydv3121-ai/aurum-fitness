'use strict';
const auth = require('../../auth');
const classes = require('../../classes');
const notify = require('../../notify');
const v = require('../../validate');
const { route, readJson } = require('../../http');

module.exports = route({
  POST: async (req) => {
    const member = await auth.requireMember(req);
    const body = await readJson(req);
    const id = v.uuid(body.id, 'booking');
    const info = await classes.cancel(id, { memberId: member.id });
    await notify.bookingCancelled(
      { email: member.email, fullName: member.full_name },
      { programName: info.programName, startsAt: info.startsAt },
      false
    );
    return { body: { ok: true } };
  },
});
