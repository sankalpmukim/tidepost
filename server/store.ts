// Local index: message upserts, materialized threads, triage lanes, queries.
import { db, tx } from "./db";
import type { MessageMeta, BulkSignals } from "./providers/types";
import type { Lane, LaneCounts, Person, ThreadPage, ThreadSummary, Contact } from "../shared/types";

const BULK_CATEGORIES = new Set(["promotions", "social", "updates", "forums", "other"]);
const ROBOT_SENDER = /^(no-?reply|do-?not-?reply|donotreply|notifications?|notify|mailer-daemon|postmaster|bounces?|newsletters?|news|updates?|alerts?|digest|info|marketing|hello|team|support|billing|receipts?|calendar-notification|jira|github|builds?|ci)([+.-][^@]*)?@/i;

interface MessageRow {
  rowid: number;
  account_id: string;
  id: string;
  thread_id: string;
  from_name: string;
  from_email: string;
  to_json: string;
  cc_json: string;
  bcc_json: string;
  reply_to_json: string;
  subject: string;
  snippet: string;
  date_ms: number;
  unread: number;
  starred: number;
  folders: string;
  has_att: number;
  msgid_hdr: string | null;
  in_reply_to: string | null;
  refs: string | null;
  bulk_json: string;
  category: string | null;
  importance: string;
  size: number;
}

interface ThreadRow {
  account_id: string;
  id: string;
  subject: string;
  snippet: string;
  participants: string;
  last_from_name: string;
  last_from_email: string;
  last_from_me: number;
  last_date_ms: number;
  first_date_ms: number;
  message_count: number;
  unread_count: number;
  starred: number;
  has_att: number;
  folders: string;
  in_inbox: number;
  to_me_direct: number;
  is_bulk: number;
  audience: number;
  pinned: number | null;
  snoozed_until: number | null;
  remind_at: number | null;
  nudged: number | null;
  waiting_dismissed_at: number | null;
}

const foldersToStr = (f: string[]) => `,${[...new Set(f)].join(",")},`;
export const foldersFromStr = (s: string) => s.split(",").filter(Boolean);

export function rowToMeta(r: MessageRow): MessageMeta {
  return {
    id: r.id,
    threadId: r.thread_id,
    from: { name: r.from_name, email: r.from_email },
    to: JSON.parse(r.to_json) as Person[],
    cc: JSON.parse(r.cc_json) as Person[],
    bcc: JSON.parse(r.bcc_json) as Person[],
    replyTo: JSON.parse(r.reply_to_json) as Person[],
    subject: r.subject,
    snippet: r.snippet,
    date: new Date(r.date_ms).toISOString(),
    unread: !!r.unread,
    starred: !!r.starred,
    folders: foldersFromStr(r.folders),
    hasAttachments: !!r.has_att,
    messageIdHeader: r.msgid_hdr,
    inReplyTo: r.in_reply_to,
    references: r.refs,
    bulk: JSON.parse(r.bulk_json) as BulkSignals,
    category: r.category,
    importance: r.importance as MessageMeta["importance"],
    sizeEstimate: r.size,
  };
}

const upsertStmt = db.prepare(`
INSERT INTO messages (account_id,id,thread_id,from_name,from_email,to_json,cc_json,bcc_json,reply_to_json,subject,snippet,date_ms,unread,starred,folders,has_att,msgid_hdr,in_reply_to,refs,bulk_json,category,importance,size)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(account_id,id) DO UPDATE SET
 thread_id=excluded.thread_id, from_name=excluded.from_name, from_email=excluded.from_email, to_json=excluded.to_json,
 cc_json=excluded.cc_json, bcc_json=excluded.bcc_json, reply_to_json=excluded.reply_to_json, subject=excluded.subject,
 snippet=excluded.snippet, date_ms=excluded.date_ms, unread=excluded.unread, starred=excluded.starred, folders=excluded.folders,
 has_att=MAX(messages.has_att, excluded.has_att), msgid_hdr=COALESCE(excluded.msgid_hdr, messages.msgid_hdr),
 in_reply_to=COALESCE(excluded.in_reply_to, messages.in_reply_to), refs=COALESCE(excluded.refs, messages.refs),
 bulk_json=CASE WHEN excluded.bulk_json LIKE '%:"%' THEN excluded.bulk_json ELSE messages.bulk_json END,
 category=excluded.category, importance=excluded.importance, size=excluded.size
`);
const rowidStmt = db.prepare("SELECT rowid, thread_id FROM messages WHERE account_id=? AND id=?");
const ftsDelete = db.prepare("DELETE FROM search_fts WHERE rowid=?");
const ftsInsert = db.prepare("INSERT INTO search_fts(rowid, account_id, message_id, subject, people, body) VALUES (?,?,?,?,?,?)");

const peopleText = (m: MessageMeta) =>
  [m.from, ...m.to, ...m.cc].map((p) => `${p.name} ${p.email}`).join(" ");

/** Insert or update messages, then rebuild the affected threads. Returns affected thread ids. */
export function upsertMessages(accountId: string, me: string, metas: MessageMeta[]): string[] {
  if (!metas.length) return [];
  const threads = new Set<string>();
  tx(() => {
    for (const m of metas) {
      const before = rowidStmt.get(accountId, m.id) as { rowid: number; thread_id: string } | undefined;
      if (before && before.thread_id !== m.threadId) threads.add(before.thread_id);
      upsertStmt.run(
        accountId, m.id, m.threadId, m.from.name, m.from.email.toLowerCase(),
        JSON.stringify(m.to), JSON.stringify(m.cc), JSON.stringify(m.bcc), JSON.stringify(m.replyTo),
        m.subject, m.snippet, Date.parse(m.date) || 0, m.unread ? 1 : 0, m.starred ? 1 : 0,
        foldersToStr(m.folders), m.hasAttachments ? 1 : 0, m.messageIdHeader, m.inReplyTo, m.references,
        JSON.stringify(m.bulk ?? {}), m.category, m.importance ?? "normal", m.sizeEstimate ?? 0,
      );
      const row = rowidStmt.get(accountId, m.id) as { rowid: number };
      if (!before) {
        ftsInsert.run(row.rowid, accountId, m.id, m.subject, peopleText(m), m.snippet);
      }
      threads.add(m.threadId);
    }
    for (const t of threads) rebuildThread(accountId, me, t);
  });
  return [...threads];
}

export function deleteMessages(accountId: string, me: string, ids: string[]): string[] {
  if (!ids.length) return [];
  const threads = new Set<string>();
  tx(() => {
    for (const id of ids) {
      const row = rowidStmt.get(accountId, id) as { rowid: number; thread_id: string } | undefined;
      if (!row) continue;
      threads.add(row.thread_id);
      ftsDelete.run(row.rowid);
      db.prepare("DELETE FROM messages WHERE account_id=? AND id=?").run(accountId, id);
      db.prepare("DELETE FROM bodies WHERE account_id=? AND message_id=?").run(accountId, id);
    }
    for (const t of threads) rebuildThread(accountId, me, t);
  });
  return [...threads];
}

/** Store the body text in the search index once a body has been fetched. */
export function indexBody(accountId: string, messageId: string, text: string): void {
  const row = db.prepare("SELECT rowid, subject, from_name, from_email, to_json, cc_json FROM messages WHERE account_id=? AND id=?").get(accountId, messageId) as
    | { rowid: number; subject: string; from_name: string; from_email: string; to_json: string; cc_json: string }
    | undefined;
  if (!row) return;
  const people = [{ name: row.from_name, email: row.from_email }, ...(JSON.parse(row.to_json) as Person[]), ...(JSON.parse(row.cc_json) as Person[])]
    .map((p) => `${p.name} ${p.email}`)
    .join(" ");
  ftsDelete.run(row.rowid);
  ftsInsert.run(row.rowid, accountId, messageId, row.subject, people, text.slice(0, 20000));
}

export function isRobot(email: string): boolean {
  return ROBOT_SENDER.test(email);
}

export function messageIsBulk(m: MessageMeta): boolean {
  const b = m.bulk ?? ({} as BulkSignals);
  if (b.listId || b.listUnsubscribe) return true;
  if (b.precedence && /bulk|list|junk/i.test(b.precedence)) return true;
  if (b.autoSubmitted && !/^no$/i.test(b.autoSubmitted)) return true;
  if (m.category && BULK_CATEGORIES.has(m.category.toLowerCase())) return true;
  return isRobot(m.from.email);
}

export function normalizeSubject(s: string): string {
  let out = s.trim();
  for (let i = 0; i < 5; i++) {
    const next = out.replace(/^\s*((re|fw|fwd|aw|wg|sv|vs|antw|tr|ref)\s*(\[\d+\])?\s*[:：]\s*)/i, "");
    if (next === out) break;
    out = next;
  }
  return out.trim() || "(no subject)";
}

function isFromMe(m: MessageMeta, me: string): boolean {
  return m.from.email === me || m.folders.includes("SENT");
}

const threadUpsert = db.prepare(`
INSERT INTO threads (account_id,id,subject,snippet,participants,last_from_name,last_from_email,last_from_me,last_date_ms,first_date_ms,message_count,unread_count,starred,has_att,folders,in_inbox,to_me_direct,is_bulk,audience)
VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
ON CONFLICT(account_id,id) DO UPDATE SET subject=excluded.subject, snippet=excluded.snippet, participants=excluded.participants,
 last_from_name=excluded.last_from_name, last_from_email=excluded.last_from_email, last_from_me=excluded.last_from_me,
 last_date_ms=excluded.last_date_ms, first_date_ms=excluded.first_date_ms, message_count=excluded.message_count,
 unread_count=excluded.unread_count, starred=excluded.starred, has_att=excluded.has_att, folders=excluded.folders,
 in_inbox=excluded.in_inbox, to_me_direct=excluded.to_me_direct, is_bulk=excluded.is_bulk, audience=excluded.audience
`);

export function threadMetas(accountId: string, threadId: string): MessageMeta[] {
  const rows = db.prepare("SELECT rowid,* FROM messages WHERE account_id=? AND thread_id=? ORDER BY date_ms ASC").all(accountId, threadId) as unknown as MessageRow[];
  return rows.map(rowToMeta);
}

function rebuildThread(accountId: string, me: string, threadId: string): void {
  const all = threadMetas(accountId, threadId);
  // Drafts don't define the conversation state.
  const msgs = all.filter((m) => !m.folders.includes("DRAFT"));
  if (!msgs.length) {
    db.prepare("DELETE FROM threads WHERE account_id=? AND id=?").run(accountId, threadId);
    return;
  }
  const last = msgs[msgs.length - 1];
  const lastFromMe = isFromMe(last, me);
  const others = msgs.filter((m) => !isFromMe(m, me));
  const lastOther = others[others.length - 1] ?? null;
  const anyMine = msgs.some((m) => isFromMe(m, me));
  const toMeDirect = lastOther
    ? lastOther.to.some((p) => p.email === me) || (lastOther.to.length === 0 && lastOther.cc.length === 0)
    : false;
  const isBulk = !anyMine && !!lastOther && messageIsBulk(lastOther);
  const senders: Person[] = [];
  const seen = new Set<string>();
  for (const m of msgs) {
    if (!seen.has(m.from.email)) {
      seen.add(m.from.email);
      senders.push(m.from);
    }
  }
  const audience = new Set<string>();
  for (const m of msgs) for (const p of [m.from, ...m.to, ...m.cc]) audience.add(p.email);
  const folders = new Set<string>();
  for (const m of msgs) for (const f of m.folders) folders.add(f);
  const inInbox = msgs.some((m) => m.folders.includes("INBOX"));
  threadUpsert.run(
    accountId, threadId, normalizeSubject(msgs[0].subject || last.subject), last.snippet,
    JSON.stringify(senders.slice(0, 40)), last.from.name, last.from.email, lastFromMe ? 1 : 0,
    Date.parse(last.date), Date.parse(msgs[0].date), msgs.length, msgs.filter((m) => m.unread).length,
    msgs.some((m) => m.starred) ? 1 : 0, msgs.some((m) => m.hasAttachments) ? 1 : 0,
    foldersToStr([...folders]), inInbox ? 1 : 0, toMeDirect ? 1 : 0, isBulk ? 1 : 0, audience.size,
  );
  // A reply from someone else clears a pending follow-up reminder.
  if (!lastFromMe) {
    db.prepare("UPDATE thread_state SET nudged=0, remind_at=NULL WHERE account_id=? AND thread_id=? AND (nudged=1 OR remind_at IS NOT NULL) AND COALESCE(remind_set_at,0) < ?").run(accountId, threadId, Date.parse(last.date));
  }
}

// remind_set_at lets us clear reminders only for replies that arrived after the reminder was set.
try {
  db.exec("ALTER TABLE thread_state ADD COLUMN remind_set_at INTEGER");
} catch {
  /* column exists */
}

// ---------- lanes and queries ----------

/** node:sqlite rejects named parameters the statement doesn't use; pass only the ones it does. */
export function bind(sql: string, params: Record<string, string | number>): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [k, v] of Object.entries(params)) if (sql.includes(`:${k}`)) out[k] = v;
  return out;
}

const WAITING_WINDOW_MS = 30 * 24 * 3600 * 1000;

export function laneOf(r: ThreadRow, now = Date.now()): Lane {
  const notTrash = !r.folders.includes(",TRASH,") && !r.folders.includes(",SPAM,");
  if (r.nudged) return "needs";
  if (r.last_from_me && !r.is_bulk && r.audience > 1 && r.last_date_ms > now - WAITING_WINDOW_MS && notTrash && !(r.waiting_dismissed_at && r.waiting_dismissed_at >= r.last_date_ms)) return "waiting";
  if (!r.in_inbox) return "done";
  if (r.is_bulk) return "updates";
  if (r.last_from_me) return "done";
  return r.to_me_direct ? "needs" : "fyi";
}

function rowToSummary(r: ThreadRow, now = Date.now()): ThreadSummary {
  return {
    id: r.id,
    accountId: r.account_id,
    subject: r.subject,
    snippet: r.snippet,
    participants: JSON.parse(r.participants) as Person[],
    lastFrom: { name: r.last_from_name, email: r.last_from_email },
    lastFromMe: !!r.last_from_me,
    lastDate: new Date(r.last_date_ms).toISOString(),
    firstDate: new Date(r.first_date_ms).toISOString(),
    messageCount: r.message_count,
    unreadCount: r.unread_count,
    starred: !!r.starred,
    hasAttachments: !!r.has_att,
    folders: foldersFromStr(r.folders),
    inInbox: !!r.in_inbox,
    lane: laneOf(r, now),
    toMeDirect: !!r.to_me_direct,
    isBulk: !!r.is_bulk,
    pinned: !!r.pinned,
    snoozedUntil: r.snoozed_until && r.snoozed_until > now ? new Date(r.snoozed_until).toISOString() : null,
    remindAt: r.remind_at ? new Date(r.remind_at).toISOString() : null,
    nudged: !!r.nudged,
    audienceSize: r.audience,
  };
}

const SELECT_THREADS = `SELECT t.*, s.pinned, s.snoozed_until, s.remind_at, s.nudged, s.waiting_dismissed_at
FROM threads t LEFT JOIN thread_state s ON s.account_id=t.account_id AND s.thread_id=t.id`;

const NOT_TRASH = `t.folders NOT LIKE '%,TRASH,%' AND t.folders NOT LIKE '%,SPAM,%'`;
const NOT_SNOOZED = `(s.snoozed_until IS NULL OR s.snoozed_until <= :now)`;
const WAITING = `(t.last_from_me=1 AND t.is_bulk=0 AND t.audience>1 AND t.last_date_ms > :since AND (s.waiting_dismissed_at IS NULL OR s.waiting_dismissed_at < t.last_date_ms) AND ${NOT_TRASH})`;

export function viewWhere(view: string): string {
  const inbox = `t.in_inbox=1 AND ${NOT_TRASH} AND ${NOT_SNOOZED}`;
  switch (view) {
    case "inbox": return inbox;
    case "needs": return `${inbox} AND ((t.last_from_me=0 AND t.is_bulk=0 AND t.to_me_direct=1) OR s.nudged=1)`;
    case "fyi": return `${inbox} AND t.last_from_me=0 AND t.is_bulk=0 AND t.to_me_direct=0 AND COALESCE(s.nudged,0)=0`;
    case "updates": return `${inbox} AND t.last_from_me=0 AND t.is_bulk=1 AND COALESCE(s.nudged,0)=0`;
    case "waiting": return `${WAITING} AND COALESCE(s.nudged,0)=0 AND ${NOT_SNOOZED}`;
    case "snoozed": return `s.snoozed_until > :now`;
    case "starred": return `t.starred=1 AND ${NOT_TRASH}`;
    case "sent": return `t.folders LIKE '%,SENT,%' AND ${NOT_TRASH}`;
    case "all": return NOT_TRASH;
    case "archive": return `t.in_inbox=0 AND ${NOT_TRASH}`;
    case "trash": return `t.folders LIKE '%,TRASH,%'`;
    case "spam": return `t.folders LIKE '%,SPAM,%'`;
    default:
      if (view.startsWith("folder:")) {
        const id = view.slice(7).replace(/[%,_']/g, "");
        return `t.folders LIKE '%,${id},%'`;
      }
      return inbox;
  }
}

export function listThreads(accountId: string, view: string, offset: number, limit: number): ThreadPage {
  const now = Date.now();
  const where = viewWhere(view);
  const params = { aid: accountId, now, since: now - WAITING_WINDOW_MS, limit, offset };
  const order = view === "snoozed" ? "s.snoozed_until ASC" : view === "waiting" ? "t.last_date_ms ASC" : "COALESCE(s.pinned,0) DESC, t.last_date_ms DESC";
  const listSql = `${SELECT_THREADS} WHERE t.account_id=:aid AND ${where} ORDER BY ${order} LIMIT :limit OFFSET :offset`;
  const rows = db.prepare(listSql).all(bind(listSql, params)) as unknown as ThreadRow[];
  const countSql = `SELECT COUNT(*) AS n FROM threads t LEFT JOIN thread_state s ON s.account_id=t.account_id AND s.thread_id=t.id WHERE t.account_id=:aid AND ${where}`;
  const totalRow = db.prepare(countSql).get(bind(countSql, params)) as { n: number };
  return {
    threads: rows.map((r) => rowToSummary(r, now)),
    nextCursor: offset + rows.length < totalRow.n ? String(offset + rows.length) : null,
    total: totalRow.n,
  };
}

export function getThreadSummary(accountId: string, threadId: string): ThreadSummary | null {
  const row = db.prepare(`${SELECT_THREADS} WHERE t.account_id=? AND t.id=?`).get(accountId, threadId) as ThreadRow | undefined;
  return row ? rowToSummary(row) : null;
}

export function summariesFor(accountId: string, threadIds: string[]): ThreadSummary[] {
  const out: ThreadSummary[] = [];
  for (const id of threadIds) {
    const s = getThreadSummary(accountId, id);
    if (s) out.push(s);
  }
  return out;
}

export function laneCounts(accountId: string): LaneCounts {
  const now = Date.now();
  const count = (view: string, extra = "") => {
    const sql = `SELECT COUNT(*) AS n FROM threads t LEFT JOIN thread_state s ON s.account_id=t.account_id AND s.thread_id=t.id WHERE t.account_id=:aid AND ${viewWhere(view)} ${extra}`;
    return (db.prepare(sql).get(bind(sql, { aid: accountId, now, since: now - WAITING_WINDOW_MS })) as { n: number }).n;
  };
  return {
    needs: count("needs"),
    waiting: count("waiting"),
    fyi: count("fyi", "AND t.unread_count>0"),
    updates: count("updates", "AND t.unread_count>0"),
    inboxUnread: count("inbox", "AND t.unread_count>0"),
    snoozed: count("snoozed"),
  };
}

/** Message ids of a thread, optionally only those in a folder. */
export function threadMessageIds(accountId: string, threadId: string, where = ""): string[] {
  return (db.prepare(`SELECT id FROM messages WHERE account_id=? AND thread_id=? ${where}`).all(accountId, threadId) as { id: string }[]).map((r) => r.id);
}

export function getMeta(accountId: string, messageId: string): MessageMeta | null {
  const row = db.prepare("SELECT rowid,* FROM messages WHERE account_id=? AND id=?").get(accountId, messageId) as MessageRow | undefined;
  return row ? rowToMeta(row) : null;
}

// ---------- local thread state ----------

export function setThreadState(accountId: string, threadId: string, patch: Partial<{ pinned: number; snoozed_until: number | null; remind_at: number | null; remind_set_at: number | null; nudged: number; waiting_dismissed_at: number | null; brief: string | null }>): void {
  db.prepare("INSERT OR IGNORE INTO thread_state (account_id, thread_id) VALUES (?, ?)").run(accountId, threadId);
  const keys = Object.keys(patch) as (keyof typeof patch)[];
  if (!keys.length) return;
  const sets = keys.map((k) => `${k}=?`).join(", ");
  db.prepare(`UPDATE thread_state SET ${sets} WHERE account_id=? AND thread_id=?`).run(...keys.map((k) => patch[k] ?? null), accountId, threadId);
}

export function getBrief(accountId: string, threadId: string): string | null {
  const row = db.prepare("SELECT brief FROM thread_state WHERE account_id=? AND thread_id=?").get(accountId, threadId) as { brief: string | null } | undefined;
  return row?.brief ?? null;
}

// ---------- applying actions locally (optimistic, before the provider confirms) ----------

export function applyLocal(accountId: string, me: string, threadIds: string[], fn: (m: MessageMeta) => MessageMeta | null): void {
  for (const t of threadIds) {
    const metas = threadMetas(accountId, t);
    const changed = metas.map(fn).filter((m): m is MessageMeta => !!m);
    upsertMessages(accountId, me, changed);
  }
}

// ---------- search ----------

export function localSearch(accountId: string, q: string, limit = 50): ThreadSummary[] {
  const terms = q
    .replace(/["*():^]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !t.includes(":"))
    .map((t) => `"${t.replace(/"/g, "")}"*`);
  if (!terms.length) return [];
  const rows = db
    .prepare(
      `SELECT DISTINCT m.thread_id AS tid, MAX(m.date_ms) AS d FROM search_fts f JOIN messages m ON m.rowid=f.rowid
       WHERE search_fts MATCH ? AND m.account_id=? GROUP BY m.thread_id ORDER BY d DESC LIMIT ?`,
    )
    .all(terms.join(" AND "), accountId, limit) as { tid: string }[];
  return summariesFor(accountId, rows.map((r) => r.tid));
}

// ---------- contacts ----------

const contactCache = new Map<string, { at: number; list: Contact[] }>();

export function contacts(accountId: string, me: string, q: string, limit = 8): Contact[] {
  let entry = contactCache.get(accountId);
  if (!entry || Date.now() - entry.at > 5 * 60_000) {
    const map = new Map<string, Contact>();
    const add = (p: Person, w: number) => {
      if (!p.email || p.email === me || isRobot(p.email)) return;
      const c = map.get(p.email) ?? { name: p.name, email: p.email, count: 0 };
      c.count += w;
      if (p.name && p.name !== p.email && (c.name === c.email || c.name.length < p.name.length)) c.name = p.name;
      map.set(p.email, c);
    };
    const rows = db.prepare("SELECT from_name, from_email, to_json, cc_json, folders FROM messages WHERE account_id=? ORDER BY date_ms DESC LIMIT 20000").all(accountId) as {
      from_name: string; from_email: string; to_json: string; cc_json: string; folders: string;
    }[];
    for (const r of rows) {
      const sent = r.folders.includes(",SENT,") || r.from_email === me;
      if (sent) {
        for (const p of JSON.parse(r.to_json) as Person[]) add(p, 3);
        for (const p of JSON.parse(r.cc_json) as Person[]) add(p, 2);
      } else {
        add({ name: r.from_name, email: r.from_email }, 1);
      }
    }
    entry = { at: Date.now(), list: [...map.values()].sort((a, b) => b.count - a.count) };
    contactCache.set(accountId, entry);
  }
  const needle = q.trim().toLowerCase();
  return entry.list.filter((c) => !needle || c.email.includes(needle) || c.name.toLowerCase().includes(needle)).slice(0, limit);
}

export function invalidateContacts(accountId: string): void {
  contactCache.delete(accountId);
}
