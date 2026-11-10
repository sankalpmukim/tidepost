// Runtime configuration, read once from the environment (.env is loaded by the entry point).
import path from "node:path";

function env(name: string, fallback = ""): string {
  const v = process.env[name];
  return v === undefined || v === "" ? fallback : v;
}

const port = Number(env("PORT", "8787"));

export const config = {
  port,
  /** Public URL the browser uses. OAuth redirect URIs are built from it. */
  appUrl: env("APP_URL", "http://localhost:5173").replace(/\/$/, ""),
  dataDir: path.resolve(env("TIDEPOST_DATA_DIR", process.env.VERCEL ? "/tmp/tidepost" : ".data")),
  /** Secret for encrypting tokens at rest and authorizing Convex server calls. */
  secret: env("TIDEPOST_SECRET"),
  convexUrl: env("CONVEX_URL") || env("VITE_CONVEX_URL"),
  production: env("NODE_ENV") === "production",

  google: {
    clientId: env("GOOGLE_CLIENT_ID"),
    clientSecret: env("GOOGLE_CLIENT_SECRET"),
  },
  microsoft: {
    clientId: env("MICROSOFT_CLIENT_ID"),
    clientSecret: env("MICROSOFT_CLIENT_SECRET"),
    /** "common" allows work/school and personal Microsoft accounts. */
    tenant: env("MICROSOFT_TENANT", "common"),
  },
  ai: {
    apiKey: env("ANTHROPIC_API_KEY"),
    model: env("TIDEPOST_AI_MODEL", "claude-opus-5-5"),
  },
  /** Allow the built-in demo mailbox (on by default; set to 0 to hide it). */
  demo: env("TIDEPOST_DEMO", "1") !== "0",
  /** How many recent messages to index per account on first sync. Capped for Convex free-tier storage. */
  initialSyncMessages: Number(env("TIDEPOST_SYNC_MESSAGES", "800")),
  pollSeconds: Number(env("TIDEPOST_POLL_SECONDS", "45")),
};

export function redirectUri(provider: "google" | "microsoft"): string {
  return `${config.appUrl}/api/auth/${provider}/callback`;
}
