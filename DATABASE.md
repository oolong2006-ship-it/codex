# Database — MASAR 34

PostgreSQL, modelled with Prisma (`apps/api/prisma/schema.prisma`). The initial migration is
`prisma/migrations/0001_init/migration.sql`.

## Conventions

- **Tenant column:** every tenant-owned table has `organizationId` (indexed) for isolation.
- **Timestamps:** `createdAt` / `updatedAt` on mutable entities.
- **Soft delete:** `deletedAt` on entities that must be retained (users, venues, zones, gates,
  events, organizations). Reads filter `deletedAt: null`.
- **Enums:** domain vocabularies (status, type, severity, density, risk) are Postgres enums.
- **Indexes:** foreign keys, tenant + status composites, and time-series `(zoneId, recordedAt)` /
  `(gateId, recordedAt)` for telemetry queries.
- **Unique constraints:** `users.email`, `gates (venueId, code)`, `incidents.number`, role/permission keys.

## Tables (grouped)

- **Identity/RBAC:** `organizations`, `users`, `roles`, `permissions`, `role_permissions`,
  `user_roles`, `sessions`.
- **Places:** `venues`, `zones` (self-referencing hierarchy), `gates`, `devices` (cameras/sensors).
- **Events:** `events`.
- **Telemetry:** `crowd_readings`, `queue_readings`.
- **Operations:** `alerts`, `incidents`, `incident_updates`, `incident_attachments`, `tasks`,
  `field_teams`, `staff_members`.
- **Partners:** `partners`, `partner_locations`, `transactions`.
- **AI:** `demand_forecasts`, `congestion_predictions`.
- **Simulation:** `simulations`, `simulation_events`.
- **Integrations:** `integration_connections`, `webhook_events`.
- **Platform:** `notifications`, `reports`, `audit_logs`, `system_settings`.

## Migrations

```bash
npm run db:migrate         # prisma migrate deploy (prod/CI)
npm run db:migrate:dev     # prisma migrate dev (local, creates new migrations)
npm run db:seed            # idempotent seed
```

The seed (`prisma/seed.ts`) is idempotent (upserts), so it is safe to re-run.
