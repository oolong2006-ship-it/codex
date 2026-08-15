# Architecture

## Overview

Supplier Intelligence Hub is a **single Next.js 14 (App Router) full-stack application**
backed by PostgreSQL via Prisma. There is no separate API server — mutations run through
**Server Actions** and a handful of **Route Handlers** (auth, secure downloads). This keeps
the MVP simple while leaving clean seams to extract services later.

```
┌────────────────────────────────────────────────────────────┐
│                        Browser (RTL/LTR)                     │
│   Server Components (data)   +   Client Components (interact) │
└───────────────┬───────────────────────────┬────────────────┘
                │ Server Actions             │ Route Handlers
                ▼                            ▼
        ┌───────────────┐          ┌──────────────────────┐
        │  Domain logic  │          │  /api/auth/[...]     │
        │  (src/lib)     │          │  /api/documents/[id] │
        └───────┬────────┘          └──────────┬───────────┘
                │ Prisma Client               │
                ▼                            ▼
        ┌────────────────────────────────────────────────┐
        │                  PostgreSQL                      │
        └────────────────────────────────────────────────┘
                │
                ▼  (optional)
        ┌──────────────┐      ┌──────────────────┐
        │ Anthropic AI │      │ File storage     │
        │ (Claude)     │      │ (local → S3)     │
        └──────────────┘      └──────────────────┘
```

## Layers

### 1. Presentation (`src/app`, `src/components`)
- **Server Components** load data (tenant-scoped Prisma queries) and render read views.
- **Client Components** own interactivity (forms, tabs, dialogs, filters) and call Server Actions.
- The **App Shell** (`src/components/app-shell.tsx`) provides side navigation, language toggle,
  and sign-out. Two variants: `procurement` and `portal`.
- i18n is a client context (`src/lib/i18n`) with EN/AR dictionaries; the root layout sets
  `<html lang dir>` from a cookie so RTL/LTR is correct on first paint.

### 2. Application / domain (`src/lib`)
Framework-agnostic business logic, unit-testable in isolation:
- `rbac.ts` — permission catalogue & role→permission map
- `session.ts` — `requireUser` / `requirePermission` / `requireProcurement` guards
- `completeness.ts` — weighted profile score + missing items
- `duplicate.ts` — CR/VAT/IBAN/phone/domain + Levenshtein name similarity
- `rules.ts` — dynamic required documents by category
- `documents.ts` — expiry-driven document status
- `search.ts` — tenant-scoped supplier search + filters
- `dashboard.ts` — KPI aggregation
- `ai.ts` — Claude extraction/classification with deterministic fallback
- `text-extract.ts` — PDF/text extraction without native deps
- `storage.ts` — pluggable file storage driver
- `activity.ts` — audit log + notifications

### 3. Data (`prisma`)
Normalized, multi-tenant schema. Every tenant-owned table carries `organizationId`.
See [`DATABASE.md`](DATABASE.md).

## Request flow (example: approve a supplier)
1. Procurement Admin clicks **Approve** on a supplier profile (client component).
2. Client invokes the `changeStatusAction` **Server Action**.
3. The action calls `requirePermission(APPROVE_SUPPLIERS)` — authorization is **server-side**.
4. It updates the supplier, writes a `SupplierStatusHistory` row, appends an `ActivityLog`
   entry, and creates a `Notification` for the supplier — all in a transaction.
5. `revalidatePath` refreshes the affected views.

## Multi-tenancy
- A tenant is an `Organization`. Users, suppliers, categories, documents, etc. belong to one org.
- Every query filters by `organizationId` taken from the authenticated session — never from
  client input. Public supplier registration attaches to a default organization (configurable
  via `DEFAULT_ORG_SLUG`); per-organization registration links are a straightforward extension.

## Search evolution
The MVP uses Prisma relational filters + `contains` matching, which is correct and adequate at
seed scale. The `searchSuppliers` function is the single seam: swap its body for a PostgreSQL
full-text `tsvector`/`websearch_to_tsquery`, or an Elastic/OpenSearch query, without touching
callers.

## Extensibility seams
- **Storage**: implement the `StoredFile` interface in `storage.ts` for S3/Supabase.
- **AI**: `ai.ts` returns typed results; the fallback keeps the UX working offline.
- **Phase 2 (RFQ/PO)**: add new models referencing `Supplier`; no existing table changes required.
