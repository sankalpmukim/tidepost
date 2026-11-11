// Triage lanes, search, contacts, outgoing replies and actions, exercised
// against the store functions with memory persistence (the same code the
// Mailbox Durable Objects run over SQLite).
import { beforeAll, describe, expect, it } from "vitest";
import type { MessageMeta } from "../server/providers/types";
import * as store from "../server/store";
import { createUser, upsertAccount } from "../server/accounts";
import { createHarness, initTestConfig, quietEngine } from "./harness";

initTestConfig();

const h = createHarness();
let accountId = "";
let engine: ReturnType<typeof quietEngine>;
const ME = "alex@northwind.example";

beforeAll(async () => {
  const user = await createUser(h.auth);
  const account = await upsertAccount(h.auth, user, "demo", ME, "Alex Morgan", null);
  accountId = account.id;
  engine = quietEngine(h, accountId);
  await engine.ensureAccount(account); // host.schedule is a noop here
});

let n = 0;
function msg(p: Partial<MessageMeta> & { threadId: string }): MessageMeta {
  n++;
  return {
    id: `m${n}`,
    from: { name: "Priya Nair", email: "priya@contoso.example" },
    to: [{ name: "Alex Morgan", email: ME }],
    cc: [],
    bcc: [],
    replyTo: [],
    subject: "Quote",
    snippet: "Could you approve the quote?",
    date: new Date(Date.now() - (100 - n) * 60_000).toISOString(),
    unread: true,
    starred: false,
    folders: ["INBOX"],
    hasAttachments: false,
    messageIdHeader: `<m${n}@contoso.example>`,
    inReplyTo: null,
    references: null,
    bulk: { listId: null, listUnsubscribe: null, listUnsubscribePost: null, precedence: null, autoSubmitted: null },
    category: null,
    importance: "normal",
    sizeEstimate: 100,
    ...p,
  };
}

const p = () => h.mailPersist;

describe("triage lanes", () => {
  it("puts direct asks in Needs you, Cc in FYI, lists in Updates", async () => {
    await store.upsertMessages(p(), accountId, ME, [
      msg({ threadId: "t-direct" }),
      msg({ threadId: "t-cc", to: [{ name: "Team", email: "team@northwind.example" }], cc: [{ name: "Alex", email: ME }] }),
      msg({ threadId: "t-news", from: { name: "Digest", email: "digest@news.example" }, bulk: { listId: "<news.example>", listUnsubscribe: "<https://news.example/u>", listUnsubscribePost: null, precedence: "bulk", autoSubmitted: null } }),
    ]);
    expect((await store.getThreadSummary(p(), accountId, "t-direct"))?.lane).toBe("needs");
    expect((await store.getThreadSummary(p(), accountId, "t-cc"))?.lane).toBe("fyi");
    expect((await store.getThreadSummary(p(), accountId, "t-news"))?.lane).toBe("updates");
    const needs = (await store.listThreads(p(), accountId, "needs", 0, 50)).threads.map((t) => t.id);
    expect(needs).toContain("t-direct");
    expect(needs).not.toContain("t-cc");
  });

  it("moves a thread to Waiting when you wrote last, and back to Needs you when they reply", async () => {
    await store.upsertMessages(p(), accountId, ME, [
      msg({ threadId: "t-wait", from: { name: "Dana", email: "dana@contoso.example" } }),
      msg({ threadId: "t-wait", from: { name: "Alex Morgan", email: ME }, to: [{ name: "Dana", email: "dana@contoso.example" }], folders: ["SENT"], unread: false }),
    ]);
    expect((await store.getThreadSummary(p(), accountId, "t-wait"))?.lane).toBe("waiting");
    expect((await store.listThreads(p(), accountId, "waiting", 0, 50)).threads.map((t) => t.id)).toContain("t-wait");
    await store.upsertMessages(p(), accountId, ME, [msg({ threadId: "t-wait", from: { name: "Dana", email: "dana@contoso.example" } })]);
    expect((await store.getThreadSummary(p(), accountId, "t-wait"))?.lane).toBe("needs");
  });

  it("treats archived threads as done and hides snoozed ones from lanes", async () => {
    await store.upsertMessages(p(), accountId, ME, [msg({ threadId: "t-arch", folders: ["ARCHIVE"] }), msg({ threadId: "t-snz" })]);
    expect((await store.getThreadSummary(p(), accountId, "t-arch"))?.lane).toBe("done");
    await store.setThreadState(p(), accountId, "t-snz", { snoozed_until: Date.now() + 3600_000 });
    expect((await store.listThreads(p(), accountId, "needs", 0, 50)).threads.map((t) => t.id)).not.toContain("t-snz");
    expect((await store.listThreads(p(), accountId, "snoozed", 0, 50)).threads.map((t) => t.id)).toContain("t-snz");
  });

  it("clears a follow-up reminder when a reply arrives after it was set", async () => {
    await store.upsertMessages(p(), accountId, ME, [msg({ threadId: "t-rem", from: { name: "Alex Morgan", email: ME }, to: [{ name: "Sam", email: "sam@contoso.example" }], folders: ["SENT"], unread: false })]);
    await store.setThreadState(p(), accountId, "t-rem", { remind_at: Date.now() + 86400_000, remind_set_at: Date.now() - 1000 });
    expect((await store.getThreadSummary(p(), accountId, "t-rem"))?.remindAt).not.toBeNull();
    await store.upsertMessages(p(), accountId, ME, [msg({ threadId: "t-rem", from: { name: "Sam", email: "sam@contoso.example" }, date: new Date().toISOString() })]);
    expect((await store.getThreadSummary(p(), accountId, "t-rem"))?.remindAt).toBeNull();
  });

  it("counts audience and normalizes subjects", async () => {
    await store.upsertMessages(p(), accountId, ME, [msg({ threadId: "t-big", subject: "RE: Fwd: RE: Cutover plan", cc: Array.from({ length: 30 }, (_, i) => ({ name: `P${i}`, email: `p${i}@contoso.example` })) })]);
    const s = (await store.getThreadSummary(p(), accountId, "t-big"))!;
    expect(s.subject).toBe("Cutover plan");
    expect(s.audienceSize).toBeGreaterThanOrEqual(31);
  });
});

describe("search and contacts", () => {
  it("finds threads by body text once indexed", async () => {
    await store.upsertMessages(p(), accountId, ME, [msg({ threadId: "t-search", snippet: "short" })]);
    const id = `m${n}`;
    await store.indexBody(p(), accountId, id, "The rollback matrix is attached for the cutover");
    expect((await store.localSearch(p(), accountId, "rollback matrix")).map((t) => t.id)).toContain("t-search");
    expect((await store.localSearch(p(), accountId, "rollb")).map((t) => t.id)).toContain("t-search");
  });

  it("ranks people you write to above people who write to you", async () => {
    const c = await store.contacts(p(), accountId, ME, "", 20);
    expect(c.find((x) => x.email === ME)).toBeUndefined();
    expect(c.some((x) => x.email === "dana@contoso.example")).toBe(true);
  });
});

describe("outgoing replies", () => {
  it("threads replies with In-Reply-To/References and quotes the original", async () => {
    await store.upsertMessages(p(), accountId, ME, [msg({ threadId: "t-reply", references: "<root@contoso.example>", messageIdHeader: "<orig@contoso.example>" })]);
    const origId = `m${n}`;
    const account = (await h.auth.getAccount(accountId))!;
    const raw = await engine.buildOutgoing(account, {
      to: [{ name: "Priya Nair", email: "priya@contoso.example" }], cc: [], bcc: [], subject: "Re: Quote",
      text: "Approved.\n\nSee https://example.com/x", attachments: [], mode: "reply",
      inReplyTo: { messageId: origId, threadId: "t-reply" }, quotedHtml: "<p>Could you approve?</p>", quotedText: "Could you approve?",
    }, "Alex Morgan\nNorthwind");
    expect(raw.inReplyTo).toBe("<orig@contoso.example>");
    expect(raw.references).toBe("<root@contoso.example> <orig@contoso.example>");
    expect(raw.threadId).toBe("t-reply");
    expect(raw.html).toContain('<a href="https://example.com/x">');
    expect(raw.html).toContain("gmail_quote");
    expect(raw.text).toContain("> Could you approve?");
    expect(raw.text).toContain("-- \nAlex Morgan");
  });

  it("drops threading headers for forwards", async () => {
    const account = (await h.auth.getAccount(accountId))!;
    const origId = `m${n}`;
    const raw = await engine.buildOutgoing(account, { to: [{ name: "x", email: "x@y.example" }], cc: [], bcc: [], subject: "Fwd: Quote", text: "FYI", attachments: [], mode: "forward", inReplyTo: { messageId: origId, threadId: "t-reply" }, quotedHtml: "<p>hi</p>", quotedText: "hi" }, "");
    expect(raw.inReplyTo).toBeNull();
    expect(raw.threadId).toBeNull();
    expect(raw.html).toContain("Forwarded message");
  });
});

describe("actions", () => {
  it("trashes every message of a long thread so it leaves the view (regression: writes were silently capped at 40)", async () => {
    const metas = Array.from({ length: 60 }, () => msg({ threadId: "t-long" }));
    await store.upsertMessages(p(), accountId, ME, metas);
    expect((await store.getThreadSummary(p(), accountId, "t-long"))?.inInbox).toBe(true);

    const account = (await h.auth.getAccount(accountId))!;
    void account;
    await engine.applyAction(["t-long"], { type: "trash" });

    const after = await store.getThreadSummary(p(), accountId, "t-long");
    expect(after?.folders).toContain("TRASH");
    expect(after?.folders).not.toContain("INBOX");
    const needs = (await store.listThreads(p(), accountId, "needs", 0, 100)).threads.map((t) => t.id);
    expect(needs).not.toContain("t-long");
    const trash = (await store.listThreads(p(), accountId, "trash", 0, 100)).threads.map((t) => t.id);
    expect(trash).toContain("t-long");
  });
});

describe("text helpers", () => {
  it("strips quoted history and signatures from plain text", async () => {
    const text = await import("../server/text");
    expect(text.stripQuotedText("Sounds good, ship it.\n\nThanks\n-- \nDana\n\nOn Tue, Oct 14, 2025 at 9:12 AM Priya <p@x.example> wrote:\n> Can we ship?\n> Thanks")).toBe("Sounds good, ship it.\n\nThanks");
    const outlook = "Approved.\n\nFrom: Priya Nair <p@x.example>\nSent: Tuesday, October 14, 2025 9:12 AM\nTo: Alex\nSubject: Quote\n\nCan we ship?";
    expect(text.stripQuotedText(outlook)).toBe("Approved.");
  });

  it("converts HTML to readable text", async () => {
    const text = await import("../server/text");
    expect(text.htmlToText("<p>Hi&nbsp;Alex,</p><ul><li>One</li><li>Two</li></ul><style>p{}</style>")).toBe("Hi Alex,\n\n• One\n• Two");
  });
});
