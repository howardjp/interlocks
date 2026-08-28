# Jurisdictional Policy Engine

The Jurisdictional Policy Engine is a declarative, versioned screening system for legal professional-responsibility questions. It helps a reviewer identify possibly relevant rules, compare jurisdictions, expose missing facts, and preserve the exact basis of an analysis. It does not decide whether a conflict exists and is not a substitute for professional legal judgment.

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

The licensing/model packs currently screen structured indicators corresponding to current-client adversity, material limitation, former-client duties, former-government service, and prospective-client duties. The Chancery overlay currently evaluates Delaware-counsel confirmation and pro hac vice status. These are useful vertical slices, not complete jurisdiction codes.

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
  exists: {
    collection: "indicators",
    where: {
      predicate: {
        path: "type",
        operator: "in",
        value: ["CURRENT_CLIENT_ADVERSITY", "SAME_MATTER_ADVERSE_POSITIONS"]
      }
    }
  }
}
```

The DSL cannot execute code, read the database, mutate records, perform network I/O, or loop outside a bounded collection supplied in the frozen fact snapshot. At the application boundary, callers may provide only typed question facts recognized by the installed interface (currently Chancery tribunal, Delaware-counsel, outside-counsel, and pro hac vice fields); they cannot overwrite derived workspace, matter, relationship, indicator, or corpus facts.

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

The core suite includes 10,000 named metamorphic conformance cases. They cover every rule in the ABA, Maryland, Virginia, D.C., and Delaware packs across all authority postures and verify stability under absent, reordered, duplicated, and irrelevant evidence. Targeted tests separately cover Chancery unknown facts, automatic pack composition, atomic rollback, tenant isolation, fact hashes, immutable history, evidence attachments, exact exports, browser interaction, and production HTTP behavior.

The next planned substantive expansion is associated/family relationships. It should extend the typed fact model and jurisdiction packs without adding special-case executable code to the evaluator.
