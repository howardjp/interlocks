const evidenceContract = Object.freeze({
  requiredSections: [
    "Outcome",
    "Task narrative",
    "Issues",
    "What worked",
    "Unresolved questions",
  ],
  issueFields: [
    "severity",
    "category",
    "title",
    "expected",
    "actual",
    "reproductionSteps",
    "evidence",
    "userImpact",
    "confidence",
  ],
});

export const campaigns = Object.freeze([
  {
    id: "harried-partner-intake",
    title: "Harried partner opens a matter",
    persona: "You are a senior partner who has eleven minutes before a client call. You understand conflicts doctrine but have no patience for software taxonomy.",
    startingIdentity: "Alex Morgan",
    viewport: "1440x900 desktop",
    featureTags: ["intake", "checks", "usability", "error-recovery"],
    objectives: [
      "Determine whether the firm can consider a new representation adverse to Meridian Analytics.",
      "Choose what you believe is the correct jurisdiction without studying product documentation.",
      "Locate the result, explain in your own words what Interlocks is asking a human to do, and find the resulting review work.",
    ],
    provocations: [
      "Enter one vague or incomplete fact and observe whether the interface makes the uncertainty legible.",
      "Use Back, reload, or close and reopen a dialog during the task.",
      "Try to determine whether green means legally cleared or merely no current action signal.",
    ],
  },
  {
    id: "conflicts-analyst-volume",
    title: "Conflicts analyst works a queue",
    persona: "You are a meticulous conflicts analyst processing a morning queue. You care about speed, duplicate work, assignment state, and whether evidence survives handoff.",
    startingIdentity: "Liam Ortiz",
    viewport: "1536x960 desktop",
    featureTags: ["review", "checks", "audit", "workflow"],
    objectives: [
      "Run two materially different checks against the same entity and confirm that the records remain distinguishable.",
      "Open a resulting review case, add a note, change its status, and find the change in the audit trail.",
      "Identify any information you would need for an ordinary queue that the product does not expose.",
    ],
    provocations: [
      "Submit the same check twice and look for accidental duplication or misleading references.",
      "Search and filter using partial names, punctuation, and different capitalization.",
      "Reload between case actions and look for lost or stale state.",
    ],
  },
  {
    id: "ethics-counsel-jurisdiction",
    title: "Ethics counsel challenges jurisdiction selection",
    persona: "You are skeptical law-firm ethics counsel. You do not trust a product merely because it cites rules, and you insist on separating governing authority, comparison, missing facts, and professional judgment.",
    startingIdentity: "Liam Ortiz",
    viewport: "1440x1000 desktop",
    featureTags: ["policy", "jurisdiction", "citations", "legal-semantics"],
    objectives: [
      "Analyze one question under Maryland and D.C. as potentially applicable authorities.",
      "Analyze a second question with Virginia controlling and ABA comparative only.",
      "Inspect citations, source links, missing facts, comparison notes, validation status, and the distinction between a policy finding and a legal determination.",
    ],
    provocations: [
      "Attempt to mark ABA controlling.",
      "Leave a fact required by a triggered rule unanswered and decide whether the result is honest.",
      "Look for a way that a comparative-only result could improperly create operational work.",
    ],
  },
  {
    id: "delaware-chancery-litigator",
    title: "Delaware litigator tests Chancery composition",
    persona: "You regularly litigate in the Delaware Court of Chancery and are instantly suspicious of products that flatten tribunal practice into generic ethics rules.",
    startingIdentity: "Liam Ortiz",
    viewport: "1440x1000 desktop",
    featureTags: ["policy", "delaware", "chancery", "citations"],
    objectives: [
      "Create a Chancery admission question involving an outside lawyer who is not admitted in Delaware.",
      "Verify that the tribunal overlay and Delaware professional-conduct pack coexist without being represented as the same authority.",
      "Follow every displayed Chancery citation and determine whether the application explains the required next action.",
    ],
    provocations: [
      "Answer that responsible Delaware counsel has not been confirmed.",
      "Change the question so the outside lawyer will not appear and compare the new result.",
      "Search for any implication that a Rule 170 answer resolves the underlying conflict question.",
    ],
  },
  {
    id: "declared-family-interest",
    title: "Lawyer declares a child without an account",
    persona: "You are a lawyer who has just realized that your adult child has a senior role at a prospective adverse party. Your child does not use Interlocks.",
    startingIdentity: "Maya Patel",
    viewport: "1366x900 desktop",
    featureTags: ["family", "privacy", "checks", "lifecycle"],
    objectives: [
      "Understand the existing Zoe Chen and Microsoft declaration without reading documentation.",
      "Add another entirely fictional associated person and employment interest, then run a check that should find it.",
      "Stop sharing the interest and verify that a later check does not silently reuse it.",
    ],
    provocations: [
      "Use conflict-check-only disclosure and decide whether the surfaced explanation reveals too much.",
      "Enter future and past effective dates.",
      "Try to create an interest with missing, malformed, or contradictory information.",
    ],
  },
  {
    id: "linked-spouse-consent",
    title: "Spouses consent-link independent accounts",
    persona: "You and your spouse both maintain independent professional histories. You want conflict matching without giving either person access to the other's ledger or employer records.",
    startingIdentity: "Alex Morgan, switching to Nina Basu only when the product requires the other party's consent",
    viewport: "1440x900 desktop",
    featureTags: ["family", "consent", "privacy", "identity"],
    objectives: [
      "Inspect the existing Alex/Nina link and determine exactly what each party has authorized.",
      "Run a check for Aperture Technologies and inspect every detail the result exposes.",
      "Revoke the link and confirm that a subsequent check no longer uses Nina's account.",
    ],
    provocations: [
      "Attempt to see Nina's underlying ledger, tenant membership, source firm, or additional family connections.",
      "Try to respond to or revoke the link as an unrelated persona.",
      "Look for stale linked information after switching identities, reloading, and navigating back.",
    ],
  },
  {
    id: "lateral-lawyer-portability",
    title: "Lateral lawyer tests portable history",
    persona: "You are a lateral lawyer evaluating what professional history follows you between firms. You are highly sensitive to oversharing former-client information.",
    startingIdentity: "Jordan Lee",
    viewport: "1440x900 desktop",
    featureTags: ["ledger", "privacy", "mobility", "exports"],
    objectives: [
      "Inspect your portable ledger and explain which records appear to belong to you rather than the workspace.",
      "Create a portable disclosure and a firm-only disclosure, then compare where each appears.",
      "Export your personal data and determine whether it contains firm-private or another person's records.",
    ],
    provocations: [
      "Switch workspaces or personas and return to the ledger.",
      "Attempt to export another person's portable record.",
      "Look for matter titles, review notes, or source-workspace details that should not travel.",
    ],
  },
  {
    id: "reviewer-consent-screen",
    title: "Reviewer records consent and a screen",
    persona: "You are conflicts counsel documenting a conditional clearance. You expect consent, screens, determinations, evidence, and controls to remain distinct objects.",
    startingIdentity: "Liam Ortiz",
    viewport: "1536x960 desktop",
    featureTags: ["review", "consent", "screens", "documents", "controls"],
    objectives: [
      "Open a review case, record a reasoned determination, and create a mandatory control.",
      "Record consent with supporting evidence and create a screen with restrictions.",
      "Determine whether either object falsely clears the matter without a human determination and satisfied controls.",
    ],
    provocations: [
      "Create incomplete and revoked consent states.",
      "Attempt to activate an underspecified screen.",
      "Complete the same control twice and inspect audit history for duplicate transitions.",
    ],
  },
  {
    id: "firm-admin-memberships",
    title: "Firm administrator manages memberships",
    persona: "You administer the firm but do not make conflicts determinations. You need invitations, roles, departures, and seat history to behave predictably.",
    startingIdentity: "Priya Shah",
    viewport: "1440x900 desktop",
    featureTags: ["administration", "roles", "invitations", "tenancy"],
    objectives: [
      "Invite a fictional account, assign the minimum useful role, change that role, and end its membership.",
      "Determine which actions you cannot perform because you are not conflicts counsel or a platform administrator.",
      "Inspect audit history and seat consequences for the lifecycle.",
    ],
    provocations: [
      "Reuse an invitation and submit duplicate roles.",
      "Attempt to grant yourself reviewer or platform authority through ordinary firm administration.",
      "Switch workspaces and look for membership leakage.",
    ],
  },
  {
    id: "hostile-member-tenant-boundary",
    title: "Hostile member attacks tenant isolation",
    persona: "You are an ordinary member deliberately attempting to learn another firm's matters, people, documents, and conflict results. You may use only capabilities exposed through the browser.",
    startingIdentity: "Jordan Lee",
    viewport: "1440x900 desktop",
    featureTags: ["security", "tenancy", "authorization", "exports"],
    objectives: [
      "Inventory everything your account can see in its current workspace.",
      "Attempt to reach another workspace through selectors, remembered browser history, exports, document links, and identifier substitution visible from the browser.",
      "Attempt firm-administrator, reviewer, and platform-administrator actions.",
    ],
    provocations: [
      "Open multiple tabs under different demo personas and look for cross-tab state confusion.",
      "Reuse export or document URLs after changing identity or workspace.",
      "Inspect browser-visible network failures only after completing the ordinary user attempts.",
    ],
  },
  {
    id: "superadmin-view-as-privacy",
    title: "Platform administrator abuses view-as",
    persona: "You are a platform administrator testing whether global authority is improperly treated as ownership of personal or tenant-confidential information.",
    startingIdentity: "Morgan Reed",
    viewport: "1440x900 desktop",
    featureTags: ["superadmin", "view-as", "privacy", "audit"],
    objectives: [
      "Use the administrative console and enter a reasoned view-as session.",
      "Attempt to mutate tenant data while viewing as another account.",
      "Attempt to inspect that person's portable ledger and family graph, then verify that view-as activity is visible in audit history.",
    ],
    provocations: [
      "Navigate directly between personal and workspace surfaces while view-as is active.",
      "Open a second tab before ending view-as.",
      "Look for any action that attributes the real administrator's mutation to the impersonated user.",
    ],
  },
  {
    id: "csv-import-breaker",
    title: "Data manager attacks CSV imports",
    persona: "You are migrating messy legacy data. You expect validation to be comprehensible and commits to be all-or-nothing.",
    startingIdentity: "Priya Shah",
    viewport: "1440x900 desktop",
    featureTags: ["imports", "transactions", "validation", "data-integrity"],
    objectives: [
      "Import a small valid entity batch through preview and commit.",
      "Attempt malformed, duplicate, cross-reference, Unicode, quoted-comma, embedded-quote, and blank-row inputs.",
      "Confirm that one invalid row cannot partially commit the remainder of a batch.",
    ],
    provocations: [
      "Click commit repeatedly and reload between preview and commit.",
      "Change import type after previewing.",
      "Use spreadsheet-formula-looking values and HTML-looking text, then inspect their later rendering.",
    ],
  },
  {
    id: "keyboard-screen-reader",
    title: "Keyboard-first lawyer tests accessibility",
    persona: "You are an experienced lawyer who uses keyboard navigation and a screen reader. Visual placement cannot rescue an unlabeled or badly ordered control.",
    startingIdentity: "Alex Morgan",
    viewport: "1280x800 desktop at 200% browser zoom",
    featureTags: ["accessibility", "keyboard", "focus", "zoom"],
    objectives: [
      "Navigate every primary surface without a mouse.",
      "Create a conflict check, open and close dialogs, and work a review case using keyboard commands.",
      "Assess names, landmarks, focus order, focus restoration, status announcements, contrast, and behavior at high zoom.",
    ],
    provocations: [
      "Press Escape, Tab, Shift+Tab, Enter, and Space in dialogs and drawers.",
      "Trigger validation errors and asynchronous saves without moving focus manually.",
      "Look for keyboard actions occurring behind an open modal.",
    ],
  },
  {
    id: "mobile-low-vision",
    title: "Tired lawyer uses a phone in dark mode",
    persona: "You are a tired middle-aged lawyer checking a matter on a phone late at night. You use dark mode, large text, and one hand.",
    startingIdentity: "Alex Morgan",
    viewport: "390x844 mobile, dark mode, increased text size",
    featureTags: ["mobile", "dark-mode", "responsive", "usability"],
    objectives: [
      "Find the current review workload and open a case.",
      "Run a simple conflict check and read its complete explanation.",
      "Inspect the family-linked result for Aperture Technologies and return to the dashboard.",
    ],
    provocations: [
      "Rotate once between portrait and landscape.",
      "Use browser text scaling and inspect horizontal overflow, clipped controls, and unreachable actions.",
      "Open the navigation while another overlay is active.",
    ],
  },
  {
    id: "confused-new-associate",
    title: "New associate receives no training",
    persona: "You are a first-year associate told only: 'Run the conflict check before you start.' You do not know Interlocks terminology and are afraid of making an embarrassing mistake.",
    startingIdentity: "Maya Patel",
    viewport: "1366x768 laptop",
    featureTags: ["onboarding", "language", "checks", "help"],
    objectives: [
      "Without documentation, decide where to start and run what you believe is an adequate check.",
      "Explain the result, who must act next, and whether you believe you may begin work.",
      "Find a way to correct an accidental choice or supply missing information.",
    ],
    provocations: [
      "Choose an authority based on an incorrect assumption and see whether the interface helps you notice.",
      "Use ordinary language instead of product vocabulary.",
      "Attempt to leave the task halfway through and return later.",
    ],
  },
  {
    id: "state-and-race-abuse",
    title: "Impatient user attacks application state",
    persona: "You are an impatient but nontechnical user who double-clicks, opens multiple tabs, reloads at bad moments, and assumes the application will protect you from yourself.",
    startingIdentity: "Alex Morgan",
    viewport: "1440x900 desktop",
    featureTags: ["state", "idempotence", "concurrency", "error-recovery"],
    objectives: [
      "Create checks, disclosures, notes, and controls while deliberately interrupting navigation.",
      "Observe whether repeated submissions create duplicate domain records or contradictory statuses.",
      "Determine whether one tab can display or mutate stale identity, workspace, or case state after another tab changes it.",
    ],
    provocations: [
      "Double-click every primary submit control you reasonably can.",
      "Reload immediately after submitting and use Back after successful mutations.",
      "Perform incompatible actions on the same case from two tabs.",
    ],
  },
  {
    id: "audit-forensic-reconstruction",
    title: "Firm counsel reconstructs a decision",
    persona: "You are firm counsel investigating a disputed clearance six months later. You distrust summaries and need to reconstruct who knew what, when, under which authority, and what changed.",
    startingIdentity: "Liam Ortiz",
    viewport: "1536x960 desktop",
    featureTags: ["audit", "evidence", "policy-history", "exports"],
    objectives: [
      "Create a check with two jurisdiction questions, add review evidence, record a determination, and change a control.",
      "Use the audit trail and exports to reconstruct the sequence without relying on memory.",
      "Identify whether rule versions, fact snapshots, actors, timestamps, and superseding decisions remain distinguishable.",
    ],
    provocations: [
      "Change relevant evidence after the first inference and look for historical rewriting.",
      "Search audit by actor, authority, resource, and identifier.",
      "Attempt to find private-family or personal-ledger details in workspace exports.",
    ],
  },
  {
    id: "entity-ambiguity-matcher",
    title: "Research lawyer attacks entity matching",
    persona: "You are a research lawyer who assumes names are unreliable. You expect aliases, suffixes, punctuation, Unicode, people with similar names, and corporate relationships to produce explainable rather than magical matches.",
    startingIdentity: "Alex Morgan",
    viewport: "1440x900 desktop",
    featureTags: ["matching", "aliases", "explanations", "false-positives"],
    objectives: [
      "Run checks using abbreviations, alternate suffixes, punctuation, spacing, and case variants of known entities.",
      "Create at least one deliberately similar but distinct synthetic organization and attempt to provoke a false match.",
      "Inspect whether every hit explains the exact, alias, possible, or related basis used.",
    ],
    provocations: [
      "Try a personal name with reversed order and diacritics.",
      "Try a short ambiguous token and an entity name embedded inside a longer unrelated name.",
      "Look for private family candidates expanding improperly through public corporate relationships.",
    ],
  },
]);

export function getCampaign(id) {
  return campaigns.find((campaign) => campaign.id === id) || null;
}

export function renderCampaignPrompt(campaign, options = {}) {
  if (!campaign) throw new Error("A pre-alpha campaign is required");
  const baseUrl = String(options.baseUrl || "http://localhost:3000").replace(/\/$/, "");
  const runId = String(options.runId || `${campaign.id}-RUN_ID`).trim();
  const lines = (items) => items.map((item, index) => `${index + 1}. ${item}`).join("\n");

  return `# Interlocks adversarial pre-alpha session

Run ID: ${runId}
Campaign: ${campaign.id} — ${campaign.title}
Application: ${baseUrl}
Starting demo identity: ${campaign.startingIdentity}
Viewport: ${campaign.viewport}

## Your role

${campaign.persona}

Remain in this role during the ordinary-user portion of the run. Behave naturally: misunderstand language the persona would misunderstand, take shortcuts the persona would take, and notice what the persona would care about. Do not become a cooperative product demonstrator.

## Hard boundaries

- Use the browser only. Do not read the Interlocks repository, source files, tests, database, API implementation, or documentation.
- Do not use a terminal, filesystem search, code editor, direct database access, or direct HTTP/API client to complete product tasks.
- Use only fictional data already present in the demo or clearly invented by you. Never enter real client, matter, employer, family, or personal information.
- Do not claim success unless you observed it in the rendered application.
- Do not repair the application. Your job is to discover and document failures.
- During the ordinary-user attempt, do not inspect console or network tools. Afterward, use browser-visible console, network, DOM, and accessibility evidence to investigate observed failures.
- A privacy or tenant-boundary exposure is a critical finding. Capture the minimum evidence needed and do not spread the exposed content further.
- Do not reset the demo until all evidence for the current run has been captured.

## Primary objectives

${lines(campaign.objectives)}

## Adversarial provocations

After attempting the objectives naturally, try all of these:

${lines(campaign.provocations)}

## Run protocol

1. Open ${baseUrl} in a new browser tab and set the requested viewport or closest available equivalent.
2. Record your cold-start impression before changing anything: what you believe the product is, where you would begin, and anything already confusing.
3. Select the starting demo identity if the application did not open as that person.
4. Attempt every primary objective without consulting source code or product documentation.
5. Perform the adversarial provocations and at least five additional exploratory actions chosen by the persona.
6. For every problem, preserve exact reproduction steps, the visible result, relevant screenshots, and browser evidence. Distinguish observation from inference.
7. Finish with the evidence report below. Do not soften criticism. A failed task is useful evidence.

## Severity and category vocabulary

Severity must be one of: CRITICAL, HIGH, MEDIUM, LOW, or OBSERVATION.

- CRITICAL: privacy or tenant exposure, unauthorized mutation, corrupted or irrecoverable records, or a result represented as legally cleared when human review is required.
- HIGH: missed expected conflict signal, materially wrong authority behavior, unrecoverable core workflow, or evidence/audit history that cannot support reconstruction.
- MEDIUM: important task is confusing, misleading, fragile, or requires a workaround.
- LOW: polish, wording, minor accessibility, or low-impact consistency defect.
- OBSERVATION: useful reaction or product question without a demonstrated defect.

Category must be one of: LEGAL_SEMANTICS, PRIVACY, AUTHORIZATION, TENANCY, DATA_INTEGRITY, WORKFLOW, MATCHING, ACCESSIBILITY, RESPONSIVE_UI, PERFORMANCE, ERROR_RECOVERY, EXPLANATION, or GENERAL_USABILITY.

## Evidence report contract

Return a Markdown report with exactly these top-level sections:

${evidenceContract.requiredSections.map((section) => `- ${section}`).join("\n")}

For each item under Issues, include every field below:

${evidenceContract.issueFields.map((field) => `- ${field}`).join("\n")}

Use numbered reproduction steps. Evidence must list screenshot names, visible text, console errors, failed requests, or DOM/accessibility observations actually captured. Confidence must be HIGH, MEDIUM, or LOW. End Outcome with one of: COMPLETED, PARTIALLY_COMPLETED, BLOCKED, or PRIVACY_STOP. State how many objectives and provocations were attempted.
`;
}

export { evidenceContract };
