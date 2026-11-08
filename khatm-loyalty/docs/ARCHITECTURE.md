# Architecture

## Layout

```
khatm-loyalty/
├─ db/migrations/            append-only SQL migrations (scripts/migrate.ts)
├─ scripts/                  db-setup.sh, migrate, seed (demo), worker (outbox retries)
├─ src/
│  ├─ lib/i18n.ts            Arabic-first dictionary, formatters
│  ├─ server/                server-only code (no React)
│  │  ├─ db.ts               pg pool, q/one helpers, tx() with onCommit hooks
│  │  ├─ actor.ts rbac.ts    authenticated principal + role → permission map
│  │  ├─ tokens.ts           signed card barcodes (HMAC, key rotation), random ids
│  │  ├─ rate-limit.ts       Postgres fixed-window limiter
│  │  ├─ outbox.ts jobs.ts   transactional outbox + handlers
│  │  ├─ domain/             accounts, enrollment, stamping, management, customers, analytics, campaigns
│  │  ├─ wallet/             provider interface; apple.ts (pkpass + APNs), apple-service.ts (web service),
│  │  │                      google.ts (save JWT, REST), live.ts, mock.ts, pass-view.ts, png.ts, zip.ts
│  │  ├─ integrations/       POS adapter interface, Foodics adapter, webhook handler
│  │  ├─ messaging/          console + WhatsApp Cloud API providers
│  │  └─ web.ts              cookies, current actor, error → message mapping
│  ├─ components/            CardFace (shared pass face), form bits, shells
│  └─ app/                   Next.js routes (see below)
├─ tests/                    Vitest (real Postgres)
└─ e2e/                      Playwright
```

## Surfaces

| Route | Who | Notes |
|---|---|---|
| `/`, `/privacy` | public | marketing + privacy policy |
| `/signup`, `/login` | merchant | email + password, 14-day session |
| `/dashboard/*` | OWNER, MANAGER | overview, customers, program, poster, campaigns, branches, staff, integrations, activity |
| `/pos/login`, `/pos/branch`, `/pos` | cashier device | business code + PIN, session bound to a branch, 30 days |
| `/join/[slug]` | customer | enrollment with consent |
| `/c/[serial]?k=…` | customer | web card; `k` is the card's auth token |
| `/api/wallet/apple/v1/*` | Apple Wallet | register/unregister device, changed serials, latest pass, log |
| `/api/wallet/apple/pass/[serial]`, `/api/wallet/google/[serial]` | customer | add-to-wallet |
| `/api/pos/{lookup,stamp,redeem}` | cashier PWA | JSON |
| `/api/integrations/[provider]/[id]` | POS | HMAC-signed webhook |

## Data model

`merchants` 1—n `branches`, `staff_users`, `loyalty_programs`, `customers`.
`cards` link a customer to a program (one ACTIVE card per program+customer) and hold the live counters
(`current_stamps`, `rewards_available`, `total_stamps`, `last_stamp_at`).
`stamp_events` and `redemptions` are the immutable history (who, branch, source, device). On customer deletion
they keep `card_id = NULL` so aggregate analytics survive while personal data is gone.
`outbox_jobs` carries wallet pushes and messages; `wallet_registrations` stores Apple device push tokens.

## Security model

- **Principal**: `Actor { staffUserId, merchantId, role, branchId }` comes only from a session row looked up by the
  SHA-256 of an httpOnly cookie token. Dashboard and cashier sessions are separate kinds.
- **Tenant isolation**: every domain query filters by `actor.merchantId`; cross-tenant ids return "not found".
  Covered by `tests/loyalty.test.ts › tenant isolation`.
- **Barcodes**: `K<kid>.<serial>.<hmac>` — forged or guessed codes are rejected before any database lookup.
  Keys rotate via `CARD_TOKEN_KEYS` (first signs, all verify).
- **Stamping**: `SELECT … FOR UPDATE` on the card, cooldown and max-per-scan checks, event insert and outbox enqueue
  in one transaction. Concurrent double-taps produce exactly one stamp (tested).
- **Enrollment privacy**: re-enrolling an existing phone never reveals the card; the link is sent to that phone.
- **Rate limits**: login (IP + email), PIN (IP + merchant), enrollment (IP + phone), lookups, campaigns.
- **Webhooks**: HMAC-SHA256 of the raw body with a per-integration secret, constant-time compare, idempotent by order id.
- **Headers**: CSP, frame-ancestors none, HSTS, nosniff, referrer policy (`next.config.ts`).
- **CSV export**: formula-injection safe.

## Live updates flow

```
cashier taps "add stamp"
  → addStamps(): lock card → validate → update counters → insert stamp_event → enqueue wallet.card_changed → COMMIT
  → onCommit: drainOutbox()  (worker retries failures with backoff)
      → Apple: APNs push to each registered device → device calls GET /v1/passes/... → fresh signed .pkpass
      → Google: PUT loyaltyObject
```
