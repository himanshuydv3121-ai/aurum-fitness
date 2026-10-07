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

  for (let i = 0; i < content.programs.length; i++) {
    const p = content.programs[i];
    await db.query(
      `insert into programs (slug, name, category, category_label, icon, description, duration, level, schedule, coach, sort)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
       on conflict (slug) do update set name=$2, category=$3, category_label=$4, icon=$5, description=$6,
         duration=$7, level=$8, schedule=$9, coach=$10, sort=$11`,
      p.concat([i])
    );
  }

  for (let i = 0; i < content.trainers.length; i++) {
    const t = content.trainers[i];
    await db.query(
      `insert into trainers (slug, name, initials, role, bio, cert, color, sort)
       values ($1,$2,$3,$4,$5,$6,$7,$8)
       on conflict (slug) do update set name=$2, initials=$3, role=$4, bio=$5, cert=$6, color=$7, sort=$8`,
      t.concat([i])
    );
  }

  for (let i = 0; i < content.plans.length; i++) {
    const p = content.plans[i];
    await db.query(
      `insert into plans (slug, name, tag, monthly_price, annual_price, featured, features, excluded, sort)
       values ($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9)
       on conflict (slug) do update set name=$2, tag=$3, monthly_price=$4, annual_price=$5, featured=$6,
         features=$7::jsonb, excluded=$8::jsonb, sort=$9`,
      [p[0], p[1], p[2], p[3], p[4], p[5], JSON.stringify(p[6]), JSON.stringify(p[7]), i]
    );
  }
  console.log('Seeded', content.programs.length, 'programs,', content.trainers.length, 'trainers,', content.plans.length, 'plans.');

  const adminEmail = (process.env.ADMIN_EMAIL || '').trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || '';
  if (!adminEmail || !adminPassword) {
    console.log('ADMIN_EMAIL or ADMIN_PASSWORD not set, so no admin account was created.');
    return;
  }
  if (adminPassword.length < 10) throw new Error('ADMIN_PASSWORD must be at least 10 characters.');
  const hash = await auth.hashPassword(adminPassword);
  const { rows } = await db.query(
    `insert into members (email, full_name, password_hash, role) values ($1, 'AURUM Admin', $2, 'admin')
     on conflict (lower(email)) do update set password_hash = $2, role = 'admin'
     returning id`,
    [adminEmail, hash]
  );
  console.log('Admin account ready for', adminEmail, '(' + rows[0].id + ')');
}

seed()
  .catch((err) => { console.error('Seed failed:', err.message); process.exitCode = 1; })
  .finally(() => db.close());
