# Interlocks legal-ethics audit

Status: MVP baseline, 28 August 2026

This audit tests the Interlocks domain against the American Bar Association Model Rules of Professional Conduct. The Model Rules are an ontology and design baseline, not a declaration of controlling law. Every operational determination must identify the applicable jurisdiction, the locally adopted rule or policy, and the human reviewer who applied it. The ABA publishes [jurisdictional comparison charts](https://www.americanbar.org/groups/professional_responsibility/policy/rule_charts/) precisely because adoption varies.

Interlocks is a system of record and workflow. It may find candidate identities, relationships, missing evidence, and changed facts. It may not decide whether a conflict exists, whether matters are substantially related, whether information is material, whether a conflict is consentable, whether consent is sufficient, or whether a screen is effective.

## Product-wide conclusions

The prototype's former numeric risk score is ethically unsafe. It compressed factual uncertainty and legal judgment into arithmetic, encouraged false precision, and could become a substitute for professional analysis. The MVP therefore uses two separate dimensions:

- `workflow_state`: `GREEN`, `YELLOW`, or `RED`, describing whether work may proceed and what action remains.
- `human_disposition`: an explicit, attributable professional judgment such as `NO_CONFLICT`, `CONFLICT_CONSENTABLE`, `CONSENT_REQUIRED`, `SCREEN_REQUIRED`, `CLEARED`, `DECLINE`, or `WITHDRAW`.

`GREEN` means only “No unresolved issue surfaced.” It is not a machine opinion that no conflict exists. `YELLOW` is the normal machine state for any materially interesting result. `RED` is a hold created by a human determination, an unmet mandatory requirement, or an applicable policy.

The audit requires first-class, temporal records for client status, matter parties, prospective-client contacts, former representations, assertions, evidence, inferences, human determinations, consent, screens, controls, jurisdictions, and rule or policy bases. Evidence and inferences must be point-in-time. Later facts may trigger re-review but never rewrite a historical check or judgment.

## Rule-by-rule audit

### Rule 1.0 — Terminology

- **Authority:** [ABA Model Rule 1.0](https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_0_terminology/).
- **Ethical requirement:** Material terms include informed consent, confirmed in writing, firm, screened, reasonable belief, substantial, and writing. A screen requires timely, adequate isolation; a signed writing may be electronic.
- **Relevant factual questions:** Who received which information? What was explained? Who consented, in what form, and when? When did restrictions become effective? Was fee sharing prohibited? Was required notice sent?
- **Outside information:** Adopted jurisdictional definitions, engagement terms, signed communications, notice records, and operational access logs.
- **Current support:** The prototype stores decisions and generic controls.
- **Gap:** Consent and screens were notes or controls; rule terminology, form requirements, effective time, notice, and authority were not structured.
- **Required behavior:** First-class consent and screen objects; document links; effective and recorded dates; rule basis; jurisdiction; human sufficiency determination; immutable history.
- **Jurisdiction dependence:** Definitions and required form can vary.
- **Tests:** A waiver alone does not clear a case; a screen without required notice remains blocking; electronic signed writing is representable.

### Rule 1.1 — Competence and technology competence

- **Authority:** [ABA Model Rule 1.1](https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_1_competence/) and Comment 8.
- **Ethical requirement:** Competent representation includes keeping abreast of relevant technology's benefits and risks.
- **Relevant factual questions:** Is the system suitable for the sensitivity of the data? Are users trained? Are safeguards and vendors periodically reassessed? Can records be retrieved and understood?
- **Outside information:** Firm security policy, vendor diligence, incident history, training records, and jurisdictional adoption of Comment 8.
- **Current support:** Local SQLite and audit chronology.
- **Gap:** No authentication, tenant isolation, retention policy, or security configuration record.
- **Required behavior:** Managed authentication, centralized authorization, tenant isolation tests, secure configuration, health checks, append-only audit, exportability, and documented deployment controls.
- **Jurisdiction dependence:** Comment 8 adoption and competence standards vary.
- **Tests:** Production fails closed when authentication or security secrets are absent; cross-tenant reads fail; sensitive administrative access is audited.

### Rule 1.6 — Confidentiality of information

- **Authority:** [ABA Model Rule 1.6](https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_6_confidentiality_of_information/) and [comments](https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_6_confidentiality_of_information/comment_on_rule_1_6/).
- **Ethical requirement:** Information relating to representation is broadly protected. Reasonable efforts must prevent unauthorized access or disclosure. Limited conflict information may be disclosed during substantive lateral or merger discussions only as reasonably necessary and not when privilege or client prejudice would be compromised without consent.
- **Relevant factual questions:** What is the information's source, sensitivity, tenant ownership, disclosure class, and permitted audience? Has substantive diligence begun? Would identity disclosure itself prejudice a client? Has consent been obtained?
- **Outside information:** Client instructions, protective orders, law, contracts, privilege analysis, and circumstances of a lateral move or acquisition.
- **Current support:** None beyond local storage.
- **Gap:** No confidentiality scope, personal-ledger sharing class, workspace boundary, access decision, or document access trail.
- **Required behavior:** Workspace ownership, field/resource confidentiality scopes, explicit ledger-sharing permission, sealed diligence boundaries in a later module, object-store abstraction, no public demo controls, and auditable sensitive access.
- **Jurisdiction dependence:** State rules, privacy law, privilege law, breach law, and client instructions vary.
- **Tests:** Firm B cannot obtain Firm A private facts through search or export; `FIRM_ONLY` ledger entries never travel; departure revokes access without deleting records.

### Rule 1.7 — Current-client conflicts

- **Authority:** [ABA Model Rule 1.7](https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_7_conflict_of_interest_current_clients/) and [comments](https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_7_conflict_of_interest_current_clients/comment_on_rule_1_7/).
- **Ethical requirement:** Lawyers identify clients, determine direct adversity or material limitation, decide consentability, and, where permitted, obtain each affected client's informed consent confirmed in writing.
- **Relevant factual questions:** Who is the client? Who is adverse? What responsibilities or personal interests may materially limit judgment? Can competent and diligent representation be provided? Is the matter a prohibited claim by one current client against another in the same proceeding?
- **Outside information:** Engagement scope, corporate-family representation terms, matter posture, client expectations, lawyer roles, and local law.
- **Current support:** Relationships, matters, review cases, decisions, controls.
- **Gap:** Outside organizations were not distinguished from clients; corporate affiliation could be mistaken for representation; consentability and consent sufficiency were not separate judgments.
- **Required behavior:** Matter-party roles including `CLIENT`, `ADVERSE_PARTY`, and `RELATED_PARTY`; representation status; human determinations for adversity, material limitation, and consentability; per-party consent records.
- **Jurisdiction dependence:** Adopted wording, advance-waiver treatment, and nonconsentable categories vary.
- **Tests:** A related corporate entity creates a candidate hit but not a client relationship; consent obtained does not imply consentable or cleared.

### Rule 1.8 — Specific current-client conflicts

- **Authority:** [ABA Model Rule 1.8](https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_8_current_clients_specific_rules/).
- **Ethical requirement:** Specific rules cover business transactions with clients, use of information, gifts, literary rights, financial assistance, third-party compensation, aggregate settlements, malpractice limitations, proprietary interests, sexual relationships, and imputation.
- **Relevant factual questions:** What benefit, transaction, payment, gift, relationship, or proprietary interest exists? Was advice to seek independent counsel given? Is writing or signature required? Is the prohibition personal or imputed?
- **Outside information:** Transaction documents, payment arrangements, relationship facts, independent-counsel communications, and local exceptions.
- **Current support:** Generic financial, family, gift, and employment disclosures.
- **Gap:** No structured subtype, required-form checklist, affected parties, or imputation decision.
- **Required behavior:** Extensible relationship/assertion predicates, rule-basis records, evidence requirements, human imputation and consentability judgments, and conditions on consent.
- **Jurisdiction dependence:** Rule 1.8 varies substantially by jurisdiction.
- **Tests:** A specific-conflict fact remains `YELLOW` until reviewed; mandatory writing and signature requirements can independently hold a case `RED`.

### Rule 1.9 — Former clients

- **Authority:** [ABA Model Rule 1.9](https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_9_duties_of_former_clients/).
- **Ethical requirement:** Representation adverse to a former client in the same or a substantially related matter may require informed consent confirmed in writing. Duties concerning protected information continue.
- **Relevant factual questions:** Was the person or entity actually a client? Which lawyer or former firm represented it? Are matters the same or substantially related? Are interests materially adverse? Did the lawyer acquire material protected information?
- **Outside information:** Prior-firm records, engagement scope, file contents, public records, and human legal analysis.
- **Current support:** Generic prior relationships.
- **Gap:** No former-client status, matter linkage, material-information question, or substantially-related judgment.
- **Required behavior:** Temporal representation relationships; former matters; scoped prior-firm provenance; human determinations for substantial relationship, material adversity, and protected-information relevance.
- **Jurisdiction dependence:** Tests for substantial relationship, burden, and consent vary.
- **Tests:** Former-client identity creates an explainable `YELLOW` hit; only a human disposition can resolve the legal question.

### Rule 1.10 — Imputation and lawyer mobility

- **Authority:** [ABA Model Rule 1.10](https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_10_imputation_of_conflicts_of_interest_general_rule/).
- **Ethical requirement:** Certain conflicts are imputed across a firm; personal-interest conflicts may not be; departing and arriving lawyers create temporal questions; screening, notice, and certifications may permit representation in specified cases.
- **Relevant factual questions:** When did membership begin and end? Which lawyers worked on or learned protected information about the matter? Is the conflict personal? Is screening permitted? Was it timely? Were fee and notice conditions satisfied?
- **Outside information:** Prior-firm roster, matter participation, access records, certifications, notices, and jurisdiction-specific screening rules.
- **Current support:** None for membership history or screens.
- **Gap:** Person and firm were conflated; no temporal membership, portable ledger, imputation scope, or screen.
- **Required behavior:** Persistent person/account identity, temporal workspace membership, matter participation, portable/restricted disclosure classes, first-class screens, and historical conflict-check snapshots.
- **Jurisdiction dependence:** Screening availability and notice/certification requirements vary.
- **Tests:** Departure ends access and billing but retains history; permitted portable facts can participate at a new firm without exposing old-firm private data.

### Rule 1.11 — Former and current government lawyers

- **Authority:** [ABA Model Rule 1.11](https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_11_special_conflicts_of_interest_for_former_and_current_government_officers_and_employees/).
- **Ethical requirement:** Former government lawyers may be barred from matters in which they participated personally and substantially absent informed government consent; confidential government information and current-government employment negotiations create additional duties; screening and notice may prevent imputation.
- **Relevant factual questions:** What government body, role, and dates? Was participation personal and substantial? Is it the same “matter”? Is confidential government information involved? Were notice and screening requirements satisfied?
- **Outside information:** Government service records, matter definitions, agency consent, statutes, and access history.
- **Current support:** Generic prior employment only.
- **Gap:** Government-body entity kind, service role, participation, notice, and statutory overlays.
- **Required behavior:** `GOVERNMENT_BODY` entities, temporal professional relationships, matter participation assertions, rule/policy basis, consent recipient, screen notice, and fee restrictions.
- **Jurisdiction dependence:** Statutes and government ethics regimes may be stricter.
- **Tests:** Government employment alone is a candidate relationship; no automatic conflict conclusion; missing mandatory notice can produce `RED`.

### Rule 1.12 — Former judges, arbitrators, mediators, and neutrals

- **Authority:** [ABA Model Rule 1.12](https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_12_former_judge_arbitrator_mediator_or_other_third_party_neutral/).
- **Ethical requirement:** A lawyer generally must not represent anyone in a matter in which the lawyer participated personally and substantially as a neutral without informed consent confirmed in writing; employment negotiations and screening rules also apply.
- **Relevant factual questions:** What neutral role? Which matter? Was participation personal and substantial? Were all parties' consents obtained? Was screening timely with fee restrictions and written notice?
- **Outside information:** Dockets, appointment records, tribunal/ADR rules, consent writings, and notice evidence.
- **Current support:** None beyond generic relationships.
- **Gap:** Neutral roles, matter identity, party-specific consent, and screen conditions.
- **Required behavior:** Matter participant roles, human same-matter/participation judgments, multi-party consents, first-class screen, and notices.
- **Jurisdiction dependence:** Judicial codes and local ADR rules supplement professional-conduct rules.
- **Tests:** Neutral participation creates `YELLOW`; a missing required consent or screen creates `RED` without an automated legal conclusion.

### Rule 1.13 — Organization as client

- **Authority:** [ABA Model Rule 1.13](https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_13_organization_as_client/).
- **Ethical requirement:** The client is the organization acting through constituents. Representation of an organization does not automatically represent its constituents, parents, subsidiaries, affiliates, officers, or employees.
- **Relevant factual questions:** Which legal person is the client? What does the engagement say about affiliates? Who is a constituent or joint client? Is an internal constituent adverse? Who can consent for the organization?
- **Outside information:** Engagement letters, corporate records, governance authority, joint-representation terms, and local entity law.
- **Current support:** Organization records and generic relationships.
- **Gap:** Tenant organization and graph organization were conflated; affiliation risked automatic client status.
- **Required behavior:** Separate `Workspace` from organization `Entity`; explicit client matter-party role; corporate relationships generate `RELATED` candidate hits only; authorized-consenter assertions.
- **Jurisdiction dependence:** Entity law, engagement interpretation, and affiliate-conflict doctrine vary.
- **Tests:** Parent/subsidiary graph expansion explains a hit but does not create representation; the exact client is visible in the check report.

### Rule 1.18 — Prospective clients

- **Authority:** [ABA Model Rule 1.18](https://www.americanbar.org/groups/professional_responsibility/publications/model_rules_of_professional_conduct/rule_1_18_duties_of_prospective_client/).
- **Ethical requirement:** Duties can arise from consultation even when no relationship follows. Significantly harmful information may disqualify; informed consent or timely screening, no fee, and written notice can sometimes permit representation.
- **Relevant factual questions:** Did a consultation occur? Was the person genuinely seeking representation? What information was learned, by whom, and was it significantly harmful? Were exposure-minimization measures used? Was a screen timely and notice prompt?
- **Outside information:** Intake communications, website warnings, consultation records, lawyer notes, consent, and notice.
- **Current support:** Self-disclosures and generic matter intake.
- **Gap:** No prospective-client contact object, consultation history, information-exposure scope, or screening workflow.
- **Required behavior:** Prospective-client matter/party status; contact and exposure assertions; confidentiality before engagement; human significantly-harmful judgment; consent/screen path; immutable history if no engagement follows.
- **Jurisdiction dependence:** Definition, website-contact treatment, and screening rules vary.
- **Tests:** A declined prospective client remains searchable with restricted disclosure; consultation alone never becomes a current-client relationship.

## Formal opinions affecting the MVP

### ABA Formal Opinion 09-455 — lateral-move conflict information

[Formal Opinion 09-455](https://www.americanbar.org/products/ecd/chapter/220017/) allows limited disclosure needed to detect conflicts during a lawyer move, subject to timing, necessity, privilege, and prejudice limitations. Interlocks therefore separates a person's identity and portable ledger from prior-firm private data. Disclosure classes (`PORTABLE`, `RESTRICTED`, `CONSENT_REQUIRED`, `FIRM_ONLY`) are enforced rather than treated as labels. A future diligence workspace must be sealed, consent-aware, purpose-limited, and expiring.

### ABA Formal Opinions 477R, 483, and 498 — electronic security

[Formal Opinion 477R](https://www.americanbar.org/content/dam/aba/administrative/professional_responsibility/ethics-opinions/aba-formal-opinion-477.pdf) requires fact-sensitive reasonable safeguards and periodic reassessment; [Formal Opinion 483](https://www.americanbar.org/groups/professional_responsibility/publications/ethics_opinions/aba_formal_ethics_opinions_index_by_issue_dates/) addresses detection, response, restoration, and communication after breach; [Formal Opinion 498](https://www.americanbar.org/content/dam/aba/administrative/professional_responsibility/ethics-opinions/aba-formal-opinion-498.pdf) applies competence, confidentiality, supervision, and secure access to virtual practice. The MVP must use managed authentication, encrypted transport in production, secure cookies, least-privilege tenant authorization, isolated document storage, no sensitive client-side secrets, nonverbose production errors, audit trails, backup/restore planning, and vendor-neutral storage/authentication boundaries.

The software cannot certify that any deployment is ethically sufficient. Security configuration and vendor diligence remain human institutional responsibilities and should be recorded as policy evidence.

### ABA Formal Opinion 494 — personal relationships with opposing counsel

[Formal Opinion 494](https://www.americanbar.org/content/dam/aba/administrative/professional_responsibility/ethics-opinions/aba-formal-opinion-494.pdf) distinguishes intimate relationships, friendships of varying closeness, and acquaintances; role and circumstances matter, some conflicts are personal and not ordinarily imputed, and disclosure or informed consent may be required. Interlocks therefore models associated people and relationship context without converting kinship or friendship into an automatic firm-wide conflict. Scoped queries minimize unnecessary personal disclosure.

### ABA Formal Opinion 512 — use of generative AI

[Formal Opinion 512](https://www.americanbar.org/content/dam/aba/administrative/professional_responsibility/ethics-opinions/aba-formal-opinion-512.pdf) reinforces competence and confidentiality duties when lawyers use generative AI. Interlocks uses no LLM for core matching or professional judgment. Any later AI assistance must preserve confidentiality, provenance, verification, and human responsibility.

## Required domain changes

The audit establishes the following MVP invariants:

1. `Person`, `Account`, `AuthIdentity`, `Workspace`, and organization `Entity` are distinct.
2. Client status is an explicit, temporal matter relationship, never inferred from corporate affiliation.
3. Workflow state and human legal disposition are separate.
4. Assertions, evidence, inferences, and human determinations are distinct record types.
5. Documents are immutable first-class objects attachable to controlled resource types and assertions.
6. Inferences and determinations are append-only point-in-time records with supersession links.
7. Conflict checks snapshot their subjects, corpus revision, evidence, assertions, inferences, and explanations.
8. Consent and screens are first-class and never automatically clear a case.
9. Every access and mutation is evaluated under an explicit authority and workspace scope.
10. The application fails closed in production and does not expose demo identity switching, reset, or public registration by default.

## Minimum acceptance evidence

Automated tests must prove tenant isolation, departed-member access revocation, portable-ledger filtering, role separation, superadministrator auditing, immutable evidence bytes, many-to-many evidence links, inference supersession without mutation, explained deterministic matching, no numeric risk score in code/schema/UI/export, consent and screen holds, registration-mode enforcement, versioned migrations, production configuration validation, and the complete conflict-check-to-human-disposition workflow.
