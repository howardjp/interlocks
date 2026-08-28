import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

const port = "4310";
const base = `http://127.0.0.1:${port}`;
const directory = await mkdtemp(join(tmpdir(), "interlocks-http-"));
let stderr = "";
let assertions = 0;
const check = (condition, message) => { assertions += 1; assert.ok(condition, message); };
const equal = (actual, expected, message) => { assertions += 1; assert.equal(actual, expected, message); };
const headers = (account = "acct-alex", workspace = "ws-northstar") => ({
  "content-type": "application/json",
  "x-interlocks-account": account,
  "x-interlocks-workspace": workspace,
});
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", port], {
  cwd: process.cwd(),
  env: {
    ...process.env,
    INTERLOCKS_ENV: "development",
    INTERLOCKS_DEMO_MODE: "true",
    INTERLOCKS_DB_PATH: join(directory, "interlocks.db"),
    INTERLOCKS_DOCUMENT_PATH: join(directory, "documents"),
  },
  stdio: ["ignore", "ignore", "pipe"],
});
server.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

async function waitUntilReady() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Production server did not become ready. ${stderr}`);
}

async function request(path, options = {}, expectedStatus = 200) {
  const response = await fetch(base + path, options);
  equal(response.status, expectedStatus, `${path} status`);
  return response;
}

async function json(path, options = {}, expectedStatus = 200) {
  return (await request(path, options, expectedStatus)).json();
}

async function command(name, input = {}, resourceId = null, account = "acct-alex", workspace = "ws-northstar", expectedStatus = 201) {
  return json("/api/commands", {
    method: "POST",
    headers: headers(account, workspace),
    body: JSON.stringify({ command: name, input, resourceId, workspaceId: workspace }),
  }, expectedStatus);
}

try {
  await waitUntilReady();

  const html = await request("/");
  check((await html.text()).includes("Interlocks"), "application renders");
  for (const [name, expected] of [
    ["x-frame-options", "DENY"],
    ["x-content-type-options", "nosniff"],
    ["referrer-policy", "strict-origin-when-cross-origin"],
    ["cross-origin-opener-policy", "same-origin"],
  ]) equal(html.headers.get(name), expected, `${name} header`);
  check(html.headers.get("content-security-policy")?.includes("frame-ancestors 'none'"), "CSP blocks framing");
  check(html.headers.get("permissions-policy")?.includes("camera=()"), "permissions policy disables camera");

  const healthResponse = await request("/api/health");
  equal(healthResponse.headers.get("cache-control"), "no-store", "health is not cached");
  const health = await healthResponse.json();
  equal(health.status, "ok", "health status");
  equal(health.schemaVersion, 4, "schema version");
  equal(health.database, "sqlite", "test exercises SQLite boundary");

  let snapshotResponse = await request("/api/snapshot?workspace=ws-northstar", { headers: headers() });
  equal(snapshotResponse.headers.get("cache-control"), "no-store", "snapshots are not cached");
  let snapshot = await snapshotResponse.json();
  equal(snapshot.cases.length, 5, "canonical case count");
  check(snapshot.cases.every((item) => !("score" in item) && !("riskScore" in item)), "no numeric ethics score leaks");
  assert.deepEqual(new Set(snapshot.cases.map((item) => item.workflowState)), new Set(["RED", "YELLOW", "GREEN"])); assertions += 1;
  equal(snapshot.workspace.id, "ws-northstar", "workspace selected");
  check(snapshot.availableWorkspaces.some((item) => item.workspaceId === "ws-blue-ridge"), "superadmin can enumerate workspaces");

  const wrongTenant = await json("/api/snapshot?workspace=ws-blue-ridge", { headers: headers("acct-daniel", "ws-blue-ridge") }, 403);
  check(/forbidden|permission|authorized/i.test(wrongTenant.error), "cross-tenant reads are forbidden");
  const missingAccount = await json("/api/snapshot", { headers: headers("acct-does-not-exist") }, 400);
  check(/account|identity/i.test(missingAccount.error), "unknown development identity is rejected");
  const memberAdmin = await json("/api/admin", { headers: headers("acct-maya") }, 403);
  check(/forbidden|permission|authorized/i.test(memberAdmin.error), "ordinary members cannot use platform admin");
  const unsupported = await command("not.a.command", {}, null, "acct-alex", "ws-northstar", 400);
  equal(unsupported.error, "Unsupported command", "unknown commands fail closed");
  const memberMutation = await command("entity.create", { canonicalName: "Forbidden Entity", kind: "ORGANIZATION" }, null, "acct-maya", "ws-northstar", 403);
  check(/forbidden|permission|authorized/i.test(memberMutation.error), "member cannot mutate canonical entities");

  const checkResult = (await command("check.create", {
    matterId: "m-aster",
    participatingPersonIds: ["p-jordan"],
    subjects: [
      { name: "Meridian AI", role: "PROSPECTIVE_CLIENT" },
      { name: "Solaris Dynamics", role: "RELATED_PARTY" },
      { name: "123 Main Street", role: "PROPERTY" },
    ],
  })).result;
  equal(checkResult.workflowState, "YELLOW", "check requires human review");
  check(checkResult.hits.some((item) => item.matchConfidence === "EXACT"), "exact match surfaced");
  check(checkResult.hits.some((item) => item.matchConfidence === "RELATED"), "related match surfaced");
  check(checkResult.hits.every((item) => item.explanation.statement.includes("no legal conclusion")), "every hit carries legal disclaimer");
  check(checkResult.hits.every((item) => item.explanation.source), "every hit explains its source type");

  const disclosure = (await command("disclosure.create", {
    personId: "p-jordan",
    matterId: "m-northstar",
    entityId: "o-civic",
    relationshipType: "OUTSIDE_EMPLOYMENT",
    description: "Paid advisory work overlaps the active hiring panel.",
    disclosureClass: "PORTABLE",
  })).result;
  await command("case.action", { type: "note", body: "Outside engagement letter received and reviewed." }, disclosure.id);
  await command("case.action", {
    type: "determination",
    disposition: "CLEARED",
    rationale: "Proceed only after documented recusal and access removal.",
    ruleBasis: "Firm policy COI-4",
    jurisdiction: "District of Columbia",
    controlDescription: "Remove Jordan from the panel and revoke candidate-packet access.",
    ownerPersonId: "p-alex",
    dueAt: "2026-09-15",
  }, disclosure.id);
  snapshot = await json("/api/snapshot?workspace=ws-northstar", { headers: headers() });
  check(snapshot.hits.filter((item) => item.conflictCheckId === checkResult.id).every((item) => item.sourceResourceType && item.sourceResourceId), "persisted hits retain source provenance");
  const created = snapshot.cases.find((item) => item.id === disclosure.id);
  equal(created.humanDisposition, "CLEARED", "determination recorded");
  check(created.workflowState !== "GREEN", "unmet control prevents green state");
  check(snapshot.notes.some((item) => item.caseId === disclosure.id), "review note persisted");
  const control = snapshot.controls.find((item) => item.caseId === disclosure.id);
  check(control, "determination generated a control");
  await command("control.complete", {}, control.id);
  await command("control.complete", {}, control.id);

  await command("consent.create", {
    affectedEntityId: "o-easton",
    status: "OBTAINED",
    consentType: "INFORMED_CONSENT",
    evidenceRequirement: "CONFIRMED_IN_WRITING",
    scope: "Helios consortium representation",
  }, "c-0039");
  await command("screen.create", {
    screenedPersonId: "p-maya",
    effectiveAt: "2026-08-28T12:00:00Z",
    restrictions: "No matter access or participation",
    feeRestrictions: "No fee allocation",
    noticeRequirements: "Written notice to affected client",
    status: "ACTIVE",
  }, "c-0041");

  const associated = (await command("associated.request", {
    subjectPersonId: "p-maya",
    associatedEntityId: "o-meridian-holdings",
    queryEntityId: "o-meridian",
    question: "Is there a current connection relevant to this review?",
    disclosureScope: "Connection state plus limited role description",
  })).result;
  const unauthorizedResponse = await command("associated.respond", { response: "KNOWN_CONNECTION" }, associated.id, "acct-priya", "ws-northstar", 403);
  check(/forbidden|permission|authorized/i.test(unauthorizedResponse.error), "unrelated member cannot answer for another person");
  await command("associated.respond", { response: "KNOWN_CONNECTION", permittedDetail: "Current board role" }, associated.id, "acct-maya");
  const replay = await command("associated.respond", { response: "UNSURE" }, associated.id, "acct-maya", "ws-northstar", 400);
  check(/already answered/.test(replay.error), "associated response cannot be replayed");

  const uploaded = (await command("document.upload", {
    filename: "http-evidence.txt",
    mediaType: "text/plain",
    bytesBase64: Buffer.from("immutable HTTP evidence").toString("base64"),
    attachments: [{ resourceType: "REVIEW_CASE", resourceId: disclosure.id, purpose: "Review evidence" }],
  })).result;
  check(uploaded.sha256 && uploaded.size > 0, "document is content-addressed");
  const foreignMatter = (await command("matter.create", {
    code: "BLUE-E2E",
    title: "Foreign tenant matter",
    matterType: "REPRESENTATION",
    ownerPersonId: "p-alex",
  }, null, "acct-alex", "ws-blue-ridge")).result;
  const crossTenantAttachment = await command("document.upload", {
    filename: "tenant-escape.txt",
    mediaType: "text/plain",
    bytesBase64: Buffer.from("must not persist").toString("base64"),
    attachments: [{ resourceType: "MATTER", resourceId: foreignMatter.id, purpose: "Invalid" }],
  }, null, "acct-alex", "ws-northstar", 400);
  check(/workspace boundary/.test(crossTenantAttachment.error), "cross-workspace attachment is rejected");

  const invalidPreview = (await command("import.preview", { type: "ENTITIES", csv: "name,kind\n,ORGANIZATION" })).result;
  equal(invalidPreview.valid, false, "invalid import preview");
  check(invalidPreview.errors.some((item) => item.column === "name"), "preview identifies missing field");
  const validCsv = "name,kind,jurisdiction\nHTTP Imported Entity,ORGANIZATION,DC";
  const validPreview = (await command("import.preview", { type: "ENTITIES", csv: validCsv })).result;
  equal(validPreview.valid, true, "valid import preview");
  equal((await command("import.commit", { type: "ENTITIES", csv: validCsv, filename: "http.csv" })).result.accepted, 1, "valid import commits atomically");

  snapshot = await json("/api/snapshot?workspace=ws-northstar", { headers: headers() });
  check(snapshot.documents.some((item) => item.id === uploaded.id && item.attachmentCount === 1), "document metadata and attachment persisted");
  check(snapshot.associatedResponses.some((item) => item.requestId === associated.id), "associated response persisted");
  check(snapshot.entities.some((item) => item.canonicalName === "HTTP Imported Entity"), "CSV entity persisted");
  check(snapshot.audit.some((item) => item.action === "associated_person.responded"), "associated response audited");
  check(snapshot.audit.some((item) => item.action === "document.uploaded"), "document upload audited");
  check(snapshot.audit.some((item) => item.action === "import.committed"), "CSV import audited");

  const viewAs = await json("/api/snapshot?workspace=ws-northstar&viewAs=acct-maya&reason=HTTP%20support", { headers: headers() });
  equal(viewAs.actor.accountId, "acct-maya", "view-as changes effective actor");
  equal(viewAs.realActor.accountId, "acct-alex", "view-as preserves real actor");
  equal(viewAs.viewAs.readOnly, true, "view-as is explicitly read-only");

  const workspaceExport = await request("/api/export?kind=workspace&workspace=ws-northstar", { headers: headers() });
  check(workspaceExport.headers.get("content-type")?.includes("application/json"), "workspace JSON export type");
  check(workspaceExport.headers.get("content-disposition")?.includes("interlocks-export.json"), "workspace export filename");
  equal((await workspaceExport.json()).schema, "interlocks.workspace.v1", "workspace export schema");
  const csvExport = await request("/api/export?kind=workspace&format=csv&workspace=ws-northstar", { headers: headers() });
  check(csvExport.headers.get("content-type")?.includes("text/csv"), "CSV export type");
  const csvText = await csvExport.text();
  check(csvText.startsWith('\"Reference\",\"Title\"'), "CSV has stable columns");
  check(csvText.includes('\"Action state\",\"Human disposition\"'), "CSV separates workflow and judgment");
  const personal = await json("/api/export?kind=personal", { headers: headers("acct-jordan") });
  equal(personal.schema, "interlocks.personal-ledger.v1", "personal ledger schema");
  check(personal.entries.every((item) => ["PORTABLE", "RESTRICTED"].includes(item.disclosure_class)), "personal export respects disclosure classes");
  const checkExport = await json(`/api/export?kind=check&resourceId=${checkResult.id}&workspace=ws-northstar`, { headers: headers() });
  equal(checkExport.schema, "interlocks.conflict-check.v1", "conflict-check export schema");
  check(checkExport.hits.length === checkResult.hits.length, "check export contains all hits");

  const admin = await json("/api/admin", { headers: headers() });
  equal(admin.workspaces.length, 2, "admin sees both workspaces");
  check(admin.accounts.length >= 7, "admin sees seeded accounts");
  check(admin.recentActivity.length > 0, "admin sees activity");

  await command("demo.reset");
  const reset = await json("/api/snapshot?workspace=ws-northstar", { headers: headers() });
  equal(reset.cases.length, 5, "reset restores cases");
  check(!reset.entities.some((item) => item.canonicalName === "HTTP Imported Entity"), "reset removes imported entity");
  check(!reset.documents.some((item) => item.filename === "http-evidence.txt"), "reset removes uploaded metadata");

  console.log(`Production HTTP suite passed with ${assertions} assertions: security, identity, tenancy, authorization, checks, disclosure, judgment, controls, consent, screens, associated people, documents, imports, exports, administration, audit, and reset.`);
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
  await rm(directory, { recursive: true, force: true });
}
