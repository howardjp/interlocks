# Testing and assurance

Interlocks treats tests as executable product policy. The suite checks not only successful workflows, but also authority boundaries, tenant isolation, immutability, invalid state transitions, transactional rollback, accessibility contracts, and the absence of machine-made ethical conclusions.

## Quality gates

| Gate | Command | What it proves |
| --- | --- | --- |
| Dependency audit | `npm run audit` | The locked dependency graph contains no known high- or critical-severity advisories |
| Core suite and coverage | `npm run test:coverage` | Domain logic, more than 12,000 policy metamorphic vectors, family consent/date/privacy matrices, typed fact validation, jurisdiction differences, authorization, identity, configuration, SQLite, PostgreSQL adapter behavior, migrations, object storage, source-level UI and API contracts |
| Production HTTP | `npm run test:http` | A built server, security headers, identity failures, tenant isolation, both family models, consent acceptance/revocation, versioned policy evaluation, commands, persistence, redacted exports, audit, and reset through real HTTP routes |
| Browser E2E | `npm run test:browser` | Rendered React behavior, keyboard dialogs, dark-mode persistence, multi-question authority selection, Chancery facts, direct and linked family personas, privacy-safe matching, disclosure, review, upload, import, navigation, mobile behavior, and runtime errors |
| Artifact validation | `npm run validate:artifact` | Required production routes and assets exist in the built output |
| Complete non-browser gate | `npm run test:all` | Dependency audit, lint, enforced coverage, production build, HTTP suite, and artifact validation |

CI runs `npm run test:all`, installs the pinned Playwright Chromium build, and then runs `npm run test:browser`.

## Current assurance inventory

The Node test runner executes 14,155 named tests. More than 12,000 are generated metamorphic policy-conformance cases spanning every first-wave model/licensing pack and rule, every authority posture, missing required facts, key reordering, and bounded irrelevant facts. Family coverage adds relationship-reciprocity, consent-state, sharing-class, effective-date, one-hop, multi-provenance, export-redaction, and owner-authorization matrices plus transactional SQLite journeys. Per-rule declared-fact tests, per-fact type acceptance/rejection tests, and targeted local-rule-difference tests make the large count auditable instead of decorative. The remaining tests cover logic, persistence, UI/API contracts, transactions, identity, authorization, and infrastructure. The production HTTP suite and browser suite add real-server and rendered-interaction evidence rather than inflating the named core count.

The enforced core-library coverage floors are:

- Lines: 99%
- Branches: 88%
- Functions: 98%

The coverage result is recorded during the release gate rather than treated as a vanity snapshot. Floors are deliberately committed in `package.json`; a regression fails locally and in CI.

## Assurance matrix

| Product boundary | Representative guarantees |
| --- | --- |
| Workflow logic | Every valid and invalid state/disposition; precedence among holds, mandatory requirements, findings, consent, screens, and human judgment |
| Policy DSL | Schema rejection, every operator, three-valued truth tables, nesting limits, traces, missing facts, unknown questions, stable serialization, and exact hashes |
| Policy packs | Conflict-clearance-only scope; unique versions and hashes; permanent ABA fallback; question-level authority posture; typed facts; jurisdiction-specific consent/screening behavior; Delaware/Chancery composition; source and citation retention |
| Policy conformance | More than 12,000 named metamorphic vectors proving every rule’s match, nonmatch, and missing-fact behavior survives irrelevant facts, key order, and authority-status changes |
| Entity matching | Canonical names, aliases, diacritics, corporate suffixes, human names, identifiers, addresses, related entities, nonmatches, and explainable reasons |
| Family graph | Every relationship and reciprocal direction; direct non-account Persons; explicit interests and scopes; pending/active/declined/revoked/expired consent; time windows; portable-only sharing; one-hop traversal; owner-only mutation; private fingerprints; personal/workspace export redaction |
| Authorization | Every role/action pair; inactive accounts and memberships; workspace boundaries; personal-ledger ownership; explicit SUPERADMIN authority |
| Identity and configuration | Header/cookie development identity, WorkOS mapping, request resolution, production fail-closed invariants, secure environment requirements |
| SQLite | All aggregates, lifecycle transitions, immutable facts and policy history, supersession, evidence attachments, case actions, consents, screens, controls, associated people, exports, audit, reset |
| Transactions | Invalid membership changes, duplicates, malformed imports, failed migrations, and cross-boundary writes roll back without partial state |
| Object storage | Immutable hashes, defensive copies, filesystem modes, traversal resistance, and metadata/blob consistency |
| PostgreSQL boundary | Migration order, idempotence, transaction commit/rollback, health, and adapter lifecycle without requiring a live service in the local suite |
| API | Route dispatch, dynamic/no-store behavior, error status mapping, CSV quoting, security headers, and authenticated actor resolution |
| UI | Navigation and page contracts, form field requirements, accessibility labels and live regions, focus containment/restoration, responsive breakpoints, theme persistence, and payload shape |
| Full workflow | Question → authority selection → frozen facts → policy results → review; declared relative → interest → match → revoke; account link → accept → private match → revoke; disclosure → case → note → determination → control → completion; consent; screen; bounded associated-person response; upload; import; exports; reset |

## Regression policy

Every bug found during development receives a test at the lowest useful layer and, when it crosses boundaries, an integration assertion as well. Changes to ethical workflow semantics, authorization, tenancy, portability, evidence, or migrations require both a success test and at least one failure-path test.

Tests do not claim that Interlocks makes an ethical or legal determination. They verify that facts and provenance are recorded, candidate connections are explained, required actions are derived consistently, human judgment remains explicit, and institutional boundaries are enforced.
