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

The local demo identity control can exercise SUPERADMIN, FIRMADMIN, REVIEWER, MEMBER, workspace switching, portable-ledger behavior, a declared child with an outside role, and a consent-linked spouse account. It is unavailable when `INTERLOCKS_ENV=production`.

## What works

- Person, Account, AuthIdentity, Workspace, Membership, and roles have independent lifecycles.
- WorkOS AuthKit is the managed production authentication adapter; Interlocks remains the identity-of-record for domain authorization.
- MEMBER, REVIEWER, FIRMADMIN, and audited platform SUPERADMIN authority are centrally enforced.
- Disclosures, canonical entities, aliases, matters, parties, professional relationships, and portable ledger entries are persistent.
- Deterministic EXACT, STRONG, POSSIBLE, and RELATED matches include human-readable evidence. There is no numeric conflict score.
- A declarative Jurisdictional Policy Engine applies versioned ABA, Maryland, Virginia, D.C., Delaware, and Delaware Court of Chancery packs independently to each legal question. The five model/licensing packs each contain 45 conflict-clearance checks; the Chancery overlay adds three Rule 170 admission checks.
- The policy interface is generated from 106 typed conflict facts and exposes missing facts without inventing answers. It is explicitly scoped to conflict clearance—not complete professional responsibility—and every first-wave pack remains marked for lawyer validation.
- ABA is retained as provisional first-blush authority when governing law is unresolved and as a comparative baseline when controlling authority is selected; it is never represented as controlling law.
- GREEN, YELLOW, and RED mean required action; a separate human disposition records professional judgment.
- Assertions, point-in-time inferences, immutable documents, many-to-many evidence links, consent, screens, determinations, controls, and audit events are first-class.
- Family and associated-person clearing supports both required models: an owner-declared Person who needs no account, and a separately owned Interlocks account connected through reciprocal, revocable consent.
- Direct declarations can contribute authorized employment, ownership, fiduciary, and professional connections. Linked accounts contribute only one-hop entity matches from shareable portable entries; their ledgers, tenant records, and further family graph are never merged or exposed.
- Workspace-bound associated-person questions remain a separate, bounded disclosure workflow.
- CSV import is validated before an all-or-nothing commit. Personal, workspace, and check exports are purpose-specific.
- SQLite schema changes use ordered migrations. PostgreSQL-native schema migrations and an adapter boundary are included for hosted cutover.

## Verify

```bash
npm run test:all
```

This runs more than 14,000 named domain, privacy, consent, typed-fact, jurisdiction-difference, policy-conformance, and SQLite integration tests with enforced coverage, plus lint, the production build, a production HTTP workflow, and built-artifact validation.

The separate browser journey requires Playwright Chromium:

```bash
npx playwright install chromium
npm run test:browser
```

CI runs both gates. See [`docs/testing.md`](docs/testing.md) for the assurance matrix, coverage floors, and regression policy.

## Adversarial pre-alpha

Interlocks includes a black-box synthetic-user campaign for browser-driving agents. The catalog currently covers partners, conflicts analysts, ethics counsel, Delaware litigators, family and lateral disclosures, reviewers, administrators, hostile members, accessibility, mobile use, imports, state abuse, audit reconstruction, and ambiguous entity matching.

```bash
npm run prealpha:list
npm run --silent prealpha:prompt -- hostile-member-tenant-boundary --run-id tenant-001
```

The generated prompt gives an agent a persona, objectives, adversarial provocations, strict fictional-data and source-isolation rules, and a common evidence-report contract. See [`docs/pre-alpha.md`](docs/pre-alpha.md) for the Claude in Chrome workflow, campaign waves, and defect-triage protocol.

To bootstrap an existing account as the first platform administrator:

```bash
npm run admin -- promote-superadmin proprietor@example.com "Initial proprietor bootstrap"
```

The promotion is recorded as an immutable audit event.

## Documentation

- [`docs/architecture.md`](docs/architecture.md) — security and domain boundaries.
- [`docs/policy-engine.md`](docs/policy-engine.md) — policy DSL, jurisdiction composition, immutable evaluation records, and pack-authoring rules.
- [`docs/legal-ethics-audit.md`](docs/legal-ethics-audit.md) — ABA-model legal ethics audit and product consequences.
- [`docs/deployment.md`](docs/deployment.md) — production configuration and mechanical deployment checklist. No deployment has been performed.
- [`docs/testing.md`](docs/testing.md) — exhaustive test layers, commands, coverage floors, and CI policy.
- [`docs/pre-alpha.md`](docs/pre-alpha.md) — synthetic-user browser campaign and triage protocol.
