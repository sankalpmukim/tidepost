// Full Google sign-in → sync → triage → archive → send, with Google's
// endpoints mocked at the fetch layer and the real Hono app in between.
import { beforeAll, describe, expect, it, vi } from "vitest";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

process.env.TIDEPOST_DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tidepost-flow-"));
process.env.TIDEPOST_SECRET = "flow-secret";
process.env.GOOGLE_CLIENT_ID = "cid.apps.googleusercontent.com";
process.env.GOOGLE_CLIENT_SECRET = "csecret";
process.env.APP_URL = "http://localhost:5173";
process.env.TIDEPOST_POLL_SECONDS = "3600";

const ME = "alex@northwind.example";
const b64url = (s: string) => Buffer.from(s).toString("base64url");
const idToken = `${b64url('{"alg":"none"}')}.${b64url(JSON.stringify({ email: ME, name: "Alex Morgan", sub: "123" }))}.sig`;

interface Call { method: string; url: URL; body: string }
const calls: Call[] = [];

const gmailMessage = {
  id: "msg1",
  threadId: "thr1",
  labelIds: ["INBOX", "UNREAD"],
  snippet: "Could you approve the SOW by Friday?",
  internalDate: String(Date.now() - 3600_000),
  sizeEstimate: 2048,
  payload: {
    mimeType: "multipart/alternative",
    headers: [
      { name: "From", value: '"Priya Nair" <priya@contoso.example>' },
      { name: "To", value: `Alex Morgan <${ME}>` },
      { name: "Subject", value: "SOW for Q1" },
      { name: "Date", value: new Date().toUTCString() },
      { name: "Message-ID", value: "<sow@contoso.example>" },
    ],
  },
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

beforeAll(() => {
  vi.stubGlobal("fetch", async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const body = typeof init.body === "string" ? init.body : init.body ? String(init.body) : "";
    calls.push({ method: init.method ?? "GET", url, body });
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
      if (p === "/messages/batchModify") return new Response(null, { status: 204 });
      if (p === "/messages/send") return json({ id: "sent1", threadId: "thr1", labelIds: ["SENT"] });
      if (p === "/history") return json({ historyId: "1001" });
    }
    return new Response("not mocked: " + url.href, { status: 599 });
  });
});

describe("Google sign-in to send", () => {
  let cookie = "";
  let accountId = "";

  it("redirects to Google and completes the callback", async () => {
    const { app } = await import("../server/app");
    const start = await app.request("/api/auth/google/start");
    expect(start.status).toBe(302);
    const loc = new URL(start.headers.get("location")!);
    const state = loc.searchParams.get("state")!;
    const oauthCookie = start.headers.get("set-cookie")!.split(";")[0];
    const cb = await app.request(`/api/auth/google/callback?code=authcode&state=${state}`, { headers: { cookie: oauthCookie } });
    expect(cb.status).toBe(302);
    expect(cb.headers.get("location")).toMatch(/^\/app\?account=acc_/);
    accountId = decodeURIComponent(cb.headers.get("location")!.split("account=")[1]);
    const setCookies = cb.headers.getSetCookie();
    cookie = setCookies.find((c) => c.startsWith("tp_session="))!.split(";")[0];
    const tokenCall = calls.find((c) => c.url.host === "oauth2.googleapis.com")!;
    expect(tokenCall.body).toContain("code_verifier=");
    expect(tokenCall.body).toContain("grant_type=authorization_code");
  });

  it("indexes the mailbox and puts the direct ask in Needs you", async () => {
    const { syncNow } = await import("../server/sync");
    const { app } = await import("../server/app");
    await syncNow(accountId);
    const me = await (await app.request("/api/me", { headers: { cookie } })).json() as { accounts: { email: string; provider: string }[] };
    expect(me.accounts[0]).toMatchObject({ email: ME, provider: "gmail" });
    const page = await (await app.request(`/api/accounts/${accountId}/threads?view=needs`, { headers: { cookie } })).json() as { threads: { id: string; subject: string; lane: string }[] };
    expect(page.threads).toHaveLength(1);
    expect(page.threads[0]).toMatchObject({ id: "thr1", subject: "SOW for Q1", lane: "needs" });
  });

  it("archives through Gmail batchModify", async () => {
    const { app } = await import("../server/app");
    const res = await app.request(`/api/accounts/${accountId}/actions`, {
      method: "POST", headers: { cookie, "content-type": "application/json", "x-tidepost": "1" },
      body: JSON.stringify({ threadIds: ["thr1"], action: { type: "archive" } }),
    });
    expect(res.status).toBe(200);
    const modify = calls.find((c) => c.url.pathname.endsWith("/messages/batchModify"))!;
    expect(JSON.parse(modify.body)).toMatchObject({ ids: ["msg1"], removeLabelIds: ["INBOX"] });
    const needs = await (await app.request(`/api/accounts/${accountId}/threads?view=needs`, { headers: { cookie } })).json() as { threads: unknown[] };
    expect(needs.threads).toHaveLength(0);
  });

  it("sends a threaded reply through the queue", async () => {
    const { app } = await import("../server/app");
    const { processQueue } = await import("../server/mail");
    const res = await app.request(`/api/accounts/${accountId}/send?now=1`, {
      method: "POST", headers: { cookie, "content-type": "application/json", "x-tidepost": "1" },
      body: JSON.stringify({ to: [{ name: "Priya Nair", email: "priya@contoso.example" }], cc: [], bcc: [], subject: "Re: SOW for Q1", text: "Approved.", attachments: [], mode: "reply", inReplyTo: { messageId: "msg1", threadId: "thr1" }, quotedHtml: null, quotedText: "Could you approve?" }),
    });
    expect(res.status).toBe(200);
    await processQueue();
    for (let i = 0; i < 20 && !calls.some((c) => c.url.pathname.endsWith("/messages/send")); i++) await new Promise((r) => setTimeout(r, 50));
    const send = calls.find((c) => c.url.pathname.endsWith("/messages/send"))!;
    const payload = JSON.parse(send.body) as { raw: string; threadId: string };
    expect(payload.threadId).toBe("thr1");
    const raw = Buffer.from(payload.raw, "base64url").toString("utf8");
    expect(raw).toContain("In-Reply-To: <sow@contoso.example>");
    expect(raw).toContain("Subject: Re: SOW for Q1");
    expect(raw).toContain("To: \"Priya Nair\" <priya@contoso.example>");
  });

  it("rejects mutations without the CSRF header and requests without a session", async () => {
    const { app } = await import("../server/app");
    const noHeader = await app.request(`/api/accounts/${accountId}/actions`, { method: "POST", headers: { cookie, "content-type": "application/json" }, body: "{}" });
    expect(noHeader.status).toBe(403);
    const noSession = await app.request(`/api/accounts/${accountId}/threads`);
    expect(noSession.status).toBe(401);
  });
});
