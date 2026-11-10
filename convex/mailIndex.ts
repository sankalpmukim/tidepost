import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import { assertSecret, BODY_JSON_MAX, MAX_BODIES, MAX_MESSAGES, MAX_SEARCH_SCAN, MAX_THREADS, WIPE_BATCH } from "./lib";

const messageDoc = v.object({
  accountId: v.string(),
  messageId: v.string(),
  threadId: v.string(),
  fromName: v.string(),
  fromEmail: v.string(),
  toJson: v.string(),
  ccJson: v.string(),
  bccJson: v.string(),
  replyToJson: v.string(),
  subject: v.string(),
  snippet: v.string(),
  dateMs: v.number(),
  unread: v.boolean(),
  starred: v.boolean(),
  folders: v.string(),
  hasAtt: v.boolean(),
  msgidHdr: v.union(v.string(), v.null()),
  inReplyTo: v.union(v.string(), v.null()),
  refs: v.union(v.string(), v.null()),
  bulkJson: v.string(),
  category: v.union(v.string(), v.null()),
  importance: v.string(),
  size: v.number(),
  searchText: v.string(),
});

const threadDoc = v.object({
  accountId: v.string(),
  threadId: v.string(),
  subject: v.string(),
  snippet: v.string(),
  participants: v.string(),
  lastFromName: v.string(),
  lastFromEmail: v.string(),
  lastFromMe: v.boolean(),
  lastDateMs: v.number(),
  firstDateMs: v.number(),
  messageCount: v.number(),
  unreadCount: v.number(),
  starred: v.boolean(),
  hasAtt: v.boolean(),
  folders: v.string(),
  inInbox: v.boolean(),
  toMeDirect: v.boolean(),
  isBulk: v.boolean(),
  audience: v.number(),
});

const threadStateDoc = v.object({
  accountId: v.string(),
  threadId: v.string(),
  pinned: v.number(),
  snoozedUntil: v.union(v.number(), v.null()),
  remindAt: v.union(v.number(), v.null()),
  remindSetAt: v.union(v.number(), v.null()),
  nudged: v.number(),
  waitingDismissedAt: v.union(v.number(), v.null()),
  brief: v.union(v.string(), v.null()),
});

const prevRef = v.object({ messageId: v.string(), threadId: v.string() });

export const putMessages = mutation({
  args: { secret: v.string(), messages: v.array(messageDoc) },
  returns: v.array(prevRef),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const prev: { messageId: string; threadId: string }[] = [];
    for (const m of args.messages.slice(0, 40)) {
      const existing = await ctx.db
        .query("messages")
        .withIndex("by_accountId_and_messageId", (q) => q.eq("accountId", m.accountId).eq("messageId", m.messageId))
        .unique();
      if (existing) {
        prev.push({ messageId: existing.messageId, threadId: existing.threadId });
        const searchText = m.searchText || existing.searchText;
        await ctx.db.replace(existing._id, { ...m, searchText, hasAtt: existing.hasAtt || m.hasAtt });
      } else {
        await ctx.db.insert("messages", m);
      }
    }
    return prev;
  },
});

export const deleteMessages = mutation({
  args: { secret: v.string(), accountId: v.string(), ids: v.array(v.string()) },
  returns: v.array(prevRef),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const prev: { messageId: string; threadId: string }[] = [];
    for (const id of args.ids.slice(0, 80)) {
      const existing = await ctx.db
        .query("messages")
        .withIndex("by_accountId_and_messageId", (q) => q.eq("accountId", args.accountId).eq("messageId", id))
        .unique();
      if (!existing) continue;
      prev.push({ messageId: existing.messageId, threadId: existing.threadId });
      await ctx.db.delete(existing._id);
      const body = await ctx.db
        .query("bodies")
        .withIndex("by_accountId_and_messageId", (q) => q.eq("accountId", args.accountId).eq("messageId", id))
        .unique();
      if (body) await ctx.db.delete(body._id);
    }
    return prev;
  },
});

export const getMessage = query({
  args: { secret: v.string(), accountId: v.string(), messageId: v.string() },
  returns: v.union(messageDoc, v.null()),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = await ctx.db
      .query("messages")
      .withIndex("by_accountId_and_messageId", (q) => q.eq("accountId", args.accountId).eq("messageId", args.messageId))
      .unique();
    if (!row) return null;
    const { _id: _a, _creationTime: _b, ...rest } = row;
    return rest;
  },
});

export const messagesForThread = query({
  args: { secret: v.string(), accountId: v.string(), threadId: v.string() },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_accountId_and_threadId", (q) => q.eq("accountId", args.accountId).eq("threadId", args.threadId))
      .take(200);
    return rows
      .sort((a, b) => a.dateMs - b.dateMs)
      .map(({ _id, _creationTime, ...rest }) => rest);
  },
});

export const listRecentMessages = query({
  args: { secret: v.string(), accountId: v.string(), limit: v.number() },
  returns: v.array(messageDoc),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const limit = Math.min(MAX_SEARCH_SCAN, Math.max(1, args.limit));
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_accountId_and_dateMs", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .take(limit);
    return rows.map(({ _id, _creationTime, ...rest }) => rest);
  },
});

export const putThreads = mutation({
  args: { secret: v.string(), threads: v.array(threadDoc) },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    for (const t of args.threads.slice(0, 40)) {
      const existing = await ctx.db
        .query("threads")
        .withIndex("by_accountId_and_threadId", (q) => q.eq("accountId", t.accountId).eq("threadId", t.threadId))
        .unique();
      if (existing) await ctx.db.replace(existing._id, t);
      else await ctx.db.insert("threads", t);
    }
    return null;
  },
});

export const deleteThread = mutation({
  args: { secret: v.string(), accountId: v.string(), threadId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const existing = await ctx.db
      .query("threads")
      .withIndex("by_accountId_and_threadId", (q) => q.eq("accountId", args.accountId).eq("threadId", args.threadId))
      .unique();
    if (existing) await ctx.db.delete(existing._id);
    return null;
  },
});

export const getThread = query({
  args: { secret: v.string(), accountId: v.string(), threadId: v.string() },
  returns: v.union(threadDoc, v.null()),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = await ctx.db
      .query("threads")
      .withIndex("by_accountId_and_threadId", (q) => q.eq("accountId", args.accountId).eq("threadId", args.threadId))
      .unique();
    if (!row) return null;
    const { _id, _creationTime, ...rest } = row;
    return rest;
  },
});

export const listThreads = query({
  args: { secret: v.string(), accountId: v.string() },
  returns: v.array(threadDoc),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const rows = await ctx.db
      .query("threads")
      .withIndex("by_accountId_and_lastDateMs", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .take(MAX_THREADS);
    return rows.map(({ _id, _creationTime, ...rest }) => rest);
  },
});

export const getThreadState = query({
  args: { secret: v.string(), accountId: v.string(), threadId: v.string() },
  returns: v.union(threadStateDoc, v.null()),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = await ctx.db
      .query("threadStates")
      .withIndex("by_accountId_and_threadId", (q) => q.eq("accountId", args.accountId).eq("threadId", args.threadId))
      .unique();
    if (!row) return null;
    const { _id, _creationTime, ...rest } = row;
    return rest;
  },
});

export const listThreadStates = query({
  args: { secret: v.string(), accountId: v.string() },
  returns: v.array(threadStateDoc),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const rows = await ctx.db
      .query("threadStates")
      .withIndex("by_accountId_and_threadId", (q) => q.eq("accountId", args.accountId))
      .take(MAX_THREADS);
    return rows.map(({ _id, _creationTime, ...rest }) => rest);
  },
});

export const patchThreadState = mutation({
  args: {
    secret: v.string(),
    accountId: v.string(),
    threadId: v.string(),
    patch: v.object({
      pinned: v.optional(v.number()),
      snoozedUntil: v.optional(v.union(v.number(), v.null())),
      remindAt: v.optional(v.union(v.number(), v.null())),
      remindSetAt: v.optional(v.union(v.number(), v.null())),
      nudged: v.optional(v.number()),
      waitingDismissedAt: v.optional(v.union(v.number(), v.null())),
      brief: v.optional(v.union(v.string(), v.null())),
    }),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const existing = await ctx.db
      .query("threadStates")
      .withIndex("by_accountId_and_threadId", (q) => q.eq("accountId", args.accountId).eq("threadId", args.threadId))
      .unique();
    const base = existing ?? {
      accountId: args.accountId,
      threadId: args.threadId,
      pinned: 0,
      snoozedUntil: null,
      remindAt: null,
      remindSetAt: null,
      nudged: 0,
      waitingDismissedAt: null,
      brief: null,
    };
    const next = { ...base, ...args.patch };
    if (existing) await ctx.db.replace(existing._id, next);
    else await ctx.db.insert("threadStates", next);
    return null;
  },
});

export const dueThreadStates = query({
  args: { secret: v.string(), now: v.number() },
  returns: v.array(threadStateDoc),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const snoozed = await ctx.db
      .query("threadStates")
      .withIndex("by_snoozedUntil", (q) => q.gt("snoozedUntil", 0).lte("snoozedUntil", args.now))
      .take(40);
    const reminded = await ctx.db
      .query("threadStates")
      .withIndex("by_remindAt", (q) => q.gt("remindAt", 0).lte("remindAt", args.now))
      .take(40);
    const seen = new Set<string>();
    const out = [];
    for (const row of [...snoozed, ...reminded]) {
      const key = `${row.accountId}:${row.threadId}`;
      if (seen.has(key)) continue;
      seen.add(key);
      const { _id, _creationTime, ...rest } = row;
      out.push(rest);
    }
    return out;
  },
});

export const getBody = query({
  args: { secret: v.string(), accountId: v.string(), messageId: v.string() },
  returns: v.union(v.string(), v.null()),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = await ctx.db
      .query("bodies")
      .withIndex("by_accountId_and_messageId", (q) => q.eq("accountId", args.accountId).eq("messageId", args.messageId))
      .unique();
    return row?.json ?? null;
  },
});

export const putBody = mutation({
  args: { secret: v.string(), accountId: v.string(), messageId: v.string(), json: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const json = args.json.length > BODY_JSON_MAX ? args.json.slice(0, BODY_JSON_MAX) : args.json;
    const existing = await ctx.db
      .query("bodies")
      .withIndex("by_accountId_and_messageId", (q) => q.eq("accountId", args.accountId).eq("messageId", args.messageId))
      .unique();
    const now = Date.now();
    if (existing) await ctx.db.patch(existing._id, { json, accessedAt: now });
    else await ctx.db.insert("bodies", { accountId: args.accountId, messageId: args.messageId, json, accessedAt: now });
    const all = await ctx.db
      .query("bodies")
      .withIndex("by_accountId_and_accessedAt", (q) => q.eq("accountId", args.accountId))
      .take(MAX_BODIES + 8);
    if (all.length > MAX_BODIES) {
      const oldest = [...all].sort((a, b) => a.accessedAt - b.accessedAt).slice(0, all.length - MAX_BODIES);
      for (const row of oldest) await ctx.db.delete(row._id);
    }
    return null;
  },
});

export const touchSearchText = mutation({
  args: { secret: v.string(), accountId: v.string(), messageId: v.string(), searchText: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = await ctx.db
      .query("messages")
      .withIndex("by_accountId_and_messageId", (q) => q.eq("accountId", args.accountId).eq("messageId", args.messageId))
      .unique();
    if (row) await ctx.db.patch(row._id, { searchText: args.searchText.slice(0, 8000) });
    return null;
  },
});

export const wipeIndex = mutation({
  args: { secret: v.string(), accountId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    await ctx.scheduler.runAfter(0, internal.mailIndex.wipeIndexPage, { accountId: args.accountId });
    return null;
  },
});

export const wipeIndexPage = internalMutation({
  args: { accountId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    let more = false;
    const messages = await ctx.db.query("messages").withIndex("by_accountId_and_dateMs", (q) => q.eq("accountId", args.accountId)).take(WIPE_BATCH);
    for (const row of messages) await ctx.db.delete(row._id);
    more = more || messages.length === WIPE_BATCH;
    const threads = await ctx.db.query("threads").withIndex("by_accountId_and_lastDateMs", (q) => q.eq("accountId", args.accountId)).take(WIPE_BATCH);
    for (const row of threads) await ctx.db.delete(row._id);
    more = more || threads.length === WIPE_BATCH;
    const bodies = await ctx.db.query("bodies").withIndex("by_accountId_and_accessedAt", (q) => q.eq("accountId", args.accountId)).take(WIPE_BATCH);
    for (const row of bodies) await ctx.db.delete(row._id);
    more = more || bodies.length === WIPE_BATCH;
    const states = await ctx.db.query("threadStates").withIndex("by_accountId_and_threadId", (q) => q.eq("accountId", args.accountId)).take(WIPE_BATCH);
    for (const row of states) await ctx.db.delete(row._id);
    more = more || states.length === WIPE_BATCH;
    if (more) await ctx.scheduler.runAfter(0, internal.mailIndex.wipeIndexPage, { accountId: args.accountId });
    return null;
  },
});

export const removeAccount = mutation({
  args: { secret: v.string(), accountId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    await ctx.scheduler.runAfter(0, internal.mailIndex.wipeIndexPage, { accountId: args.accountId });
    const account = await ctx.db.query("accounts").withIndex("by_accountId", (q) => q.eq("accountId", args.accountId)).unique();
    if (account) await ctx.db.delete(account._id);
    return null;
  },
});

export const pruneOldestMessages = mutation({
  args: { secret: v.string(), accountId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const rows = await ctx.db
      .query("messages")
      .withIndex("by_accountId_and_dateMs", (q) => q.eq("accountId", args.accountId))
      .order("desc")
      .take(MAX_MESSAGES + 40);
    for (const row of rows.slice(MAX_MESSAGES)) await ctx.db.delete(row._id);
    return null;
  },
});
