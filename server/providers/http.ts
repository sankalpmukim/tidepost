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
    super(`HTTP ${status} from ${new URL(url).host}: ${body.slice(0, 300)}`);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
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
    // Gmail signals per-user rate limits as 403 with reason rateLimitExceeded / userRateLimitExceeded.
    if (res.status === 403) {
      const text = await res.text();
      if (/rateLimitExceeded|userRateLimitExceeded/.test(text) && attempt < maxRetries) {
        await sleep(retryAfterMs(res, attempt));
        continue;
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
