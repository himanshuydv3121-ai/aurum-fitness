'use strict';
const db = require('../lib/db');
const auth = require('../lib/auth');
const { migrate } = require('./migrate');
const content = require('./content');

async function seed() {
  // On Vercel this runs as the build step. Without a database yet, skip so the static site still deploys.
  if (!process.env.DATABASE_URL && process.env.VERCEL) {
    console.log('DATABASE_URL is not set, skipping database setup. Add it in Vercel project settings and redeploy.');
    return;
  }
  await migrate();

  // The owner manages programs, trainers and plans in the admin panel from now on, so the built-in
  // sample content is loaded exactly once. A later deploy never overwrites or restores anything.
  const seeded = await db.query("select 1 from site_content where key = 'seed.content'");
  if (!seeded.rows[0]) {
    for (let i = 0; i < content.programs.length; i++) {
      const p = content.programs[i];
      await db.query(
        `insert into programs (slug, name, category, category_label, icon, description, duration, level, schedule, coach, sort)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) on conflict (slug) do nothing`,
        p.concat([i])
      );
    }
    for (let i = 0; i < content.trainers.length; i++) {
      const t = content.trainers[i];
      await db.query(
        `insert into trainers (slug, name, initials, role, bio, cert, color, sort)
         values ($1,$2,$3,$4,$5,$6,$7,$8) on conflict (slug) do nothing`,
        t.concat([i])
      );
    }
    for (let i = 0; i < content.plans.length; i++) {
      const p = content.plans[i];
      await db.query(
        `insert into plans (slug, name, tag, monthly_price, annual_price, featured, features, excluded, sort)
         values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9) on conflict (slug) do nothing`,
        [p[0], p[1], p[2], p[3], p[4], p[5], JSON.stringify(p[6]), JSON.stringify(p[7]), i]
      );
    }
    await db.query("insert into site_content (key, value) values ('seed.content', 'done') on conflict (key) do nothing");
    console.log('Loaded sample content:', content.programs.length, 'programs,', content.trainers.length, 'trainers,', content.plans.length, 'plans.');
  }

  // Weekly timetable patterns for programs that existed before class booking was added. Once only.
  const patterned = await db.query("select 1 from site_content where key = 'seed.patterns'");
  if (!patterned.rows[0]) {
    for (const slug of Object.keys(content.patterns)) {
      const [days, time, capacity, featured] = content.patterns[slug];
      await db.query(
        "update programs set days = $2, start_time = $3, capacity = $4, featured = $5 where slug = $1 and days = '' and start_time = ''",
        [slug, days, time, capacity, featured]
      );
    }
    await db.query("insert into site_content (key, value) values ('seed.patterns', 'done') on conflict (key) do nothing");
  }

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminEmail || !adminPassword) {
    console.log('ADMIN_EMAIL or ADMIN_PASSWORD not set, so no admin account was created.');
    return;
  }
  if (adminPassword.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters.');
  const hash = await auth.hashPassword(adminPassword);
  // Create the owner account on the first deploy. An existing account keeps the password the owner
  // chose in the panel, so a redeploy never resets it. Run `npm run admin:reset` to force one.
  const { rows } = await db.query(
    `insert into members (email, full_name, password_hash, role) values ($1, 'AURUM Admin', $2, 'admin')
     on conflict (lower(email)) do update set role = 'admin', active = true
     returning id`,
    [adminEmail, hash]
  );
  console.log('Admin account ready for', adminEmail, '(' + rows[0].id + ')');
}

seed()
  .catch((err) => { console.error('Seed failed:', err.message); process.exitCode = 1; })
  .finally(() => db.close());
