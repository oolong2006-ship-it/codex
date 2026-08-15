# Deployment

## Local development
See the [README](../README.md) quick start. In short:
```bash
npm install
docker compose up -d            # PostgreSQL
cp .env.example .env            # set DATABASE_URL + NEXTAUTH_SECRET
npm run db:migrate && npm run db:seed
npm run dev
```

## Production

### Environment variables
| Var | Required | Notes |
|-----|----------|-------|
| `DATABASE_URL` | ✅ | PostgreSQL connection string |
| `NEXTAUTH_SECRET` | ✅ | `openssl rand -base64 32` |
| `NEXTAUTH_URL` | ✅ | Public app URL |
| `STORAGE_DRIVER` | | `local` (default) — swap for S3/Supabase |
| `STORAGE_LOCAL_DIR` | | Local upload dir when driver is `local` |
| `MAX_UPLOAD_MB` | | Upload size cap (default 15) |
| `ANTHROPIC_API_KEY` | | Enables Claude AI; omit for heuristic mode |
| `ANTHROPIC_MODEL` | | Defaults to `claude-sonnet-5` |
| `DEFAULT_ORG_SLUG` | | Tenant that public registrations attach to (default `demo`) |

### Build & release
```bash
npm ci
npx prisma migrate deploy      # apply migrations (no dev prompts)
npm run build                  # prisma generate + next build
npm run start                  # or a process manager / container
```

### Platform notes
- **Vercel / Node host**: standard Next.js deploy. Provision a managed Postgres (Neon, RDS,
  Supabase). Run `prisma migrate deploy` as a release step.
- **Docker**: multi-stage build on `node:20-alpine`; run `migrate deploy` on container start.
- **File storage**: the local driver writes to disk and is **not** suitable for serverless or
  multi-instance deployments — implement the S3/Supabase driver in `src/lib/storage.ts` first.

### Post-deploy checklist
- [ ] Migrations applied (`prisma migrate deploy`)
- [ ] Do **not** run `db:seed` in production (demo users)
- [ ] Create the first Super Admin + Organization (script or admin bootstrap)
- [ ] HTTPS, secure cookies, strong secrets
- [ ] Storage driver points at durable object storage
