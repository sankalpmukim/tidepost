import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config } from "../server/config";
import { googleAuthUrl, googleExchangeCode, googleIdentityFromIdToken, googleRefresh } from "../server/auth/google";
import { GmailProvider, gmailMessageToMeta } from "../server/providers/gmail";
import { AuthExpiredError, type RawOutgoing, type TokenSource } from "../server/providers/types";

const BASE = "https://gmail.test/gmail/v1/users/me";

// ---------- fetch mock ----------

interface Call {
  method: string;
  url: URL;
  body: unknown;
  headers: Record<string, string>;
}

type Route = (call: Call) => { status?: number; json?: unknown; text?: string } | undefined;

let calls: Call[] = [];
let routes: Route[] = [];

function json(status: number, body: unknown) {
  return { status, json: body };
}

const NOT_FOUND = {
  error: {
    code: 404,
    message: "Requested entity was not found.",
    errors: [{ message: "Requested entity was not found.", domain: "global", reason: "notFound" }],
    status: "NOT_FOUND",
  },
};

beforeEach(() => {
  calls = [];
  routes = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      let body: unknown = init?.body;
      if (typeof body === "string" && body.startsWith("{")) body = JSON.parse(body);
      const call: Call = {
        method: init?.method ?? "GET",
        url,
        body,
        headers: (init?.headers ?? {}) as Record<string, string>,
      };
      calls.push(call);
      for (const r of routes) {
        const res = r(call);
        if (res) {
          const status = res.status ?? 200;
          if (status === 204) return new Response(null, { status });
          return new Response(res.text ?? JSON.stringify(res.json), {
            status,
            headers: { "Content-Type": "application/json; charset=UTF-8" },
          });
        }
      }
      return new Response(JSON.stringify(NOT_FOUND), { status: 404 });
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const tokens: TokenSource = {
  getAccessToken: async () => "ya29.test-access-token",
  refresh: async () => "ya29.refreshed",
};

function provider() {
  return new GmailProvider(tokens, { baseUrl: BASE, quotaUnitsPerSecond: 0 });
}

const path = (c: Call) => c.url.pathname.replace("/gmail/v1/users/me", "");
const b64url = (s: string, enc: BufferEncoding = "utf8") => Buffer.from(s, enc).toString("base64url");

// ---------- fixtures (shaped like Gmail API v1 responses) ----------

function metaMessage(
  id: string,
  labelIds: string[],
  extraHeaders: { name: string; value: string }[] = [],
  over: Record<string, unknown> = {},
) {
  return {
    id,
    threadId: "18f3a1c2b9d4e001",
    labelIds,
    snippet: "Here&#39;s the Q3 report &amp; the &quot;final&quot; deck &lt;v2&gt; &#x2014; thanks!",
    payload: {
      partId: "",
      mimeType: "multipart/mixed",
      filename: "",
      headers: [
        { name: "Date", value: "Wed, 6 Nov 2024 14:13:20 +0000" },
        { name: "From", value: '"Doe, Jane" <Jane.Doe@Example.COM>' },
        { name: "To", value: "=?UTF-8?B?w4lsb2RpZSBNYXJ0aW4=?= <elodie@example.fr>, bob@example.com" },
        { name: "Cc", value: '"O\'Brien, Pat (Ops)" <pat@example.org>' },
        { name: "Subject", value: "=?UTF-8?Q?R=C3=A9union_trimestrielle?= - Q3" },
        { name: "Message-ID", value: "<CAF=abc123@mail.gmail.com>" },
        { name: "In-Reply-To", value: "<CAF=prev@mail.gmail.com>" },
        { name: "References", value: "<CAF=root@mail.gmail.com>\r\n <CAF=prev@mail.gmail.com>" },
        ...extraHeaders,
      ],
    },
    sizeEstimate: 48213,
    historyId: "2843219",
    internalDate: "1730902400000",
    ...over,
  };
}

// ---------- metadata mapping ----------

describe("metadata mapping", () => {
  it("maps headers, addresses, snippet entities and flags", () => {
    const meta = gmailMessageToMeta(
      metaMessage("18f3a1c2b9d4e0aa", ["UNREAD", "IMPORTANT", "CATEGORY_UPDATES", "INBOX", "Label_12"], [
        { name: "List-Id", value: "Finance team <finance.example.com>" },
        { name: "List-Unsubscribe", value: "<mailto:unsub@example.com>, <https://example.com/u/1>" },
        { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
        { name: "Precedence", value: "Bulk" },
        { name: "Importance", value: "High" },
      ]),
    );
    expect(meta.id).toBe("18f3a1c2b9d4e0aa");
    expect(meta.threadId).toBe("18f3a1c2b9d4e001");
    expect(meta.from).toEqual({ name: "Doe, Jane", email: "jane.doe@example.com" });
    expect(meta.to).toEqual([
      { name: "Élodie Martin", email: "elodie@example.fr" },
      { name: "bob", email: "bob@example.com" },
    ]);
    expect(meta.cc).toEqual([{ name: "O'Brien, Pat (Ops)", email: "pat@example.org" }]);
    expect(meta.subject).toBe("Réunion trimestrielle - Q3");
    expect(meta.snippet).toBe('Here\'s the Q3 report & the "final" deck <v2> — thanks!');
    expect(meta.date).toBe("2024-11-06T14:13:20.000Z");
    expect(meta.unread).toBe(true);
    expect(meta.starred).toBe(false);
    expect(meta.folders).toEqual(["INBOX", "Label_12"]);
    expect(meta.category).toBe("updates");
    expect(meta.importance).toBe("high");
    expect(meta.hasAttachments).toBe(true);
    expect(meta.messageIdHeader).toBe("<CAF=abc123@mail.gmail.com>");
    expect(meta.inReplyTo).toBe("<CAF=prev@mail.gmail.com>");
    expect(meta.references).toBe("<CAF=root@mail.gmail.com> <CAF=prev@mail.gmail.com>");
    expect(meta.bulk).toEqual({
      listId: "Finance team <finance.example.com>",
      listUnsubscribe: "<mailto:unsub@example.com>, <https://example.com/u/1>",
      listUnsubscribePost: "List-Unsubscribe=One-Click",
      precedence: "bulk",
      autoSubmitted: null,
    });
    expect(meta.sizeEstimate).toBe(48213);
  });

  it("derives folders and ARCHIVE correctly", () => {
    const folders = (labels: string[]) => gmailMessageToMeta(metaMessage("x", labels)).folders;
    expect(folders(["CATEGORY_PROMOTIONS", "UNREAD"])).toEqual(["ARCHIVE"]);
    expect(folders(["Label_7", "IMPORTANT"])).toEqual(["Label_7", "ARCHIVE"]);
    expect(folders(["SENT"])).toEqual(["SENT"]); // sent & not in inbox is not "archived"
    expect(folders(["SENT", "INBOX", "STARRED"])).toEqual(["SENT", "INBOX"]);
    expect(folders(["TRASH", "Label_3"])).toEqual(["TRASH", "Label_3"]);
    expect(folders(["SPAM", "UNREAD"])).toEqual(["SPAM"]);
    expect(folders(["DRAFT"])).toEqual(["DRAFT"]);
    expect(folders([])).toEqual(["ARCHIVE"]);
    const m = gmailMessageToMeta(metaMessage("x", ["STARRED", "CATEGORY_PROMOTIONS"]));
    expect(m.starred).toBe(true);
    expect(m.category).toBe("promotions");
    expect(m.unread).toBe(false);
  });

  it("handles X-Priority, missing headers and single-part messages", () => {
    const m = gmailMessageToMeta({
      id: "a1",
      threadId: "a1",
      labelIds: ["INBOX"],
      snippet: "",
      payload: { mimeType: "text/plain", headers: [{ name: "X-Priority", value: "5 (Lowest)" }] },
      internalDate: "1700000000000",
    });
    expect(m.importance).toBe("low");
    expect(m.hasAttachments).toBe(false);
    expect(m.from.email).toBe("");
    expect(m.subject).toBe("");
    expect(m.to).toEqual([]);
    expect(m.messageIdHeader).toBeNull();
    expect(m.category).toBeNull();
  });
});

// ---------- profile & folders ----------

describe("profile and folders", () => {
  it("getProfile returns the address and a local-part name", async () => {
    routes.push((c) => (path(c) === "/profile" ? json(200, { emailAddress: "Jane.Doe@gmail.com", messagesTotal: 4210, threadsTotal: 3100, historyId: "2843000" }) : undefined));
    expect(await provider().getProfile()).toEqual({ name: "jane.doe", email: "jane.doe@gmail.com" });
    expect(calls[0].headers.Authorization).toBe("Bearer ya29.test-access-token");
  });

  it("listFolders maps system and user labels with counts", async () => {
    const labels = [
      { id: "CHAT", name: "CHAT", messageListVisibility: "hide", labelListVisibility: "labelHide", type: "system" },
      { id: "SENT", name: "SENT", type: "system" },
      { id: "INBOX", name: "INBOX", type: "system" },
      { id: "IMPORTANT", name: "IMPORTANT", type: "system" },
      { id: "TRASH", name: "TRASH", type: "system" },
      { id: "DRAFT", name: "DRAFT", type: "system" },
      { id: "SPAM", name: "SPAM", type: "system" },
      { id: "CATEGORY_FORUMS", name: "CATEGORY_FORUMS", type: "system" },
      { id: "STARRED", name: "STARRED", type: "system" },
      { id: "UNREAD", name: "UNREAD", type: "system" },
      { id: "Label_2", name: "Receipts", type: "user", messageListVisibility: "show", labelListVisibility: "labelShow", color: { textColor: "#ffffff", backgroundColor: "#16a766" } },
      { id: "Label_1", name: "Clients/Acme", type: "user" },
    ];
    const counts: Record<string, [number, number]> = {
      INBOX: [3021, 12], SENT: [800, 0], TRASH: [40, 2], DRAFT: [3, 0], SPAM: [17, 17], STARRED: [25, 1], Label_2: [120, 4], Label_1: [55, 0],
    };
    routes.push((c) => {
      const p = path(c);
      if (p === "/labels") return json(200, { labels });
      const m = p.match(/^\/labels\/(.+)$/);
      if (m && counts[m[1]]) {
        const base = labels.find((l) => l.id === m[1])!;
        const [total, unread] = counts[m[1]];
        return json(200, { ...base, messagesTotal: total, messagesUnread: unread, threadsTotal: total, threadsUnread: unread });
      }
      return undefined;
    });
    const folders = await provider().listFolders();
    expect(folders.map((f) => f.id)).toEqual(["INBOX", "STARRED", "SENT", "DRAFT", "ARCHIVE", "SPAM", "TRASH", "Label_1", "Label_2"]);
    expect(folders[0]).toEqual({ id: "INBOX", name: "Inbox", kind: "system", style: "label", unread: 12, total: 3021, color: null });
    expect(folders.find((f) => f.id === "ARCHIVE")).toMatchObject({ name: "Archive", kind: "system", unread: 0, total: 0 });
    expect(folders.find((f) => f.id === "Label_2")).toEqual({ id: "Label_2", name: "Receipts", kind: "user", style: "label", unread: 4, total: 120, color: "#16a766" });
    // No count lookups for skipped system labels.
    expect(calls.some((c) => /CHAT|IMPORTANT|UNREAD|CATEGORY_/.test(c.url.pathname))).toBe(false);
  });
});

// ---------- initial sync & search ----------

describe("initialSync", () => {
  it("reads historyId first, pages through ids and emits metadata newest first", async () => {
    const ids = Array.from({ length: 230 }, (_, i) => `id${String(1000 - i)}`);
    routes.push((c) => {
      const p = path(c);
      if (p === "/profile") return json(200, { emailAddress: "me@gmail.com", messagesTotal: 230, threadsTotal: 200, historyId: "555000" });
      if (p === "/messages") {
        const start = c.url.searchParams.get("pageToken") ? Number(c.url.searchParams.get("pageToken")) : 0;
        const size = Number(c.url.searchParams.get("maxResults"));
        const slice = ids.slice(start, start + Math.min(size, 150));
        const next = start + slice.length;
        return json(200, {
          messages: slice.map((id) => ({ id, threadId: `t-${id}` })),
          ...(next < ids.length ? { nextPageToken: String(next) } : {}),
          resultSizeEstimate: 230,
        });
      }
      const m = p.match(/^\/messages\/([^/]+)$/);
      if (m) {
        if (m[1] === "id990") return json(404, NOT_FOUND); // deleted between list and get
        return json(200, metaMessage(m[1], ["INBOX"]));
      }
      return undefined;
    });
    const pages: { ids: string[]; deleted: string[]; done: number; total: number }[] = [];
    const res = await provider().initialSync({
      maxMessages: 200,
      onPage: (page, progress) => {
        pages.push({ ids: page.messages.map((m) => m.id), deleted: page.deleted, ...progress });
      },
    });
    expect(res.cursor).toBe("555000");
    expect(path(calls[0])).toBe("/profile");
    const listCalls = calls.filter((c) => path(c) === "/messages");
    expect(listCalls).toHaveLength(2);
    expect(listCalls[0].url.searchParams.get("maxResults")).toBe("200");
    expect(listCalls[1].url.searchParams.get("maxResults")).toBe("50");
    expect(listCalls[0].url.searchParams.has("includeSpamTrash")).toBe(false);
    expect(pages.map((p) => [p.done, p.total])).toEqual([[100, 200], [200, 200]]);
    expect(pages[0].ids[0]).toBe("id1000");
    expect(pages[0].ids).not.toContain("id990");
    expect(pages[0].deleted).toEqual(["id990"]);
    expect(pages.flatMap((p) => p.ids)).toHaveLength(199);

    const get = calls.find((c) => path(c) === "/messages/id1000")!;
    expect(get.url.searchParams.get("format")).toBe("metadata");
    const hdrs = get.url.searchParams.getAll("metadataHeaders");
    for (const h of ["From", "To", "Cc", "Bcc", "Reply-To", "Subject", "Date", "Message-ID", "In-Reply-To", "References", "List-Id", "List-Unsubscribe", "List-Unsubscribe-Post", "Precedence", "Auto-Submitted", "Importance", "X-Priority"]) {
      expect(hdrs).toContain(h);
    }
  });

  it("stops when the signal is aborted", async () => {
    routes.push((c) => (path(c) === "/profile" ? json(200, { emailAddress: "me@gmail.com", historyId: "1" }) : undefined));
    const ac = new AbortController();
    ac.abort();
    await expect(provider().initialSync({ maxMessages: 10, onPage: () => {}, signal: ac.signal })).rejects.toThrow();
    expect(calls).toHaveLength(0);
  });

  it("paces requests with the quota limiter", async () => {
    routes.push((c) => (path(c) === "/profile" ? json(200, { emailAddress: "me@gmail.com", historyId: "1" }) : undefined));
    // 50 units/s with a 100-unit burst: 110 one-unit calls need ~200ms for the last 10.
    const p = new GmailProvider(tokens, { baseUrl: BASE, quotaUnitsPerSecond: 50 });
    const t0 = Date.now();
    await Promise.all(Array.from({ length: 110 }, () => p.getProfile()));
    const elapsed = Date.now() - t0;
    expect(elapsed).toBeGreaterThanOrEqual(150);
    expect(elapsed).toBeLessThan(1500);
  });
});

describe("search", () => {
  it("passes Gmail query syntax through and returns metadata in list order", async () => {
    routes.push((c) => {
      const p = path(c);
      if (p === "/messages") return json(200, { messages: [{ id: "s2", threadId: "t2" }, { id: "s1", threadId: "t1" }], resultSizeEstimate: 2 });
      const m = p.match(/^\/messages\/([^/]+)$/);
      if (m) return json(200, metaMessage(m[1], ["INBOX"]));
      return undefined;
    });
    const res = await provider().search('from:jane has:attachment subject:"Q3 report" newer_than:7d', 25);
    expect(res.map((m) => m.id)).toEqual(["s2", "s1"]);
    const list = calls.find((c) => path(c) === "/messages")!;
    expect(list.url.searchParams.get("q")).toBe('from:jane has:attachment subject:"Q3 report" newer_than:7d');
    expect(list.url.searchParams.get("maxResults")).toBe("25");
  });
});

// ---------- history ----------

describe("changes", () => {
  it("collects history across pages, refetches touched messages and treats 404 as deleted", async () => {
    routes.push((c) => {
      const p = path(c);
      if (p === "/history") {
        if (!c.url.searchParams.get("pageToken")) {
          return json(200, {
            history: [
              {
                id: "1001",
                messages: [{ id: "m1", threadId: "t1" }],
                messagesAdded: [{ message: { id: "m1", threadId: "t1", labelIds: ["UNREAD", "INBOX"] } }],
              },
              {
                id: "1002",
                messages: [{ id: "m2", threadId: "t2" }],
                labelsAdded: [{ message: { id: "m2", threadId: "t2", labelIds: ["STARRED", "INBOX"] }, labelIds: ["STARRED"] }],
              },
              {
                id: "1003",
                messages: [{ id: "m3", threadId: "t3" }],
                messagesDeleted: [{ message: { id: "m3", threadId: "t3", labelIds: ["TRASH"] } }],
              },
            ],
            nextPageToken: "08123456789",
            historyId: "1100",
          });
        }
        return json(200, {
          history: [
            {
              id: "1104",
              messages: [{ id: "m4", threadId: "t4" }],
              labelsRemoved: [{ message: { id: "m4", threadId: "t4", labelIds: ["INBOX"] }, labelIds: ["UNREAD"] }],
            },
            {
              id: "1105",
              messages: [{ id: "m1", threadId: "t1" }],
              labelsRemoved: [{ message: { id: "m1", threadId: "t1", labelIds: ["INBOX"] }, labelIds: ["UNREAD"] }],
            },
          ],
          historyId: "1200",
        });
      }
      const m = p.match(/^\/messages\/([^/]+)$/);
      if (m) {
        if (m[1] === "m4") return json(404, NOT_FOUND);
        return json(200, metaMessage(m[1], m[1] === "m2" ? ["STARRED", "INBOX"] : ["INBOX"]));
      }
      return undefined;
    });
    const res = await provider().changes("1000");
    expect(res.resetRequired).toBe(false);
    expect(res.cursor).toBe("1200");
    expect(res.messages.map((m) => m.id).sort()).toEqual(["m1", "m2"]);
    expect(res.messages.find((m) => m.id === "m2")!.starred).toBe(true);
    expect(res.deleted.sort()).toEqual(["m3", "m4"]);
    const hist = calls.filter((c) => path(c) === "/history");
    expect(hist).toHaveLength(2);
    expect(hist[0].url.searchParams.get("startHistoryId")).toBe("1000");
    expect(hist[0].url.searchParams.getAll("historyTypes")).toEqual(["messageAdded", "messageDeleted", "labelAdded", "labelRemoved"]);
    expect(hist[1].url.searchParams.get("pageToken")).toBe("08123456789");
    // m1 is fetched once even though it appears twice; m3 (deleted) never.
    expect(calls.filter((c) => path(c) === "/messages/m1")).toHaveLength(1);
    expect(calls.some((c) => path(c) === "/messages/m3")).toBe(false);
  });

  it("returns the server historyId when nothing changed", async () => {
    routes.push((c) => (path(c) === "/history" ? json(200, { historyId: "2000" }) : undefined));
    expect(await provider().changes("1990")).toEqual({ messages: [], deleted: [], cursor: "2000", resetRequired: false });
  });

  it("signals resetRequired when the history id is too old (404)", async () => {
    routes.push((c) => (path(c) === "/history" ? json(404, NOT_FOUND) : undefined));
    const res = await provider().changes("12");
    expect(res).toEqual({ messages: [], deleted: [], cursor: "12", resetRequired: true });
  });
});

describe("threadMessages", () => {
  it("returns thread messages oldest first", async () => {
    routes.push((c) =>
      path(c) === "/threads/t9"
        ? json(200, {
            id: "t9",
            historyId: "999",
            messages: [
              metaMessage("b", ["INBOX"], [], { threadId: "t9", internalDate: "1730000000000" }),
              metaMessage("a", ["SENT"], [], { threadId: "t9", internalDate: "1720000000000" }),
            ],
          })
        : undefined,
    );
    const msgs = await provider().threadMessages("t9");
    expect(msgs.map((m) => m.id)).toEqual(["a", "b"]);
    expect(calls[0].url.searchParams.get("format")).toBe("metadata");
    expect(calls[0].url.searchParams.getAll("metadataHeaders")).toContain("References");
  });
});

// ---------- bodies & attachments ----------

const LOGO = Buffer.from("89504e470d0a1a0a0000000d49484452", "hex");
const PDF = Buffer.from("%PDF-1.7\n%\xe2\xe3\xcf\xd3\n1 0 obj", "latin1");

const FULL_MESSAGE = {
  id: "190aa01",
  threadId: "190aa00",
  labelIds: ["INBOX", "CATEGORY_PERSONAL"],
  snippet: "Café au lait",
  sizeEstimate: 182233,
  historyId: "3000",
  internalDate: "1730902400000",
  payload: {
    partId: "",
    mimeType: "multipart/mixed",
    filename: "",
    headers: [
      { name: "MIME-Version", value: "1.0" },
      { name: "From", value: "Jane <jane@example.com>" },
      { name: "Subject", value: "Report" },
      { name: "Content-Type", value: 'multipart/mixed; boundary="000000000000a1b2c3"' },
    ],
    body: { size: 0 },
    parts: [
      {
        partId: "0",
        mimeType: "multipart/related",
        filename: "",
        headers: [{ name: "Content-Type", value: 'multipart/related; boundary="000000000000d4e5f6"' }],
        body: { size: 0 },
        parts: [
          {
            partId: "0.0",
            mimeType: "multipart/alternative",
            filename: "",
            headers: [{ name: "Content-Type", value: 'multipart/alternative; boundary="000000000000g7h8"' }],
            body: { size: 0 },
            parts: [
              {
                partId: "0.0.0",
                mimeType: "text/plain",
                filename: "",
                headers: [
                  { name: "Content-Type", value: 'text/plain; charset="ISO-8859-1"' },
                  { name: "Content-Transfer-Encoding", value: "quoted-printable" },
                ],
                body: { size: 13, data: b64url("Caf\xe9 au lait", "latin1") },
              },
              {
                partId: "0.0.1",
                mimeType: "text/html",
                filename: "",
                headers: [
                  { name: "Content-Type", value: 'text/html; charset="UTF-8"' },
                  { name: "Content-Transfer-Encoding", value: "quoted-printable" },
                ],
                body: { size: 52, data: b64url('<div>Café au lait<img src="cid:ii_logo01"></div>') },
              },
            ],
          },
          {
            partId: "0.1",
            mimeType: "image/png",
            filename: "logo.png",
            headers: [
              { name: "Content-Type", value: 'image/png; name="logo.png"' },
              { name: "Content-Disposition", value: 'inline; filename="logo.png"' },
              { name: "Content-Transfer-Encoding", value: "base64" },
              { name: "Content-ID", value: "<ii_logo01>" },
              { name: "X-Attachment-Id", value: "ii_logo01" },
            ],
            body: { attachmentId: "ANGjdJ8logoAttId", size: 2048 },
          },
        ],
      },
      {
        partId: "1",
        mimeType: "application/pdf",
        filename: "Q3 report.pdf",
        headers: [
          { name: "Content-Type", value: 'application/pdf; name="Q3 report.pdf"' },
          { name: "Content-Disposition", value: 'attachment; filename="Q3 report.pdf"' },
          { name: "Content-Transfer-Encoding", value: "base64" },
          { name: "X-Attachment-Id", value: "f_m3abc" },
        ],
        body: { attachmentId: "ANGjdJ9pdfAttId", size: 120000 },
      },
    ],
  },
};

describe("getBody", () => {
  it("walks the MIME tree, decodes charsets and lists attachments", async () => {
    routes.push((c) => (path(c) === "/messages/190aa01" && c.url.searchParams.get("format") === "full" ? json(200, FULL_MESSAGE) : undefined));
    const body = await provider().getBody("190aa01");
    expect(body.id).toBe("190aa01");
    expect(body.text).toBe("Café au lait");
    expect(body.html).toBe('<div>Café au lait<img src="cid:ii_logo01"></div>');
    expect(body.uniqueHtml).toBeNull();
    expect(body.attachments).toEqual([
      { id: "ANGjdJ8logoAttId", filename: "logo.png", mimeType: "image/png", size: 2048, inline: true, contentId: "ii_logo01" },
      { id: "ANGjdJ9pdfAttId", filename: "Q3 report.pdf", mimeType: "application/pdf", size: 120000, inline: false, contentId: null },
    ]);
  });

  it("fetches large bodies stored out of line via the attachments endpoint", async () => {
    const html = "<p>" + "Long newsletter ".repeat(100) + "</p>";
    routes.push((c) => {
      const p = path(c);
      if (p === "/messages/big1")
        return json(200, {
          id: "big1",
          threadId: "big1",
          labelIds: ["INBOX"],
          payload: {
            partId: "",
            mimeType: "text/html",
            filename: "",
            headers: [{ name: "Content-Type", value: "text/html; charset=utf-8" }],
            body: { attachmentId: "ANGjdJbodyAtt", size: html.length },
          },
        });
      if (p === "/messages/big1/attachments/ANGjdJbodyAtt") return json(200, { size: html.length, data: b64url(html) });
      return undefined;
    });
    const body = await provider().getBody("big1");
    expect(body.html).toBe(html);
    expect(body.text).toBeNull();
    expect(body.attachments).toEqual([]);
  });

  it("does not descend into attached message/rfc822 parts", async () => {
    routes.push((c) =>
      path(c) === "/messages/fwd1"
        ? json(200, {
            id: "fwd1",
            threadId: "fwd1",
            payload: {
              partId: "",
              mimeType: "multipart/mixed",
              filename: "",
              headers: [],
              body: { size: 0 },
              parts: [
                { partId: "0", mimeType: "text/plain", filename: "", headers: [{ name: "Content-Type", value: "text/plain; charset=us-ascii" }], body: { size: 5, data: b64url("See below") } },
                {
                  partId: "1",
                  mimeType: "message/rfc822",
                  filename: "",
                  headers: [{ name: "Content-Type", value: "message/rfc822" }],
                  body: { attachmentId: "ANGjdJeml", size: 4000 },
                  parts: [{ partId: "1.0", mimeType: "text/plain", filename: "", headers: [], body: { size: 5, data: b64url("inner") } }],
                },
              ],
            },
          })
        : undefined,
    );
    const body = await provider().getBody("fwd1");
    expect(body.text).toBe("See below");
    expect(body.attachments).toEqual([
      { id: "ANGjdJeml", filename: "message.eml", mimeType: "message/rfc822", size: 4000, inline: false, contentId: null },
    ]);
  });
});

describe("getAttachment", () => {
  it("returns decoded data with filename/mimeType from the message payload", async () => {
    routes.push((c) => {
      const p = path(c);
      if (p === "/messages/190aa01") return json(200, FULL_MESSAGE);
      if (p === "/messages/190aa01/attachments/ANGjdJ9pdfAttId") return json(200, { size: PDF.length, data: PDF.toString("base64url") });
      if (p === "/messages/190aa01/attachments/ANGjdJ8logoAttId") return json(200, { size: LOGO.length, data: LOGO.toString("base64url") });
      return undefined;
    });
    const gp = provider();
    const a = await gp.getAttachment("190aa01", "ANGjdJ9pdfAttId");
    expect(a.filename).toBe("Q3 report.pdf");
    expect(a.mimeType).toBe("application/pdf");
    expect(a.data.equals(PDF)).toBe(true);
    expect(calls.filter((c) => path(c) === "/messages/190aa01")).toHaveLength(1);

    // After getBody the names are cached: no extra format=full lookup.
    await gp.getBody("190aa01");
    calls = [];
    const logo = await gp.getAttachment("190aa01", "ANGjdJ8logoAttId");
    expect(logo).toMatchObject({ filename: "logo.png", mimeType: "image/png" });
    expect(logo.data.equals(LOGO)).toBe(true);
    expect(calls.map(path)).toEqual(["/messages/190aa01/attachments/ANGjdJ8logoAttId"]);
  });
});

// ---------- modify ----------

describe("modify", () => {
  function captureModify() {
    routes.push((c) => {
      if (c.method === "POST" && path(c) === "/messages/batchModify") return { status: 204 };
      if (c.method === "POST" && /^\/messages\/[^/]+\/trash$/.test(path(c))) return json(200, { id: "x", threadId: "x", labelIds: ["TRASH"] });
      return undefined;
    });
  }
  const batches = () => calls.filter((c) => path(c) === "/messages/batchModify").map((c) => c.body);

  const cases: [string, Parameters<GmailProvider["modify"]>[1], unknown][] = [
    ["read", { kind: "read", value: true }, { ids: ["a", "b"], removeLabelIds: ["UNREAD"] }],
    ["unread", { kind: "read", value: false }, { ids: ["a", "b"], addLabelIds: ["UNREAD"] }],
    ["star", { kind: "starred", value: true }, { ids: ["a", "b"], addLabelIds: ["STARRED"] }],
    ["unstar", { kind: "starred", value: false }, { ids: ["a", "b"], removeLabelIds: ["STARRED"] }],
    ["archive", { kind: "archive" }, { ids: ["a", "b"], removeLabelIds: ["INBOX"] }],
    ["inbox", { kind: "inbox" }, { ids: ["a", "b"], addLabelIds: ["INBOX"], removeLabelIds: ["TRASH", "SPAM"] }],
    ["spam", { kind: "spam" }, { ids: ["a", "b"], addLabelIds: ["SPAM"], removeLabelIds: ["INBOX"] }],
    ["addLabel", { kind: "addLabel", folderId: "Label_2" }, { ids: ["a", "b"], addLabelIds: ["Label_2"] }],
    ["removeLabel", { kind: "removeLabel", folderId: "Label_2" }, { ids: ["a", "b"], removeLabelIds: ["Label_2"] }],
    ["move to label", { kind: "move", folderId: "Label_9" }, { ids: ["a", "b"], addLabelIds: ["Label_9"], removeLabelIds: ["INBOX"] }],
    ["move to archive", { kind: "move", folderId: "ARCHIVE" }, { ids: ["a", "b"], removeLabelIds: ["INBOX"] }],
  ];
  for (const [name, change, expected] of cases) {
    it(`batchModify payload: ${name}`, async () => {
      captureModify();
      await provider().modify(["a", "b", "a"], change);
      expect(batches()).toEqual([expected]);
      expect(calls[0].method).toBe("POST");
    });
  }

  it("trash uses one batched batchModify (TRASH added, INBOX removed)", async () => {
    captureModify();
    await provider().modify(["a", "b", "c"], { kind: "trash" });
    expect(batches()).toEqual([{ ids: ["a", "b", "c"], addLabelIds: ["TRASH"], removeLabelIds: ["INBOX"] }]);
    expect(calls.filter((c) => /\/trash$/.test(path(c)))).toHaveLength(0);
  });

  it("splits batchModify into chunks of 1000 ids", async () => {
    captureModify();
    const ids = Array.from({ length: 2500 }, (_, i) => `m${i}`);
    await provider().modify(ids, { kind: "archive" });
    const b = batches() as { ids: string[] }[];
    expect(b.map((x) => x.ids.length)).toEqual([1000, 1000, 500]);
  });

  it("does nothing for an empty id list", async () => {
    await provider().modify([], { kind: "archive" });
    expect(calls).toHaveLength(0);
  });
});

// ---------- send ----------

describe("send", () => {
  const reply: RawOutgoing = {
    from: { name: "Me Myself", email: "me@gmail.com" },
    to: [{ name: "Doe, Jane", email: "jane.doe@example.com" }],
    cc: [{ name: "Élodie Martin", email: "elodie@example.fr" }],
    bcc: [{ name: "", email: "archive@example.com" }],
    subject: "Re: Réunion trimestrielle - Q3",
    text: "Sounds good.\n\nOn Wed, Jane wrote:\n> Here's the report",
    html: "<p>Sounds good.</p><blockquote>Here's the report</blockquote>",
    attachments: [{ filename: "notes.txt", mimeType: "text/plain", data: Buffer.from("notes") }],
    inReplyTo: "<CAF=abc123@mail.gmail.com>",
    references: "<CAF=root@mail.gmail.com> <CAF=abc123@mail.gmail.com>",
    threadId: "18f3a1c2b9d4e001",
    replyToProviderId: "18f3a1c2b9d4e0aa",
    mode: "reply",
  };

  function captureSend() {
    routes.push((c) =>
      c.method === "POST" && path(c) === "/messages/send"
        ? json(200, { id: "19000000000000ab", threadId: "18f3a1c2b9d4e001", labelIds: ["SENT"] })
        : undefined,
    );
  }

  it("posts the base64url raw MIME with threadId for replies", async () => {
    captureSend();
    const res = await provider().send(reply);
    expect(res).toEqual({ id: "19000000000000ab", threadId: "18f3a1c2b9d4e001" });
    const body = calls[0].body as { raw: string; threadId?: string };
    expect(body.threadId).toBe("18f3a1c2b9d4e001");
    expect(body.raw).toMatch(/^[A-Za-z0-9_-]+$/);
    const raw = Buffer.from(body.raw, "base64url").toString("utf8");
    const headerBlock = raw.slice(0, raw.indexOf("\r\n\r\n")).replace(/\r\n[ \t]/g, " ");
    expect(headerBlock).toContain('From: "Me Myself" <me@gmail.com>');
    expect(headerBlock).toContain('To: "Doe, Jane" <jane.doe@example.com>');
    expect(headerBlock).toMatch(/Cc: =\?UTF-8\?B\?.+\?= <elodie@example\.fr>/);
    expect(headerBlock).toContain("Bcc: archive@example.com");
    expect(headerBlock).toMatch(/Subject: =\?UTF-8\?B\?/);
    expect(headerBlock).toContain("In-Reply-To: <CAF=abc123@mail.gmail.com>");
    expect(headerBlock).toContain("References: <CAF=root@mail.gmail.com> <CAF=abc123@mail.gmail.com>");
    expect(headerBlock).toMatch(/Message-ID: <[0-9a-f]+@tidepost\.local>/);
    expect(headerBlock).toContain("Content-Type: multipart/mixed;");
  });

  it("omits threadId for new messages", async () => {
    captureSend();
    await provider().send({ ...reply, mode: "new", inReplyTo: null, references: null, threadId: "ignored" });
    expect((calls[0].body as { threadId?: string }).threadId).toBeUndefined();
  });
});

// ---------- OAuth ----------

describe("Google OAuth", () => {
  const saved = { ...config.google };
  beforeEach(() => {
    config.google.clientId = "123-abc.apps.googleusercontent.com";
    config.google.clientSecret = "GOCSPX-secret";
  });
  afterEach(() => {
    config.google.clientId = saved.clientId;
    config.google.clientSecret = saved.clientSecret;
  });

  it("builds the authorization URL with PKCE and offline access", () => {
    const url = new URL(googleAuthUrl({ state: "st4te", codeChallenge: "E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM", loginHint: "jane@gmail.com" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    const q = url.searchParams;
    expect(q.get("client_id")).toBe("123-abc.apps.googleusercontent.com");
    expect(q.get("redirect_uri")).toBe(`${config.appUrl}/api/auth/google/callback`);
    expect(q.get("response_type")).toBe("code");
    expect(q.get("scope")).toBe("openid email profile https://www.googleapis.com/auth/gmail.modify");
    expect(q.get("access_type")).toBe("offline");
    expect(q.get("prompt")).toBe("consent");
    expect(q.get("include_granted_scopes")).toBe("true");
    expect(q.get("code_challenge")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
    expect(q.get("code_challenge_method")).toBe("S256");
    expect(q.get("state")).toBe("st4te");
    expect(q.get("login_hint")).toBe("jane@gmail.com");
  });

  it("explains missing credentials", () => {
    config.google.clientId = "";
    expect(() => googleAuthUrl({ state: "s", codeChallenge: "c" })).toThrow(/GOOGLE_CLIENT_ID/);
  });

  it("exchanges the code with the verifier and client secret", async () => {
    routes.push((c) =>
      c.url.href === "https://oauth2.googleapis.com/token"
        ? json(200, { access_token: "ya29.new", expires_in: 3599, refresh_token: "1//0refresh", scope: "openid https://www.googleapis.com/auth/gmail.modify", token_type: "Bearer", id_token: "x.y.z" })
        : undefined,
    );
    const before = Date.now();
    const t = await googleExchangeCode("4/0code", "verifier123");
    expect(t).toMatchObject({ accessToken: "ya29.new", refreshToken: "1//0refresh", idToken: "x.y.z" });
    expect(t.expiresAt).toBeGreaterThanOrEqual(before + 3599_000);
    const form = new URLSearchParams(calls[0].body as string);
    expect(calls[0].headers["Content-Type"]).toBe("application/x-www-form-urlencoded");
    expect(form.get("grant_type")).toBe("authorization_code");
    expect(form.get("code")).toBe("4/0code");
    expect(form.get("code_verifier")).toBe("verifier123");
    expect(form.get("client_secret")).toBe("GOCSPX-secret");
    expect(form.get("redirect_uri")).toBe(`${config.appUrl}/api/auth/google/callback`);
  });

  it("keeps the old refresh token when Google does not return a new one", async () => {
    routes.push((c) =>
      c.url.href === "https://oauth2.googleapis.com/token"
        ? json(200, { access_token: "ya29.fresh", expires_in: 3599, scope: "https://www.googleapis.com/auth/gmail.modify", token_type: "Bearer" })
        : undefined,
    );
    const t = await googleRefresh("1//0keepme");
    expect(t.accessToken).toBe("ya29.fresh");
    expect(t.refreshToken).toBe("1//0keepme");
    const form = new URLSearchParams(calls[0].body as string);
    expect(form.get("grant_type")).toBe("refresh_token");
    expect(form.get("refresh_token")).toBe("1//0keepme");
  });

  it("throws AuthExpiredError on invalid_grant", async () => {
    routes.push((c) =>
      c.url.href === "https://oauth2.googleapis.com/token"
        ? json(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." })
        : undefined,
    );
    await expect(googleRefresh("1//0revoked")).rejects.toBeInstanceOf(AuthExpiredError);
  });

  it("decodes identity from the id_token payload", () => {
    const payload = { iss: "https://accounts.google.com", sub: "110169484474386276334", email: "Jane.Doe@gmail.com", email_verified: true, name: "Jane Doe" };
    const idToken = `${b64url('{"alg":"RS256","typ":"JWT"}')}.${b64url(JSON.stringify(payload))}.c2ln`;
    expect(googleIdentityFromIdToken(idToken)).toEqual({ email: "jane.doe@gmail.com", name: "Jane Doe", sub: "110169484474386276334" });
  });
});
