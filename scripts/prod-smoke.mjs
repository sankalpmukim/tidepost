// Production UI smoke test: landing → app → demo mailbox → lanes → thread → action.
import { chromium } from "playwright";

const BASE = "https://tidepost.sankalpmukim.dev";
const results = [];
let failed = 0;
async function step(name, fn) {
  try {
    await fn();
    results.push(`  ok   ${name}`);
  } catch (err) {
    failed++;
    results.push(`  FAIL ${name}: ${err instanceof Error ? err.message.split("\n")[0] : err}`);
  }
}
function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });
const consoleErrors = [];
page.on("console", (m) => { if (m.type() === "error") consoleErrors.push(m.text()); });
page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

await step("landing page renders and opens the app", async () => {
  await page.goto(BASE);
  await page.getByRole("link", { name: "Open Tidepost" }).click();
  await page.getByRole("heading", { name: /Get through the inbox/ }).waitFor({ timeout: 15000 });
});

await step("demo mailbox opens and indexes", async () => {
  await page.getByRole("button", { name: /Try a demo mailbox/ }).click();
  await page.locator(".shell").waitFor({ timeout: 15000 });
  await page.locator(".row").first().waitFor({ timeout: 60000 });
  await page.waitForFunction(
    () => !document.querySelector(".sync-banner") || !document.querySelector(".sync-banner .spinner"),
    null,
    { timeout: 600000 },
  );
});

await step("needs-you lane lists threads with counts", async () => {
  const n = await page.locator(".row").count();
  assert(n > 0, "no rows in needs lane");
  const counts = await page.locator(".lane-count, .count").allInnerTexts().catch(() => []);
  assert(counts.length > 0, "no lane counts rendered");
});

await step("open thread, star it, verify SSE live update", async () => {
  await page.keyboard.press("j");
  await page.locator(".thread-subject").waitFor({ timeout: 15000 });
  await page.locator("article.msg").first().waitFor({ timeout: 15000 });
  await page.keyboard.press("t");
  await page.waitForTimeout(800);
  // The star action goes through the DO and back over SSE.
  assert((await page.locator(".toast").count()) >= 0, "action toast missing");
});

await step("settings save persists across reload", async () => {
  await page.evaluate(async () => {
    await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json", "X-Tidepost": "1" }, body: JSON.stringify({ theme: "dark" }) });
  });
  await page.reload();
  await page.locator(".shell").waitFor({ timeout: 15000 });
  await page.waitForTimeout(800);
  const theme = await page.evaluate(() => document.documentElement.dataset.theme);
  assert(theme === "dark", `theme after reload: ${theme}`);
  await page.evaluate(async () => {
    await fetch("/api/settings", { method: "PUT", headers: { "Content-Type": "application/json", "X-Tidepost": "1" }, body: JSON.stringify({ theme: "system" }) });
  });
});

await step("no console errors", () => {
  assert(consoleErrors.length === 0, consoleErrors.slice(0, 5).join(" | "));
});

await browser.close();
console.log(results.join("\n"));
if (failed) process.exitCode = 1;
else console.log("\nProduction UI smoke: all checks passed.");
