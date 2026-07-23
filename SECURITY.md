# Security & Privacy — MASAR 34

Built to *Security by Design* and *Privacy by Design*, targeting alignment with the Saudi PDPL,
NCA guidance, ISO 27001 readiness, and OWASP Top 10.

## Implemented in this MVP
- **Authentication:** JWT access + refresh tokens; refresh tokens hashed (bcrypt) and stored as
  revocable sessions; rotation on refresh.
- **Password security:** bcrypt hashing (configurable rounds); failed-login lockout (5 attempts →
  15-min lock); minimum length validation.
- **Authorization:** role-based + permission-based guards (`JwtAuthGuard`, `PermissionsGuard`);
  code-defined RBAC seeded to DB; `SUPER_ADMIN` role cannot be self-assigned by non-super-admins.
- **Multi-tenant isolation:** every query is org-scoped via `tenantWhere()`; writes pinned via
  `resolveOrgId()`; realtime events are emitted only to the tenant's socket room.
- **Transport/headers:** `helmet` secure headers; CORS; global DTO validation
  (`whitelist + forbidNonWhitelisted`) to blunt mass-assignment and injection.
- **Rate limiting:** `@nestjs/throttler` (Redis-ready) global guard.
- **Audit trail:** `audit_logs` table; login events recorded with IP/user-agent.
- **Centralized error handling:** no stack traces leaked to clients; 5xx logged server-side.
- **Secrets:** read from environment only; `.env` git-ignored; `.env.example` documents keys.

## Privacy stance
No facial recognition. The design uses anonymous, zone-level aggregate counting only — the schema
stores occupancy/flow numbers, never identifiable biometric data.

## Hardening checklist before production (see ROADMAP)
- Rotate/replace all seed secrets; remove demo users and `SEED_DEMO_PASSWORD`.
- Enforce TLS termination (Nginx) and HSTS.
- Enable MFA flows (schema fields present: `mfaEnabled`, `mfaSecret`).
- Encryption at rest (managed Postgres / disk) and key management.
- API key rotation for integration connections (`apiKeyHash` field present).
- Backup & disaster-recovery runbooks; data retention & deletion policies.
