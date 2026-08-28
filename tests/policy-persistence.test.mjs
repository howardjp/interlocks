import assert from "node:assert/strict";
import test from "node:test";

import { policyContentHash } from "../lib/policy/policy-engine.mjs";
import { LEGAL_POLICY_PACKS } from "../lib/policy/legal-policy-packs.mjs";
import { SqliteInterlocksRepository } from "../lib/persistence/sqlite-interlocks-repository.mjs";

function open(t) {
  const repository = new SqliteInterlocksRepository(":memory:");
  t.after(() => repository.close());
  return repository;
}

function scalar(repository, sql, ...params) {
  return repository.database.prepare(sql).get(...params);
}

function unknownCheck(overrides = {}) {
  return { subjects: [{ name: "Unlisted Test Subject", role: "OTHER" }], ...overrides };
}

function question(packId, status = "POTENTIALLY_APPLICABLE", overrides = {}) {
  return {
    key: `${packId}-question`,
    text: `Apply ${packId}?`,
    authorities: [{ packId, status }],
    ...overrides,
  };
}

test("policy migration creates the complete immutable persistence graph", (t) => {
  const repository = open(t);
  for (const table of ["policy_packs", "policy_questions", "policy_authority_selections", "policy_evaluations", "policy_rule_results"]) {
    assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='table' AND name=?", table).count, 1);
  }
  for (const index of ["idx_policy_question_check", "idx_policy_selection_question", "idx_policy_evaluation_question", "idx_policy_result_evaluation"]) {
    assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='index' AND name=?", index).count, 1);
  }
  for (const trigger of ["policy_questions_immutable", "policy_selections_immutable", "policy_evaluations_immutable", "policy_results_immutable"]) {
    assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM sqlite_master WHERE type='trigger' AND name=?", trigger).count, 1);
  }
});

test("repository installs all first-wave policy packs with exact manifests", (t) => {
  const repository = open(t);
  const rows = repository.database.prepare("SELECT pack_id AS id,version,content_hash AS contentHash,manifest_json AS manifestJson FROM policy_packs ORDER BY pack_id").all();
  assert.equal(rows.length, 6);
  for (const row of rows) {
    const source = LEGAL_POLICY_PACKS.find((pack) => pack.id === row.id);
    assert.equal(row.version, source.version);
    assert.equal(row.contentHash, source.contentHash);
    assert.deepEqual(JSON.parse(row.manifestJson), source);
  }
});

test("policy-pack synchronization is idempotent", (t) => {
  const repository = open(t);
  repository.syncPolicyPacks();
  repository.syncPolicyPacks();
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM policy_packs").count, 6);
});

test("policy-pack synchronization rejects changed content without a version increment", (t) => {
  const repository = open(t);
  repository.database.prepare("UPDATE policy_packs SET content_hash=? WHERE pack_id='aba-model'").run("0".repeat(64));
  assert.throws(() => repository.syncPolicyPacks(), /changed without a version increment/);
});

test("an ordinary check receives the ABA first-blush baseline", (t) => {
  const repository = open(t);
  const created = repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck());
  const snapshot = repository.getSnapshot("acct-liam", "ws-northstar");
  assert.equal(created.workflowState, "GREEN");
  assert.equal(snapshot.policyQuestions.length, 1);
  assert.deepEqual(snapshot.policySelections.map((item) => [item.packId, item.authorityStatus, item.selectionSource]), [
    ["aba-model", "POTENTIALLY_APPLICABLE", "SYSTEM_FALLBACK"],
  ]);
});

test("a controlling jurisdiction automatically receives ABA as a comparative baseline", (t) => {
  const repository = open(t);
  repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck({ questions: [question("maryland", "CONTROLLING")] }));
  const statuses = repository.getSnapshot("acct-liam", "ws-northstar").policySelections.map((item) => [item.packId, item.authorityStatus]);
  assert.deepEqual(statuses, [["aba-model", "COMPARATIVE_ONLY"], ["maryland", "CONTROLLING"]]);
});

test("a potentially applicable jurisdiction keeps ABA in first-blush mode", (t) => {
  const repository = open(t);
  repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck({ questions: [question("virginia")] }));
  const statuses = repository.getSnapshot("acct-liam", "ws-northstar").policySelections.map((item) => [item.packId, item.authorityStatus]);
  assert.deepEqual(statuses, [["aba-model", "POTENTIALLY_APPLICABLE"], ["virginia", "POTENTIALLY_APPLICABLE"]]);
});

test("an explicit ABA comparison selection is preserved as user intent", (t) => {
  const repository = open(t);
  repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck({ questions: [question("aba-model", "COMPARATIVE_ONLY")] }));
  const selected = repository.getSnapshot("acct-liam", "ws-northstar").policySelections[0];
  assert.equal(selected.authorityStatus, "COMPARATIVE_ONLY");
  assert.equal(selected.selectionSource, "USER");
});

for (const [label, authorities, pattern] of [
  ["ABA as controlling law", [{ packId:"aba-model", status:"CONTROLLING" }], /not controlling law/],
  ["a duplicate pack", [{ packId:"maryland" }, { packId:"maryland" }], /selected more than once/],
  ["an unknown pack", [{ packId:"atlantis" }], /Unknown legal policy pack/],
  ["an unsupported authority status", [{ packId:"maryland", status:"MAGIC" }], /Unsupported authority status/],
]) {
  test(`policy selection rejects ${label} before storing a check`, (t) => {
    const repository = open(t);
    const before = scalar(repository, "SELECT COUNT(*) AS count FROM conflict_checks").count;
    assert.throws(() => repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck({ questions:[{ key:"invalid", text:"Invalid?", authorities }] })), pattern);
    assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM conflict_checks").count, before);
  });
}

test("unsupported selection provenance rolls back the entire check transaction", (t) => {
  const repository = open(t);
  const before = scalar(repository, "SELECT COUNT(*) AS count FROM conflict_checks").count;
  const input = unknownCheck({ questions:[question("maryland", "CONTROLLING", { authorities:[{ packId:"maryland", status:"CONTROLLING", source:"ORACLE" }] })] });
  assert.throws(() => repository.createConflictCheck("acct-liam", "ws-northstar", input), /Unsupported policy selection source/);
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM conflict_checks").count, before);
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM policy_questions").count, 0);
});

test("duplicate question keys are rejected atomically", (t) => {
  const repository = open(t);
  const duplicate = question("maryland", "CONTROLLING", { key:"same" });
  assert.throws(() => repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck({ questions:[duplicate, { ...duplicate, text:"Again?" }] })), /keys must be unique/);
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM policy_questions").count, 0);
});

test("a check rejects more than twelve policy questions", (t) => {
  const repository = open(t);
  const questions = Array.from({ length:13 }, (_, index) => ({ key:`q-${index}`, text:`Question ${index}?`, authorities:[] }));
  assert.throws(() => repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck({ questions })), /at most 12/);
});

for (const [label, context, pattern] of [
  ["non-object context", [], /context must be an object/],
  ["a derived-fact override", { indicators:[] }, /Unsupported policy context fact/],
  ["a non-boolean counsel answer", { delawareCounselConfirmed:"probably" }, /must be a boolean/],
  ["an unknown tribunal", { tribunal:"MARS_SUPREME_COURT" }, /Unsupported tribunal/],
  ["an unknown pro hac vice status", { proHacViceStatus:"MAYBE" }, /Unsupported pro hac vice status/],
]) {
  test(`policy questions reject ${label} before evaluation`, (t) => {
    const repository = open(t);
    assert.throws(() => repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck({ questions:[question("delaware-chancery", "POTENTIALLY_APPLICABLE", { context })] })), pattern);
    assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM policy_questions").count, 0);
  });
}

test("a check persists twelve independent questions and sixty model-rule results", (t) => {
  const repository = open(t);
  const questions = Array.from({ length:12 }, (_, index) => ({ key:`q-${index}`, text:`Question ${index}?`, authorities:[] }));
  repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck({ questions }));
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM policy_questions").count, 12);
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM policy_evaluations").count, 12);
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM policy_rule_results").count, 60);
});

test("authority choices remain independent at the question level", (t) => {
  const repository = open(t);
  repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck({ questions:[
    question("maryland", "CONTROLLING", { key:"venue", text:"Maryland venue?" }),
    question("virginia", "CONTROLLING", { key:"lawyer", text:"Virginia lawyer?" }),
  ] }));
  const snapshot = repository.getSnapshot("acct-liam", "ws-northstar");
  const byQuestion = Object.fromEntries(snapshot.policyQuestions.map((item) => [item.questionKey, snapshot.policySelections.filter((selection) => selection.questionId === item.id).map((selection) => selection.packId)]));
  assert.deepEqual(byQuestion, { venue:["aba-model", "maryland"], lawyer:["aba-model", "virginia"] });
});

test("Chancery selection automatically composes Delaware and ABA overlays", (t) => {
  const repository = open(t);
  repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck({ questions:[question("delaware-chancery")] }));
  const selections = repository.getSnapshot("acct-liam", "ws-northstar").policySelections;
  assert.deepEqual(selections.map((item) => [item.packId, item.authorityStatus]), [
    ["aba-model", "POTENTIALLY_APPLICABLE"],
    ["delaware", "POTENTIALLY_APPLICABLE"],
    ["delaware-chancery", "POTENTIALLY_APPLICABLE"],
  ]);
});

test("unknown Chancery facts create a policy-linked review case", (t) => {
  const repository = open(t);
  const created = repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck({ questions:[question("delaware-chancery")] }));
  const review = scalar(repository, "SELECT policy_question_id AS policyQuestionId,conflict_hit_id AS hitId FROM review_cases WHERE conflict_check_id=?", created.id);
  assert.equal(created.workflowState, "YELLOW");
  assert.equal(created.hits.length, 0);
  assert.equal(review.policyQuestionId, created.policyQuestions[0].id);
  assert.equal(review.hitId, null);
});

for (const [label, context, expectedState, expectedOutcome] of [
  ["confirmed Delaware counsel and no outside counsel", { delawareCounselConfirmed:true, outsideCounselPresent:false }, "GREEN", "NOT_MATCHED"],
  ["unconfirmed Delaware counsel", { delawareCounselConfirmed:false, outsideCounselPresent:false }, "YELLOW", "MATCHED"],
  ["active pro hac vice status", { delawareCounselConfirmed:true, outsideCounselPresent:true, proHacViceStatus:"ACTIVE" }, "GREEN", "NOT_MATCHED"],
  ["pending pro hac vice status", { delawareCounselConfirmed:true, outsideCounselPresent:true, proHacViceStatus:"PENDING" }, "YELLOW", "MATCHED"],
]) {
  test(`Chancery evaluates ${label}`, (t) => {
    const repository = open(t);
    const created = repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck({ questions:[question("delaware-chancery", "POTENTIALLY_APPLICABLE", { context })] }));
    const outcomes = repository.getSnapshot("acct-liam", "ws-northstar").policyRuleResults.filter((item) => item.packId === "delaware-chancery").map((item) => item.outcome);
    assert.equal(created.workflowState, expectedState);
    assert.ok(outcomes.includes(expectedOutcome));
  });
}

test("comparative-only matches are stored but never drive workflow", (t) => {
  const repository = open(t);
  const context = { delawareCounselConfirmed:false, outsideCounselPresent:false };
  const created = repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck({ questions:[question("delaware-chancery", "COMPARATIVE_ONLY", { context })] }));
  const snapshot = repository.getSnapshot("acct-liam", "ws-northstar");
  assert.equal(created.workflowState, "GREEN");
  assert.equal(snapshot.cases.filter((item) => item.id === created.id).length, 0);
  assert.equal(snapshot.policyRuleResults.find((item) => item.ruleId === "de-chancery.170.delaware-counsel").outcome, "MATCHED");
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM review_cases WHERE conflict_check_id=?", created.id).count, 0);
});

for (const status of ["CONTROLLING", "POTENTIALLY_APPLICABLE"]) {
  test(`${status.toLowerCase()} matches create a review workflow`, (t) => {
    const repository = open(t);
    const context = { delawareCounselConfirmed:false, outsideCounselPresent:false };
    const created = repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck({ questions:[question("delaware-chancery", status, { context })] }));
    assert.equal(created.workflowState, "YELLOW");
    assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM review_cases WHERE conflict_check_id=?", created.id).count, 1);
  });
}

test("D.C. results retain exact source, citation, and effective version", (t) => {
  const repository = open(t);
  const created = repository.createConflictCheck("acct-liam", "ws-northstar", { subjects:[{ name:"Easton University", role:"ADVERSE_PARTY" }], matterId:"m-helios", questions:[question("district-of-columbia", "CONTROLLING")] });
  const snapshot = repository.getSnapshot("acct-liam", "ws-northstar");
  const result = snapshot.policyRuleResults.find((item) => item.packId === "district-of-columbia" && item.ruleId === "dc.1.7-a-b");
  const evaluation = snapshot.policyEvaluations.find((item) => item.id === result.evaluationId);
  assert.equal(created.workflowState, "YELLOW");
  assert.equal(result.citation, "D.C. Rule 1.7(a)–(b)");
  assert.equal(result.sourceUrl, "https://www.dcbar.org/for-lawyers/legal-ethics/rules-of-professional-conduct");
  assert.equal(evaluation.engineVersion, "1.0.0");
});

for (const [table, column] of [
  ["policy_questions", "question_text"],
  ["policy_authority_selections", "rationale"],
  ["policy_evaluations", "summary_json"],
  ["policy_rule_results", "finding_message"],
]) {
  test(`${table} history is immutable`, (t) => {
    const repository = open(t);
    repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck());
    assert.throws(() => repository.database.prepare(`UPDATE ${table} SET ${column}='changed'`).run(), /immutable/);
  });
}

test("evaluation fact snapshots are canonical, hash-verifiable, and free of internal markers", (t) => {
  const repository = open(t);
  repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck());
  const stored = scalar(repository, "SELECT facts_hash AS factsHash,fact_snapshot_json AS snapshotJson FROM policy_evaluations LIMIT 1");
  const facts = JSON.parse(stored.snapshotJson);
  assert.equal(policyContentHash(facts), stored.factsHash);
  assert.equal(JSON.stringify(facts).includes("__policySubjectId"), false);
  assert.equal(facts.schema, "interlocks.policy-facts.v1");
});

test("caller-owned check input remains untouched", (t) => {
  const repository = open(t);
  const input = unknownCheck({ questions:[question("maryland", "CONTROLLING")] });
  const before = structuredClone(input);
  repository.createConflictCheck("acct-liam", "ws-northstar", input);
  assert.deepEqual(input, before);
});

test("evaluation summaries reconcile exactly to stored rule results", (t) => {
  const repository = open(t);
  repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck({ questions:[question("delaware-chancery", "CONTROLLING", { context:{ delawareCounselConfirmed:false, outsideCounselPresent:false } })] }));
  const snapshot = repository.getSnapshot("acct-liam", "ws-northstar");
  for (const evaluation of snapshot.policyEvaluations) {
    const results = snapshot.policyRuleResults.filter((item) => item.evaluationId === evaluation.id);
    for (const outcome of ["MATCHED", "NOT_MATCHED", "INDETERMINATE"]) assert.equal(evaluation.summary[outcome], results.filter((item) => item.outcome === outcome).length);
  }
});

test("conflict-check knowledge snapshot records policy facts and question keys", (t) => {
  const repository = open(t);
  const created = repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck({ questions:[question("maryland", "CONTROLLING", { key:"governing-law" })] }));
  const stored = scalar(repository, "SELECT knowledge_snapshot_json AS snapshotJson FROM conflict_checks WHERE id=?", created.id);
  const snapshot = JSON.parse(stored.snapshotJson);
  assert.match(snapshot.policyFactsHash, /^[a-f0-9]{64}$/);
  assert.deepEqual(snapshot.policyQuestionKeys, ["governing-law"]);
});

test("check export preserves the complete policy evaluation record", (t) => {
  const repository = open(t);
  const created = repository.createConflictCheck("acct-daniel", "ws-northstar", unknownCheck({ questions:[question("virginia", "CONTROLLING")] }));
  const exported = repository.exportData("acct-daniel", "ws-northstar", "check", created.id);
  assert.equal(exported.schema, "interlocks.conflict-check.v2");
  assert.equal(exported.policyQuestions.length, 1);
  assert.equal(exported.policySelections.length, 2);
  assert.equal(exported.policyEvaluations.length, 2);
  assert.equal(exported.policyRuleResults.length, 10);
  assert.ok(exported.policySelections.every((selection) => JSON.parse(selection.pack_snapshot_json).contentHash));
});

test("documents attach to policy questions and evaluations as first-class evidence", (t) => {
  const repository = open(t);
  const created = repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck());
  const evaluationId = created.policyQuestions[0].evaluations[0].id;
  const document = repository.uploadDocument("acct-liam", "ws-northstar", {
    filename:"policy-analysis.txt", mediaType:"text/plain", bytes:Buffer.from("policy analysis"),
    attachments:[
      { resourceType:"POLICY_QUESTION", resourceId:created.policyQuestions[0].id },
      { resourceType:"POLICY_EVALUATION", resourceId:evaluationId },
    ],
  });
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM resource_attachments WHERE document_id=?", document.id).count, 2);
});

test("policy evidence attachments cannot cross tenant boundaries", (t) => {
  const repository = open(t);
  const foreign = repository.createConflictCheck("acct-alex", "ws-blue-ridge", unknownCheck());
  assert.throws(() => repository.uploadDocument("acct-liam", "ws-northstar", {
    filename:"cross-tenant.txt", mediaType:"text/plain", bytes:Buffer.from("forbidden"),
    attachments:[{ resourceType:"POLICY_QUESTION", resourceId:foreign.policyQuestions[0].id }],
  }), /workspace boundary/);
});

test("workspace snapshots isolate policy records while sharing the public catalog", (t) => {
  const repository = open(t);
  repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck({ questions:[question("maryland", "CONTROLLING")] }));
  repository.createConflictCheck("acct-alex", "ws-blue-ridge", unknownCheck({ questions:[question("virginia", "CONTROLLING")] }));
  const northstar = repository.getSnapshot("acct-liam", "ws-northstar");
  const blueRidge = repository.getSnapshot("acct-alex", "ws-blue-ridge");
  assert.equal(northstar.policyPacks.length, 6);
  assert.equal(blueRidge.policyPacks.length, 6);
  assert.deepEqual(new Set(northstar.policySelections.map((item) => item.packId)), new Set(["aba-model", "maryland"]));
  assert.deepEqual(new Set(blueRidge.policySelections.map((item) => item.packId)), new Set(["aba-model", "virginia"]));
});

test("policy execution is represented in the audit record without claiming a legal conclusion", (t) => {
  const repository = open(t);
  const created = repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck({ questions:[question("maryland", "CONTROLLING")] }));
  const audit = scalar(repository, "SELECT after_json AS afterJson FROM audit_events WHERE action='conflict_check.executed' AND resource_id=?", created.id);
  const after = JSON.parse(audit.afterJson);
  assert.equal(after.policyQuestionCount, 1);
  assert.equal(after.policyActionCount, 0);
  assert.equal(Object.hasOwn(after, "legalConclusion"), false);
});

test("demo reset clears evaluations but preserves the installed policy catalog", (t) => {
  const repository = open(t);
  repository.createConflictCheck("acct-liam", "ws-northstar", unknownCheck({ questions:[question("maryland", "CONTROLLING")] }));
  repository.resetDemo("acct-alex");
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM policy_packs").count, 6);
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM policy_questions").count, 0);
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM policy_evaluations").count, 0);
  assert.equal(scalar(repository, "SELECT COUNT(*) AS count FROM policy_rule_results").count, 0);
});
