# Deployment preparation

Interlocks has not been publicly deployed. This checklist prepares a closed, invitation-only pilot.

## Required production configuration

Start from `.env.example` and provide secrets through the host's secret manager:

```text
INTERLOCKS_ENV=production
INTERLOCKS_BASE_URL=https://your-hostname.example
INTERLOCKS_REGISTRATION_MODE=INVITE_ONLY
INTERLOCKS_DEMO_MODE=false
WORKOS_CLIENT_ID=...
WORKOS_API_KEY=...
WORKOS_COOKIE_PASSWORD=at-least-32-random-characters
NEXT_PUBLIC_WORKOS_REDIRECT_URI=https://your-hostname.example/auth/callback
```

Production startup validation rejects HTTP, missing WorkOS values, short session material, development registration, and demo mode. WorkOS must be configured with the callback URI and the application's sign-in/sign-out URLs. Authentication proves an external identity; invitation policy and workspace authorization remain in Interlocks.

## Persistence cutover

Local SQLite is fully supported. The hosted target is PostgreSQL:

1. Provision an encrypted PostgreSQL database and obtain a TLS `DATABASE_URL`.
2. Run `PostgresInterlocksRepository.migrate()` once from the release job.
3. Complete and run aggregate-operation compatibility tests against PostgreSQL before enabling `DATABASE_URL` in the application runtime. The PostgreSQL adapter is intentionally marked `migration-ready`, not silently substituted for SQLite.
4. Back up and restore-test the database before pilot data enters the system.

Document bytes use the `ObjectStore` boundary. Replace `LocalFilesystemObjectStore` with the chosen encrypted hosted provider adapter, retain immutable-write behavior, verify hashes after reads, and apply tenant-scoped authorization before object retrieval.

## Release gate

```bash
npm ci
npm run test:all
```

Then verify:

- `/api/health` reports the expected schema and corpus revision;
- security headers are present;
- sign-in, callback, sign-out, invitation acceptance, and recovery work through WorkOS;
- DEVELOPMENT identity headers and demo reset are rejected;
- Firm A cannot read/search/administer Firm B;
- SUPERADMIN view-as is read-only, reasoned, and visible in audit;
- personal, workspace, and conflict-check exports contain only their intended scope;
- logs contain request outcomes but no secrets, cookies, document bytes, or confidential payloads;
- database and object-store backup/restore procedures are exercised.

CI runs lint, all tests, the production build, and artifact validation on pushes and pull requests. A deployment workflow is deliberately absent until local abuse testing is complete.

