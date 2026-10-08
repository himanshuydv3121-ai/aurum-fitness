'use strict';
// Admin API for everything the owner can manage. Every handler requires an admin session.

const db = require('../../db');
const auth = require('../../auth');
const v = require('../../validate');
const classes = require('../../classes');
const settings = require('../../settings');
const pay = require('../../payments');
const mail = require('../../mail');
const notify = require('../../notify');
const { route, readJson, readRaw, query, HttpError } = require('../../http');

const BIG = 200 * 1024;
const ICONS = ['bar', 'pulse', 'snow', 'leaf', 'bolt', 'arc', 'moon', 'glove'];
const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

const guard = (fn) => async (req, res) => {
  const admin = await auth.requireAdmin(req);
  return fn(req, res, admin);
};

function describeSchedule(days, time) {
  const list = String(days || '').split(',').filter(Boolean).map(Number);
  if (!list.length || !time) return '';
  let label;
  if (list.length === 7) label = 'Daily';
  else if (list.length >= 3 && list.every((d, i) => i === 0 || d === list[i - 1] + 1)) {
    label = DAY_NAMES[list[0]] + ' to ' + DAY_NAMES[list[list.length - 1]];
  } else label = list.map((d) => DAY_NAMES[d]).join(', ');
  return label + ' ' + time;
}

async function uniqueSlug(table, base) {
  const root = v.slugify(base) || 'item';
  for (let i = 0; i < 30; i++) {
    const slug = i === 0 ? root : root + '-' + (i + 1);
    const { rows } = await db.query('select 1 from ' + table + ' where slug = $1', [slug]);
    if (!rows[0]) return slug;
  }
  throw new HttpError(409, 'Could not make a unique address for that name. Try a different name.');
}

function lines(value, field, max) {
  const list = Array.isArray(value) ? value : String(value || '').split(/\r?\n/);
  const out = list.map((s) => String(s).trim()).filter(Boolean);
  if (out.length > 20) throw new HttpError(400, field + ' can have at most 20 lines.');
  out.forEach((s) => { if (s.length > (max || 120)) throw new HttpError(400, 'Each line in ' + field + ' must be at most ' + (max || 120) + ' characters.'); });
  return out;
}

/* ------------------------------------------------------------------ programs */

const PROGRAM_COLUMNS = `slug, name, category, category_label as "categoryLabel", icon, description, duration, level,
  schedule, coach, days, start_time as "startTime", capacity, featured, active, sort`;

function programFields(body) {
  const name = v.str(body.name, 'Name', { max: 100 });
  const categoryLabel = v.str(body.categoryLabel, 'Category', { max: 40 });
  const category = v.slugify(categoryLabel);
  if (!category) throw new HttpError(400, 'Category must contain letters or numbers.');
  const days = v.weekdays(body.days);
  const startTime = v.timeOfDay(body.startTime, 'Start time');
  if (days && !startTime) throw new HttpError(400, 'Add a start time for the weekly classes.');
  if (startTime && !days) throw new HttpError(400, 'Choose at least one day for the weekly classes.');
  let schedule = v.str(body.schedule, 'Schedule label', { required: false, max: 80 });
  if (!schedule) schedule = describeSchedule(days, startTime) || 'By booking';
  return {
    name, category, categoryLabel,
    icon: v.oneOf(body.icon, 'icon', ICONS),
    description: v.str(body.description, 'Description', { required: false, max: 600 }),
    duration: v.str(body.duration, 'Duration', { required: false, max: 20 }) || '60 min',
    level: v.int(body.level, 'Intensity', { min: 1, max: 5 }),
    schedule,
    coach: v.str(body.coach, 'Coach', { required: false, max: 60 }),
    days, startTime,
    capacity: v.int(body.capacity, 'Seats per class', { min: 0, max: 500 }),
    featured: v.bool(body.featured),
    active: body.active === undefined ? true : v.bool(body.active),
    sort: v.int(body.sort, 'Order', { min: 0, max: 1000, required: false }) || 0,
  };
}

const programs = route({
  GET: guard(async () => {
    const { rows } = await db.query(`select ${PROGRAM_COLUMNS} from programs order by sort, name`);
    return { body: { programs: rows } };
  }),

  POST: guard(async (req) => {
    const f = programFields(await readJson(req));
    const slug = await uniqueSlug('programs', f.name);
    await db.query(
      `insert into programs (slug, name, category, category_label, icon, description, duration, level, schedule, coach,
                             days, start_time, capacity, featured, active, sort)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)`,
      [slug, f.name, f.category, f.categoryLabel, f.icon, f.description, f.duration, f.level, f.schedule, f.coach,
        f.days, f.startTime, f.capacity, f.featured, f.active, f.sort]
    );
    await classes.generateSessions();
    return { status: 201, body: { ok: true, slug } };
  }),

  PUT: guard(async (req) => {
    const body = await readJson(req);
    const slug = v.str(body.slug, 'Program', { max: 80 });
    const f = programFields(body);
    const { rowCount } = await db.query(
      `update programs set name=$2, category=$3, category_label=$4, icon=$5, description=$6, duration=$7, level=$8,
         schedule=$9, coach=$10, days=$11, start_time=$12, capacity=$13, featured=$14, active=$15, sort=$16
       where slug = $1`,
      [slug, f.name, f.category, f.categoryLabel, f.icon, f.description, f.duration, f.level, f.schedule, f.coach,
        f.days, f.startTime, f.capacity, f.featured, f.active, f.sort]
    );
    if (!rowCount) throw new HttpError(404, 'Program not found.');
    await classes.resetProgramSessions(slug, f.capacity);
    return { body: { ok: true } };
  }),

  DELETE: guard(async (req) => {
    const slug = v.str(query(req).get('slug'), 'Program', { max: 80 });
    const { rowCount } = await db.query('delete from programs where slug = $1', [slug]);
    if (!rowCount) throw new HttpError(404, 'Program not found.');
    return { body: { ok: true } };
  }),
});

/* ------------------------------------------------------------------ trainers */

const TRAINER_COLUMNS = 'slug, name, initials, role, bio, cert, color, photo, active, sort';

function initialsOf(name) {
  return name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0].toUpperCase()).join('');
}

function trainerFields(body) {
  const name = v.str(body.name, 'Name', { max: 100 });
  return {
    name,
    initials: (v.str(body.initials, 'Initials', { required: false, max: 3 }) || initialsOf(name)).toUpperCase(),
    role: v.str(body.role, 'Role', { required: false, max: 80 }),
    bio: v.str(body.bio, 'Bio', { required: false, max: 500 }),
    cert: v.str(body.cert, 'Certification', { required: false, max: 80 }),
    color: body.color ? v.hexColor(body.color, 'Colour') : '#3a3018',
    photo: v.image(body.photo, 'Photo'),
    active: body.active === undefined ? true : v.bool(body.active),
    sort: v.int(body.sort, 'Order', { min: 0, max: 1000, required: false }) || 0,
  };
}

const trainers = route({
  GET: guard(async () => {
    const { rows } = await db.query(`select ${TRAINER_COLUMNS} from trainers order by sort, name`);
    return { body: { trainers: rows } };
  }),
  POST: guard(async (req) => {
    const f = trainerFields(await readJson(req));
    const slug = await uniqueSlug('trainers', f.name);
    await db.query(
      `insert into trainers (slug, name, initials, role, bio, cert, color, photo, active, sort)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
      [slug, f.name, f.initials, f.role, f.bio, f.cert, f.color, f.photo, f.active, f.sort]
    );
    return { status: 201, body: { ok: true, slug } };
  }),
  PUT: guard(async (req) => {
    const body = await readJson(req);
    const slug = v.str(body.slug, 'Trainer', { max: 80 });
    const f = trainerFields(body);
    const { rowCount } = await db.query(
      `update trainers set name=$2, initials=$3, role=$4, bio=$5, cert=$6, color=$7, photo=$8, active=$9, sort=$10 where slug=$1`,
      [slug, f.name, f.initials, f.role, f.bio, f.cert, f.color, f.photo, f.active, f.sort]
    );
    if (!rowCount) throw new HttpError(404, 'Trainer not found.');
    return { body: { ok: true } };
  }),
  DELETE: guard(async (req) => {
    const slug = v.str(query(req).get('slug'), 'Trainer', { max: 80 });
    const { rowCount } = await db.query('delete from trainers where slug = $1', [slug]);
    if (!rowCount) throw new HttpError(404, 'Trainer not found.');
    return { body: { ok: true } };
  }),
});

/* ------------------------------------------------------------------ plans */

const PLAN_COLUMNS = `slug, name, tag, monthly_price as "monthlyPrice", annual_price as "annualPrice",
  featured, features, excluded, active, sort`;

function planFields(body) {
  const monthly = v.int(body.monthlyPrice, 'Monthly price', { min: 1, max: 10000000 });
  const annual = v.int(body.annualPrice, 'Yearly price (per month)', { min: 1, max: 10000000 });
  return {
    name: v.str(body.name, 'Name', { max: 60 }),
    tag: v.str(body.tag, 'Tag', { required: false, max: 40 }),
    monthly, annual,
    featured: v.bool(body.featured),
    features: JSON.stringify(lines(body.features, 'Included features')),
    excluded: JSON.stringify(lines(body.excluded, 'Not included')),
    active: body.active === undefined ? true : v.bool(body.active),
    sort: v.int(body.sort, 'Order', { min: 0, max: 1000, required: false }) || 0,
  };
}

const plans = route({
  GET: guard(async () => {
    const { rows } = await db.query(`select ${PLAN_COLUMNS} from plans order by sort, name`);
    return { body: { plans: rows } };
  }),
  POST: guard(async (req) => {
    const f = planFields(await readJson(req));
    const slug = await uniqueSlug('plans', f.name);
    await db.query(
      `insert into plans (slug, name, tag, monthly_price, annual_price, featured, features, excluded, active, sort)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10)`,
      [slug, f.name, f.tag, f.monthly, f.annual, f.featured, f.features, f.excluded, f.active, f.sort]
    );
    return { status: 201, body: { ok: true, slug } };
  }),
  PUT: guard(async (req) => {
    const body = await readJson(req);
    const slug = v.str(body.slug, 'Plan', { max: 80 });
    const f = planFields(body);
    const { rowCount } = await db.query(
      `update plans set name=$2, tag=$3, monthly_price=$4, annual_price=$5, featured=$6, features=$7::jsonb,
         excluded=$8::jsonb, active=$9, sort=$10 where slug=$1`,
      [slug, f.name, f.tag, f.monthly, f.annual, f.featured, f.features, f.excluded, f.active, f.sort]
    );
    if (!rowCount) throw new HttpError(404, 'Plan not found.');
    return { body: { ok: true } };
  }),
  DELETE: guard(async (req) => {
    const slug = v.str(query(req).get('slug'), 'Plan', { max: 80 });
    try {
      const { rowCount } = await db.query('delete from plans where slug = $1', [slug]);
      if (!rowCount) throw new HttpError(404, 'Plan not found.');
    } catch (err) {
      if (err.code === '23503') throw new HttpError(409, 'Members or payments use this plan. Untick Active to hide it instead.');
      throw err;
    }
    return { body: { ok: true } };
  }),
});

/* ------------------------------------------------------------------ timetable */

const sessions = route({
  GET: guard(async (req) => {
    const past = query(req).get('scope') === 'past';
    const { rows } = await db.query(
      `select s.id, s.program_slug as "programSlug", p.name as "programName", s.starts_at as "startsAt", s.capacity,
              s.notes, s.cancelled, s.generated,
              (select count(*)::int from class_bookings b where b.session_id = s.id and b.status = 'confirmed') as booked
       from class_sessions s join programs p on p.slug = s.program_slug
       where ${past ? 's.starts_at <= now()' : 's.starts_at > now()'}
       order by s.starts_at ${past ? 'desc' : ''} limit ${past ? 100 : 300}`
    );
    const rules = await settings.rules();
    return { body: { timezone: rules.timezone, sessions: rows } };
  }),

  // One-off session. The time is the club's local time (see Settings).
  POST: guard(async (req) => {
    const body = await readJson(req);
    const slug = v.str(body.programSlug, 'Program', { max: 80 });
    const local = v.str(body.startsAtLocal, 'Date and time', { max: 16 });
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local)) throw new HttpError(400, 'Enter a valid date and time.');
    const capacity = v.int(body.capacity, 'Seats', { min: 0, max: 500 });
    const notes = v.str(body.notes, 'Notes', { required: false, max: 200 });
    const rules = await settings.rules();
    try {
      const { rows } = await db.query(
        `insert into class_sessions (program_slug, starts_at, capacity, notes, generated)
         values ($1, ($2::timestamp at time zone $3), $4, $5, false) returning id`,
        [slug, local, rules.timezone, capacity, notes]
      );
      return { status: 201, body: { ok: true, id: rows[0].id } };
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'That program already has a class at that time.');
      if (err.code === '23503') throw new HttpError(404, 'Program not found.');
      throw err;
    }
  }),

  PATCH: guard(async (req) => {
    const body = await readJson(req);
    const id = v.uuid(body.id, 'class');
    const capacity = v.int(body.capacity, 'Seats', { min: 0, max: 500 });
    const notes = v.str(body.notes, 'Notes', { required: false, max: 200 });
    const cancelled = v.bool(body.cancelled);
    const current = (await db.query(
      `select s.cancelled, s.starts_at, p.name as "programName" from class_sessions s join programs p on p.slug = s.program_slug where s.id = $1`,
      [id]
    )).rows[0];
    if (!current) throw new HttpError(404, 'Class not found.');
    await db.query('update class_sessions set capacity = $2, notes = $3, cancelled = $4 where id = $1', [id, capacity, notes, cancelled]);
    if (cancelled && !current.cancelled) {
      // Cancel every confirmed booking and tell the members.
      const { rows } = await db.query(
        `update class_bookings b set status = 'cancelled', cancelled_at = now()
         from members m where b.session_id = $1 and b.status = 'confirmed' and m.id = b.member_id
         returning m.email, m.full_name as "fullName"`,
        [id]
      );
      for (const m of rows) {
        await notify.bookingCancelled(m, { programName: current.programName, startsAt: current.starts_at }, true);
      }
    }
    return { body: { ok: true } };
  }),

  DELETE: guard(async (req) => {
    const id = v.uuid(query(req).get('id'), 'class');
    const n = (await db.query("select count(*)::int as n from class_bookings where session_id = $1 and status = 'confirmed'", [id])).rows[0].n;
    if (n) throw new HttpError(409, 'Members are booked into this class. Cancel the class instead so they are told.');
    const { rowCount } = await db.query('delete from class_sessions where id = $1', [id]);
    if (!rowCount) throw new HttpError(404, 'Class not found.');
    return { body: { ok: true } };
  }),
});

const classBookings = route({
  GET: guard(async (req) => {
    const all = query(req).get('scope') === 'all';
    const { rows } = await db.query(
      `select b.id, b.status, b.created_at as "createdAt", m.full_name as "memberName", m.email as "memberEmail",
              p.name as "programName", s.starts_at as "startsAt", s.cancelled as "classCancelled"
       from class_bookings b
         join class_sessions s on s.id = b.session_id
         join programs p on p.slug = s.program_slug
         join members m on m.id = b.member_id
       where ${all ? 'true' : "s.starts_at > now() - interval '1 day'"}
       order by s.starts_at ${all ? 'desc' : ''}, m.full_name limit 400`
    );
    const rules = await settings.rules();
    return { body: { timezone: rules.timezone, bookings: rows } };
  }),
  POST: guard(async (req) => {
    const body = await readJson(req);
    const id = v.uuid(body.id, 'booking');
    const info = await classes.cancel(id, { asAdmin: true });
    const m = (await db.query('select email, full_name as "fullName" from members where id = $1', [info.memberId])).rows[0];
    if (m) await notify.bookingCancelled(m, { programName: info.programName, startsAt: info.startsAt }, true);
    return { body: { ok: true } };
  }),
});

/* ------------------------------------------------------------------ members */

const MEMBER_SELECT = `m.id, m.full_name as "fullName", m.email, m.phone, m.role, m.active, m.plan_slug as plan, m.billing,
  case when m.membership_status = 'active' and m.membership_until < now() then 'expired' else m.membership_status end as "membershipStatus",
  m.membership_until as "membershipUntil", m.created_at as "createdAt"`;

async function activeAdminCount() {
  return (await db.query("select count(*)::int as n from members where role = 'admin' and active")).rows[0].n;
}

const members = route({
  GET: guard(async () => {
    const { rows } = await db.query(`select ${MEMBER_SELECT} from members m order by m.created_at desc limit 500`);
    return { body: { members: rows } };
  }),

  POST: guard(async (req) => {
    const body = await readJson(req);
    const fullName = v.str(body.fullName, 'Name', { min: 2, max: 100 });
    const email = v.email(body.email);
    const hash = await auth.hashPassword(v.password(body.password));
    const role = v.oneOf(body.role || 'member', 'role', ['member', 'admin']);
    try {
      const { rows } = await db.query(
        'insert into members (email, full_name, password_hash, phone, role) values ($1,$2,$3,$4,$5) returning id',
        [email, fullName, hash, v.phone(body.phone) || null, role]
      );
      return { status: 201, body: { ok: true, id: rows[0].id } };
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'A member with this email already exists.');
      throw err;
    }
  }),

  PATCH: guard(async (req, res, admin) => {
    const body = await readJson(req);
    const id = v.uuid(body.id, 'member');
    const current = (await db.query('select id, role, active from members where id = $1', [id])).rows[0];
    if (!current) throw new HttpError(404, 'Member not found.');

    const sets = [];
    const params = [id];
    const set = (column, value, cast) => { params.push(value); sets.push(column + ' = $' + params.length + (cast || '')); };

    if (body.fullName !== undefined) set('full_name', v.str(body.fullName, 'Name', { min: 2, max: 100 }));
    if (body.phone !== undefined) set('phone', v.phone(body.phone) || null);
    if (body.email !== undefined) set('email', v.email(body.email));
    if (body.role !== undefined) set('role', v.oneOf(body.role, 'role', ['member', 'admin']));
    if (body.active !== undefined) set('active', v.bool(body.active));
    if (body.plan !== undefined) {
      const slug = v.str(body.plan, 'Plan', { required: false, max: 80 });
      set('plan_slug', slug || null);
      if (!slug) { set('billing', null); }
    }
    if (body.billing !== undefined && body.plan !== '') set('billing', body.billing ? v.oneOf(body.billing, 'billing', ['monthly', 'annual']) : null);
    if (body.membershipStatus !== undefined) set('membership_status', v.oneOf(body.membershipStatus, 'status', ['none', 'active', 'expired']));
    if (body.membershipUntil !== undefined) {
      const d = v.str(body.membershipUntil, 'Valid until', { required: false, max: 10 });
      if (d && !/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new HttpError(400, 'Valid until must be a date.');
      set('membership_until', d ? d + 'T23:59:59Z' : null, '::timestamptz');
    }

    // Keep at least one working admin, and do not let an admin lock themselves out by accident.
    const losesAdmin = (body.role !== undefined && body.role !== 'admin') || (body.active !== undefined && !v.bool(body.active));
    if (losesAdmin && current.role === 'admin') {
      if (id === admin.id) throw new HttpError(409, 'You cannot remove your own admin access.');
      if ((await activeAdminCount()) <= 1) throw new HttpError(409, 'There must be at least one active admin.');
    }
    if (body.password) set('password_hash', await auth.hashPassword(v.password(body.password)));
    if (!sets.length) throw new HttpError(400, 'Nothing to change.');
    try {
      await db.query('update members set ' + sets.join(', ') + ' where id = $1', params);
    } catch (err) {
      if (err.code === '23505') throw new HttpError(409, 'Another member already uses that email.');
      if (err.code === '23503') throw new HttpError(400, 'That plan does not exist.');
      throw err;
    }
    if (body.password || body.active === false || body.active === 'false') await auth.destroyAllSessions(id);
    return { body: { ok: true } };
  }),
});

/* ------------------------------------------------------------------ payments + tour requests */

const payments = route({
  GET: guard(async () => {
    const { rows } = await db.query(
      `select p.id, p.provider_ref as ref, p.status, p.billing, p.amount_minor as "amountMinor", p.currency, p.provider,
              p.created_at as "createdAt", p.paid_at as "paidAt", pl.name as "planName",
              m.full_name as "memberName", m.email as "memberEmail"
       from payments p join plans pl on pl.slug = p.plan_slug join members m on m.id = p.member_id
       order by p.created_at desc limit 300`
    );
    return { body: { payments: rows } };
  }),

  // Settle or close a pending payment by hand, for example cash collected at the front desk.
  PATCH: guard(async (req) => {
    const body = await readJson(req);
    const id = v.uuid(body.id, 'payment');
    const status = v.oneOf(body.status, 'status', ['paid', 'failed', 'cancelled']);
    const { rows } = await db.query('select status from payments where id = $1', [id]);
    if (!rows[0]) throw new HttpError(404, 'Payment not found.');
    if (rows[0].status !== 'pending') throw new HttpError(409, 'Only pending payments can be changed. This one is ' + rows[0].status + '.');
    if (status === 'paid') {
      if (await pay.markPaid(id, null)) await pay.afterPaid(id, req);
    } else {
      await db.query('update payments set status = $2 where id = $1 and status = $3', [id, status, 'pending']);
    }
    return { body: { ok: true } };
  }),
});

const TOUR_STATUSES = ['new', 'contacted', 'toured', 'closed'];

const tourRequests = route({
  GET: guard(async (req) => {
    const status = query(req).get('status');
    const params = [];
    let where = '';
    if (status) {
      v.oneOf(status, 'status', TOUR_STATUSES);
      params.push(status);
      where = 'where status = $1';
    }
    const { rows } = await db.query(
      `select id, full_name as "fullName", email, phone, interest, slot, plan, message, notes, status, created_at as "createdAt"
       from bookings ${where} order by created_at desc limit 300`,
      params
    );
    return { body: { bookings: rows } };
  }),
  PATCH: guard(async (req) => {
    const body = await readJson(req);
    const id = v.uuid(body.id, 'request');
    const sets = [];
    const params = [id];
    if (body.status !== undefined) { params.push(v.oneOf(body.status, 'status', TOUR_STATUSES)); sets.push('status = $' + params.length); }
    if (body.notes !== undefined) { params.push(v.str(body.notes, 'Notes', { required: false, max: 1000 })); sets.push('notes = $' + params.length); }
    if (!sets.length) throw new HttpError(400, 'Nothing to change.');
    const { rowCount } = await db.query('update bookings set ' + sets.join(', ') + ' where id = $1', params);
    if (!rowCount) throw new HttpError(404, 'Request not found.');
    return { body: { ok: true } };
  }),
  DELETE: guard(async (req) => {
    const id = v.uuid(query(req).get('id'), 'request');
    const { rowCount } = await db.query('delete from bookings where id = $1', [id]);
    if (!rowCount) throw new HttpError(404, 'Request not found.');
    return { body: { ok: true } };
  }),
});

/* ------------------------------------------------------------------ newsletter + email log */

const subscribers = route({
  GET: guard(async () => {
    const { rows } = await db.query('select id, email, active, created_at as "createdAt" from subscribers order by created_at desc limit 2000');
    return { body: { subscribers: rows } };
  }),
  DELETE: guard(async (req) => {
    const id = v.uuid(query(req).get('id'), 'subscriber');
    await db.query('delete from subscribers where id = $1', [id]);
    return { body: { ok: true } };
  }),
  // Sends in small batches so each request finishes well inside the serverless time limit.
  // The page calls this repeatedly, passing back "next" until it comes back null.
  POST: guard(async (req) => {
    const body = await readJson(req, BIG);
    const subject = v.str(body.subject, 'Subject', { max: 150 });
    const text = v.str(body.body, 'Message', { max: 8000 });
    const offset = v.int(body.offset, 'Offset', { min: 0, max: 100000, required: false }) || 0;
    const BATCH = 6;
    const total = (await db.query('select count(*)::int as n from subscribers where active')).rows[0].n;
    const { rows } = await db.query(
      'select email, token from subscribers where active order by created_at, id offset $1 limit $2',
      [offset, BATCH]
    );
    let sent = 0;
    for (const s of rows) {
      const link = notify.baseUrl(req) + '/unsubscribe?token=' + s.token;
      const status = await mail.send({ to: s.email, subject, text: text + '\n\n--\nUnsubscribe: ' + link, kind: 'newsletter' });
      if (status === 'sent' || status === 'logged') sent++;
    }
    const next = offset + rows.length < total ? offset + rows.length : null;
    return { body: { total, sent, next, emailConfigured: mail.configured() } };
  }),
});

const outbox = route({
  GET: guard(async () => {
    const { rows } = await db.query(
      'select id, to_addr as "to", subject, body, kind, status, error, created_at as "createdAt" from outbox order by created_at desc limit 150'
    );
    return { body: { messages: rows, emailConfigured: mail.configured() } };
  }),
});

/* ------------------------------------------------------------------ text edits + settings */

const RESERVED = /^(cfg|theme|social|seo|seed)\./;

const content = route({
  GET: guard(async () => ({ body: { edits: await settings.textEdits() } })),
  PUT: guard(async (req) => {
    const body = await readJson(req, BIG);
    const set = body.set && typeof body.set === 'object' && !Array.isArray(body.set) ? body.set : {};
    const reset = Array.isArray(body.reset) ? body.reset : [];
    const keys = Object.keys(set);
    if (keys.length > 300 || reset.length > 300) throw new HttpError(400, 'Too many changes at once.');
    keys.forEach((k) => {
      if (!/^[a-z0-9][a-z0-9._-]{0,80}$/.test(k) || RESERVED.test(k)) throw new HttpError(400, 'Unknown text key: ' + k.slice(0, 40));
      if (typeof set[k] !== 'string') throw new HttpError(400, 'Text must be a string.');
      if (set[k].length > 2000) throw new HttpError(400, 'One of the texts is too long (limit 2000 characters).');
    });
    reset.forEach((k) => {
      if (typeof k !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,80}$/.test(k) || RESERVED.test(k)) throw new HttpError(400, 'Unknown text key.');
    });
    await db.tx(async (client) => {
      for (const k of keys) {
        await client.query(
          'insert into site_content (key, value, updated_at) values ($1, $2, now()) on conflict (key) do update set value = $2, updated_at = now()',
          [k, set[k]]
        );
      }
      for (const k of reset) await client.query('delete from site_content where key = $1', [k]);
    });
    settings.invalidate();
    return { body: { ok: true, saved: keys.length, reverted: reset.length } };
  }),
});

function settingValue(key, raw) {
  const s = (x, o) => v.str(x, key, Object.assign({ required: false }, o));
  if (key === 'cfg.require_membership') return v.bool(raw) ? 'true' : 'false';
  if (key === 'cfg.cancel_hours') return String(v.int(raw, 'Cancellation cutoff', { min: 0, max: 168 }));
  if (key === 'cfg.window_days') return String(v.int(raw, 'Booking window', { min: 1, max: 90 }));
  if (key === 'cfg.timezone') return v.timezone(raw);
  if (key === 'cfg.notify_email') { const e = s(raw, { max: 254 }); return e ? v.email(e) : ''; }
  if (key === 'cfg.brand_name') return v.str(raw, 'Brand name', { max: 60 });
  if (key === 'cfg.interests' || key === 'cfg.slots') {
    const list = lines(raw, key === 'cfg.slots' ? 'Time slots' : 'Interests', 80);
    if (!list.length) throw new HttpError(400, (key === 'cfg.slots' ? 'Time slots' : 'Interests') + ' needs at least one line.');
    return list.join('\n');
  }
  if (/^theme\./.test(key)) return v.hexColor(raw, key);
  if (/^social\./.test(key)) return v.webUrl(raw, 'Link');
  let m = key.match(/^seo\.([a-z]+)\.(title|description)$/);
  if (m && settings.SEO_PAGES.indexOf(m[1]) !== -1) return s(raw, { max: m[2] === 'title' ? 120 : 300 });
  throw new HttpError(400, 'Unknown setting: ' + key.slice(0, 40));
}

const settingsRoute = route({
  GET: guard(async () => {
    return {
      body: {
        settings: await settings.settings(),
        defaults: settings.DEFAULTS,
        seoPages: settings.SEO_PAGES,
        status: {
          email: mail.configured(),
          paymentProvider: pay.providerName(),
          razorpay: pay.razorpayConfigured(),
          razorpayWebhook: !!process.env.RAZORPAY_WEBHOOK_SECRET,
          ownerEmail: !!((await settings.get('cfg.notify_email')) || process.env.OWNER_EMAIL),
        },
      },
    };
  }),
  PUT: guard(async (req) => {
    const body = await readJson(req, BIG);
    const values = body.values && typeof body.values === 'object' && !Array.isArray(body.values) ? body.values : {};
    const clean = {};
    Object.keys(values).forEach((k) => { clean[k] = settingValue(k, values[k]); });
    await db.tx(async (client) => {
      for (const k of Object.keys(clean)) {
        // Empty or default values are removed so the built-in default applies.
        if (clean[k] === '' || clean[k] === settings.DEFAULTS[k]) {
          await client.query('delete from site_content where key = $1', [k]);
        } else {
          await client.query(
            'insert into site_content (key, value, updated_at) values ($1, $2, now()) on conflict (key) do update set value = $2, updated_at = now()',
            [k, clean[k]]
          );
        }
      }
    });
    settings.invalidate();
    if ('cfg.timezone' in clean || 'cfg.window_days' in clean) await classes.generateSessions();
    return { body: { ok: true } };
  }),
});

/* ------------------------------------------------------------------ uploads */

function imageType(buf) {
  if (buf.length > 12 && buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG') return 'image/png';
  if (buf.length > 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.length > 12 && buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP') return 'image/webp';
  if (buf.length > 6 && /^GIF8[79]a/.test(buf.toString('latin1', 0, 6))) return 'image/gif';
  return null;
}

const media = route({
  POST: guard(async (req) => {
    const bytes = await readRaw(req, 2 * 1024 * 1024);
    if (!bytes.length) throw new HttpError(400, 'No file received.');
    const type = imageType(bytes);
    if (!type) throw new HttpError(400, 'Upload a PNG, JPEG, WebP or GIF image.');
    const { rows } = await db.query(
      "insert into media (content_type, data) values ($1, decode($2, 'base64')) returning id",
      [type, bytes.toString('base64')]
    );
    return { status: 201, body: { url: '/media/' + rows[0].id } };
  }),
});

/* ------------------------------------------------------------------ overview + CSV */

const overview = route({
  GET: guard(async () => {
    const { rows } = await db.query(`
      select
        (select count(*)::int from bookings) as bookings,
        (select count(*)::int from bookings where status = 'new') as "newBookings",
        (select count(*)::int from members) as members,
        (select count(*)::int from members where membership_status = 'active' and membership_until > now()) as "activeMembers",
        (select count(*)::int from payments where status = 'paid') as "paidPayments",
        (select count(*)::int from payments where status = 'pending') as "pendingPayments",
        (select coalesce(sum(amount_minor), 0)::bigint from payments where status = 'paid') as "revenueMinor",
        (select coalesce(sum(amount_minor), 0)::bigint from payments where status = 'paid' and paid_at >= date_trunc('month', now())) as "monthRevenueMinor",
        (select count(*)::int from class_sessions where starts_at > now() and not cancelled) as "upcomingClasses",
        (select count(*)::int from class_bookings b join class_sessions s on s.id = b.session_id
           where b.status = 'confirmed' and s.starts_at > now() and not s.cancelled) as "upcomingSeatsBooked",
        (select count(*)::int from subscribers where active) as subscribers`);
    const o = rows[0];
    o.revenueMinor = Number(o.revenueMinor);
    o.monthRevenueMinor = Number(o.monthRevenueMinor);
    return {
      body: {
        overview: o,
        integrations: {
          email: mail.configured(),
          paymentProvider: pay.providerName(),
          razorpay: pay.razorpayConfigured(),
        },
      },
    };
  }),
});

function csvCell(value) {
  let s = value === null || value === undefined ? '' : value instanceof Date ? value.toISOString() : String(value);
  // Spreadsheet programs run cells that start with these characters as formulas.
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}

const EXPORTS = {
  members: { sql: `select full_name as "Name", email as "Email", phone as "Phone", role as "Role", plan_slug as "Plan", billing as "Billing",
                    membership_status as "Status", membership_until as "Valid until", created_at as "Joined" from members order by created_at`, },
  tours: { sql: `select full_name as "Name", email as "Email", phone as "Phone", interest as "Interest", slot as "Time", plan as "Plan",
                  message as "Goals", status as "Status", notes as "Notes", created_at as "Received" from bookings order by created_at` },
  payments: { sql: `select p.provider_ref as "Reference", m.full_name as "Member", m.email as "Email", pl.name as "Plan", p.billing as "Billing",
                     (p.amount_minor / 100.0) as "Amount", p.currency as "Currency", p.status as "Status", p.provider as "Provider",
                     p.created_at as "Created", p.paid_at as "Paid" from payments p join members m on m.id = p.member_id
                     join plans pl on pl.slug = p.plan_slug order by p.created_at` },
  subscribers: { sql: `select email as "Email", case when active then 'subscribed' else 'unsubscribed' end as "Status", created_at as "Joined" from subscribers order by created_at` },
};

const exportRoute = route({
  GET: guard(async (req, res) => {
    const what = v.oneOf(query(req).get('what'), 'export', Object.keys(EXPORTS));
    const { rows } = await db.query(EXPORTS[what].sql);
    const headers = rows[0] ? Object.keys(rows[0]) : [];
    const csv = [headers.map(csvCell).join(',')].concat(rows.map((r) => headers.map((h) => csvCell(r[h])).join(','))).join('\r\n');
    res.statusCode = 200;
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', 'attachment; filename="aurum-' + what + '.csv"');
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.end('﻿' + csv);
  }),
});

module.exports = {
  programs, trainers, plans, sessions, classBookings, members, payments, tourRequests, subscribers, outbox,
  content, settingsRoute, media, overview, exportRoute, describeSchedule,
};
