# Production checklist

## Hosting (Saudi PDPL)
- Run the web app and Postgres in a Saudi region (e.g. STC Cloud, Oracle Jeddah/Riyadh, Google Cloud Dammam,
  Microsoft/Azure KSA when available) if you store personal data of Saudi residents and want in-Kingdom residency.
- Managed Postgres 16 with daily backups and point-in-time recovery.

## Processes
- Web: `npm ci && npm run build && npm run db:migrate && npm start` (port 3200, behind HTTPS).
- Worker: one instance of `npm run worker` (retries wallet pushes and WhatsApp messages, prunes rate limits).

## Secrets (env / secret manager — never in the repo)
- `DATABASE_URL`, `APP_URL` (https)
- `CARD_TOKEN_KEYS` — generate with `openssl rand -base64 48`; to rotate, prepend `2:<new>` and keep `1:<old>`
  until all passes have refreshed.
- Apple/Google wallet credentials (see WALLET_SETUP.md), WhatsApp token.
- Do **not** run `db:seed` in production.

## Before go-live
- [ ] HTTPS everywhere, `APP_URL` correct (Wallet callbacks and Google logo depend on it)
- [ ] `WALLET_PROVIDER=live`, a real pass added on an iPhone and an Android phone, update push verified
- [ ] Foodics payload mapping verified against the sandbox (`src/server/integrations/foodics.ts`)
- [ ] WhatsApp message templates approved for marketing campaigns
- [ ] Privacy policy reviewed by counsel; commercial registration and VAT details in the footer
- [ ] Monitoring on `/api/health`, error tracking, outbox backlog alert (`SELECT count(*) FROM outbox_jobs WHERE done_at IS NULL`)
- [ ] `npm audit --omit=dev` clean
