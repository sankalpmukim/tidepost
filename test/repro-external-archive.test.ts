// Repro: archive a thread in Gmail (outside Tidepost) → incremental sync →
// the thread must leave the inbox views, like Gmail's own inbox behaves.
import { beforeAll, describe, expect, it, vi } from "vitest";
import { createHarness, initTestConfig } from "./harness";

initTestConfig();

const ME = "alex@northwind.example";
const b64url = (s: string) => Buffer.from(s).toString("base64url");
const idToken = `${b64url('{"alg":"none"}')}.${b64url(JSON.stringify({ email: ME, name: "Alex Morgan", sub: "123" }))}.sig`;

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

// Mutable Gmail-side state: starts in INBOX, gets archived externally.
const labels = new Set(["INBOX", "UNREAD"]);
let archivedExternally = false;
let historyConsumed = false;

const gmailMessage = {
  id: "msg1",
  threadId: "thr1",
  get labelIds() { return [...labels]; },
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

let h: ReturnType<typeof createHarness>;
let cookie = "";
let accountId = "";

beforeAll(() => {
  h = createHarness();
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
      if (p === "/history") {
        if (archivedExternally && !historyConsumed) {
          historyConsumed = true;
          return json({ historyId: "1002", history: [{ id: "1001", labelsRemoved: [{ message: { id: "msg1", threadId: "thr1", labelIds: [...labels] }, labelIds: ["INBOX"] }] }] });
        }
        return json({ historyId: archivedExternally ? "1002" : "1001" });
      }
      if (p === "/labels") return json({ labels: [{ id: "INBOX", name: "INBOX", type: "system" }] });
      if (p.startsWith("/labels/")) return json({ id: "INBOX", name: "INBOX", type: "system", messagesUnread: 1, messagesTotal: 1 });
      return new Response("not mocked: " + p, { status: 599 });
    }
    return new Response("not mocked: " + url.href, { status: 599 });
  });
});

describe("external Gmail archive reaches Tidepost views", () => {
  it("signs in and syncs", async () => {
    const start = await h.app.request("/api/auth/google/start");
    const loc = new URL(start.headers.get("location")!);
    const state = loc.searchParams.get("state")!;
    const oauthCookie = start.headers.get("set-cookie")!.split(";")[0];
    const cb = await h.app.request(`/api/auth/google/callback?code=authcode&state=${state}`, { headers: { cookie: oauthCookie } });
    accountId = decodeURIComponent(cb.headers.get("location")!.split("account=")[1]);
    cookie = cb.headers.getSetCookie().find((c) => c.startsWith("tp_session="))!.split(";")[0];
    await h.mailboxes.mailbox(accountId).syncNow();
    const inbox = await (await h.app.request(`/api/accounts/${accountId}/threads?view=inbox`, { headers: { cookie } })).json() as { threads: { id: string }[] };
    expect(inbox.threads.map((t) => t.id)).toContain("thr1");
  });

  it("removes the thread from inbox after the user archives it in Gmail", async () => {
    // The user archives the thread in Gmail's own UI.
    archivedExternally = true;
    labels.delete("INBOX");
    await h.mailboxes.mailbox(accountId).syncNow();
    for (const view of ["inbox", "needs", "fyi", "updates"]) {
      const page = await (await h.app.request(`/api/accounts/${accountId}/threads?view=${view}`, { headers: { cookie } })).json() as { threads: { id: string }[] };
      expect(page.threads.map((t) => t.id), view).not.toContain("thr1");
    }
    const archive = await (await h.app.request(`/api/accounts/${accountId}/threads?view=archive`, { headers: { cookie } })).json() as { threads: { id: string }[] };
    expect(archive.threads.map((t) => t.id)).toContain("thr1");
  });
});
