import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";

const port = "4310";
const base = `http://127.0.0.1:${port}`;
const directory = await mkdtemp(join(tmpdir(), "interlocks-http-"));
let stderr = "";
const server = spawn(
  process.execPath,
  ["node_modules/next/dist/bin/next", "start", "-H", "127.0.0.1", "-p", port],
  {
    cwd: process.cwd(),
    env: { ...process.env, INTERLOCKS_DB_PATH: join(directory, "interlocks.db") },
    stdio: ["ignore", "ignore", "pipe"],
  },
);
server.stderr.on("data", (chunk) => { stderr += chunk.toString(); });

async function waitUntilReady() {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    try {
      const response = await fetch(base);
      if (response.ok) return;
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Production server did not become ready. ${stderr}`);
}

async function json(path, options) {
  const response = await fetch(base + path, options);
  if (!response.ok) throw new Error(`${path}: ${response.status} ${await response.text()}`);
  return response.json();
}

try {
  await waitUntilReady();
  const htmlResponse = await fetch(base);
  assert.equal(htmlResponse.status, 200);
  assert.match(await htmlResponse.text(), /Interlocks/);

  let snapshot = await json("/api/snapshot");
  assert.equal(snapshot.cases.length, 5);
  const disclosure = await json("/api/disclosures", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      personId: "p-jordan",
      matterId: "m-northstar",
      organizationId: "o-civic",
      relationshipType: "Outside employment",
      description: "Paid advisory work that overlaps the active hiring panel.",
      influence: "recommend",
      financialValue: 5000,
      title: "Advisory role overlaps hiring panel",
    }),
  });
  assert.equal(disclosure.result.reference, "INT-2026-0042");
  const caseId = disclosure.result.id;

  await json(`/api/cases/${caseId}/actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ type: "note", body: "Employment agreement received and reviewed." }),
  });
  await json(`/api/cases/${caseId}/actions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      type: "decision",
      outcome: "Recuse",
      rationale: "The direct advisory relationship and recommendation authority require removal from the panel.",
      controlDescription: "Remove Jordan from the Northstar panel and revoke candidate packet access.",
      ownerId: "p-alex",
      dueAt: "2026-08-18",
    }),
  });

  snapshot = await json("/api/snapshot");
  assert.equal(snapshot.cases.length, 6);
  assert.equal(snapshot.cases.find((item) => item.id === caseId).status, "Managed");
  assert.equal(snapshot.notes.some((item) => item.caseId === caseId), true);
  const control = snapshot.controls.find((item) => item.caseId === caseId);
  assert.ok(control);
  await json(`/api/controls/${control.id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: "{}",
  });

  snapshot = await json("/api/snapshot");
  assert.equal(snapshot.controls.find((item) => item.id === control.id).status, "Complete");
  const csv = await fetch(`${base}/api/export?format=csv`);
  assert.match(csv.headers.get("content-type"), /text\/csv/);
  assert.match(await csv.text(), /INT-2026-0042/);
  const exported = await fetch(`${base}/api/export?format=json`);
  assert.match(exported.headers.get("content-type"), /application\/json/);

  await json("/api/reset", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
  assert.equal((await json("/api/snapshot")).cases.length, 5);
  console.log("HTTP workflow passed: load, disclose, note, decide, control, export, and reset.");
} finally {
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
  await rm(directory, { recursive: true, force: true });
}
