'use strict';
// Class timetable and booking.
//
// Each program has a weekly pattern (days and a start time). Sessions are generated from those
// patterns a few weeks ahead. Generation runs on demand and is throttled, so it needs no cron job.
// The owner can also add one-off sessions and cancel individual ones.

const db = require('./db');
const settings = require('./settings');
const { HttpError } = require('./http');

// Creates any missing sessions from the weekly patterns. Safe to run repeatedly.
async function generateSessions(rules) {
  const r = rules || (await settings.rules());
  await db.query(
    `insert into class_sessions (program_slug, starts_at, capacity, generated)
     select p.slug, ((d::date + p.start_time::time) at time zone $1), p.capacity, true
     from programs p
     cross join generate_series(
       ((now() at time zone $1)::date)::timestamp,
       ((now() at time zone $1)::date + $2::int)::timestamp,
       interval '1 day') as d
     where p.active and p.days <> '' and p.start_time <> ''
       and extract(dow from d)::int = any (string_to_array(p.days, ',')::int[])
       and ((d::date + p.start_time::time) at time zone $1) > now()
     on conflict (program_slug, starts_at) do nothing`,
    [r.timezone, r.windowDays]
  );
}

// Called before listing sessions. At most one generation per 15 minutes across all instances.
async function ensureSessions() {
  if (await db.rateLimit('sessions:generate', 1, 900)) await generateSessions();
}

// After the owner changes a program's schedule: drop upcoming generated sessions nobody booked,
// update the capacity of the rest, and generate fresh ones.
async function resetProgramSessions(slug, capacity) {
  await db.query(
    `delete from class_sessions s
     where s.program_slug = $1 and s.generated and s.starts_at > now()
       and not exists (select 1 from class_bookings b where b.session_id = s.id and b.status = 'confirmed')`,
    [slug]
  );
  await db.query(
    'update class_sessions set capacity = $2 where program_slug = $1 and generated and starts_at > now()',
    [slug, capacity]
  );
  await generateSessions();
}

const SESSION_SELECT = `
  s.id, s.program_slug as "programSlug", p.name as "programName", p.duration, p.coach,
  s.starts_at as "startsAt", s.capacity, s.notes, s.cancelled,
  (select count(*)::int from class_bookings b where b.session_id = s.id and b.status = 'confirmed') as booked`;

// Upcoming sessions members can book, with seats left.
async function listUpcoming({ programSlug, memberId }) {
  await ensureSessions();
  const r = await settings.rules();
  const { rows } = await db.query(
    `select ${SESSION_SELECT},
       exists (select 1 from class_bookings b where b.session_id = s.id and b.member_id = $2::uuid and b.status = 'confirmed') as "bookedByMe"
     from class_sessions s join programs p on p.slug = s.program_slug
     where not s.cancelled and p.active and s.starts_at > now()
       and s.starts_at <= now() + make_interval(days => $3::int)
       and ($1::text is null or s.program_slug = $1::text)
     order by s.starts_at limit 500`,
    [programSlug || null, memberId || null, r.windowDays]
  );
  return rows.map((row) => Object.assign(row, { seatsLeft: Math.max(0, row.capacity - row.booked) }));
}

// Books a seat. The session row is locked so two people cannot take the last seat.
async function book(member, sessionId) {
  const r = await settings.rules();
  if (r.requireMembership && member.membership_status !== 'active') {
    throw new HttpError(403, 'An active membership is needed to book classes. Choose a plan first.');
  }
  return db.tx(async (client) => {
    const s = (await client.query(
      `select s.id, s.capacity, s.starts_at, s.cancelled, p.active as program_active, p.name as "programName"
       from class_sessions s join programs p on p.slug = s.program_slug
       where s.id = $1 for update of s`,
      [sessionId]
    )).rows[0];
    if (!s || s.cancelled || !s.program_active) throw new HttpError(404, 'That class is not available.');
    if (new Date(s.starts_at) <= new Date()) throw new HttpError(409, 'That class has already started.');
    if (new Date(s.starts_at) > new Date(Date.now() + r.windowDays * 86400000)) {
      throw new HttpError(409, 'Booking for that class is not open yet.');
    }
    const dup = await client.query(
      "select 1 from class_bookings where session_id = $1 and member_id = $2 and status = 'confirmed'",
      [sessionId, member.id]
    );
    if (dup.rows[0]) throw new HttpError(409, 'You are already booked into this class.');
    const taken = (await client.query(
      "select count(*)::int as n from class_bookings where session_id = $1 and status = 'confirmed'",
      [sessionId]
    )).rows[0].n;
    if (taken >= s.capacity) throw new HttpError(409, 'This class is full.');
    const ins = await client.query(
      "insert into class_bookings (session_id, member_id) values ($1, $2) returning id",
      [sessionId, member.id]
    );
    return { id: ins.rows[0].id, programName: s.programName, startsAt: s.starts_at };
  });
}

// Cancels a booking. Members can cancel until the cutoff; staff can always cancel.
async function cancel(bookingId, { memberId, asAdmin }) {
  const r = await settings.rules();
  const { rows } = await db.query(
    `select b.id, b.status, b.member_id, s.starts_at, p.name as "programName"
     from class_bookings b join class_sessions s on s.id = b.session_id join programs p on p.slug = s.program_slug
     where b.id = $1`,
    [bookingId]
  );
  const b = rows[0];
  if (!b || (!asAdmin && b.member_id !== memberId)) throw new HttpError(404, 'Booking not found.');
  if (b.status !== 'confirmed') throw new HttpError(409, 'This booking is already cancelled.');
  if (!asAdmin) {
    const cutoff = new Date(b.starts_at).getTime() - r.cancelHours * 3600000;
    if (Date.now() > cutoff) {
      throw new HttpError(409, 'Bookings can be cancelled until ' + r.cancelHours + ' hours before the class. Please contact the club.');
    }
  }
  await db.query("update class_bookings set status = 'cancelled', cancelled_at = now() where id = $1 and status = 'confirmed'", [bookingId]);
  return { memberId: b.member_id, programName: b.programName, startsAt: b.starts_at };
}

async function memberBookings(memberId) {
  const { rows } = await db.query(
    `select b.id, b.status, b.created_at as "createdAt", ${SESSION_SELECT}
     from class_bookings b join class_sessions s on s.id = b.session_id join programs p on p.slug = s.program_slug
     where b.member_id = $1
     order by s.starts_at desc limit 60`,
    [memberId]
  );
  const r = await settings.rules();
  const now = Date.now();
  return rows.map((row) => Object.assign(row, {
    upcoming: new Date(row.startsAt).getTime() > now && row.status === 'confirmed' && !row.cancelled,
    canCancel: row.status === 'confirmed' && !row.cancelled &&
      new Date(row.startsAt).getTime() - r.cancelHours * 3600000 > now,
  }));
}

module.exports = {
  generateSessions, ensureSessions, resetProgramSessions, listUpcoming, book, cancel, memberBookings, SESSION_SELECT,
};
