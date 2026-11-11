// In-process test harness: the real Hono app wired to memory persistence
// and real MailboxEngines (no Durable Objects needed). Mirrors the
// production wiring in worker/index.ts.
import { createApp } from "../server/app";
import { config, initConfig, resetConfigForTest } from "../server/config";
import { createMemoryAuth, createMemoryMailbox } from "../server/persistMemory";
import { LocalHubClient, LocalMailboxes } from "../server/mailbox/client";
import { MailboxEngine } from "../server/mailbox/engine";
import { createUser, providerFor, upsertAccount } from "../server/accounts";

export function initTestConfig(values: Record<string, string> = {}): void {
  resetConfigForTest();
  initConfig({
    APP_URL: "http://localhost:5173",
    TIDEPOST_SECRET: "test-secret",
    GOOGLE_CLIENT_ID: "cid.apps.googleusercontent.com",
    GOOGLE_CLIENT_SECRET: "csecret",
    TIDEPOST_POLL_SECONDS: "3600",
    ...values,
  });
}

export function createHarness() {
  const auth = createMemoryAuth();
  const mailPersist = createMemoryMailbox();
  const hubs = new Map<string, LocalHubClient>();
  const hubFor = (userId: string) => {
    let h = hubs.get(userId);
    if (!h) hubs.set(userId, (h = new LocalHubClient()));
    return h;
  };
  const mailboxes = new LocalMailboxes(() => mailPersist, auth, config(), hubFor);
  const app = createApp({
    config: config(),
    auth,
    mailbox: (id) => mailboxes.mailbox(id),
    hub: hubFor,
    providerFor: (account) => providerFor(auth, config(), account),
  });
  return { app, auth, mailPersist, mailboxes, hubFor };
}

/** A quiet engine: no scheduled ticks, for pure store tests. */
export function quietEngine(h: ReturnType<typeof createHarness>, accountId: string): MailboxEngine {
  const engine = new MailboxEngine({
    accountId,
    persist: h.mailPersist,
    auth: h.auth,
    config: config(),
    emit: () => {},
    host: { schedule: () => {} },
  });
  return engine;
}

export async function createDemoAccount(h: ReturnType<typeof createHarness>, email: string) {
  const user = await createUser(h.auth);
  const account = await upsertAccount(h.auth, user, "demo", email, email.split("@")[0], null);
  return { user, account };
}
