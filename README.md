# Interlocks

Interlocks is a working local prototype for organizational conflict management.
It connects disclosures to real matters, gives reviewers an explainable triage
queue, records human decisions, turns management plans into owned controls, and
preserves the activity history needed to show what happened.

The supplied Interlocks heraldic icon is used unchanged. The supplied Muse Ant
Design Dashboard informed the compact rail-and-card composition; Interlocks’
screens and workflows were rebuilt around the product rather than the template.

## Run it

Requirements: Node.js 22.13 or newer and npm.

```bash
npm ci
npm run dev
```

Open `http://localhost:3000`. The local SQLite database is created and seeded
on first use at `.data/interlocks.db`.

To use another database file:

```bash
INTERLOCKS_DB_PATH=/absolute/path/to/interlocks.db npm run dev
```

## Prototype workflows

- review prioritized conflict cases and their scoring factors;
- submit a new disclosure tied to a person, organization, and active matter;
- search and filter the review queue;
- inspect the disclosure register and matter portfolio;
- add evidence and review notes;
- change case status;
- record a reasoned decision and optional management control;
- complete assigned controls;
- export cases as CSV or the complete workspace as JSON;
- restore the canonical demonstration workspace.

## Verify it

```bash
npm run test:all
```

This runs linting, domain and SQLite integration tests, the production build,
and a built-artifact check.

## Structure

- `app/components/interlocks-app.tsx` — complete interactive product surface
- `app/api/` — transport routes for snapshot, disclosure, review, controls,
  export, and reset workflows
- `lib/domain/` — pure, explainable triage model
- `lib/persistence/` — replaceable repository contract and SQLite adapter
- `tests/` — scoring, transactional persistence, audit, reset, and product
  contract coverage
- `docs/architecture.md` — product boundaries, data model, and production path

The persistence design and product flow are described in
[`docs/architecture.md`](docs/architecture.md).
