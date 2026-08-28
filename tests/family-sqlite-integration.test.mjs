import assert from "node:assert/strict";
import test from "node:test";

import { SqliteInterlocksRepository } from "../lib/persistence/sqlite-interlocks-repository.mjs";
import { InMemoryObjectStore } from "../lib/storage/object-store.mjs";

function repository() {
  return new SqliteInterlocksRepository(":memory:", { objectStore:new InMemoryObjectStore() });
}

function withRepository(t) {
  const repo = repository();
  t.after(() => repo.close());
  return repo;
}

function addEntity(repo, entityId, name) {
  const at = "2026-08-28T13:00:00.000Z";
  repo.database.prepare("INSERT INTO entities (id,kind,canonical_name,created_at,updated_at) VALUES (?,'ORGANIZATION',?,?,?)").run(entityId, name, at, at);
  repo.rebuildSearchIndex();
}

function addLedger(repo, { id, personId, entityId, disclosureClass = "PORTABLE", sharingAuthorized = 1, context = "Private account-holder context" }) {
  repo.database.prepare(`INSERT INTO personal_ledger_entries
    (id,person_id,entity_id,context,involvement,source,provenance,disclosure_class,sharing_authorized,recorded_at)
    VALUES (?,?,?,?,'OUTSIDE_ROLE','Self-disclosed','Account holder attestation',?,?,?)`)
    .run(id, personId, entityId, context, disclosureClass, sharingAuthorized, "2026-08-28T13:00:00.000Z");
}

function runCheck(repo, { accountId = "acct-alex", subject, participants = [], role = "OTHER" }) {
  return repo.createConflictCheck(accountId, "ws-northstar", {
    matterId:"m-aster",
    participatingPersonIds:participants,
    subjects:[{ name:subject, role }],
    questions:[{ key:"family-screen", text:"What family or personal-interest intersections require human review?", context:{} }],
  });
}

function hitFor(result, name) {
  return result.hits.find((hit) => hit.matchedEntityName === name);
}

function activateLink(repo, requesterAccountId = "acct-maya", targetAccountId = "acct-priya", relationshipType = "SIBLING") {
  const targetEmail = repo.getActor(targetAccountId).email;
  const link = repo.requestFamilyAccountLink(requesterAccountId, { targetEmail, relationshipType, expiresInDays:14 });
  repo.respondFamilyAccountLink(targetAccountId, link.id, { response:"ACCEPT" });
  return link.id;
}

test("canonical demo data contains both family models without making family people workspace members", (t) => {
  const repo = withRepository(t);
  const maya = repo.getSnapshot("acct-maya", "ws-northstar");
  assert.deepEqual(maya.personalAssociations.map((item) => [item.associatedPersonName,item.relationshipType,item.status]), [["Zoe Chen","CHILD","ACTIVE"]]);
  assert.deepEqual(maya.associationInterests.map((item) => [item.entityName,item.involvement,item.status]), [["Microsoft Corporation","VICE_PRESIDENT","CURRENT"]]);
  const alex = repo.getSnapshot("acct-alex", "ws-northstar");
  assert.deepEqual(alex.familyAccountLinks.map((item) => [item.otherPersonName,item.relationshipType,item.status,item.disclosureScope]), [["Nina Basu","SPOUSE","ACTIVE","ENTITY_MATCH_ONLY"]]);
  assert.equal(alex.memberships.some((item) => item.personName === "Nina Basu" || item.personName === "Zoe Chen"), false);
});

test("personal family state is visible only to its account owner", (t) => {
  const repo = withRepository(t);
  const maya = repo.getSnapshot("acct-maya", "ws-northstar");
  const priya = repo.getSnapshot("acct-priya", "ws-northstar");
  assert.equal(maya.personalAssociations.length, 1);
  assert.equal(maya.associationInterests.length, 1);
  assert.deepEqual(priya.personalAssociations, []);
  assert.deepEqual(priya.associationInterests, []);
  assert.deepEqual(priya.familyAccountLinks, []);
});

test("superadmin view-as cannot bypass personal family or ledger privacy", (t) => {
  const repo = withRepository(t);
  const viewed = repo.getSnapshot("acct-alex", "ws-northstar", { viewAsAccountId:"acct-maya", reason:"Support" });
  assert.deepEqual(viewed.personalAssociations, []);
  assert.deepEqual(viewed.associationInterests, []);
  assert.deepEqual(viewed.familyAccountLinks, []);
  assert.deepEqual(viewed.ledger, []);
});

test("declared family interests participate only when their owner is covered by the check", (t) => {
  const repo = withRepository(t);
  assert.equal(hitFor(runCheck(repo, { subject:"Microsoft Corporation" }), "Microsoft Corporation"), undefined);
  const hit = hitFor(runCheck(repo, { subject:"Microsoft Corporation", participants:["p-maya"] }), "Microsoft Corporation");
  assert.equal(hit.sourceResourceType, "DECLARED_FAMILY_INTEREST");
  assert.match(hit.explanation.reasons.join(" "), /declared child/i);
  assert.match(hit.explanation.reasons.join(" "), /vice president/i);
});

test("linked account matches use the consent link as evidence and never expose the ledger row", (t) => {
  const repo = withRepository(t);
  const result = runCheck(repo, { subject:"Aperture Technologies" });
  const hit = hitFor(result, "Aperture Technologies");
  assert.equal(hit.sourceResourceType, "FAMILY_ACCOUNT_LINK");
  assert.equal(hit.sourceResourceId, "family-link-alex-nina");
  assert.notEqual(hit.sourceResourceId, "ledger-nina-aperture");
  const explanation = JSON.stringify(hit.explanation);
  assert.match(explanation, /authorized spouse account/i);
  assert.match(explanation, /ledger detail remains private/i);
  assert.doesNotMatch(explanation, /Nina Basu|Independent board advisory role|BOARD_ADVISER/);
  assert.equal(result.workflowState, "YELLOW");
});

test("private candidates are committed as a count and fingerprint rather than identifiers", (t) => {
  const repo = withRepository(t);
  const result = runCheck(repo, { subject:"Aperture Technologies" });
  const row = repo.database.prepare("SELECT knowledge_snapshot_json AS snapshot FROM conflict_checks WHERE id=?").get(result.id);
  const snapshot = JSON.parse(row.snapshot);
  assert.ok(snapshot.privateCandidateCount > 0);
  assert.match(snapshot.privateCandidateHash, /^[a-f0-9]{64}$/);
  assert.equal(snapshot.entityIds.includes("o-aperture"), false);
  assert.doesNotMatch(row.snapshot, /o-aperture|family-link-alex-nina|ledger-nina-aperture|Nina|Aperture/);
});

test("private family entities are absent from ordinary workspace knowledge until a match is recorded", (t) => {
  const repo = withRepository(t);
  const snapshot = repo.getSnapshot("acct-alex", "ws-northstar");
  assert.equal(snapshot.entities.some((item) => ["Microsoft Corporation","Aperture Technologies"].includes(item.canonicalName)), false);
  assert.equal(snapshot.relationships.some((item) => ["Microsoft Corporation","Aperture Technologies"].includes(item.entityName)), false);
});

test("declared family matches derive a material-limitation fact for jurisdictional policy packs", (t) => {
  const repo = withRepository(t);
  const result = runCheck(repo, { subject:"Microsoft Corporation", participants:["p-maya"] });
  const evaluation = repo.database.prepare(`SELECT fact_snapshot_json AS facts FROM policy_evaluations pe
    JOIN policy_questions pq ON pq.id=pe.question_id WHERE pq.conflict_check_id=? ORDER BY pe.evaluated_at LIMIT 1`).get(result.id);
  const facts = JSON.parse(evaluation.facts);
  assert.equal(facts.materialLimitationRisk, true);
  assert.ok(facts.indicators.some((item) => item.type === "FAMILY_CONNECTION" && item.evidenceType === "DECLARED_FAMILY_INTEREST"));
});

test("a public entity relationship cannot hide an independent declared-family reason", (t) => {
  const repo = withRepository(t);
  repo.database.prepare(`INSERT INTO professional_relationships
    (id,workspace_id,person_id,entity_id,relationship_type,description,source,disclosure_class,status,recorded_at)
    VALUES ('r-public-microsoft','ws-northstar','p-alex','o-microsoft','CURRENT_CLIENT','Workspace client record','Matter intake','FIRM_ONLY','CURRENT','2026-08-28T13:00:00.000Z')`).run();
  const result = runCheck(repo, { subject:"Microsoft Corporation", participants:["p-maya"] });
  const matchingHits = result.hits.filter((item) => item.matchedEntityName === "Microsoft Corporation");
  assert.equal(matchingHits.length, 1);
  assert.equal(matchingHits[0].sourceResourceType, "RELATIONSHIP");
  assert.match(matchingHits[0].explanation.reasons.join(" "), /declared child/i);
  const evidenceTypes = repo.database.prepare("SELECT evidence_type AS type FROM conflict_hit_evidence WHERE conflict_hit_id=? ORDER BY evidence_type").all(matchingHits[0].id).map((item) => item.type);
  assert.deepEqual(evidenceTypes, ["DECLARED_FAMILY_INTEREST","RELATIONSHIP"]);
  const evaluation = repo.database.prepare(`SELECT fact_snapshot_json AS facts FROM policy_evaluations pe JOIN policy_questions pq ON pq.id=pe.question_id
    WHERE pq.conflict_check_id=? ORDER BY pe.evaluated_at LIMIT 1`).get(result.id);
  assert.equal(JSON.parse(evaluation.facts).materialLimitationRisk, true);
});

test("a public matter-party match cannot hide an independent consent-linked spouse reason", (t) => {
  const repo = withRepository(t);
  repo.database.prepare("INSERT INTO matter_parties (id,matter_id,entity_id,role,provenance,created_at) VALUES ('party-aperture','m-aster','o-aperture','RELATED_PARTY','Matter intake','2026-08-28T13:00:00.000Z')").run();
  const result = runCheck(repo, { subject:"Aperture Technologies" });
  const matchingHits = result.hits.filter((item) => item.matchedEntityName === "Aperture Technologies");
  assert.equal(matchingHits.length, 1);
  assert.equal(matchingHits[0].sourceResourceType, "MATTER_PARTY");
  assert.match(matchingHits[0].explanation.reasons.join(" "), /authorized spouse account/i);
  const evidenceTypes = repo.database.prepare("SELECT evidence_type AS type FROM conflict_hit_evidence WHERE conflict_hit_id=? ORDER BY evidence_type").all(matchingHits[0].id).map((item) => item.type);
  assert.deepEqual(evidenceTypes, ["FAMILY_ACCOUNT_LINK","MATTER_PARTY"]);
});

test("a direct declaration creates a real non-account Person and an independently revocable interest", (t) => {
  const repo = withRepository(t);
  const association = repo.createPersonalAssociation("acct-priya", { associatedPersonName:"Sam Shah", relationshipType:"CHILD", primaryProfession:"Product executive", provenance:"Account holder declaration" });
  assert.ok(repo.database.prepare("SELECT 1 FROM persons WHERE id=?").get(association.associatedPersonId));
  assert.equal(repo.database.prepare("SELECT COUNT(*) AS count FROM accounts WHERE person_id=?").get(association.associatedPersonId).count, 0);
  const interest = repo.createAssociationInterest("acct-priya", association.id, { entityName:"Umbrella Holdings", entityKind:"ORGANIZATION", involvement:"VICE_PRESIDENT", description:"Vice president of product" });
  const matched = hitFor(runCheck(repo, { subject:"Umbrella Holdings", participants:["p-priya"] }), "Umbrella Holdings");
  assert.equal(matched.sourceResourceType, "DECLARED_FAMILY_INTEREST");
  repo.revokeAssociationInterest("acct-priya", interest.id);
  assert.equal(hitFor(runCheck(repo, { subject:"Umbrella Holdings", participants:["p-priya"] }), "Umbrella Holdings"), undefined);
});

test("ending a personal association ends every current interest and removes future matches", (t) => {
  const repo = withRepository(t);
  const association = repo.createPersonalAssociation("acct-priya", { associatedPersonName:"Ravi Shah", relationshipType:"PARENT", provenance:"Annual disclosure" });
  const first = repo.createAssociationInterest("acct-priya", association.id, { entityName:"Wayne Enterprises", involvement:"DIRECTOR", description:"Independent director" });
  const second = repo.createAssociationInterest("acct-priya", association.id, { entityName:"Stark Industries", involvement:"OFFICER", description:"Corporate officer" });
  repo.endPersonalAssociation("acct-priya", association.id);
  assert.deepEqual(repo.database.prepare("SELECT id,status,sharing_authorized AS sharing FROM personal_association_interests WHERE association_id=? ORDER BY id").all(association.id).map((item) => ({ ...item })), [
    { id:first.id, status:"ENDED", sharing:1 }, { id:second.id, status:"ENDED", sharing:1 },
  ].sort((a,b) => a.id.localeCompare(b.id)));
  assert.equal(hitFor(runCheck(repo, { subject:"Wayne Enterprises", participants:["p-priya"] }), "Wayne Enterprises"), undefined);
  assert.throws(() => repo.createAssociationInterest("acct-priya", association.id, { entityName:"Wonka Industries", involvement:"OWNER", description:"Owner" }), /not active/);
});

test("future and expired declaration windows do not participate in checks", (t) => {
  const repo = withRepository(t);
  const future = repo.createPersonalAssociation("acct-priya", { associatedPersonName:"Future Person", relationshipType:"SIBLING", provenance:"Test", effectiveFrom:"2099-01-01" });
  repo.createAssociationInterest("acct-priya", future.id, { entityName:"Future Corporation", involvement:"OWNER", description:"Future owner" });
  const active = repo.createPersonalAssociation("acct-priya", { associatedPersonName:"Current Person", relationshipType:"SIBLING", provenance:"Test" });
  repo.createAssociationInterest("acct-priya", active.id, { entityName:"Expired Corporation", involvement:"OWNER", description:"Former owner", effectiveTo:"2000-01-01" });
  assert.equal(hitFor(runCheck(repo, { subject:"Future Corporation", participants:["p-priya"] }), "Future Corporation"), undefined);
  assert.equal(hitFor(runCheck(repo, { subject:"Expired Corporation", participants:["p-priya"] }), "Expired Corporation"), undefined);
});

test("association date and vocabulary validation is atomic", (t) => {
  const repo = withRepository(t);
  const peopleBefore = repo.database.prepare("SELECT COUNT(*) AS count FROM persons").get().count;
  assert.throws(() => repo.createPersonalAssociation("acct-priya", { associatedPersonName:"Invalid Person", relationshipType:"COUSIN", provenance:"Test" }), /Unsupported/);
  assert.throws(() => repo.createPersonalAssociation("acct-priya", { associatedPersonName:"Invalid Person", relationshipType:"SIBLING", provenance:"Test", effectiveFrom:"2027-01-01", effectiveTo:"2026-01-01" }), /after/);
  assert.throws(() => repo.createPersonalAssociation("acct-priya", { associatedPersonName:"Invalid Person", relationshipType:"SIBLING", provenance:"Test", disclosureScope:"FULL_LEDGER" }), /Unsupported association disclosure scope/);
  assert.equal(repo.database.prepare("SELECT COUNT(*) AS count FROM persons").get().count, peopleBefore);
});

test("CONFLICT_CHECK_ONLY declarations suppress the relationship category in surfaced evidence", (t) => {
  const repo = withRepository(t);
  const association = repo.createPersonalAssociation("acct-priya", { associatedPersonName:"Private Relative", relationshipType:"SPOUSE", provenance:"Annual disclosure", disclosureScope:"CONFLICT_CHECK_ONLY" });
  repo.createAssociationInterest("acct-priya", association.id, { entityName:"Private Relative Employer", involvement:"GENERAL_COUNSEL", description:"General counsel" });
  const hit = hitFor(runCheck(repo, { subject:"Private Relative Employer", participants:["p-priya"] }), "Private Relative Employer");
  const explanation = hit.explanation.reasons.join(" ");
  assert.match(explanation, /owner-declared associated person/i);
  assert.doesNotMatch(explanation, /spouse/i);
});

test("only the declaration owner may mutate a direct family record", (t) => {
  const repo = withRepository(t);
  const association = repo.createPersonalAssociation("acct-priya", { associatedPersonName:"Owner Controlled", relationshipType:"SIBLING", provenance:"Test" });
  assert.throws(() => repo.endPersonalAssociation("acct-maya", association.id), /not found/);
  assert.throws(() => repo.createAssociationInterest("acct-maya", association.id, { entityName:"Forbidden", involvement:"OWNER", description:"Forbidden" }), /not found/);
});

test("account-link request, reciprocal acceptance, and revocation form a consent lifecycle", (t) => {
  const repo = withRepository(t);
  const revision = repo.corpusRevision();
  const pending = repo.requestFamilyAccountLink("acct-maya", { targetEmail:"PRIYA.SHAH@EXAMPLE.ORG", relationshipType:"PARENT", expiresInDays:7 });
  assert.equal(repo.corpusRevision(), revision);
  const mayaPending = repo.getSnapshot("acct-maya", "ws-northstar").familyAccountLinks.find((item) => item.id === pending.id);
  const priyaPending = repo.getSnapshot("acct-priya", "ws-northstar").familyAccountLinks.find((item) => item.id === pending.id);
  assert.deepEqual([mayaPending.direction,mayaPending.relationshipType,mayaPending.canRespond], ["SENT","PARENT",false]);
  assert.deepEqual([priyaPending.direction,priyaPending.relationshipType,priyaPending.canRespond], ["RECEIVED","CHILD",true]);
  assert.throws(() => repo.respondFamilyAccountLink("acct-daniel", pending.id, { response:"ACCEPT" }), /not found/);
  repo.respondFamilyAccountLink("acct-priya", pending.id, { response:"ACCEPT" });
  assert.equal(repo.corpusRevision(), revision + 1);
  assert.equal(repo.getSnapshot("acct-priya", "ws-northstar").familyAccountLinks.find((item) => item.id === pending.id).status, "ACTIVE");
  repo.revokeFamilyAccountLink("acct-maya", pending.id);
  assert.equal(repo.corpusRevision(), revision + 2);
  assert.equal(repo.getSnapshot("acct-priya", "ws-northstar").familyAccountLinks.find((item) => item.id === pending.id).status, "REVOKED");
});

test("pending consent never permits cross-account matching", (t) => {
  const repo = withRepository(t);
  addEntity(repo, "o-pending-private", "Pending Private Employer");
  addLedger(repo, { id:"ledger-pending-private", personId:"p-priya", entityId:"o-pending-private" });
  repo.requestFamilyAccountLink("acct-maya", { targetEmail:"priya.shah@example.org", relationshipType:"SIBLING" });
  assert.equal(hitFor(runCheck(repo, { accountId:"acct-maya", subject:"Pending Private Employer" }), "Pending Private Employer"), undefined);
});

test("accepted consent permits a match and revocation stops subsequent matches", (t) => {
  const repo = withRepository(t);
  addEntity(repo, "o-linked-private", "Linked Private Employer");
  addLedger(repo, { id:"ledger-linked-private", personId:"p-priya", entityId:"o-linked-private", context:"Do not expose this context" });
  const linkId = activateLink(repo);
  const first = hitFor(runCheck(repo, { accountId:"acct-maya", subject:"Linked Private Employer" }), "Linked Private Employer");
  assert.deepEqual([first.sourceResourceType,first.sourceResourceId], ["FAMILY_ACCOUNT_LINK",linkId]);
  assert.doesNotMatch(JSON.stringify(first), /Do not expose this context|ledger-linked-private/);
  repo.revokeFamilyAccountLink("acct-priya", linkId);
  assert.equal(hitFor(runCheck(repo, { accountId:"acct-maya", subject:"Linked Private Employer" }), "Linked Private Employer"), undefined);
});

test("declining a link changes no conflict corpus and permits a later fresh invitation", (t) => {
  const repo = withRepository(t);
  const revision = repo.corpusRevision();
  const first = repo.requestFamilyAccountLink("acct-maya", { targetEmail:"priya.shah@example.org", relationshipType:"SIBLING" });
  repo.respondFamilyAccountLink("acct-priya", first.id, { response:"DECLINE" });
  assert.equal(repo.corpusRevision(), revision);
  const second = repo.requestFamilyAccountLink("acct-maya", { targetEmail:"priya.shah@example.org", relationshipType:"SIBLING" });
  assert.notEqual(second.id, first.id);
});

test("expired invitations are persisted and audited as expired without activating consent", (t) => {
  const repo = withRepository(t);
  const link = repo.requestFamilyAccountLink("acct-maya", { targetEmail:"priya.shah@example.org", relationshipType:"SIBLING" });
  repo.database.prepare("UPDATE family_account_links SET expires_at='2000-01-01T00:00:00.000Z' WHERE id=?").run(link.id);
  assert.throws(() => repo.respondFamilyAccountLink("acct-priya", link.id, { response:"ACCEPT" }), /expired/);
  assert.equal(repo.database.prepare("SELECT status FROM family_account_links WHERE id=?").get(link.id).status, "EXPIRED");
  assert.ok(repo.database.prepare("SELECT 1 FROM audit_events WHERE resource_id=? AND action='family_account_link.expired' AND workspace_scope IS NULL").get(link.id));
});

test("duplicate pending or active account links are rejected symmetrically", (t) => {
  const repo = withRepository(t);
  repo.requestFamilyAccountLink("acct-maya", { targetEmail:"priya.shah@example.org", relationshipType:"SIBLING" });
  assert.throws(() => repo.requestFamilyAccountLink("acct-priya", { targetEmail:"maya.chen@example.org", relationshipType:"SIBLING" }), /already exists/);
});

test("self and unknown account-link requests have the same non-enumerating failure", (t) => {
  const repo = withRepository(t);
  const failures = [];
  for (const targetEmail of ["maya.chen@example.org","unknown@example.org"]) {
    try { repo.requestFamilyAccountLink("acct-maya", { targetEmail, relationshipType:"SIBLING" }); }
    catch (error) { failures.push(error.message); }
  }
  assert.deepEqual(failures, ["No eligible Interlocks account can accept this link","No eligible Interlocks account can accept this link"]);
});

for (const { disclosureClass, sharingAuthorized, expected } of [
  { disclosureClass:"PORTABLE", sharingAuthorized:1, expected:true },
  { disclosureClass:"PORTABLE", sharingAuthorized:0, expected:false },
  { disclosureClass:"RESTRICTED", sharingAuthorized:1, expected:false },
  { disclosureClass:"FIRM_ONLY", sharingAuthorized:1, expected:false },
  { disclosureClass:"CONSENT_REQUIRED", sharingAuthorized:1, expected:false },
]) {
  test(`linked account ${disclosureClass} sharing ${sharingAuthorized} is ${expected ? "matched" : "withheld"}`, (t) => {
    const repo = withRepository(t);
    const suffix = `${disclosureClass.toLowerCase()}-${sharingAuthorized}`;
    const entityId = `o-ledger-${suffix}`; const name = `Ledger Boundary ${suffix}`;
    addEntity(repo, entityId, name);
    addLedger(repo, { id:`ledger-${suffix}`, personId:"p-priya", entityId, disclosureClass, sharingAuthorized });
    activateLink(repo);
    assert.equal(Boolean(hitFor(runCheck(repo, { accountId:"acct-maya", subject:name }), name)), expected);
  });
}

test("linked-account matching is one hop and never traverses the linked person's family declarations", (t) => {
  const repo = withRepository(t);
  const association = repo.createPersonalAssociation("acct-priya", { associatedPersonName:"Priya Relative", relationshipType:"SIBLING", provenance:"Test" });
  repo.createAssociationInterest("acct-priya", association.id, { entityName:"Second Hop Family Employer", involvement:"DIRECTOR", description:"Director" });
  activateLink(repo);
  assert.equal(hitFor(runCheck(repo, { accountId:"acct-maya", subject:"Second Hop Family Employer" }), "Second Hop Family Employer"), undefined);
});

test("linked-account matching is one hop and never traverses the linked person's account links", (t) => {
  const repo = withRepository(t);
  addEntity(repo, "o-second-hop-link", "Second Hop Linked Employer");
  addLedger(repo, { id:"ledger-second-hop-link", personId:"p-jordan", entityId:"o-second-hop-link" });
  activateLink(repo, "acct-priya", "acct-jordan", "SIBLING");
  activateLink(repo, "acct-maya", "acct-priya", "SIBLING");
  assert.equal(hitFor(runCheck(repo, { accountId:"acct-maya", subject:"Second Hop Linked Employer" }), "Second Hop Linked Employer"), undefined);
});

test("private family candidates do not expand through the global corporate relationship graph", (t) => {
  const repo = withRepository(t);
  addEntity(repo, "o-aperture-parent", "Aperture Parent Holdings");
  repo.database.prepare(`INSERT INTO entity_relationships (id,from_entity_id,to_entity_id,relationship_type,recorded_at,provenance)
    VALUES ('er-private-corporate','o-aperture','o-aperture-parent','SUBSIDIARY_OF','2026-08-28T13:00:00.000Z','Corporate filing')`).run();
  assert.equal(hitFor(runCheck(repo, { subject:"Aperture Parent Holdings" }), "Aperture Parent Holdings"), undefined);
  assert.ok(hitFor(runCheck(repo, { subject:"Aperture Technologies" }), "Aperture Technologies"));
});

test("departed members cannot be smuggled into a workspace check as covered people", (t) => {
  const repo = withRepository(t);
  repo.updateMembership("acct-daniel", "ws-northstar", "mem-maya-a", { status:"DEPARTED" });
  assert.equal(hitFor(runCheck(repo, { subject:"Microsoft Corporation", participants:["p-maya"] }), "Microsoft Corporation"), undefined);
});

test("personal export includes owner declarations and consent metadata but excludes linked account ledgers", (t) => {
  const repo = withRepository(t);
  const exported = repo.exportData("acct-alex", null, "personal");
  assert.equal(exported.schema, "interlocks.personal-ledger.v2");
  assert.equal(exported.linkedAccountLedgersIncluded, false);
  assert.deepEqual(exported.familyAccountLinks.map((item) => item.other_person_name), ["Nina Basu"]);
  assert.doesNotMatch(JSON.stringify(exported), /Independent board advisory role|ledger-nina-aperture/);
});

test("workspace export excludes every person-owned family aggregate", (t) => {
  const repo = withRepository(t);
  const exported = repo.exportData("acct-alex", "ws-northstar", "workspace");
  assert.equal(exported.personalDataExcluded, true);
  for (const key of ["ledger","personalAssociations","associationInterests","familyAccountLinks"]) assert.equal(Object.hasOwn(exported, key), false);
  assert.doesNotMatch(JSON.stringify(exported), /Zoe Chen|Microsoft Corporation|Nina Basu|Aperture Technologies/);
});

test("personal-family mutations are audited outside any tenant scope", (t) => {
  const repo = withRepository(t);
  const association = repo.createPersonalAssociation("acct-priya", { associatedPersonName:"Audited Relative", relationshipType:"SIBLING", provenance:"Test" });
  const interest = repo.createAssociationInterest("acct-priya", association.id, { entityName:"Audited Employer", involvement:"OFFICER", description:"Officer" });
  repo.revokeAssociationInterest("acct-priya", interest.id);
  repo.endPersonalAssociation("acct-priya", association.id);
  const rows = repo.database.prepare("SELECT action,workspace_scope AS workspaceScope FROM audit_events WHERE actor_account_id='acct-priya' AND resource_type IN ('PERSONAL_ASSOCIATION','ASSOCIATION_INTEREST') ORDER BY action").all();
  assert.deepEqual(rows.map((row) => row.action), ["association_interest.created","association_interest.revoked","personal_association.created","personal_association.ended"]);
  assert.ok(rows.every((row) => row.workspaceScope == null));
});

test("demo reset restores both canonical family models after destructive mutations", (t) => {
  const repo = withRepository(t);
  repo.revokeFamilyAccountLink("acct-alex", "family-link-alex-nina");
  repo.endPersonalAssociation("acct-maya", "assoc-maya-zoe");
  repo.resetDemo("acct-alex");
  assert.equal(repo.database.prepare("SELECT status FROM family_account_links WHERE id='family-link-alex-nina'").get().status, "ACTIVE");
  assert.equal(repo.database.prepare("SELECT status FROM personal_associations WHERE id='assoc-maya-zoe'").get().status, "ACTIVE");
  assert.equal(repo.database.prepare("SELECT status FROM personal_association_interests WHERE id='assoc-interest-zoe-microsoft'").get().status, "CURRENT");
});

test("family schema enforces one open pair and prevents self-links at the database boundary", (t) => {
  const repo = withRepository(t);
  const link = repo.requestFamilyAccountLink("acct-maya", { targetEmail:"priya.shah@example.org", relationshipType:"SIBLING" });
  const row = repo.database.prepare("SELECT * FROM family_account_links WHERE id=?").get(link.id);
  assert.throws(() => repo.database.prepare(`INSERT INTO family_account_links
    (id,pair_key,requester_person_id,target_person_id,relationship_type,target_relationship_type,disclosure_scope,status,requested_by,requested_at)
    VALUES ('duplicate',?,?,?,?,?,'ENTITY_MATCH_ONLY','PENDING','acct-priya','2026-08-28T00:00:00Z')`).run(row.pair_key,"p-priya","p-maya","SIBLING","SIBLING"), /UNIQUE/);
  assert.throws(() => repo.database.prepare(`INSERT INTO family_account_links
    (id,pair_key,requester_person_id,target_person_id,relationship_type,target_relationship_type,disclosure_scope,status,requested_by,requested_at)
    VALUES ('self','p-priya::p-priya','p-priya','p-priya','SIBLING','SIBLING','ENTITY_MATCH_ONLY','PENDING','acct-priya','2026-08-28T00:00:00Z')`).run(), /CHECK/);
});
