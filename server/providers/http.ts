// Fetch wrapper for provider REST APIs: bearer auth, one refresh on 401,
// exponential backoff on 429/5xx (honours Retry-After).
import { AuthExpiredError, RateLimitedError, type TokenSource } from "./types";

export interface ApiRequest {
  method?: string;
  headers?: Record<string, string>;
  /** JSON-serialised when an object; sent as-is when a string/Buffer. */
  body?: unknown;
  /** Return the raw Response instead of parsed JSON. */
  raw?: boolean;
  signal?: AbortSignal;
  maxRetries?: number;
}

export class ApiError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string, url: string) {
    super(describeHttpError(status, body, url));
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

function googleErrorInfo(body: string): { message: string; reasons: string } | null {
  try {
    const err = JSON.parse(body).error;
    if (!err || typeof err !== "object") return null;
    const listed = Array.isArray(err.errors) ? err.errors.map((e: { reason?: string }) => e.reason) : [];
    const reasons = [err.status, ...listed].filter(Boolean).join(" ");
    return { message: typeof err.message === "string" ? err.message : "", reasons };
  } catch {
    return null;
  }
}

/** 429, and Gmail's 403 quota / per-user rate-limit responses. */
export function isQuotaOrRateLimit(status: number, body: string): boolean {
  if (status === 429) return true;
  if (status !== 403) return false;
  const info = googleErrorInfo(body);
  return /rateLimitExceeded|userRateLimitExceeded|quotaExceeded|dailyLimitExceeded|RESOURCE_EXHAUSTED|Quota exceeded/i.test(
    `${info?.message ?? ""} ${info?.reasons ?? ""} ${body}`,
  );
}

function providerLabel(url: string): string {
  const host = new URL(url).host;
  if (host.includes("gmail")) return "Gmail";
  if (host.includes("microsoft") || host.includes("graph.microsoft")) return "Outlook";
  return "The mail provider";
}

function describeHttpError(status: number, body: string, url: string): string {
  if (isQuotaOrRateLimit(status, body)) {
    return `${providerLabel(url)} asked us to slow down. Wait a minute, then retry.`;
  }
  const info = googleErrorInfo(body);
  if (info?.message && info.message.length <= 180) return info.message;
  return `Request to ${new URL(url).host} failed (HTTP ${status}).`;
}

function rateLimitWaitMs(status: number, body: string, res: Response, attempt: number): number {
  const wait = retryAfterMs(res, attempt);
  // Gmail "Units per minute per user" needs a full minute, not the default exponential backoff.
  if (status === 403 && /per minute|Total Query Cost/i.test(body)) return Math.max(wait, 60_000);
  return wait;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function retryAfterMs(res: Response, attempt: number): number {
  const h = res.headers.get("retry-after");
  if (h) {
    const secs = Number(h);
    if (!Number.isNaN(secs)) return Math.min(secs * 1000, 60_000);
    const when = Date.parse(h);
    if (!Number.isNaN(when)) return Math.max(0, Math.min(when - Date.now(), 60_000));
  }
  return Math.min(1000 * 2 ** attempt + Math.random() * 250, 30_000);
}

export async function apiFetch<T = unknown>(tokens: TokenSource, url: string, req: ApiRequest = {}): Promise<T> {
  const maxRetries = req.maxRetries ?? 5;
  let refreshed = false;
  for (let attempt = 0; ; attempt++) {
    const token = await tokens.getAccessToken();
    const headers: Record<string, string> = { Authorization: `Bearer ${token}`, ...req.headers };
    let body: BodyInit | undefined;
    if (req.body !== undefined) {
      if (typeof req.body === "string" || req.body instanceof Uint8Array) {
        body = req.body as BodyInit;
      } else {
        body = JSON.stringify(req.body);
        headers["Content-Type"] = headers["Content-Type"] ?? "application/json";
      }
    }
    let res: Response;
    try {
      res = await fetch(url, { method: req.method ?? "GET", headers, body, signal: req.signal });
    } catch (err) {
      if (req.signal?.aborted || attempt >= maxRetries) throw err;
      await sleep(Math.min(1000 * 2 ** attempt, 15_000));
      continue;
    }
    if (res.status === 401 && !refreshed) {
      refreshed = true;
      try {
        await tokens.refresh();
      } catch {
        throw new AuthExpiredError();
      }
      continue;
    }
    if (res.status === 401) throw new AuthExpiredError();
    if (res.status === 429 || res.status === 503 || res.status === 502 || res.status === 500 || res.status === 504) {
      const wait = retryAfterMs(res, attempt);
      if (attempt >= maxRetries) {
        if (res.status === 429) throw new RateLimitedError(wait);
        throw new ApiError(res.status, await res.text(), url);
      }
      await sleep(wait);
      continue;
    }
    if (res.status === 403) {
      const text = await res.text();
      if (isQuotaOrRateLimit(403, text)) {
        const wait = rateLimitWaitMs(403, text, res, attempt);
        if (attempt < maxRetries) {
          await sleep(wait);
          continue;
        }
        throw new RateLimitedError(wait);
      }
      throw new ApiError(res.status, text, url);
    }
    if (!res.ok) throw new ApiError(res.status, await res.text(), url);
    if (req.raw) return res as unknown as T;
    if (res.status === 204 || res.status === 202) return undefined as T;
    const text = await res.text();
    return (text ? JSON.parse(text) : undefined) as T;
  }
}

/** Run async work over items with bounded concurrency, preserving order. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T, index: number) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i], i);
    }
  });
  await Promise.all(workers);
  return out;
}
