import assert from "node:assert/strict";
import test from "node:test";

import { resetConfigForTests } from "../lib/config.mjs";
import { SqliteInterlocksRepository } from "../lib/persistence/sqlite-interlocks-repository.mjs";
import { InMemoryObjectStore } from "../lib/storage/object-store.mjs";

function open(t, options = {}) {
  const repository = new SqliteInterlocksRepository(":memory:", { objectStore: new InMemoryObjectStore(), ...options });
  t.after(() => repository.close());
  return repository;
}

function scalar(repository, sql, ...values) {
  return repository.database.prepare(sql).get(...values);
}

test("seeded snapshot exposes the complete connected aggregate", (t) => {
  const repository = open(t);
  const snapshot = repository.getSnapshot();
  for (const collection of ["entities", "matters", "relationships", "cases", "controls", "assertions", "memberships", "audit"]) {
    assert.ok(Array.isArray(snapshot[collection]) && snapshot[collection].length > 0, collection);
  }
  assert.ok(Array.isArray(snapshot.ledger));
  assert.equal(snapshot.workspace.id, "ws-northstar");
  assert.equal(snapshot.actor.accountId, "acct-alex");
  assert.equal(snapshot.realActor.accountId, "acct-alex");
  assert.equal(snapshot.viewAs, null);
});

test("ordinary members cannot see migration administration", (t) => {
  const snapshot = open(t).getSnapshot("acct-priya", "ws-northstar");
  assert.deepEqual(snapshot.migrations, []);
});

test("superadmins can enumerate every active workspace", (t) => {
  const snapshot = open(t).getSnapshot("acct-alex");
  assert.deepEqual(snapshot.availableWorkspaces.map((item) => item.workspaceId), ["ws-blue-ridge", "ws-northstar"]);
});

test("ordinary actors can enumerate only their memberships", (t) => {
  const snapshot = open(t).getSnapshot("acct-daniel");
  assert.deepEqual(snapshot.availableWorkspaces.map((item) => item.workspaceId), ["ws-northstar"]);
});

test("a second workspace snapshot does not leak first-workspace cases", (t) => {
  const snapshot = open(t).getSnapshot("acct-alex", "ws-blue-ridge");
  assert.equal(snapshot.workspace.id, "ws-blue-ridge");
  assert.deepEqual(snapshot.cases, []);
  assert.deepEqual(snapshot.matters, []);
  assert.deepEqual(snapshot.relationships, []);
});

test("view-as changes the effective actor but preserves the real actor", (t) => {
  const repository = open(t);
  const snapshot = repository.getSnapshot("acct-alex", "ws-northstar", { viewAsAccountId: "acct-priya", reason: "Support 17" });
  assert.equal(snapshot.actor.accountId, "acct-priya");
  assert.equal(snapshot.realActor.accountId, "acct-alex");
  assert.equal(snapshot.viewAs.readOnly, true);
  assert.equal(scalar(repository, "SELECT reason FROM audit_events WHERE action='view_as.started' ORDER BY rowid DESC").reason, "Support 17");
});

test("ordinary actors cannot start view-as sessions", (t) => {
  assert.throws(() => open(t).getSnapshot("acct-priya", null, { viewAsAccountId: "acct-maya" }), /not authorized/);
});

test("unknown accounts are rejected", (t) => {
  assert.throws(() => open(t).getActor("acct-missing"), /Account not found/);
});

test("linked external identity updates its authentication timestamp", (t) => {
  const repository = open(t);
  repository.database.prepare("UPDATE auth_identities SET last_authenticated_at=NULL WHERE id='auth-acct-maya'").run();
  const actor = repository.resolveExternalIdentity({ issuer: "interlocks-local", providerSubject: "acct-maya" });
  assert.equal(actor.accountId, "acct-maya");
  assert.ok(scalar(repository, "SELECT last_authenticated_at AS value FROM auth_identities WHERE id='auth-acct-maya'").value);
});

test("public registration creates identity records without inventing membership", (t) => {
  const repository = open(t);
  const actor = repository.resolveExternalIdentity({ provider: "oidc", issuer: "https://issuer.example", providerSubject: "subject-new", email: "new@example.org", displayName: "New Person" }, { registrationMode: "PUBLIC" });
  assert.equal(actor.name, "New Person");
  assert.equal(actor.accountStatus, "ACTIVE");
  assert.deepEqual(actor.memberships, []);
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM auth_identities WHERE account_id=?", actor.accountId).count, 1);
});

test("invited account identity linking reuses the existing person", (t) => {
  const repository = open(t);
  repository.database.prepare("UPDATE accounts SET status='INVITED' WHERE id='acct-nina'").run();
  const actor = repository.resolveExternalIdentity({ provider: "oidc", issuer: "https://issuer.example", providerSubject: "nina-subject", email: "NINA.BASU@EXAMPLE.ORG", displayName: "Different Display Name" }, { registrationMode: "INVITE_ONLY" });
  assert.equal(actor.accountId, "acct-nina");
  assert.equal(actor.personId, "p-nina");
});

test("workspace creation is superadmin-only and audited", (t) => {
  const repository = open(t);
  assert.throws(() => repository.createWorkspace("acct-daniel", { name: "Forbidden Workspace" }), /not authorized/);
  const created = repository.createWorkspace("acct-alex", { name: "Howard Ethics Lab", jurisdiction: "Maryland" });
  assert.equal(scalar(repository, "SELECT name,jurisdiction FROM workspaces JOIN entities ON entities.id=workspaces.organization_entity_id WHERE workspaces.id=?", created.id).name, "Howard Ethics Lab");
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM audit_events WHERE action='workspace.created' AND resource_id=?", created.id).count, 1);
});

test("workspace creation rolls back an empty name", (t) => {
  const repository = open(t);
  const before = scalar(repository, "SELECT COUNT(*) AS count FROM workspaces").count;
  assert.throws(() => repository.createWorkspace("acct-alex", { name: "  " }), /Workspace name is required/);
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM workspaces").count, before);
});

test("invitations normalize email, deduplicate roles, and hash the token", (t) => {
  const repository = open(t);
  const invitation = repository.createInvitation("acct-daniel", "ws-northstar", { email: " NINA.BASU@EXAMPLE.ORG ", roles: ["member", "MEMBER", "reviewer"] });
  const stored = scalar(repository, "SELECT email,token_hash AS tokenHash,roles_json AS rolesJson FROM invitations WHERE id=?", invitation.id);
  assert.equal(stored.email, "nina.basu@example.org");
  assert.notEqual(stored.tokenHash, invitation.token);
  assert.deepEqual(JSON.parse(stored.rolesJson), ["MEMBER", "REVIEWER"]);
});

test("invitations reject unsupported roles without inserting a row", (t) => {
  const repository = open(t);
  const before = scalar(repository, "SELECT COUNT(*) AS count FROM invitations").count;
  assert.throws(() => repository.createInvitation("acct-daniel", "ws-northstar", { email: "new@example.org", roles: ["OWNER"] }), /Unsupported workspace role/);
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM invitations").count, before);
});

test("invitation acceptance rejects a token belonging to another account", (t) => {
  const repository = open(t);
  const invitation = repository.createInvitation("acct-daniel", "ws-northstar", { email: "nina.basu@example.org" });
  assert.throws(() => repository.acceptInvitation("acct-maya", invitation.token), /another account/);
});

test("invitation acceptance rejects expired tokens", (t) => {
  const repository = open(t);
  const invitation = repository.createInvitation("acct-daniel", "ws-northstar", { email: "nina.basu@example.org" });
  repository.database.prepare("UPDATE invitations SET expires_at='2000-01-01T00:00:00Z' WHERE id=?").run(invitation.id);
  assert.throws(() => repository.acceptInvitation("acct-nina", invitation.token), /invalid or expired/);
});

test("an accepted invitation cannot be replayed", (t) => {
  const repository = open(t);
  const invitation = repository.createInvitation("acct-daniel", "ws-northstar", { email: "nina.basu@example.org" });
  repository.acceptInvitation("acct-nina", invitation.token);
  assert.throws(() => repository.acceptInvitation("acct-nina", invitation.token), /invalid or expired/);
});

test("membership role updates are atomic on invalid input", (t) => {
  const repository = open(t);
  const before = repository.getActor("acct-maya").memberships.find((item) => item.id === "mem-maya-a").roles;
  assert.throws(() => repository.updateMembership("acct-daniel", "ws-northstar", "mem-maya-a", { roles: ["MEMBER", "OWNER"] }), /Unsupported workspace role/);
  assert.deepEqual(repository.getActor("acct-maya").memberships.find((item) => item.id === "mem-maya-a").roles, before);
});

test("membership departure and reactivation produce balanced seat history", (t) => {
  const repository = open(t);
  repository.updateMembership("acct-daniel", "ws-northstar", "mem-maya-a", { status: "DEPARTED" });
  repository.updateMembership("acct-daniel", "ws-northstar", "mem-maya-a", { status: "ACTIVE" });
  assert.equal(repository.currentBillableSeats("ws-northstar"), 6);
  assert.equal(scalar(repository, "SELECT SUM(delta) AS total FROM seat_events WHERE membership_id='mem-maya-a'").total, 1);
  assert.ok(scalar(repository, "SELECT 1 AS found FROM seat_events WHERE membership_id='mem-maya-a' AND reason='Member reactivated'")?.found);
});

for (const status of ["DEPARTED", "REVOKED"]) {
  test(`membership ${status} removes a current seat`, (t) => {
    const repository = open(t);
    repository.updateMembership("acct-daniel", "ws-northstar", "mem-maya-a", { status });
    assert.equal(repository.currentBillableSeats("ws-northstar"), 5);
  });
}

test("membership updates reject unsupported status", (t) => {
  assert.throws(() => open(t).updateMembership("acct-daniel", "ws-northstar", "mem-maya-a", { status: "PAUSED" }), /Unsupported membership status/);
});

test("membership updates reject resources outside the selected workspace", (t) => {
  assert.throws(() => open(t).updateMembership("acct-alex", "ws-blue-ridge", "mem-maya-a", { status: "REVOKED" }), /Membership not found/);
});

test("superadmin promotion supports email lookup and records before/after authority", (t) => {
  const repository = open(t);
  const result = repository.promoteSuperadmin("maya.chen@example.org", "Pilot administrator");
  assert.equal(result.accountId, "acct-maya");
  assert.equal(repository.getActor("acct-maya").platformRole, "SUPERADMIN");
  const event = scalar(repository, "SELECT before_json AS beforeJson,after_json AS afterJson,reason FROM audit_events WHERE action='platform_role.granted' AND resource_id='acct-maya'");
  assert.equal(JSON.parse(event.beforeJson).platformRole, "USER");
  assert.equal(JSON.parse(event.afterJson).platformRole, "SUPERADMIN");
  assert.equal(event.reason, "Pilot administrator");
});

test("superadmin promotion rejects unknown identifiers", (t) => {
  assert.throws(() => open(t).promoteSuperadmin("missing@example.org"), /Account not found/);
});

for (const [inputKind, storedKind] of [["organization", "ORGANIZATION"], ["government", "GOVERNMENT_BODY"], ["property", "PROPERTY"], ["trust", "TRUST"], ["estate", "ESTATE"], ["other", "OTHER"]]) {
  test(`entity creation stores ${inputKind} as ${storedKind}`, (t) => {
    const repository = open(t);
    const entity = repository.createEntity("acct-daniel", "ws-northstar", { name: `${storedKind} test`, kind: inputKind });
    assert.equal(scalar(repository, "SELECT kind FROM entities WHERE id=?", entity.id).kind, storedKind);
  });
}

test("entity creation normalizes aliases and advances corpus revision", (t) => {
  const repository = open(t);
  const before = repository.corpusRevision();
  const entity = repository.createEntity("acct-daniel", "ws-northstar", { name: "Acme Holdings, Inc.", aliases: ["Acme & Co."] });
  assert.equal(scalar(repository, "SELECT normalized_alias AS value FROM entity_aliases WHERE entity_id=?", entity.id).value, "acme and");
  assert.equal(repository.corpusRevision(), before + 1);
});

test("entity creation rejects unsupported kinds and members without management authority", (t) => {
  const repository = open(t);
  assert.throws(() => repository.createEntity("acct-daniel", "ws-northstar", { name: "Bad", kind: "PLANET" }), /Unsupported entity kind/);
  assert.throws(() => repository.createEntity("acct-priya", "ws-northstar", { name: "Forbidden" }), /not authorized/);
});

test("matter creation stores parties and normalized workflow fields", (t) => {
  const repository = open(t);
  const matter = repository.createMatter("acct-daniel", "ws-northstar", { code: "NEW-1", title: "New engagement", matterType: "legal representation", stage: "conflict review", representationStatus: "prospective", parties: [{ entityId: "o-meridian", role: "client", provenance: "Intake" }] });
  const stored = scalar(repository, "SELECT matter_type AS matterType,stage,representation_status AS representationStatus FROM matters WHERE id=?", matter.id);
  assert.deepEqual({ ...stored }, { matterType: "LEGAL_REPRESENTATION", stage: "CONFLICT_REVIEW", representationStatus: "PROSPECTIVE" });
  assert.equal(scalar(repository, "SELECT role FROM matter_parties WHERE matter_id=?", matter.id).role, "CLIENT");
});

test("matter creation rolls back duplicate workspace codes", (t) => {
  const repository = open(t);
  const before = scalar(repository, "SELECT COUNT(*) AS count FROM matters").count;
  assert.throws(() => repository.createMatter("acct-daniel", "ws-northstar", { code: "AST-26-17", title: "Duplicate" }), /UNIQUE/);
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM matters").count, before);
});

test("assertion supersession is immutable and workspace-scoped", (t) => {
  const repository = open(t);
  const first = repository.createAssertion("acct-liam", "ws-northstar", { subjectType: "entity", subjectId: "o-meridian", predicate: "ownership", objectText: "Old fact" });
  const second = repository.createAssertion("acct-liam", "ws-northstar", { subjectType: "entity", subjectId: "o-meridian", predicate: "ownership", objectText: "New fact", supersedesId: first.id });
  assert.equal(scalar(repository, "SELECT status FROM assertions WHERE id=?", first.id).status, "SUPERSEDED");
  assert.equal(scalar(repository, "SELECT supersedes_id AS value FROM assertions WHERE id=?", second.id).value, first.id);
  assert.throws(() => repository.createAssertion("acct-alex", "ws-blue-ridge", { subjectType: "entity", subjectId: "ent-blue-ridge", predicate: "ownership", objectText: "Cross tenant", supersedesId: first.id }), /Superseded assertion not found/);
});

test("assertions validate required semantic fields", (t) => {
  const repository = open(t);
  for (const input of [
    { subjectId: "o-meridian", predicate: "fact" },
    { subjectType: "ENTITY", predicate: "fact" },
    { subjectType: "ENTITY", subjectId: "o-meridian" },
  ]) assert.throws(() => repository.createAssertion("acct-liam", "ws-northstar", input), /required/);
});

test("inference supersession rejects missing and cross-workspace history", (t) => {
  const repository = open(t);
  assert.throws(() => repository.createInference("acct-liam", "ws-northstar", { subjectType: "ENTITY", subjectId: "o-meridian", inferenceType: "IDENTITY", conclusion: "Same", evidenceSummary: "Evidence", supersedesId: "missing" }), /Superseded inference not found/);
  const first = repository.createInference("acct-liam", "ws-northstar", { subjectType: "ENTITY", subjectId: "o-meridian", inferenceType: "IDENTITY", conclusion: "Same", evidenceSummary: "Evidence" });
  assert.throws(() => repository.createInference("acct-alex", "ws-blue-ridge", { subjectType: "ENTITY", subjectId: "ent-blue-ridge", inferenceType: "IDENTITY", conclusion: "Different", evidenceSummary: "Evidence", supersedesId: first.id }), /Superseded inference not found/);
});

test("document upload rejects empty bytes without storing metadata", (t) => {
  const repository = open(t);
  assert.throws(() => repository.uploadDocument("acct-liam", "ws-northstar", { filename: "empty.txt", mediaType: "text/plain", bytes: Buffer.alloc(0) }), /bytes are required/);
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM documents").count, 0);
});

test("document attachments and evidence must remain inside the document workspace", (t) => {
  const repository = open(t);
  const crossWorkspaceAssertion = repository.createAssertion("acct-alex", "ws-blue-ridge", { subjectType: "ENTITY", subjectId: "ent-blue-ridge", predicate: "TEST", objectText: "Private" });
  assert.throws(() => repository.uploadDocument("acct-liam", "ws-northstar", { filename: "cross.txt", mediaType: "text/plain", bytes: Buffer.from("cross"), evidenceLinks: [{ assertionId: crossWorkspaceAssertion.id }] }), /workspace boundary/);
  assert.throws(() => repository.uploadDocument("acct-alex", "ws-blue-ridge", { filename: "cross-case.txt", mediaType: "text/plain", bytes: Buffer.from("cross"), attachments: [{ resourceType: "REVIEW_CASE", resourceId: "c-0041" }] }), /workspace boundary/);
});

test("document supersession cannot cross the tenant boundary", (t) => {
  const repository = open(t);
  const first = repository.uploadDocument("acct-liam", "ws-northstar", { filename: "first.txt", mediaType: "text/plain", bytes: Buffer.from("first") });
  assert.throws(() => repository.uploadDocument("acct-alex", "ws-blue-ridge", { filename: "second.txt", mediaType: "text/plain", bytes: Buffer.from("second"), supersedesDocumentId: first.id }), /Superseded document not found/);
  assert.equal(scalar(repository, "SELECT status FROM documents WHERE id=?", first.id).status, "CURRENT");
});

test("document reads are workspace-scoped and audited", (t) => {
  const repository = open(t);
  const document = repository.uploadDocument("acct-liam", "ws-northstar", { filename: "evidence.txt", mediaType: "text/plain", bytes: Buffer.from("evidence") });
  assert.throws(() => repository.readDocument("acct-alex", document.id, "ws-blue-ridge"), /Document not found/);
  assert.equal(repository.readDocument("acct-liam", document.id, "ws-northstar").bytes.toString(), "evidence");
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM audit_events WHERE action='document.viewed' AND resource_id=?", document.id).count, 1);
});

test("documents can attach to every supported workspace-scoped resource kind", (t) => {
  const repository = open(t);
  const check = repository.createConflictCheck("acct-liam", "ws-northstar", { subjects: [{ name: "Meridian AI" }] });
  const hitId = check.hits[0].id;
  const caseId = scalar(repository, "SELECT id FROM review_cases WHERE conflict_check_id=? LIMIT 1", check.id).id;
  repository.recordCaseAction(caseId, { type: "determination", disposition: "CONSENT_REQUIRED", rationale: "Consent analysis" }, "acct-liam");
  const determinationId = scalar(repository, "SELECT id FROM human_determinations WHERE case_id=? ORDER BY rowid DESC", caseId).id;
  const consentId = repository.createConsent("acct-liam", caseId, { scope: "Limited representation" }).id;
  const screenId = repository.createScreen("acct-liam", "c-0041", { screenedPersonId: "p-maya", effectiveAt: "2026-08-28T12:00:00Z", restrictions: "No access" }).id;
  const resources = [
    ["PERSON", "p-maya"], ["ACCOUNT", "acct-maya"], ["ENTITY", "o-meridian"], ["WORKSPACE", "ws-northstar"],
    ["MEMBERSHIP", "mem-maya-a"], ["MATTER", "m-aster"], ["RELATIONSHIP", "r-maya-meridian"],
    ["ASSERTION", "assert-r-maya-meridian"], ["INFERENCE", "inf-0037"], ["CONFLICT_CHECK", check.id],
    ["CONFLICT_HIT", hitId], ["REVIEW_CASE", caseId], ["DETERMINATION", determinationId], ["CONSENT", consentId],
    ["SCREEN", screenId], ["CONTROL", "ctl-01"], ["ASSOCIATED_PERSON_REQUEST", "apr-01"],
    ["IMPORT_BATCH", "import-seed"], ["ADMINISTRATIVE_ACTION", "audit-seed"],
  ];
  const existing = resources.filter(([, resourceId]) => {
    try { repository.assertResource(resources.find((item) => item[1] === resourceId)[0], resourceId, "ws-northstar"); return true; }
    catch { return false; }
  });
  const document = repository.uploadDocument("acct-liam", "ws-northstar", {
    filename: "many-links.txt", mediaType: "text/plain", bytes: Buffer.from("many links"),
    attachments: existing.map(([resourceType, resourceId]) => ({ resourceType, resourceId })),
  });
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM resource_attachments WHERE document_id=?", document.id).count, existing.length);
  assert.ok(existing.length >= 15);
});

test("conflict check requires at least one valid subject", (t) => {
  const repository = open(t);
  assert.throws(() => repository.createConflictCheck("acct-liam", "ws-northstar", { subjects: [] }), /At least one/);
  assert.throws(() => repository.createConflictCheck("acct-liam", "ws-northstar", { subjects: [{ name: " " }] }), /Subject name is required/);
});

test("conflict check rejects a matter from another workspace", (t) => {
  const repository = open(t);
  const matter = repository.createMatter("acct-alex", "ws-blue-ridge", { code: "BR-1", title: "Clinic matter" });
  assert.throws(() => repository.createConflictCheck("acct-liam", "ws-northstar", { matterId: matter.id, subjects: [{ name: "Meridian" }] }), /Matter not found/);
});

test("conflict check with no matches is green and creates no review case", (t) => {
  const repository = open(t);
  const before = scalar(repository, "SELECT COUNT(*) AS count FROM review_cases").count;
  const check = repository.createConflictCheck("acct-liam", "ws-northstar", { subjects: [{ name: "Absolutely Unrecorded Entity" }] });
  assert.equal(check.workflowState, "GREEN");
  assert.deepEqual(check.hits, []);
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM review_cases").count, before);
});

test("private portable-ledger candidates require an active participating person", (t) => {
  const repository = open(t);
  const withoutParticipant = repository.createConflictCheck("acct-liam", "ws-northstar", { subjects: [{ name: "Solaris Dynamics" }] });
  assert.equal(withoutParticipant.hits.some((hit) => hit.matchedEntityName === "Solaris Dynamics"), false);
  const withParticipant = repository.createConflictCheck("acct-liam", "ws-northstar", { participatingPersonIds: ["p-jordan"], subjects: [{ name: "Solaris Dynamics" }] });
  assert.equal(withParticipant.hits.some((hit) => hit.matchedEntityName === "Solaris Dynamics"), true);
  repository.updateMembership("acct-daniel", "ws-northstar", "mem-jordan-a", { status: "DEPARTED" });
  const afterDeparture = repository.createConflictCheck("acct-liam", "ws-northstar", { participatingPersonIds: ["p-jordan"], subjects: [{ name: "Solaris Dynamics" }] });
  assert.equal(afterDeparture.hits.some((hit) => hit.matchedEntityName === "Solaris Dynamics"), false);
});

test("disclosure rejects inactive people, foreign matters, and missing entities atomically", (t) => {
  const repository = open(t);
  repository.updateMembership("acct-daniel", "ws-northstar", "mem-maya-a", { status: "DEPARTED" });
  const before = scalar(repository, "SELECT COUNT(*) AS count FROM review_cases").count;
  assert.throws(() => repository.createDisclosure({ personId: "p-maya", matterId: "m-aster", entityId: "o-meridian", relationshipType: "BOARD", description: "Test" }, "acct-liam", "ws-northstar"), /not active/);
  assert.throws(() => repository.createDisclosure({ personId: "p-priya", matterId: "missing", entityId: "o-meridian", relationshipType: "BOARD", description: "Test" }, "acct-liam", "ws-northstar"), /Matter not found/);
  assert.throws(() => repository.createDisclosure({ personId: "p-priya", matterId: "m-aster", entityId: "missing", relationshipType: "BOARD", description: "Test" }, "acct-liam", "ws-northstar"), /FOREIGN KEY/);
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM review_cases").count, before);
});

for (const disclosureClass of ["PORTABLE", "FIRM_ONLY", "RESTRICTED", "CONSENT_REQUIRED"]) {
  test(`${disclosureClass} disclosure has expected personal-ledger behavior`, (t) => {
    const repository = open(t);
    const before = scalar(repository, "SELECT COUNT(*) AS count FROM personal_ledger_entries WHERE person_id='p-priya'").count;
    repository.createDisclosure({ personId: "p-priya", matterId: "m-helios", entityId: "o-meridian", relationshipType: "ADVISORY", description: `${disclosureClass} disclosure`, disclosureClass }, "acct-liam", "ws-northstar");
    const after = scalar(repository, "SELECT COUNT(*) AS count FROM personal_ledger_entries WHERE person_id='p-priya'").count;
    assert.equal(after - before, disclosureClass === "PORTABLE" ? 1 : 0);
  });
}

test("case notes require content and leave the case in review", (t) => {
  const repository = open(t);
  assert.throws(() => repository.recordCaseAction("c-0039", { type: "note", body: " " }, "acct-liam"), /Note is required/);
  repository.recordCaseAction("c-0039", { type: "note", body: "Reviewed evidence", noteType: "outside information" }, "acct-liam");
  assert.equal(scalar(repository, "SELECT note_type AS noteType FROM review_notes WHERE case_id='c-0039' ORDER BY rowid DESC").noteType, "OUTSIDE_INFORMATION");
  assert.equal(scalar(repository, "SELECT status FROM review_cases WHERE id='c-0039'").status, "IN_REVIEW");
});

for (const status of ["NEW", "IN_REVIEW", "AWAITING_RESPONSE", "MANAGED", "CLOSED", "DECLINED", "WITHDRAWN"]) {
  test(`case status action accepts ${status}`, (t) => {
    const repository = open(t);
    repository.recordCaseAction("c-0039", { type: "status", status }, "acct-liam");
    assert.equal(scalar(repository, "SELECT status FROM review_cases WHERE id='c-0039'").status, status);
  });
}

test("case status action rejects unknown states", (t) => {
  assert.throws(() => open(t).recordCaseAction("c-0039", { type: "status", status: "MAGIC" }, "acct-liam"), /Unsupported case status/);
});

for (const [outcome, disposition] of [["No conflict", "NO_CONFLICT"], ["Manage", "CLEARED"], ["Recuse", "SCREEN_REQUIRED"], ["Prohibit", "DECLINE"]]) {
  test(`legacy decision outcome ${outcome} maps to ${disposition}`, (t) => {
    const repository = open(t);
    repository.recordCaseAction("c-0039", { type: "decision", outcome, rationale: "Human decision" }, "acct-liam");
    assert.equal(scalar(repository, "SELECT human_disposition AS value FROM review_cases WHERE id='c-0039'").value, disposition);
  });
}

test("determinations require valid disposition and rationale", (t) => {
  const repository = open(t);
  assert.throws(() => repository.recordCaseAction("c-0039", { type: "determination", disposition: "APPROVED", rationale: "No" }, "acct-liam"), /Unsupported human disposition/);
  assert.throws(() => repository.recordCaseAction("c-0039", { type: "determination", disposition: "CLEARED", rationale: " " }, "acct-liam"), /Rationale is required/);
});

test("case actions reject unknown action types", (t) => {
  assert.throws(() => open(t).recordCaseAction("c-0039", { type: "approve" }, "acct-liam"), /Unsupported case action/);
});

for (const status of ["REQUESTED", "OBTAINED", "DECLINED", "REVOKED", "EXPIRED", "SUPERSEDED"]) {
  test(`consent accepts ${status} and never clears automatically`, (t) => {
    const repository = open(t);
    const consent = repository.createConsent("acct-liam", "c-0039", { status, scope: `Scope ${status}` });
    const stored = scalar(repository, "SELECT status,obtained_at AS obtainedAt,revoked_at AS revokedAt FROM conflict_consents WHERE id=?", consent.id);
    assert.equal(stored.status, status);
    assert.equal(stored.obtainedAt != null, status === "OBTAINED");
    assert.equal(stored.revokedAt != null, status === "REVOKED");
    assert.equal(scalar(repository, "SELECT workflow_state AS state FROM review_cases WHERE id='c-0039'").state, "YELLOW");
  });
}

test("consent rejects unsupported status and missing scope", (t) => {
  const repository = open(t);
  assert.throws(() => repository.createConsent("acct-liam", "c-0039", { status: "APPROVED", scope: "Scope" }), /constraint failed|Unsupported consent status/i);
  assert.throws(() => repository.createConsent("acct-liam", "c-0039", { status: "REQUESTED", scope: " " }), /Consent scope is required/);
});

for (const status of ["PROPOSED", "ACTIVE", "INCOMPLETE", "ENDED", "BREACHED"]) {
  test(`screen accepts ${status} with the expected action state`, (t) => {
    const repository = open(t);
    const screen = repository.createScreen("acct-liam", "c-0041", { screenedPersonId: "p-maya", effectiveAt: "2026-08-28T12:00:00Z", restrictions: "No access", status });
    assert.equal(screen.status, status);
    assert.equal(scalar(repository, "SELECT workflow_state AS state FROM review_cases WHERE id='c-0041'").state, status === "INCOMPLETE" ? "RED" : "YELLOW");
  });
}

test("screen rejects unsupported status and required-field omissions", (t) => {
  const repository = open(t);
  assert.throws(() => repository.createScreen("acct-liam", "c-0041", { screenedPersonId: "p-maya", effectiveAt: "2026-08-28T12:00:00Z", restrictions: "No access", status: "MAGIC" }), /constraint failed|Unsupported screen status/i);
  assert.throws(() => repository.createScreen("acct-liam", "c-0041", { screenedPersonId: "p-maya", effectiveAt: "", restrictions: "No access" }), /Effective time is required/);
});

test("control completion is idempotent and audits only the transition", (t) => {
  const repository = open(t);
  const before = scalar(repository, "SELECT COUNT(*) AS count FROM audit_events WHERE action='control.completed' AND resource_id='ctl-01'").count;
  repository.completeControl("ctl-01", "acct-liam");
  repository.completeControl("ctl-01", "acct-liam");
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM audit_events WHERE action='control.completed' AND resource_id='ctl-01'").count, before + 1);
});

test("control completion rejects unknown controls and non-reviewers", (t) => {
  const repository = open(t);
  assert.throws(() => repository.completeControl("missing", "acct-liam"), /Control not found/);
  assert.throws(() => repository.completeControl("ctl-01", "acct-priya"), /not authorized/);
});

test("associated-person requests require review authority and bounded fields", (t) => {
  const repository = open(t);
  assert.throws(() => repository.createAssociatedPersonRequest("acct-priya", "ws-northstar", { subjectPersonId: "p-maya", associatedEntityId: "o-meridian-holdings", queryEntityId: "o-meridian", question: "Connection?", disclosureScope: "Yes/no" }), /not authorized/);
  assert.throws(() => repository.createAssociatedPersonRequest("acct-liam", "ws-northstar", { subjectPersonId: "p-maya", associatedEntityId: "o-meridian-holdings", queryEntityId: "o-meridian", question: "", disclosureScope: "Yes/no" }), /Question is required/);
});

test("associated-person responses are limited to the subject or a reviewer", (t) => {
  const repository = open(t);
  const request = repository.createAssociatedPersonRequest("acct-liam", "ws-northstar", { subjectPersonId: "p-maya", associatedEntityId: "o-meridian-holdings", queryEntityId: "o-meridian", question: "Connection?", disclosureScope: "Connection state" });
  assert.throws(() => repository.respondAssociatedPerson("acct-priya", request.id, { response: "UNSURE" }), /not authorized/);
  assert.equal(repository.respondAssociatedPerson("acct-maya", request.id, { response: "KNOWN_CONNECTION", permittedDetail: "Board role" }).response, "KNOWN_CONNECTION");
});

test("reviewers may record an associated-person response on behalf of the inquiry", (t) => {
  const repository = open(t);
  const request = repository.createAssociatedPersonRequest("acct-liam", "ws-northstar", { subjectPersonId: "p-maya", associatedEntityId: "o-meridian-holdings", queryEntityId: "o-meridian", question: "Connection?", disclosureScope: "Connection state" });
  assert.equal(repository.respondAssociatedPerson("acct-liam", request.id, { response: "NO_KNOWN_CONNECTION" }).response, "NO_KNOWN_CONNECTION");
});

test("associated-person responses reject replay, expiry, and invalid values", (t) => {
  const repository = open(t);
  const request = repository.createAssociatedPersonRequest("acct-liam", "ws-northstar", { subjectPersonId: "p-maya", associatedEntityId: "o-meridian-holdings", queryEntityId: "o-meridian", question: "Connection?", disclosureScope: "Connection state" });
  assert.throws(() => repository.respondAssociatedPerson("acct-maya", request.id, { response: "YES" }), /Unsupported response/);
  repository.respondAssociatedPerson("acct-maya", request.id, { response: "UNSURE" });
  assert.throws(() => repository.respondAssociatedPerson("acct-maya", request.id, { response: "UNSURE" }), /already answered/);
  const expired = repository.createAssociatedPersonRequest("acct-liam", "ws-northstar", { subjectPersonId: "p-maya", associatedEntityId: "o-meridian-holdings", queryEntityId: "o-meridian", question: "Expired?", disclosureScope: "Connection state" });
  repository.database.prepare("UPDATE associated_person_requests SET expires_at='2000-01-01T00:00:00Z' WHERE id=?").run(expired.id);
  assert.throws(() => repository.respondAssociatedPerson("acct-maya", expired.id, { response: "UNSURE" }), /expired/);
});

for (const [type, csv, countQuery] of [
  ["ENTITIES", "name,kind,jurisdiction\nQuoted Corp,ORGANIZATION,DC", "SELECT COUNT(*) AS count FROM entities WHERE canonical_name='Quoted Corp'"],
  ["ALIASES", "entity_id,alias\no-meridian,Meridian Labs", "SELECT COUNT(*) AS count FROM entity_aliases WHERE alias='Meridian Labs'"],
  ["MATTERS", "code,title,matter_type\nIMP-1,Imported Matter,ENGAGEMENT", "SELECT COUNT(*) AS count FROM matters WHERE code='IMP-1'"],
  ["PARTIES", "matter_id,entity_id,role\nm-aster,o-easton,OTHER", "SELECT COUNT(*) AS count FROM matter_parties WHERE matter_id='m-aster' AND entity_id='o-easton'"],
  ["RELATIONSHIPS", "person_id,entity_id,relationship_type,description\np-priya,o-meridian,ADVISER,Imported role", "SELECT COUNT(*) AS count FROM professional_relationships WHERE person_id='p-priya' AND description='Imported role'"],
  ["LEDGER_ENTRIES", "person_id,entity_id,context,disclosure_class\np-priya,o-meridian,Imported context,PORTABLE", "SELECT COUNT(*) AS count FROM personal_ledger_entries WHERE person_id='p-priya' AND context='Imported context'"],
]) {
  test(`${type} CSV import commits its aggregate transactionally`, (t) => {
    const repository = open(t);
    const result = repository.commitImport("acct-daniel", "ws-northstar", { type, csv });
    assert.equal(result.accepted, 1);
    assert.equal(scalar(repository, countQuery).count, 1);
  });
}

test("CSV parser preserves quoted commas, escaped quotes, and CRLF rows", (t) => {
  const repository = open(t);
  const preview = repository.previewImport("acct-daniel", "ws-northstar", { type: "ENTITIES", csv: "name,kind,jurisdiction\r\n\"Acme, \"\"International\"\"\",ORGANIZATION,DC\r\n" });
  assert.equal(preview.valid, true);
  assert.equal(preview.rows[0].name, "Acme, \"International\"");
});

test("CSV preview rejects unsupported types, empty batches, missing fields, and duplicates", (t) => {
  const repository = open(t);
  assert.throws(() => repository.previewImport("acct-daniel", "ws-northstar", { type: "MAGIC", csv: "a,b\n1,2" }), /Unsupported import type/);
  assert.equal(repository.previewImport("acct-daniel", "ws-northstar", { type: "ENTITIES", csv: "name,kind\n" }).valid, false);
  assert.equal(repository.previewImport("acct-daniel", "ws-northstar", { type: "ENTITIES", csv: "name,kind\nAcme," }).valid, false);
  const duplicate = repository.previewImport("acct-daniel", "ws-northstar", { type: "ENTITIES", csv: "name,kind\nAcme,ORGANIZATION\nACME,organization" });
  assert.equal(duplicate.valid, false);
  assert.match(duplicate.errors.at(-1).message, /Duplicate/);
});

test("foreign-key import failure rolls back both aggregate rows and batch metadata", (t) => {
  const repository = open(t);
  const before = scalar(repository, "SELECT COUNT(*) AS count FROM import_batches").count;
  assert.throws(() => repository.commitImport("acct-daniel", "ws-northstar", { type: "ALIASES", csv: "entity_id,alias\nmissing,Alias" }), /FOREIGN KEY/);
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM import_batches").count, before);
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM entity_aliases WHERE alias='Alias'").count, 0);
});

test("personal export includes only the actor's portable and restricted ledger", (t) => {
  const repository = open(t);
  const exported = repository.exportData("acct-jordan", null, "personal");
  assert.equal(exported.person.id, "p-jordan");
  assert.ok(exported.entries.length > 0);
  assert.ok(exported.entries.every((entry) => entry.person_id === "p-jordan" && ["PORTABLE", "RESTRICTED"].includes(entry.disclosure_class)));
});

test("workspace export is firm-admin-only and tenant-scoped", (t) => {
  const repository = open(t);
  assert.throws(() => repository.exportData("acct-priya", "ws-northstar", "workspace"), /not authorized/);
  const exported = repository.exportData("acct-daniel", "ws-northstar", "workspace");
  assert.equal(exported.schema, "interlocks.workspace.v1");
  assert.equal(exported.workspace.id, "ws-northstar");
  assert.ok(exported.cases.every((item) => !Object.hasOwn(item, "score")));
});

test("check export rejects missing and cross-tenant check identifiers", (t) => {
  const repository = open(t);
  assert.throws(() => repository.exportData("acct-daniel", "ws-northstar", "check", "missing"), /Conflict check not found/);
  const check = repository.createConflictCheck("acct-alex", "ws-blue-ridge", { subjects: [{ name: "Unknown" }] });
  assert.throws(() => repository.exportData("acct-daniel", "ws-northstar", "check", check.id), /Conflict check not found/);
});

test("global administration is superadmin-only and self-auditing", (t) => {
  const repository = open(t);
  assert.throws(() => repository.globalAdminSnapshot("acct-daniel"), /not authorized/);
  const admin = repository.globalAdminSnapshot("acct-alex");
  assert.equal(admin.workspaces.length, 2);
  assert.equal(admin.accounts.length, 7);
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM audit_events WHERE action='admin.console_viewed'").count, 1);
});

test("health identifies SQLite, current schema, corpus, and time", (t) => {
  const health = open(t).health();
  assert.equal(health.status, "ok");
  assert.equal(health.database, "sqlite");
  assert.equal(health.schemaVersion, 4);
  assert.ok(Number.isInteger(health.corpusRevision));
  assert.ok(Number.isFinite(Date.parse(health.timestamp)));
});

test("demo reset restores canonical records and preserves append-only audit behavior", (t) => {
  const repository = open(t);
  repository.createEntity("acct-daniel", "ws-northstar", { name: "Temporary Entity" });
  repository.resetDemo("acct-alex");
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM entities WHERE canonical_name='Temporary Entity'").count, 0);
  assert.equal(repository.getSnapshot().cases.length, 5);
  assert.throws(() => repository.database.prepare("DELETE FROM audit_events").run(), /immutable/);
});

test("demo reset is unavailable when demo mode is disabled", (t) => {
  const original = { environment: process.env.INTERLOCKS_ENV, demo: process.env.INTERLOCKS_DEMO_MODE };
  process.env.INTERLOCKS_ENV = "test";
  process.env.INTERLOCKS_DEMO_MODE = "false";
  resetConfigForTests();
  const repository = open(t);
  t.after(() => {
    if (original.environment == null) delete process.env.INTERLOCKS_ENV; else process.env.INTERLOCKS_ENV = original.environment;
    if (original.demo == null) delete process.env.INTERLOCKS_DEMO_MODE; else process.env.INTERLOCKS_DEMO_MODE = original.demo;
    resetConfigForTests();
  });
  assert.throws(() => repository.resetDemo("acct-alex"), /disabled/);
});
