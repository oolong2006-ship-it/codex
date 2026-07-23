# Deployment — MASAR 34

## Local / demo (Docker Compose)
```bash
cp .env.example .env
docker compose up --build
```
Services: `postgres`, `redis`, `api` (runs `prisma migrate deploy` + seed on boot), `web`.
Health checks gate `api` on Postgres/Redis readiness.

## Environment variables
See `.env.example`. Critical ones:
- `DATABASE_URL`, `REDIS_URL`
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` (replace in every non-dev environment)
- `JWT_ACCESS_TTL`, `JWT_REFRESH_TTL`, `BCRYPT_ROUNDS`
- `SEED_DEMO_PASSWORD` (remove for production; do not seed demo users)
- `NEXT_PUBLIC_API_URL`, `NEXT_PUBLIC_WS_URL`

## Health endpoints
- Liveness: `GET /api/health/live`
- Readiness: `GET /api/health/ready` (checks DB connectivity)

## Build for production
```bash
npm run build                     # api dist/ + web .next standalone
```
The API image (`apps/api/Dockerfile`) is multi-stage; the web image
(`apps/web/Dockerfile`) uses Next.js standalone output.

## CI
`.github/workflows/ci.yml` runs install → prisma generate → lint → typecheck → test → build,
with a Postgres service for the API job.

## Production hardening (before go-live)
Terminate TLS at Nginx/ingress; set strong JWT secrets & rotate; use managed Postgres with
encryption at rest and automated backups; run migrations via `prisma migrate deploy` in a release
step; disable seeding; configure log shipping and monitoring (structured logs already emitted).
