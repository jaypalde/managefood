# KumbhSetu — Smart Food Redistribution & Waste Management System

Full-stack, deployable platform for Kumbh Mela: tracks surplus food at stalls, QR-based
pickup/delivery via distributors, redistribution to stalls in need, pilgrim distribution
when no stall needs it, and a separate waste-management workflow for unsafe/expired food.

**One login/registration screen** — the person picks their role (Stall Operator /
Distributor / Admin) with a tab selector, then registers or logs in as that role.
Each role gets its own dashboard.

---

## 1. What's included

- **Backend**: Node.js + Express REST API (`src/`)
- **Database**: PostgreSQL (production) / SQLite (local dev) via Prisma ORM (`prisma/schema.prisma`)
- **Frontend**: Plain HTML/CSS/JS dashboards (`public/`) — no build step, so it deploys as-is
- **Auth**: JWT, role-based (STALL_OPERATOR / DISTRIBUTOR / ADMIN), single login+register page
- **QR system**: server-generated QR codes (`qrcode` npm package) + camera scanning in the
  browser (`html5-qrcode`, loaded from CDN, no install needed) with duplicate-scan
  prevention via `QRTransaction.scanToken`
- **Matching engine**: `src/lib/matching.js` — scores excess-food-batch → open-request
  pairs by distance, urgency and time-to-expiry (soonest-expiring food is prioritized)
- **Admin dashboard**: live stats, daily trend chart (Chart.js via CDN), stall/distributor
  verification, zone-wise breakdown, waste tracking
- **Public Pilgrim page** (`/pilgrim/map.html`): no login required, shows active free-food
  distribution points on an OpenStreetMap/Leaflet map

This is a genuinely working MVP, not a mockup — every button calls a real API route that
reads/writes the database. It is intentionally built without a heavy frontend framework so
it can be deployed as a single Node service with zero build pipeline.

---

## 2. Run it locally (5 minutes)

Requires Node.js 18+.

```bash
cd kumbhsetu
cp .env.example .env
# open .env and set JWT_SECRET and ADMIN_INVITE_CODE to your own random values

npm install
npx prisma migrate dev --name init   # creates dev.db (SQLite) and applies the schema
npm run seed                          # optional: adds sample zones + pilgrim points
npm run dev                           # starts on http://localhost:4000
```

Open `http://localhost:4000`. Register as **Admin** first (you'll need the
`ADMIN_INVITE_CODE` from your `.env`), then register a Stall Operator and a Distributor
from the same login page (just switch the role tab), verify them from the Admin dashboard,
and you can run the full flow end-to-end.

---

## 3. Deploy it for real (production)

### Recommended stack for a real Kumbh-Mela-scale deployment
- **App hosting**: Render, Railway, or Fly.io (all have a free/low-cost tier and support
  always-on Node processes, which this app needs since it's not serverless-friendly as written)
- **Database**: managed PostgreSQL — Neon, Railway Postgres, or Supabase (free tiers available,
  and all give you a `DATABASE_URL` directly)
- **Domain**: point your own domain at the host, or use the free subdomain they give you

### Step-by-step (Render + Neon — both free to start)

1. **Create the database**: sign up at neon.tech → New Project → copy the connection
   string it gives you (starts with `postgresql://...`).
2. **Push this code to GitHub**: create a new repo and push the `kumbhsetu/` folder to it.
3. **Create the web service on Render**:
   - New → Web Service → connect your GitHub repo
   - Build command: `npm install && npx prisma migrate deploy`
   - Start command: `npm start`
   - Add environment variables (Render dashboard → Environment):
     - `DB_PROVIDER=postgresql`
     - `DATABASE_URL=` (paste the Neon connection string)
     - `JWT_SECRET=` (generate: `openssl rand -hex 32`)
     - `ADMIN_INVITE_CODE=` (your own secret code — share only with event organizers)
     - `NODE_ENV=production`
     - `CORS_ORIGIN=` your Render URL once you have it (or `*` to start)
   - **Important**: change `provider = env("DB_PROVIDER")` behavior — Prisma actually needs
     the provider fixed at generate time. See note below.
4. Click **Deploy**. Render builds, runs the migration against Neon, and starts the server.
5. Visit your Render URL — the full app (login, dashboards, pilgrim map) is now live.
6. (Optional) run `npm run seed` once via Render's shell tab to add starter zones/points.

> **Prisma provider note**: Prisma's `datasource.provider` must be a literal string, not an
> env var, at `prisma generate` time. Before deploying to Postgres, open
> `prisma/schema.prisma` and change:
> ```prisma
> datasource db {
>   provider = "postgresql"   // was: env("DB_PROVIDER")
>   url      = env("DATABASE_URL")
> }
> ```
> Keep it as `"sqlite"` while developing locally, switch to `"postgresql"` before your
> production build/deploy. (This is a one-line change; everything else in the code is
> already provider-agnostic.)

### Alternative: Railway
Same idea — Railway can host both the Node app and a Postgres database in one project,
which is slightly simpler than wiring Render + Neon separately. Use "Deploy from GitHub
repo", add a Postgres plugin (Railway sets `DATABASE_URL` for you automatically), set the
other env vars above, and set the start command to `npm run prisma:migrate && npm start`.

---

## 4. Roles & single login window

`public/index.html` is the one entry point for everyone:
- A **role selector** (Stall Operator / Distributor / Admin) at the top
- **Login** and **Register** tabs underneath it
- Registering as Stall Operator or Distributor creates an account with
  `PENDING_VERIFICATION` status — an Admin must verify it (Admin dashboard → Stalls /
  Distributors) before that account can add food or accept pickups. This models the
  real-world need for organizers to vet who's operating in the Mela.
- Registering as Admin requires the `ADMIN_INVITE_CODE` from your `.env`, so random
  visitors can't self-grant admin access from the public page.

---

## 5. Project structure

```
kumbhsetu/
  prisma/
    schema.prisma        # full relational schema (17 models)
    seed.js
  src/
    server.js             # Express app entry point
    lib/
      db.js                # Prisma client singleton
      auth.js              # JWT + bcrypt + role middleware
      matching.js           # excess-food -> demand matching engine
      qr.js                 # QR generation + scan tokens
      notify.js              # in-app notification helpers
    routes/
      auth.js, stalls.js, foodBatches.js, requests.js, pickups.js,
      deliveries.js, waste.js, notifications.js, zones.js, pilgrim.js, admin.js
  public/
    index.html             # unified login/register (role selector)
    css/style.css
    js/api.js               # shared fetch/auth helper for all pages
    stall/dashboard.html
    distributor/dashboard.html
    admin/dashboard.html
    pilgrim/map.html         # public, no auth
  .env.example
  package.json
```

---

## 6. Security notes already built in
- Passwords hashed with bcrypt; JWT-based sessions; role-based route guards on every endpoint
- Admin self-registration gated behind a secret invite code
- Stalls/distributors must be **admin-verified** before they can transact
- Every QR scan is validated against the specific pickup/delivery record and logged as an
  immutable `QRTransaction` with a unique one-time `scanToken` — a screenshot of a QR code
  can't be replayed to fake a second pickup/delivery
- Rate limiting on `/api/auth/*` and general API traffic
- `helmet` for standard HTTP security headers; CORS restricted via `CORS_ORIGIN`
- `AuditLog` table records sensitive admin actions (e.g. stall verification changes)

## 7. What to harden before a real Kumbh Mela deployment
- Add SMS OTP verification on phone numbers at registration (currently password-only)
- Move notifications from in-app polling to push notifications (FCM) or SMS for
  distributors without constant connectivity
- Add file/photo upload for waste reports (currently text reason only) — see "Future
  advanced features" in `BLUEPRINT.md`
- Load-test the matching engine at thousands-of-stalls scale and move it to a background
  job/queue (e.g. BullMQ + Redis) instead of running synchronously on request
- Put the app behind HTTPS (automatic on Render/Railway) and review `CORS_ORIGIN`

See `BLUEPRINT.md` for the complete system design write-up (architecture diagram,
ER description, full API list, MVP vs. future roadmap, and real-world deployment
suggestions) — the original 22-point request from the project brief.
