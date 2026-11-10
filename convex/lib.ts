declare const process: { env: Record<string, string | undefined> };

/** Shared secret for the Node mail server. These functions stay public so ConvexHttpClient can call them; they are not used from the browser. */
export function assertSecret(secret: string): void {
  const expected = process.env.TIDEPOST_SERVER_SECRET;
  if (!expected || secret !== expected) throw new Error("Unauthorized");
}

export const MAX_MESSAGES = 800;
export const MAX_THREADS = 600;
export const MAX_BODIES = 60;
export const MAX_SEARCH_SCAN = 400;
export const WIPE_BATCH = 32;
export const BODY_JSON_MAX = 40_000;
