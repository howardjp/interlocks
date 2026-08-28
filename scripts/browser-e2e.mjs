import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";

const port = "4311";
const base = `http://127.0.0.1:${port}`;
const directory = await mkdtemp(join(tmpdir(), "interlocks-browser-"));
let stderr = "";
let assertions = 0;
const check = (condition, message) => { assertions += 1; assert.ok(condition, message); };
const equal = (actual, expected, message) => { assertions += 1; assert.equal(actual, expected, message); };
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
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try { if ((await fetch(`${base}/api/health`)).ok) return; } catch {}
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Production server did not become ready. ${stderr}`);
}

let browser;
try {
  await waitUntilReady();
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await context.newPage();
  const runtimeErrors = [];
  page.on("console", (message) => { if (message.type() === "error") runtimeErrors.push(`console: ${message.text()}`); });
  page.on("pageerror", (error) => runtimeErrors.push(`page: ${error.message}`));
  page.on("response", (response) => { if (response.status() >= 500) runtimeErrors.push(`http ${response.status()}: ${response.url()}`); });

  await page.goto(base, { waitUntil: "networkidle" });
  await page.getByRole("heading", { name: "What needs attention", exact: true }).waitFor();
  equal(await page.title(), "Interlocks — Conflicts, clearly managed", "document title");
  equal(await page.locator("img[src='/interlocks-icon.svg']").first().getAttribute("src"), "/interlocks-icon.svg", "authoritative mark renders");

  const themeButton = page.getByRole("button", { name: "Use dark mode" });
  await themeButton.click();
  equal(await page.locator("html").getAttribute("data-theme"), "dark", "dark theme applies");
  await page.reload({ waitUntil: "networkidle" });
  equal(await page.locator("html").getAttribute("data-theme"), "dark", "dark theme persists");
  await page.getByRole("button", { name: "Use light mode" }).click();

  const disclosureButton = page.getByRole("button", { name: "New disclosure" });
  await disclosureButton.click();
  const focusDialog = page.getByRole("dialog", { name: "Record a relationship" });
  await focusDialog.waitFor();
  equal(await page.evaluate(() => document.activeElement?.getAttribute("role")), "dialog", "dialog receives focus");
  await focusDialog.getByRole("button", { name: "Record and queue" }).focus();
  await page.keyboard.press("Tab");
  equal(await page.evaluate(() => document.activeElement?.getAttribute("aria-label")), "Close", "dialog focus wraps");
  await page.keyboard.press("Escape");
  await focusDialog.waitFor({ state: "detached" });
  equal(await page.evaluate(() => document.activeElement?.textContent?.trim()), "New disclosure", "focus returns to trigger");

  await disclosureButton.click();
  const disclosure = page.getByRole("dialog", { name: "Record a relationship" });
  await disclosure.locator("select[name='personId']").selectOption("p-jordan");
  await disclosure.locator("select[name='matterId']").selectOption("m-northstar");
  await disclosure.locator("select[name='entityId']").selectOption("o-civic");
  await disclosure.locator("input[name='relationshipType']").fill("Browser regression relationship");
  await disclosure.locator("textarea[name='description']").fill("End-to-end browser evidence for disclosure creation.");
  await disclosure.locator("select[name='disclosureClass']").selectOption("PORTABLE");
  await disclosure.getByRole("button", { name: "Record and queue" }).click();
  await disclosure.waitFor({ state: "detached" });
  await page.getByRole("status").waitFor();

  await page.getByRole("button", { name: "Conflict checks", exact: true }).click();
  await page.getByRole("heading", { name: "Check before acting", exact: true }).waitFor();
  await page.getByRole("button", { name: "New check" }).click();
  const checkDialog = page.getByRole("dialog", { name: "Run a conflict check" });
  await checkDialog.locator("select[name='matterId']").selectOption("m-aster");
  await checkDialog.locator("select[name='subjectEntityIds']").selectOption("o-meridian");
  await checkDialog.getByRole("button", { name: "Run check" }).click();
  await checkDialog.waitFor({ state: "detached" });
  check((await page.locator(".hit-card").count()) > 0, "check renders explainable hits");
  check((await page.locator(".hit-card").first().innerText()).includes("no legal conclusion"), "hit disclaims legal conclusion");

  await page.getByRole("button", { name: "Review queue", exact: true }).click();
  await page.getByRole("heading", { name: "Review queue", exact: true }).waitFor();
  await page.getByLabel("Search cases").fill("Browser regression relationship");
  equal(await page.locator(".case-record").count(), 1, "created disclosure appears in review queue");
  await page.locator(".case-record").click();
  const caseDrawer = page.getByRole("dialog");
  await caseDrawer.getByPlaceholder("Evidence, question, or outside information needed…").fill("Browser review note.");
  await caseDrawer.getByRole("button", { name: "Add review note" }).click();
  await page.getByText("Browser review note.", { exact: true }).waitFor();
  await page.keyboard.press("Escape");
  await caseDrawer.waitFor({ state: "detached" });

  await page.getByRole("button", { name: "Knowledge", exact: true }).click();
  await page.getByRole("button", { name: "Upload" }).click();
  const upload = page.getByRole("dialog", { name: "Upload immutable document" });
  await upload.locator("input[type='file']").setInputFiles({ name: "browser-evidence.txt", mimeType: "text/plain", buffer: Buffer.from("immutable browser evidence") });
  await upload.locator("input[name='description']").fill("Browser upload contract");
  await upload.getByRole("button", { name: "Save record" }).click();
  await upload.waitFor({ state: "detached" });
  await page.getByText("browser-evidence.txt", { exact: true }).waitFor();

  await page.getByRole("button", { name: "Imports & exports", exact: true }).click();
  const csv = page.locator("textarea.code-input");
  await csv.fill("name,kind,jurisdiction\nBrowser Imported Entity,ORGANIZATION,DC");
  await page.getByRole("button", { name: "Validate preview" }).click();
  await page.getByText("VALID", { exact: true }).waitFor();
  await page.getByRole("button", { name: "Commit all rows" }).click();
  await page.getByRole("button", { name: "Portfolio", exact: true }).click();
  await page.getByText("Browser Imported Entity", { exact: true }).waitFor();

  for (const [navigation, heading] of [
    ["Dashboard", "What needs attention"], ["My ledger", "My portable ledger"], ["Associated people", "Associated people"],
    ["Audit trail", "Audit trail"], ["Settings", "People, roles, and policy"], ["Platform admin", "Global administration"],
  ]) {
    await page.getByRole("button", { name: navigation, exact: true }).click();
    await page.getByRole("heading", { name: heading, exact: true }).waitFor();
    assertions += 1;
  }

  const unnamedButtons = await page.locator("button").evaluateAll((buttons) => buttons.filter((button) => !(button.getAttribute("aria-label") || button.textContent?.trim() || button.getAttribute("title"))).length);
  equal(unnamedButtons, 0, "all visible buttons have an accessible name source");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload({ waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open navigation" }).click();
  check(await page.locator(".sidebar").evaluate((element) => element.classList.contains("mobile-open")), "mobile navigation opens");
  await page.getByRole("button", { name: "Close navigation" }).click();
  check(!(await page.locator(".sidebar").evaluate((element) => element.classList.contains("mobile-open"))), "mobile navigation closes");
  check(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), "mobile page has no horizontal overflow");

  equal(runtimeErrors.length, 0, runtimeErrors.join("\n") || "no browser runtime errors");
  console.log(`Browser E2E passed with ${assertions} assertions: rendering, accessibility, themes, disclosure, checks, review, upload, imports, navigation, and responsive layout.`);
} finally {
  await browser?.close();
  server.kill("SIGTERM");
  await new Promise((resolve) => server.once("exit", resolve));
  await rm(directory, { recursive: true, force: true });
}
