# Jurisdictional Policy Engine

The Jurisdictional Policy Engine is a declarative, versioned screening system for legal conflict-clearance questions. It helps a reviewer identify possibly relevant conflict rules, compare jurisdictions, expose missing facts, and preserve the exact basis of an analysis. It is intentionally not a complete professional-responsibility system, does not decide whether a conflict exists, and is not a substitute for professional legal judgment.

All first-wave packs are marked `PROTOTYPE_REVIEW_REQUIRED`. Their structured summaries and citations require lawyer/editorial validation before production reliance. Interlocks stores concise original summaries, identifiers, citations, and links; it does not reproduce the full text of third-party rules.

## First-wave authorities

| Pack | Role | Official source |
| --- | --- | --- |
| ABA Model Rules | Permanent provisional screen and comparative baseline; never controlling | [American Bar Association](https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/model_rules_of_professional_conduct_table_of_contents/) |
| Maryland | Licensing-jurisdiction pack | [Supreme Court of Maryland / Attorney Grievance Commission](https://www.courts.state.md.us/attygrievance/rules) |
| Virginia | Licensing-jurisdiction pack | [Virginia State Bar](https://vsb.org/Site/Site/about/rules-regulations/rpc-part6-sec2.aspx) |
| District of Columbia | Licensing-jurisdiction pack with its independently maintained Rule 1.7 structure | [District of Columbia Bar](https://www.dcbar.org/for-lawyers/legal-ethics/rules-of-professional-conduct) |
| Delaware | Licensing-jurisdiction pack | [Delaware Office of Disciplinary Counsel](https://courts.delaware.gov/odc/rules.aspx) |
| Delaware Court of Chancery | Tribunal overlay for Rule 170 appearance responsibilities | [Delaware Court of Chancery Rule 170](https://courts.delaware.gov/forms/download.aspx?id=160908) |

Each model/licensing pack contains 45 conflict-clearance checks backed by a shared typed fact vocabulary. The checks cover current-client adversity and consentability; client-specific transactions and interests; former clients, imputation, and lawyer mobility; government service and former neutrals; organization/constituent and prospective-client conflicts; lawyer-witness and limited-service conflict exceptions; confidentiality during conflict checks; withdrawal when a conflict remains unresolved; and choice of law. The three-check Chancery overlay covers Delaware counsel, pro hac vice status, and the outside-lawyer undertaking.

“Complete” here means complete for the first-wave product scope, not complete professional responsibility and not substantively validated law. All packs carry `coverageScope: CONFLICT_CLEARANCE_ONLY` and `validationStatus: NOT_SUBSTANTIVELY_VALIDATED` until lawyer/editorial review changes those exact versioned artifacts.

## First-wave conflict coverage

| Conflict-clearance area | ABA | Maryland | Virginia | D.C. | Delaware | Chancery |
| --- | --- | --- | --- | --- | --- | --- |
| Current clients, consentability, nonconsentable adversity | Yes | Yes | Yes | Yes, D.C. structure | Yes | — |
| Specific client transactions and personal interests | Yes | Yes | Yes, local numbering | Yes, D.C. structure | Yes | — |
| Former clients, imputation, lateral mobility | Yes | Yes | Yes, no standalone private lateral screen | Yes, D.C. notice routes | Yes | — |
| Former/current government and former neutrals | Yes | Yes | Yes | Yes | Yes | — |
| Organization/constituent and prospective-client conflicts | Yes | Yes | Yes | Yes, D.C. screening route | Yes | — |
| Lawyer as witness and limited-service conflict exceptions | Yes | Yes | Yes | Yes | Yes | — |
| Conflict-check disclosure and choice of law | Yes | Yes | Yes | Yes | Yes | — |
| Delaware counsel and outside-lawyer admission | — | — | — | — | Base pack | Rule 170 overlay |

## Authority posture

Every policy question has its own authority selections:

- `CONTROLLING` — the reviewer has identified the pack as controlling for this question.
- `POTENTIALLY_APPLICABLE` — the pack may govern or is being used for provisional screening.
- `COMPARATIVE_ONLY` — results are retained for comparison but cannot create an actionable workflow by themselves.

When no controlling authority is known, the engine adds ABA as `POTENTIALLY_APPLICABLE`. When a controlling jurisdiction is selected without ABA, it adds ABA as `COMPARATIVE_ONLY`. The ABA pack is rejected if submitted as controlling. Selecting the Chancery overlay automatically adds Delaware as potentially applicable because tribunal procedure and professional-conduct duties coexist.

## DSL

Policy packs use `interlocks-policy.v1`, a JSON-compatible abstract syntax tree. It is typed, side-effect-free, non-Turing-complete, and limited to 24 levels of nesting. A condition contains exactly one of:

- `all` — three-valued conjunction;
- `any` — three-valued disjunction;
- `not` — three-valued negation;
- `exists` — bounded evaluation over a named fact collection;
- `predicate` — a comparison at a named path.

Supported predicate operators are `equals`, `not_equals`, `in`, `not_in`, `includes`, `intersects`, `greater_than`, `at_least`, and `exists`.

Example:

```js
{
  all: [
    {
      predicate: {
        path: "currentClientAdversity",
        operator: "equals",
        value: true,
        root: true,
        onMissing: "NOT_MATCHED"
      }
    },
    {
      not: {
        predicate: {
          path: "consentConfirmedInWriting",
          operator: "equals",
          value: true,
          root: true
        }
      }
    }
  ]
}
```

The DSL cannot execute code, read the database, mutate records, perform network I/O, or loop outside a bounded collection supplied in the frozen fact snapshot. At the application boundary, callers may provide only typed question facts declared by the installed packs; they cannot overwrite derived workspace, matter, relationship, indicator, or corpus facts. Missing optional trigger facts evaluate as nonmatches so silence does not manufacture a conflict. Missing facts required after a trigger remains visible as an indeterminate review question.

## Three-valued results

Each rule returns one of:

- `MATCHED` — the supplied facts satisfy the screening condition;
- `NOT_MATCHED` — the supplied facts establish that the screening condition did not match;
- `INDETERMINATE` — required facts are absent.

An indeterminate result includes `missingFacts` and structured `unknownQuestions`. For example, the Chancery pack asks whether Delaware counsel has been confirmed rather than treating an absent answer as either yes or no. Matched and indeterminate results can create review work when their pack is controlling or potentially applicable. Comparative-only results remain visible but non-actionable.

## Evaluation record

Every execution persists:

1. the legal question;
2. every authority selection and its posture, source, rationale, and exact pack snapshot;
3. a frozen `interlocks.policy-facts.v1` snapshot and canonical SHA-256 hash;
4. engine and DSL versions;
5. every rule result, including nonmatches;
6. the exact citation, source URL, comparison note, missing facts, unknown questions, and bounded evaluation trace.

Questions, selections, evaluations, and rule results are immutable. A later analysis creates a new conflict check and new evaluation records. Installing a later pack version cannot rewrite the meaning of historical results.

## Pack authoring rule

A jurisdiction pack is a complete, independent snapshot. Runtime inheritance from ABA is forbidden: a local pack may record `correspondsTo` for comparison, but its conditions, summaries, citations, source, effective date, and version stand on their own. Any content change requires a version change; startup rejects a changed hash under an already installed `(pack_id, version)`.

Adding a pack requires:

1. an official primary source and effective date;
2. concise original rule summaries and exact citations;
3. a complete compiled manifest with a unique content hash;
4. fixtures for match, nonmatch, and missing-fact behavior;
5. persistence, tenant, export, and immutability tests;
6. placement in the metamorphic conformance matrix;
7. substantive review before removing `PROTOTYPE_REVIEW_REQUIRED`.

## Assurance

The core suite includes more than 12,000 named metamorphic conformance cases. Every installed rule has explicit matched and nonmatched fixtures, plus an indeterminate fixture whenever the rule asks for missing facts. Twenty semantic-preserving mutations per fixture verify stability under key reordering and irrelevant nested evidence. Targeted jurisdiction-difference tests separately prove local consent, screening, citation, and tribunal-composition behavior. Persistence tests cover automatic pack composition, atomic rollback, tenant isolation, fact hashes, immutable history, evidence attachments, and exact exports; HTTP and browser tests exercise the rendered workflow.

The next planned substantive expansion is associated/family relationships. It should extend the typed fact model and jurisdiction packs without adding special-case executable code to the evaluator.
