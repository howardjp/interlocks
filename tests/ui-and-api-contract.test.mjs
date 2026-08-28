import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(new URL(path, import.meta.url), "utf8");
}

const files = {
  app: await source("../app/components/interlocks-app.tsx"),
  primitives: await source("../app/components/primitives.tsx"),
  review: await source("../app/components/pages/review-pages.tsx"),
  checks: await source("../app/components/pages/checks-knowledge.tsx"),
  ledger: await source("../app/components/pages/ledger-associated.tsx"),
  portfolio: await source("../app/components/pages/portfolio-admin.tsx"),
  data: await source("../app/components/pages/data-audit.tsx"),
  admin: await source("../app/components/pages/admin-console.tsx"),
  invitation: await source("../app/invite/[token]/page.tsx"),
  types: await source("../app/components/types.ts"),
  styles: await source("../app/globals.css"),
  layout: await source("../app/layout.tsx"),
  commands: await source("../app/api/commands/route.js"),
  exportRoute: await source("../app/api/export/route.js"),
  snapshotRoute: await source("../app/api/snapshot/route.js"),
  healthRoute: await source("../app/api/health/route.js"),
  nextConfig: await source("../next.config.ts"),
  policySchema: await source("../lib/policy/legal-conflicts-schema.mjs"),
};

const allUi = [files.app, files.primitives, files.review, files.checks, files.ledger, files.portfolio, files.data, files.admin, files.invitation].join("\n");

for (const [id, label] of [
  ["dashboard", "Dashboard"], ["checks", "Conflict checks"], ["review", "Review queue"],
  ["ledger", "My ledger"], ["knowledge", "Knowledge"], ["portfolio", "Portfolio"],
  ["associated", "Family & associated"], ["data", "Imports & exports"], ["audit", "Audit trail"],
]) {
  test(`primary navigation exposes ${label}`, () => {
    assert.match(files.app, new RegExp(`id:\"${id}\",label:\"${label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\"`));
  });
}

for (const [view, title] of [
  ["dashboard", "What needs attention"], ["checks", "Check before acting"], ["review", "Review queue"],
  ["ledger", "My portable ledger"], ["knowledge", "Knowledge corpus"], ["portfolio", "Entities and matters"],
  ["associated", "Family & associated people"], ["data", "Imports and exports"], ["audit", "Audit trail"],
  ["admin", "Global administration"], ["settings", "People, roles, and policy"],
]) {
  test(`${view} has a product-specific page title`, () => {
    assert.match(files.app, new RegExp(`${view}:\\{eyebrow:[^}]+title:\"${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\"`));
  });
}

for (const command of [
  "workspace.create", "invitation.create", "invitation.accept", "membership.update", "entity.create", "matter.create",
  "assertion.create", "inference.create", "document.upload", "check.create", "disclosure.create", "case.action",
  "consent.create", "screen.create", "control.complete", "associated.request", "associated.respond", "import.preview",
  "family.association.create", "family.association.end", "family.interest.create", "family.interest.revoke",
  "family.link.request", "family.link.respond", "family.link.revoke", "import.commit", "demo.reset",
]) {
  test(`command API explicitly routes ${command}`, () => {
    assert.ok(files.commands.includes(`"${command}"`));
  });
}

for (const aggregate of [
  "entities", "matters", "relationships", "cases", "checks", "hits", "controls", "notes", "determinations",
  "consents", "screens", "assertions", "inferences", "policyPacks", "policyQuestions", "policySelections",
  "policyEvaluations", "policyRuleResults", "documents", "memberships", "invitations",
  "associatedRequests", "associatedResponses", "personalAssociations", "associationInterests", "familyAccountLinks", "audit", "ledger",
]) {
  test(`snapshot UI type includes ${aggregate}`, () => {
    assert.match(files.types, new RegExp(`\\b${aggregate}:`));
  });
}

test("UI never exposes numeric risk scoring", () => {
  assert.doesNotMatch(allUi, /riskScore|risk_score|risk level|numeric score|score-ring/i);
});

test("traffic-light language describes action rather than ethical certainty", () => {
  assert.match(files.primitives, /GREEN:"No unresolved issue surfaced"/);
  assert.match(files.primitives, /YELLOW:"Human review required"/);
  assert.match(files.primitives, /RED:"Do not proceed"/);
  assert.doesNotMatch(allUi, /No conflict exists/i);
});

test("the check UI exposes question-level authority selection", () => {
  assert.match(files.checks, /Choose authority independently/);
  assert.match(files.checks, /CONTROLLING/);
  assert.match(files.checks, /POTENTIALLY_APPLICABLE/);
  assert.match(files.checks, /COMPARATIVE_ONLY/);
  assert.match(files.checks, /Add another policy question/);
  assert.match(files.checks, /disabled=\{pack\.id==="aba-model"\}/);
});

test("the check UI renders pack-defined conflict facts without inventing answers", () => {
  for (const marker of ["Conflict-clearance facts", "Unknown / not answered", "pack.manifest.factDefinitions"]) assert.ok(files.checks.includes(marker));
  for (const marker of ["Has responsible Delaware counsel been confirmed?", "Will a lawyer not admitted in Delaware appear?", "Outside lawyer’s pro hac vice status"]) assert.ok(files.policySchema.includes(marker));
});

test("policy results expose version, authority posture, citation, and source", () => {
  assert.match(files.checks, /selection\.authorityStatus/);
  assert.match(files.checks, /finding\.packVersion/);
  assert.match(files.checks, /href=\{finding\.sourceUrl\}/);
  assert.match(files.checks, /finding\.unknownQuestions/);
});

test("the knowledge surface inventories installed policy packs", () => {
  assert.match(files.checks, /Installed legal authority packs/);
  assert.match(files.checks, /pack\.contentHash\.slice/);
  assert.match(files.checks, /pack\.effectiveFrom/);
  assert.match(files.checks, /href=\{pack\.sourceUrl\}/);
  assert.match(files.checks, /Review validation pending/);
  assert.match(files.checks, /clearance checks/);
  assert.match(files.checks, /typed facts/);
});

test("traffic lights always expose their state as visible text", () => {
  assert.match(files.primitives, /compact\?state:copy/);
});

test("review count does not alter the navigation control's accessible name", () => {
  assert.match(files.app, /<b aria-hidden="true">\{data\.stats\.yellow\}<\/b>/);
});

test("modal announces itself, its title, and modality", () => {
  assert.match(files.primitives, /role="dialog" aria-modal="true" aria-labelledby="modal-title"/);
});

test("modal supports Escape dismissal", () => {
  assert.match(files.primitives, /event\.key\s*===\s*"Escape"/);
  assert.match(files.primitives, /document\.addEventListener\("keydown",close\)/);
  assert.match(files.review, /useEscapeClose\(onClose\)/);
});

test("modal and case drawer contain keyboard focus", () => {
  assert.match(files.primitives, /event\.key !== "Tab"/);
  assert.match(files.primitives, /document\.activeElement===last/);
  assert.match(files.review, /containDialogFocus\(event,drawer\.current\)/);
});

test("modal moves focus inside and restores previous focus", () => {
  assert.match(files.primitives, /dialog\.current\?\.focus\(\)/);
  assert.match(files.primitives, /previous\?\.focus\(\)/);
  assert.match(files.primitives, /tabIndex=\{-1\}/);
});

for (const label of ["Open navigation", "Close navigation", "Close case", "Close"]) {
  test(`icon-only control has accessible label ${label}`, () => {
    assert.ok(allUi.includes(`aria-label="${label}"`));
  });
}

test("case drawer is announced as a modal dialog", () => {
  assert.match(files.review, /role="dialog" aria-modal="true" aria-labelledby="case-title"/);
  assert.match(files.review, /drawer\.current\?\.focus\(\)/);
});

test("loading state announces asynchronous progress", () => {
  assert.match(files.app, /className="loading-screen" aria-live="polite"/);
});

test("fatal and in-page errors are announced", () => {
  assert.match(files.app, /role="alert"/);
  assert.match(files.data, /role="alert"/);
});

test("successful saves use a polite status region", () => {
  assert.match(files.app, /className="toast" role="status" aria-live="polite"/);
});

test("dark mode initializes before interactive rendering", () => {
  assert.match(files.layout, /strategy="beforeInteractive"/);
  assert.match(files.layout, /prefers-color-scheme: dark/);
});

test("dark mode persists an explicit choice", () => {
  assert.match(files.app, /localStorage\.setItem\(THEME_KEY,next\)/);
  assert.match(files.app, /document\.documentElement\.dataset\.theme=theme/);
});

test("theme toggle has a state-dependent accessible label", () => {
  assert.match(files.app, /aria-label=\{`Use \$\{theme==="dark"\?"light":"dark"\} mode`\}/);
});

test("development identity persists through its same-site cookie", () => {
  assert.match(files.app, /interlocks-dev-account=/);
  assert.match(files.app, /initialDemoAccount/);
  assert.match(files.app, /decodeURIComponent\(encoded\)/);
});

test("demo account labels agree with seeded roles and names", () => {
  for (const label of ["Maya Chen — Member", "Daniel Ortiz — Firm admin", "Jordan Bell — Portable ledger"]) assert.ok(files.app.includes(label));
});

test("view-as sessions are visibly read-only and commands refuse mutation", () => {
  assert.match(files.app, /if\(data\.viewAs\)throw new Error\("View-as sessions are read-only"\)/);
  assert.match(files.app, /Read-only view as/);
});

test("document UI sends the repository's bytesBase64 contract", () => {
  assert.match(files.checks, /values\.bytesBase64=/);
  assert.doesNotMatch(files.checks, /values\.base64=/);
  assert.match(files.checks, /activeMode==="document"\?"document\.upload"/);
});

test("workspace export links preserve the selected workspace", () => {
  assert.match(files.data, /\/api\/export\?workspace=\$\{data\.workspace\?\.id/);
  assert.doesNotMatch(files.data, /workspaceId=\$\{data\.workspace/);
});

test("invitation UI submits the selected role as a roles array", () => {
  assert.match(files.portfolio, /roles:\[String\(raw\.role\)\]/);
  assert.match(files.portfolio, /delete values\.role/);
});

test("disclosure form requires person, matter, entity, relationship, and description", () => {
  for (const field of ["personId", "matterId", "entityId", "relationshipType", "description"]) {
    assert.match(files.review, new RegExp(`name=\"${field}\" required`));
  }
});

test("human determination form records rationale, authority, jurisdiction, owner, and deadline", () => {
  for (const field of ["disposition", "rationale", "ruleBasis", "jurisdiction", "ownerPersonId", "dueAt"]) assert.ok(files.review.includes(`name="${field}"`));
});

test("consent form warns that consent does not clear a case", () => {
  assert.match(files.review, /Recording consent never clears the case automatically/);
});

test("screen form warns that a screen is not a machine cure", () => {
  assert.match(files.review, /A screen is operational evidence, not a machine cure/);
});

test("conflict-check result explicitly disclaims a legal conclusion", () => {
  assert.match(files.checks, /not machine-made legal conclusions/);
});

test("portable ledger explains the tenant boundary on departure", () => {
  assert.match(files.ledger, /It does not transfer matters, review notes, consents, documents/);
});

test("associated-person request records a bounded disclosure scope", () => {
  assert.ok(files.ledger.includes('name="disclosureScope"'));
  assert.match(files.ledger, /Bounded associated-person requests/);
});

test("family surface exposes both required operating models", () => {
  assert.match(files.ledger, /Two family models, both first-class/);
  assert.match(files.ledger, /Direct declaration/);
  assert.match(files.ledger, /Linked Interlocks accounts/);
  assert.match(files.ledger, /No account required/);
  assert.match(files.ledger, /Mutual consent/);
});

test("direct family declaration collects identity, relationship, provenance, dates, and scope", () => {
  for (const field of ["associatedPersonName","relationshipType","primaryProfession","provenance","effectiveFrom","effectiveTo","disclosureScope"]) assert.ok(files.ledger.includes(`name="${field}"`));
  assert.match(files.ledger, /MATCH_AND_RELATIONSHIP/);
  assert.match(files.ledger, /CONFLICT_CHECK_ONLY/);
});

test("declared family interests collect entity and involvement without requiring an account", () => {
  for (const field of ["entityName","entityKind","involvement","description"]) assert.ok(files.ledger.includes(`name="${field}"`));
  assert.match(files.ledger, /Microsoft Corporation/);
  assert.match(files.ledger, /Stop sharing/);
  assert.match(files.ledger, /End association/);
});

test("linked family accounts are explicitly consent-bound, one-hop, and revocable", () => {
  for (const marker of ["Consent-bound account link","one-hop entity matching","does not expose their ledger entries","recursively inspect their associations","Acceptance authorizes reciprocal entity matching only","Revoke link"]) assert.ok(files.ledger.includes(marker));
  assert.match(files.ledger, /ENTITY_MATCH_ONLY|entity-match only/i);
  assert.match(files.ledger, /underlying account history remains private/i);
});

test("family link workflow supports request, acceptance, decline, and revocation", () => {
  for (const command of ["family.link.request","family.link.respond","family.link.revoke"]) assert.ok(files.ledger.includes(command));
  for (const response of ["ACCEPT","DECLINE"]) assert.ok(files.ledger.includes(`response:"${response}"`));
  assert.match(files.ledger, /targetEmail/);
  assert.match(files.ledger, /expiresInDays/);
});

test("conflict checks accept private subjects and explicit covered people", () => {
  assert.match(files.checks, /name="subjectName"/);
  assert.match(files.checks, /Enter any person or organization/);
  assert.match(files.checks, /Covered people to cross-reference/);
  assert.match(files.checks, /participatingPersonIds:participants/);
  assert.match(files.checks, /active consent-linked accounts/);
});

test("demo personas expose the declared-parent and linked-spouse stories", () => {
  assert.match(files.app, /Nina Basu — Linked spouse/);
  assert.match(files.app, /Maya Chen — Member · declared parent/);
});

test("family layouts adapt across tablet and mobile breakpoints", () => {
  assert.match(files.styles, /\.family-overview/);
  assert.match(files.styles, /\.family-interest/);
  assert.match(files.styles, /\.covered-people/);
  assert.match(files.styles, /@media\(max-width:900px\)\{\.covered-people/);
  assert.match(files.styles, /@media\(max-width:580px\)\{\.family-overview/);
});

test("CSV interface exposes all supported import aggregates", () => {
  for (const type of ["ENTITIES", "ALIASES", "MATTERS", "PARTIES", "RELATIONSHIPS", "LEDGER_ENTRIES"]) assert.ok(files.data.includes(`<option>${type}</option>`));
});

test("CSV interface separates validation preview from commit", () => {
  assert.match(files.data, /command\("import\.preview"/);
  assert.match(files.data, /command\("import\.commit"/);
  assert.match(files.data, /Commit is all-or-nothing/);
});

test("audit UI searches actor, action, authority, type, and identifier", () => {
  for (const field of ["event.action", "event.actorName", "event.resourceType", "event.resourceId", "event.authorityUsed"]) assert.ok(files.data.includes(field));
});

test("administrative view-as is explicit and audited in product copy", () => {
  assert.match(files.admin, /View-as is explicit, read-only, reasoned, and audited/);
});

test("invitation acceptance describes identity and membership separation", () => {
  assert.match(files.invitation, /Your Account and Person remain distinct/);
});

test("responsive stylesheet contains desktop, tablet, and mobile adaptations", () => {
  assert.match(files.styles, /@media\(max-width:1200px\)/);
  assert.match(files.styles, /@media\(max-width:900px\)/);
  assert.match(files.styles, /@media\(max-width:580px\)/);
  assert.match(files.styles, /grid-template-columns:repeat\(2,minmax\(0,1fr\)\)/);
});

test("keyboard focus is visibly styled", () => {
  assert.match(files.styles, /:focus-visible/);
});

test("dark palette overrides shared surfaces and explicitly treats controls and navigation", () => {
  assert.match(files.styles, /html\[data-theme="dark"\]\{[^}]*--surface:#142135;[^}]*--canvas:#0b1422;/);
  assert.match(files.styles, /html\[data-theme="dark"\] \.sidebar\{/);
  assert.match(files.styles, /html\[data-theme="dark"\] select,html\[data-theme="dark"\] input,html\[data-theme="dark"\] textarea\{/);
  for (const selector of [".card", ".modal", ".record"]) assert.match(files.styles, new RegExp(`\\${selector}\\{[^}]*var\\(--surface\\)|\\${selector}\\{[^}]*transparent`));
});

test("UI source avoids dangerous raw HTML and executable string evaluation", () => {
  assert.doesNotMatch(allUi, /dangerouslySetInnerHTML|\beval\(|new Function/);
});

test("API command handler uses one authenticated actor for every command", () => {
  assert.match(files.commands, /const actor = await resolveRequestActor\(request, repository\)/);
  assert.equal((files.commands.match(/resolveRequestActor/g) || []).length, 2);
});

test("snapshot API is dynamic and uncacheable", () => {
  assert.match(files.snapshotRoute, /dynamic = "force-dynamic"/);
  assert.match(files.snapshotRoute, /"Cache-Control": "no-store"/);
});

test("health API degrades to a no-store 503 response", () => {
  assert.match(files.healthRoute, /status: 503/);
  assert.match(files.healthRoute, /"cache-control": "no-store"/);
});

test("CSV export quotes embedded double quotes safely", () => {
  assert.match(files.exportRoute, /replaceAll\('\"', '\"\"'\)/);
  assert.match(files.exportRoute, /text\/csv; charset=utf-8/);
});

for (const header of ["Content-Security-Policy", "Referrer-Policy", "X-Content-Type-Options", "X-Frame-Options", "Permissions-Policy", "Cross-Origin-Opener-Policy", "Strict-Transport-Security"]) {
  test(`Next.js emits ${header}`, () => assert.ok(files.nextConfig.includes(`key: "${header}"`)));
}

test("content security policy rejects framing and object embedding", () => {
  assert.match(files.nextConfig, /object-src 'none'/);
  assert.match(files.nextConfig, /frame-ancestors 'none'/);
});

test("production metadata contains no internal preview marker", () => {
  assert.doesNotMatch(files.layout, /codex-preview/);
});
