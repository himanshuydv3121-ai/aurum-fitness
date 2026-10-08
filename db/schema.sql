-- AURUM Fitness schema. Safe to run more than once.

create table if not exists programs (
  slug text primary key,
  name text not null,
  category text not null,
  category_label text not null,
  icon text not null,
  description text not null,
  duration text not null,
  level int not null check (level between 1 and 5),
  schedule text not null,
  coach text not null,
  sort int not null default 0
);

create table if not exists trainers (
  slug text primary key,
  name text not null,
  initials text not null,
  role text not null,
  bio text not null,
  cert text not null,
  color text not null,
  sort int not null default 0
);

create table if not exists plans (
  slug text primary key,
  name text not null,
  tag text not null,
  monthly_price int not null check (monthly_price > 0),
  annual_price int not null check (annual_price > 0),
  featured boolean not null default false,
  features jsonb not null default '[]',
  excluded jsonb not null default '[]',
  sort int not null default 0
);

create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  full_name text not null,
  password_hash text not null,
  role text not null default 'member' check (role in ('member', 'admin')),
  plan_slug text references plans (slug),
  billing text check (billing in ('monthly', 'annual')),
  membership_status text not null default 'none' check (membership_status in ('none', 'active', 'expired')),
  membership_until timestamptz,
  created_at timestamptz not null default now()
);
create unique index if not exists members_email_key on members (lower(email));

create table if not exists sessions (
  token_hash text primary key,
  member_id uuid not null references members (id) on delete cascade,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
create index if not exists sessions_member_idx on sessions (member_id);

create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text not null,
  phone text,
  interest text not null,
  slot text not null,
  plan text,
  message text,
  status text not null default 'new' check (status in ('new', 'contacted', 'toured', 'closed')),
  ip_hash text,
  created_at timestamptz not null default now()
);
create index if not exists bookings_created_idx on bookings (created_at desc);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid not null references members (id),
  plan_slug text not null references plans (slug),
  billing text not null check (billing in ('monthly', 'annual')),
  amount_minor int not null check (amount_minor > 0),
  currency text not null default 'INR',
  provider text not null,
  provider_ref text not null unique,
  status text not null default 'pending' check (status in ('pending', 'paid', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  paid_at timestamptz
);
create index if not exists payments_member_idx on payments (member_id, created_at desc);

create table if not exists rate_limits (
  key text primary key,
  window_start timestamptz not null,
  count int not null
);

-- ---------------------------------------------------------------------------
-- v2: owner-editable site, class booking, newsletter, email, password reset
-- Everything below is safe to run more than once.
-- ---------------------------------------------------------------------------

-- Text edits made on the live site and all admin settings. Only values that differ from the
-- defaults built into the page templates are stored here.
create table if not exists site_content (
  key text primary key,
  value text not null,
  updated_at timestamptz not null default now()
);

alter table members add column if not exists phone text;
alter table members add column if not exists active boolean not null default true;

alter table programs add column if not exists days text not null default '';
alter table programs add column if not exists start_time text not null default '';
alter table programs add column if not exists capacity int not null default 6;
alter table programs add column if not exists featured boolean not null default false;
alter table programs add column if not exists active boolean not null default true;

alter table trainers add column if not exists photo text not null default '';
alter table trainers add column if not exists active boolean not null default true;

alter table plans add column if not exists active boolean not null default true;

alter table payments add column if not exists provider_payment_id text;

alter table bookings add column if not exists notes text not null default '';

create table if not exists class_sessions (
  id uuid primary key default gen_random_uuid(),
  program_slug text not null references programs (slug) on delete cascade,
  starts_at timestamptz not null,
  capacity int not null check (capacity >= 0),
  notes text not null default '',
  cancelled boolean not null default false,
  generated boolean not null default false,
  unique (program_slug, starts_at)
);
create index if not exists class_sessions_start_idx on class_sessions (starts_at);

create table if not exists class_bookings (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references class_sessions (id) on delete cascade,
  member_id uuid not null references members (id) on delete cascade,
  status text not null default 'confirmed' check (status in ('confirmed', 'cancelled')),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz
);
create unique index if not exists class_bookings_active_key on class_bookings (session_id, member_id) where status = 'confirmed';
create index if not exists class_bookings_member_idx on class_bookings (member_id, created_at desc);

create table if not exists subscribers (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token text not null,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index if not exists subscribers_email_key on subscribers (lower(email));

-- Every email the site sends or tries to send. Without SMTP configured, messages are only logged here.
create table if not exists outbox (
  id uuid primary key default gen_random_uuid(),
  to_addr text not null,
  subject text not null,
  body text not null,
  kind text not null default '',
  status text not null default 'queued',
  error text,
  created_at timestamptz not null default now()
);
create index if not exists outbox_created_idx on outbox (created_at desc);

create table if not exists password_resets (
  token_hash text primary key,
  member_id uuid not null references members (id) on delete cascade,
  expires_at timestamptz not null,
  used_at timestamptz
);

-- Uploaded images (trainer photos). Stored in Postgres because serverless hosting has no disk.
create table if not exists media (
  id uuid primary key default gen_random_uuid(),
  content_type text not null,
  data bytea not null,
  created_at timestamptz not null default now()
);
