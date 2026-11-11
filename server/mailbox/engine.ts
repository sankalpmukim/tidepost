// The per-account mailbox engine. Runs inside the Mailbox Durable Object in
// production and directly against the memory store in tests. Ports the old
// server/sync.ts (index build, polling, snooze/reminder scheduler),
// server/mail.ts (bodies, actions, undo-send queue, unsubscribe, sweeps)
// and server/events.ts (background runs) onto a single alarm-driven loop.
import dns from "node:dns/promises";
import net from "node:net";
import type { AccountPersistRow, AuthPersist, MailboxPersist } from "../persist";
import { BODY_JSON_MAX } from "../limits";
import type { Config } from "../config";
import type { ServerEvent } from "../bus";
import { newId, decrypt, encrypt } from "../db";
import type { MessageChange, MessageMeta, MailProvider, RawOutgoing, TokenSource } from "../providers/types";
import type { Account, Folder } from "../../shared/types";
import type { TokenSet } from "../auth/types";
import { AuthExpiredError, RateLimitedError } from "../providers/types";
import {
  applyLocal, contacts as contactsOf, getBrief, getMeta, getThreadSummary, indexBody, invalidateContacts,
  laneCounts, listThreads as listThreadsOf, localSearch as localSearchOf, setThreadState, summariesFor,
  sweepCandidates, threadMessageIds, threadMetas, upsertMessages, deleteMessages,
} from "../store";
import { htmlToText, stripQuotedText, textToHtml, escapeHtml } from "../text";
import { mapLimit } from "../providers/http";
import { HttpError } from "./rpc";
import type {
  AttachmentMeta, LaneCounts, Message, OutgoingMessage, QueuedSend, Run, SweepKind, Thread,
  ThreadAction, ThreadSummary, UnsubscribeResult,
} from "../../shared/types";

/** Lets the engine ask its host (the DO, or the test harness) to wake up. */
export interface EngineHost {
  schedule(whenMs: number): void;
}

export interface EngineDeps {
  accountId: string;
  persist: MailboxPersist;
  auth: AuthPersist;
  config: Config;
  emit(e: ServerEvent): void;
  host: EngineHost;
}

interface RunEntry {
  run: Run;
  cancel?: () => void;
  apply?: () => Promise<void>;
}

const DEFAULT_SYNC: Account["sync"] = { phase: "idle", done: 0, total: 0, lastSyncedAt: null, error: null };

function describe(err: unknown): string {
  if (err instanceof AuthExpiredError) return err.message;
  if (err instanceof RateLimitedError) return "The mail provider asked us to slow down. Sync will retry shortly.";
  return err instanceof Error ? err.message : String(err);
}

export class MailboxEngine {
  accountId: string;
  private readonly p: MailboxPersist;
  private readonly auth: AuthPersist;
  private readonly cfg: Config;
  private readonly emitEvent: (e: ServerEvent) => void;
  private readonly host: EngineHost;

  account: AccountPersistRow | null = null;
  private provider: MailProvider | null = null;
  private inflightRefresh: Promise<string> | null = null;
  private syncing: Promise<void> | null = null;
  private backoffUntil = 0;
  private initialized = false;
  private lastPollAt = 0;
  private lastMaintenanceAt = 0;
  private pollRequestAt = 0;
  private schedulerRetryAt = 0;
  private runs = new Map<string, RunEntry>();
  private runLoopsAlive = new Set<string>();

  constructor(deps: EngineDeps) {
    this.accountId = deps.accountId;
    this.p = deps.persist;
    this.auth = deps.auth;
    this.cfg = deps.config;
    this.emitEvent = deps.emit;
    this.host = deps.host;
  }

  // ---------- lifecycle ----------

  /** Seed the engine with the account row (called on sign-in and /api/me). */
  async ensureAccount(row: AccountPersistRow): Promise<void> {
    if (!this.accountId) this.accountId = row.id;
    this.account = row;
    if (this.initialized) return;
    this.initialized = true;
    await this.p.requeueSending();
    this.host.schedule(Date.now());
  }

  /** Remove-account: wipe the index and stop. */
  async destroy(): Promise<void> {
    this.account = null;
    this.provider = null;
    this.runs.clear();
    await this.p.wipeIndex(this.accountId);
  }

  accountRow(): AccountPersistRow {
    if (!this.account) throw new Error("Mailbox not initialized");
    return this.account;
  }

  // ---------- provider + tokens ----------

  private async refreshAccount(): Promise<AccountPersistRow> {
    const row = await this.auth.getAccount(this.accountId);
    if (row) this.account = row;
    return this.accountRow();
  }

  private tokenSource(): TokenSource {
    const engine = this;
    return {
      async getAccessToken() {
        const row = await engine.refreshAccount();
        if (!row.tokens) throw new AuthExpiredError();
        const t = JSON.parse(decrypt(row.tokens)) as TokenSet;
        if (t.expiresAt - 60_000 > Date.now()) return t.accessToken;
        return engine.forceRefresh();
      },
      refresh() {
        return engine.forceRefresh();
      },
    };
  }

  /** Single-flight token refresh; persists the new set back to the account row. */
  forceRefresh(): Promise<string> {
    if (this.inflightRefresh) return this.inflightRefresh;
    this.inflightRefresh = (async () => {
      try {
        const row = await this.refreshAccount();
        if (!row.tokens) throw new AuthExpiredError();
        const t = JSON.parse(decrypt(row.tokens)) as TokenSet;
        if (!t.refreshToken) throw new AuthExpiredError();
        const { googleRefresh } = await import("../auth/google");
        const { microsoftRefresh } = await import("../auth/microsoft");
        const next = row.provider === "gmail" ? await googleRefresh(t.refreshToken) : await microsoftRefresh(t.refreshToken);
        const merged: TokenSet = { ...next, refreshToken: next.refreshToken ?? t.refreshToken };
        const enc = encrypt(JSON.stringify(merged));
        await this.auth.updateAccountTokens(this.accountId, enc);
        this.account = { ...row, tokens: enc };
        return merged.accessToken;
      } finally {
        this.inflightRefresh = null;
      }
    })();
    return this.inflightRefresh;
  }

  async providerFor(): Promise<MailProvider> {
    if (this.provider) return this.provider;
    const row = await this.refreshAccount();
    let p: MailProvider;
    if (row.provider === "gmail") {
      const { GmailProvider } = await import("../providers/gmail");
      p = new GmailProvider(this.tokenSource());
    } else if (row.provider === "outlook") {
      const { OutlookProvider } = await import("../providers/outlook");
      p = new OutlookProvider(this.tokenSource());
    } else {
      const { DemoProvider } = await import("../providers/demo/index");
      // Deterministic per account: the demo mailbox regenerates identically
      // forever, so the durable index stays consistent with the provider.
      p = new DemoProvider({ me: { name: row.name, email: row.email }, seed: 42, now: new Date(row.created_at) });
    }
    this.provider = p;
    return p;
  }

  // ---------- sync state on the account row ----------

  async setCursor(cursor: string | null): Promise<void> {
    await this.auth.updateAccountCursor(this.accountId, cursor);
    if (this.account) this.account = { ...this.account, cursor };
  }

  async setSync(patch: Partial<Account["sync"]>): Promise<Account["sync"]> {
    const row = await this.refreshAccount();
    const next = { ...DEFAULT_SYNC, ...(JSON.parse(row.sync) as Partial<Account["sync"]>), ...patch };
    await this.auth.updateAccountSync(this.accountId, JSON.stringify(next));
    this.account = { ...row, sync: JSON.stringify(next) };
    return next;
  }

  // ---------- sync engine (ports server/sync.ts) ----------

  async ingest(metas: MessageMeta[], deleted: string[] = []): Promise<string[]> {
    const me = this.accountRow().email;
    const a = await upsertMessages(this.p, this.accountId, me, metas);
    const b = await deleteMessages(this.p, this.accountId, me, deleted);
    const ids = [...new Set([...a, ...b])];
    if (ids.length) {
      invalidateContacts(this.accountId);
      this.emitEvent({ type: "threads", accountId: this.accountId, threadIds: ids });
    }
    return ids;
  }

  private async initialSync(): Promise<void> {
    const row = this.accountRow();
    const provider = await this.providerFor();
    const run = this.startRun({
      accountId: this.accountId, kind: "sync", title: "Indexing mailbox", detail: row.email, total: this.cfg.initialSyncMessages,
    });
    this.emitEvent({ type: "sync", accountId: this.accountId, sync: await this.setSync({ phase: "initial", done: 0, total: this.cfg.initialSyncMessages, error: null }) });
    let lastEmit = 0;
    const result = await provider.initialSync({
      maxMessages: this.cfg.initialSyncMessages,
      onPage: async (page, progress) => {
        await this.ingest(page.messages, page.deleted);
        const sync = await this.setSync({ phase: "initial", done: progress.done, total: progress.total });
        if (Date.now() - lastEmit > 400 || progress.done >= progress.total) {
          lastEmit = Date.now();
          this.emitEvent({ type: "sync", accountId: this.accountId, sync });
          this.updateRun(run.id, { done: progress.done, total: progress.total, detail: `${progress.done.toLocaleString()} of ${progress.total.toLocaleString()} messages` });
        }
      },
    });
    await this.setCursor(result.cursor);
    const sync = await this.setSync({ phase: "idle", lastSyncedAt: new Date().toISOString(), error: null });
    this.emitEvent({ type: "sync", accountId: this.accountId, sync });
    this.emitEvent({ type: "folders", accountId: this.accountId });
    this.updateRun(run.id, { state: "done", detail: `${sync.done.toLocaleString()} messages indexed` });
  }

  private async incremental(): Promise<void> {
    const row = this.accountRow();
    const provider = await this.providerFor();
    if (!row.cursor) return this.initialSync();
    const res = await provider.changes(row.cursor);
    if (res.resetRequired) {
      await this.setCursor(null);
      this.account = { ...this.accountRow(), cursor: null };
      return this.initialSync();
    }
    const ids = await this.ingest(res.messages, res.deleted);
    await this.setCursor(res.cursor);
    const sync = await this.setSync({ phase: "idle", lastSyncedAt: new Date().toISOString(), error: null });
    this.emitEvent({ type: "sync", accountId: this.accountId, sync });
    if (ids.length) this.emitEvent({ type: "folders", accountId: this.accountId });
  }

  /** Run a sync now (initial when needed). Concurrent calls share one run. */
  syncNow(): Promise<void> {
    if (this.syncing) return this.syncing;
    if (Date.now() < this.backoffUntil) return Promise.resolve();
    this.syncing = (async () => {
      try {
        await this.incremental();
      } catch (err) {
        const message = describe(err);
        if (err instanceof RateLimitedError) this.backoffUntil = Date.now() + err.retryAfterMs;
        else this.backoffUntil = Date.now() + 30_000;
        const sync = await this.setSync({ phase: "error", error: message });
        this.emitEvent({ type: "sync", accountId: this.accountId, sync });
        if (err instanceof AuthExpiredError) this.emitEvent({ type: "auth", accountId: this.accountId, message });
        console.error(`[sync] ${this.accountRow().provider}:${this.accountRow().email}:`, message);
      } finally {
        this.syncing = null;
        this.lastPollAt = Date.now();
      }
    })();
    return this.syncing;
  }

  /** Fetch the full thread from the provider (covers messages older than the synced window). */
  async refreshThread(threadId: string): Promise<void> {
    const provider = await this.providerFor();
    const metas = await provider.threadMessages(threadId);
    await this.ingest(metas);
  }

  // ---------- scheduler: snoozes and follow-up reminders ----------

  private async wakeDue(): Promise<void> {
    const now = Date.now();
    const due = await this.p.dueThreadStates(now);
    for (const d of due) {
      try {
        const provider = await this.providerFor();
        const ids = await threadMessageIds(this.p, this.accountId, d.thread_id);
        if (d.snoozed_until && d.snoozed_until <= now) {
          if (ids.length) {
            await provider.modify(ids, { kind: "inbox" });
            await provider.modify([ids[0]], { kind: "read", value: false });
          }
          await setThreadState(this.p, this.accountId, d.thread_id, { snoozed_until: null });
        }
        if (d.remind_at && d.remind_at <= now) {
          const t = await getThreadSummary(this.p, this.accountId, d.thread_id);
          if (t?.lastFromMe) {
            if (ids.length) await provider.modify(ids, { kind: "inbox" });
            await setThreadState(this.p, this.accountId, d.thread_id, { remind_at: null, nudged: 1 });
          } else {
            await setThreadState(this.p, this.accountId, d.thread_id, { remind_at: null });
          }
        }
        await this.syncNow();
        this.emitEvent({ type: "threads", accountId: this.accountId, threadIds: [d.thread_id] });
      } catch (err) {
        // Retry on the next scheduler pass (20s), like the old interval loop.
        this.schedulerRetryAt = Date.now() + 20_000;
        console.error("[scheduler]", describe(err));
      }
    }
  }

  // ---------- alarm loop ----------

  /** Run whatever is due. The DO calls this from alarm() and reschedules. */
  async tick(): Promise<void> {
    if (!this.account) return;
    const now = Date.now();
    await this.processDueSends();
    if (now >= this.nextSchedulerWake()) await this.wakeDue();
    this.resumeRuns();
    if (now >= this.nextPollWake()) await this.syncNow();
    if (now - this.lastMaintenanceAt > 3600_000) {
      this.lastMaintenanceAt = now;
      await this.p.purgeOldQueue(Date.now() - 24 * 3600_000);
    }
  }

  private async nextQueueWake(): Promise<number | null> {
    return this.p.nextQueueWake(Date.now());
  }

  private nextSchedulerWake(): number {
    const now = Date.now();
    return Math.max(this.schedulerRetryAt, 0) > now ? this.schedulerRetryAt : 0;
  }

  private nextPollWake(): number {
    const now = Date.now();
    if (this.backoffUntil > now) return this.backoffUntil;
    if (this.pollRequestAt && this.pollRequestAt <= now) return now;
    const cadence = this.lastPollAt === 0 ? now : this.lastPollAt + this.cfg.pollSeconds * 1000;
    return this.pollRequestAt ? Math.min(this.pollRequestAt, cadence) : cadence;
  }

  /** The next wall time the engine wants to be woken at. */
  async nextWake(): Promise<number> {
    const now = Date.now();
    const candidates: number[] = [];
    const q = await this.nextQueueWake();
    if (q !== null) candidates.push(q);
    if (this.schedulerRetryAt > now) candidates.push(this.schedulerRetryAt);
    candidates.push(this.nextPollWake());
    if (this.schedulerRetryAt <= now) {
      // Snoozes and reminders become due between polls; check them often.
      candidates.push(now + 20_000);
    }
    if ([...this.runs.values()].some((e) => e.run.state === "running")) candidates.push(now + 2000);
    if (this.syncing) candidates.push(now + 5000);
    const next = Math.min(...candidates);
    return Math.max(next, now + 1000);
  }

  /** Ask for a poll sooner than the cadence (after actions and sends). */
  requestPoll(delayMs = 1500): void {
    this.pollRequestAt = Math.max(this.pollRequestAt, Date.now() + delayMs);
    this.host.schedule(Date.now() + delayMs);
  }

  // ---------- bodies (ports server/mail.ts) ----------

  private async cachedBody(messageId: string): Promise<StoredBody | null> {
    const json = await this.p.getBody(this.accountId, messageId);
    if (!json) return null;
    try {
      return JSON.parse(json) as StoredBody;
    } catch {
      // Corrupt row (e.g. truncated by an old size cap): treat as a miss so the
      // body is refetched from the provider and the row is re-stored.
      return null;
    }
  }

  private clampBodyForStore(stored: StoredBody): StoredBody {
    let out = stored;
    for (let pass = 0; pass < 10; pass++) {
      const json = JSON.stringify(out);
      if (json.length <= BODY_JSON_MAX) return out;
      const lens = [out.html?.length ?? 0, out.uniqueHtml?.length ?? 0, out.text.length, out.uniqueText.length];
      const fixed = json.length - lens.reduce((a, b) => a + b, 0);
      const budget = Math.max(0, BODY_JSON_MAX - fixed - 256);
      const total = lens.reduce((a, b) => a + b, 0);
      const k = total > 0 ? Math.min(1, budget / total) : 0;
      const cut = (s: string): string => s.slice(0, Math.ceil(s.length * k));
      const cutN = (s: string | null): string | null => (s === null ? null : cut(s));
      out = { ...out, html: cutN(out.html), uniqueHtml: cutN(out.uniqueHtml), text: cut(out.text), uniqueText: cut(out.uniqueText) };
    }
    return { html: null, text: "", uniqueText: "", uniqueHtml: null, attachments: [] };
  }

  async fetchBody(messageId: string): Promise<StoredBody> {
    const cached = await this.cachedBody(messageId);
    if (cached) return cached;
    const provider = await this.providerFor();
    const b = await provider.getBody(messageId);
    const text = (b.text && b.text.trim()) || (b.html ? htmlToText(b.html) : "");
    const uniqueText = b.uniqueHtml ? htmlToText(b.uniqueHtml) : stripQuotedText(text);
    const stored: StoredBody = { html: b.html, text, uniqueText, uniqueHtml: b.uniqueHtml, attachments: b.attachments };
    const clamped = this.clampBodyForStore(stored);
    await this.p.putBody(this.accountId, messageId, JSON.stringify(clamped));
    await indexBody(this.p, this.accountId, messageId, text);
    if (b.headers) {
      const meta = await getMeta(this.p, this.accountId, messageId);
      if (meta) {
        const merged: MessageMeta = {
          ...meta,
          bulk: { ...meta.bulk, ...Object.fromEntries(Object.entries(b.headers.bulk ?? {}).filter(([, v]) => v)) },
          messageIdHeader: b.headers.messageIdHeader ?? meta.messageIdHeader,
          inReplyTo: b.headers.inReplyTo ?? meta.inReplyTo,
          references: b.headers.references ?? meta.references,
          hasAttachments: meta.hasAttachments || b.attachments.some((a) => !a.inline),
        };
        await this.ingest([merged]);
      }
    } else if (b.attachments.some((a) => !a.inline)) {
      const meta = await getMeta(this.p, this.accountId, messageId);
      if (meta && !meta.hasAttachments) await this.ingest([{ ...meta, hasAttachments: true }]);
    }
    return clamped;
  }

  // ---------- reads ----------

  listThreads(view: string, offset: number, limit: number) {
    return listThreadsOf(this.p, this.accountId, view, offset, limit);
  }

  laneCounts(): Promise<LaneCounts> {
    return laneCounts(this.p, this.accountId);
  }

  localSearch(q: string, limit = 50) {
    return localSearchOf(this.p, this.accountId, q, limit);
  }

  contacts(q: string) {
    const me = this.accountRow().email;
    return contactsOf(this.p, this.accountId, me, q, 8);
  }

  summary(threadId: string) {
    return getThreadSummary(this.p, this.accountId, threadId);
  }

  getBriefCache(threadId: string) {
    return getBrief(this.p, this.accountId, threadId);
  }

  async setBriefCache(threadId: string, brief: string) {
    await setThreadState(this.p, this.accountId, threadId, { brief });
  }

  async getThread(threadId: string, opts: { refresh?: boolean } = {}): Promise<Thread | null> {
    if (opts.refresh !== false) {
      const refreshing = this.refreshThread(threadId).catch((err: unknown) => console.error("[thread refresh]", err instanceof Error ? err.message : err));
      await withTimeout(refreshing, 2500);
    }
    const all = await threadMetas(this.p, this.accountId, threadId);
    const allTrash = all.every((m) => m.folders.includes("TRASH"));
    const metas = allTrash ? all : all.filter((m) => !m.folders.includes("TRASH"));
    if (!metas.length) return null;
    const want = new Set<string>();
    metas.forEach((m, i) => {
      if (m.unread || i === 0 || i >= metas.length - 3) want.add(m.id);
    });
    const eager = [...want].slice(-25);
    const bodies = new Map<string, StoredBody>();
    for (const m of metas) {
      const c = await this.cachedBody(m.id);
      if (c) bodies.set(m.id, c);
    }
    await mapLimit(eager.filter((id) => !bodies.has(id)), 6, async (id) => {
      try {
        bodies.set(id, await this.fetchBody(id));
      } catch (err) {
        console.error("[body]", err instanceof Error ? err.message : err);
      }
    });
    const fresh = (await threadMetas(this.p, this.accountId, threadId)).filter((m) => metas.some((x) => x.id === m.id));
    const summary = await getThreadSummary(this.p, this.accountId, threadId);
    if (!summary) return null;
    return {
      id: threadId,
      accountId: this.accountId,
      subject: summary.subject,
      messages: fresh.map((m) => toMessage(this.accountRow(), m, bodies.get(m.id) ?? null)),
      summary,
    };
  }

  async getMessages(ids: string[]): Promise<Message[]> {
    const account = this.accountRow();
    const out: Message[] = [];
    await mapLimit(ids.slice(0, 200), 6, async (id) => {
      const meta = await getMeta(this.p, this.accountId, id);
      if (!meta) return;
      try {
        out.push(toMessage(account, meta, await this.fetchBody(id)));
      } catch (err) {
        console.error("[body]", err instanceof Error ? err.message : err);
      }
    });
    return out;
  }

  /** Plain text of the whole thread for the assistant, loading missing bodies. */
  async threadForAssistant(threadId: string): Promise<Message[]> {
    const account = this.accountRow();
    const metas = (await threadMetas(this.p, this.accountId, threadId)).filter((m) => !m.folders.includes("TRASH"));
    const out: Message[] = [];
    await mapLimit(metas, 6, async (m) => {
      let body: StoredBody | null = null;
      try {
        body = await this.fetchBody(m.id);
      } catch {
        body = null;
      }
      out.push(toMessage(account, m, body));
    });
    return out.sort((a, b) => a.date.localeCompare(b.date));
  }

  async folders(): Promise<Folder[]> {
    const provider = await this.providerFor();
    return provider.listFolders();
  }

  async search(q: string): Promise<ThreadSummary[]> {
    const provider = await this.providerFor();
    const metas = await provider.search(q, 150);
    await this.ingest(metas);
    const ids = [...new Set(metas.map((m) => m.threadId))];
    return summariesFor(this.p, this.accountId, ids);
  }

  // ---------- actions ----------

  async applyAction(threadIds: string[], action: ThreadAction, onProgress?: (done: number) => Promise<void> | void): Promise<void> {
    const now = Date.now();
    for (const t of threadIds) {
      switch (action.type) {
        case "pin": await setThreadState(this.p, this.accountId, t, { pinned: 1 }); break;
        case "unpin": await setThreadState(this.p, this.accountId, t, { pinned: 0 }); break;
        case "snooze": await setThreadState(this.p, this.accountId, t, { snoozed_until: Date.parse(action.until) }); break;
        case "unsnooze": await setThreadState(this.p, this.accountId, t, { snoozed_until: null }); break;
        case "remind": await setThreadState(this.p, this.accountId, t, { remind_at: Date.parse(action.at), remind_set_at: now, nudged: 0 }); break;
        case "unremind": await setThreadState(this.p, this.accountId, t, { remind_at: null, nudged: 0 }); break;
        case "stopWaiting": await setThreadState(this.p, this.accountId, t, { waiting_dismissed_at: now, nudged: 0, remind_at: null }); break;
        case "archive": await setThreadState(this.p, this.accountId, t, { nudged: 0 }); break;
        default: break;
      }
    }
    const change = changeFor(action);
    const userId = this.accountRow().user_id;
    if (!change) {
      this.emitEvent({ type: "threads", accountId: this.accountId, threadIds });
      return;
    }
    const provider = await this.providerFor();
    const perThread = await Promise.all(threadIds.map(async (t) => ({ t, metas: await threadMetas(this.p, this.accountId, t) })));
    const ids = perThread.flatMap(({ metas }) => targetIds(metas, action));
    const transform = localTransform(action, provider.folderStyle);
    await applyLocal(this.p, this.accountId, this.accountRow().email, threadIds, (m) => {
      const metas = perThread.find((entry) => entry.t === m.threadId)?.metas ?? [];
      return transform(m, metas[metas.length - 1]?.id === m.id);
    });
    this.emitEvent({ type: "threads", accountId: this.accountId, threadIds });
    if (!ids.length) return;
    try {
      const chunk = 200;
      for (let i = 0; i < ids.length; i += chunk) {
        await provider.modify(ids.slice(i, i + chunk), change);
        await onProgress?.(Math.min(ids.length, i + chunk));
      }
    } catch (err) {
      // Reconcile with the server's truth.
      void this.syncNow();
      throw err;
    }
    // Pull provider-side changes (e.g. Outlook moves) shortly after.
    this.requestPoll(1500);
    void userId;
  }

  async summaries(threadIds: string[]): Promise<ThreadSummary[]> {
    return summariesFor(this.p, this.accountId, threadIds);
  }

  // ---------- undo-send queue ----------

  private rowToQueued(r: { id: string; account_id: string; payload: string; send_at: number; status: QueuedSend["status"]; error: string | null; thread_id: string | null }): QueuedSend {
    const msg = JSON.parse(decrypt(r.payload)) as OutgoingMessage;
    return { id: r.id, accountId: r.account_id, sendAt: new Date(r.send_at).toISOString(), subject: msg.subject, to: msg.to, status: r.status, error: r.error, threadId: r.thread_id };
  }

  async enqueueSend(msg: OutgoingMessage, delaySeconds: number): Promise<QueuedSend> {
    const id = newId("snd");
    const sendAt = Date.now() + Math.max(0, delaySeconds) * 1000;
    await this.p.putQueue({
      id, account_id: this.accountId, payload: encrypt(JSON.stringify(msg)), send_at: sendAt, status: "queued",
      error: null, thread_id: msg.inReplyTo?.threadId ?? null, created_at: Date.now(),
      display_subject: msg.subject, display_to_json: JSON.stringify(msg.to),
    });
    const q = this.rowToQueued((await this.p.getQueue(id))!);
    this.emitEvent({ type: "send", send: q });
    if (delaySeconds <= 0) {
      await this.processDueSends();
    } else {
      this.host.schedule(sendAt);
    }
    return q;
  }

  async cancelSend(id: string): Promise<{ ok: boolean; message: OutgoingMessage | null }> {
    const row = await this.p.getQueue(id);
    if (!row || row.account_id !== this.accountId || row.status !== "queued") return { ok: false, message: null };
    await this.p.updateQueue(id, { status: "cancelled" });
    const q = this.rowToQueued({ ...row, status: "cancelled" });
    this.emitEvent({ type: "send", send: q });
    return { ok: true, message: JSON.parse(decrypt(row.payload)) as OutgoingMessage };
  }

  async retrySend(id: string): Promise<QueuedSend | null> {
    const row = await this.p.getQueue(id);
    if (!row || row.account_id !== this.accountId || row.status !== "failed") return null;
    await this.p.updateQueue(id, { status: "queued", error: null, send_at: Date.now() });
    this.host.schedule(Date.now());
    return this.rowToQueued({ ...row, status: "queued", error: null, send_at: Date.now() });
  }

  async sends(): Promise<QueuedSend[]> {
    const rows = await this.p.listQueueForAccount(this.accountId, Date.now() - 10 * 60_000);
    return rows.map((r) => this.rowToQueued(r));
  }

  private async processDueSends(): Promise<void> {
    const due = await this.p.dueQueue(Date.now());
    for (const row of due) {
      const claimed = await this.p.updateQueue(row.id, { status: "sending" }, "queued");
      if (!claimed) continue;
      const account = await this.refreshAccount();
      const msg = JSON.parse(decrypt(row.payload)) as OutgoingMessage;
      this.emitEvent({ type: "send", send: this.rowToQueued({ ...row, status: "sending" }) });
      try {
        const settings = await this.userSettings(account.user_id);
        const provider = await this.providerFor();
        const raw = await this.buildOutgoing(account, msg, typeof settings.signature === "string" ? settings.signature : "");
        const res = await provider.send(raw);
        const threadId = res.threadId ?? raw.threadId;
        await this.p.updateQueue(row.id, { status: "sent", thread_id: threadId });
        this.emitEvent({ type: "send", send: this.rowToQueued({ ...row, status: "sent", thread_id: threadId }) });
        if (threadId) await setThreadState(this.p, this.accountId, threadId, { waiting_dismissed_at: null, nudged: 0 });
        this.requestPoll(1200);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.p.updateQueue(row.id, { status: "failed", error: message });
        this.emitEvent({ type: "send", send: this.rowToQueued({ ...row, status: "failed", error: message }) });
      }
    }
  }

  private async userSettings(userId: string): Promise<{ signature?: unknown }> {
    const user = await this.auth.getUser(userId);
    if (!user) return {};
    try {
      return JSON.parse(user.settings) as { signature?: unknown };
    } catch {
      return {};
    }
  }

  private quoteText(text: string): string {
    return text.split("\n").map((l) => `> ${l}`).join("\n");
  }

  async buildOutgoing(account: AccountPersistRow, msg: OutgoingMessage, signature: string): Promise<RawOutgoing> {
    const original = msg.inReplyTo ? await getMeta(this.p, this.accountId, msg.inReplyTo.messageId) : null;
    const sig = signature.trim();
    const bodyText = sig ? `${msg.text.trimEnd()}\n\n-- \n${sig}` : msg.text.trimEnd();
    let html = `<div style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.5">${textToHtml(msg.text.trimEnd())}`;
    if (sig) html += `<div class="tidepost-signature" style="color:#555">-- <br>${escapeHtml(sig).replace(/\n/g, "<br>")}</div>`;
    html += "</div>";
    let text = bodyText;
    if (original && (msg.quotedHtml || msg.quotedText)) {
      const when = new Date(original.date).toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
      const who = `${escapeHtml(original.from.name)} &lt;${escapeHtml(original.from.email)}&gt;`;
      const header = msg.mode === "forward"
        ? `---------- Forwarded message ---------<br>From: ${who}<br>Date: ${escapeHtml(when)}<br>Subject: ${escapeHtml(original.subject)}<br>To: ${escapeHtml(original.to.map((p) => p.email).join(", "))}<br><br>`
        : `On ${escapeHtml(when)}, ${who} wrote:<br>`;
      const quoted = msg.quotedHtml ?? textToHtml(msg.quotedText ?? "");
      html += msg.mode === "forward"
        ? `<br><div class="gmail_quote">${header}${quoted}</div>`
        : `<br><div class="gmail_quote"><div class="gmail_attr">${header}</div><blockquote class="gmail_quote" style="margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex">${quoted}</blockquote></div>`;
      const qt = msg.quotedText ?? htmlToText(msg.quotedHtml ?? "");
      text += msg.mode === "forward"
        ? `\n\n---------- Forwarded message ---------\nFrom: ${original.from.name} <${original.from.email}>\nDate: ${when}\nSubject: ${original.subject}\n\n${qt}`
        : `\n\nOn ${when}, ${original.from.name} <${original.from.email}> wrote:\n${this.quoteText(qt)}`;
    }
    const refs = original ? [original.references, original.messageIdHeader].filter(Boolean).join(" ").trim() || null : null;
    return {
      from: { name: account.name, email: account.email },
      to: msg.to,
      cc: msg.cc,
      bcc: msg.bcc,
      subject: msg.subject,
      text,
      html,
      attachments: msg.attachments.map((a) => ({ filename: a.filename, mimeType: a.mimeType || "application/octet-stream", data: Buffer.from(a.data, "base64") })),
      inReplyTo: msg.mode === "forward" ? null : original?.messageIdHeader ?? null,
      references: msg.mode === "forward" ? null : refs,
      threadId: msg.mode === "forward" ? null : original?.threadId ?? msg.inReplyTo?.threadId ?? null,
      replyToProviderId: original?.id ?? null,
      mode: msg.mode,
    };
  }

  // ---------- unsubscribe ----------

  async unsubscribe(threadId: string): Promise<UnsubscribeResult> {
    const account = this.accountRow();
    const metas = (await threadMetas(this.p, this.accountId, threadId)).filter((m) => m.from.email !== account.email);
    const latest = metas[metas.length - 1];
    if (!latest) return { method: "none", url: null, message: "No message from a sender to unsubscribe from." };
    if (!latest.bulk?.listUnsubscribe) await this.fetchBody(latest.id).catch(() => null);
    const meta = (await getMeta(this.p, this.accountId, latest.id)) ?? latest;
    const lu = parseListUnsubscribe(meta);
    if (!lu) return { method: "none", url: null, message: "This sender doesn't offer an unsubscribe link. Use a filter or block the sender in your mail provider." };
    if (account.provider === "demo") {
      return { method: lu.oneClick ? "one-click" : lu.mailto ? "mailto" : "url", url: lu.url, message: `Unsubscribed from ${meta.from.name} (demo mailbox: no request was sent).` };
    }
    if (lu.oneClick && lu.url) {
      const safe = await safePublicUrl(lu.url);
      if (safe) {
        const res = await fetch(safe, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: "List-Unsubscribe=One-Click", redirect: "manual", signal: AbortSignal.timeout(10_000) });
        if (res.status < 400) return { method: "one-click", url: null, message: `Unsubscribed from ${meta.from.name}.` };
      }
    }
    if (lu.mailto) {
      const u = new URL(lu.mailto);
      const to = decodeURIComponent(u.pathname);
      const subject = u.searchParams.get("subject") ?? "unsubscribe";
      const provider = await this.providerFor();
      await provider.send({
        from: { name: account.name, email: account.email }, to: [{ name: to, email: to.toLowerCase() }], cc: [], bcc: [],
        subject, text: u.searchParams.get("body") ?? "unsubscribe", html: `<p>${escapeHtml(u.searchParams.get("body") ?? "unsubscribe")}</p>`,
        attachments: [], inReplyTo: null, references: null, threadId: null, replyToProviderId: null, mode: "new",
      });
      return { method: "mailto", url: null, message: `Sent an unsubscribe request to ${meta.from.name}.` };
    }
    if (lu.url) return { method: "url", url: lu.url, message: `${meta.from.name} needs you to confirm on their website.` };
    return { method: "none", url: null, message: "No usable unsubscribe method found." };
  }

  // ---------- background runs (ports server/events.ts + sweeps) ----------

  startRun(init: Omit<Run, "id" | "startedAt" | "error" | "proposal" | "done" | "state"> & Partial<Run>): Run {
    const run: Run = { id: newId("run"), startedAt: new Date().toISOString(), error: null, proposal: null, done: 0, state: "running", ...init };
    this.runs.set(run.id, { run });
    this.emitEvent({ type: "run", run });
    return run;
  }

  updateRun(id: string, patch: Partial<Run>): Run | null {
    const entry = this.runs.get(id);
    if (!entry) return null;
    entry.run = { ...entry.run, ...patch };
    this.emitEvent({ type: "run", run: entry.run });
    return entry.run;
  }

  getRun(id: string): Run | null {
    return this.runs.get(id)?.run ?? null;
  }

  listRuns(): Run[] {
    const out: Run[] = [];
    const cutoff = Date.now() - 30 * 60_000;
    for (const [id, e] of this.runs) {
      const finished = e.run.state === "done" || e.run.state === "applied" || e.run.state === "cancelled" || e.run.state === "failed";
      if (finished && Date.parse(e.run.startedAt) < cutoff) {
        this.runs.delete(id);
        continue;
      }
      out.push(e.run);
    }
    return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  }

  setRunHandlers(id: string, h: { cancel?: () => void; apply?: () => Promise<void> }): void {
    const entry = this.runs.get(id);
    if (entry) Object.assign(entry, h);
  }

  /** Apply/dismiss/cancel from the runs panel (ports the /runs/:rid/:op route). */
  async runOp(id: string, op: string): Promise<{ ok: true }> {
    const entry = this.runs.get(id);
    if (!entry) throw new HttpError(404, "Run not found");
    if (op === "apply") {
      if (entry.run.state !== "review" || !entry.apply) throw new HttpError(409, "This run has nothing to apply.");
      void this.driveRun(id, entry.apply).catch((err: unknown) => this.updateRun(id, { state: "failed", error: err instanceof Error ? err.message : String(err) }));
      return { ok: true };
    }
    if (op === "dismiss" || op === "cancel") {
      this.updateRun(id, { state: "cancelled" });
      entry.cancel?.();
      return { ok: true };
    }
    throw new HttpError(400, "Unknown operation");
  }

  /** Runs the apply loop with crash recovery: the alarm resumes alive-but-stalled runs. */
  private async driveRun(id: string, apply: () => Promise<void>): Promise<void> {
    if (this.runLoopsAlive.has(id)) return;
    this.runLoopsAlive.add(id);
    try {
      await apply();
    } finally {
      this.runLoopsAlive.delete(id);
    }
  }

  /** Resume runs whose loop died mid-flight (DO eviction between chunks). */
  private resumeRuns(): void {
    for (const [id, e] of this.runs) {
      if (e.run.state !== "running" || !e.apply || this.runLoopsAlive.has(id)) continue;
      void this.driveRun(id, e.apply).catch((err: unknown) => this.updateRun(id, { state: "failed", error: err instanceof Error ? err.message : String(err) }));
    }
  }

  async startSweep(kind: SweepKind): Promise<Run> {
    const s = SWEEPS[kind];
    const now = Date.now();
    const rows = await sweepCandidates(this.p, this.accountId, s.view, s.extra(now));
    const senders = new Map<string, number>();
    for (const r of rows) senders.set(r.last_from_name, (senders.get(r.last_from_name) ?? 0) + 1);
    const top = [...senders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n} (${c})`).join(", ");
    const action: ThreadAction = kind === "stale-waiting" ? { type: "remind", at: new Date(now).toISOString() } : s.action;
    const run = this.startRun({
      accountId: this.accountId, kind: "sweep", title: s.title, total: rows.length,
      state: rows.length ? "review" : "done",
      detail: rows.length ? `${rows.length} thread${rows.length === 1 ? "" : "s"}${top ? ` · mostly ${top}` : ""}` : "Nothing to do.",
      proposal: rows.length ? { threadIds: rows.map((r) => r.id), action, summary: `${s.verb} ${rows.length} thread${rows.length === 1 ? "" : "s"}` } : null,
    });
    this.setRunHandlers(run.id, {
      apply: async () => {
        this.updateRun(run.id, { state: "running", done: 0 });
        let done = 0;
        let failed = 0;
        for (let i = 0; i < rows.length; i += 50) {
          const ids = rows.slice(i, i + 50).map((r) => r.id);
          try {
            await this.applyAction(ids, action);
          } catch {
            failed += ids.length;
          }
          done += ids.length;
          this.updateRun(run.id, { done });
          if (this.runs.get(run.id)?.run.state === "cancelled") return;
        }
        this.updateRun(run.id, { state: failed ? "failed" : "applied", detail: `${s.verb === "Bring back" ? "Brought back" : s.verb === "Archive" ? "Archived" : "Marked read"} ${done - failed} thread${done - failed === 1 ? "" : "s"}${failed ? ` · ${failed} failed` : ""}`, error: failed ? `${failed} threads failed` : null });
      },
    });
    return run;
  }

  /** Bulk action on a large selection, reported as a background run. */
  bulkAction(threadIds: string[], action: ThreadAction, label: string): Run {
    const run = this.startRun({ accountId: this.accountId, kind: "bulk", title: label, detail: `${threadIds.length} threads`, total: threadIds.length });
    this.setRunHandlers(run.id, {
      apply: async () => {
        let done = 0;
        let failed = 0;
        for (let i = 0; i < threadIds.length; i += 50) {
          const ids = threadIds.slice(i, i + 50);
          try {
            await this.applyAction(ids, action);
          } catch {
            failed += ids.length;
          }
          done += ids.length;
          this.updateRun(run.id, { done });
        }
        this.updateRun(run.id, { state: failed ? "failed" : "done", detail: `${done - failed} threads${failed ? ` · ${failed} failed` : ""}` });
      },
    });
    void this.driveRun(run.id, this.runs.get(run.id)!.apply!).catch(() => {});
    return run;
  }

  // ---------- plan steps (ports the /plan/run route) ----------

  async runPlanStep(threadId: string, kind: string, params: Record<string, string>): Promise<{ result: string; url: string | null }> {
    const days = Number(params.days ?? 1) || 1;
    const at = new Date(Date.now() + days * 86400_000);
    at.setHours(9, 0, 0, 0);
    switch (kind) {
      case "archive": await this.applyAction([threadId], { type: "archive" }); return { result: "Archived.", url: null };
      case "star": await this.applyAction([threadId], { type: "star" }); return { result: "Starred.", url: null };
      case "snooze": await this.applyAction([threadId], { type: "snooze", until: at.toISOString() }); return { result: `Snoozed until ${at.toLocaleString("en-US", { weekday: "short", hour: "numeric", minute: "2-digit" })}.`, url: null };
      case "remind": await this.applyAction([threadId], { type: "remind", at: at.toISOString() }); return { result: `Reminder set for ${at.toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric" })} if nobody replies.`, url: null };
      case "unsubscribe": { const r = await this.unsubscribe(threadId); return { result: r.message, url: r.url }; }
      case "label": {
        const provider = await this.providerFor();
        const folder = (await provider.listFolders()).find((f) => f.name.toLowerCase() === (params.label ?? "").toLowerCase());
        if (!folder) throw new HttpError(400, `No label named “${params.label}”.`);
        await this.applyAction([threadId], provider.folderStyle === "label" ? { type: "label", folderId: folder.id } : { type: "move", folderId: folder.id });
        return { result: `${provider.folderStyle === "label" ? "Labelled" : "Moved to"} ${folder.name}.`, url: null };
      }
      default: throw new HttpError(400, "That step runs in the composer.");
    }
  }
}

// ---------- module-level helpers (ported verbatim) ----------

interface StoredBody {
  html: string | null;
  text: string;
  uniqueText: string;
  uniqueHtml: string | null;
  attachments: AttachmentMeta[];
}

function toMessage(account: AccountPersistRow, meta: MessageMeta, body: StoredBody | null): Message {
  return {
    id: meta.id,
    threadId: meta.threadId,
    accountId: account.id,
    from: meta.from,
    to: meta.to,
    cc: meta.cc,
    bcc: meta.bcc,
    replyTo: meta.replyTo,
    date: meta.date,
    subject: meta.subject,
    snippet: meta.snippet,
    unread: meta.unread,
    starred: meta.starred,
    folders: meta.folders,
    fromMe: meta.from.email === account.email || meta.folders.includes("SENT"),
    attachments: body?.attachments ?? [],
    bodyLoaded: !!body,
    html: body?.html ?? null,
    text: body?.text ?? meta.snippet,
    uniqueText: body?.uniqueText ?? meta.snippet,
    uniqueHtml: body?.uniqueHtml ?? null,
    messageIdHeader: meta.messageIdHeader,
    references: meta.references,
    listUnsubscribe: parseListUnsubscribe(meta),
  };
}

function parseListUnsubscribe(meta: MessageMeta): Message["listUnsubscribe"] {
  const h = meta.bulk?.listUnsubscribe;
  if (!h) return null;
  const parts = [...h.matchAll(/<([^>]+)>/g)].map((m) => m[1].trim());
  if (!parts.length) parts.push(...h.split(",").map((s) => s.trim()));
  const mailto = parts.find((p) => p.toLowerCase().startsWith("mailto:")) ?? null;
  const url = parts.find((p) => /^https?:/i.test(p)) ?? null;
  return { mailto, url, oneClick: !!url && /one-click/i.test(meta.bulk?.listUnsubscribePost ?? "") };
}

function changeFor(action: ThreadAction): MessageChange | null {
  switch (action.type) {
    case "archive": return { kind: "archive" };
    case "inbox": return { kind: "inbox" };
    case "trash": return { kind: "trash" };
    case "spam": return { kind: "spam" };
    case "read": return { kind: "read", value: true };
    case "unread": return { kind: "read", value: false };
    case "star": return { kind: "starred", value: true };
    case "unstar": return { kind: "starred", value: false };
    case "label": return { kind: "addLabel", folderId: action.folderId };
    case "unlabel": return { kind: "removeLabel", folderId: action.folderId };
    case "move": return { kind: "move", folderId: action.folderId };
    case "snooze": return { kind: "archive" };
    case "unsnooze": return { kind: "inbox" };
    default: return null;
  }
}

const SYSTEM_PLACES = ["INBOX", "ARCHIVE", "TRASH", "SPAM"];

function localTransform(action: ThreadAction, folderStyle: "label" | "folder"): (m: MessageMeta, isLast: boolean) => MessageMeta | null {
  const without = (m: MessageMeta, drop: string[]) => m.folders.filter((f) => !drop.includes(f));
  return (m, isLast) => {
    switch (action.type) {
      case "archive":
      case "snooze":
        if (!m.folders.includes("INBOX")) return null;
        return { ...m, folders: [...without(m, ["INBOX"]), ...(m.folders.includes("SENT") ? [] : ["ARCHIVE"])] };
      case "inbox":
      case "unsnooze":
        return { ...m, folders: [...without(m, ["ARCHIVE", "TRASH", "SPAM"]), "INBOX"] };
      case "trash":
        return { ...m, folders: [...without(m, SYSTEM_PLACES), "TRASH"] };
      case "spam":
        return { ...m, folders: [...without(m, SYSTEM_PLACES), "SPAM"] };
      case "read":
        return m.unread ? { ...m, unread: false } : null;
      case "unread":
        return isLast ? { ...m, unread: true } : null;
      case "star":
        return isLast ? { ...m, starred: true } : null;
      case "unstar":
        return m.starred ? { ...m, starred: false } : null;
      case "label":
        return { ...m, folders: [...m.folders, action.folderId] };
      case "unlabel":
        return { ...m, folders: without(m, [action.folderId]) };
      case "move":
        if (folderStyle === "label") return { ...m, folders: [...without(m, ["INBOX"]), action.folderId] };
        return { ...m, folders: [...m.folders.filter((f) => f === "SENT" || f === "DRAFT"), action.folderId] };
      default:
        return null;
    }
  };
}

/** Which messages of a thread the provider call should touch. */
function targetIds(metas: MessageMeta[], action: ThreadAction): string[] {
  const last = metas[metas.length - 1];
  switch (action.type) {
    case "archive":
    case "snooze":
      return metas.filter((m) => m.folders.includes("INBOX")).map((m) => m.id);
    case "read":
      return metas.filter((m) => m.unread).map((m) => m.id);
    case "unread":
    case "star":
      return last ? [last.id] : [];
    case "unstar":
      return metas.filter((m) => m.starred).map((m) => m.id);
    default:
      return metas.map((m) => m.id);
  }
}

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}

/** Only POST to public HTTPS hosts: the URL comes from an email header.
 *  Workers implements node:dns over DNS-over-HTTPS; lookup() is not
 *  available, so this uses resolve4/resolve6. */
async function safePublicUrl(raw: string): Promise<URL | null> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "https:") return null;
  if (url.hostname.endsWith(".example") || url.hostname === "localhost") return null;
  try {
    const [v4, v6] = await Promise.all([
      dns.resolve4(url.hostname).catch(() => [] as string[]),
      dns.resolve6(url.hostname).catch(() => [] as string[]),
    ]);
    const addrs = [...v4, ...v6];
    if (!addrs.length || addrs.some((a) => isPrivateIp(a))) return null;
  } catch {
    return null;
  }
  return url;
}

const SWEEPS: Record<SweepKind, { title: string; view: "updates" | "fyi" | "waiting"; extra: (now: number) => (r: { unread_count: number; last_date_ms: number }) => boolean; action: ThreadAction; verb: string }> = {
  "updates-read": { title: "Mark updates as read", view: "updates", extra: () => (r) => r.unread_count > 0, action: { type: "read" }, verb: "Mark read" },
  "updates-archive": { title: "Archive updates older than 2 days", view: "updates", extra: (now) => (r) => r.last_date_ms < now - 2 * 86400_000, action: { type: "archive" }, verb: "Archive" },
  "fyi-archive": { title: "Archive read FYI older than a week", view: "fyi", extra: (now) => (r) => r.unread_count === 0 && r.last_date_ms < now - 7 * 86400_000, action: { type: "archive" }, verb: "Archive" },
  "stale-waiting": { title: "Nudge threads with no reply in 3 days", view: "waiting", extra: (now) => (r) => r.last_date_ms < now - 3 * 86400_000, action: { type: "remind", at: "" }, verb: "Bring back" },
};

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | "timeout"> =>
  Promise.race([p, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms))]);
