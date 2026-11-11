// HTTP API. Same routes and payloads as the Node/Vercel version; the
// mailbox work now runs inside the Mailbox Durable Objects (or in-process
// engines in tests) behind the MailboxClient/HubClient seams.
import crypto from "node:crypto";
import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Config } from "./config";
import { sign, unsign } from "./db";
import {
  createSession, createUser, deleteSession, findAccountByIdentity, getAccount, getUserSettings,
  listAccounts, removeAccount, sessionUser, setUserSettings, toAccount, upsertAccount, type AccountRow,
} from "./accounts";
import type { AuthPersist } from "./persist";
import type { MailboxClient, HubClient } from "./mailbox/client";
import { HttpError } from "./mailbox/rpc";
import { aiBrief, aiDraft, aiEnabled, aiPlan, describeAiError, heuristicBrief, heuristicPlan, templateDraft } from "./assistant";
import type { MailProvider } from "./providers/types";
import type { AppConfig, OutgoingMessage, Plan, Settings, SweepKind, ThreadAction, ThreadBrief } from "../shared/types";
import { AuthExpiredError } from "./providers/types";

type Env = { Variables: { userId: string; deps: AppDeps } };

const SESSION_COOKIE = "tp_session";
const OAUTH_COOKIE = "tp_oauth";

export interface AppDeps {
  config: Config;
  auth: AuthPersist;
  mailbox(accountId: string): MailboxClient;
  hub(userId: string): HubClient;
  /** Worker-side provider (attachment streaming only). */
  providerFor(account: AccountRow): Promise<MailProvider>;
}

export const DEFAULT_SETTINGS: Settings = {
  undoSendSeconds: 10,
  signature: "",
  density: "comfortable",
  loadRemoteImages: "ask",
  theme: "system",
  readingPane: "right",
  onboardedAt: 0,
};

export function createApp(deps: AppDeps) {
  const cfg = deps.config;
  const secure = cfg.appUrl.startsWith("https://");

  async function settingsFor(userId: string): Promise<Settings> {
    return { ...DEFAULT_SETTINGS, ...((await getUserSettings(deps.auth, userId)) as Partial<Settings>) };
  }

  const app = new Hono<Env>();

  app.onError((err, c) => {
    if (err instanceof AuthExpiredError) return c.json({ error: err.message, code: "auth" }, 401);
    console.error("[api]", err);
    return c.json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  });

  app.use("*", (c, next) => {
    c.set("deps", deps);
    return next();
  });

  app.get("/api/config", (c) =>
    c.json<AppConfig>({
      providers: {
        gmail: !!(cfg.google.clientId && cfg.google.clientSecret),
        outlook: !!(cfg.microsoft.clientId && cfg.microsoft.clientSecret),
        demo: cfg.demo,
      },
      ai: aiEnabled(),
      aiModel: aiEnabled() ? cfg.ai.model : null,
      undoSendSeconds: DEFAULT_SETTINGS.undoSendSeconds,
    }),
  );

  // ---------- auth ----------

  async function startSession(c: Context<Env>, userId: string): Promise<void> {
    const s = await createSession(deps.auth, userId);
    setCookie(c, SESSION_COOKIE, s.id, { httpOnly: true, sameSite: "Lax", secure, path: "/", maxAge: s.maxAge });
  }

  function pkce() {
    const verifier = crypto.randomBytes(32).toString("base64url");
    const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
    return { verifier, challenge };
  }

  interface OAuthCookie { state: string; verifier: string; provider: "google" | "microsoft"; exp: number }

  app.get("/api/auth/:provider/start", async (c) => {
    const provider = c.req.param("provider");
    if (provider !== "google" && provider !== "microsoft") return c.text("Unknown provider", 404);
    const state = crypto.randomBytes(16).toString("base64url");
    const { verifier, challenge } = pkce();
    const cookie: OAuthCookie = { state, verifier, provider, exp: Date.now() + 10 * 60_000 };
    setCookie(c, OAUTH_COOKIE, sign(Buffer.from(JSON.stringify(cookie)).toString("base64url")), { httpOnly: true, sameSite: "Lax", secure, path: "/api/auth", maxAge: 600 });
    const loginHint = c.req.query("login_hint") || undefined;
    try {
      if (provider === "google") {
        const { googleAuthUrl } = await import("./auth/google");
        return c.redirect(googleAuthUrl({ state, codeChallenge: challenge, loginHint }));
      }
      const { microsoftAuthUrl } = await import("./auth/microsoft");
      return c.redirect(microsoftAuthUrl({ state, codeChallenge: challenge, loginHint }));
    } catch (err) {
      return c.redirect(`/app?auth_error=${encodeURIComponent(err instanceof Error ? err.message : "Sign-in is not configured")}`);
    }
  });

  app.get("/api/auth/:provider/callback", async (c) => {
    const provider = c.req.param("provider");
    const fail = (msg: string) => c.redirect(`/app?auth_error=${encodeURIComponent(msg)}`);
    const raw = getCookie(c, OAUTH_COOKIE);
    deleteCookie(c, OAUTH_COOKIE, { path: "/api/auth" });
    const err = c.req.query("error");
    if (err) return fail(c.req.query("error_description") || (err === "access_denied" ? "Sign-in was cancelled." : err));
    const unsigned = raw ? unsign(raw) : null;
    if (!unsigned) return fail("Sign-in expired. Try again.");
    const cookie = JSON.parse(Buffer.from(unsigned, "base64url").toString("utf8")) as OAuthCookie;
    if (cookie.provider !== provider || cookie.exp < Date.now() || cookie.state !== c.req.query("state")) return fail("Sign-in could not be verified. Try again.");
    const code = c.req.query("code");
    if (!code) return fail("The provider did not return an authorization code.");
    try {
      let identity: { email: string; name: string };
      let tokens;
      let kind: "gmail" | "outlook";
      if (provider === "google") {
        const g = await import("./auth/google");
        tokens = await g.googleExchangeCode(code, cookie.verifier);
        if (!tokens.idToken) throw new Error("Google did not return an identity token.");
        identity = g.googleIdentityFromIdToken(tokens.idToken);
        if (!tokens.scope.includes("gmail.modify")) return fail("Tidepost needs permission to read and send Gmail. Sign in again and allow all requested access.");
        kind = "gmail";
      } else {
        const m = await import("./auth/microsoft");
        tokens = await m.microsoftExchangeCode(code, cookie.verifier);
        if (!tokens.idToken) throw new Error("Microsoft did not return an identity token.");
        identity = m.microsoftIdentityFromIdToken(tokens.idToken);
        // Work accounts: preferred_username can be the UPN; the mailbox address comes from Graph.
        try {
          const { OutlookProvider } = await import("./providers/outlook");
          const access = tokens.accessToken;
          const profile = await new OutlookProvider({ getAccessToken: async () => access, refresh: async () => access }).getProfile();
          if (profile.email) identity = { email: profile.email, name: profile.name || identity.name };
        } catch {
          /* fall back to the id_token identity */
        }
        kind = "outlook";
      }
      const email = identity.email.toLowerCase();
      // Signed in already: add this mailbox to the current user. Otherwise sign in
      // as the user that owns this mailbox, or create a new user.
      let userId = await sessionUser(deps.auth, getCookie(c, SESSION_COOKIE));
      if (!userId) userId = (await findAccountByIdentity(deps.auth, kind, email))?.user_id ?? await createUser(deps.auth);
      const account = await upsertAccount(deps.auth, userId, kind, email, identity.name || email, tokens);
      const mb = deps.mailbox(account.id);
      await mb.ensure(account);
      await startSession(c, userId);
      void mb.syncNow().catch(() => {});
      return c.redirect(`/app?account=${encodeURIComponent(account.id)}`);
    } catch (e) {
      console.error("[oauth]", e);
      return fail(e instanceof Error ? e.message : "Sign-in failed.");
    }
  });

  app.post("/api/auth/demo", async (c) => {
    if (!cfg.demo) return c.json({ error: "The demo mailbox is disabled on this server." }, 403);
    let userId = await sessionUser(deps.auth, getCookie(c, SESSION_COOKIE));
    if (!userId) userId = await createUser(deps.auth);
    const account = await upsertAccount(deps.auth, userId, "demo", "alex.morgan@northwind.example", "Alex Morgan", null);
    const mb = deps.mailbox(account.id);
    await mb.ensure(account);
    await startSession(c, userId);
    void mb.syncNow().catch(() => {});
    return c.json({ accountId: account.id });
  });

  app.post("/api/auth/logout", async (c) => {
    const sid = getCookie(c, SESSION_COOKIE);
    if (sid) await deleteSession(deps.auth, sid);
    deleteCookie(c, SESSION_COOKIE, { path: "/" });
    return c.json({ ok: true });
  });

  // ---------- authenticated API ----------

  const api = new Hono<Env>();

  api.use("*", async (c, next) => {
    const userId = await sessionUser(deps.auth, getCookie(c, SESSION_COOKIE));
    if (!userId) return c.json({ error: "Not signed in", code: "session" }, 401);
    // Mutations must carry a custom header: browsers won't send it cross-site without CORS.
    if (c.req.method !== "GET" && c.req.header("x-tidepost") !== "1") return c.json({ error: "Missing request header" }, 403);
    c.set("userId", userId);
    await next();
  });

  async function ownedAccount(c: Context<Env>): Promise<AccountRow> {
    const account = await getAccount(deps.auth, c.req.param("aid") ?? "");
    if (!account || account.user_id !== c.get("userId")) throw new HttpError(404, "Account not found");
    return account;
  }

  api.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
    if (err instanceof AuthExpiredError) return c.json({ error: err.message, code: "auth" }, 401);
    console.error("[api]", err);
    return c.json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
  });

  api.get("/me", async (c) => {
    const userId = c.get("userId");
    const accounts = await listAccounts(deps.auth, userId);
    // Ensuring each mailbox wakes its DO and starts polling — the equivalent
    // of the old startPolling on /api/me.
    await Promise.all(
      accounts.map(async (a) => {
        const mb = deps.mailbox(a.id);
        await mb.ensure(a).catch(() => {});
      }),
    );
    return c.json({ accounts: accounts.map(toAccount), settings: await settingsFor(userId) });
  });

  api.put("/settings", async (c) => {
    const userId = c.get("userId");
    const patch = (await c.req.json()) as Partial<Settings>;
    const next = { ...(await settingsFor(userId)), ...patch };
    next.undoSendSeconds = Math.max(0, Math.min(30, Number(next.undoSendSeconds) || 0));
    await setUserSettings(deps.auth, userId, next as unknown as Record<string, unknown>);
    return c.json(next);
  });

  api.delete("/accounts/:aid", async (c) => {
    const account = await ownedAccount(c);
    await deps.mailbox(account.id).destroy().catch(() => {});
    await removeAccount(deps.auth, account.id);
    return c.json({ ok: true });
  });

  api.post("/accounts/:aid/sync", async (c) => {
    const account = await ownedAccount(c);
    const mb = deps.mailbox(account.id);
    await mb.ensure(account).catch(() => {});
    await mb.syncNow();
    return c.json({ ok: true });
  });

  api.get("/accounts/:aid/folders", async (c) => {
    const account = await ownedAccount(c);
    return c.json(await deps.mailbox(account.id).folders());
  });

  api.get("/accounts/:aid/counts", async (c) => c.json(await deps.mailbox((await ownedAccount(c)).id).counts()));

  api.get("/accounts/:aid/threads", async (c) => {
    const account = await ownedAccount(c);
    const view = c.req.query("view") ?? "inbox";
    const offset = Math.max(0, Number(c.req.query("cursor") ?? 0) || 0);
    const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 100) || 100));
    return c.json(await deps.mailbox(account.id).threadsList(view, offset, limit));
  });

  api.get("/accounts/:aid/threads/:tid", async (c) => {
    const account = await ownedAccount(c);
    const thread = await deps.mailbox(account.id).getThread(c.req.param("tid"), c.req.query("refresh") !== "0");
    if (!thread) return c.json({ error: "Thread not found" }, 404);
    return c.json(thread);
  });

  api.post("/accounts/:aid/messages", async (c) => {
    const account = await ownedAccount(c);
    const { ids } = (await c.req.json()) as { ids: string[] };
    return c.json(await deps.mailbox(account.id).getMessages(ids));
  });

  api.get("/accounts/:aid/messages/:mid/attachments/:att", async (c) => {
    const account = await ownedAccount(c);
    const provider = await deps.providerFor(account);
    const a = await provider.getAttachment(c.req.param("mid"), c.req.param("att"));
    const inline = c.req.query("inline") === "1" && /^image\/(png|jpe?g|gif|webp)$/i.test(a.mimeType);
    const safeName = a.filename.replace(/[\r\n"]/g, "_");
    return new Response(new Uint8Array(a.data), {
      headers: {
        "Content-Type": inline ? a.mimeType : a.mimeType || "application/octet-stream",
        "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${safeName.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(a.filename)}`,
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy": "sandbox; default-src 'none'",
        "Cache-Control": "private, max-age=86400",
      },
    });
  });

  api.post("/accounts/:aid/actions", async (c) => {
    const account = await ownedAccount(c);
    const mb = deps.mailbox(account.id);
    const { threadIds, action } = (await c.req.json()) as { threadIds: string[]; action: ThreadAction };
    if (!Array.isArray(threadIds) || !threadIds.length) throw new HttpError(400, "No threads selected");
    if (threadIds.length > 40) {
      const label = { archive: "Archive", read: "Mark read", unread: "Mark unread", trash: "Move to trash", star: "Star", unstar: "Unstar", inbox: "Move to inbox", spam: "Report spam" }[action.type as string] ?? "Update";
      return c.json({ run: await mb.bulk(threadIds, action, `${label} ${threadIds.length} threads`) });
    }
    return c.json(await mb.action(threadIds, action));
  });

  api.get("/accounts/:aid/search", async (c) => {
    const account = await ownedAccount(c);
    const q = (c.req.query("q") ?? "").trim();
    if (!q) return c.json({ threads: [], nextCursor: null, total: 0 });
    if (c.req.query("local") === "1") {
      const threads = await deps.mailbox(account.id).localSearch(q);
      return c.json({ threads, nextCursor: null, total: threads.length });
    }
    const threads = await deps.mailbox(account.id).search(q);
    return c.json({ threads, nextCursor: null, total: threads.length });
  });

  api.get("/accounts/:aid/contacts", async (c) => {
    const account = await ownedAccount(c);
    return c.json(await deps.mailbox(account.id).contacts(c.req.query("q") ?? ""));
  });

  api.post("/accounts/:aid/send", async (c) => {
    const account = await ownedAccount(c);
    const msg = (await c.req.json()) as OutgoingMessage;
    const recipients = [...msg.to, ...msg.cc, ...msg.bcc];
    if (!recipients.length) throw new HttpError(400, "Add at least one recipient.");
    const bad = recipients.find((p) => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email));
    if (bad) throw new HttpError(400, `“${bad.email}” is not a valid email address.`);
    const size = msg.attachments.reduce((n, a) => n + a.data.length * 0.75, 0);
    if (size > 24 * 1024 * 1024) throw new HttpError(400, "Attachments are over 24 MB. Share large files as a link instead.");
    const settings = await settingsFor(c.get("userId"));
    const delay = c.req.query("now") === "1" ? 0 : settings.undoSendSeconds;
    return c.json(await deps.mailbox(account.id).enqueueSend(msg, delay));
  });

  api.get("/sends", async (c) => {
    const accounts = await listAccounts(deps.auth, c.get("userId"));
    const all = await Promise.all(accounts.map((a) => deps.mailbox(a.id).sends().catch(() => [])));
    return c.json(
      all
        .flat()
        .sort((a, b) => (a.sendAt < b.sendAt ? 1 : -1))
        .slice(0, 50),
    );
  });

  api.post("/accounts/:aid/sends/:sid/cancel", async (c) => {
    const account = await ownedAccount(c);
    const res = await deps.mailbox(account.id).cancelSend(c.req.param("sid"));
    if (!res.ok) throw new HttpError(409, "Too late: the message has already been sent.");
    return c.json(res);
  });

  api.post("/accounts/:aid/sends/:sid/retry", async (c) => {
    const account = await ownedAccount(c);
    const q = await deps.mailbox(account.id).retrySend(c.req.param("sid"));
    if (!q) throw new HttpError(404, "Nothing to retry.");
    return c.json(q);
  });

  api.post("/accounts/:aid/threads/:tid/unsubscribe", async (c) => {
    const account = await ownedAccount(c);
    return c.json(await deps.mailbox(account.id).unsubscribe(c.req.param("tid")));
  });

  // ---------- assistant ----------

  const me = (a: AccountRow) => ({ name: a.name, email: a.email });

  async function buildBrief(account: AccountRow, threadId: string, refresh: boolean): Promise<ThreadBrief> {
    const mb = deps.mailbox(account.id);
    const summary = await mb.summary(threadId);
    if (!summary) throw new HttpError(404, "Thread not found");
    const basis = `${summary.messageCount}:${summary.lastDate}`;
    const cached = await mb.getBriefCache(threadId);
    if (cached && !refresh) {
      const b = JSON.parse(cached) as ThreadBrief;
      if (b.basis === basis && (b.source === "ai" || !aiEnabled())) return b;
    }
    const messages = await mb.threadForAssistant(threadId);
    let core;
    if (aiEnabled()) {
      try {
        core = await aiBrief(summary, messages, me(account));
      } catch (err) {
        core = { ...heuristicBrief(summary, messages, me(account)), nextStep: `${describeAiError(err)} Showing a basic summary instead.` };
      }
    } else {
      core = heuristicBrief(summary, messages, me(account));
    }
    const brief: ThreadBrief = { ...core, threadId, basis, generatedAt: new Date().toISOString() };
    await mb.setBriefCache(threadId, JSON.stringify(brief));
    return brief;
  }

  api.get("/accounts/:aid/threads/:tid/brief", async (c) => {
    const account = await ownedAccount(c);
    const mb = deps.mailbox(account.id);
    const tid = c.req.param("tid");
    const cached = await mb.getBriefCache(tid);
    const summary = await mb.summary(tid);
    if (cached && summary) {
      const b = JSON.parse(cached) as ThreadBrief;
      if (b.basis === `${summary.messageCount}:${summary.lastDate}`) return c.json(b);
    }
    // Heuristic briefs are instant; AI briefs are generated on request (POST).
    if (!aiEnabled() || c.req.query("auto") === "1") return c.json(await buildBrief(account, tid, false));
    return c.json(null);
  });

  api.post("/accounts/:aid/threads/:tid/brief", async (c) => {
    const account = await ownedAccount(c);
    return c.json(await buildBrief(account, c.req.param("tid"), true));
  });

  api.post("/accounts/:aid/threads/:tid/draft", async (c) => {
    const account = await ownedAccount(c);
    const body = (await c.req.json()) as { notes: string; mode: string; recipients: string[]; subject: string };
    if (!aiEnabled()) return c.json(templateDraft({ me: me(account), notes: body.notes, recipients: body.recipients }));
    const messages = await deps.mailbox(account.id).threadForAssistant(c.req.param("tid"));
    try {
      return c.json(await aiDraft({ messages, me: me(account), notes: body.notes, mode: body.mode, recipients: body.recipients, subject: body.subject }));
    } catch (err) {
      return c.json({ error: describeAiError(err) }, 502);
    }
  });

  api.post("/accounts/:aid/draft", async (c) => {
    // Draft for a brand-new message (no thread).
    const account = await ownedAccount(c);
    const body = (await c.req.json()) as { notes: string; mode: string; recipients: string[]; subject: string };
    if (!aiEnabled()) return c.json(templateDraft({ me: me(account), notes: body.notes, recipients: body.recipients }));
    try {
      return c.json(await aiDraft({ messages: [], me: me(account), notes: body.notes, mode: "new", recipients: body.recipients, subject: body.subject }));
    } catch (err) {
      return c.json({ error: describeAiError(err) }, 502);
    }
  });

  api.post("/accounts/:aid/threads/:tid/plan", async (c) => {
    const account = await ownedAccount(c);
    const tid = c.req.param("tid");
    const mb = deps.mailbox(account.id);
    const { instruction } = ((await c.req.json().catch(() => ({}))) ?? {}) as { instruction?: string };
    const summary = await mb.summary(tid);
    if (!summary) throw new HttpError(404, "Thread not found");
    let plan: Omit<Plan, "threadId">;
    if (aiEnabled()) {
      try {
        const labels = (await mb.folders()).filter((f) => f.kind === "user").map((f) => f.name);
        plan = await aiPlan({ summary, messages: await mb.threadForAssistant(tid), me: me(account), labels, instruction: instruction ?? "" });
      } catch (err) {
        const brief = await buildBrief(account, tid, false);
        plan = { ...heuristicPlan(summary, brief), rationale: `${describeAiError(err)} Suggested a basic plan instead.` };
      }
    } else {
      plan = heuristicPlan(summary, await buildBrief(account, tid, false));
    }
    return c.json({ ...plan, threadId: tid });
  });

  api.post("/accounts/:aid/threads/:tid/plan/run", async (c) => {
    // Execute one approved, non-reply plan step.
    const account = await ownedAccount(c);
    const { kind, params } = (await c.req.json()) as { kind: string; params: Record<string, string> };
    return c.json(await deps.mailbox(account.id).runPlanStep(c.req.param("tid"), kind, params));
  });

  // ---------- runs ----------

  api.get("/runs", async (c) => c.json(await deps.hub(c.get("userId")).listRuns()));

  api.post("/accounts/:aid/sweeps", async (c) => {
    const account = await ownedAccount(c);
    const { kind } = (await c.req.json()) as { kind: SweepKind };
    return c.json(await deps.mailbox(account.id).sweep(kind));
  });

  api.post("/runs/:rid/:op", async (c) => {
    const hub = deps.hub(c.get("userId"));
    const run = await hub.getRun(c.req.param("rid"));
    if (!run) throw new HttpError(404, "Run not found");
    return c.json(await deps.mailbox(run.accountId).runOp(c.req.param("rid"), c.req.param("op")));
  });

  // ---------- live events ----------

  api.get("/events", (c) => deps.hub(c.get("userId")).sse());

  app.route("/api", api);

  return app;
}
