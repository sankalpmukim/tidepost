// Sync engine: initial index build, incremental polling, scheduled snoozes and reminders.
import { persist } from "./persist";
import { config } from "./config";
import { getAccount, providerFor, setCursor, setSync, type AccountRow } from "./accounts";
import { deleteMessages, getThreadSummary, invalidateContacts, setThreadState, threadMessageIds, upsertMessages } from "./store";
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
  if (err instanceof RateLimitedError) return "The mail provider asked us to slow down. Sync will retry shortly.";
  return err instanceof Error ? err.message : String(err);
}

export async function ingest(account: AccountRow, metas: MessageMeta[], deleted: string[] = []): Promise<string[]> {
  const me = account.email;
  const a = await upsertMessages(account.id, me, metas);
  const b = await deleteMessages(account.id, me, deleted);
  const ids = [...new Set([...a, ...b])];
  if (ids.length) {
    invalidateContacts(account.id);
    emit(account.user_id, { type: "threads", accountId: account.id, threadIds: ids });
  }
  return ids;
}

async function wipeIndex(accountId: string): Promise<void> {
  await persist().wipeIndex(accountId);
}

async function initialSync(account: AccountRow): Promise<void> {
  const provider = await providerFor(account);
  const run = startRun(account.user_id, {
    accountId: account.id, kind: "sync", title: "Indexing mailbox", detail: account.email, total: config.initialSyncMessages,
  });
  emit(account.user_id, { type: "sync", accountId: account.id, sync: await setSync(account.id, { phase: "initial", done: 0, total: config.initialSyncMessages, error: null }) });
  let lastEmit = 0;
  const result = await provider.initialSync({
    maxMessages: config.initialSyncMessages,
    onPage: async (page, progress) => {
      await ingest(account, page.messages, page.deleted);
      const sync = await setSync(account.id, { phase: "initial", done: progress.done, total: progress.total });
      if (Date.now() - lastEmit > 400 || progress.done >= progress.total) {
        lastEmit = Date.now();
        emit(account.user_id, { type: "sync", accountId: account.id, sync });
        updateRun(run.id, { done: progress.done, total: progress.total, detail: `${progress.done.toLocaleString()} of ${progress.total.toLocaleString()} messages` });
      }
    },
  });
  await setCursor(account.id, result.cursor);
  const sync = await setSync(account.id, { phase: "idle", lastSyncedAt: new Date().toISOString(), error: null });
  emit(account.user_id, { type: "sync", accountId: account.id, sync });
  emit(account.user_id, { type: "folders", accountId: account.id });
  updateRun(run.id, { state: "done", detail: `${sync.done.toLocaleString()} messages indexed` });
}

async function incremental(account: AccountRow): Promise<void> {
  const provider = await providerFor(account);
  if (!account.cursor) return initialSync(account);
  const res = await provider.changes(account.cursor);
  if (res.resetRequired) {
    await setCursor(account.id, null);
    return initialSync({ ...account, cursor: null });
  }
  const ids = await ingest(account, res.messages, res.deleted);
  await setCursor(account.id, res.cursor);
  const sync = await setSync(account.id, { phase: "idle", lastSyncedAt: new Date().toISOString(), error: null });
  emit(account.user_id, { type: "sync", accountId: account.id, sync });
  if (ids.length) emit(account.user_id, { type: "folders", accountId: account.id });
}

/** Run a sync now (initial when needed). Concurrent calls share one run. */
export function syncNow(accountId: string): Promise<void> {
  const r = rt(accountId);
  if (r.syncing) return r.syncing;
  if (Date.now() < r.backoffUntil) return Promise.resolve();
  r.syncing = (async () => {
    const account = await getAccount(accountId);
    if (!account) return;
    try {
      // The in-memory demo mailbox is rebuilt per process; Convex keeps a durable index.
      if (!r.initialized && account.provider === "demo" && (process.env.TIDEPOST_STORE === "memory" || !process.env.CONVEX_URL)) {
        await wipeIndex(account.id);
        await setCursor(account.id, null);
        account.cursor = null;
      }
      r.initialized = true;
      await incremental(account);
    } catch (err) {
      const message = describe(err);
      if (err instanceof RateLimitedError) r.backoffUntil = Date.now() + err.retryAfterMs;
      else r.backoffUntil = Date.now() + 30_000;
      const sync = await setSync(accountId, { phase: "error", error: message });
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
  await ingest(account, metas);
}

// ---------- scheduler: snoozes and follow-up reminders ----------

async function wakeDue(): Promise<void> {
  const now = Date.now();
  const due = await persist().dueThreadStates(now);
  for (const d of due) {
    const account = await getAccount(d.account_id);
    if (!account) continue;
    try {
      const provider = await providerFor(account);
      const ids = await threadMessageIds(d.account_id, d.thread_id);
      if (d.snoozed_until && d.snoozed_until <= now) {
        if (ids.length) {
          await provider.modify(ids, { kind: "inbox" });
          await provider.modify([ids[0]], { kind: "read", value: false });
        }
        await setThreadState(d.account_id, d.thread_id, { snoozed_until: null });
      }
      if (d.remind_at && d.remind_at <= now) {
        const t = await getThreadSummary(d.account_id, d.thread_id);
        if (t?.lastFromMe) {
          if (ids.length) await provider.modify(ids, { kind: "inbox" });
          await setThreadState(d.account_id, d.thread_id, { remind_at: null, nudged: 1 });
        } else {
          await setThreadState(d.account_id, d.thread_id, { remind_at: null });
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
