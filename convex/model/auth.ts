import type { QueryCtx, MutationCtx } from "../_generated/server";

type AuthCtx = QueryCtx | MutationCtx;

export async function requireIdentity(ctx: AuthCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (identity === null) throw new Error("Unauthorized");
  return identity;
}

export async function requireOwner<T extends { userId: string }>(ctx: AuthCtx, doc: T | null): Promise<T> {
  const identity = await requireIdentity(ctx);
  if (doc === null) throw new Error("Not found");
  if (doc.userId !== identity.subject) throw new Error("Forbidden");
  return doc;
}
