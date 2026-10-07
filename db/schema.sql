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
