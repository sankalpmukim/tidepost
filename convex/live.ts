import { v } from "convex/values";
import { query, type QueryCtx } from "./_generated/server";
import { MAX_SEARCH_SCAN, MAX_THREADS } from "./lib";
import { matchesView, sortThreads, toSummary, type LiveThread } from "./lanes";
import { requireIdentity, requireOwner } from "./model/auth";

const person = v.object({ name: v.string(), email: v.string() });
const lane = v.union(v.literal("needs"), v.literal("waiting"), v.literal("fyi"), v.literal("updates"), v.literal("done"));
const provider = v.union(v.literal("gmail"), v.literal("outlook"), v.literal("demo"));

const syncState = v.object({
  phase: v.union(v.literal("idle"), v.literal("initial"), v.literal("incremental"), v.literal("error")),
  done: v.number(),
  total: v.number(),
  lastSyncedAt: v.union(v.string(), v.null()),
  error: v.union(v.string(), v.null()),
});

const account = v.object({
  id: v.string(),
  provider,
  email: v.string(),
  name: v.string(),
  sync: syncState,
});

const settings = v.object({
  undoSendSeconds: v.number(),
  signature: v.string(),
  density: v.union(v.literal("compact"), v.literal("comfortable")),
  loadRemoteImages: v.union(v.literal("ask"), v.literal("always")),
  theme: v.union(v.literal("system"), v.literal("light"), v.literal("dark")),
  readingPane: v.union(v.literal("right"), v.literal("full")),
  onboardedAt: v.number(),
});

const threadSummary = v.object({
  id: v.string(),
  accountId: v.string(),
  subject: v.string(),
  snippet: v.string(),
  participants: v.array(person),
  lastFrom: person,
  lastFromMe: v.boolean(),
  lastDate: v.string(),
  firstDate: v.string(),
  messageCount: v.number(),
  unreadCount: v.number(),
  starred: v.boolean(),
  hasAttachments: v.boolean(),
  folders: v.array(v.string()),
  inInbox: v.boolean(),
  lane,
  toMeDirect: v.boolean(),
  isBulk: v.boolean(),
  pinned: v.boolean(),
  snoozedUntil: v.union(v.string(), v.null()),
  remindAt: v.union(v.string(), v.null()),
  nudged: v.boolean(),
  audienceSize: v.number(),
});

type Settings = {
  undoSendSeconds: number;
  signature: string;
  density: "compact" | "comfortable";
  loadRemoteImages: "ask" | "always";
  theme: "system" | "light" | "dark";
  readingPane: "right" | "full";
  onboardedAt: number;
};

type Sync = {
  phase: "idle" | "initial" | "incremental" | "error";
  done: number;
  total: number;
  lastSyncedAt: string | null;
  error: string | null;
};

const DEFAULT_SETTINGS: Settings = {
  undoSendSeconds: 10,
  signature: "",
  density: "comfortable",
  loadRemoteImages: "ask",
  theme: "system",
  readingPane: "right",
  onboardedAt: 0,
};

const DEFAULT_SYNC: Sync = { phase: "idle", done: 0, total: 0, lastSyncedAt: null, error: null };

function parsePeople(raw: string | undefined): { name: string; email: string }[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((p): p is { name: unknown; email: unknown } => !!p && typeof p === "object")
      .map((p) => ({ name: typeof p.name === "string" ? p.name : "", email: typeof p.email === "string" ? p.email : "" }))
      .slice(0, 50);
  } catch {
    return [];
  }
}

function parseSettings(raw: string): Settings {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    return {
      undoSendSeconds: typeof o.undoSendSeconds === "number" ? o.undoSendSeconds : DEFAULT_SETTINGS.undoSendSeconds,
      signature: typeof o.signature === "string" ? o.signature : DEFAULT_SETTINGS.signature,
      density: o.density === "compact" || o.density === "comfortable" ? o.density : DEFAULT_SETTINGS.density,
      loadRemoteImages: o.loadRemoteImages === "always" || o.loadRemoteImages === "ask" ? o.loadRemoteImages : DEFAULT_SETTINGS.loadRemoteImages,
      theme: o.theme === "light" || o.theme === "dark" || o.theme === "system" ? o.theme : DEFAULT_SETTINGS.theme,
      readingPane: o.readingPane === "full" || o.readingPane === "right" ? o.readingPane : DEFAULT_SETTINGS.readingPane,
      onboardedAt: typeof o.onboardedAt === "number" ? o.onboardedAt : DEFAULT_SETTINGS.onboardedAt,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function parseSync(raw: string): Sync {
  try {
    const o = JSON.parse(raw) as Record<string, unknown>;
    const phase = o.phase === "idle" || o.phase === "initial" || o.phase === "incremental" || o.phase === "error" ? o.phase : DEFAULT_SYNC.phase;
    return {
      phase,
      done: typeof o.done === "number" ? o.done : 0,
      total: typeof o.total === "number" ? o.total : 0,
      lastSyncedAt: typeof o.lastSyncedAt === "string" || o.lastSyncedAt === null ? (o.lastSyncedAt as string | null) : null,
      error: typeof o.error === "string" || o.error === null ? (o.error as string | null) : null,
    };
  } catch {
    return DEFAULT_SYNC;
  }
}

async function ownedAccount(ctx: QueryCtx, accountId: string) {
  const row = await ctx.db.query("accounts").withIndex("by_accountId", (q) => q.eq("accountId", accountId)).unique();
  return await requireOwner(ctx, row);
}

async function joined(ctx: QueryCtx, accountId: string): Promise<LiveThread[]> {
  const threads = await ctx.db
    .query("threads")
    .withIndex("by_accountId_and_lastDateMs", (q) => q.eq("accountId", accountId))
    .order("desc")
    .take(MAX_THREADS);
  const states = await ctx.db
    .query("threadStates")
    .withIndex("by_accountId_and_threadId", (q) => q.eq("accountId", accountId))
    .take(MAX_THREADS);
  const map = new Map(states.map((s) => [s.threadId, s]));
  return threads.map((t) => {
    const s = map.get(t.threadId);
    return {
      accountId: t.accountId,
      threadId: t.threadId,
      subject: t.subject,
      snippet: t.snippet,
      participants: t.participants,
      lastFromName: t.lastFromName,
      lastFromEmail: t.lastFromEmail,
      lastFromMe: t.lastFromMe,
      lastDateMs: t.lastDateMs,
      firstDateMs: t.firstDateMs,
      messageCount: t.messageCount,
      unreadCount: t.unreadCount,
      starred: t.starred,
      hasAtt: t.hasAtt,
      folders: t.folders,
      inInbox: t.inInbox,
      toMeDirect: t.toMeDirect,
      isBulk: t.isBulk,
      audience: t.audience,
      pinned: s?.pinned ?? 0,
      snoozedUntil: s?.snoozedUntil ?? null,
      remindAt: s?.remindAt ?? null,
      nudged: s?.nudged ?? 0,
      waitingDismissedAt: s?.waitingDismissedAt ?? null,
    };
  });
}

export const me = query({
  args: {},
  returns: v.union(
    v.null(),
    v.object({
      accounts: v.array(account),
      settings,
    }),
  ),
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return null;
    const userId = identity.subject;
    const user = await ctx.db.query("users").withIndex("by_appId", (q) => q.eq("appId", userId)).unique();
    const accounts = await ctx.db.query("accounts").withIndex("by_userId", (q) => q.eq("userId", userId)).take(20);
    return {
      settings: parseSettings(user?.settings ?? "{}"),
      accounts: accounts
        .sort((a, b) => a.createdAt - b.createdAt)
        .map((a) => ({
          id: a.accountId,
          provider: a.provider,
          email: a.email,
          name: a.name,
          sync: parseSync(a.sync),
        })),
    };
  },
});

export const counts = query({
  args: { accountId: v.string(), now: v.number() },
  returns: v.union(
    v.null(),
    v.object({
      needs: v.number(),
      waiting: v.number(),
      fyi: v.number(),
      updates: v.number(),
      inboxUnread: v.number(),
      snoozed: v.number(),
    }),
  ),
  handler: async (ctx, args) => {
    await ownedAccount(ctx, args.accountId);
    const rows = await joined(ctx, args.accountId);
    const count = (view: string, extra?: (r: LiveThread) => boolean) =>
      rows.filter((r) => matchesView(r, view, args.now) && (!extra || extra(r))).length;
    return {
      needs: count("needs"),
      waiting: count("waiting"),
      fyi: count("fyi", (r) => r.unreadCount > 0),
      updates: count("updates", (r) => r.unreadCount > 0),
      inboxUnread: count("inbox", (r) => r.unreadCount > 0),
      snoozed: count("snoozed"),
    };
  },
});

export const threads = query({
  args: { accountId: v.string(), view: v.string(), now: v.number() },
  returns: v.union(v.null(), v.object({ threads: v.array(threadSummary), total: v.number() })),
  handler: async (ctx, args) => {
    await ownedAccount(ctx, args.accountId);
    const rows = (await joined(ctx, args.accountId))
      .filter((r) => matchesView(r, args.view, args.now))
      .sort((a, b) => sortThreads(args.view, a, b));
    return { threads: rows.map((r) => toSummary(r, args.now)), total: rows.length };
  },
});

export const thread = query({
  args: { accountId: v.string(), threadId: v.string(), now: v.number() },
  returns: v.union(v.null(), threadSummary),
  handler: async (ctx, args) => {
    await ownedAccount(ctx, args.accountId);
    const t = await ctx.db
      .query("threads")
      .withIndex("by_accountId_and_threadId", (q) => q.eq("accountId", args.accountId).eq("threadId", args.threadId))
      .unique();
    if (!t) return null;
    const s = await ctx.db
      .query("threadStates")
      .withIndex("by_accountId_and_threadId", (q) => q.eq("accountId", args.accountId).eq("threadId", args.threadId))
      .unique();
    return toSummary(
      {
        accountId: t.accountId,
        threadId: t.threadId,
        subject: t.subject,
        snippet: t.snippet,
        participants: t.participants,
        lastFromName: t.lastFromName,
        lastFromEmail: t.lastFromEmail,
        lastFromMe: t.lastFromMe,
        lastDateMs: t.lastDateMs,
        firstDateMs: t.firstDateMs,
        messageCount: t.messageCount,
        unreadCount: t.unreadCount,
        starred: t.starred,
        hasAtt: t.hasAtt,
        folders: t.folders,
        inInbox: t.inInbox,
        toMeDirect: t.toMeDirect,
        isBulk: t.isBulk,
        audience: t.audience,
        pinned: s?.pinned ?? 0,
        snoozedUntil: s?.snoozedUntil ?? null,
        remindAt: s?.remindAt ?? null,
        nudged: s?.nudged ?? 0,
        waitingDismissedAt: s?.waitingDismissedAt ?? null,
      },
      args.now,
    );
  },
});

export const localSearch = query({
  args: { accountId: v.string(), q: v.string(), now: v.number() },
  returns: v.union(v.null(), v.array(threadSummary)),
  handler: async (ctx, args) => {
    await ownedAccount(ctx, args.accountId);
    const terms = args.q
      .replace(/["*():^]/g, " ")
      .split(/\s+/)
      .filter((t) => t && !t.includes(":"))
      .map((t) => t.toLowerCase());
    if (!terms.length) return [];
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_accountId_and_dateMs", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .take(MAX_SEARCH_SCAN);
    const hits = new Map<string, number>();
    for (const m of messages) {
      const hay = m.searchText || `${m.subject} ${m.fromName} ${m.fromEmail} ${m.snippet}`.toLowerCase();
      if (terms.every((t) => hay.includes(t))) hits.set(m.threadId, Math.max(hits.get(m.threadId) ?? 0, m.dateMs));
    }
    const ids = [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, 60).map(([id]) => id);
    const out = [];
    for (const id of ids) {
      const t = await ctx.db
        .query("threads")
        .withIndex("by_accountId_and_threadId", (q) => q.eq("accountId", args.accountId).eq("threadId", id))
        .unique();
      if (!t) continue;
      const s = await ctx.db
        .query("threadStates")
        .withIndex("by_accountId_and_threadId", (q) => q.eq("accountId", args.accountId).eq("threadId", id))
        .unique();
      out.push(
        toSummary(
          {
            accountId: t.accountId,
            threadId: t.threadId,
            subject: t.subject,
            snippet: t.snippet,
            participants: t.participants,
            lastFromName: t.lastFromName,
            lastFromEmail: t.lastFromEmail,
            lastFromMe: t.lastFromMe,
            lastDateMs: t.lastDateMs,
            firstDateMs: t.firstDateMs,
            messageCount: t.messageCount,
            unreadCount: t.unreadCount,
            starred: t.starred,
            hasAtt: t.hasAtt,
            folders: t.folders,
            inInbox: t.inInbox,
            toMeDirect: t.toMeDirect,
            isBulk: t.isBulk,
            audience: t.audience,
            pinned: s?.pinned ?? 0,
            snoozedUntil: s?.snoozedUntil ?? null,
            remindAt: s?.remindAt ?? null,
            nudged: s?.nudged ?? 0,
            waitingDismissedAt: s?.waitingDismissedAt ?? null,
          },
          args.now,
        ),
      );
    }
    return out;
  },
});

export const sends = query({
  args: { now: v.number() },
  returns: v.union(
    v.null(),
    v.array(
      v.object({
        id: v.string(),
        accountId: v.string(),
        sendAt: v.string(),
        subject: v.string(),
        to: v.array(person),
        status: v.union(v.literal("queued"), v.literal("sending"), v.literal("sent"), v.literal("failed"), v.literal("cancelled")),
        error: v.union(v.string(), v.null()),
        threadId: v.union(v.string(), v.null()),
      }),
    ),
  ),
  handler: async (ctx, args) => {
    const identity = await requireIdentity(ctx);
    const accounts = await ctx.db.query("accounts").withIndex("by_userId", (q) => q.eq("userId", identity.subject)).take(8);
    const since = args.now - 10 * 60_000;
    const out = [];
    for (const a of accounts) {
      const rows = await ctx.db
        .query("sendQueue")
        .withIndex("by_accountId_and_createdAt", (q) => q.eq("accountId", a.accountId))
        .order("desc")
        .take(20);
      for (const row of rows) {
        if (row.status === "queued" || row.status === "sending" || row.status === "failed" || row.createdAt > since) {
          out.push({
            id: row.queueId,
            accountId: row.accountId,
            sendAt: new Date(row.sendAt).toISOString(),
            subject: row.displaySubject ?? "",
            to: parsePeople(row.displayToJson),
            status: row.status,
            error: row.error,
            threadId: row.threadId,
          });
        }
      }
    }
    return out.sort((a, b) => (a.sendAt < b.sendAt ? 1 : -1)).slice(0, 50);
  },
});
