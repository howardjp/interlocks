import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the product surface exposes every end-to-end prototype workflow", async () => {
  const source = await readFile(new URL("../app/components/interlocks-app.tsx", import.meta.url), "utf8");
  for (const label of ["New disclosure", "Review queue", "People & ties", "Matters", "Controls", "Audit trail", "Record decision", "Reset demo data"]) {
    assert.match(source, new RegExp(label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
});

test("the authoritative icon is present byte-for-byte", async () => {
  const icon = await readFile(new URL("../public/interlocks-icon.svg", import.meta.url));
  assert.equal(
    createHash("sha256").update(icon).digest("hex"),
    "cf25be839bef85148f766fbbaa7dbb719602b535d71808565bbb21a4c9af6411",
  );
});

test("the icon boundary uses the approved brand color without altering the mark", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles, /--brand-outline:#05285bff/);
  assert.match(styles, /\.brand img\{[^}]*border:1px solid var\(--brand-outline\)/);
  assert.match(styles, /\.loading-screen img,\.fatal-screen img\{[^}]*border:1px solid var\(--brand-outline\)/);
});

test("dark mode is system-aware, persistent, and accessible", async () => {
  const layout = await readFile(new URL("../app/layout.tsx", import.meta.url), "utf8");
  const source = await readFile(new URL("../app/components/interlocks-app.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(layout, /strategy="beforeInteractive"/);
  assert.match(layout, /prefers-color-scheme: dark/);
  assert.match(source, /THEME_STORAGE_KEY = "interlocks:theme:v1"/);
  assert.match(source, /localStorage\.setItem\(THEME_STORAGE_KEY,next\)/);
  assert.match(source, /aria-label=\{`Switch to \$\{theme==="dark"\?"light":"dark"\} mode`\}/);
  assert.match(styles, /html\[data-theme="dark"\]/);
});
