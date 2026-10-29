# API — MASAR 34

Base URL: `http://localhost:4000/api` · Interactive docs: `/api/docs` (Swagger).
All non-public endpoints require `Authorization: Bearer <accessToken>`.

## Auth
| Method | Path | Notes |
|--------|------|-------|
| POST | `/auth/login` | `{ email, password }` → `{ accessToken, refreshToken, user }` |
| POST | `/auth/refresh` | `{ refreshToken }` → rotated token pair |
| POST | `/auth/logout` | revokes sessions |
| GET | `/auth/me` | current authenticated user |

## Core resources (RBAC-guarded)
| Method | Path | Permission |
|--------|------|-----------|
| GET/POST | `/organizations` · `/organizations/:id` (PATCH) | organizations:* |
| GET/POST/PATCH | `/users` | users:* |
| GET/POST/PATCH/DELETE | `/venues` | venues:* |
| GET/POST/PATCH/DELETE | `/zones?venueId=` | zones:* |
| GET/POST/PATCH/DELETE | `/gates?venueId=` · `/gates/:id/status` | gates:* |
| GET/POST/PATCH | `/events?status=` · `/events/:id/status` | events:* |

## Operations
| Method | Path | Description |
|--------|------|-------------|
| GET | `/dashboard/overview` | executive KPIs |
| GET | `/dashboard/realtime` | live snapshot (crowd, queues, alerts, incidents) |
| GET | `/crowd/current?venueId=` | per-zone occupancy, density, risk, 15/30/60-min forecast |
| GET | `/crowd/history/:zoneId?limit=` | time-series |
| GET | `/queues/current?venueId=` | per-gate queue metrics + recommendations |
| GET | `/queues/forecast/:gateId` | moving-average forecast |
| GET/POST | `/alerts?status=&severity=` | list / create |
| POST | `/alerts/:id/acknowledge` · `/alerts/:id/resolve` | lifecycle |
| GET/POST | `/incidents?eventId=` · GET `/incidents/:id` | list / create / detail |
| PATCH | `/incidents/:id` · POST `/incidents/:id/updates` | update / timeline |
| GET/POST | `/tasks?status=` · PATCH `/tasks/:id/status` | field tasks |

## Simulation
| Method | Path | Description |
|--------|------|-------------|
| GET | `/simulations/scenarios` | available scenarios |
| GET | `/simulations/status` | active + recent runs |
| POST | `/simulations/start` | `{ scenario, eventId? }` |
| POST | `/simulations/stop` | stop active run |

## Health
`/health`, `/health/live`, `/health/ready` (public).

## Realtime (socket.io, namespace `/realtime`)
Connect with the access token: `io(url + '/realtime', { auth: { token } })` (or an
`Authorization: Bearer <token>` handshake header). Sockets without a valid access token receive
`auth:error` and are disconnected. A socket is also disconnected when its token expires, so
reconnect with a fresh one.
On connect the socket is placed in its own organization's room automatically. `join` with
`{ organizationId }` is only needed by super admins to watch another organization; for anyone else
a different `organizationId` returns `{ joined: null, error: 'forbidden' }`.

Events: `alert:new`, `alert:updated`, `incident:new`, `incident:updated`, `task:new`,
`task:updated`, `sim:tick`.

## Errors
Centralized filter returns `{ statusCode, path, timestamp, message }`. Rate limiting via
`@nestjs/throttler` (defaults: 120 req / 60s).
