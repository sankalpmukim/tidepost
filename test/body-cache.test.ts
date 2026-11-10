// Regression test: bodies whose JSON exceeds the storage cap must be clamped
// on write, never sliced mid-string, and corrupt cached rows must self-heal
// instead of throwing "Unterminated string in JSON at position 40000".
import { beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.TIDEPOST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tidepost-body-"));
process.env.TIDEPOST_SECRET = "body-secret";
process.env.GOOGLE_CLIENT_ID = "cid.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "csecret";
process.env.APP_URL = "http://localhost:5173";
process.env.TIDEPOST_POLL_SECONDS = "3600";

const ME = "alex@northwind.example";
const b64url = (s: string) => Buffer.from(s).toString("base64url");
const idToken = `${b64url('{"alg":"none"}')}.${b64url(JSON.stringify({ email: ME, name: "Alex Morgan", sub: "123" }))}.sig`;

// Big enough that JSON.stringify({html, text, uniqueText, ...}) blows past BODY_JSON_MAX (40k).
const bigHtml = `<html><body><h1>Quarterly report</h1><p>${"x".repeat(80_000)}</p></body></html>`;

const gmailMessage = {
  id: "msg1",
  threadId: "thr1",
  labelIds: ["INBOX", "UNREAD"],
  snippet: "Quarterly report",
  internalDate: String(Date.now() - 3600_000),
  sizeEstimate: 90_000,
  payload: {
    mimeType: "multipart/alternative",
    headers: [
      { name: "From", value: '"Priya Nair" <priya@contoso.example>' },
      { name: "To", value: `Alex Morgan <${ME}>` },
      { name: "Subject", value: "Quarterly report" },
      { name: "Date", value: new Date().toUTCString() },
      { name: "Message-ID", value: "<report@contoso.example>" },
    ],
    parts: [{ mimeType: "text/html", body: { data: b64url(bigHtml) } }],
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeAll(() => {
  vi.stubGlobal("fetch", async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.host === "oauth2.googleapis.com") {
      return json({ access_token: "at", refresh_token: "rt", expires_in: 3600, scope: "openid email profile https://www.googleapis.com/auth/gmail.modify", id_token: idToken, token_type: "Bearer" });
    }
    if (url.host === "gmail.googleapis.com") {
      const p = url.pathname.replace("/gmail/v1/users/me", "");
      if (p === "/profile") return json({ emailAddress: ME, historyId: "1000", messagesTotal: 1 });
      if (p === "/messages" && (init.method ?? "GET") === "GET") return json({ messages: [{ id: "msg1", threadId: "thr1" }], resultSizeEstimate: 1 });
      if (p === "/messages/msg1") return json(gmailMessage);
      if (p === "/threads/thr1") return json({ id: "thr1", messages: [gmailMessage] });
      if (p === "/labels") return json({ labels: [{ id: "INBOX", name: "INBOX", type: "system" }] });
      if (p.startsWith("/labels/")) return json({ id: "INBOX", name: "INBOX", type: "system", messagesUnread: 1, messagesTotal: 1 });
      if (p === "/history") return json({ historyId: "1001" });
    }
    return new Response("not mocked: " + url.href, { status: 599 });
  });
});

describe("oversized body clamping", () => {
  let cookie = "";
  let accountId = "";

  beforeAll(async () => {
    const { app } = await import("../server/app");
    const start = await app.request("/api/auth/google/start");
    const state = new URL(start.headers.get("location")!).searchParams.get("state")!;
    const oauthCookie = start.headers.get("set-cookie")!.split(";")[0];
    const cb = await app.request(`/api/auth/google/callback?code=authcode&state=${state}`, { headers: { cookie: oauthCookie } });
    accountId = decodeURIComponent(cb.headers.get("location")!.split("account=")[1]);
    cookie = cb.headers.getSetCookie().find((c) => c.startsWith("tp_session="))!.split(";")[0];
    const { syncNow } = await import("../server/sync");
    await syncNow(accountId);
  });

  it("stores a parseable body within the cap and serves the thread", async () => {
    const { app } = await import("../server/app");
    const { persist } = await import("../server/persist");
    const { BODY_JSON_MAX } = await import("../server/limits");
    const res = await app.request(`/api/accounts/${accountId}/threads/thr1`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const stored = await persist().getBody(accountId, "msg1");
    expect(stored).not.toBeNull();
    expect(stored!.length).toBeLessThanOrEqual(BODY_JSON_MAX);
    const parsed = JSON.parse(stored!) as { html: string | null; text: string };
    expect(parsed.html).toBeTruthy();
    expect(parsed.text).toBeTruthy();
  });

  it("serves the thread again from cache", async () => {
    const { app } = await import("../server/app");
    const res = await app.request(`/api/accounts/${accountId}/threads/thr1`, { headers: { cookie } });
    expect(res.status).toBe(200);
  });

  it("self-heals a cached row truncated mid-string by the old slice", async () => {
    const { app } = await import("../server/app");
    const { persist } = await import("../server/persist");
    const good = (await persist().getBody(accountId, "msg1"))!;
    expect(good.length).toBeGreaterThan(10_000); // big enough for the slice to land mid-string
    const corrupt = good.slice(0, good.length - 100); // the legacy mid-string truncation
    expect(() => JSON.parse(corrupt)).toThrow();
    await persist().putBody(accountId, "msg1", corrupt);
    const res = await app.request(`/api/accounts/${accountId}/threads/thr1`, { headers: { cookie } });
    expect(res.status).toBe(200);
    const healed = await persist().getBody(accountId, "msg1");
    expect(() => JSON.parse(healed!)).not.toThrow();
  });
});
