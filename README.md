# AURUM Fitness

A multi-page luxury gym website with a working backend, built as a full-stack portfolio demo. AURUM is a fictional brand, and all names, prices and addresses are sample content.

**Live site:** https://aurum-fitness-nu.vercel.app

## What it does

- **Site:** home, about, programs (filterable), trainers, membership (monthly/annual toggle), contact. Custom gold cursor, click shockwaves, magnetic buttons, scroll animations.
- **Content API:** programs, trainers and plans load from Postgres. If the API is unreachable, the pages fall back to the content built into the HTML.
- **Tour booking:** the contact form saves requests to the database, with validation, a hidden spam-trap field and rate limiting.
- **Member accounts:** sign up, sign in, sign out, and a member dashboard with plan and payment history.
- **Payments (test mode):** pick a plan, check out, and confirm a simulated payment. A successful payment activates the membership. No card data is collected and no money moves.
- **Admin dashboard:** overview, tour requests (with status updates), members and payments. Admin only.

## Stack

| Layer | Choice |
| --- | --- |
| Frontend | Plain HTML, CSS and JavaScript in `public/` |
| API | Node.js serverless functions in `api/` (Vercel) |
| Database | Postgres through the `pg` driver |
| Auth | scrypt password hashing, random session tokens stored hashed, HttpOnly cookies |

## Project layout

```
public/        the website (static files)
api/           one file per endpoint
lib/           database, request handling, auth, validation, payments
db/            schema.sql, seed content, migrate and seed scripts
tests/         integration tests
server.js      local dev server (serves public/ and runs api/)
```

## API

| Method and path | Access | Purpose |
| --- | --- | --- |
| `GET /api/programs`, `/api/trainers`, `/api/plans` | public | site content |
| `POST /api/bookings` | public, rate limited | tour request |
| `POST /api/auth/signup`, `/login`, `/logout` | public | accounts |
| `GET /api/auth/me` | member | current member |
| `POST /api/payments/checkout` | member | create a pending payment (price comes from the database) |
| `POST /api/payments/confirm` | member, test mode only | settle a test payment |
| `GET /api/payments/status` | member | one payment (`?ref=`) or your history |
| `GET /api/admin/overview`, `/members`, `/payments` | admin | dashboard data |
| `GET`, `PATCH /api/admin/bookings` | admin | list and update tour requests |

## Run locally

You need Node 20 or newer and a Postgres database.

```
npm install
cp .env.example .env        # then fill in the values
npm run setup               # creates tables, loads content, creates the admin
npm run dev                 # http://localhost:3000
```

## Deploy on Vercel

1. Create a hosted Postgres database (Neon, Supabase or Vercel's Postgres integration) and copy its connection string.
2. In the Vercel project settings, add these environment variables:
   - `DATABASE_URL`: the connection string
   - `SESSION_SECRET`: a long random string
   - `PAYMENT_PROVIDER`: `test`
   - `ADMIN_EMAIL` and `ADMIN_PASSWORD`: the first admin account (password 10+ characters)
3. Redeploy. The build step (`vercel-build`) creates the tables, loads the site content and creates the admin account. It can be run again safely.

To change programs, trainers or plans, edit `db/content.js` and redeploy.

## Tests

```
TEST_DATABASE_URL=postgres://user:pass@localhost:5432/aurum_test npm test
```

The tests run the real handlers and SQL against Postgres. Use a throwaway database. Without `TEST_DATABASE_URL` they are skipped.

## Security notes

- All queries are parameterized. Every route validates its input.
- Prices are read from the database. The browser never sets an amount.
- Sessions are random tokens stored as SHA-256 hashes, so a database leak does not expose live sessions. Cookies are `HttpOnly`, `SameSite=Lax` and `Secure` in production.
- Sign-in, sign-up, bookings and checkout are rate limited using Postgres, so limits hold across serverless instances.
- State-changing requests from another origin are rejected.
- Secrets live in environment variables only.

## Going live with real payments

The built-in provider is `test`. For real money, add Razorpay or Stripe in `lib/payments.js`: create an order with the provider, send the member to its hosted checkout, and mark the payment paid from a webhook after verifying the provider's signature. The confirm route is disabled automatically when `PAYMENT_PROVIDER` is not `test`.
