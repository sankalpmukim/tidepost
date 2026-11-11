// MailboxPersist over a Durable Object's SQLite storage. One MailboxDO owns
// one account's rows, so every table is keyed only by message/thread id.
// All writes issued within one DO event (RPC call or alarm) commit
// atomically per the Durable Object consistency model.
import type {
  MailboxPersist,
  MessagePersistRow,
  QueuePersistRow,
  ThreadPersistRow,
  ThreadStateRow,
} from "../persist";
import { MAX_BODIES_PER_ACCOUNT, MAX_MESSAGES_PER_ACCOUNT, MAX_THREADS_PER_ACCOUNT } from "../limits";

const MSG_COLS = "account_id, id, thread_id, from_name, from_email, to_json, cc_json, bcc_json, reply_to_json, subject, snippet, date_ms, unread, starred, folders, has_att, msgid_hdr, in_reply_to, refs, bulk_json, category, importance, size, search_text";
const THR_COLS = "account_id, id, subject, snippet, participants, last_from_name, last_from_email, last_from_me, last_date_ms, first_date_ms, message_count, unread_count, starred, has_att, folders, in_inbox, to_me_direct, is_bulk, audience";

export function createSqliteMailbox(sql: SqlStorage): MailboxPersist {
  sql.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      thread_id TEXT NOT NULL,
      from_name TEXT NOT NULL DEFAULT '',
      from_email TEXT NOT NULL DEFAULT '',
      to_json TEXT NOT NULL DEFAULT '[]',
      cc_json TEXT NOT NULL DEFAULT '[]',
      bcc_json TEXT NOT NULL DEFAULT '[]',
      reply_to_json TEXT NOT NULL DEFAULT '[]',
      subject TEXT NOT NULL DEFAULT '',
      snippet TEXT NOT NULL DEFAULT '',
      date_ms REAL NOT NULL DEFAULT 0,
      unread INTEGER NOT NULL DEFAULT 0,
      starred INTEGER NOT NULL DEFAULT 0,
      folders TEXT NOT NULL DEFAULT '',
      has_att INTEGER NOT NULL DEFAULT 0,
      msgid_hdr TEXT,
      in_reply_to TEXT,
      refs TEXT,
      bulk_json TEXT NOT NULL DEFAULT '{}',
      category TEXT,
      importance TEXT NOT NULL DEFAULT 'normal',
      size REAL NOT NULL DEFAULT 0,
      search_text TEXT NOT NULL DEFAULT ''
    );
    CREATE INDEX IF NOT EXISTS idx_messages_thread ON messages(thread_id);
    CREATE INDEX IF NOT EXISTS idx_messages_date ON messages(date_ms DESC);

    CREATE TABLE IF NOT EXISTS threads (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      subject TEXT NOT NULL DEFAULT '',
      snippet TEXT NOT NULL DEFAULT '',
      participants TEXT NOT NULL DEFAULT '[]',
      last_from_name TEXT NOT NULL DEFAULT '',
      last_from_email TEXT NOT NULL DEFAULT '',
      last_from_me INTEGER NOT NULL DEFAULT 0,
      last_date_ms REAL NOT NULL DEFAULT 0,
      first_date_ms REAL NOT NULL DEFAULT 0,
      message_count INTEGER NOT NULL DEFAULT 0,
      unread_count INTEGER NOT NULL DEFAULT 0,
      starred INTEGER NOT NULL DEFAULT 0,
      has_att INTEGER NOT NULL DEFAULT 0,
      folders TEXT NOT NULL DEFAULT '',
      in_inbox INTEGER NOT NULL DEFAULT 0,
      to_me_direct INTEGER NOT NULL DEFAULT 0,
      is_bulk INTEGER NOT NULL DEFAULT 0,
      audience INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_threads_last_date ON threads(last_date_ms DESC);

    CREATE TABLE IF NOT EXISTS thread_states (
      thread_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      snoozed_until REAL,
      remind_at REAL,
      remind_set_at REAL,
      nudged INTEGER NOT NULL DEFAULT 0,
      waiting_dismissed_at REAL,
      brief TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_states_snoozed ON thread_states(snoozed_until);
    CREATE INDEX IF NOT EXISTS idx_states_remind ON thread_states(remind_at);

    CREATE TABLE IF NOT EXISTS bodies (
      message_id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      json TEXT NOT NULL,
      accessed_at REAL NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_bodies_access ON bodies(accessed_at DESC);

    CREATE TABLE IF NOT EXISTS send_queue (
      id TEXT PRIMARY KEY,
      account_id TEXT NOT NULL,
      payload TEXT NOT NULL,
      send_at REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'queued',
      error TEXT,
      thread_id TEXT,
      created_at REAL NOT NULL,
      display_subject TEXT,
      display_to_json TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_queue_due ON send_queue(status, send_at);
    CREATE INDEX IF NOT EXISTS idx_queue_created ON send_queue(created_at DESC);
  `);

  const msg = (r: Record<string, unknown>): MessagePersistRow => ({
    account_id: String(r.account_id),
    id: String(r.id),
    thread_id: String(r.thread_id),
    from_name: String(r.from_name ?? ""),
    from_email: String(r.from_email ?? ""),
    to_json: String(r.to_json ?? "[]"),
    cc_json: String(r.cc_json ?? "[]"),
    bcc_json: String(r.bcc_json ?? "[]"),
    reply_to_json: String(r.reply_to_json ?? "[]"),
    subject: String(r.subject ?? ""),
    snippet: String(r.snippet ?? ""),
    date_ms: Number(r.date_ms ?? 0),
    unread: Number(r.unread ?? 0),
    starred: Number(r.starred ?? 0),
    folders: String(r.folders ?? ""),
    has_att: Number(r.has_att ?? 0),
    msgid_hdr: (r.msgid_hdr as string | null) ?? null,
    in_reply_to: (r.in_reply_to as string | null) ?? null,
    refs: (r.refs as string | null) ?? null,
    bulk_json: String(r.bulk_json ?? "{}"),
    category: (r.category as string | null) ?? null,
    importance: String(r.importance ?? "normal"),
    size: Number(r.size ?? 0),
    search_text: String(r.search_text ?? ""),
  });

  const thr = (r: Record<string, unknown>): ThreadPersistRow => ({
    account_id: String(r.account_id),
    id: String(r.id),
    subject: String(r.subject ?? ""),
    snippet: String(r.snippet ?? ""),
    participants: String(r.participants ?? "[]"),
    last_from_name: String(r.last_from_name ?? ""),
    last_from_email: String(r.last_from_email ?? ""),
    last_from_me: Number(r.last_from_me ?? 0),
    last_date_ms: Number(r.last_date_ms ?? 0),
    first_date_ms: Number(r.first_date_ms ?? 0),
    message_count: Number(r.message_count ?? 0),
    unread_count: Number(r.unread_count ?? 0),
    starred: Number(r.starred ?? 0),
    has_att: Number(r.has_att ?? 0),
    folders: String(r.folders ?? ""),
    in_inbox: Number(r.in_inbox ?? 0),
    to_me_direct: Number(r.to_me_direct ?? 0),
    is_bulk: Number(r.is_bulk ?? 0),
    audience: Number(r.audience ?? 0),
  });

  const state = (r: Record<string, unknown>): ThreadStateRow => ({
    account_id: String(r.account_id),
    thread_id: String(r.thread_id),
    pinned: Number(r.pinned ?? 0),
    snoozed_until: (r.snoozed_until as number | null) ?? null,
    remind_at: (r.remind_at as number | null) ?? null,
    remind_set_at: (r.remind_set_at as number | null) ?? null,
    nudged: Number(r.nudged ?? 0),
    waiting_dismissed_at: (r.waiting_dismissed_at as number | null) ?? null,
    brief: (r.brief as string | null) ?? null,
  });

  const queue = (r: Record<string, unknown>): QueuePersistRow => ({
    id: String(r.id),
    account_id: String(r.account_id),
    payload: String(r.payload),
    send_at: Number(r.send_at),
    status: String(r.status) as QueuePersistRow["status"],
    error: (r.error as string | null) ?? null,
    thread_id: (r.thread_id as string | null) ?? null,
    created_at: Number(r.created_at),
    display_subject: (r.display_subject as string | undefined) ?? undefined,
    display_to_json: (r.display_to_json as string | undefined) ?? undefined,
  });

  const all = (q: SqlStorageCursor<Record<string, SqlStorageValue>>): Record<string, unknown>[] => q.toArray() as unknown as Record<string, unknown>[];
  const one = (q: SqlStorageCursor<Record<string, SqlStorageValue>>): Record<string, unknown> | null => (q.toArray() as unknown as Record<string, unknown>[])[0] ?? null;

  return {
    async putMessages(rows) {
      const prev: { id: string; thread_id: string }[] = [];
      for (const row of rows) {
        const existing = one(sql.exec(`SELECT id, thread_id FROM messages WHERE id = ?`, row.id));
        if (existing) prev.push({ id: String(existing.id), thread_id: String(existing.thread_id) });
        // Keep enriched fields when a re-sync brings back plainer metadata.
        const hasAtt = existing ? Number((one(sql.exec(`SELECT has_att FROM messages WHERE id = ?`, row.id)) ?? { has_att: 0 }).has_att) || row.has_att : row.has_att;
        const searchText = row.search_text || (existing ? String((one(sql.exec(`SELECT search_text FROM messages WHERE id = ?`, row.id)) ?? { search_text: "" }).search_text) : "");
        sql.exec(
          `INSERT INTO messages (${MSG_COLS}) VALUES (${MSG_COLS.split(", ").map(() => "?").join(", ")})
           ON CONFLICT(id) DO UPDATE SET ${MSG_COLS.split(", ").filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ")}`,
          row.account_id, row.id, row.thread_id, row.from_name, row.from_email, row.to_json, row.cc_json, row.bcc_json, row.reply_to_json,
          row.subject, row.snippet, row.date_ms, row.unread, row.starred, row.folders, hasAtt, row.msgid_hdr, row.in_reply_to, row.refs,
          row.bulk_json, row.category, row.importance, row.size, searchText,
        );
      }
      return prev;
    },
    async deleteMessages(_accountId, ids) {
      const prev: { id: string; thread_id: string }[] = [];
      for (const id of ids) {
        const existing = one(sql.exec(`SELECT id, thread_id FROM messages WHERE id = ?`, id));
        if (!existing) continue;
        prev.push({ id: String(existing.id), thread_id: String(existing.thread_id) });
        sql.exec(`DELETE FROM messages WHERE id = ?`, id);
        sql.exec(`DELETE FROM bodies WHERE message_id = ?`, id);
      }
      return prev;
    },
    async getMessage(_accountId, id) {
      const r = one(sql.exec(`SELECT ${MSG_COLS} FROM messages WHERE id = ?`, id));
      return r ? msg(r) : null;
    },
    async messagesForThread(_accountId, threadId) {
      return all(sql.exec(`SELECT ${MSG_COLS} FROM messages WHERE thread_id = ? ORDER BY date_ms ASC, id ASC`, threadId)).map(msg);
    },
    async listRecentMessages(_accountId, limit) {
      return all(sql.exec(`SELECT ${MSG_COLS} FROM messages ORDER BY date_ms DESC LIMIT ?`, Math.min(1000, limit))).map(msg);
    },
    async touchSearchText(_accountId, messageId, searchText) {
      sql.exec(`UPDATE messages SET search_text = ? WHERE id = ?`, searchText.slice(0, 8000), messageId);
    },
    async pruneOldestMessages(_accountId) {
      const edge = one(sql.exec(`SELECT date_ms FROM messages ORDER BY date_ms DESC LIMIT 1 OFFSET ?`, MAX_MESSAGES_PER_ACCOUNT - 1));
      if (!edge) return;
      const threshold = Number(edge.date_ms);
      sql.exec(`DELETE FROM messages WHERE date_ms < ?`, threshold);
      sql.exec(`DELETE FROM bodies WHERE message_id NOT IN (SELECT id FROM messages)`);
    },
    async putThreads(rows) {
      for (const row of rows) {
        sql.exec(
          `INSERT INTO threads (${THR_COLS}) VALUES (${THR_COLS.split(", ").map(() => "?").join(", ")})
           ON CONFLICT(id) DO UPDATE SET ${THR_COLS.split(", ").filter((c) => c !== "id").map((c) => `${c} = excluded.${c}`).join(", ")}`,
          row.account_id, row.id, row.subject, row.snippet, row.participants, row.last_from_name, row.last_from_email, row.last_from_me,
          row.last_date_ms, row.first_date_ms, row.message_count, row.unread_count, row.starred, row.has_att, row.folders,
          row.in_inbox, row.to_me_direct, row.is_bulk, row.audience,
        );
      }
    },
    async deleteThread(_accountId, threadId) {
      sql.exec(`DELETE FROM threads WHERE id = ?`, threadId);
    },
    async getThread(_accountId, threadId) {
      const r = one(sql.exec(`SELECT ${THR_COLS} FROM threads WHERE id = ?`, threadId));
      return r ? thr(r) : null;
    },
    async listThreads(_accountId) {
      return all(sql.exec(`SELECT ${THR_COLS} FROM threads ORDER BY last_date_ms DESC LIMIT ?`, MAX_THREADS_PER_ACCOUNT)).map(thr);
    },
    async getThreadState(_accountId, threadId) {
      const r = one(sql.exec(`SELECT * FROM thread_states WHERE thread_id = ?`, threadId));
      return r ? state(r) : null;
    },
    async listThreadStates(_accountId) {
      return all(sql.exec(`SELECT * FROM thread_states LIMIT ?`, MAX_THREADS_PER_ACCOUNT)).map(state);
    },
    async patchThreadState(_accountId, threadId, patch) {
      sql.exec(
        `INSERT INTO thread_states (thread_id, account_id, pinned, snoozed_until, remind_at, remind_set_at, nudged, waiting_dismissed_at, brief)
         VALUES (?, ?, 0, NULL, NULL, NULL, 0, NULL, NULL)
         ON CONFLICT(thread_id) DO NOTHING`,
        threadId, _accountId,
      );
      const sets: string[] = [];
      const vals: unknown[] = [];
      const col = (v: unknown, name: string) => {
        if (v === undefined) return;
        sets.push(`${name} = ?`);
        vals.push(v);
      };
      col(patch.pinned, "pinned");
      col(patch.snoozed_until, "snoozed_until");
      col(patch.remind_at, "remind_at");
      col(patch.remind_set_at, "remind_set_at");
      col(patch.nudged, "nudged");
      col(patch.waiting_dismissed_at, "waiting_dismissed_at");
      col(patch.brief, "brief");
      if (sets.length) sql.exec(`UPDATE thread_states SET ${sets.join(", ")} WHERE thread_id = ?`, ...vals, threadId);
    },
    async dueThreadStates(now) {
      return all(
        sql.exec(`SELECT * FROM thread_states WHERE (snoozed_until IS NOT NULL AND snoozed_until <= ?) OR (remind_at IS NOT NULL AND remind_at <= ?)`, now, now),
      ).map(state);
    },
    async getBody(_accountId, messageId) {
      sql.exec(`UPDATE bodies SET accessed_at = ? WHERE message_id = ?`, Date.now(), messageId);
      const r = one(sql.exec(`SELECT json FROM bodies WHERE message_id = ?`, messageId));
      return r ? String(r.json) : null;
    },
    async putBody(_accountId, messageId, json) {
      sql.exec(
        `INSERT INTO bodies (message_id, account_id, json, accessed_at) VALUES (?, ?, ?, ?)
         ON CONFLICT(message_id) DO UPDATE SET json = excluded.json, accessed_at = excluded.accessed_at`,
        messageId, _accountId, json, Date.now(),
      );
      const edge = one(sql.exec(`SELECT accessed_at FROM bodies ORDER BY accessed_at DESC LIMIT 1 OFFSET ?`, MAX_BODIES_PER_ACCOUNT - 1));
      if (edge) sql.exec(`DELETE FROM bodies WHERE accessed_at < ?`, Number(edge.accessed_at));
    },
    async wipeIndex(_accountId) {
      sql.exec(`DELETE FROM messages`);
      sql.exec(`DELETE FROM threads`);
      sql.exec(`DELETE FROM thread_states`);
      sql.exec(`DELETE FROM bodies`);
      sql.exec(`DELETE FROM send_queue`);
    },
    async putQueue(row) {
      sql.exec(
        `INSERT INTO send_queue (id, account_id, payload, send_at, status, error, thread_id, created_at, display_subject, display_to_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET payload = excluded.payload, send_at = excluded.send_at, status = excluded.status,
           error = excluded.error, thread_id = excluded.thread_id, display_subject = excluded.display_subject, display_to_json = excluded.display_to_json`,
        row.id, row.account_id, row.payload, row.send_at, row.status, row.error, row.thread_id, row.created_at, row.display_subject ?? null, row.display_to_json ?? null,
      );
    },
    async getQueue(id) {
      const r = one(sql.exec(`SELECT * FROM send_queue WHERE id = ?`, id));
      return r ? queue(r) : null;
    },
    async updateQueue(id, patch, expectedStatus) {
      const r = one(sql.exec(`SELECT status FROM send_queue WHERE id = ?`, id));
      if (!r) return false;
      if (expectedStatus && String(r.status) !== expectedStatus) return false;
      const sets: string[] = [];
      const vals: unknown[] = [];
      const col = (v: unknown, name: string) => {
        if (v === undefined) return;
        sets.push(`${name} = ?`);
        vals.push(v);
      };
      col(patch.status, "status");
      col(patch.error, "error");
      col(patch.thread_id, "thread_id");
      col(patch.send_at, "send_at");
      if (sets.length) sql.exec(`UPDATE send_queue SET ${sets.join(", ")} WHERE id = ?`, ...vals, id);
      return true;
    },
    async dueQueue(now) {
      return all(sql.exec(`SELECT * FROM send_queue WHERE status = 'queued' AND send_at <= ? ORDER BY send_at ASC`, now)).map(queue);
    },
    async nextQueueWake(now) {
      const r = one(sql.exec(`SELECT MIN(send_at) AS wake FROM send_queue WHERE status = 'queued' AND send_at > ?`, now));
      const wake = r ? (r.wake as number | null) : null;
      return wake === null || wake === undefined ? null : Number(wake);
    },
    async listQueueForAccounts(accountIds, since) {
      // Single-account DO: same filter, accountIds is length 1 in production.
      return all(sql.exec(`SELECT * FROM send_queue ORDER BY created_at DESC LIMIT 50`)).map(queue).filter(
        (r) => accountIds.includes(r.account_id) && (r.status === "queued" || r.status === "sending" || r.status === "failed" || r.created_at > since),
      );
    },
    async listQueueForAccount(_accountId, since) {
      return all(sql.exec(`SELECT * FROM send_queue ORDER BY created_at DESC LIMIT 50`, )).map(queue).filter(
        (r) => (r.status === "queued" || r.status === "sending" || r.status === "failed" || r.created_at > since),
      );
    },
    async requeueSending() {
      sql.exec(`UPDATE send_queue SET status = 'queued' WHERE status = 'sending'`);
    },
    async purgeOldQueue(cutoffMs) {
      sql.exec(`DELETE FROM send_queue WHERE status IN ('sent', 'cancelled') AND created_at < ?`, cutoffMs);
    },
  };
}
