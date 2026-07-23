# Architecture — MASAR 34

## Overview

MASAR 34 is a multi-tenant SaaS with a NestJS API, a PostgreSQL/Prisma data layer, a Redis-backed
rate limiter, a WebSocket gateway for realtime, and a Next.js RTL frontend.

```
┌────────────┐   HTTPS/WSS    ┌──────────────────────────────────────┐
│  Next.js   │ ─────────────► │  NestJS API (:4000, prefix /api)     │
│  (web)     │ ◄───────────── │  ├─ Auth (JWT + RBAC guards)         │
└────────────┘   socket.io    │  ├─ Tenancy helpers (org isolation)  │
                              │  ├─ Domain modules (venues…events)   │
                              │  ├─ Crowd / Queue analytics (pure fn) │
                              │  ├─ Alerts / Incidents / Tasks        │
                              │  ├─ Simulator (interval engine)       │
                              │  └─ Realtime gateway (org rooms)      │
                              └──────────┬───────────────┬────────────┘
                                         │               │
                                   ┌─────▼─────┐   ┌─────▼─────┐
                                   │ Postgres  │   │  Redis    │
                                   │ (Prisma)  │   │ (limits)  │
                                   └───────────┘   └───────────┘
```

## Key decisions

1. **NestJS over FastAPI.** Preferred in spec; guards/interceptors express RBAC + multi-tenancy
   declaratively, and `@nestjs/swagger` generates OpenAPI from decorators.
2. **Multi-tenancy by scoped queries, not schema-per-tenant.** Every tenant-owned row carries
   `organizationId`. `tenantWhere()` (`src/common/tenant.ts`) injects the org filter for every
   read; `resolveOrgId()` pins writes. Super admins bypass the filter deliberately.
3. **RBAC is code-defined, DB-seeded.** `src/common/rbac.ts` is the single source of truth for
   roles → permissions; the seed materializes it, and `PermissionsGuard` enforces it at runtime,
   so DB and guards never drift.
4. **Analytics as pure functions.** Crowd risk/density, occupancy forecast, and queueing metrics
   live in `src/common/analytics.ts` — side-effect-free and unit-tested; the simulator and the
   read APIs both consume them, so there is one implementation of the math.
5. **Simulator as a first-class subsystem.** It writes real `crowd_readings` / `queue_readings`,
   updates zone occupancy, and raises real alerts/incidents — the rest of the system cannot tell
   simulated data from sensor data, which is the point (sensor integrations plug in later).

## Module layout (`apps/api/src`)

`auth`, `common` (rbac, tenant, analytics, decorators, guards, filters), `prisma`, `realtime`,
`organizations`, `users`, `venues`, `zones`, `gates`, `events`, `crowd`, `queues`, `alerts`,
`incidents`, `tasks`, `dashboard`, `simulator`, `health`.

## Frontend (`apps/web/src`)

App Router with an authenticated `(app)` group (sidebar + header + auth guard). `lib/api.ts` is a
typed fetch client with a bearer-token store; `lib/lang-context.tsx` drives `<html dir/lang>` with
Arabic RTL as the default. Pages poll the API and (roadmap) subscribe to the WebSocket stream.

## Realtime

`EventsGateway` namespaces `/realtime`; clients `join` an `org:<id>` room, and the API emits
`alert:new`, `incident:new`, `task:updated`, `sim:tick`, etc. only to that room — realtime respects
tenant isolation.
