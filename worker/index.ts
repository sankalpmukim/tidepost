// Worker entry: the Hono API, the two Durable Object classes and the cron
// trigger. Static assets (the built client in dist/) are served by the
// platform; /api/* always runs the Worker (see wrangler.jsonc).
import { initConfig, type Env } from "../server/config";
import { createApp, type AppDeps } from "../server/app";
import { createD1AuthStore } from "../server/authstore";
import { mailboxClient, hubClient } from "../server/mailbox/client";
import { providerFor } from "../server/accounts";
import { MailboxDO } from "../server/mailbox/do";
import { HubDO } from "../server/hub";

export { MailboxDO, HubDO };

let cachedDeps: AppDeps | null = null;
let cachedFor: Env | null = null;

function depsFor(env: Env): AppDeps {
  if (cachedDeps && cachedFor === env) return cachedDeps;
  const cfg = initConfig(env);
  const auth = createD1AuthStore(env.DB!);
  cachedDeps = {
    config: cfg,
    auth,
    mailbox: (accountId) => mailboxClient(env.MAILBOX!.get(env.MAILBOX!.idFromName(accountId))),
    hub: (userId) => hubClient(env.HUB!.get(env.HUB!.idFromName(userId))),
    providerFor: (account) => providerFor(auth, cfg, account),
  };
  cachedFor = env;
  return cachedDeps;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const app = createApp(depsFor(env));
    return app.fetch(request, env, undefined);
  },

  async scheduled(_event: ScheduledEvent, env: Env, ctx: ExecutionContext): Promise<void> {
    // The old Convex cron: purge expired sessions. Old send-queue rows are
    // purged by each Mailbox DO's own alarm.
    const auth = createD1AuthStore(env.DB!);
    ctx.waitUntil(auth.purgeExpiredSessions(Date.now()));
  },
};
