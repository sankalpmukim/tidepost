// HTTP API.
import crypto from "node:crypto";
import { Hono, type Context } from "hono";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import { streamSSE } from "hono/streaming";
import { config } from "./config";
import { sign, unsign } from "./db";
import {
  createSession, createUser, deleteSession, dropProvider, findAccountByIdentity, getAccount, getUserSettings,
  listAccounts, providerFor, removeAccount, sessionUser, setUserSettings, toAccount, upsertAccount, type AccountRow,
} from "./accounts";
import { contacts, getBrief, getThreadSummary, laneCounts, listThreads, localSearch, setThreadState, summariesFor } from "./store";
import { ingest, startPolling, stopPolling, syncNow } from "./sync";
import {
  applyAction, bulkAction, cancelSend, enqueueSend, getMessages, getThread, listSends, retrySend, startSweep, threadForAssistant, unsubscribe,
} from "./mail";
import { emit, getRunEntry, listRuns, subscribe, updateRun } from "./events";
import { aiBrief, aiDraft, aiEnabled, aiPlan, describeAiError, heuristicBrief, heuristicPlan, templateDraft } from "./assistant";
import type { AppConfig, OutgoingMessage, Plan, Settings, SweepKind, ThreadAction, ThreadBrief } from "../shared/types";
import { AuthExpiredError } from "./providers/types";

type Env = { Variables: { userId: string } };

const SESSION_COOKIE = "tp_session";
const OAUTH_COOKIE = "tp_oauth";
const secure = config.appUrl.startsWith("https://");

export const DEFAULT_SETTINGS: Settings = {
  undoSendSeconds: 10,
  signature: "",
  density: "comfortable",
  loadRemoteImages: "ask",
  theme: "system",
  readingPane: "right",
  onboardedAt: 0,
};

async function settingsFor(userId: string): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await getUserSettings(userId)) as Partial<Settings>) };
}

export const app = new Hono<Env>();

app.onError((err, c) => {
  if (err instanceof AuthExpiredError) return c.json({ error: err.message, code: "auth" }, 401);
  console.error("[api]", err);
  return c.json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
});

app.get("/api/config", (c) =>
  c.json<AppConfig>({
    providers: {
      gmail: !!(config.google.clientId && config.google.clientSecret),
      outlook: !!(config.microsoft.clientId && config.microsoft.clientSecret),
      demo: config.demo,
    },
    ai: aiEnabled(),
    aiModel: aiEnabled() ? config.ai.model : null,
    undoSendSeconds: DEFAULT_SETTINGS.undoSendSeconds,
    convexUrl: config.convexUrl || process.env.VITE_CONVEX_URL || "",
  }),
);

// ---------- auth ----------

async function startSession(c: Context, userId: string): Promise<void> {
  const s = await createSession(userId);
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
    return c.redirect(`/?auth_error=${encodeURIComponent(err instanceof Error ? err.message : "Sign-in is not configured")}`);
  }
});

app.get("/api/auth/:provider/callback", async (c) => {
  const provider = c.req.param("provider");
  const fail = (msg: string) => c.redirect(`/?auth_error=${encodeURIComponent(msg)}`);
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
    let userId = await sessionUser(getCookie(c, SESSION_COOKIE));
    if (!userId) userId = (await findAccountByIdentity(kind, email))?.user_id ?? await createUser();
    const account = await upsertAccount(userId, kind, email, identity.name || email, tokens);
    dropProvider(account.id);
    await startSession(c, userId);
    startPolling(account.id);
    void syncNow(account.id);
    return c.redirect(`/?account=${encodeURIComponent(account.id)}`);
  } catch (e) {
    console.error("[oauth]", e);
    return fail(e instanceof Error ? e.message : "Sign-in failed.");
  }
});

app.post("/api/auth/demo", async (c) => {
  if (!config.demo) return c.json({ error: "The demo mailbox is disabled on this server." }, 403);
  let userId = await sessionUser(getCookie(c, SESSION_COOKIE));
  if (!userId) userId = await createUser();
  const account = await upsertAccount(userId, "demo", "alex.morgan@northwind.example", "Alex Morgan", null);
  await startSession(c, userId);
  startPolling(account.id);
  return c.json({ accountId: account.id });
});

app.get("/api/auth/convex-token", async (c) => {
  const userId = await sessionUser(getCookie(c, SESSION_COOKIE));
  if (!userId) return c.json({ error: "Not signed in" }, 401);
  try {
    const { convexToken } = await import("./jwt");
    const token = await convexToken(userId);
    return c.json({ token });
  } catch (err) {
    console.error("[jwt]", err);
    return c.json({ error: "Realtime auth is not configured" }, 503);
  }
});

app.post("/api/auth/logout", async (c) => {
  const sid = getCookie(c, SESSION_COOKIE);
  if (sid) await deleteSession(sid);
  deleteCookie(c, SESSION_COOKIE, { path: "/" });
  return c.json({ ok: true });
});

// ---------- authenticated API ----------

const api = new Hono<Env>();

api.use("*", async (c, next) => {
  const userId = await sessionUser(getCookie(c, SESSION_COOKIE));
  if (!userId) return c.json({ error: "Not signed in", code: "session" }, 401);
  // Mutations must carry a custom header: browsers won't send it cross-site without CORS.
  if (c.req.method !== "GET" && c.req.header("x-tidepost") !== "1") return c.json({ error: "Missing request header" }, 403);
  c.set("userId", userId);
  await next();
});

async function ownedAccount(c: Context<Env>): Promise<AccountRow> {
  const account = await getAccount(c.req.param("aid") ?? "");
  if (!account || account.user_id !== c.get("userId")) throw new HttpError(404, "Account not found");
  return account;
}

class HttpError extends Error {
  constructor(public status: 400 | 403 | 404 | 409, message: string) {
    super(message);
  }
}

api.onError((err, c) => {
  if (err instanceof HttpError) return c.json({ error: err.message }, err.status);
  if (err instanceof AuthExpiredError) return c.json({ error: err.message, code: "auth" }, 401);
  console.error("[api]", err);
  return c.json({ error: err instanceof Error ? err.message : "Unexpected error" }, 500);
});

api.get("/me", async (c) => {
  const userId = c.get("userId");
  const accounts = await listAccounts(userId);
  for (const a of accounts) startPolling(a.id);
  return c.json({ accounts: accounts.map(toAccount), settings: await settingsFor(userId) });
});

api.put("/settings", async (c) => {
  const userId = c.get("userId");
  const patch = (await c.req.json()) as Partial<Settings>;
  const next = { ...(await settingsFor(userId)), ...patch };
  next.undoSendSeconds = Math.max(0, Math.min(30, Number(next.undoSendSeconds) || 0));
  await setUserSettings(userId, next as unknown as Record<string, unknown>);
  return c.json(next);
});

api.delete("/accounts/:aid", async (c) => {
  const account = await ownedAccount(c);
  stopPolling(account.id);
  dropProvider(account.id);
  await removeAccount(account.id);
  return c.json({ ok: true });
});

api.post("/accounts/:aid/sync", async (c) => {
  const account = await ownedAccount(c);
  await syncNow(account.id);
  return c.json({ ok: true });
});

api.get("/accounts/:aid/folders", async (c) => {
  const account = await ownedAccount(c);
  const provider = await providerFor(account);
  return c.json(await provider.listFolders());
});

api.get("/accounts/:aid/counts", async (c) => c.json(await laneCounts((await ownedAccount(c)).id)));

api.get("/accounts/:aid/threads", async (c) => {
  const account = await ownedAccount(c);
  const view = c.req.query("view") ?? "inbox";
  const offset = Math.max(0, Number(c.req.query("cursor") ?? 0) || 0);
  const limit = Math.min(200, Math.max(1, Number(c.req.query("limit") ?? 100) || 100));
  return c.json(await listThreads(account.id, view, offset, limit));
});

api.get("/accounts/:aid/threads/:tid", async (c) => {
  const account = await ownedAccount(c);
  const thread = await getThread(account, c.req.param("tid"), { refresh: c.req.query("refresh") !== "0" });
  if (!thread) return c.json({ error: "Thread not found" }, 404);
  return c.json(thread);
});

api.post("/accounts/:aid/messages", async (c) => {
  const account = await ownedAccount(c);
  const { ids } = (await c.req.json()) as { ids: string[] };
  return c.json(await getMessages(account, ids));
});

api.get("/accounts/:aid/messages/:mid/attachments/:att", async (c) => {
  const account = await ownedAccount(c);
  const provider = await providerFor(account);
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
  const { threadIds, action } = (await c.req.json()) as { threadIds: string[]; action: ThreadAction };
  if (!Array.isArray(threadIds) || !threadIds.length) throw new HttpError(400, "No threads selected");
  if (threadIds.length > 40) {
    const label = { archive: "Archive", read: "Mark read", unread: "Mark unread", trash: "Move to trash", star: "Star", unstar: "Unstar", inbox: "Move to inbox", spam: "Report spam" }[action.type as string] ?? "Update";
    return c.json({ run: bulkAction(account, threadIds, action, `${label} ${threadIds.length} threads`) });
  }
  await applyAction(account, threadIds, action);
  return c.json({ threads: await summariesFor(account.id, threadIds) });
});

api.get("/accounts/:aid/search", async (c) => {
  const account = await ownedAccount(c);
  const q = (c.req.query("q") ?? "").trim();
  if (!q) return c.json({ threads: [], nextCursor: null, total: 0 });
  if (c.req.query("local") === "1") {
    const threads = await localSearch(account.id, q, 60);
    return c.json({ threads, nextCursor: null, total: threads.length });
  }
  const provider = await providerFor(account);
  const metas = await provider.search(q, 150);
  await ingest(account, metas);
  const ids = [...new Set(metas.map((m) => m.threadId))];
  const threads = await summariesFor(account.id, ids);
  return c.json({ threads, nextCursor: null, total: threads.length });
});

api.get("/accounts/:aid/contacts", async (c) => {
  const account = await ownedAccount(c);
  return c.json(await contacts(account.id, account.email, c.req.query("q") ?? "", 8));
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
  return c.json(await enqueueSend(account, msg, delay));
});

api.get("/sends", async (c) => c.json(await listSends((await listAccounts(c.get("userId"))).map((a) => a.id))));

api.post("/accounts/:aid/sends/:sid/cancel", async (c) => {
  const account = await ownedAccount(c);
  const res = await cancelSend(account, c.req.param("sid"));
  if (!res.ok) throw new HttpError(409, "Too late: the message has already been sent.");
  return c.json(res);
});

api.post("/accounts/:aid/sends/:sid/retry", async (c) => {
  const account = await ownedAccount(c);
  const q = await retrySend(account, c.req.param("sid"));
  if (!q) throw new HttpError(404, "Nothing to retry.");
  return c.json(q);
});

api.post("/accounts/:aid/threads/:tid/unsubscribe", async (c) => {
  const account = await ownedAccount(c);
  return c.json(await unsubscribe(account, c.req.param("tid")));
});

// ---------- assistant ----------

const me = (a: AccountRow) => ({ name: a.name, email: a.email });

async function buildBrief(account: AccountRow, threadId: string, refresh: boolean): Promise<ThreadBrief> {
  const summary = await getThreadSummary(account.id, threadId);
  if (!summary) throw new HttpError(404, "Thread not found");
  const basis = `${summary.messageCount}:${summary.lastDate}`;
  const cached = await getBrief(account.id, threadId);
  if (cached && !refresh) {
    const b = JSON.parse(cached) as ThreadBrief;
    if (b.basis === basis && (b.source === "ai" || !aiEnabled())) return b;
  }
  const messages = await threadForAssistant(account, threadId);
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
  await setThreadState(account.id, threadId, { brief: JSON.stringify(brief) });
  return brief;
}

api.get("/accounts/:aid/threads/:tid/brief", async (c) => {
  const account = await ownedAccount(c);
  const cached = await getBrief(account.id, c.req.param("tid"));
  const summary = await getThreadSummary(account.id, c.req.param("tid"));
  if (cached && summary) {
    const b = JSON.parse(cached) as ThreadBrief;
    if (b.basis === `${summary.messageCount}:${summary.lastDate}`) return c.json(b);
  }
  // Heuristic briefs are instant; AI briefs are generated on request (POST).
  if (!aiEnabled() || c.req.query("auto") === "1") return c.json(await buildBrief(account, c.req.param("tid"), false));
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
  const messages = await threadForAssistant(account, c.req.param("tid"));
  try {
    return c.json(await aiDraft({ messages, me: me(account), notes: body.notes, mode: body.mode, recipients: body.recipients, subject: body.subject }));
  } catch (err) {
    return c.json({ error: describeAiError(err) }, 502);
  }
});

api.post("/accounts/:aid/draft", async (c) => {
  // Draft for a brand-new message (no thread).
  const account = await ownedAccount(c);
  const body = (await c.req.json()) as { notes: string; recipients: string[]; subject: string };
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
  const { instruction } = ((await c.req.json().catch(() => ({}))) ?? {}) as { instruction?: string };
  const summary = await getThreadSummary(account.id, tid);
  if (!summary) throw new HttpError(404, "Thread not found");
  let plan: Omit<Plan, "threadId">;
  if (aiEnabled()) {
    try {
      const provider = await providerFor(account);
      const labels = (await provider.listFolders()).filter((f) => f.kind === "user").map((f) => f.name);
      plan = await aiPlan({ summary, messages: await threadForAssistant(account, tid), me: me(account), labels, instruction: instruction ?? "" });
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
  const tid = c.req.param("tid");
  const { kind, params } = (await c.req.json()) as { kind: string; params: Record<string, string> };
  const days = Number(params.days ?? 1) || 1;
  const at = new Date(Date.now() + days * 86400_000);
  at.setHours(9, 0, 0, 0);
  switch (kind) {
    case "archive": await applyAction(account, [tid], { type: "archive" }); return c.json({ result: "Archived." });
    case "star": await applyAction(account, [tid], { type: "star" }); return c.json({ result: "Starred." });
    case "snooze": await applyAction(account, [tid], { type: "snooze", until: at.toISOString() }); return c.json({ result: `Snoozed until ${at.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}.` });
    case "remind": await applyAction(account, [tid], { type: "remind", at: at.toISOString() }); return c.json({ result: `Reminder set for ${at.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric" })} if nobody replies.` });
    case "unsubscribe": { const r = await unsubscribe(account, tid); return c.json({ result: r.message, url: r.url }); }
    case "label": {
      const provider = await providerFor(account);
      const folder = (await provider.listFolders()).find((f) => f.name.toLowerCase() === (params.label ?? "").toLowerCase());
      if (!folder) throw new HttpError(400, `No label named “${params.label}”.`);
      await applyAction(account, [tid], provider.folderStyle === "label" ? { type: "label", folderId: folder.id } : { type: "move", folderId: folder.id });
      return c.json({ result: `${provider.folderStyle === "label" ? "Labelled" : "Moved to"} ${folder.name}.` });
    }
    default: throw new HttpError(400, "That step runs in the composer.");
  }
});

// ---------- runs ----------

api.get("/runs", (c) => c.json(listRuns(c.get("userId"))));

api.post("/accounts/:aid/sweeps", async (c) => {
  const account = await ownedAccount(c);
  const { kind } = (await c.req.json()) as { kind: SweepKind };
  return c.json(await startSweep(account, kind));
});

api.post("/runs/:rid/:op", async (c) => {
  const entry = getRunEntry(c.req.param("rid"));
  if (!entry || entry.userId !== c.get("userId")) throw new HttpError(404, "Run not found");
  const op = c.req.param("op");
  if (op === "apply") {
    if (entry.run.state !== "review" || !entry.apply) throw new HttpError(409, "This run has nothing to apply.");
    void entry.apply().catch((err: unknown) => updateRun(entry.run.id, { state: "failed", error: err instanceof Error ? err.message : String(err) }));
    return c.json({ ok: true });
  }
  if (op === "dismiss" || op === "cancel") {
    updateRun(entry.run.id, { state: "cancelled" });
    entry.cancel?.();
    return c.json({ ok: true });
  }
  throw new HttpError(400, "Unknown operation");
});

// ---------- live events ----------

api.get("/events", (c) =>
  streamSSE(c, async (stream) => {
    const userId = c.get("userId");
    const unsubscribeFn = subscribe(userId, (e) => {
      void stream.writeSSE({ data: JSON.stringify(e) });
    });
    const ping = setInterval(() => void stream.writeSSE({ event: "ping", data: "" }), 25_000);
    stream.onAbort(() => {
      clearInterval(ping);
      unsubscribeFn();
    });
    await stream.writeSSE({ event: "hello", data: "" });
    // Keep the stream open until the client disconnects.
    await new Promise<void>((resolve) => stream.onAbort(resolve));
  }),
);

app.route("/api", api);

export function startAccountsOnBoot(): void {
  // Nothing to do eagerly: polling starts when a signed-in user loads /api/me.
  void emit;
}
