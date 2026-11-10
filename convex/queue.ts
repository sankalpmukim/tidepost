import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertSecret } from "./lib";

const status = v.union(
  v.literal("queued"),
  v.literal("sending"),
  v.literal("sent"),
  v.literal("failed"),
  v.literal("cancelled"),
);

const queueDoc = v.object({
  queueId: v.string(),
  accountId: v.string(),
  payload: v.string(),
  sendAt: v.number(),
  status,
  error: v.union(v.string(), v.null()),
  threadId: v.union(v.string(), v.null()),
  createdAt: v.number(),
  displaySubject: v.optional(v.string()),
  displayToJson: v.optional(v.string()),
});

export const putQueue = mutation({
  args: { secret: v.string(), row: queueDoc },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const existing = await ctx.db.query("sendQueue").withIndex("by_queueId", (q) => q.eq("queueId", args.row.queueId)).unique();
    if (existing) await ctx.db.replace(existing._id, args.row);
    else await ctx.db.insert("sendQueue", args.row);
    return null;
  },
});

export const getQueue = query({
  args: { secret: v.string(), queueId: v.string() },
  returns: v.union(queueDoc, v.null()),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = await ctx.db.query("sendQueue").withIndex("by_queueId", (q) => q.eq("queueId", args.queueId)).unique();
    if (!row) return null;
    const { _id, _creationTime, ...rest } = row;
    return rest;
  },
});

export const updateQueue = mutation({
  args: {
    secret: v.string(),
    queueId: v.string(),
    expectedStatus: v.optional(status),
    status: v.optional(status),
    error: v.optional(v.union(v.string(), v.null())),
    threadId: v.optional(v.union(v.string(), v.null())),
    sendAt: v.optional(v.number()),
  },
  returns: v.boolean(),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = await ctx.db.query("sendQueue").withIndex("by_queueId", (q) => q.eq("queueId", args.queueId)).unique();
    if (!row) return false;
    if (args.expectedStatus && row.status !== args.expectedStatus) return false;
    await ctx.db.patch(row._id, {
      ...(args.status !== undefined ? { status: args.status } : {}),
      ...(args.error !== undefined ? { error: args.error } : {}),
      ...(args.threadId !== undefined ? { threadId: args.threadId } : {}),
      ...(args.sendAt !== undefined ? { sendAt: args.sendAt } : {}),
    });
    return true;
  },
});

export const dueQueue = query({
  args: { secret: v.string(), now: v.number() },
  returns: v.array(queueDoc),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const rows = await ctx.db
      .query("sendQueue")
      .withIndex("by_status_and_sendAt", (q) => q.eq("status", "queued").lte("sendAt", args.now))
      .take(20);
    return rows.map(({ _id, _creationTime, ...rest }) => rest);
  },
});

export const listQueueForAccounts = query({
  args: { secret: v.string(), accountIds: v.array(v.string()), since: v.number() },
  returns: v.array(queueDoc),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const out = [];
    for (const accountId of args.accountIds.slice(0, 8)) {
      const rows = await ctx.db
        .query("sendQueue")
        .withIndex("by_accountId_and_createdAt", (q) => q.eq("accountId", accountId))
        .order("desc")
        .take(20);
      for (const row of rows) {
        if (row.status === "queued" || row.status === "sending" || row.status === "failed" || row.createdAt > args.since) {
          const { _id, _creationTime, ...rest } = row;
          out.push(rest);
        }
      }
    }
    return out.sort((a, b) => b.createdAt - a.createdAt).slice(0, 50);
  },
});

export const requeueSending = mutation({
  args: { secret: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const rows = await ctx.db
      .query("sendQueue")
      .withIndex("by_status_and_sendAt", (q) => q.eq("status", "sending"))
      .take(40);
    for (const row of rows) await ctx.db.patch(row._id, { status: "queued" });
    return null;
  },
});
