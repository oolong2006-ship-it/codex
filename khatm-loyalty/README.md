# ختم · Khatm — بطاقات ولاء رقمية للمقاهي والمطاعم

**ختم** منصة SaaS سعودية تحوّل بطاقة الأختام الورقية إلى بطاقة في **Apple Wallet** و **Google Wallet**:
العميل يمسح رمز المتجر، يكتب اسمه وجواله، وتصير البطاقة في محفظته خلال ٢٠ ثانية — بدون تطبيق.
الكاشير يمسح البطاقة من جواله أو جهاز الفرع فيُضاف الختم، وتتحدّث البطاقة في جوال العميل فوراً.

Khatm is an Arabic-first loyalty platform for cafés and restaurants in Saudi Arabia: stamp cards that live in the
customer's Apple/Google Wallet, a cashier PWA for scanning, and a merchant dashboard with analytics and WhatsApp win-back campaigns.

## Status

| Area | State |
|---|---|
| Merchant signup, dashboard, branches, staff (Owner / Manager / Cashier) | ✅ |
| Loyalty program editor with live card preview | ✅ |
| Customer enrollment page (Arabic-first, PDPL consent, optional marketing opt-in) | ✅ |
| Web card (works everywhere, also the fallback when wallets are not configured) | ✅ |
| Cashier PWA: camera QR scan, USB scanner / phone lookup, stamps, rewards, redeem | ✅ |
| Fraud controls: signed barcodes (key rotation), cooldown, max per scan, row locks, audit log, rate limits | ✅ |
| Analytics: KPIs, weekly visits, branch performance, at-risk customers, CSV export | ✅ |
| PDPL: per-customer export, merchant-side and self-service erasure | ✅ |
| Apple Wallet `.pkpass` signing + Wallet web service + APNs pushes | 🟡 implemented and unit-tested with self-signed certs; needs a real Pass Type ID certificate to verify on a device |
| Google Wallet save links + object updates | 🟡 implemented and unit-tested; needs a Google Wallet issuer account to verify |
| WhatsApp campaigns | 🟡 Cloud API provider implemented; marketing outside the 24h window needs approved templates (see roadmap) |
| Foodics automatic stamping (webhook) | 🟡 HMAC + idempotency done; payload mapping is an assumption until checked against Foodics' sandbox |
| Points programs, NFC tap-to-stamp, multi-program per merchant, billing | ⚪ roadmap |

## Quick start (local)

Requirements: Node 22+, PostgreSQL 16.

```bash
cd khatm-loyalty
cp .env.example .env            # defaults work for local dev (mock wallet, console messaging)
npm install
npm run db:setup                # creates role khatm + databases khatm, khatm_test (uses PGSUPER_URL)
npm run db:migrate
npm run db:seed                 # demo café "brew-house" with 24 customers and 12 weeks of history
npm run dev                     # http://localhost:3200
npm run worker                  # optional: retries wallet pushes / WhatsApp messages
```

Demo accounts (from `db:seed`, password = `SEED_PASSWORD` in `.env`):

| Where | Login |
|---|---|
| Dashboard `/login` | `owner@khatm.dev` or `manager@khatm.dev` |
| Cashier `/pos/login` | business code `brew-house`, PIN `1234` (Olaya) / `5678` (Tahlia) |
| Customer join page | `/join/brew-house` |

## Checks

```bash
npm run typecheck
npm test            # Vitest, 43 tests against a real Postgres (khatm_test)
npm run build
npm run test:e2e    # Playwright: signup → program → join → stamp ×3 → reward → redeem, EN/AR, security
npm run verify      # typecheck + test + build
```

CI: `.github/workflows/khatm-loyalty-ci.yml` (runs only when `khatm-loyalty/**` changes).

## Documentation

- [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) — structure, data model, security model, flows
- [docs/WALLET_SETUP.md](docs/WALLET_SETUP.md) — Apple Pass Type ID certificate and Google Wallet issuer setup
- [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) — production checklist (Saudi hosting, secrets, worker)
- [docs/ROADMAP.md](docs/ROADMAP.md) — what's next
- [AGENTS.md](AGENTS.md) — conventions for contributors and coding agents
