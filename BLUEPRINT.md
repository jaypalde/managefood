# KumbhSetu — Complete Project Blueprint

## 1. Project name & one-line description
**KumbhSetu** ("Kumbh Bridge") — a centralized platform that tracks surplus food across
thousands of Kumbh Mela stalls, routes it to stalls or pilgrims in need via QR-verified
distributor pickups/deliveries, and separates unsafe food into a dedicated waste workflow.

## 2. Problem statement
At Kumbh Mela scale (hundreds-thousands of food stalls), surplus and shortage happen
simultaneously across the site with no shared visibility. Good food goes to waste at one
stall while pilgrims go hungry a kilometer away, and there's no reliable way to separate
genuinely spoiled food from food that's simply surplus.

## 3. Proposed solution
A real-time, centralized inventory + matching system: stalls log every batch of food they
prepare; surplus is marked "available" and QR-tagged; a matching engine scores it against
open demand (from other stalls) by distance/urgency/expiry; verified distributors accept
pickup/delivery jobs and confirm each leg by scanning the batch QR; food with no stall
demand goes to pilgrim distribution points; food that's unsafe is explicitly marked and
routed into a separate, auditable waste-management pipeline — never mixed with the
redistribution pool.

## 4. Complete user flow
1. Stall operator logs food batch → marks surplus "available" → QR generated.
2. System notifies nearby verified distributors.
3. Distributor accepts pickup, travels to stall, scans QR → pickup confirmed, source
   inventory decremented.
4. Matching engine (or admin-triggered sweep) has already paired the batch against the
   best open request; distributor is shown the target stall.
5. Distributor delivers, receiving stall scans QR → delivery confirmed, request fulfilled.
6. If no request matches, distributor routes to a pilgrim distribution point instead;
   scan there logs a `PilgrimDistributionRecord`.
7. If food is reported unfit at any point, it's removed from the pool into `WasteRecord`
   with a category and reason, and later marked collected/processed by ops staff.
8. Admin dashboard aggregates all of the above in real time.

*(This is implemented exactly as described in `src/routes/*` — see section 8 for the API list.)*

## 5. System architecture

```
 Stall Web App        Distributor Web App        Admin Dashboard        Pilgrim App (public)
        │                     │                          │                     │
        └─────────────────────┴────────────┬─────────────┴─────────────────────┘
                                             │  HTTPS / JSON
                                     ┌───────▼────────┐
                                     │  Express REST   │  (src/server.js + routes/*)
                                     │  API (Node.js)  │  JWT auth, role middleware,
                                     │                 │  rate limiting, audit logging
                                     └───────┬────────┘
                                             │  Prisma ORM
                                     ┌───────▼────────┐
                                     │  PostgreSQL     │  (SQLite for local dev)
                                     │  (Neon/Railway) │
                                     └───────┬────────┘
                                             │
                                ┌────────────▼─────────────┐
                                │  Matching Engine           │  src/lib/matching.js
                                │  (excess → demand scoring)  │  triggered on mark-available
                                └────────────┬─────────────┘  and via admin sweep
                                             │
                     ┌───────────────────────┼───────────────────────┐
                     ▼                       ▼                       ▼
              Pickup/Delivery         Other Stall Delivery     Pilgrim Distribution
              (QR-confirmed)          (fulfils request)         (QR-confirmed)
                                             │
                                    (unfit food at any stage)
                                             ▼
                                      Waste Management
                                      (WasteRecord → collected → processed)
```

At Mela scale, the two elements worth scaling independently first are the matching engine
(move to a queue/worker, see "Future advanced features") and notification delivery (move
from in-app polling to push/SMS).

## 6. Database ER diagram (description)
Core entities and relationships (full field list in section 7 and `prisma/schema.prisma`):

- **User** (1) —(1) **Stall** / **Distributor** / **Admin** — one auth identity, one role profile
- **Zone** (1) —(*) **Stall**, (1) —(*) **PilgrimDistributionPoint** — geographic grouping
- **Stall** (1) —(*) **FoodBatch**, (1) —(*) **RedistributionRequest**, (1) —(*) **WasteRecord**
- **FoodBatch** (1) —(*) **QRTransaction**, (1) —(*) **PickupRecord**, (1) —(*) **DeliveryRecord**,
  (1) —(*) **WasteRecord**, (1) —(*) **PilgrimDistributionRecord**, (0..1) —(*) **RedistributionRequest** (matched batch)
- **Distributor** (1) —(*) **PickupRecord**, (1) —(*) **DeliveryRecord**
- **DeliveryRecord** —(0..1) **RedistributionRequest** (if delivering to a stall that asked),
  —(0..1) **PilgrimDistributionPoint** (if delivering to pilgrims)
- **User** (1) —(*) **Notification**, (1) —(*) **AuditLog**

## 7. Database tables & fields
See `prisma/schema.prisma` for the authoritative, fully-typed version. Summary:

| Table | Key fields |
|---|---|
| User | id, name, phone (unique), email, passwordHash, role, isActive |
| Stall | id, userId, stallName, zoneId, latitude, longitude, status |
| Distributor | id, userId, vehicleInfo, status, isAvailable, currentLat/Lng |
| Admin | id, userId, designation |
| Zone | id, name, description |
| FoodItem | id, name, category, isTemperatureSensitive (catalog, optional) |
| FoodBatch | id, batchCode (QR key), stallId, foodName, totalServings, remainingServings, preparedAt, usableUntil, status |
| RedistributionRequest | id, requestingStallId, quantityNeeded, quantityFulfilled, urgency, status, matchedBatchId |
| PickupRecord | id, foodBatchId, distributorId, quantity, status, acceptedAt, confirmedAt |
| DeliveryRecord | id, foodBatchId, distributorId, targetType, targetStallId/pilgrimPointId, quantity, status |
| PilgrimDistributionPoint | id, name, zoneId, latitude, longitude, isActive |
| PilgrimDistributionRecord | id, foodBatchId, pointId, quantity, distributedAt |
| WasteRecord | id, foodBatchId, stallId, foodName, quantity, reason, category, status, reportedById |
| QRTransaction | id, foodBatchId, action, scannedByUserId, quantity, scanToken (unique), scannedAt |
| Notification | id, userId, type, title, message, isRead |
| AuditLog | id, userId, action, entity, entityId, metadata |
| SystemConfig | key, value — configurable rules (max holding time, etc.), not hardcoded |

## 8. API list (all implemented in `src/routes/`)

**Auth** — `/api/auth`: `POST /register` (unified, role in body), `POST /login`, `GET /me`

**Stalls** — `/api/stalls`: `GET /me`, `PATCH /me`, `GET /` (admin), `PATCH /:id/verify` (admin)

**Food batches** — `/api/food-batches`: `POST /`, `GET /mine`, `GET /available`,
`PATCH /:id/mark-available`, `GET /:id/qr`, `PATCH /:id/mark-unfit`

**Requests (demand)** — `/api/requests`: `POST /`, `GET /`, `GET /mine`, `POST /match-sweep` (admin)

**Pickups** — `/api/pickups`: `POST /accept`, `POST /:id/confirm-scan`, `GET /mine`

**Deliveries** — `/api/deliveries`: `POST /assign`, `POST /:id/confirm-scan`, `GET /mine`

**Waste** — `/api/waste`: `GET /` (admin), `GET /mine`, `PATCH /:id/collect` (admin)

**Notifications** — `/api/notifications`: `GET /`, `PATCH /:id/read`, `PATCH /read-all`

**Zones** — `/api/zones`: `GET /` (public), `POST /` (admin)

**Pilgrim points** — `/api/pilgrim-points`: `GET /` (public, no auth), `POST /` (admin)

**Admin** — `/api/admin`: `GET /stats`, `GET /most-active-stalls`, `GET /zone-stats`,
`GET /trends`, `GET /distributors`, `PATCH /distributors/:id/verify`

## 9. QR-code workflow
`Created → Available → Pickup Accepted → Picked Up → In Transit → Delivered /
Pilgrim Distributed` (or `Not Fit → Wasted`). Each QR encodes only an opaque `batchCode`;
every scan is validated server-side against the exact pickup/delivery record and logged in
`QRTransaction` with a unique `scanToken`, so a photographed QR can't be replayed for a
second, unauthorized transaction (`src/routes/pickups.js`, `deliveries.js`).

## 10. Food matching algorithm
`src/lib/matching.js`: for every `AVAILABLE` batch (processed soonest-expiring first),
scores each `OPEN` request by distance (Haversine), urgency, minutes-to-expiry, and
quantity fit, and proposes the lowest-score (best) match. Weights are parameters, not
hardcoded constants, so they can be tuned per deployment.

## 11. Notification system
In-app `Notification` records per user, created on: food marked available (nearby
distributors), pickup accepted (source stall), delivery en route (destination stall).
Extend with FCM push / SMS for production (see "Future advanced features").

## 12. Role-based permissions
Enforced via `requireAuth` + `requireRole(...)` middleware on every route (see table in
section 8). Stall operators can only act on their own stall; distributors only on their
own pickups/deliveries; only Admin can verify stalls/distributors, run global matching
sweeps, and view system-wide analytics.

## 13–14. UI screens
Implemented: unified login/register (role selector), Stall dashboard (Add Food, Inventory,
Request Food, Report Waste, Notifications), Distributor dashboard (Available Pickups,
Delivery Requests, Active Assignments, QR Scanner, History), Admin dashboard (Overview +
charts, Stalls, Distributors, Requests/Matching, Waste, Zones & Pilgrim Points), public
Pilgrim map. All in `public/`.

## 15. Technology stack

| Layer | Student-prototype (what's built here) | Production-scale upgrade path |
|---|---|---|
| Frontend | Plain HTML/CSS/JS, no build step | React/Next.js for richer state management at scale |
| Backend | Node.js + Express | Same, or split into microservices (matching engine as its own worker) |
| DB | SQLite (dev) | Managed PostgreSQL (Neon/RDS) with read replicas |
| Auth | JWT + bcrypt | Same + SMS OTP, optionally Auth0/Cognito |
| QR | `qrcode` (server) + `html5-qrcode` (browser, CDN) | Same libraries scale fine |
| Notifications | In-app polling | Firebase Cloud Messaging (push) + SMS gateway |
| Realtime updates | Client polling | WebSockets (Socket.io) or Server-Sent Events for live dashboards |
| Matching engine | Synchronous, in-request | Background job queue (BullMQ + Redis) running every N seconds |
| Hosting | Render/Railway single service | Containerized (Docker) on ECS/Kubernetes, autoscaled |
| Maps | Leaflet + OpenStreetMap (free) | Google Maps Platform for turn-by-turn navigation |

## 16. Folder/project structure
See `README.md` section 5.

## 17. Security considerations (implemented)
Bcrypt password hashing, JWT sessions, role middleware on every endpoint, admin
invite-code gate, mandatory admin verification before stalls/distributors can transact,
one-time QR scan tokens preventing duplicate/fraudulent scans, rate limiting on auth and
general API traffic, helmet security headers, audit logging of sensitive admin actions.

## 18. Scalability considerations
Stateless Express API (horizontally scalable behind a load balancer), indexed foreign
keys and status columns in the schema for the query patterns the dashboards actually use,
matching engine designed as a pure function that can be lifted into a background worker
without changing its interface, pagination-ready list endpoints (add `take`/`skip` as
volume grows — not yet wired up, flagged in "harden before deployment").

## 19. Example end-to-end transaction
Stall A cooks 1000 servings, marks 100 available → QR generated → Distributor D notified,
accepts, scans QR at Stall A (pickup confirmed, Stall A inventory now 0 available) →
matching engine had paired it with Stall B's open request for 50 → D delivers to Stall B,
scans QR there (delivery confirmed, request marked PARTIALLY_FULFILLED, 50 remain with D)
→ no further request matches the remaining 50 → D routes it to Pilgrim Point P, scans QR
there → `PilgrimDistributionRecord` created, batch status `PILGRIM_DISTRIBUTED`. If 10 of
the original 1000 had instead spoiled before pickup, the operator would have marked them
`NOT_FIT` with category `SPOILED`, creating a `WasteRecord` never touched by any of the above.

## 20. MVP a student can realistically build
Exactly what's in this repository: unified auth, one food-batch lifecycle, QR
generate/scan, one matching pass, waste reporting, and an admin dashboard with live stats
— all working against a real database, deployable for free on Render + Neon in under an
hour. This is intentionally the whole MVP, not a subset of it.

## 21. Future advanced features
- SMS OTP verification at registration; SMS notifications for distributors offline/low-signal
- Push notifications (FCM) instead of in-app polling
- Photo upload for waste reports (visual proof of spoilage) and for pickup/delivery confirmation
- Turn-by-turn navigation integration (Google/Mapbox Directions API) for distributors
- Background job queue for the matching engine, running continuously rather than on-demand
- Configurable food-safety rule engine surfaced in the Admin UI (reads from `SystemConfig`
  instead of requiring a code change)
- Offline-first distributor app (service worker + local queue) for patchy network zones
- Multi-language UI (Hindi/regional languages) — high-value given the user base
- Fraud/anomaly detection: flag stalls or distributors with unusual pickup/waste patterns
- Public read-only "impact dashboard" (meals saved, waste diverted) for sponsors/press

## 22. Making this genuinely useful for a real Kumbh Mela deployment
- Get buy-in from an existing Mela food-committee/NGO early — they already have the stall
  registry and volunteer network; the app should plug into that, not replace it overnight
- Start with one sector/zone as a pilot before rolling out to thousands of stalls
- Pair every distributor account with a physical ID badge cross-checked at admin
  verification — QR fraud prevention only works if the human verification step is real
- Design for low-end Android phones and patchy connectivity (this is why offline queueing
  is in the future-features list, not the MVP)
- Keep the food-safety thresholds (max holding time etc.) configurable and owned by actual
  food-safety officials, not hardcoded by developers
- Plan the waste-collection logistics (who physically picks up `WasteRecord` items and
  where they go) alongside the software — the app can track it, but someone still has to
  drive the truck
