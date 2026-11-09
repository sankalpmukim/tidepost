// Sync engine: initial index build, incremental polling, scheduled snoozes and reminders.
import { db } from "./db";
import { config } from "./config";
import { getAccount, providerFor, setCursor, setSync, type AccountRow } from "./accounts";
import { deleteMessages, invalidateContacts, setThreadState, upsertMessages } from "./store";
import { emit, startRun, updateRun } from "./events";
import { AuthExpiredError, RateLimitedError, type MessageMeta } from "./providers/types";

interface Runtime {
  syncing: Promise<void> | null;
  timer: NodeJS.Timeout | null;
  initialized: boolean;
  backoffUntil: number;
}

const runtimes = new Map<string, Runtime>();

function rt(accountId: string): Runtime {
  let r = runtimes.get(accountId);
  if (!r) runtimes.set(accountId, (r = { syncing: null, timer: null, initialized: false, backoffUntil: 0 }));
  return r;
}

function describe(err: unknown): string {
  if (err instanceof AuthExpiredError) return err.message;
  if (err instanceof RateLimitedError) return "The mail provider is rate limiting requests. Sync resumes automatically.";
  return err instanceof Error ? err.message : String(err);
}

export function ingest(account: AccountRow, metas: MessageMeta[], deleted: string[] = []): string[] {
  const me = account.email;
  const a = upsertMessages(account.id, me, metas);
  const b = deleteMessages(account.id, me, deleted);
  const ids = [...new Set([...a, ...b])];
  if (ids.length) {
    invalidateContacts(account.id);
    emit(account.user_id, { type: "threads", accountId: account.id, threadIds: ids });
  }
  return ids;
}

function wipeIndex(accountId: string): void {
  db.prepare("DELETE FROM search_fts WHERE account_id=?").run(accountId);
  db.prepare("DELETE FROM messages WHERE account_id=?").run(accountId);
  db.prepare("DELETE FROM threads WHERE account_id=?").run(accountId);
  db.prepare("DELETE FROM bodies WHERE account_id=?").run(accountId);
}

async function initialSync(account: AccountRow): Promise<void> {
  const provider = await providerFor(account);
  const run = startRun(account.user_id, {
    accountId: account.id, kind: "sync", title: "Indexing mailbox", detail: account.email, total: config.initialSyncMessages,
  });
  emit(account.user_id, { type: "sync", accountId: account.id, sync: setSync(account.id, { phase: "initial", done: 0, total: config.initialSyncMessages, error: null }) });
  let lastEmit = 0;
  const result = await provider.initialSync({
    maxMessages: config.initialSyncMessages,
    onPage: (page, progress) => {
      ingest(account, page.messages, page.deleted);
      const sync = setSync(account.id, { phase: "initial", done: progress.done, total: progress.total });
      if (Date.now() - lastEmit > 400 || progress.done >= progress.total) {
        lastEmit = Date.now();
        emit(account.user_id, { type: "sync", accountId: account.id, sync });
        updateRun(run.id, { done: progress.done, total: progress.total, detail: `${progress.done.toLocaleString()} of ${progress.total.toLocaleString()} messages` });
      }
    },
  });
  setCursor(account.id, result.cursor);
  const sync = setSync(account.id, { phase: "idle", lastSyncedAt: new Date().toISOString(), error: null });
  emit(account.user_id, { type: "sync", accountId: account.id, sync });
  emit(account.user_id, { type: "folders", accountId: account.id });
  updateRun(run.id, { state: "done", detail: `${sync.done.toLocaleString()} messages indexed` });
}

async function incremental(account: AccountRow): Promise<void> {
  const provider = await providerFor(account);
  if (!account.cursor) return initialSync(account);
  const res = await provider.changes(account.cursor);
  if (res.resetRequired) {
    setCursor(account.id, null);
    return initialSync({ ...account, cursor: null });
  }
  const ids = ingest(account, res.messages, res.deleted);
  setCursor(account.id, res.cursor);
  const sync = setSync(account.id, { phase: "idle", lastSyncedAt: new Date().toISOString(), error: null });
  emit(account.user_id, { type: "sync", accountId: account.id, sync });
  if (ids.length) emit(account.user_id, { type: "folders", accountId: account.id });
}

/** Run a sync now (initial when needed). Concurrent calls share one run. */
export function syncNow(accountId: string): Promise<void> {
  const r = rt(accountId);
  if (r.syncing) return r.syncing;
  if (Date.now() < r.backoffUntil) return Promise.resolve();
  r.syncing = (async () => {
    const account = getAccount(accountId);
    if (!account) return;
    try {
      // The demo mailbox lives in memory; rebuild the index once per server start.
      if (!r.initialized && account.provider === "demo") {
        wipeIndex(account.id);
        setCursor(account.id, null);
        account.cursor = null;
      }
      r.initialized = true;
      await incremental(account);
    } catch (err) {
      const message = describe(err);
      if (err instanceof RateLimitedError) r.backoffUntil = Date.now() + err.retryAfterMs;
      else r.backoffUntil = Date.now() + 30_000;
      const sync = setSync(accountId, { phase: "error", error: message });
      emit(account.user_id, { type: "sync", accountId, sync });
      if (err instanceof AuthExpiredError) emit(account.user_id, { type: "auth", accountId, message });
      console.error(`[sync] ${account.provider}:${account.email}:`, message);
    } finally {
      r.syncing = null;
    }
  })();
  return r.syncing;
}

export function startPolling(accountId: string): void {
  const r = rt(accountId);
  if (r.timer) return;
  void syncNow(accountId);
  r.timer = setInterval(() => void syncNow(accountId), config.pollSeconds * 1000);
  r.timer.unref();
}

export function stopPolling(accountId: string): void {
  const r = runtimes.get(accountId);
  if (r?.timer) clearInterval(r.timer);
  runtimes.delete(accountId);
}

/** Fetch the full thread from the provider (covers messages older than the synced window). */
export async function refreshThread(account: AccountRow, threadId: string): Promise<void> {
  const provider = await providerFor(account);
  const metas = await provider.threadMessages(threadId);
  ingest(account, metas);
}

// ---------- scheduler: snoozes and follow-up reminders ----------

async function wakeDue(): Promise<void> {
  const now = Date.now();
  const due = db
    .prepare("SELECT account_id, thread_id, snoozed_until, remind_at FROM thread_state WHERE (snoozed_until IS NOT NULL AND snoozed_until <= ?) OR (remind_at IS NOT NULL AND remind_at <= ?)")
    .all(now, now) as { account_id: string; thread_id: string; snoozed_until: number | null; remind_at: number | null }[];
  for (const d of due) {
    const account = getAccount(d.account_id);
    if (!account) continue;
    try {
      const provider = await providerFor(account);
      const ids = (db.prepare("SELECT id FROM messages WHERE account_id=? AND thread_id=? ORDER BY date_ms DESC").all(d.account_id, d.thread_id) as { id: string }[]).map((r) => r.id);
      if (d.snoozed_until && d.snoozed_until <= now) {
        if (ids.length) {
          await provider.modify(ids, { kind: "inbox" });
          await provider.modify([ids[0]], { kind: "read", value: false });
        }
        setThreadState(d.account_id, d.thread_id, { snoozed_until: null });
      }
      if (d.remind_at && d.remind_at <= now) {
        const t = db.prepare("SELECT last_from_me FROM threads WHERE account_id=? AND id=?").get(d.account_id, d.thread_id) as { last_from_me: number } | undefined;
        if (t?.last_from_me) {
          if (ids.length) await provider.modify(ids, { kind: "inbox" });
          setThreadState(d.account_id, d.thread_id, { remind_at: null, nudged: 1 });
        } else {
          setThreadState(d.account_id, d.thread_id, { remind_at: null });
        }
      }
      await syncNow(d.account_id);
      emit(account.user_id, { type: "threads", accountId: d.account_id, threadIds: [d.thread_id] });
    } catch (err) {
      console.error("[scheduler]", describe(err));
    }
  }
}

let schedulerTimer: NodeJS.Timeout | null = null;
export function startScheduler(): void {
  if (schedulerTimer) return;
  schedulerTimer = setInterval(() => void wakeDue(), 20_000);
  schedulerTimer.unref();
  void wakeDue();
}
