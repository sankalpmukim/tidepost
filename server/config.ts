// Runtime configuration, derived from the Worker environment.
// `initConfig(env)` is called once per runtime context (Worker fetch
// handler, each Durable Object, tests) — within one context the bindings
// are constant, so the config is cached per module instance.

export interface Env {
  // Bindings (optional so tests can construct plain-string environments;
  // the worker entry point always provides them).
  DB?: D1Database;
  MAILBOX?: DurableObjectNamespace;
  HUB?: DurableObjectNamespace;
  // Vars / secrets
  APP_URL?: string;
  TIDEPOST_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  MICROSOFT_TENANT?: string;
  ANTHROPIC_API_KEY?: string;
  TIDEPOST_AI_MODEL?: string;
  TIDEPOST_SYNC_MESSAGES?: string;
  TIDEPOST_POLL_SECONDS?: string;
  TIDEPOST_DEMO?: string;
  [key: string]: unknown;
}

export interface Config {
  /** Public URL the browser uses. OAuth redirect URIs are built from it. */
  appUrl: string;
  /** Secret for encrypting OAuth tokens at rest. */
  secret: string;
  production: boolean;

  google: { clientId: string; clientSecret: string };
  microsoft: { clientId: string; clientSecret: string; tenant: string };
  ai: { apiKey: string; model: string };
  /** Allow the built-in demo mailbox (on by default; set to 0 to hide it). */
  demo: boolean;
  /** How many recent messages to index per account on first sync. */
  initialSyncMessages: number;
  pollSeconds: number;
}

function env(envish: Record<string, unknown>, name: string, fallback = ""): string {
  const v = envish[name];
  const s = typeof v === "string" ? v : "";
  return s === undefined || s === "" ? fallback : s;
}

export function configFrom(e: Env): Config {
  return {
    appUrl: env(e, "APP_URL", "http://localhost:5173").replace(/\/$/, ""),
    secret: env(e, "TIDEPOST_SECRET"),
    production: env(e, "APP_URL", "").startsWith("https://"),

    google: {
      clientId: env(e, "GOOGLE_CLIENT_ID"),
      clientSecret: env(e, "GOOGLE_CLIENT_SECRET"),
    },
    microsoft: {
      clientId: env(e, "MICROSOFT_CLIENT_ID"),
      clientSecret: env(e, "MICROSOFT_CLIENT_SECRET"),
      /** "common" allows work/school and personal Microsoft accounts. */
      tenant: env(e, "MICROSOFT_TENANT", "common"),
    },
    ai: {
      apiKey: env(e, "ANTHROPIC_API_KEY"),
      model: env(e, "TIDEPOST_AI_MODEL", "claude-opus-5-5"),
    },
    demo: env(e, "TIDEPOST_DEMO", "1") !== "0",
    /** How many recent messages to index per account on first sync. */
    initialSyncMessages: Number(env(e, "TIDEPOST_SYNC_MESSAGES", "800")) || 800,
    pollSeconds: Number(env(e, "TIDEPOST_POLL_SECONDS", "45")) || 45,
  };
}

let current: Config | null = null;

/** Cache the config for this runtime context (Worker isolate or DO instance). */
export function initConfig(e: Env): Config {
  if (!current) current = configFrom(e);
  return current;
}

/** The config for this runtime context; throws before initConfig ran. */
export function config(): Config {
  if (!current) throw new Error("config() used before initConfig(env)");
  return current;
}

/** Test helper: clear the cached config so a new environment applies. */
export function resetConfigForTest(): void {
  current = null;
}

export function redirectUri(cfg: Config, provider: "google" | "microsoft"): string {
  return `${cfg.appUrl}/api/auth/${provider}/callback`;
}
