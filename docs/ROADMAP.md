# Roadmap

The MVP is built so later phases add **new** models/routes referencing `Supplier` without
reworking existing tables.

## Phase 1 — MVP ✅ (this release)
Authentication · RBAC · supplier registration · supplier portal · categories/products/services/
brands · document management · required-document rules · duplicate detection · profile
completeness · approval workflow · search + filters · dashboard · coverage intelligence ·
shortlists · internal notes & evaluations · activity log · AI catalog extraction (basic) ·
AI classification · document expiry tracking · Arabic/English.

## Phase 2 — Sourcing
- **RFQ management** — create RFQs from a category/shortlist; invite suppliers.
- **Supplier invitations & quotations** — suppliers submit line-item quotes.
- **Quotation comparison** — side-by-side price/terms comparison matrix.
- **Supplier evaluation & performance** — scorecards over time; delivery/quality KPIs.
- **Price history** — track quoted/awarded prices per product.

_Data model additions:_ `rfqs`, `rfq_items`, `rfq_invitations`, `quotations`,
`quotation_items`, `performance_records`, `price_history` — all keyed to `Supplier`.

## Phase 3 — Intelligence
- **AI supplier matching** — natural-language procurement queries
  ("مورد أكياس بلاستيك غذائية بالرياض، توصيل لفروع متعددة، ائتمان 60 يوم") → top-N suppliers
  with concise reasoning, over the structured supplier DB.
- Upgrade search to PostgreSQL full-text or Elastic/OpenSearch (single seam in `src/lib/search.ts`).

## Phase 4 — Network
- **Supplier passport** — a supplier registers once and is verified.
- **Shared supplier network** — multiple organizations discover verified suppliers.
- The multi-tenant schema already isolates organizations; a network layer adds cross-tenant,
  consent-based discovery on top.

## Cross-cutting hardening (ongoing)
- OTP/email verification on registration
- S3/Supabase storage with signed URLs
- Background jobs for expiry notifications (email) and AI processing queues
- Rate limiting, Postgres RLS, observability
