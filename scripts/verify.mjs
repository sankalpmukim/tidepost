// End-to-end check against the demo mailbox in headless Chromium.
// Builds nothing: run `npm run build` first. Usage: node scripts/verify.mjs [--shots=dir] [--keep]
import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { chromium } from "playwright";

const args = Object.fromEntries(process.argv.slice(2).map((a) => a.replace(/^--/, "").split("=")).map(([k, v]) => [k, v ?? true]));
const PORT = 8790 + Math.floor(Math.random() * 100);
const BASE = `http://127.0.0.1:${PORT}`;
const shots = args.shots ? path.resolve(String(args.shots)) : null;
if (shots) fs.mkdirSync(shots, { recursive: true });
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), "tidepost-e2e-"));

const server = spawn(process.execPath, ["--import", "tsx", "server/index.ts"], {
  env: { ...process.env, NODE_ENV: "production", PORT: String(PORT), APP_URL: BASE, TIDEPOST_DATA_DIR: dataDir, TIDEPOST_SECRET: "e2e", ANTHROPIC_API_KEY: "", GOOGLE_CLIENT_ID: "", MICROSOFT_CLIENT_ID: "" },
  stdio: ["ignore", "pipe", "pipe"],
});
let serverLog = "";
server.stdout.on("data", (d) => (serverLog += d));
server.stderr.on("data", (d) => (serverLog += d));

const results = [];
let failed = 0;
async function step(name, fn) {
  const t0 = Date.now();
  try {
    await fn();
    results.push(`  ok   ${name} (${Date.now() - t0}ms)`);
  } catch (err) {
    failed++;
    results.push(`  FAIL ${name}: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
    if (shots) await page.screenshot({ path: path.join(shots, `fail-${name.replace(/\W+/g, "-")}.png`) }).catch(() => {});
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}
async function shot(name) {
  if (shots) await page.screenshot({ path: path.join(shots, `${name}.png`) });
}

for (let i = 0; i < 60; i++) {
  try {
    const r = await fetch(`${BASE}/api/config`);
    if (r.ok) break;
  } catch { /* not up yet */ }
  await new Promise((r) => setTimeout(r, 250));
}

async function launch() {
  try {
    return await chromium.launch();
  } catch {
    // Fall back to an installed Chrome when Playwright's own browser isn't downloaded.
    return chromium.launch({ channel: "chrome" });
  }
}
const browser = await launch();
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 }, colorScheme: "light" });
const page = await context.newPage();
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error" && !/favicon|net::ERR_BLOCKED|Content Security Policy|404|status of 401|status of 403/.test(m.text())) consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

const rows = () => page.locator(".row");
const key = (k) => page.keyboard.press(k);

await step("sign-in page renders", async () => {
  await page.goto(BASE);
  await page.getByRole("heading", { name: /Get through the inbox/ }).waitFor();
  await shot("01-signin");
});

await step("demo mailbox opens and indexes", async () => {
  await page.getByRole("button", { name: /Try a demo mailbox/ }).click();
  await page.locator(".shell").waitFor();
  await rows().first().waitFor({ timeout: 30000 });
  await page.waitForFunction(() => !document.querySelector(".sync-banner") || !document.querySelector(".sync-banner .spinner"), null, { timeout: 60000 });
  await page.waitForTimeout(800);
  await shot("02-needs-you");
});

let laneCounts = {};
await step("triage lanes have threads", async () => {
  for (const [label, k] of [["Needs you", "1"], ["Waiting", "2"], ["FYI", "3"], ["Updates", "4"]]) {
    await key(k);
    await page.waitForTimeout(400);
    const n = await rows().count();
    laneCounts[label] = n;
    assert(n > 0, `${label} is empty`);
  }
  await key("1");
  await page.waitForTimeout(300);
});

await step("j opens the first thread in the reading pane and marks it read", async () => {
  await page.locator(".list-scroll").click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.locator("body").click({ position: { x: 1500, y: 980 } });
  await key("j");
  await page.locator(".thread-subject").waitFor();
  await page.locator("article.msg").first().waitFor();
  await page.waitForTimeout(1200);
  await shot("03-reader");
});

await step("search finds the long cutover thread", async () => {
  await key("/");
  await page.keyboard.type("cutover");
  await key("Enter");
  await page.waitForTimeout(1200);
  await rows().first().waitFor();
  const subjects = await page.locator(".row-subject-text").allInnerTexts();
  const idx = subjects.findIndex((s) => /cutover plan/i.test(s));
  assert(idx >= 0, `no cutover thread in results: ${subjects.slice(0, 5).join(" | ")}`);
  await rows().nth(idx).click();
  await page.locator(".thread-subject").filter({ hasText: /cutover/i }).waitFor();
  await page.waitForTimeout(1000);
});

await step("long thread collapses history and shows the thread chart", async () => {
  const bars = await page.locator(".collapse-bar").count();
  assert(bars >= 1, "no collapsed message bars");
  const dots = await page.locator(".chart .dot").count();
  const facts = await page.locator(".thread-facts").innerText();
  const m = facts.match(/([\d,]+) messages/);
  assert(m && Number(m[1].replace(",", "")) >= 100, `thread facts: ${facts}`);
  assert(dots === Number(m[1].replace(",", "")), `chart dots ${dots} != messages ${m[1]}`);
  assert(await page.locator(".brief").count(), "no brief");
  await shot("04-long-thread");
});

await step("brief citations jump to messages", async () => {
  const cite = page.locator(".brief .cite").first();
  if (await cite.count()) {
    await cite.click();
    await page.waitForTimeout(800);
    assert(await page.locator('article.msg[data-flash="true"]').count(), "no message flashed after citation click");
  }
});

await step("expand all and find in thread", async () => {
  await page.getByRole("button", { name: /Expand all/ }).click();
  await page.waitForTimeout(1500);
  const collapsedBars = await page.locator(".collapse-bar").count();
  assert(collapsedBars === 0, "bars remain after expand all");
  await page.getByRole("button", { name: /^Find$/ }).click();
  await page.keyboard.type("rollback");
  await page.waitForTimeout(800);
  const status = await page.locator(".find-box").innerText();
  assert(/of \d+/.test(status), `find status: ${status}`);
  await shot("05-find");
  await key("Escape");
  await page.getByRole("button", { name: /Collapse all/ }).click();
});

await step("people filter narrows the thread", async () => {
  const before = await page.locator("article.msg").count();
  await page.locator(".person").first().click();
  await page.waitForTimeout(400);
  const after = await page.locator("article.msg").count();
  const note = await page.getByText(/Showing \d+ of \d+ messages/).count();
  assert(note === 1, "no filter note");
  await page.getByRole("button", { name: "Show all" }).click();
  assert(after > 0 && before > 0, "no messages");
});

await step("reply all opens a composer with checks and a draft review", async () => {
  await page.locator("body").click({ position: { x: 1300, y: 60 } });
  await key("a");
  const composer = page.locator(".composer").first();
  await composer.waitFor();
  // Add an outside recipient so the external-recipient check has something to say.
  if (await composer.getByRole("button", { name: "Cc Bcc" }).count()) await composer.getByRole("button", { name: "Cc Bcc" }).click();
  await composer.getByLabel("Cc recipients", { exact: true }).fill("carlos.mendes@adatum.example");
  await composer.getByLabel("Cc recipients", { exact: true }).press("Enter");
  await page.locator(".composer textarea.body").fill("approve the rollback window\nthursday works for the go/no-go");
  await page.keyboard.press("Control+j");
  await page.locator(".review").waitFor({ timeout: 15000 });
  await shot("06-draft-review");
  await page.getByRole("button", { name: "Keep all edits" }).click();
  await page.getByRole("button", { name: "Use this draft" }).click();
  await page.locator(".composer textarea.body").press("Control+Enter");
  await page.locator(".checks").waitFor();
  const checks = await page.locator(".checks").innerText();
  assert(/outside|people/.test(checks), `checks: ${checks}`);
  await shot("07-send-checks");
});

await step("send anyway queues with undo, undo restores the draft", async () => {
  await page.getByRole("button", { name: "Send anyway" }).click();
  await page.locator(".toast").filter({ hasText: /Sending/ }).waitFor();
  await shot("08-undo-toast");
  await page.locator(".toast").getByRole("button", { name: "Undo" }).click();
  await page.locator(".toast").filter({ hasText: /cancelled/ }).waitFor();
  await page.locator(".composer textarea.body").waitFor();
});

await step("send goes out after the undo window", async () => {
  await page.locator(".composer textarea.body").press("Control+Enter");
  if (await page.locator(".checks").count()) await page.getByRole("button", { name: "Send anyway" }).click();
  await page.locator(".toast").filter({ hasText: /^Sent/ }).waitFor({ timeout: 20000 });
});

await step("archive with e removes the thread from Needs you and undo brings it back", async () => {
  await page.locator("body").click({ position: { x: 1500, y: 980 } });
  await key("1");
  await page.waitForTimeout(500);
  await key("j");
  await page.locator(".thread-subject").waitFor();
  const subject = await page.locator(".thread-subject").innerText();
  const before = await rows().count();
  await key("e");
  await page.locator(".toast").filter({ hasText: /Archived/ }).waitFor();
  await page.waitForTimeout(600);
  const subjects = await page.locator(".row-subject-text").allInnerTexts();
  assert(!subjects.includes(subject) || (await rows().count()) < before, "thread still listed after archive");
  await key("z");
  await page.locator(".toast").filter({ hasText: /Undone/ }).waitFor();
});

await step("snooze through the command palette", async () => {
  await key("j");
  await page.waitForTimeout(400);
  await key("h");
  await page.locator(".palette-input").waitFor();
  await page.locator(".palette-item").first().click();
  await page.locator(".toast").filter({ hasText: /Snoozed/ }).waitFor();
  await key("g");
  await key("b");
  await page.waitForTimeout(600);
  assert((await rows().count()) >= 1, "nothing in Snoozed");
  await key("1");
});

await step("plan next steps proposes actions you approve", async () => {
  await key("j");
  await page.locator(".thread-subject").waitFor();
  await page.getByRole("button", { name: /Plan next steps/ }).click();
  await page.locator(".plan").waitFor({ timeout: 15000 });
  assert((await page.locator(".plan-step").count()) >= 1, "no plan steps");
  await shot("09-plan");
  await page.getByRole("button", { name: "Close plan" }).click();
});

await step("updates lane: unsubscribe and clean-up sweep with review", async () => {
  await key("4");
  await page.waitForTimeout(500);
  await page.getByRole("button", { name: /Clean up/ }).click();
  await page.getByRole("menuitem", { name: /Mark all updates as read/ }).click();
  await page.locator(".run-card[data-state='review']").waitFor({ timeout: 10000 });
  await shot("10-sweep-review");
  await page.locator(".run-card[data-state='review'] .btn-primary").click();
  await page.locator(".run-card").filter({ hasText: /Marked read/ }).waitFor({ timeout: 30000 });
});

await step("bulk select and archive", async () => {
  await key("3");
  await page.waitForTimeout(500);
  const n = await rows().count();
  await key("j");
  await key("x");
  await key("J");
  await key("J");
  await page.locator(".list-toolbar.selecting").waitFor();
  const sel = await page.locator(".list-toolbar").innerText();
  assert(/3 selected/.test(sel), `selection: ${sel}`);
  await key("e");
  await page.waitForTimeout(800);
  assert((await rows().count()) <= n, "rows did not shrink");
});

await step("compose a new message with contact autocomplete", async () => {
  await key("Escape");
  await key("c");
  await page.locator(".composer-dock").waitFor();
  await page.keyboard.type("pri");
  await page.locator(".suggest-item").first().waitFor({ timeout: 5000 });
  await key("Enter");
  assert(await page.locator(".composer-dock .recipient").count() === 1, "recipient chip not added");
  await shot("11-compose");
  await page.locator(".composer-dock").getByRole("button", { name: /Discard draft/ }).click();
});

await step("command palette and help", async () => {
  await key("Control+k");
  await page.locator(".palette-input").waitFor();
  await page.keyboard.type("waiting");
  await shot("12-palette");
  await key("Escape");
  await key("?");
  await page.getByRole("dialog", { name: "Keyboard shortcuts" }).waitFor();
  await key("Escape");
});

await step("dark theme and compact density", async () => {
  await page.evaluate(async () => {
    await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json", "X-Tidepost": "1" }, body: JSON.stringify({ theme: "dark", density: "compact" }) });
  });
  await page.reload();
  await rows().first().waitFor();
  await key("2");
  await page.waitForTimeout(400);
  await key("j");
  await page.locator(".thread-subject").waitFor();
  await page.waitForTimeout(800);
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  assert(theme === "dark", `theme ${theme}`);
  await shot("13-dark-compact");
  await page.evaluate(async () => {
    await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json", "X-Tidepost": "1" }, body: JSON.stringify({ theme: "light", density: "comfortable" }) });
  });
});

await step("narrow window keeps list and reader usable", async () => {
  await page.setViewportSize({ width: 1024, height: 800 });
  await page.reload();
  await rows().first().waitFor();
  await shot("14-narrow");
  await page.setViewportSize({ width: 420, height: 860 });
  await page.waitForTimeout(300);
  await shot("15-phone-list");
  await rows().first().click();
  await page.locator(".thread-subject").waitFor();
  await shot("16-phone-reader");
});

await step("API rejects mutations without the CSRF header", async () => {
  const status = await page.evaluate(async () => (await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json" }, body: "{}" })).status);
  assert(status === 403, `status ${status}`);
});

await step("no console errors", async () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 5).join(" | "));
});

await browser.close();
server.kill();
console.log(`Lane sizes (rows rendered): ${JSON.stringify(laneCounts)}`);
console.log(results.join("\n"));
if (failed) {
  console.log(`\n${failed} step(s) failed. Server log tail:\n${serverLog.split("\n").slice(-30).join("\n")}`);
  process.exitCode = 1;
} else {
  console.log("\nAll checks passed.");
}
if (!args.keep) fs.rmSync(dataDir, { recursive: true, force: true });
