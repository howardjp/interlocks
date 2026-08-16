import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the product surface exposes every end-to-end prototype workflow", async () => {
  const source = await readFile(new URL("../app/components/interlocks-app.tsx", import.meta.url), "utf8");
  for (const label of ["New disclosure", "Review queue", "People & ties", "Matters", "Controls", "Audit trail", "Record decision", "Reset demo data"]) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("the authoritative icon is present byte-for-byte", async () => {
  const icon = await readFile(new URL("../public/interlocks-icon.svg", import.meta.url), "utf8");
  assert.match(icon, /viewBox="425\.5 65\.5 1161\.6 1161\.5999"/);
  assert.match(icon, /fill:#ffdf7e/);
  assert.match(icon, /fill:#073984/);
});
