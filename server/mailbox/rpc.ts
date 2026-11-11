// Envelope for Durable Object RPC: workerd preserves an error's message but
// not its class across the boundary, so mailbox methods return a plain
// result envelope and the caller rethrows the proper typed error. The same
// envelope is used by the in-process adapter in tests, so the HTTP layer is
// identical against both.
import { AuthExpiredError, RateLimitedError } from "../providers/types";

/** Thrown by HTTP handlers; carried across RPC by name. */
export class HttpError extends Error {
  constructor(public status: 400 | 403 | 404 | 409, message: string) {
    super(message);
    this.name = "HttpError";
  }
}

export type RpcResult<T> = { ok: true; value: T } | { ok: false; name: string; message: string; status?: number };

export async function guard<T>(fn: () => Promise<T>): Promise<RpcResult<T>> {
  try {
    return { ok: true, value: await fn() };
  } catch (e) {
    const err = e instanceof Error ? e : new Error(String(e));
    return {
      ok: false,
      name: err.name,
      message: err.message,
      ...(e instanceof HttpError ? { status: e.status } : {}),
    };
  }
}

export function unwrap<T>(r: RpcResult<T>): T {
  if (r.ok) return r.value;
  switch (r.name) {
    case "AuthExpiredError":
      throw new AuthExpiredError(r.message);
    case "RateLimitedError":
      throw new RateLimitedError();
    case "HttpError":
      throw new HttpError((r.status as 400 | 403 | 404 | 409) ?? 400, r.message);
    default:
      throw new Error(r.message);
  }
}
