import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { config, initConfig } from "../server/config";
initConfig({ APP_URL: "http://localhost:5173" });
import {
  microsoftAuthUrl,
  microsoftExchangeCode,
  microsoftIdentityFromIdToken,
  microsoftRefresh,
} from "../server/auth/microsoft";
import { OutlookProvider } from "../server/providers/outlook";
import { AuthExpiredError, type MessageMeta, type RawOutgoing, type TokenSource } from "../server/providers/types";

// ---------------------------------------------------------------------------
// Fetch mock that routes on method + path (relative to the Graph version root)
// ---------------------------------------------------------------------------

const BASE = "https://graph.test/v1.0";

interface Call {
  method: string;
  url: URL;
  /** Path below /v1.0, decoded. */
  path: string;
  headers: Record<string, string>;
  body: unknown;
  rawBody: unknown;
}
type Handler = (call: Call) => Response | Promise<Response>;
interface Route {
  method: string;
  path: string | RegExp;
  when?: (call: Call) => boolean;
  handler: Handler;
}

let calls: Call[] = [];
let routes: Route[] = [];

function json(body: unknown, status = 200, headers: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });
}
const notFound = () =>
  json({ error: { code: "ErrorFolderNotFound", message: "The specified folder could not be found in the store." } }, 404);

function route(method: string, path: string | RegExp, handler: Handler | Response | { [k: string]: unknown } | unknown[], when?: (c: Call) => boolean) {
  routes.push({
    method,
    path,
    when,
    handler:
      typeof handler === "function"
        ? (handler as Handler)
        : handler instanceof Response
          ? () => handler.clone()
          : () => json(handler),
  });
}

function installFetch() {
  vi.stubGlobal("fetch", async (input: string | URL | Request, init: RequestInit = {}) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const headers: Record<string, string> = {};
    new Headers(init.headers).forEach((v, k) => (headers[k] = v));
    let body: unknown = undefined;
    if (typeof init.body === "string") {
      try {
        body = JSON.parse(init.body);
      } catch {
        body = init.body;
      }
    }
    const path = url.href.startsWith(BASE) ? decodeURIComponent(url.pathname.slice("/v1.0".length)) : url.href;
    const call: Call = { method: init.method ?? "GET", url, path, headers, body, rawBody: init.body };
    calls.push(call);
    for (let i = routes.length - 1; i >= 0; i--) {
      const r = routes[i];
      if (r.method !== call.method) continue;
      const ok = typeof r.path === "string" ? r.path === path : r.path.test(path);
      if (ok && (!r.when || r.when(call))) return r.handler(call);
    }
    throw new Error(`Unmocked request: ${call.method} ${url.href}`);
  });
}

const tokens: TokenSource = {
  getAccessToken: async () => "access-1",
  refresh: async () => "access-2",
};

const graphCalls = () => calls.filter((c) => c.url.href.startsWith(BASE));
const q = (c: Call, k: string) => c.url.searchParams.get(k);

// ---------------------------------------------------------------------------
// Fixtures shaped like Microsoft Graph v1.0 responses
// ---------------------------------------------------------------------------

const ID = {
  inbox: "AQMkADAwATNiZmYAZC1hNjM0LWU4ZDUtMDACLTAwCgAuAAADinbox0001AAAA=",
  sent: "AQMkADAwATNiZmYAZC1hNjM0LWU4ZDUtMDACLTAwCgAuAAADsent00001AAAA=",
  drafts: "AQMkADAwATNiZmYAZC1hNjM0LWU4ZDUtMDACLTAwCgAuAAADdrafts0001AAAA=",
  deleted: "AQMkADAwATNiZmYAZC1hNjM0LWU4ZDUtMDACLTAwCgAuAAADdeleted001AAAA=",
  junk: "AQMkADAwATNiZmYAZC1hNjM0LWU4ZDUtMDACLTAwCgAuAAADjunk00001AAAA=",
  archive: "AQMkADAwATNiZmYAZC1hNjM0LWU4ZDUtMDACLTAwCgAuAAADarchive001AAAA=",
  outbox: "AQMkADAwATNiZmYAZC1hNjM0LWU4ZDUtMDACLTAwCgAuAAADoutbox0001AAAA=",
  convHistory: "AQMkADAwATNiZmYAZC1hNjM0LWU4ZDUtMDACLTAwCgAuAAADconvhist01AAAA=",
  syncIssues: "AQMkADAwATNiZmYAZC1hNjM0LWU4ZDUtMDACLTAwCgAuAAADsyncissue1AAAA=",
  projects: "AAMkAGVmMDEzMTM4LTZmYWUtNDdkNC1hMDZiLTU1OGY5OTZhYmY4OAAuAAAAAAprojects=",
  projAcme: "AAMkAGVmMDEzMTM4LTZmYWUtNDdkNC1hMDZiLTU1OGY5OTZhYmY4OAAuAAAAAAacme0001=",
  inboxVendors: "AAMkAGVmMDEzMTM4LTZmYWUtNDdkNC1hMDZiLTU1OGY5OTZhYmY4OAAuAAAAAAvendors01=",
  trashChild: "AAMkAGVmMDEzMTM4LTZmYWUtNDdkNC1hMDZiLTU1OGY5OTZhYmY4OAAuAAAAAAtrashkid1=",
  newFolder: "AAMkAGVmMDEzMTM4LTZmYWUtNDdkNC1hMDZiLTU1OGY5OTZhYmY4OAAuAAAAAAnewfolder=",
};

function folder(id: string, displayName: string, extra: Partial<Record<string, unknown>> = {}) {
  return {
    id,
    displayName,
    parentFolderId: "AQMkADAwATNiZmYAZC1hNjM0LWU4ZDUtMDACLTAwCgAuAAADroot",
    childFolderCount: 0,
    unreadItemCount: 0,
    totalItemCount: 0,
    sizeInBytes: 0,
    isHidden: false,
    ...extra,
  };
}

function mountWellKnown(opts: { archive?: boolean } = {}) {
  const map: Record<string, string | null> = {
    inbox: ID.inbox,
    sentitems: ID.sent,
    drafts: ID.drafts,
    deleteditems: ID.deleted,
    junkemail: ID.junk,
    archive: opts.archive === false ? null : ID.archive,
    outbox: ID.outbox,
    conversationhistory: null, // personal accounts: not provisioned → detected by name
    syncissues: ID.syncIssues,
  };
  for (const [wk, id] of Object.entries(map)) {
    route("GET", `/me/mailFolders/${wk}`, () =>
      id
        ? json({
            "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#users('x')/mailFolders(id)/$entity",
            id,
          })
        : notFound(),
    );
  }
}

function mountFolderList(opts: { archive?: boolean; extra?: ReturnType<typeof folder>[] } = {}) {
  const page1 = [
    folder(ID.archive, "Archive", { totalItemCount: 812 }),
    folder(ID.convHistory, "Conversation History"),
    folder(ID.deleted, "Deleted Items", { childFolderCount: 1, totalItemCount: 40 }),
    folder(ID.drafts, "Drafts", { totalItemCount: 2 }),
    folder(ID.inbox, "Inbox", { childFolderCount: 1, unreadItemCount: 7, totalItemCount: 1520 }),
  ].filter((f) => opts.archive !== false || f.id !== ID.archive);
  const page2 = [
    folder(ID.junk, "Junk Email", { unreadItemCount: 3, totalItemCount: 12 }),
    folder(ID.outbox, "Outbox"),
    folder(ID.projects, "Projects", { childFolderCount: 1, unreadItemCount: 1, totalItemCount: 30 }),
    folder(ID.sent, "Sent Items", { totalItemCount: 640 }),
    folder(ID.syncIssues, "Sync Issues", { childFolderCount: 3 }),
    ...(opts.extra ?? []),
  ];
  route("GET", "/me/mailFolders", (c) => {
    if (q(c, "$skip") === "5") return json({ value: page2 });
    expect(q(c, "$top")).toBe("250");
    expect(q(c, "includeHiddenFolders")).toBe("false");
    return json({
      "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#users('x')/mailFolders",
      value: page1,
      "@odata.nextLink": `${BASE}/me/mailFolders?$top=250&includeHiddenFolders=false&$skip=5`,
    });
  });
  route("GET", `/me/mailFolders/${ID.inbox}/childFolders`, {
    value: [folder(ID.inboxVendors, "Vendors", { parentFolderId: ID.inbox, totalItemCount: 9, unreadItemCount: 2 })],
  });
  route("GET", `/me/mailFolders/${ID.projects}/childFolders`, {
    value: [folder(ID.projAcme, "Acme", { parentFolderId: ID.projects, totalItemCount: 4 })],
  });
  route("GET", `/me/mailFolders/${ID.deleted}/childFolders`, () => {
    throw new Error("children of Deleted Items must not be listed");
  });
  route("GET", `/me/mailFolders/${ID.syncIssues}/childFolders`, () => {
    throw new Error("children of Sync Issues must not be listed");
  });
}

const addr = (name: string, address: string) => ({ emailAddress: { name, address } });

function gmsg(id: string, extra: Record<string, unknown> = {}) {
  return {
    "@odata.etag": 'W/"CQAAABYAAAD8"',
    id,
    conversationId: "AAQkAGVmMDEzMTM4LTZmYWUtNDdkNC1hMDZiLTU1OGY5OTZhYmY4OAAQAconv1",
    subject: `Subject ${id}`,
    bodyPreview: `Preview of ${id}`,
    from: addr("Dana Whitfield", "Dana.Whitfield@Contoso.com"),
    sender: addr("Dana Whitfield", "Dana.Whitfield@Contoso.com"),
    toRecipients: [addr("Me", "me@fabrikam.onmicrosoft.com")],
    ccRecipients: [],
    bccRecipients: [],
    replyTo: [],
    receivedDateTime: "2026-11-08T09:15:00Z",
    sentDateTime: "2026-11-08T09:14:58Z",
    isRead: true,
    isDraft: false,
    flag: { flagStatus: "notFlagged" },
    hasAttachments: false,
    parentFolderId: ID.inbox,
    internetMessageId: `<${id}@contoso.com>`,
    importance: "normal",
    inferenceClassification: "focused",
    ...extra,
  };
}

const removed = (id: string) => ({ "@odata.type": "#microsoft.graph.message", id, "@removed": { reason: "deleted" } });

beforeEach(() => {
  calls = [];
  routes = [];
  installFetch();
});

afterEach(() => {
  // Every Graph request (and every $batch sub-request) must ask for immutable ids.
  for (const c of graphCalls()) {
    expect(c.headers["prefer"], `${c.method} ${c.url.href}`).toContain('IdType="ImmutableId"');
    expect(c.headers["authorization"]).toMatch(/^Bearer access-/);
    if (c.path === "/$batch") {
      const reqs = (c.body as { requests: { headers: Record<string, string> }[] }).requests;
      for (const r of reqs) expect(r.headers.Prefer).toBe('IdType="ImmutableId"');
    }
  }
  vi.unstubAllGlobals();
});

// ---------------------------------------------------------------------------
// Auth
// ---------------------------------------------------------------------------

describe("microsoft auth", () => {
  const saved = { ...config().microsoft };
  beforeEach(() => {
    config().microsoft.clientId = "11111111-2222-3333-4444-555555555555";
    config().microsoft.clientSecret = "s3cr3t~value";
    config().microsoft.tenant = "common";
  });
  afterEach(() => Object.assign(config().microsoft, saved));

  it("builds the authorize URL with PKCE and the mail scopes", () => {
    const u = new URL(microsoftAuthUrl({ state: "st4te", codeChallenge: "chal_lenge", loginHint: "me@outlook.com" }));
    expect(u.origin + u.pathname).toBe("https://login.microsoftonline.com/common/oauth2/v2.0/authorize");
    const p = u.searchParams;
    expect(p.get("client_id")).toBe(config().microsoft.clientId);
    expect(p.get("response_type")).toBe("code");
    expect(p.get("redirect_uri")).toBe(`${config().appUrl}/api/auth/microsoft/callback`);
    expect(p.get("response_mode")).toBe("query");
    expect(p.get("scope")).toBe("openid profile email offline_access User.Read Mail.ReadWrite Mail.Send");
    expect(p.get("code_challenge")).toBe("chal_lenge");
    expect(p.get("code_challenge_method")).toBe("S256");
    expect(p.get("state")).toBe("st4te");
    expect(p.get("prompt")).toBe("select_account");
    expect(p.get("login_hint")).toBe("me@outlook.com");
  });

  it("uses the configured tenant and explains missing credentials", () => {
    config().microsoft.tenant = "organizations";
    expect(microsoftAuthUrl({ state: "s", codeChallenge: "c" })).toMatch(
      /^https:\/\/login\.microsoftonline\.com\/organizations\/oauth2\/v2\.0\/authorize\?/,
    );
    config().microsoft.clientSecret = "";
    expect(() => microsoftAuthUrl({ state: "s", codeChallenge: "c" })).toThrow(/MICROSOFT_CLIENT_SECRET/);
    config().microsoft.clientId = "";
    expect(() => microsoftAuthUrl({ state: "s", codeChallenge: "c" })).toThrow(/MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET/);
  });

  it("exchanges the code with secret + verifier", async () => {
    let form: URLSearchParams | null = null;
    route("POST", "https://login.microsoftonline.com/common/oauth2/v2.0/token", (c) => {
      form = new URLSearchParams(String(c.rawBody));
      expect(c.headers["content-type"]).toBe("application/x-www-form-urlencoded");
      return json({
        token_type: "Bearer",
        scope: "openid profile email User.Read Mail.ReadWrite Mail.Send",
        expires_in: 4799,
        ext_expires_in: 4799,
        access_token: "eyJ0eXAi.access",
        refresh_token: "M.C5_BAY.refresh-1",
        id_token: "eyJ0eXAi.id",
      });
    });
    const before = Date.now();
    const t = await microsoftExchangeCode("M.code123", "verifier-xyz");
    expect(form!.get("grant_type")).toBe("authorization_code");
    expect(form!.get("code")).toBe("M.code123");
    expect(form!.get("code_verifier")).toBe("verifier-xyz");
    expect(form!.get("client_secret")).toBe("s3cr3t~value");
    expect(form!.get("redirect_uri")).toBe(`${config().appUrl}/api/auth/microsoft/callback`);
    expect(form!.get("scope")).toContain("offline_access");
    expect(t.accessToken).toBe("eyJ0eXAi.access");
    expect(t.refreshToken).toBe("M.C5_BAY.refresh-1");
    expect(t.idToken).toBe("eyJ0eXAi.id");
    expect(t.expiresAt).toBeGreaterThanOrEqual(before + 4799_000);
  });

  it("returns the rotated refresh token, or keeps the old one", async () => {
    const forms: URLSearchParams[] = [];
    let rotate = true;
    route("POST", "https://login.microsoftonline.com/common/oauth2/v2.0/token", (c) => {
      forms.push(new URLSearchParams(String(c.rawBody)));
      return json({
        token_type: "Bearer",
        scope: "Mail.ReadWrite",
        expires_in: 3600,
        access_token: "new-access",
        ...(rotate ? { refresh_token: "rotated-refresh" } : {}),
      });
    });
    const a = await microsoftRefresh("old-refresh");
    expect(forms[0].get("grant_type")).toBe("refresh_token");
    expect(forms[0].get("refresh_token")).toBe("old-refresh");
    expect(a.refreshToken).toBe("rotated-refresh");
    rotate = false;
    const b = await microsoftRefresh("old-refresh");
    expect(b.refreshToken).toBe("old-refresh");
  });

  it("maps invalid_grant / interaction_required to AuthExpiredError", async () => {
    let error = "invalid_grant";
    route("POST", "https://login.microsoftonline.com/common/oauth2/v2.0/token", () =>
      json(
        {
          error,
          error_description:
            "AADSTS70000: The provided value for the 'refresh_token' is not valid.\r\nTrace ID: abc\r\nCorrelation ID: def",
          error_codes: [70000],
        },
        400,
      ),
    );
    await expect(microsoftRefresh("r")).rejects.toBeInstanceOf(AuthExpiredError);
    error = "interaction_required";
    await expect(microsoftRefresh("r")).rejects.toBeInstanceOf(AuthExpiredError);
    error = "invalid_client";
    await expect(microsoftRefresh("r")).rejects.toThrow(/MICROSOFT_CLIENT_ID/);
  });

  it("reads identity from the id_token", () => {
    const tok = (claims: object) =>
      `eyJhbGciOiJSUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
    expect(
      microsoftIdentityFromIdToken(tok({ sub: "AAAAAAAAAAAAAAAAAAAAAIkzqFVrSaSaFHy782bbtaQ", name: "Ana Ruiz", preferred_username: "Ana.Ruiz@outlook.com" })),
    ).toEqual({ email: "ana.ruiz@outlook.com", name: "Ana Ruiz", sub: "AAAAAAAAAAAAAAAAAAAAAIkzqFVrSaSaFHy782bbtaQ" });
    expect(microsoftIdentityFromIdToken(tok({ sub: "s1", email: "Work@Contoso.com", preferred_username: "upn@contoso.com" })).email).toBe(
      "work@contoso.com",
    );
  });
});

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

const provider = () => new OutlookProvider(tokens, { baseUrl: BASE });

describe("OutlookProvider folders", () => {
  it("getProfile prefers mail and falls back to userPrincipalName", async () => {
    route("GET", "/me", (c) => {
      expect(q(c, "$select")).toBe("displayName,mail,userPrincipalName");
      return json({ displayName: "Ana Ruiz", mail: null, userPrincipalName: "Ana.Ruiz@Outlook.com" });
    });
    expect(await provider().getProfile()).toEqual({ name: "Ana Ruiz", email: "ana.ruiz@outlook.com" });
  });

  it("maps well-known folders, handles a missing archive and skips noise folders", async () => {
    mountWellKnown({ archive: false });
    mountFolderList({ archive: false });
    const folders = await provider().listFolders();
    expect(folders.map((f) => [f.id, f.name, f.kind])).toEqual([
      ["INBOX", "Inbox", "system"],
      ["SENT", "Sent", "system"],
      ["DRAFT", "Drafts", "system"],
      ["SPAM", "Spam", "system"],
      ["TRASH", "Trash", "system"],
      [ID.inboxVendors, "Inbox/Vendors", "user"],
      [ID.projects, "Projects", "user"],
      [ID.projAcme, "Projects/Acme", "user"],
    ]);
    const inbox = folders[0];
    expect(inbox).toMatchObject({ unread: 7, total: 1520, style: "folder" });
    expect(folders.every((f) => f.style === "folder")).toBe(true);
    // archive lookup 404'd without failing the call
    expect(graphCalls().some((c) => c.path === "/me/mailFolders/archive")).toBe(true);
  });
});

describe("OutlookProvider sync", () => {
  it("runs a delta initial sync over the synced folders and builds a cursor", async () => {
    mountWellKnown();
    mountFolderList();
    route("GET", "/me/messages", (c) => {
      expect(q(c, "$skip")).toBe("500");
      expect(q(c, "$top")).toBe("1");
      expect(q(c, "$orderby")).toBe("receivedDateTime desc");
      return json({ value: [{ "@odata.etag": 'W/"x"', id: "cut", receivedDateTime: "2026-06-01T08:00:00Z" }] });
    });
    const deltaPath = (fid: string) => `/me/mailFolders/${fid}/messages/delta`;
    route("GET", deltaPath(ID.inbox), (c) => {
      if (q(c, "$skiptoken") === "p2")
        return json({
          value: [gmsg("m3", { isRead: false }), removed("gone-1")],
          "@odata.deltaLink": `${BASE}/me/mailFolders/${ID.inbox}/messages/delta?$deltatoken=inbox-d1`,
        });
      return json({
        "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#Collection(message)",
        value: [
          gmsg("m1", {
            from: null,
            sender: addr("GitHub", "Notifications@GitHub.com"),
            flag: { flagStatus: "flagged", dueDateTime: null },
            inferenceClassification: "other",
            importance: "High",
            isRead: false,
            ccRecipients: [addr("", "team@contoso.com")],
          }),
          gmsg("m2"),
        ],
        "@odata.nextLink": `${BASE}/me/mailFolders/${ID.inbox}/messages/delta?$skiptoken=p2`,
      });
    });
    route("GET", deltaPath(ID.sent), {
      value: [
        gmsg("s1", {
          parentFolderId: ID.sent,
          from: addr("Me", "me@fabrikam.onmicrosoft.com"),
          receivedDateTime: "2026-11-07T10:00:05Z",
          sentDateTime: "2026-11-07T10:00:00Z",
        }),
      ],
      "@odata.deltaLink": `${BASE}/me/mailFolders/${ID.sent}/messages/delta?$deltatoken=sent-d1`,
    });
    route("GET", deltaPath(ID.drafts), {
      value: [gmsg("d1", { parentFolderId: ID.drafts, isDraft: true, isRead: false, from: null, sender: null })],
      "@odata.deltaLink": `${BASE}/me/mailFolders/${ID.drafts}/messages/delta?$deltatoken=drafts-d1`,
    });
    route("GET", deltaPath(ID.archive), {
      value: [gmsg("a1", { parentFolderId: ID.archive })],
      "@odata.deltaLink": `${BASE}/me/mailFolders/${ID.archive}/messages/delta?$deltatoken=archive-d1`,
    });
    for (const fid of [ID.inboxVendors, ID.projects, ID.projAcme]) {
      route("GET", deltaPath(fid), {
        value: fid === ID.projAcme ? [gmsg("u1", { parentFolderId: fid })] : [],
        "@odata.deltaLink": `${BASE}/me/mailFolders/${fid}/messages/delta?$deltatoken=${fid.slice(-10)}`,
      });
    }

    const pages: { ids: string[]; deleted: string[]; done: number; total: number }[] = [];
    const all = new Map<string, MessageMeta>();
    const res = await provider().initialSync({
      maxMessages: 500,
      onPage: (page, progress) => {
        pages.push({ ids: page.messages.map((m) => m.id), deleted: page.deleted, ...progress });
        for (const m of page.messages) all.set(m.id, m);
      },
    });

    const deltaCalls = graphCalls().filter((c) => c.path.endsWith("/messages/delta"));
    // Trash and Junk are never synced.
    expect(deltaCalls.some((c) => c.path.includes(ID.deleted) || c.path.includes(ID.junk))).toBe(false);
    const first = deltaCalls.find((c) => c.path === deltaPath(ID.inbox) && !q(c, "$skiptoken"))!;
    expect(q(first, "$filter")).toBe("receivedDateTime ge 2026-06-01T08:00:00.000Z");
    expect(q(first, "$select")).toContain("inferenceClassification");
    expect(q(first, "$select")).toContain("conversationId");
    for (const c of deltaCalls) expect(c.headers["prefer"]).toBe('IdType="ImmutableId", odata.maxpagesize=100');

    expect(pages[0]).toEqual({ ids: ["m1", "m2"], deleted: [], done: 2, total: 500 });
    expect(pages[1]).toEqual({ ids: ["m3"], deleted: ["gone-1"], done: 3, total: 500 });
    expect([...all.keys()].sort()).toEqual(["a1", "d1", "m1", "m2", "m3", "s1", "u1"]);

    const cursor = JSON.parse(res.cursor) as Record<string, string>;
    expect(Object.keys(cursor).sort()).toEqual([ID.inbox, ID.sent, ID.drafts, ID.archive, ID.inboxVendors, ID.projects, ID.projAcme].sort());
    expect(cursor[ID.inbox]).toBe(`${BASE}/me/mailFolders/${ID.inbox}/messages/delta?$deltatoken=inbox-d1`);

    // metadata mapping
    const m1 = all.get("m1")!;
    expect(m1.from).toEqual({ name: "GitHub", email: "notifications@github.com" });
    expect(m1.starred).toBe(true);
    expect(m1.unread).toBe(true);
    expect(m1.category).toBe("other");
    expect(m1.importance).toBe("high");
    expect(m1.folders).toEqual(["INBOX"]);
    expect(m1.threadId).toBe("AAQkAGVmMDEzMTM4LTZmYWUtNDdkNC1hMDZiLTU1OGY5OTZhYmY4OAAQAconv1");
    expect(m1.cc).toEqual([{ name: "team", email: "team@contoso.com" }]);
    expect(m1.messageIdHeader).toBe("<m1@contoso.com>");
    expect(m1.bulk).toEqual({ listId: null, listUnsubscribe: null, listUnsubscribePost: null, precedence: null, autoSubmitted: null });
    expect(m1.inReplyTo).toBeNull();
    const m2 = all.get("m2")!;
    expect(m2).toMatchObject({ starred: false, unread: false, category: null, importance: "normal", date: "2026-11-08T09:15:00.000Z" });
    expect(m2.from).toEqual({ name: "Dana Whitfield", email: "dana.whitfield@contoso.com" });
    expect(all.get("s1")).toMatchObject({ folders: ["SENT"], date: "2026-11-07T10:00:00.000Z" });
    expect(all.get("d1")).toMatchObject({ folders: ["DRAFT"], unread: false, from: { name: "", email: "" } });
    expect(all.get("a1")!.folders).toEqual(["ARCHIVE"]);
    expect(all.get("u1")!.folders).toEqual([ID.projAcme]);
  });

  it("follows deltaLinks, resolves moves, verifies removals and picks up new folders", async () => {
    mountWellKnown();
    mountFolderList({ extra: [folder(ID.newFolder, "Receipts", { totalItemCount: 1 })] });
    const cursor = JSON.stringify({
      [ID.inbox]: `${BASE}/me/mailFolders/${ID.inbox}/messages/delta?$deltatoken=inbox-d1`,
      [ID.archive]: `${BASE}/me/mailFolders/${ID.archive}/messages/delta?$deltatoken=archive-d1`,
      [ID.sent]: `${BASE}/me/mailFolders/${ID.sent}/messages/delta?$deltatoken=sent-d1`,
      [ID.drafts]: `${BASE}/me/mailFolders/${ID.drafts}/messages/delta?$deltatoken=drafts-d1`,
      [ID.inboxVendors]: `${BASE}/me/mailFolders/${ID.inboxVendors}/messages/delta?$deltatoken=v-d1`,
      [ID.projects]: `${BASE}/me/mailFolders/${ID.projects}/messages/delta?$deltatoken=p-d1`,
      [ID.projAcme]: `${BASE}/me/mailFolders/${ID.projAcme}/messages/delta?$deltatoken=a-d1`,
    });
    route("GET", /\/messages\/delta$/, (c) =>
      json({ value: [], "@odata.deltaLink": `${c.url.origin}${c.url.pathname}?$deltatoken=${q(c, "$deltatoken")}-same` }),
    );
    route("GET", `/me/mailFolders/${ID.inbox}/messages/delta`, (c) => {
      if (q(c, "$deltatoken") === "inbox-d1")
        return json({
          value: [gmsg("m2", { isRead: false }), removed("moved-1"), removed("hard-deleted"), removed("trashed")],
          "@odata.nextLink": `${BASE}/me/mailFolders/${ID.inbox}/messages/delta?$skiptoken=more`,
        });
      return json({ value: [], "@odata.deltaLink": `${BASE}/me/mailFolders/${ID.inbox}/messages/delta?$deltatoken=inbox-d2` });
    });
    route("GET", `/me/mailFolders/${ID.archive}/messages/delta`, {
      value: [gmsg("moved-1", { parentFolderId: ID.archive })],
      "@odata.deltaLink": `${BASE}/me/mailFolders/${ID.archive}/messages/delta?$deltatoken=archive-d2`,
    });
    route("GET", `/me/mailFolders/${ID.newFolder}/messages/delta`, (c) => {
      expect(q(c, "$filter")).toBeNull();
      return json({
        value: [gmsg("r1", { parentFolderId: ID.newFolder })],
        "@odata.deltaLink": `${BASE}/me/mailFolders/${ID.newFolder}/messages/delta?$deltatoken=new-d1`,
      });
    });
    route("POST", "/$batch", (c) => {
      const reqs = (c.body as { requests: { id: string; method: string; url: string }[] }).requests;
      return json({
        responses: reqs.map((r) =>
          r.url.startsWith("/me/messages/hard-deleted")
            ? { id: r.id, status: 404, headers: { "Content-Type": "application/json" }, body: { error: { code: "ErrorItemNotFound", message: "Not found" } } }
            : { id: r.id, status: 200, headers: { "Content-Type": "application/json" }, body: gmsg("trashed", { parentFolderId: ID.deleted }) },
        ),
      });
    });

    const res = await provider().changes(cursor);
    expect(res.resetRequired).toBe(false);
    expect(res.messages.map((m) => m.id).sort()).toEqual(["m2", "moved-1", "r1"]);
    expect(res.messages.find((m) => m.id === "moved-1")!.folders).toEqual(["ARCHIVE"]);
    expect(res.deleted.sort()).toEqual(["hard-deleted", "trashed"]);
    // moved-1 was found in another folder's delta, so only the other two were checked
    const batch = graphCalls().find((c) => c.path === "/$batch")!;
    const urls = (batch.body as { requests: { url: string; method: string }[] }).requests.map((r) => r.url.split("?")[0]);
    expect(urls.sort()).toEqual(["/me/messages/hard-deleted", "/me/messages/trashed"]);
    const next = JSON.parse(res.cursor) as Record<string, string>;
    expect(next[ID.inbox]).toBe(`${BASE}/me/mailFolders/${ID.inbox}/messages/delta?$deltatoken=inbox-d2`);
    expect(next[ID.archive]).toContain("archive-d2");
    expect(next[ID.newFolder]).toContain("new-d1");
    for (const c of graphCalls().filter((x) => x.path.endsWith("/delta"))) expect(c.headers["prefer"]).toContain("odata.maxpagesize=100");
  });

  it("asks for a reset on 410 Gone or an unusable cursor", async () => {
    mountWellKnown();
    mountFolderList();
    route("GET", /\/messages\/delta$/, () =>
      json({ error: { code: "SyncStateNotFound", message: "The sync state generation is not found." } }, 410),
    );
    const cursor = JSON.stringify({ [ID.inbox]: `${BASE}/me/mailFolders/${ID.inbox}/messages/delta?$deltatoken=old` });
    const p = provider();
    expect(await p.changes(cursor)).toEqual({ messages: [], deleted: [], cursor, resetRequired: true });
    expect((await p.changes("not json")).resetRequired).toBe(true);
    // never send the bearer token to a host that isn't Graph
    const evil = JSON.stringify({ x: "https://evil.example/steal" });
    expect((await p.changes(evil)).resetRequired).toBe(true);
    expect(calls.some((c) => c.url.host === "evil.example")).toBe(false);
  });
});

describe("OutlookProvider threads, bodies, search", () => {
  it("threadMessages filters by conversationId (escaped, no orderby) and sorts ascending", async () => {
    mountWellKnown();
    const conv = "AAQkADk'0YjE=";
    route("GET", "/me/messages", (c) => {
      if (q(c, "$skiptoken")) return json({ value: [gmsg("t1", { receivedDateTime: "2026-11-01T08:00:00Z" })] });
      expect(q(c, "$filter")).toBe("conversationId eq 'AAQkADk''0YjE='");
      expect(q(c, "$orderby")).toBeNull();
      expect(q(c, "$top")).toBe("250");
      return json({
        value: [
          gmsg("t3", { receivedDateTime: "2026-11-03T08:00:00Z" }),
          gmsg("t2", { receivedDateTime: "2026-11-02T08:00:00Z", parentFolderId: ID.sent, sentDateTime: "2026-11-02T07:59:00Z" }),
        ],
        "@odata.nextLink": `${BASE}/me/messages?$skiptoken=abc`,
      });
    });
    const list = await provider().threadMessages(conv);
    expect(list.map((m) => m.id)).toEqual(["t1", "t2", "t3"]);
    expect(list[1].folders).toEqual(["SENT"]);
  });

  it("getBody returns html, uniqueBody, headers and attachments incl. inline contentId", async () => {
    const mid = "AAMkAGVmMDEzMTM4AAA=";
    route("GET", `/me/messages/${mid}`, (c) => {
      expect(q(c, "$select")).toBe("body,uniqueBody,hasAttachments,internetMessageHeaders");
      expect(c.headers["prefer"]).toBe('IdType="ImmutableId", outlook.body-content-type="html"');
      return json({
        id: mid,
        hasAttachments: true,
        body: { contentType: "html", content: '<html><body><p>Hi</p><img src="cid:image001.png@01DB3A2C.5F1E0B70"></body></html>' },
        uniqueBody: { contentType: "html", content: "<html><body><p>Hi</p></body></html>" },
        internetMessageHeaders: [
          { name: "Received", value: "from x by y" },
          { name: "Message-ID", value: "<CAF=abc@mail.gmail.com>" },
          { name: "In-Reply-To", value: "<prev@contoso.com>" },
          { name: "References", value: "<root@contoso.com> <prev@contoso.com>" },
          { name: "list-unsubscribe", value: "<mailto:unsub@news.contoso.com>, <https://news.contoso.com/u/123>" },
          { name: "List-Unsubscribe-Post", value: "List-Unsubscribe=One-Click" },
          { name: "List-ID", value: "Contoso News <news.contoso.com>" },
          { name: "Precedence", value: "bulk" },
        ],
      });
    });
    route("GET", `/me/messages/${mid}/attachments`, (c) => {
      expect(q(c, "$select")).toBe("id,name,contentType,size,isInline");
      return json({
        value: [
          { "@odata.type": "#microsoft.graph.fileAttachment", id: "att-img", name: "image001.png", contentType: "image/png", size: 4, isInline: true },
          { "@odata.type": "#microsoft.graph.fileAttachment", id: "att-pdf", name: "Q3 report.pdf", contentType: "application/pdf", size: 254_112, isInline: false },
          { "@odata.type": "#microsoft.graph.itemAttachment", id: "att-item", name: "Fwd: Contract", contentType: null, size: 30_211, isInline: false },
          { "@odata.type": "#microsoft.graph.referenceAttachment", id: "att-ref", name: "Budget.xlsx", contentType: null, size: 512, isInline: false },
        ],
      });
    });
    route("GET", `/me/messages/${mid}/attachments/att-img`, {
      "@odata.type": "#microsoft.graph.fileAttachment",
      id: "att-img",
      name: "image001.png",
      contentType: "image/png",
      size: 4,
      isInline: true,
      contentId: "<image001.png@01DB3A2C.5F1E0B70>",
      contentBytes: Buffer.from([1, 2, 3, 4]).toString("base64"),
    });
    route("GET", `/me/messages/${mid}/attachments/att-pdf/$value`, () => new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 }));

    const p = provider();
    const body = await p.getBody(mid);
    expect(body.html).toContain("cid:image001.png");
    expect(body.text).toBeNull();
    expect(body.uniqueHtml).toBe("<html><body><p>Hi</p></body></html>");
    expect(body.attachments).toEqual([
      { id: "att-img", filename: "image001.png", mimeType: "image/png", size: 4, inline: true, contentId: "image001.png@01DB3A2C.5F1E0B70" },
      { id: "att-pdf", filename: "Q3 report.pdf", mimeType: "application/pdf", size: 254_112, inline: false, contentId: null },
      { id: "att-item", filename: "Fwd: Contract.eml", mimeType: "message/rfc822", size: 30_211, inline: false, contentId: null },
      { id: "att-ref", filename: "Budget.xlsx", mimeType: "application/octet-stream", size: 0, inline: false, contentId: null },
    ]);
    expect(body.headers).toEqual({
      bulk: {
        listId: "Contoso News <news.contoso.com>",
        listUnsubscribe: "<mailto:unsub@news.contoso.com>, <https://news.contoso.com/u/123>",
        listUnsubscribePost: "List-Unsubscribe=One-Click",
        precedence: "bulk",
        autoSubmitted: null,
      },
      messageIdHeader: "<CAF=abc@mail.gmail.com>",
      inReplyTo: "<prev@contoso.com>",
      references: "<root@contoso.com> <prev@contoso.com>",
    });

    // inline image bytes come from the cache filled while learning the contentId
    const before = calls.length;
    const img = await p.getAttachment(mid, "att-img");
    expect(calls.length).toBe(before);
    expect([...img.data]).toEqual([1, 2, 3, 4]);
    const pdf = await p.getAttachment(mid, "att-pdf");
    expect(pdf).toMatchObject({ filename: "Q3 report.pdf", mimeType: "application/pdf" });
    expect(pdf.data.toString("latin1")).toBe("%PDF");
    await expect(p.getAttachment(mid, "att-ref")).rejects.toThrow(/cloud file/);
  });

  it("getAttachment looks up name/type when not cached", async () => {
    route("GET", "/me/messages/m9/attachments/a9", (c) => {
      expect(q(c, "$select")).toBe("name,contentType");
      return json({ "@odata.type": "#microsoft.graph.fileAttachment", name: "notes.txt", contentType: "text/plain" });
    });
    route("GET", "/me/messages/m9/attachments/a9/$value", () => new Response("hello", { status: 200 }));
    expect(await provider().getAttachment("m9", "a9")).toEqual({ filename: "notes.txt", mimeType: "text/plain", data: Buffer.from("hello") });
  });

  it("search quotes the query, follows nextLink to the limit and sorts newest first", async () => {
    mountWellKnown();
    route("GET", "/me/messages", (c) => {
      if (q(c, "$skiptoken")) return json({ value: [gmsg("x3", { receivedDateTime: "2026-11-09T00:00:00Z" }), gmsg("x4")] });
      expect(q(c, "$search")).toBe('"from:dana \\"q3 plan\\""');
      expect(q(c, "$orderby")).toBeNull();
      expect(q(c, "$top")).toBe("3");
      return json({
        value: [gmsg("x1", { receivedDateTime: "2026-10-01T00:00:00Z" }), gmsg("x2", { receivedDateTime: "2026-11-05T00:00:00Z" })],
        "@odata.nextLink": `${BASE}/me/messages?$skiptoken=s2`,
      });
    });
    const res = await provider().search('from:dana "q3 plan"', 3);
    expect(res.map((m) => m.id)).toEqual(["x3", "x4", "x2"]);
  });
});

describe("OutlookProvider modify", () => {
  interface SubReq {
    id: string;
    method: string;
    url: string;
    body?: unknown;
    headers: Record<string, string>;
  }
  const batchBodies = () => graphCalls().filter((c) => c.path === "/$batch").map((c) => (c.body as { requests: SubReq[] }).requests);

  it("batches PATCHes in groups of 20 and retries throttled sub-requests", async () => {
    let throttled = false;
    route("POST", "/$batch", (c) => {
      const reqs = (c.body as { requests: SubReq[] }).requests;
      return json({
        responses: reqs.map((r) => {
          if (r.url === "/me/messages/id-3" && !throttled) {
            throttled = true;
            return {
              id: r.id,
              status: 429,
              headers: { "Retry-After": "0", "Content-Type": "application/json" },
              body: { error: { code: "ApplicationThrottled", message: "Application is over its MailboxConcurrency limit." } },
            };
          }
          return { id: r.id, status: 200, headers: { "Content-Type": "application/json" }, body: { id: r.url.split("/").pop() } };
        }),
      });
    });
    const ids = Array.from({ length: 25 }, (_, i) => `id-${i}`);
    await provider().modify(ids, { kind: "read", value: true });
    const batches = batchBodies();
    expect(batches.map((b) => b.length)).toEqual([20, 1, 5]);
    expect(batches[0][0]).toEqual({
      id: "0",
      method: "PATCH",
      url: "/me/messages/id-0",
      headers: { Prefer: 'IdType="ImmutableId"', "Content-Type": "application/json" },
      body: { isRead: true },
    });
    expect(batches[1][0].url).toBe("/me/messages/id-3");
  });

  it("maps star, archive, trash, spam, inbox and move", async () => {
    mountWellKnown();
    route("POST", "/$batch", (c) =>
      json({ responses: (c.body as { requests: SubReq[] }).requests.map((r) => ({ id: r.id, status: 201, body: {} })) }),
    );
    const p = provider();
    await p.modify(["a"], { kind: "starred", value: true });
    await p.modify(["a"], { kind: "starred", value: false });
    await p.modify(["a"], { kind: "archive" });
    await p.modify(["a"], { kind: "trash" });
    await p.modify(["a"], { kind: "spam" });
    await p.modify(["a"], { kind: "inbox" });
    await p.modify(["a"], { kind: "move", folderId: ID.projects });
    await p.modify(["a"], { kind: "move", folderId: "TRASH" });
    const subs = batchBodies().map((b) => b[0]);
    expect(subs.map((s) => [s.method, s.url, s.body])).toEqual([
      ["PATCH", "/me/messages/a", { flag: { flagStatus: "flagged" } }],
      ["PATCH", "/me/messages/a", { flag: { flagStatus: "notFlagged" } }],
      ["POST", "/me/messages/a/move", { destinationId: "archive" }],
      ["POST", "/me/messages/a/move", { destinationId: "deleteditems" }],
      ["POST", "/me/messages/a/move", { destinationId: "junkemail" }],
      ["POST", "/me/messages/a/move", { destinationId: "inbox" }],
      ["POST", "/me/messages/a/move", { destinationId: ID.projects }],
      ["POST", "/me/messages/a/move", { destinationId: "deleteditems" }],
    ]);
    await expect(p.modify(["a"], { kind: "addLabel", folderId: "x" })).rejects.toThrow("Outlook uses folders; use move");
    await expect(p.modify(["a"], { kind: "removeLabel", folderId: "x" })).rejects.toThrow("Outlook uses folders; use move");
  });

  it("throws when a sub-request finally fails, and refuses archive without an Archive folder", async () => {
    route("POST", "/$batch", (c) =>
      json({
        responses: (c.body as { requests: SubReq[] }).requests.map((r) => ({
          id: r.id,
          status: 404,
          body: { error: { code: "ErrorItemNotFound", message: "The specified object was not found in the store." } },
        })),
      }),
    );
    await expect(provider().modify(["x", "y"], { kind: "read", value: false })).rejects.toThrow(/2 of 2.*ErrorItemNotFound/);
    mountWellKnown({ archive: false });
    await expect(provider().modify(["x"], { kind: "archive" })).rejects.toThrow(/no Archive folder/);
  });
});

describe("OutlookProvider send", () => {
  const base: RawOutgoing = {
    from: { name: "Me", email: "me@fabrikam.onmicrosoft.com" },
    to: [{ name: "Dana Whitfield", email: "dana.whitfield@contoso.com" }],
    cc: [{ name: "", email: "team@contoso.com" }],
    bcc: [],
    subject: "Q3 plan",
    text: "Looks good",
    html: "<p>Looks good</p>",
    attachments: [{ filename: "plan.txt", mimeType: "text/plain", data: Buffer.from("plan") }],
    inReplyTo: null,
    references: null,
    threadId: null,
    replyToProviderId: null,
    mode: "new",
  };

  it("sends new mail with /me/sendMail", async () => {
    route("POST", "/me/sendMail", () => new Response(null, { status: 202 }));
    expect(await provider().send(base)).toEqual({ id: null, threadId: null });
    const call = graphCalls()[0];
    expect(call.body).toEqual({
      message: {
        subject: "Q3 plan",
        body: { contentType: "HTML", content: "<p>Looks good</p>" },
        toRecipients: [{ emailAddress: { name: "Dana Whitfield", address: "dana.whitfield@contoso.com" } }],
        ccRecipients: [{ emailAddress: { name: "team@contoso.com", address: "team@contoso.com" } }],
        bccRecipients: [],
        attachments: [
          { "@odata.type": "#microsoft.graph.fileAttachment", name: "plan.txt", contentType: "text/plain", contentBytes: "cGxhbg==" },
        ],
      },
      saveToSentItems: true,
    });
  });

  it("replies via createReply → PATCH → attachments → send", async () => {
    const orig = "AAMkAGorig=";
    const draftId = "AAMkAGdraft=";
    route("POST", `/me/messages/${orig}/createReply`, json(gmsg(draftId, { isDraft: true, conversationId: "conv-77" }), 201));
    route("PATCH", `/me/messages/${draftId}`, (c) => json({ ...gmsg(draftId), ...(c.body as object) }));
    route("POST", `/me/messages/${draftId}/attachments`, () => json({ id: "new-att" }, 201));
    route("POST", `/me/messages/${draftId}/send`, () => new Response(null, { status: 202 }));
    const res = await provider().send({
      ...base,
      mode: "reply",
      subject: "RE: Q3 plan",
      html: "<p>Looks good</p><blockquote>original</blockquote>",
      replyToProviderId: orig,
      threadId: "conv-77",
      inReplyTo: "<orig@contoso.com>",
    });
    expect(res).toEqual({ id: null, threadId: "conv-77" });
    expect(graphCalls().map((c) => `${c.method} ${c.path}`)).toEqual([
      `POST /me/messages/${orig}/createReply`,
      `PATCH /me/messages/${draftId}`,
      `POST /me/messages/${draftId}/attachments`,
      `POST /me/messages/${draftId}/send`,
    ]);
    expect(graphCalls()[1].body).toEqual({
      subject: "RE: Q3 plan",
      body: { contentType: "HTML", content: "<p>Looks good</p><blockquote>original</blockquote>" },
      toRecipients: [{ emailAddress: { name: "Dana Whitfield", address: "dana.whitfield@contoso.com" } }],
      ccRecipients: [{ emailAddress: { name: "team@contoso.com", address: "team@contoso.com" } }],
      bccRecipients: [],
    });
    expect(graphCalls()[2].body).toMatchObject({ "@odata.type": "#microsoft.graph.fileAttachment", name: "plan.txt", contentBytes: "cGxhbg==" });
  });

  it("uploads large attachments with an upload session and deletes the draft on failure", async () => {
    const draftId = "AAMkAGbig=";
    const big = Buffer.alloc(5 * 1024 * 1024, 7);
    route("POST", "/me/messages", json(gmsg(draftId, { isDraft: true, conversationId: "conv-big" }), 201));
    route("POST", `/me/messages/${draftId}/attachments/createUploadSession`, {
      "@odata.context": "https://graph.microsoft.com/v1.0/$metadata#microsoft.graph.uploadSession",
      uploadUrl: "https://outlook.test/api/v2.0/Users('x')/Messages('y')/AttachmentSessions('z')?authtoken=abc",
      expirationDateTime: "2026-11-10T12:00:00Z",
      nextExpectedRanges: ["0-"],
    });
    const ranges: string[] = [];
    route("PUT", /^https:\/\/outlook\.test\//, (c) => {
      expect(c.headers["authorization"]).toBeUndefined();
      ranges.push(c.headers["content-range"]);
      return ranges.length === 1 ? json({ nextExpectedRanges: ["3932160-"] }) : new Response(null, { status: 201 });
    });
    route("POST", `/me/messages/${draftId}/send`, () => new Response(null, { status: 202 }));
    const res = await provider().send({ ...base, attachments: [{ filename: "deck.pptx", mimeType: "application/octet-stream", data: big }] });
    expect(res).toEqual({ id: null, threadId: "conv-big" });
    expect(ranges).toEqual([`bytes 0-3932159/${big.length}`, `bytes 3932160-${big.length - 1}/${big.length}`]);
    expect(graphCalls().find((c) => c.path.endsWith("/createUploadSession"))!.body).toEqual({
      AttachmentItem: { attachmentType: "file", name: "deck.pptx", size: big.length, contentType: "application/octet-stream" },
    });

    // failure before send → draft removed
    calls = [];
    route("PUT", /^https:\/\/outlook\.test\//, () => new Response("bad", { status: 400 }));
    route("DELETE", `/me/messages/${draftId}`, () => new Response(null, { status: 204 }));
    await expect(provider().send({ ...base, attachments: [{ filename: "deck.pptx", mimeType: "", data: big }] })).rejects.toThrow(/deck\.pptx/);
    expect(graphCalls().some((c) => c.method === "DELETE")).toBe(true);
    expect(graphCalls().some((c) => c.path.endsWith("/send"))).toBe(false);
  });
});
