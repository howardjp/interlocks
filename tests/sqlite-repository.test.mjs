import assert from "node:assert/strict";
import test from "node:test";

import { SqliteInterlocksRepository } from "../lib/persistence/sqlite-interlocks-repository.mjs";

function repository() {
  return new SqliteInterlocksRepository(":memory:");
}

test("SQLite adapter seeds a complete, connected workspace", (t) => {
  const repo = repository();
  t.after(() => repo.close());
  const snapshot = repo.getSnapshot();
  assert.equal(snapshot.people.length, 6);
  assert.equal(snapshot.matters.length, 5);
  assert.equal(snapshot.cases.length, 5);
  assert.equal(snapshot.controls.length, 6);
  assert.equal(snapshot.cases[0].reference, "INT-2026-0041");
  assert.equal(snapshot.cases[0].personName, "Dr. Maya Chen");
  assert.ok(snapshot.audit.length >= 6);
});

test("a disclosure creates a relationship, scored case, and audit event atomically", (t) => {
  const repo = repository();
  t.after(() => repo.close());
  const before = repo.getSnapshot();
  const created = repo.createDisclosure({
    personId: "p-jordan",
    matterId: "m-aster",
    organizationId: "o-meridian",
    relationshipType: "Financial interest",
    description: "Direct equity interest disclosed before evaluation.",
    influence: "recommend",
    financialValue: "15000",
  }, "Jordan Bell");
  const after = repo.getSnapshot();
  assert.equal(created.reference, "INT-2026-0042");
  assert.equal(created.level, "Critical");
  assert.equal(after.cases.length, before.cases.length + 1);
  assert.equal(after.relationships.length, before.relationships.length + 1);
  assert.equal(after.audit[0].action, "disclosure.created");
  assert.equal(after.audit[0].actor, "Jordan Bell");
});

test("review notes, decisions, and controls survive a fresh snapshot", (t) => {
  const repo = repository();
  t.after(() => repo.close());
  repo.recordCaseAction("c-0039", { type: "note", body: "Verified the payment record." }, "Liam Walker");
  repo.recordCaseAction("c-0039", {
    type: "decision",
    outcome: "Manage",
    rationale: "Disclosure and independent approval proportionately manage the appearance.",
    controlDescription: "Add the honorarium to the consortium disclosure.",
    ownerId: "p-priya",
    dueAt: "2026-08-25",
  }, "Liam Walker");
  const snapshot = repo.getSnapshot();
  assert.equal(snapshot.cases.find((item) => item.id === "c-0039").status, "Managed");
  assert.ok(snapshot.notes.some((item) => item.body === "Verified the payment record."));
  assert.ok(snapshot.decisions.some((item) => item.caseId === "c-0039" && item.outcome === "Manage"));
  assert.ok(snapshot.controls.some((item) => item.caseId === "c-0039" && item.ownerName === "Priya Shah"));
});

test("completing a control is idempotent and auditable", (t) => {
  const repo = repository();
  t.after(() => repo.close());
  assert.deepEqual(repo.completeControl("ctl-01", "Daniel Ortiz"), { id: "ctl-01", status: "Complete" });
  assert.deepEqual(repo.completeControl("ctl-01", "Daniel Ortiz"), { id: "ctl-01", status: "Complete" });
  const snapshot = repo.getSnapshot();
  assert.equal(snapshot.controls.find((item) => item.id === "ctl-01").status, "Complete");
  assert.equal(snapshot.audit.filter((item) => item.action === "control.completed" && item.entityId === "ctl-01").length, 1);
});

test("reset restores the canonical demonstration state", (t) => {
  const repo = repository();
  t.after(() => repo.close());
  repo.createDisclosure({
    personId: "p-jordan", matterId: "m-northstar", organizationId: "o-civic",
    relationshipType: "Other", description: "Temporary test connection", influence: "observe",
  }, "Test User");
  assert.equal(repo.getSnapshot().cases.length, 6);
  repo.resetDemo("Test User");
  const snapshot = repo.getSnapshot();
  assert.equal(snapshot.cases.length, 5);
  assert.equal(snapshot.audit[0].action, "demo.reset");
});
