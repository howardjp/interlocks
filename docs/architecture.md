# Interlocks architecture

## Governing rule

If the system knows a fact, it records the fact and its provenance. If it derives an inference, it records the inference, evidence, corpus revision, and time. Changed evidence creates a new inference; it never rewrites the old one. If judgment is required, Interlocks asks a human. Uncertainty is never converted into arithmetic.

## Identity and tenant boundary

- **Person** is the durable human domain identity.
- **Account** is a login-capable record linked to a Person.
- **AuthIdentity** links an external provider subject to an Account; WorkOS can be replaced without changing the domain identity.
- **Workspace** is the tenant/security boundary.
- **Membership** connects a Person and optional Account to one Workspace.
- **WorkspaceRole** grants MEMBER, REVIEWER, or FIRMADMIN authority only inside that membership.
- **SUPERADMIN** is an explicit platform role. Cross-workspace views are reasoned, read-only view-as sessions and every use is audited.

Authorization is centralized in `lib/auth/authorization.mjs`; routes provide the actor, action, resource, and workspace rather than replicating role logic in the interface.

## Knowledge and judgment

| Record | Meaning | Mutability |
|---|---|---|
| Document | Immutable source bytes and metadata | Superseded, never overwritten |
| Assertion | Attributable recorded fact or claim | Superseded, never rewritten |
| Inference | Point-in-time system conclusion from evidence | Immutable |
| Conflict hit | Explainable deterministic match | Snapshot at a corpus revision |
| Workflow state | Required action: GREEN, YELLOW, RED | Derived from current operational facts |
| Human determination | Professional disposition and rationale | New records supersede old records |
| Consent / screen | Evidence-bearing legal workflow objects | Status history retained |
| Audit event | Actor, authority, scope, action, before/after | Append-only |

Consent never clears a conflict automatically. A screen never becomes a machine cure. Their sufficiency remains a human determination.

## Runtime boundaries

```mermaid
flowchart TD
  UI[Next.js workspace] --> API[Authenticated route handlers]
  API --> Auth[Central authorization]
  API --> Repo[Repository contract]
  Repo --> SQLite[(SQLite + migrations)]
  Repo -. hosted cutover .-> Postgres[(PostgreSQL migrations)]
  Repo --> Objects[ObjectStore]
  Objects --> Local[Local immutable files]
  Objects -. hosted adapter .-> Hosted[Provider object storage]
```

SQLite is the complete local adapter. PostgreSQL-native ordered migrations and connection/migration code are present; aggregate operations remain isolated behind the repository contract for a hosted adapter cutover. Object bytes are addressed through `ObjectStore`, never through UI or route-specific filesystem calls.

## Portability

The portable object is the Person-owned professional ledger, subject to its disclosure class and sharing authorization. Workspace matters, client data, documents, notes, determinations, and private relationships remain with the originating tenant. Departure ends membership access and reduces the active seat count without deleting either side's permitted records.

## Legal configuration

The legal model intentionally does not encode ABA rules as universal automated outcomes. Jurisdiction, effective date, rule/policy basis, evidence requirement, and reviewer rationale are explicit data. See `legal-ethics-audit.md` for the rule-by-rule audit and product consequences.

