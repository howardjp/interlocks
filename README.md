# Interlocks

Interlocks is a locally testable, multi-user institutional-conflicts MVP. It records facts with provenance, surfaces deterministic connections for review, keeps professional judgment explicit, turns mitigations into owned controls, and preserves an attributable history.

The supplied Interlocks heraldic icon is used unchanged. The supplied Muse Ant Design Dashboard informed the compact rail-and-card composition; the product and workflows were rebuilt around Interlocks.

## Run locally

Requirements: Node.js 22.13 or newer and npm.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. Development mode creates and seeds `.data/interlocks.db`; immutable document bytes use `.data/documents/`.

The local demo identity control can exercise SUPERADMIN, FIRMADMIN, REVIEWER, MEMBER, workspace switching, and portable-ledger behavior. It is unavailable when `INTERLOCKS_ENV=production`.

## What works

- Person, Account, AuthIdentity, Workspace, Membership, and roles have independent lifecycles.
- WorkOS AuthKit is the managed production authentication adapter; Interlocks remains the identity-of-record for domain authorization.
- MEMBER, REVIEWER, FIRMADMIN, and audited platform SUPERADMIN authority are centrally enforced.
- Disclosures, canonical entities, aliases, matters, parties, professional relationships, and portable ledger entries are persistent.
- Deterministic EXACT, STRONG, POSSIBLE, and RELATED matches include human-readable evidence. There is no numeric conflict score.
- GREEN, YELLOW, and RED mean required action; a separate human disposition records professional judgment.
- Assertions, point-in-time inferences, immutable documents, many-to-many evidence links, consent, screens, determinations, controls, and audit events are first-class.
- Associated-person questions are bounded by an explicit disclosure scope.
- CSV import is validated before an all-or-nothing commit. Personal, workspace, and check exports are purpose-specific.
- SQLite schema changes use ordered migrations. PostgreSQL-native schema migrations and an adapter boundary are included for hosted cutover.

## Verify

```bash
npm run test:all
```

This runs lint, domain and SQLite integration tests, the production build, a production HTTP workflow, and built-artifact validation.

The separate browser journey requires Playwright Chromium:

```bash
npx playwright install chromium
npm run test:browser
```

CI runs both gates. See [`docs/testing.md`](docs/testing.md) for the assurance matrix, coverage floors, and regression policy.

To bootstrap an existing account as the first platform administrator:

```bash
npm run admin -- promote-superadmin proprietor@example.com "Initial proprietor bootstrap"
```

The promotion is recorded as an immutable audit event.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — security and domain boundaries.
- [`docs/legal-ethics-audit.md`](docs/legal-ethics-audit.md) — ABA-model legal ethics audit and product consequences.
- [`docs/deployment.md`](docs/deployment.md) — production configuration and mechanical deployment checklist. No deployment has been performed.
- [`docs/testing.md`](docs/testing.md) — exhaustive test layers, commands, coverage floors, and CI policy.
