// Local index: message upserts, materialized threads, triage lanes, queries.
import { persist, type MessagePersistRow, type ThreadPersistRow, type ThreadStateRow } from "./persist";
import { MAX_SEARCH_SCAN } from "./limits";
import type { MessageMeta, BulkSignals } from "./providers/types";
import type { Lane, LaneCounts, Person, ThreadPage, ThreadSummary, Contact } from "../shared/types";

const BULK_CATEGORIES = new Set(["promotions", "social", "updates", "forums", "other"]);
const ROBOT_SENDER = /^(no-?reply|do-?not-?reply|donotreply|notifications?|notify|mailer-daemon|postmaster|bounces?|newsletters?|news|updates?|alerts?|digest|info|marketing|hello|team|support|billing|receipts?|calendar-notification|jira|github|builds?|ci)([+.-][^@]*)?@/i;

type MessageRow = MessagePersistRow;
type ThreadRow = ThreadPersistRow & Partial<ThreadStateRow>;

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

const peopleText = (m: MessageMeta) =>
  [m.from, ...m.to, ...m.cc].map((p) => `${p.name} ${p.email}`).join(" ");

function metaToRow(accountId: string, m: MessageMeta): MessageRow {
  return {
    account_id: accountId,
    id: m.id,
    thread_id: m.threadId,
    from_name: m.from.name,
    from_email: m.from.email.toLowerCase(),
    to_json: JSON.stringify(m.to),
    cc_json: JSON.stringify(m.cc),
    bcc_json: JSON.stringify(m.bcc),
    reply_to_json: JSON.stringify(m.replyTo),
    subject: m.subject,
    snippet: m.snippet,
    date_ms: Date.parse(m.date) || 0,
    unread: m.unread ? 1 : 0,
    starred: m.starred ? 1 : 0,
    folders: foldersToStr(m.folders),
    has_att: m.hasAttachments ? 1 : 0,
    msgid_hdr: m.messageIdHeader,
    in_reply_to: m.inReplyTo,
    refs: m.references,
    bulk_json: JSON.stringify(m.bulk ?? {}),
    category: m.category,
    importance: m.importance ?? "normal",
    size: m.sizeEstimate ?? 0,
    search_text: `${m.subject} ${peopleText(m)} ${m.snippet}`.toLowerCase(),
  };
}

/** Insert or update messages, then rebuild the affected threads. Returns affected thread ids. */
export async function upsertMessages(accountId: string, me: string, metas: MessageMeta[]): Promise<string[]> {
  if (!metas.length) return [];
  const threads = new Set<string>();
  const prev = await persist().putMessages(metas.map((m) => metaToRow(accountId, m)));
  for (const p of prev) threads.add(p.thread_id);
  for (const m of metas) threads.add(m.threadId);
  for (const t of threads) await rebuildThread(accountId, me, t);
  await persist().pruneOldestMessages(accountId);
  return [...threads];
}

export async function deleteMessages(accountId: string, me: string, ids: string[]): Promise<string[]> {
  if (!ids.length) return [];
  const prev = await persist().deleteMessages(accountId, ids);
  const threads = new Set(prev.map((p) => p.thread_id));
  for (const t of threads) await rebuildThread(accountId, me, t);
  return [...threads];
}

/** Store the body text in the search index once a body has been fetched. */
export async function indexBody(accountId: string, messageId: string, text: string): Promise<void> {
  const row = await persist().getMessage(accountId, messageId);
  if (!row) return;
  const people = [{ name: row.from_name, email: row.from_email }, ...(JSON.parse(row.to_json) as Person[]), ...(JSON.parse(row.cc_json) as Person[])]
    .map((p) => `${p.name} ${p.email}`)
    .join(" ");
  await persist().touchSearchText(accountId, messageId, `${row.subject} ${people} ${text.slice(0, 4000)}`.toLowerCase());
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

export async function threadMetas(accountId: string, threadId: string): Promise<MessageMeta[]> {
  const rows = await persist().messagesForThread(accountId, threadId);
  return rows.map(rowToMeta);
}

async function rebuildThread(accountId: string, me: string, threadId: string): Promise<void> {
  const all = await threadMetas(accountId, threadId);
  const msgs = all.filter((m) => !m.folders.includes("DRAFT"));
  if (!msgs.length) {
    await persist().deleteThread(accountId, threadId);
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
  await persist().putThreads([{
    account_id: accountId,
    id: threadId,
    subject: normalizeSubject(msgs[0].subject || last.subject),
    snippet: last.snippet,
    participants: JSON.stringify(senders.slice(0, 40)),
    last_from_name: last.from.name,
    last_from_email: last.from.email,
    last_from_me: lastFromMe ? 1 : 0,
    last_date_ms: Date.parse(last.date),
    first_date_ms: Date.parse(msgs[0].date),
    message_count: msgs.length,
    unread_count: msgs.filter((m) => m.unread).length,
    starred: msgs.some((m) => m.starred) ? 1 : 0,
    has_att: msgs.some((m) => m.hasAttachments) ? 1 : 0,
    folders: foldersToStr([...folders]),
    in_inbox: inInbox ? 1 : 0,
    to_me_direct: toMeDirect ? 1 : 0,
    is_bulk: isBulk ? 1 : 0,
    audience: audience.size,
  }]);
  if (!lastFromMe) {
    const state = await persist().getThreadState(accountId, threadId);
    if (state && (state.nudged === 1 || state.remind_at !== null) && (state.remind_set_at ?? 0) < Date.parse(last.date)) {
      await persist().patchThreadState(accountId, threadId, { nudged: 0, remind_at: null });
    }
  }
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

function join(t: ThreadPersistRow, s: ThreadStateRow | undefined): ThreadRow {
  return {
    ...t,
    pinned: s?.pinned ?? 0,
    snoozed_until: s?.snoozed_until ?? null,
    remind_at: s?.remind_at ?? null,
    remind_set_at: s?.remind_set_at ?? null,
    nudged: s?.nudged ?? 0,
    waiting_dismissed_at: s?.waiting_dismissed_at ?? null,
    brief: s?.brief ?? null,
  };
}

export function matchesView(r: ThreadRow, view: string, now: number): boolean {
  const notTrash = !r.folders.includes(",TRASH,") && !r.folders.includes(",SPAM,");
  const notSnoozed = !(r.snoozed_until && r.snoozed_until > now);
  const inbox = !!r.in_inbox && notTrash && notSnoozed;
  const waiting = !!r.last_from_me && !r.is_bulk && r.audience > 1 && r.last_date_ms > now - WAITING_WINDOW_MS && !(r.waiting_dismissed_at && r.waiting_dismissed_at >= r.last_date_ms) && notTrash;
  switch (view) {
    case "inbox": return inbox;
    case "needs": return inbox && ((!r.last_from_me && !r.is_bulk && !!r.to_me_direct) || !!r.nudged);
    case "fyi": return inbox && !r.last_from_me && !r.is_bulk && !r.to_me_direct && !r.nudged;
    case "updates": return inbox && !r.last_from_me && !!r.is_bulk && !r.nudged;
    case "waiting": return waiting && !r.nudged && notSnoozed;
    case "snoozed": return !!(r.snoozed_until && r.snoozed_until > now);
    case "starred": return !!r.starred && notTrash;
    case "sent": return r.folders.includes(",SENT,") && notTrash;
    case "all": return notTrash;
    case "archive": return !r.in_inbox && notTrash;
    case "trash": return r.folders.includes(",TRASH,");
    case "spam": return r.folders.includes(",SPAM,");
    default:
      if (view.startsWith("folder:")) {
        const id = view.slice(7).replace(/[%,_']/g, "");
        return r.folders.includes(`,${id},`);
      }
      return inbox;
  }
}

function sortThreads(view: string, a: ThreadRow, b: ThreadRow): number {
  if (view === "snoozed") return (a.snoozed_until ?? 0) - (b.snoozed_until ?? 0);
  if (view === "waiting") return a.last_date_ms - b.last_date_ms;
  const pin = (b.pinned ?? 0) - (a.pinned ?? 0);
  if (pin) return pin;
  return b.last_date_ms - a.last_date_ms;
}

async function joinedThreads(accountId: string): Promise<ThreadRow[]> {
  const [threads, states] = await Promise.all([persist().listThreads(accountId), persist().listThreadStates(accountId)]);
  const map = new Map(states.map((s) => [`${s.account_id}:${s.thread_id}`, s]));
  return threads.map((t) => join(t, map.get(`${t.account_id}:${t.id}`)));
}

export async function listThreads(accountId: string, view: string, offset: number, limit: number): Promise<ThreadPage> {
  const now = Date.now();
  const rows = (await joinedThreads(accountId)).filter((r) => matchesView(r, view, now)).sort((a, b) => sortThreads(view, a, b));
  const page = rows.slice(offset, offset + limit);
  return {
    threads: page.map((r) => rowToSummary(r, now)),
    nextCursor: offset + page.length < rows.length ? String(offset + page.length) : null,
    total: rows.length,
  };
}

export async function getThreadSummary(accountId: string, threadId: string): Promise<ThreadSummary | null> {
  const t = await persist().getThread(accountId, threadId);
  if (!t) return null;
  const s = await persist().getThreadState(accountId, threadId);
  return rowToSummary(join(t, s ?? undefined));
}

export async function summariesFor(accountId: string, threadIds: string[]): Promise<ThreadSummary[]> {
  const out: ThreadSummary[] = [];
  for (const id of threadIds) {
    const s = await getThreadSummary(accountId, id);
    if (s) out.push(s);
  }
  return out;
}

export async function laneCounts(accountId: string): Promise<LaneCounts> {
  const now = Date.now();
  const rows = await joinedThreads(accountId);
  const count = (view: string, extra?: (r: ThreadRow) => boolean) =>
    rows.filter((r) => matchesView(r, view, now) && (!extra || extra(r))).length;
  return {
    needs: count("needs"),
    waiting: count("waiting"),
    fyi: count("fyi", (r) => r.unread_count > 0),
    updates: count("updates", (r) => r.unread_count > 0),
    inboxUnread: count("inbox", (r) => r.unread_count > 0),
    snoozed: count("snoozed"),
  };
}

export async function sweepCandidates(
  accountId: string,
  view: string,
  extra: (r: ThreadRow) => boolean,
): Promise<{ id: string; subject: string; last_from_name: string }[]> {
  const now = Date.now();
  return (await joinedThreads(accountId))
    .filter((r) => matchesView(r, view, now) && extra(r))
    .sort((a, b) => b.last_date_ms - a.last_date_ms)
    .slice(0, 2000)
    .map((r) => ({ id: r.id, subject: r.subject, last_from_name: r.last_from_name }));
}

/** Message ids of a thread, optionally only those in a folder. */
export async function threadMessageIds(accountId: string, threadId: string, folder?: string): Promise<string[]> {
  const rows = await persist().messagesForThread(accountId, threadId);
  return rows.filter((r) => !folder || r.folders.includes(`,${folder},`)).map((r) => r.id);
}

export async function getMeta(accountId: string, messageId: string): Promise<MessageMeta | null> {
  const row = await persist().getMessage(accountId, messageId);
  return row ? rowToMeta(row) : null;
}

export async function setThreadState(accountId: string, threadId: string, patch: Partial<{ pinned: number; snoozed_until: number | null; remind_at: number | null; remind_set_at: number | null; nudged: number; waiting_dismissed_at: number | null; brief: string | null }>): Promise<void> {
  await persist().patchThreadState(accountId, threadId, patch);
}

export async function getBrief(accountId: string, threadId: string): Promise<string | null> {
  const row = await persist().getThreadState(accountId, threadId);
  return row?.brief ?? null;
}

export async function applyLocal(accountId: string, me: string, threadIds: string[], fn: (m: MessageMeta) => MessageMeta | null): Promise<void> {
  for (const t of threadIds) {
    const metas = await threadMetas(accountId, t);
    const changed = metas.map(fn).filter((m): m is MessageMeta => !!m);
    await upsertMessages(accountId, me, changed);
  }
}

export async function localSearch(accountId: string, q: string, limit = 50): Promise<ThreadSummary[]> {
  const terms = q
    .replace(/["*():^]/g, " ")
    .split(/\s+/)
    .filter((t) => t && !t.includes(":"))
    .map((t) => t.toLowerCase());
  if (!terms.length) return [];
  const rows = await persist().listRecentMessages(accountId, MAX_SEARCH_SCAN);
  const hits = new Map<string, number>();
  for (const r of rows) {
    const hay = r.search_text || `${r.subject} ${r.from_name} ${r.from_email} ${r.snippet}`.toLowerCase();
    if (terms.every((t) => hay.includes(t))) hits.set(r.thread_id, Math.max(hits.get(r.thread_id) ?? 0, r.date_ms));
  }
  const ids = [...hits.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([id]) => id);
  return summariesFor(accountId, ids);
}

const contactCache = new Map<string, { at: number; list: Contact[] }>();

export async function contacts(accountId: string, me: string, q: string, limit = 8): Promise<Contact[]> {
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
    const rows = await persist().listRecentMessages(accountId, MAX_SEARCH_SCAN);
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
