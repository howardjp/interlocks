import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryObjectStore } from "../lib/storage/object-store.mjs";
import { SqliteInterlocksRepository } from "../lib/persistence/sqlite-interlocks-repository.mjs";

function repository() { return new SqliteInterlocksRepository(":memory:", { objectStore: new InMemoryObjectStore() }); }

test("versioned migrations create a connected person-first workspace without numeric triage", (t) => {
  const repo = repository(); t.after(() => repo.close()); const snapshot = repo.getSnapshot();
  assert.deepEqual(repo.migrationState().map((item) => item.version), [1, 2, 3, 4, 5, 6]);
  assert.equal(snapshot.workspace.id, "ws-northstar");
  assert.equal(snapshot.memberships.length, 6);
  assert.equal(snapshot.cases.length, 5);
  assert.deepEqual(snapshot.stats, { openCases: 4, red: 2, yellow: 2, green: 1, openControls: 5, currentBillableSeats: 6 });
  assert.ok(snapshot.cases.every((item) => !("score" in item)));
});

test("Person, Account, AuthIdentity, and membership have independent lifecycles", (t) => {
  const repo = repository(); t.after(() => repo.close());
  repo.database.prepare("INSERT INTO auth_identities (id,account_id,provider,issuer,provider_subject,email_at_link_time,created_at) VALUES ('auth-alt','acct-jordan','oidc','https://issuer.example','sub-jordan','jordan.alt@example.org','2026-08-28T00:00:00Z')").run();
  assert.equal(repo.resolveExternalIdentity({ provider: "oidc", issuer: "https://issuer.example", providerSubject: "sub-jordan" }).personId, "p-jordan");
  repo.updateMembership("acct-daniel", "ws-northstar", "mem-jordan-a", { status: "DEPARTED" });
  assert.equal(repo.getActor("acct-jordan").accountStatus, "ACTIVE");
  assert.equal(repo.currentBillableSeats("ws-northstar"), 5);
  assert.throws(() => repo.getSnapshot("acct-jordan", "ws-northstar"), /not authorized/);
  assert.ok(repo.database.prepare("SELECT 1 FROM review_cases WHERE workspace_id='ws-northstar'").get());
});

test("workspace authorization blocks cross-tenant reads and administration", (t) => {
  const repo = repository(); t.after(() => repo.close());
  assert.throws(() => repo.getSnapshot("acct-daniel", "ws-blue-ridge"), /not authorized/);
  assert.throws(() => repo.createInvitation("acct-daniel", "ws-blue-ridge", { email: "new@example.org" }), /not authorized/);
  assert.throws(() => repo.createInvitation("acct-priya", "ws-northstar", { email: "member-cannot-invite@example.org" }), /not authorized/);
  assert.equal(repo.getSnapshot("acct-alex", "ws-blue-ridge").workspace.id, "ws-blue-ridge");
  const admin = repo.globalAdminSnapshot("acct-alex");
  assert.equal(admin.workspaces.length, 2);
  assert.equal(repo.database.prepare("SELECT authority_used AS authority FROM audit_events WHERE action='admin.console_viewed' ORDER BY occurred_at DESC").get().authority, "SUPERADMIN");
  const viewAs = repo.getSnapshot("acct-alex", null, { viewAsAccountId: "acct-maya", reason: "Support request 42" });
  assert.deepEqual({ name: viewAs.actor.name, readOnly: viewAs.viewAs.readOnly }, { name: "Dr. Maya Chen", readOnly: true });
  assert.equal(repo.database.prepare("SELECT reason FROM audit_events WHERE action='view_as.started' ORDER BY occurred_at DESC").get().reason, "Support request 42");
  assert.throws(() => repo.database.prepare("DELETE FROM audit_events WHERE action='view_as.started'").run(), /immutable/);
});

test("invite-only registration rejects an unknown external identity", (t) => {
  const repo = repository(); t.after(() => repo.close());
  assert.throws(() => repo.resolveExternalIdentity({ provider:"oidc", issuer:"https://issuer.example", providerSubject:"unknown-subject", email:"unknown@example.org", displayName:"Unknown Person" }, { registrationMode:"INVITE_ONLY" }), /invitation is required/i);
});

test("invitation acceptance and role assignment drive seats without defining membership", (t) => {
  const repo = repository(); t.after(() => repo.close());
  const invitation = repo.createInvitation("acct-daniel", "ws-northstar", { email: "nina.basu@example.org", roles: ["MEMBER"] });
  assert.equal(repo.currentBillableSeats("ws-northstar"), 6);
  const accepted = repo.acceptInvitation("acct-nina", invitation.token);
  assert.equal(repo.currentBillableSeats("ws-northstar"), 7);
  repo.updateMembership("acct-daniel", "ws-northstar", accepted.membershipId, { roles: ["MEMBER", "REVIEWER"] });
  assert.deepEqual(repo.getActor("acct-nina").memberships.find((item) => item.id === accepted.membershipId).roles, ["MEMBER", "REVIEWER"]);
});

test("documents are immutable first-class evidence with many-to-many links", (t) => {
  const repo = repository(); t.after(() => repo.close());
  const secondAssertion = repo.createAssertion("acct-liam", "ws-northstar", { subjectType: "PERSON", subjectId: "p-maya", predicate: "BOARD_ROLE_CURRENT", objectText: "Board role remained current on review date", provenance: "Reviewer interview" });
  const first = repo.uploadDocument("acct-liam", "ws-northstar", {
    filename: "waiver.txt", mediaType: "text/plain", bytes: Buffer.from("signed waiver v1"),
    attachments: [{ resourceType: "ENTITY", resourceId: "o-meridian" }],
    evidenceLinks: [
      { assertionId: "assert-r-maya-meridian", role: "SUPPORTS", pageStart: 1 },
      { assertionId: secondAssertion.id, role: "QUALIFIES", section: "Scope" },
    ],
  });
  repo.uploadDocument("acct-liam", "ws-northstar", { filename: "board-record.txt", mediaType: "text/plain", bytes: Buffer.from("board record"), evidenceLinks: [{ assertionId: "assert-r-maya-meridian", role: "SUPPORTS" }] });
  assert.equal(repo.database.prepare("SELECT COUNT(*) AS count FROM evidence_links WHERE assertion_id='assert-r-maya-meridian'").get().count, 2);
  assert.equal(repo.database.prepare("SELECT COUNT(*) AS count FROM evidence_links WHERE document_id=?").get(first.id).count, 2);
  assert.equal(repo.readDocument("acct-liam", first.id, "ws-northstar").bytes.toString(), "signed waiver v1");
  assert.throws(() => repo.objectStore.putImmutable(Buffer.from("signed waiver v1")) && repo.objectStore.get("missing"), /not found/);
});

test("point-in-time inferences supersede without rewriting history", (t) => {
  const repo = repository(); t.after(() => repo.close());
  const first = repo.createInference("acct-liam", "ws-northstar", { subjectType: "ENTITY", subjectId: "o-meridian", inferenceType: "IDENTITY_RESOLUTION", conclusion: "Likely the same entity as Meridian AI", matchConfidence: "STRONG", evidenceSummary: "Alias and address agree" });
  const before = repo.database.prepare("SELECT * FROM inferences WHERE id=?").get(first.id);
  repo.uploadDocument("acct-liam", "ws-northstar", { filename: "filing.txt", mediaType: "text/plain", bytes: Buffer.from("distinct registration") });
  const second = repo.createInference("acct-liam", "ws-northstar", { subjectType: "ENTITY", subjectId: "o-meridian", inferenceType: "IDENTITY_RESOLUTION", conclusion: "Likely distinct entities", matchConfidence: "STRONG", evidenceSummary: "New filing has a distinct registration", supersedesId: first.id });
  assert.deepEqual(repo.database.prepare("SELECT * FROM inferences WHERE id=?").get(first.id), before);
  assert.equal(repo.database.prepare("SELECT supersedes_id AS value FROM inferences WHERE id=?").get(second.id).value, first.id);
  assert.throws(() => repo.database.prepare("UPDATE inferences SET conclusion='rewritten' WHERE id=?").run(first.id), /immutable/);
});

test("deterministic checks explain exact, alias, related, property, and portable-ledger hits", (t) => {
  const repo = repository(); t.after(() => repo.close());
  const check = repo.createConflictCheck("acct-liam", "ws-northstar", {
    matterId: "m-aster", participatingPersonIds: ["p-jordan"], subjects: [
      { name: "Meridian AI", role: "PROSPECTIVE_CLIENT" },
      { name: "Solaris Dynamics", role: "RELATED_PARTY" },
      { name: "123 Main Street", role: "PROPERTY" },
    ],
  });
  assert.equal(check.workflowState, "YELLOW");
  assert.ok(check.hits.some((item) => item.matchedEntityName === "Meridian Analytics" && item.matchConfidence === "EXACT"));
  assert.ok(check.hits.some((item) => item.matchedEntityName === "Meridian Holdings, Inc." && item.matchConfidence === "RELATED"));
  assert.ok(check.hits.some((item) => item.matchedEntityName === "Solaris Dynamics" && item.explanation.source === "LEDGER_ENTRY"));
  assert.ok(check.hits.some((item) => item.matchedEntityName === "123 Main Street"));
  assert.ok(check.hits.every((item) => item.explanation.statement.includes("no legal conclusion")));
  const revision = repo.corpusRevision();
  repo.createAssertion("acct-liam", "ws-northstar", { subjectType: "ENTITY", subjectId: "o-meridian", predicate: "NEW_FACT", objectText: "New fact", provenance: "New filing" });
  const historical = repo.database.prepare("SELECT corpus_revision AS revision FROM conflict_checks WHERE id=?").get(check.id);
  assert.equal(historical.revision, revision);
  assert.equal(repo.getSnapshot("acct-liam", "ws-northstar").checks.find((item) => item.id === check.id).reReviewSuggested, true);
});

test("human disposition, consent, screen, and controls remain separate", (t) => {
  const repo = repository(); t.after(() => repo.close());
  const determined = repo.recordCaseAction("c-0039", { type: "determination", disposition: "CONSENT_REQUIRED", rationale: "The affected client's informed consent is required.", ruleBasis: "Rule 1.7", jurisdiction: "District of Columbia" }, "acct-liam");
  assert.equal(determined.workflowState, "YELLOW");
  const consent = repo.createConsent("acct-liam", "c-0039", { affectedEntityId: "o-easton", status: "OBTAINED", consentType: "INFORMED_CONSENT", evidenceRequirement: "CONFIRMED_IN_WRITING", scope: "Helios consortium representation" });
  assert.equal(consent.workflowState, "YELLOW");
  const screen = repo.createScreen("acct-liam", "c-0041", { screenedPersonId: "p-maya", effectiveAt: "2026-08-28T12:00:00Z", restrictions: "No matter access or participation", feeRestrictions: "No fee allocation", noticeRequirements: "Written notice to affected client", status: "ACTIVE" });
  assert.equal(screen.status, "ACTIVE");
  assert.notEqual(repo.database.prepare("SELECT workflow_state AS state FROM review_cases WHERE id='c-0041'").get().state, "GREEN");
});

test("portable history survives departure while firm-private facts do not travel", (t) => {
  const repo = repository(); t.after(() => repo.close());
  repo.updateMembership("acct-daniel", "ws-northstar", "mem-jordan-a", { status: "DEPARTED" });
  const invitation = repo.createInvitation("acct-alex", "ws-blue-ridge", { email: "jordan.bell@example.org", roles: ["MEMBER"] });
  repo.acceptInvitation("acct-jordan", invitation.token);
  const personal = repo.exportData("acct-jordan", null, "personal");
  assert.ok(personal.entries.some((item) => item.entity_name === "Solaris Dynamics"));
  assert.ok(personal.entries.every((item) => item.disclosure_class !== "FIRM_ONLY"));
  const newFirmCheck = repo.createConflictCheck("acct-jordan", "ws-blue-ridge", { participatingPersonIds: ["p-jordan"], subjects: [{ name: "Solaris Dynamics", role: "PROSPECTIVE_CLIENT" }] });
  assert.ok(newFirmCheck.hits.some((item) => item.explanation.source === "LEDGER_ENTRY"));
  assert.equal(repo.getSnapshot("acct-jordan", "ws-blue-ridge").relationships.length, 0);
});

test("canonical CSV import validates fully before transactional commit", (t) => {
  const repo = repository(); t.after(() => repo.close());
  const invalid = repo.previewImport("acct-daniel", "ws-northstar", { type: "ENTITIES", csv: "name,kind\nAcme," });
  assert.equal(invalid.valid, false);
  assert.throws(() => repo.commitImport("acct-daniel", "ws-northstar", { type: "ENTITIES", csv: "name,kind\nAcme," }), /nothing was committed/);
  const valid = repo.commitImport("acct-daniel", "ws-northstar", { type: "ENTITIES", filename: "entities.csv", csv: "name,kind,jurisdiction\nAcme Corp,ORGANIZATION,Delaware" });
  assert.deepEqual({ accepted: valid.accepted, rejected: valid.rejected }, { accepted: 1, rejected: 0 });
});
