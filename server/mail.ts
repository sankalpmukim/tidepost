// Mail operations: threads with bodies, actions, the undo-send queue,
// unsubscribe and reviewed bulk sweeps.
import dns from "node:dns/promises";
import net from "node:net";
import { decrypt, encrypt, newId } from "./db";
import { persist } from "./persist";
import { getAccount, getUserSettings, providerFor, type AccountRow } from "./accounts";
import { applyLocal, getMeta, getThreadSummary, indexBody, setThreadState, sweepCandidates, threadMetas } from "./store";
import { ingest, refreshThread, syncNow } from "./sync";
import { emit, setRunHandlers, startRun, updateRun, getRunEntry } from "./events";
import { htmlToText, stripQuotedText, textToHtml, escapeHtml } from "./text";
import { mapLimit } from "./providers/http";
import type { MessageMeta, MessageChange, RawOutgoing } from "./providers/types";
import type { AttachmentMeta, Message, OutgoingMessage, QueuedSend, Run, SweepKind, Thread, ThreadAction, UnsubscribeResult } from "../shared/types";

// ---------- bodies ----------

interface StoredBody {
  html: string | null;
  text: string;
  uniqueText: string;
  uniqueHtml: string | null;
  attachments: AttachmentMeta[];
}

async function cachedBody(accountId: string, messageId: string): Promise<StoredBody | null> {
  const json = await persist().getBody(accountId, messageId);
  return json ? (JSON.parse(json) as StoredBody) : null;
}

async function fetchBody(account: AccountRow, messageId: string): Promise<StoredBody> {
  const cached = await cachedBody(account.id, messageId);
  if (cached) return cached;
  const provider = await providerFor(account);
  const b = await provider.getBody(messageId);
  const text = (b.text && b.text.trim()) || (b.html ? htmlToText(b.html) : "");
  const uniqueText = b.uniqueHtml ? htmlToText(b.uniqueHtml) : stripQuotedText(text);
  const stored: StoredBody = { html: b.html, text, uniqueText, uniqueHtml: b.uniqueHtml, attachments: b.attachments };
  await persist().putBody(account.id, messageId, JSON.stringify(stored));
  await indexBody(account.id, messageId, text);
  if (b.headers) {
    const meta = await getMeta(account.id, messageId);
    if (meta) {
      const merged: MessageMeta = {
        ...meta,
        bulk: { ...meta.bulk, ...Object.fromEntries(Object.entries(b.headers.bulk ?? {}).filter(([, v]) => v)) },
        messageIdHeader: b.headers.messageIdHeader ?? meta.messageIdHeader,
        inReplyTo: b.headers.inReplyTo ?? meta.inReplyTo,
        references: b.headers.references ?? meta.references,
        hasAttachments: meta.hasAttachments || b.attachments.some((a) => !a.inline),
      };
      await ingest(account, [merged]);
    }
  } else if (b.attachments.some((a) => !a.inline)) {
    const meta = await getMeta(account.id, messageId);
    if (meta && !meta.hasAttachments) await ingest(account, [{ ...meta, hasAttachments: true }]);
  }
  return stored;
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

function toMessage(account: AccountRow, meta: MessageMeta, body: StoredBody | null): Message {
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

const withTimeout = <T>(p: Promise<T>, ms: number): Promise<T | "timeout"> =>
  Promise.race([p, new Promise<"timeout">((r) => setTimeout(() => r("timeout"), ms))]);

/**
 * Open a thread: refresh it from the provider, then load bodies for the
 * messages that will be shown expanded (unread, the first, the last few).
 * Collapsed messages keep only headers until the client asks for them.
 */
export async function getThread(account: AccountRow, threadId: string, opts: { refresh?: boolean } = {}): Promise<Thread | null> {
  if (opts.refresh !== false) {
    const refreshing = refreshThread(account, threadId).catch((err: unknown) => console.error("[thread refresh]", err instanceof Error ? err.message : err));
    await withTimeout(refreshing, 2500);
  }
  const all = await threadMetas(account.id, threadId);
  // Hide trashed messages unless the whole thread is in the trash.
  const allTrash = all.every((m) => m.folders.includes("TRASH"));
  const metas = allTrash ? all : all.filter((m) => !m.folders.includes("TRASH"));
  if (!metas.length) return null;
  const want = new Set<string>();
  metas.forEach((m, i) => {
    if (m.unread || i === 0 || i >= metas.length - 3) want.add(m.id);
  });
  // Cap eager loading so a 300-message unread storm still opens fast.
  const eager = [...want].slice(-25);
  const bodies = new Map<string, StoredBody>();
  for (const m of metas) {
    const c = await cachedBody(account.id, m.id);
    if (c) bodies.set(m.id, c);
  }
  await mapLimit(eager.filter((id) => !bodies.has(id)), 6, async (id) => {
    try {
      bodies.set(id, await fetchBody(account, id));
    } catch (err) {
      console.error("[body]", err instanceof Error ? err.message : err);
    }
  });
  const fresh = (await threadMetas(account.id, threadId)).filter((m) => metas.some((x) => x.id === m.id));
  const summary = await getThreadSummary(account.id, threadId);
  if (!summary) return null;
  return {
    id: threadId,
    accountId: account.id,
    subject: summary.subject,
    messages: fresh.map((m) => toMessage(account, m, bodies.get(m.id) ?? null)),
    summary,
  };
}

export async function getMessages(account: AccountRow, ids: string[]): Promise<Message[]> {
  const out: Message[] = [];
  await mapLimit(ids.slice(0, 200), 6, async (id) => {
    const meta = await getMeta(account.id, id);
    if (!meta) return;
    try {
      out.push(toMessage(account, meta, await fetchBody(account, id)));
    } catch (err) {
      console.error("[body]", err instanceof Error ? err.message : err);
    }
  });
  return out;
}

/** Plain text of the whole thread for the assistant, loading missing bodies. */
export async function threadForAssistant(account: AccountRow, threadId: string): Promise<Message[]> {
  const metas = (await threadMetas(account.id, threadId)).filter((m) => !m.folders.includes("TRASH"));
  const out: Message[] = [];
  await mapLimit(metas, 6, async (m) => {
    let body: StoredBody | null = null;
    try {
      body = await fetchBody(account, m.id);
    } catch {
      body = null;
    }
    out.push(toMessage(account, m, body));
  });
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ---------- actions ----------

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

export async function applyAction(account: AccountRow, threadIds: string[], action: ThreadAction, onProgress?: (done: number) => void): Promise<void> {
  const now = Date.now();
  // Local-only state first.
  for (const t of threadIds) {
    switch (action.type) {
      case "pin": await setThreadState(account.id, t, { pinned: 1 }); break;
      case "unpin": await setThreadState(account.id, t, { pinned: 0 }); break;
      case "snooze": await setThreadState(account.id, t, { snoozed_until: Date.parse(action.until) }); break;
      case "unsnooze": await setThreadState(account.id, t, { snoozed_until: null }); break;
      case "remind": await setThreadState(account.id, t, { remind_at: Date.parse(action.at), remind_set_at: now, nudged: 0 }); break;
      case "unremind": await setThreadState(account.id, t, { remind_at: null, nudged: 0 }); break;
      case "stopWaiting": await setThreadState(account.id, t, { waiting_dismissed_at: now, nudged: 0, remind_at: null }); break;
      case "archive": await setThreadState(account.id, t, { nudged: 0 }); break;
      default: break;
    }
  }
  const change = changeFor(action);
  if (!change) {
    emit(account.user_id, { type: "threads", accountId: account.id, threadIds });
    return;
  }
  const provider = await providerFor(account);
  const perThread = await Promise.all(threadIds.map(async (t) => ({ t, metas: await threadMetas(account.id, t) })));
  const ids = perThread.flatMap(({ metas }) => targetIds(metas, action));
  // Optimistic local update so the UI moves immediately.
  const transform = localTransform(action, provider.folderStyle);
  await applyLocal(account.id, account.email, threadIds, (m) => {
    const metas = perThread.find((p) => p.t === m.threadId)?.metas ?? [];
    return transform(m, metas[metas.length - 1]?.id === m.id);
  });
  emit(account.user_id, { type: "threads", accountId: account.id, threadIds });
  if (!ids.length) return;
  try {
    const chunk = 200;
    for (let i = 0; i < ids.length; i += chunk) {
      await provider.modify(ids.slice(i, i + chunk), change);
      onProgress?.(Math.min(ids.length, i + chunk));
    }
  } catch (err) {
    // Reconcile with the server's truth.
    void syncNow(account.id);
    throw err;
  }
  // Pull provider-side changes (e.g. Outlook moves) shortly after.
  setTimeout(() => void syncNow(account.id), 1500).unref();
}

// ---------- send queue (undo send) ----------

interface QueueRow {
  id: string;
  account_id: string;
  payload: string;
  send_at: number;
  status: QueuedSend["status"];
  error: string | null;
  thread_id: string | null;
  created_at?: number;
}

function rowToQueued(r: QueueRow): QueuedSend {
  const msg = JSON.parse(decrypt(r.payload)) as OutgoingMessage;
  return { id: r.id, accountId: r.account_id, sendAt: new Date(r.send_at).toISOString(), subject: msg.subject, to: msg.to, status: r.status, error: r.error, threadId: r.thread_id };
}

export async function enqueueSend(account: AccountRow, msg: OutgoingMessage, delaySeconds: number): Promise<QueuedSend> {
  const id = newId("snd");
  const sendAt = Date.now() + Math.max(0, delaySeconds) * 1000;
  await persist().putQueue({
    id, account_id: account.id, payload: encrypt(JSON.stringify(msg)), send_at: sendAt, status: "queued",
    error: null, thread_id: msg.inReplyTo?.threadId ?? null, created_at: Date.now(),
    display_subject: msg.subject, display_to_json: JSON.stringify(msg.to),
  });
  const q = rowToQueued((await persist().getQueue(id))!);
  emit(account.user_id, { type: "send", send: q });
  if (delaySeconds <= 0) void processQueue();
  return q;
}

export async function cancelSend(account: AccountRow, id: string): Promise<{ ok: boolean; message: OutgoingMessage | null }> {
  const row = await persist().getQueue(id);
  if (!row || row.account_id !== account.id || row.status !== "queued") return { ok: false, message: null };
  await persist().updateQueue(id, { status: "cancelled" });
  const q = rowToQueued({ ...row, status: "cancelled" });
  emit(account.user_id, { type: "send", send: q });
  return { ok: true, message: JSON.parse(decrypt(row.payload)) as OutgoingMessage };
}

export async function retrySend(account: AccountRow, id: string): Promise<QueuedSend | null> {
  const row = await persist().getQueue(id);
  if (!row || row.account_id !== account.id || row.status !== "failed") return null;
  await persist().updateQueue(id, { status: "queued", error: null, send_at: Date.now() });
  void processQueue();
  return rowToQueued({ ...row, status: "queued", error: null });
}

export async function listSends(accountIds: string[]): Promise<QueuedSend[]> {
  if (!accountIds.length) return [];
  const rows = await persist().listQueueForAccounts(accountIds, Date.now() - 10 * 60_000);
  return rows.map(rowToQueued);
}

function quoteText(text: string): string {
  return text.split("\n").map((l) => `> ${l}`).join("\n");
}

export async function buildOutgoing(account: AccountRow, msg: OutgoingMessage, signature: string): Promise<RawOutgoing> {
  const original = msg.inReplyTo ? await getMeta(account.id, msg.inReplyTo.messageId) : null;
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
      : `\n\nOn ${when}, ${original.from.name} <${original.from.email}> wrote:\n${quoteText(qt)}`;
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

let processing = false;
export async function processQueue(): Promise<void> {
  if (processing) return;
  processing = true;
  try {
    const due = await persist().dueQueue(Date.now());
    for (const row of due) {
      const claimed = await persist().updateQueue(row.id, { status: "sending" }, "queued");
      if (!claimed) continue;
      const account = await getAccount(row.account_id);
      if (!account) continue;
      const msg = JSON.parse(decrypt(row.payload)) as OutgoingMessage;
      emit(account.user_id, { type: "send", send: rowToQueued({ ...row, status: "sending" }) });
      try {
        const settings = await getUserSettings(account.user_id);
        const provider = await providerFor(account);
        const raw = await buildOutgoing(account, msg, typeof settings.signature === "string" ? settings.signature : "");
        const res = await provider.send(raw);
        const threadId = res.threadId ?? raw.threadId;
        await persist().updateQueue(row.id, { status: "sent", thread_id: threadId });
        emit(account.user_id, { type: "send", send: rowToQueued({ ...row, status: "sent", thread_id: threadId }) });
        if (threadId) await setThreadState(account.id, threadId, { waiting_dismissed_at: null, nudged: 0 });
        setTimeout(() => void syncNow(account.id), 1200).unref();
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await persist().updateQueue(row.id, { status: "failed", error: message });
        emit(account.user_id, { type: "send", send: rowToQueued({ ...row, status: "failed", error: message }) });
      }
    }
  } finally {
    processing = false;
  }
}

let queueTimer: NodeJS.Timeout | null = null;
export function startQueue(): void {
  if (queueTimer) return;
  void persist().requeueSending();
  queueTimer = setInterval(() => void processQueue(), 1000);
  queueTimer.unref();
}

// ---------- unsubscribe ----------

function isPrivateIp(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 100 && b >= 64 && b <= 127) || a >= 224;
  }
  const v = ip.toLowerCase();
  return v === "::1" || v === "::" || v.startsWith("fc") || v.startsWith("fd") || v.startsWith("fe80") || v.startsWith("::ffff:127.") || v.startsWith("::ffff:10.") || v.startsWith("::ffff:192.168.");
}

/** Only POST to public HTTPS hosts: the URL comes from an email header. */
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
    const addrs = await dns.lookup(url.hostname, { all: true });
    if (!addrs.length || addrs.some((a) => isPrivateIp(a.address))) return null;
  } catch {
    return null;
  }
  return url;
}

export async function unsubscribe(account: AccountRow, threadId: string): Promise<UnsubscribeResult> {
  const metas = (await threadMetas(account.id, threadId)).filter((m) => m.from.email !== account.email);
  const latest = metas[metas.length - 1];
  if (!latest) return { method: "none", url: null, message: "No message from a sender to unsubscribe from." };
  if (!latest.bulk?.listUnsubscribe) await fetchBody(account, latest.id).catch(() => null);
  const meta = (await getMeta(account.id, latest.id)) ?? latest;
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
    const provider = await providerFor(account);
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

// ---------- sweeps: bulk work proposed first, applied after review ----------

const SWEEPS: Record<SweepKind, { title: string; view: "updates" | "fyi" | "waiting"; extra: (now: number) => (r: { unread_count: number; last_date_ms: number }) => boolean; action: ThreadAction; verb: string }> = {
  "updates-read": { title: "Mark updates as read", view: "updates", extra: () => (r) => r.unread_count > 0, action: { type: "read" }, verb: "Mark read" },
  "updates-archive": { title: "Archive updates older than 2 days", view: "updates", extra: (now) => (r) => r.last_date_ms < now - 2 * 86400_000, action: { type: "archive" }, verb: "Archive" },
  "fyi-archive": { title: "Archive read FYI older than a week", view: "fyi", extra: (now) => (r) => r.unread_count === 0 && r.last_date_ms < now - 7 * 86400_000, action: { type: "archive" }, verb: "Archive" },
  "stale-waiting": { title: "Nudge threads with no reply in 3 days", view: "waiting", extra: (now) => (r) => r.last_date_ms < now - 3 * 86400_000, action: { type: "remind", at: "" }, verb: "Bring back" },
};

export async function startSweep(account: AccountRow, kind: SweepKind): Promise<Run> {
  const s = SWEEPS[kind];
  const now = Date.now();
  const rows = await sweepCandidates(account.id, s.view, s.extra(now));
  const senders = new Map<string, number>();
  for (const r of rows) senders.set(r.last_from_name, (senders.get(r.last_from_name) ?? 0) + 1);
  const top = [...senders.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3).map(([n, c]) => `${n} (${c})`).join(", ");
  const action: ThreadAction = kind === "stale-waiting" ? { type: "remind", at: new Date(now).toISOString() } : s.action;
  const run = startRun(account.user_id, {
    accountId: account.id, kind: "sweep", title: s.title, total: rows.length,
    state: rows.length ? "review" : "done",
    detail: rows.length ? `${rows.length} thread${rows.length === 1 ? "" : "s"}${top ? ` · mostly ${top}` : ""}` : "Nothing to do.",
    proposal: rows.length ? { threadIds: rows.map((r) => r.id), action, summary: `${s.verb} ${rows.length} thread${rows.length === 1 ? "" : "s"}` } : null,
  });
  setRunHandlers(run.id, {
    apply: async () => {
      updateRun(run.id, { state: "running", done: 0 });
      let done = 0;
      let failed = 0;
      for (let i = 0; i < rows.length; i += 50) {
        const ids = rows.slice(i, i + 50).map((r) => r.id);
        try {
          await applyAction(account, ids, action);
        } catch {
          failed += ids.length;
        }
        done += ids.length;
        updateRun(run.id, { done });
        if (getRunEntry(run.id)?.run.state === "cancelled") return;
      }
      updateRun(run.id, { state: failed ? "failed" : "applied", detail: `${s.verb === "Bring back" ? "Brought back" : s.verb === "Archive" ? "Archived" : "Marked read"} ${done - failed} thread${done - failed === 1 ? "" : "s"}${failed ? ` · ${failed} failed` : ""}`, error: failed ? `${failed} threads failed` : null });
    },
  });
  return run;
}

/** Bulk action on a large selection, reported as a background run. */
export function bulkAction(account: AccountRow, threadIds: string[], action: ThreadAction, label: string): Run {
  const run = startRun(account.user_id, { accountId: account.id, kind: "bulk", title: label, detail: `${threadIds.length} threads`, total: threadIds.length });
  void (async () => {
    let done = 0;
    let failed = 0;
    for (let i = 0; i < threadIds.length; i += 50) {
      const ids = threadIds.slice(i, i + 50);
      try {
        await applyAction(account, ids, action);
      } catch {
        failed += ids.length;
      }
      done += ids.length;
      updateRun(run.id, { done });
    }
    updateRun(run.id, { state: failed ? "failed" : "done", detail: `${done - failed} threads${failed ? ` · ${failed} failed` : ""}` });
  })();
  return run;
}
