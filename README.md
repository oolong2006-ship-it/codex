# Supplier Intelligence Hub

An enterprise platform to **register, qualify, classify, and discover suppliers** — turning
supplier data, catalogs, and documents into a structured, searchable, analyzable database.

> Discovery → Registration → Prequalification → Documents → AI Classification → Approval → Search → Intelligence

Built for the Saudi procurement market (CR, VAT, National Address, IBAN, SFDA/SASO/ZATCA,
Saudi regions & cities), with full **Arabic (RTL)** and **English (LTR)** support and a
multi-tenant architecture ready to grow into SaaS.

---

## MVP scope (implemented)

| Area | What works today |
|------|------------------|
| **Authentication** | NextAuth credentials, JWT sessions, 4 roles |
| **RBAC & tenant isolation** | Server-side permission catalogue, per-organization data scoping, route middleware |
| **Supplier registration** | Public multi-step self-registration with duplicate screening |
| **Supplier portal** | Editable company profile, contacts, categories, products, services, brands, coverage, commercial terms |
| **Documents** | Upload (type/size validation), expiry tracking, per-category required-document rules, secure authenticated download |
| **AI Catalog Intelligence** | Extract structured products from catalog text/PDF → human review → approve into catalog (Claude, with heuristic fallback) |
| **AI Classification** | Suggest primary/secondary categories, keywords from company & products |
| **Duplicate detection** | CR / VAT / IBAN / phone / email-domain / name-similarity screening |
| **Approval workflow** | Approve, Prequalify, Conditional, Reject, Suspend, Blacklist, Request Info — with status history |
| **Search engine** | Full-text-ish search across suppliers/products/brands/categories/services + structured filters |
| **Supplier profile** | Tabbed profile (Overview, Products, Services, Brands, Documents, Locations, Terms, Evaluation, Notes, Activity) |
| **Internal notes & evaluations** | Procurement-only notes, 1–5 evaluations with average rating |
| **Dashboard** | 11 KPIs, new-supplier trend, top categories, coverage by city |
| **Coverage intelligence** | Category coverage with green/yellow/red risk indicator |
| **Shortlists** | Project shortlists built from supplier profiles |
| **Activity log** | Immutable audit trail of every significant action |
| **Profile completeness score** | Weighted score with a missing-items checklist |
| **i18n** | Arabic RTL / English LTR toggle across the app |

**Deferred by design** (architecture is ready for them): RFQ, quotations & comparison,
purchase orders, ERP integration, supplier auctions, supplier network/passport, AI supplier
matching. See [`docs/ROADMAP.md`](docs/ROADMAP.md).

---

## Tech stack

- **Next.js 14** (App Router) + **TypeScript** — full-stack via Server Actions & Route Handlers
- **Tailwind CSS** with a small shadcn-style component library (`src/components/ui`)
- **PostgreSQL** + **Prisma** ORM (search via Prisma filters; ready to move to Elastic/OpenSearch)
- **NextAuth** (credentials) for auth & sessions
- **Anthropic Claude** for catalog extraction & classification (graceful heuristic fallback when no key)
- Local file storage driver (swap for S3/Supabase — see `src/lib/storage.ts`)

---

## Quick start

### Prerequisites
- Node.js ≥ 20
- PostgreSQL 14+ (a `docker-compose.yml` is provided)

### 1. Install
```bash
npm install
```

### 2. Database
```bash
# Option A — Docker
docker compose up -d

# Option B — your own Postgres; create a database named supplier_hub
```

### 3. Environment
```bash
cp .env.example .env
# Edit DATABASE_URL and NEXTAUTH_SECRET (openssl rand -base64 32).
# ANTHROPIC_API_KEY is optional — AI runs in heuristic mode without it.
```

### 4. Migrate & seed
```bash
npm run db:migrate      # apply the schema
npm run db:seed         # 50 suppliers, 10 categories, 100 products, 20 brands, demo users
```

### 5. Run
```bash
npm run dev             # http://localhost:3000
```

---

## Demo accounts

All demo users share the password from `SEED_DEMO_PASSWORD` (default **`Demo!Passw0rd`**).

| Role | Email | Can do |
|------|-------|--------|
| Super Admin | `superadmin@demo.sa` | Everything |
| Procurement Admin | `admin@demo.sa` | Review, approve/reject/suspend, request info, evaluate, notes, shortlists |
| Procurement User | `buyer@demo.sa` | Search, view, download, shortlists |
| Supplier | `supplier@demo.sa` | Edit own company, upload documents, manage products, run AI extraction, submit |

> ⚠️ Demo credentials are for **local development only**. Never seed these in production.

---

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start the dev server |
| `npm run build` | Production build (`prisma generate` + `next build`) |
| `npm run start` | Serve the production build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm run db:migrate` | Apply Prisma migrations (dev) |
| `npm run db:deploy` | Apply migrations (prod) |
| `npm run db:seed` | Seed realistic demo data |
| `npm run db:reset` | Drop, re-migrate, and re-seed |

---

## Project structure

```
prisma/
  schema.prisma          # Full data model (multi-tenant)
  migrations/            # SQL migrations
  seed.ts                # Reproducible demo data
src/
  app/
    (procurement)/       # Dashboard, search, suppliers, coverage, shortlists, activity
    portal/              # Supplier self-service portal
    supplier/register/   # Public registration
    api/                 # NextAuth + secure document download
  components/            # UI kit, app shell, status badges, supplier card
  lib/                   # Domain logic: rbac, completeness, duplicate, search,
                         # ai, rules, documents, storage, dashboard, i18n
  middleware.ts          # Route-level auth/role gating
docs/                    # Architecture, ERD, API, security, roadmap
```

## Documentation
- [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md) — system design & request flow
- [`docs/DATABASE.md`](docs/DATABASE.md) — ERD & schema notes
- [`docs/API.md`](docs/API.md) — server actions & route handlers
- [`docs/SECURITY.md`](docs/SECURITY.md) — RBAC, tenant isolation, upload safety
- [`docs/ROADMAP.md`](docs/ROADMAP.md) — phased plan (RFQ, performance, matching, network)
