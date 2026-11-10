import { MAX_BODIES_PER_ACCOUNT, MAX_MESSAGES_PER_ACCOUNT, MAX_SEARCH_SCAN, MAX_THREADS_PER_ACCOUNT } from "./limits";
import type {
  AccountPersistRow,
  MessagePersistRow,
  Persist,
  QueuePersistRow,
  SessionRow,
  ThreadPersistRow,
  ThreadStateRow,
  UserRow,
} from "./persist";
import type { ProviderKind } from "../shared/types";

const key = (accountId: string, id: string) => `${accountId}\0${id}`;

export function createMemoryPersist(): Persist {
  const users = new Map<string, UserRow>();
  const sessions = new Map<string, SessionRow>();
  const accounts = new Map<string, AccountPersistRow>();
  const messages = new Map<string, MessagePersistRow>();
  const threads = new Map<string, ThreadPersistRow>();
  const states = new Map<string, ThreadStateRow>();
  const bodies = new Map<string, { json: string; accessedAt: number }>();
  const queue = new Map<string, QueuePersistRow>();

  const emptyState = (accountId: string, threadId: string): ThreadStateRow => ({
    account_id: accountId,
    thread_id: threadId,
    pinned: 0,
    snoozed_until: null,
    remind_at: null,
    remind_set_at: null,
    nudged: 0,
    waiting_dismissed_at: null,
    brief: null,
  });

  return {
    async insertUser(row) {
      users.set(row.id, row);
    },
    async getUser(id) {
      return users.get(id) ?? null;
    },
    async updateUserSettings(id, settings) {
      const row = users.get(id);
      if (row) users.set(id, { ...row, settings });
    },
    async insertSession(row) {
      sessions.set(row.id, row);
    },
    async getSession(id) {
      return sessions.get(id) ?? null;
    },
    async deleteSession(id) {
      sessions.delete(id);
    },
    async putAccount(row) {
      accounts.set(row.id, row);
    },
    async getAccount(id) {
      return accounts.get(id) ?? null;
    },
    async listAccounts(userId) {
      return [...accounts.values()].filter((a) => a.user_id === userId).sort((a, b) => a.created_at - b.created_at);
    },
    async findAccountByIdentity(provider: ProviderKind, email: string) {
      return [...accounts.values()].find((a) => a.provider === provider && a.email === email) ?? null;
    },
    async findAccountByUserIdentity(userId, provider, email) {
      return [...accounts.values()].find((a) => a.user_id === userId && a.provider === provider && a.email === email) ?? null;
    },
    async removeAccount(id) {
      accounts.delete(id);
      await this.wipeIndex(id);
    },
    async putMessages(rows) {
      const prev: { id: string; thread_id: string }[] = [];
      for (const row of rows) {
        const k = key(row.account_id, row.id);
        const existing = messages.get(k);
        if (existing) {
          prev.push({ id: existing.id, thread_id: existing.thread_id });
          messages.set(k, {
            ...row,
            has_att: existing.has_att || row.has_att,
            search_text: row.search_text || existing.search_text,
          });
        } else {
          messages.set(k, row);
        }
      }
      return prev;
    },
    async deleteMessages(accountId, ids) {
      const prev: { id: string; thread_id: string }[] = [];
      for (const id of ids) {
        const k = key(accountId, id);
        const existing = messages.get(k);
        if (!existing) continue;
        prev.push({ id: existing.id, thread_id: existing.thread_id });
        messages.delete(k);
        bodies.delete(k);
      }
      return prev;
    },
    async getMessage(accountId, id) {
      return messages.get(key(accountId, id)) ?? null;
    },
    async messagesForThread(accountId, threadId) {
      return [...messages.values()]
        .filter((m) => m.account_id === accountId && m.thread_id === threadId)
        .sort((a, b) => a.date_ms - b.date_ms);
    },
    async listRecentMessages(accountId, limit) {
      return [...messages.values()]
        .filter((m) => m.account_id === accountId)
        .sort((a, b) => b.date_ms - a.date_ms)
        .slice(0, Math.min(MAX_SEARCH_SCAN, limit));
    },
    async touchSearchText(accountId, messageId, searchText) {
      const k = key(accountId, messageId);
      const row = messages.get(k);
      if (row) messages.set(k, { ...row, search_text: searchText.slice(0, 8000) });
    },
    async pruneOldestMessages(accountId) {
      const rows = [...messages.values()].filter((m) => m.account_id === accountId).sort((a, b) => b.date_ms - a.date_ms);
      for (const row of rows.slice(MAX_MESSAGES_PER_ACCOUNT)) messages.delete(key(row.account_id, row.id));
    },
    async putThreads(rows) {
      for (const row of rows) threads.set(key(row.account_id, row.id), row);
    },
    async deleteThread(accountId, threadId) {
      threads.delete(key(accountId, threadId));
    },
    async getThread(accountId, threadId) {
      return threads.get(key(accountId, threadId)) ?? null;
    },
    async listThreads(accountId) {
      return [...threads.values()]
        .filter((t) => t.account_id === accountId)
        .sort((a, b) => b.last_date_ms - a.last_date_ms)
        .slice(0, MAX_THREADS_PER_ACCOUNT);
    },
    async getThreadState(accountId, threadId) {
      return states.get(key(accountId, threadId)) ?? null;
    },
    async listThreadStates(accountId) {
      return [...states.values()].filter((s) => s.account_id === accountId);
    },
    async patchThreadState(accountId, threadId, patch) {
      const k = key(accountId, threadId);
      const current = states.get(k) ?? emptyState(accountId, threadId);
      states.set(k, { ...current, ...patch });
    },
    async dueThreadStates(now) {
      return [...states.values()].filter(
        (s) => (s.snoozed_until !== null && s.snoozed_until <= now) || (s.remind_at !== null && s.remind_at <= now),
      );
    },
    async getBody(accountId, messageId) {
      const row = bodies.get(key(accountId, messageId));
      return row?.json ?? null;
    },
    async putBody(accountId, messageId, json) {
      bodies.set(key(accountId, messageId), { json, accessedAt: Date.now() });
      const mine = [...bodies.entries()].filter(([k]) => k.startsWith(`${accountId}\0`));
      if (mine.length > MAX_BODIES_PER_ACCOUNT) {
        mine.sort((a, b) => a[1].accessedAt - b[1].accessedAt);
        for (const [k] of mine.slice(0, mine.length - MAX_BODIES_PER_ACCOUNT)) bodies.delete(k);
      }
    },
    async wipeIndex(accountId) {
      for (const k of [...messages.keys()]) if (k.startsWith(`${accountId}\0`)) messages.delete(k);
      for (const k of [...threads.keys()]) if (k.startsWith(`${accountId}\0`)) threads.delete(k);
      for (const k of [...states.keys()]) if (k.startsWith(`${accountId}\0`)) states.delete(k);
      for (const k of [...bodies.keys()]) if (k.startsWith(`${accountId}\0`)) bodies.delete(k);
    },
    async putQueue(row) {
      queue.set(row.id, row);
    },
    async getQueue(id) {
      return queue.get(id) ?? null;
    },
    async updateQueue(id, patch, expectedStatus) {
      const row = queue.get(id);
      if (!row) return false;
      if (expectedStatus && row.status !== expectedStatus) return false;
      queue.set(id, { ...row, ...patch });
      return true;
    },
    async dueQueue(now) {
      return [...queue.values()].filter((r) => r.status === "queued" && r.send_at <= now).sort((a, b) => a.send_at - b.send_at);
    },
    async listQueueForAccounts(accountIds, since) {
      const set = new Set(accountIds);
      return [...queue.values()]
        .filter((r) => set.has(r.account_id) && (r.status === "queued" || r.status === "sending" || r.status === "failed" || r.created_at > since))
        .sort((a, b) => b.created_at - a.created_at)
        .slice(0, 50);
    },
    async requeueSending() {
      for (const [id, row] of queue) if (row.status === "sending") queue.set(id, { ...row, status: "queued" });
    },
  };
}
