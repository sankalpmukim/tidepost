import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { WIPE_BATCH } from "./lib";

export const purgeExpiredSessions = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const now = Date.now();
    const rows = await ctx.db.query("sessions").withIndex("by_expiresAt", (q) => q.lte("expiresAt", now)).take(WIPE_BATCH);
    for (const row of rows) await ctx.db.delete(row._id);
    if (rows.length === WIPE_BATCH) {
      await ctx.scheduler.runAfter(0, internal.maintenance.purgeExpiredSessions, {});
    }
    return null;
  },
});

export const purgeOldQueue = internalMutation({
  args: {},
  returns: v.null(),
  handler: async (ctx) => {
    const cutoff = Date.now() - 24 * 3600_000;
    for (const status of ["sent", "cancelled"] as const) {
      const rows = await ctx.db
        .query("sendQueue")
        .withIndex("by_status_and_sendAt", (q) => q.eq("status", status).lt("sendAt", cutoff))
        .take(WIPE_BATCH);
      for (const row of rows) await ctx.db.delete(row._id);
    }
    return null;
  },
});
