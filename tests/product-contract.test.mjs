import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function sources(paths) { return (await Promise.all(paths.map((path) => readFile(new URL(path, import.meta.url), "utf8")))).join("\n"); }

test("the product surface exposes the person-first MVP workflows", async () => {
  const source = await sources(["../app/components/interlocks-app.tsx","../app/components/pages/review-pages.tsx","../app/components/pages/checks-knowledge.tsx","../app/components/pages/ledger-associated.tsx","../app/components/pages/portfolio-admin.tsx","../app/components/pages/admin-console.tsx","../app/components/pages/data-audit.tsx","../app/invite/[token]/page.tsx"]);
  for (const label of ["New disclosure","Conflict checks","Review queue","My ledger","Knowledge","Family & associated","Imports & exports","Audit trail","Record human disposition","Consent and waivers","Professional screens","Platform admin","View as","Accept invitation","Reset demo data","Jurisdictional Policy Engine","Installed legal authority packs","Choose authority independently"]) assert.ok(source.includes(label),`Missing ${label}`);
  assert.doesNotMatch(source,/riskScore|riskLevel|score-ring|numeric score/i);
});

test("the authoritative icon is present byte-for-byte", async () => {
  const icon = await readFile(new URL("../public/interlocks-icon.svg", import.meta.url));
  assert.equal(createHash("sha256").update(icon).digest("hex"),"cf25be839bef85148f766fbbaa7dbb719602b535d71808565bbb21a4c9af6411");
});

test("the icon boundary uses the approved brand color without altering the mark", async () => {
  const styles = await readFile(new URL("../app/globals.css", import.meta.url), "utf8");
  assert.match(styles,/--brand-outline:#05285bff/); assert.match(styles,/\.brand img\{[^}]*border:1px solid var\(--brand-outline\)/); assert.match(styles,/\.loading-screen img,\.fatal-screen img\{[^}]*border:1px solid var\(--brand-outline\)/);
});

test("dark mode is system-aware, persistent, and accessible", async () => {
  const layout=await readFile(new URL("../app/layout.tsx",import.meta.url),"utf8"); const source=await readFile(new URL("../app/components/interlocks-app.tsx",import.meta.url),"utf8"); const styles=await readFile(new URL("../app/globals.css",import.meta.url),"utf8");
  assert.match(layout,/strategy="beforeInteractive"/); assert.match(layout,/prefers-color-scheme: dark/); assert.match(source,/interlocks:theme:v1/); assert.match(source,/localStorage\.setItem\(THEME_KEY,next\)/); assert.match(source,/aria-label=\{`Use \$\{theme==="dark"\?"light":"dark"\} mode`\}/); assert.match(styles,/html\[data-theme="dark"\]/);
});

test("deployment preparation includes managed auth, security headers, migrations, health, and CI", async () => {
  const source=await sources(["../proxy.ts","../lib/auth/identity-provider.mjs","../lib/config.mjs","../lib/persistence/sqlite-interlocks-repository.mjs","../next.config.ts","../app/api/health/route.js","../.github/workflows/ci.yml"]);
  for(const marker of ["authkit","WorkOSIdentityProvider","WORKOS_COOKIE_PASSWORD","Content-Security-Policy","schemaVersion","npm run test:all","playwright install"]) assert.match(source,new RegExp(marker));
  assert.match(source,/INTERLOCKS_DEMO_MODE must be false in production/); assert.match(source,/INVITE_ONLY/);
});
