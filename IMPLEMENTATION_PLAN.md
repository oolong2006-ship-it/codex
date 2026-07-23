# MASAR 34 — Implementation Plan | خطة التنفيذ

> منصة ذكية لإدارة الحشود والطوابير والعمليات في الملاعب والفعاليات الكبرى
> Smart platform for crowd, queue and operations management in stadiums and large events.

This document is the source of truth for scope, sequencing, and honest status. It is
deliberately explicit about what is **MVP-complete**, what is **scaffolded**, and what is
**deferred**, because the master specification describes a multi-quarter enterprise product.

## 1. Final stack decision

| Layer | Choice | Why |
|-------|--------|-----|
| Backend | **NestJS + TypeScript** | Preferred option in the spec; modular architecture, DI, guards/interceptors map cleanly onto RBAC + multi-tenancy; first-class OpenAPI. |
| ORM / DB | **Prisma + PostgreSQL** | Type-safe schema, migrations, strong relational modelling for the ~40-table domain. |
| Cache / Queue | **Redis + BullMQ** | Real-time counters, rate limiting, background simulation ticks. |
| Realtime | **WebSocket (socket.io) + SSE fallback** | Live dashboards / control room. |
| Frontend | **Next.js (App Router) + TypeScript + Tailwind** | RTL-first, SSR, i18n; Arabic default. |
| Charts / Maps | **Recharts + Leaflet** | Open-source, no token required for MVP. |
| AI service | **Python FastAPI (scaffolded)** | Isolated prediction service; MVP uses rule-based/statistical forecasting inside the API, with the FastAPI service prepared for Prophet/XGBoost. |
| Infra | **Docker Compose + Nginx** | One-command local run. |

A single backend stack (NestJS) is used — the FastAPI AI service is an optional companion,
not a second source of truth.

## 2. Phased delivery

### Phase 1 — Foundation ✅ (this session)
- Monorepo (npm workspaces), Docker Compose, env, CI.
- Full Prisma schema (all spec tables) with tenant/FK/index/soft-delete conventions.
- Auth (JWT access+refresh, password hashing, RBAC + permission guards, audit trail hook).
- Multi-tenancy (tenant context, per-request isolation, guarded queries).
- Seed data (Saudi Events Operations org, Kingdom Arena venue, 8 gates, 12 zones, event, 7 demo users).
- Core domain modules: organizations, venues, zones, gates, events, users.

### Phase 2 — Operations core ✅ (this session)
- Crowd monitoring (readings, density levels, risk score, short-horizon forecast).
- Queue management (queueing-theory calc: arrival/service rate, wait time, recommendations).
- Alerts (typed, severity, lifecycle) + Incidents (lifecycle, updates, SLA fields).
- Dashboard aggregation endpoints.

### Phase 3 — Live + simulation ✅ (this session, MVP depth)
- Simulation engine with named scenarios (normal, high attendance, gate failure, crowd surge...).
- WebSocket gateway broadcasting live crowd/queue/alert updates.
- Frontend: RTL login, executive dashboard, crowd view wired to the API.

### Phase 4–6 — Deferred / scaffolded (documented in ROADMAP.md)
- Full Partner Portal, Fan PWA, Field Ops mobile flows, Reports PDF/Excel export,
  Digital-twin scenario simulator UI, Prophet/XGBoost models, WhatsApp/SMS senders.
- These have data models + API stubs where noted, but not full UI/business depth yet.

## 3. Honest status legend
- ✅ Implemented and wired end-to-end.
- 🟡 Backend/model present, UI or advanced logic partial.
- ⚪ Scaffolded / documented for a future iteration.

See `README.md` §Status matrix for the per-module breakdown.
