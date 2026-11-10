import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { assertSecret } from "./lib";

const provider = v.union(v.literal("gmail"), v.literal("outlook"), v.literal("demo"));

const userDoc = v.object({
  appId: v.string(),
  createdAt: v.number(),
  settings: v.string(),
});

const sessionDoc = v.object({
  sessionId: v.string(),
  userId: v.string(),
  createdAt: v.number(),
  expiresAt: v.number(),
});

const accountDoc = v.object({
  accountId: v.string(),
  userId: v.string(),
  provider,
  email: v.string(),
  name: v.string(),
  tokens: v.union(v.string(), v.null()),
  cursor: v.union(v.string(), v.null()),
  sync: v.string(),
  createdAt: v.number(),
});

export const putUser = mutation({
  args: { secret: v.string(), appId: v.string(), createdAt: v.number(), settings: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const existing = await ctx.db.query("users").withIndex("by_appId", (q) => q.eq("appId", args.appId)).unique();
    if (existing) await ctx.db.patch(existing._id, { settings: args.settings });
    else await ctx.db.insert("users", { appId: args.appId, createdAt: args.createdAt, settings: args.settings });
    return null;
  },
});

export const getUser = query({
  args: { secret: v.string(), appId: v.string() },
  returns: v.union(userDoc, v.null()),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = await ctx.db.query("users").withIndex("by_appId", (q) => q.eq("appId", args.appId)).unique();
    return row ? { appId: row.appId, createdAt: row.createdAt, settings: row.settings } : null;
  },
});

export const updateUserSettings = mutation({
  args: { secret: v.string(), appId: v.string(), settings: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = await ctx.db.query("users").withIndex("by_appId", (q) => q.eq("appId", args.appId)).unique();
    if (row) await ctx.db.patch(row._id, { settings: args.settings });
    return null;
  },
});

export const putSession = mutation({
  args: { secret: v.string(), sessionId: v.string(), userId: v.string(), createdAt: v.number(), expiresAt: v.number() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    await ctx.db.insert("sessions", {
      sessionId: args.sessionId,
      userId: args.userId,
      createdAt: args.createdAt,
      expiresAt: args.expiresAt,
    });
    return null;
  },
});

export const getSession = query({
  args: { secret: v.string(), sessionId: v.string() },
  returns: v.union(sessionDoc, v.null()),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = await ctx.db.query("sessions").withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId)).unique();
    return row ? { sessionId: row.sessionId, userId: row.userId, createdAt: row.createdAt, expiresAt: row.expiresAt } : null;
  },
});

export const deleteSession = mutation({
  args: { secret: v.string(), sessionId: v.string() },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = await ctx.db.query("sessions").withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId)).unique();
    if (row) await ctx.db.delete(row._id);
    return null;
  },
});

export const putAccount = mutation({
  args: { secret: v.string(), account: accountDoc },
  returns: v.null(),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const existing = await ctx.db
      .query("accounts")
      .withIndex("by_accountId", (q) => q.eq("accountId", args.account.accountId))
      .unique();
    if (existing) {
      await ctx.db.patch(existing._id, args.account);
    } else {
      await ctx.db.insert("accounts", args.account);
    }
    return null;
  },
});

export const getAccount = query({
  args: { secret: v.string(), accountId: v.string() },
  returns: v.union(accountDoc, v.null()),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = await ctx.db.query("accounts").withIndex("by_accountId", (q) => q.eq("accountId", args.accountId)).unique();
    if (!row) return null;
    const { accountId, userId, provider: p, email, name, tokens, cursor, sync, createdAt } = row;
    return { accountId, userId, provider: p, email, name, tokens, cursor, sync, createdAt };
  },
});

export const listAccountsByUser = query({
  args: { secret: v.string(), userId: v.string() },
  returns: v.array(accountDoc),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const rows = await ctx.db.query("accounts").withIndex("by_userId", (q) => q.eq("userId", args.userId)).take(20);
    return rows
      .sort((a, b) => a.createdAt - b.createdAt)
      .map(({ accountId, userId, provider: p, email, name, tokens, cursor, sync, createdAt }) => ({
        accountId, userId, provider: p, email, name, tokens, cursor, sync, createdAt,
      }));
  },
});

export const findAccountByIdentity = query({
  args: { secret: v.string(), provider, email: v.string() },
  returns: v.union(accountDoc, v.null()),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = await ctx.db
      .query("accounts")
      .withIndex("by_provider_and_email", (q) => q.eq("provider", args.provider).eq("email", args.email))
      .take(1);
    const found = row[0];
    if (!found) return null;
    const { accountId, userId, provider: p, email, name, tokens, cursor, sync, createdAt } = found;
    return { accountId, userId, provider: p, email, name, tokens, cursor, sync, createdAt };
  },
});

export const findAccountByUserIdentity = query({
  args: { secret: v.string(), userId: v.string(), provider, email: v.string() },
  returns: v.union(accountDoc, v.null()),
  handler: async (ctx, args) => {
    assertSecret(args.secret);
    const row = await ctx.db
      .query("accounts")
      .withIndex("by_userId_and_provider_and_email", (q) =>
        q.eq("userId", args.userId).eq("provider", args.provider).eq("email", args.email),
      )
      .unique();
    if (!row) return null;
    const { accountId, userId, provider: p, email, name, tokens, cursor, sync, createdAt } = row;
    return { accountId, userId, provider: p, email, name, tokens, cursor, sync, createdAt };
  },
});
