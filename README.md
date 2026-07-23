# MASAR 34 | مسار 34

> منصة سعودية ذكية لإدارة الحشود والطوابير والعمليات في الملاعب والفعاليات الكبرى
>
> A Saudi smart platform for crowd, queue and operational management in stadiums and large events.

MASAR 34 gives operators live crowd density per zone, queue/wait-time estimation, congestion
prediction, operational alerts, incident management, field-team dispatch, and a data
**simulation engine** so the whole system runs end-to-end with **no physical sensors**.

---

## 1. Product idea

Operators (stadiums, fan zones, airports, transport hubs, festivals, exhibitions, pilgrimage
sites) get a single control surface to:

- See real-time crowd density and risk per zone.
- Measure queue length and waiting time at gates and services.
- Predict congestion before it happens (rule-based / statistical baseline, ML-ready).
- Raise and triage operational alerts and incidents.
- Dispatch field teams and track tasks.
- Run scenario simulations (crowd surge, gate failure, evacuation, …).

Multi-tenant SaaS: each operating organization's data is fully isolated.

## 2. Architecture (chosen stack & why)

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| Backend | **NestJS + TypeScript** | The spec's preferred option. Modular DI architecture maps cleanly to RBAC guards, multi-tenancy, and OpenAPI generation. |
| Database | **PostgreSQL + Prisma** | Type-safe schema & migrations for the ~40-table relational domain. |
| Realtime | **socket.io WebSocket gateway** | Live dashboards / control room updates. |
| Frontend | **Next.js (App Router) + TypeScript + Tailwind** | RTL-first, Arabic default, i18n, SSR. Charts via Recharts. |
| Infra | **Docker Compose + Nginx-ready** | One-command local run; Redis wired for rate-limit/queues. |

We committed to a **single backend stack (NestJS)**. A Python FastAPI AI service is documented
as the next step for Prophet/XGBoost but the MVP forecasting runs inside the NestJS API as pure,
unit-tested functions (`apps/api/src/common/analytics.ts`).

See `ARCHITECTURE.md`, `DATABASE.md`, `API.md`, `SECURITY.md`, `SIMULATION.md`, `ROADMAP.md`.

```
codex/
├── apps/
│   ├── api/            NestJS backend (Prisma, auth, modules, simulator)
│   └── web/            Next.js frontend (RTL, i18n, dashboard)
├── docker-compose.yml
├── .env.example
└── docs (*.md)
```

## 3. Running the platform

### Option A — Docker Compose (recommended)

```bash
cp .env.example .env
docker compose up --build
```

This starts Postgres, Redis, the API (auto-runs `prisma migrate deploy` + seed), and the web app.

- Web: http://localhost:3000
- API + Swagger: http://localhost:4000/api/docs
- Health: http://localhost:4000/api/health

### Option B — Local dev

```bash
npm install                       # 4. install deps (root workspaces)
cp .env.example .env

# 5. database (point DATABASE_URL at your Postgres, then)
npm run db:generate
npm run db:migrate                # applies prisma/migrations
npm run db:seed                   # 6. seed demo data

npm run dev                       # runs API (:4000) and web (:3000)
```

## 7. Demo users

All demo users share one password (**development only**):

```
Password: Masar34!Demo
```

| Email | Role |
|-------|------|
| superadmin@masar34.sa | Super Admin |
| admin@masar34.sa | Organization Admin |
| operations@masar34.sa | Operations Manager |
| operator@masar34.sa | Control Room Operator |
| supervisor@masar34.sa | Field Supervisor |
| analyst@masar34.sa | Analyst |
| partner@masar34.sa | Partner User |

> ⚠️ **The seed password is for local development only.** Never deploy seeded credentials.
> It is read from `SEED_DEMO_PASSWORD` and must be changed/removed for any real environment.

Seed also creates: org **Saudi Events Operations**, venue **Kingdom Arena Demo Venue**
(8 gates, 13 zones incl. 4 parking / 3 food / medical / VIP / family / transport), and the
event **International Football Event 2034 Simulation** (65,000 expected attendance).

## 8. Running the simulation

From the UI: **Simulation Center** → pick a scenario → **Start**. Or via API:

```bash
# get a token
TOKEN=$(curl -s -X POST localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d '{"email":"operations@masar34.sa","password":"Masar34!Demo"}' | jq -r .accessToken)

curl -X POST localhost:4000/api/simulations/start -H "Authorization: Bearer $TOKEN" \
  -H 'Content-Type: application/json' -d '{"scenario":"CROWD_SURGE"}'
```

Scenarios: `NORMAL, HIGH_ATTENDANCE, GATE_FAILURE, CROWD_SURGE, TRANSPORT_DELAY,
EMERGENCY_EVACUATION, FOOD_ZONE_CONGESTION, MULTIPLE_INCIDENTS, CAMERA_OFFLINE, STAFF_SHORTAGE`.
The engine mutates zone occupancy/queues every 3s, computes density & risk, and raises alerts &
incidents, broadcasting over WebSocket. See `SIMULATION.md`.

## 9. Tests

```bash
npm run test            # backend unit tests (analytics + event lifecycle)
npm run typecheck       # API + web
npm run lint
```

Critical business logic (queue metrics, crowd risk/density, occupancy forecasting, event
lifecycle state machine) is unit-tested.

## 10. Production build

```bash
npm run build           # builds API (dist/) and web (.next standalone)
```

---

## Status matrix (honest)

✅ implemented & wired · 🟡 backend/model present, UI partial · ⚪ scaffolded/documented

| Area | Status |
|------|--------|
| Auth (JWT access+refresh, lockout, RBAC + permission guards, audit trail) | ✅ |
| Multi-tenant isolation (super-admin cross-tenant, org-scoped queries) | ✅ |
| Organizations / Users / Venues / Zones / Gates / Events CRUD | ✅ |
| Crowd monitoring (density, risk, 15/30/60-min forecast) | ✅ |
| Queue management (queueing metrics + recommendations) | ✅ |
| Alerts (typed, severity, lifecycle) + Incidents (lifecycle, updates, SLA) | ✅ |
| Field tasks (assignment + status flow) | ✅ |
| Simulation engine (10 scenarios) + WebSocket broadcast | ✅ |
| Executive dashboard, crowd, queues, alerts, simulation UI (RTL/i18n) | ✅ |
| Swagger/OpenAPI, health/liveness/readiness, Docker, CI | ✅ |
| Partner portal / Fan PWA / Field-ops mobile / Reports export / Digital-twin UI | 🟡→⚪ |
| Prophet/XGBoost AI service, SMS/WhatsApp senders, integration connectors | ⚪ |

The deferred items have data models and (where noted) API stubs. See `ROADMAP.md` for the plan
to complete them. This repository is a runnable, tested MVP foundation — not the full
multi-quarter product the master spec describes.
