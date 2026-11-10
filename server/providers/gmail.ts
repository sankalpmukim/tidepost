// Gmail backend over the Gmail REST API v1.
// https://developers.google.com/gmail/api/reference/rest
import type { AttachmentMeta, Folder, Person } from "../../shared/types";
import { buildMime, toBase64Url } from "../mime";
import { decodeMimeWords, parseAddressList } from "./address";
import { ApiError, apiFetch, mapLimit, type ApiRequest } from "./http";
import type {
  AttachmentData,
  BulkSignals,
  ChangesResult,
  InitialSyncResult,
  MailProvider,
  MessageBody,
  MessageChange,
  MessageMeta,
  RawOutgoing,
  SyncPage,
  TokenSource,
} from "./types";

// ---------- Gmail API response shapes (only the fields we use) ----------

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailPartBody {
  attachmentId?: string;
  size?: number;
  data?: string;
}

interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: GmailPartBody;
  parts?: GmailPart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailPart;
  sizeEstimate?: number;
}

interface GmailMessageRef {
  id: string;
  threadId?: string;
  labelIds?: string[];
}

interface GmailListResponse {
  messages?: GmailMessageRef[];
  nextPageToken?: string;
  resultSizeEstimate?: number;
}

interface GmailHistoryRecord {
  id: string;
  messages?: GmailMessageRef[];
  messagesAdded?: { message: GmailMessageRef }[];
  messagesDeleted?: { message: GmailMessageRef }[];
  labelsAdded?: { message: GmailMessageRef; labelIds?: string[] }[];
  labelsRemoved?: { message: GmailMessageRef; labelIds?: string[] }[];
}

interface GmailHistoryResponse {
  history?: GmailHistoryRecord[];
  nextPageToken?: string;
  historyId?: string;
}

interface GmailLabel {
  id: string;
  name: string;
  type?: "system" | "user";
  messagesTotal?: number;
  messagesUnread?: number;
  threadsTotal?: number;
  threadsUnread?: number;
  color?: { textColor?: string; backgroundColor?: string };
}

interface GmailProfile {
  emailAddress: string;
  messagesTotal?: number;
  threadsTotal?: number;
  historyId: string;
}

interface GmailThread {
  id: string;
  historyId?: string;
  messages?: GmailMessage[];
}

interface GmailAttachment {
  attachmentId?: string;
  size?: number;
  data?: string;
}

// ---------- constants ----------

const DEFAULT_BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

const METADATA_HEADERS = [
  "From",
  "To",
  "Cc",
  "Bcc",
  "Reply-To",
  "Subject",
  "Date",
  "Message-ID",
  "In-Reply-To",
  "References",
  "List-Id",
  "List-Unsubscribe",
  "List-Unsubscribe-Post",
  "Precedence",
  "Auto-Submitted",
  "Importance",
  "X-Priority",
];

/** Gmail system labels surfaced as folders, in display order. */
const SYSTEM_FOLDERS: { id: string; name: string }[] = [
  { id: "INBOX", name: "Inbox" },
  { id: "STARRED", name: "Starred" },
  { id: "SENT", name: "Sent" },
  { id: "DRAFT", name: "Drafts" },
  { id: "ARCHIVE", name: "Archive" },
  { id: "SPAM", name: "Spam" },
  { id: "TRASH", name: "Trash" },
];

/** Labels that become entries in MessageMeta.folders (STARRED is exposed as `starred`). */
const FOLDER_LABELS = new Set(["INBOX", "SENT", "DRAFT", "TRASH", "SPAM"]);

/**
 * Per-method quota cost in units (https://developers.google.com/gmail/api/reference/quota).
 * The per-user limit is 250 units/second (moving average).
 */
const COST = {
  profile: 1,
  labelsList: 1,
  labelsGet: 1,
  messagesList: 5,
  messagesGet: 5,
  attachmentsGet: 5,
  threadsGet: 10,
  historyList: 2,
  batchModify: 50,
  trash: 5,
  send: 100,
} as const;

/** Default pacing: 200 units/s ≈ 40 messages.get per second, below the 250 units/s per-user cap. */
const DEFAULT_UNITS_PER_SECOND = 200;
const DEFAULT_BURST_UNITS = 100;

const META_CONCURRENCY = 10;
const PAGE_SIZE = 100;

// ---------- helpers ----------

function abortableSleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error("Aborted"));
    const t = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(signal?.reason ?? new Error("Aborted"));
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

/** Token bucket measured in Gmail quota units. Requests are served in FIFO order. */
class QuotaLimiter {
  private tokens: number;
  private last = Date.now();
  private queue: Promise<void> = Promise.resolve();

  constructor(
    private readonly rate: number,
    private readonly burst: number,
  ) {
    this.tokens = burst;
  }

  take(units: number, signal?: AbortSignal): Promise<void> {
    if (!(this.rate > 0) || !Number.isFinite(this.rate)) return Promise.resolve();
    const run = this.queue.then(() => this.acquire(units, signal));
    this.queue = run.catch(() => undefined);
    return run;
  }

  private async acquire(units: number, signal?: AbortSignal): Promise<void> {
    const need = Math.min(units, this.burst);
    for (;;) {
      signal?.throwIfAborted();
      const now = Date.now();
      this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.rate);
      this.last = now;
      if (this.tokens >= need) {
        this.tokens -= need;
        return;
      }
      await abortableSleep(Math.ceil(((need - this.tokens) / this.rate) * 1000), signal);
    }
  }
}

const isNotFound = (err: unknown) => err instanceof ApiError && err.status === 404;

function headerMap(headers: GmailHeader[] | undefined): Map<string, string[]> {
  const m = new Map<string, string[]>();
  for (const h of headers ?? []) {
    const k = h.name.toLowerCase();
    const list = m.get(k);
    if (list) list.push(h.value);
    else m.set(k, [h.value]);
  }
  return m;
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
  nbsp: " ",
  hellip: "…",
  mdash: "—",
  ndash: "–",
  lsquo: "‘",
  rsquo: "’",
  ldquo: "“",
  rdquo: "”",
  copy: "©",
  reg: "®",
  trade: "™",
  zwnj: "‌",
};

/** Decode the HTML entities Gmail puts in `snippet` (&#39; &amp; &quot; ...). */
export function decodeHtmlEntities(s: string): string {
  return s.replace(/&(#x[0-9a-fA-F]+|#[0-9]+|[a-zA-Z]+);/g, (m, ent: string) => {
    if (ent[0] === "#") {
      const code = ent[1] === "x" || ent[1] === "X" ? parseInt(ent.slice(2), 16) : parseInt(ent.slice(1), 10);
      if (!Number.isFinite(code) || code < 0 || code > 0x10ffff) return m;
      try {
        return String.fromCodePoint(code);
      } catch {
        return m;
      }
    }
    return NAMED_ENTITIES[ent] ?? NAMED_ENTITIES[ent.toLowerCase()] ?? m;
  });
}

function decodeBase64Url(data: string): Buffer {
  return Buffer.from(data, "base64url");
}

function charsetOf(contentType: string | undefined): string {
  const m = contentType?.match(/charset\s*=\s*"?([^";\s]+)"?/i);
  return m ? m[1].toLowerCase() : "utf-8";
}

function decodeText(bytes: Buffer, charset: string): string {
  const label = charset === "us-ascii" || charset === "ascii" ? "utf-8" : charset;
  try {
    return new TextDecoder(label).decode(bytes);
  } catch {
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function categoryOf(labelIds: string[]): string | null {
  for (const l of labelIds) {
    if (l.startsWith("CATEGORY_")) return l.slice("CATEGORY_".length).toLowerCase();
  }
  return null;
}

function importanceOf(h: Map<string, string[]>): "low" | "normal" | "high" {
  const imp = h.get("importance")?.[0]?.trim().toLowerCase();
  if (imp === "high") return "high";
  if (imp === "low") return "low";
  const prio = h.get("x-priority")?.[0]?.trim();
  if (prio) {
    const n = parseInt(prio, 10);
    if (n === 1 || n === 2) return "high";
    if (n === 4 || n === 5) return "low";
  }
  return "normal";
}

/** User labels have ids like "Label_123"; system labels are all-caps identifiers. */
const isUserLabelId = (id: string) => !/^[A-Z][A-Z0-9_]*$/.test(id);

export function gmailFolders(labelIds: string[]): string[] {
  const folders: string[] = [];
  for (const l of labelIds) {
    if (FOLDER_LABELS.has(l) || isUserLabelId(l)) folders.push(l);
  }
  // Gmail has no archive folder: a message with none of these labels lives only in "All mail".
  // Sent messages without INBOX are not "archived" — they stay in SENT only.
  if (!labelIds.some((l) => l === "INBOX" || l === "TRASH" || l === "SPAM" || l === "DRAFT" || l === "SENT")) {
    folders.push("ARCHIVE");
  }
  return folders;
}

function firstNonEmpty(...vals: (string | undefined)[]): string | null {
  for (const v of vals) {
    const t = v?.trim();
    if (t) return t;
  }
  return null;
}

/** Map a Gmail message (format=metadata or full) to our MessageMeta. */
export function gmailMessageToMeta(m: GmailMessage): MessageMeta {
  const h = headerMap(m.payload?.headers);
  const one = (name: string) => h.get(name.toLowerCase())?.[0];
  const all = (name: string) => (h.get(name.toLowerCase()) ?? []).join(", ");
  const labelIds = m.labelIds ?? [];

  const from: Person = parseAddressList(all("From"))[0] ?? { name: "Unknown sender", email: "" };

  let date: string;
  const internal = m.internalDate ? Number(m.internalDate) : NaN;
  if (Number.isFinite(internal) && internal > 0) date = new Date(internal).toISOString();
  else {
    const parsed = Date.parse(one("Date") ?? "");
    date = new Date(Number.isNaN(parsed) ? 0 : parsed).toISOString();
  }

  const bulk: BulkSignals = {
    listId: firstNonEmpty(one("List-Id")),
    listUnsubscribe: firstNonEmpty(one("List-Unsubscribe")),
    listUnsubscribePost: firstNonEmpty(one("List-Unsubscribe-Post")),
    precedence: firstNonEmpty(one("Precedence"))?.toLowerCase() ?? null,
    autoSubmitted: firstNonEmpty(one("Auto-Submitted"))?.toLowerCase() ?? null,
  };

  return {
    id: m.id,
    threadId: m.threadId,
    from,
    to: parseAddressList(all("To")),
    cc: parseAddressList(all("Cc")),
    bcc: parseAddressList(all("Bcc")),
    replyTo: parseAddressList(all("Reply-To")),
    subject: decodeMimeWords(one("Subject") ?? "").replace(/\s+/g, " ").trim(),
    snippet: decodeHtmlEntities(m.snippet ?? ""),
    date,
    unread: labelIds.includes("UNREAD"),
    starred: labelIds.includes("STARRED"),
    folders: gmailFolders(labelIds),
    // The metadata format carries no attachment flag. A top-level multipart/mixed is the
    // standard shape of a message with attachments, so use it as the heuristic; getBody
    // returns the authoritative attachment list.
    hasAttachments: m.payload?.mimeType?.toLowerCase() === "multipart/mixed",
    messageIdHeader: firstNonEmpty(one("Message-ID")),
    inReplyTo: firstNonEmpty(one("In-Reply-To")),
    references: firstNonEmpty(one("References"))?.replace(/\s+/g, " ") ?? null,
    bulk,
    category: categoryOf(labelIds),
    importance: importanceOf(h),
    sizeEstimate: m.sizeEstimate ?? 0,
  };
}

// ---------- body / attachment walking ----------

interface PartInfo {
  mimeType: string;
  filename: string;
  disposition: string | null;
  contentId: string | null;
  charset: string;
}

function partInfo(p: GmailPart): PartInfo {
  const h = headerMap(p.headers);
  const cd = h.get("content-disposition")?.[0] ?? null;
  const cid = h.get("content-id")?.[0]?.trim().replace(/^<|>$/g, "");
  return {
    mimeType: (p.mimeType ?? "application/octet-stream").toLowerCase(),
    filename: decodeMimeWords(p.filename ?? "").trim(),
    disposition: cd ? cd.split(";")[0].trim().toLowerCase() : null,
    contentId: cid ? cid : null,
    charset: charsetOf(h.get("content-type")?.[0]),
  };
}

/** A text/plain or text/html leaf that is part of the message body rather than an attachment. */
function isBodyText(p: GmailPart, info: PartInfo): boolean {
  return (
    (info.mimeType === "text/plain" || info.mimeType === "text/html") &&
    !info.filename &&
    info.disposition !== "attachment" &&
    !p.parts?.length
  );
}

function defaultFilename(info: PartInfo): string {
  if (info.mimeType === "message/rfc822") return "message.eml";
  const sub = info.mimeType.split("/")[1] ?? "bin";
  const ext = { jpeg: "jpg", plain: "txt", "svg+xml": "svg" }[sub] ?? sub.replace(/[^a-z0-9]/g, "");
  return `${info.contentId ? "inline" : "attachment"}.${ext || "bin"}`;
}

/** All attachment-like leaves of a payload (does not descend into message/rfc822). */
function collectAttachments(root: GmailPart | undefined): { part: GmailPart; meta: AttachmentMeta }[] {
  const out: { part: GmailPart; meta: AttachmentMeta }[] = [];
  const walk = (p: GmailPart) => {
    const info = partInfo(p);
    if (info.mimeType.startsWith("multipart/") && p.parts?.length) {
      for (const c of p.parts) walk(c);
      return;
    }
    if (isBodyText(p, info)) return;
    const attachmentId = p.body?.attachmentId;
    if (!info.filename && !attachmentId && info.mimeType !== "message/rfc822") return;
    const id = attachmentId ?? p.partId ?? "";
    if (!id) return;
    out.push({
      part: p,
      meta: {
        id,
        filename: info.filename || defaultFilename(info),
        mimeType: info.mimeType,
        size: p.body?.size ?? 0,
        inline: info.mimeType.startsWith("image/") && (info.disposition === "inline" || info.contentId !== null),
        contentId: info.contentId,
      },
    });
  };
  if (root) walk(root);
  return out;
}

function findPart(root: GmailPart | undefined, pred: (p: GmailPart) => boolean): GmailPart | null {
  if (!root) return null;
  if (pred(root)) return root;
  for (const c of root.parts ?? []) {
    const f = findPart(c, pred);
    if (f) return f;
  }
  return null;
}

// ---------- provider ----------

export interface GmailProviderOptions {
  baseUrl?: string;
  /** Quota pacing in Gmail units per second (default 200; 0 disables pacing, e.g. in tests). */
  quotaUnitsPerSecond?: number;
}

type AttachmentInfo = { filename: string; mimeType: string; size: number };

export class GmailProvider implements MailProvider {
  readonly kind = "gmail" as const;
  readonly folderStyle = "label" as const;

  private readonly base: string;
  private readonly limiter: QuotaLimiter;
  /** messageId -> (attachment id -> info), most recent last. */
  private readonly attachmentCache = new Map<string, Map<string, AttachmentInfo>>();

  constructor(
    private readonly tokens: TokenSource,
    opts: GmailProviderOptions = {},
  ) {
    this.base = (opts.baseUrl ?? DEFAULT_BASE).replace(/\/$/, "");
    this.limiter = new QuotaLimiter(opts.quotaUnitsPerSecond ?? DEFAULT_UNITS_PER_SECOND, DEFAULT_BURST_UNITS);
  }

  // ----- transport -----

  private url(path: string, params?: [string, string][]): string {
    const qs = params?.length ? "?" + new URLSearchParams(params).toString() : "";
    return `${this.base}${path}${qs}`;
  }

  private async call<T>(cost: number, path: string, params?: [string, string][], req: ApiRequest = {}): Promise<T> {
    await this.limiter.take(cost, req.signal);
    return apiFetch<T>(this.tokens, this.url(path, params), req);
  }

  private metadataParams(): [string, string][] {
    return [["format", "metadata"], ...METADATA_HEADERS.map((h): [string, string] => ["metadataHeaders", h])];
  }

  /** Metadata for one message; null when it no longer exists. */
  private async fetchMeta(id: string, signal?: AbortSignal): Promise<MessageMeta | null> {
    try {
      const m = await this.call<GmailMessage>(COST.messagesGet, `/messages/${encodeURIComponent(id)}`, this.metadataParams(), {
        signal,
      });
      return gmailMessageToMeta(m);
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  private async fetchMetas(ids: string[], signal?: AbortSignal): Promise<{ messages: MessageMeta[]; missing: string[] }> {
    const results = await mapLimit(ids, META_CONCURRENCY, (id) => this.fetchMeta(id, signal));
    const messages: MessageMeta[] = [];
    const missing: string[] = [];
    results.forEach((r, i) => (r ? messages.push(r) : missing.push(ids[i])));
    return { messages, missing };
  }

  /** Page through messages.list collecting up to `limit` ids, newest first. */
  private async listIds(limit: number, q: string | null, signal?: AbortSignal): Promise<string[]> {
    const ids: string[] = [];
    const seen = new Set<string>();
    let pageToken: string | undefined;
    while (ids.length < limit) {
      signal?.throwIfAborted();
      const params: [string, string][] = [["maxResults", String(Math.min(500, limit - ids.length))]];
      if (q) params.push(["q", q]);
      if (pageToken) params.push(["pageToken", pageToken]);
      const res = await this.call<GmailListResponse>(COST.messagesList, "/messages", params, { signal });
      for (const m of res.messages ?? []) {
        if (seen.has(m.id)) continue;
        seen.add(m.id);
        ids.push(m.id);
        if (ids.length >= limit) break;
      }
      pageToken = res.nextPageToken;
      if (!pageToken) break;
    }
    return ids;
  }

  // ----- MailProvider -----

  async getProfile(): Promise<Person> {
    const p = await this.call<GmailProfile>(COST.profile, "/profile");
    const email = p.emailAddress.toLowerCase();
    // No People API scope: the account layer replaces this with the id_token name.
    return { name: email.split("@")[0], email };
  }

  async listFolders(): Promise<Folder[]> {
    const res = await this.call<{ labels?: GmailLabel[] }>(COST.labelsList, "/labels");
    const labels = res.labels ?? [];
    const systemIds = new Set(SYSTEM_FOLDERS.map((f) => f.id));
    const wanted = labels.filter((l) => (l.type === "user" ? true : systemIds.has(l.id)));
    // labels.list omits counts; labels.get includes them.
    const detailed = await mapLimit(wanted, 8, async (l) => {
      try {
        return await this.call<GmailLabel>(COST.labelsGet, `/labels/${encodeURIComponent(l.id)}`);
      } catch (err) {
        if (isNotFound(err)) return null;
        throw err;
      }
    });
    const byId = new Map<string, GmailLabel>();
    detailed.forEach((d, i) => byId.set(wanted[i].id, d ?? wanted[i]));

    const folders: Folder[] = [];
    for (const sys of SYSTEM_FOLDERS) {
      const l = byId.get(sys.id);
      if (!l && sys.id !== "ARCHIVE") continue;
      folders.push({
        id: sys.id,
        name: sys.name,
        kind: "system",
        style: "label",
        unread: l?.messagesUnread ?? 0,
        total: l?.messagesTotal ?? 0,
        color: null,
      });
    }
    const user = wanted
      .filter((l) => l.type === "user")
      .map((l) => byId.get(l.id) ?? l)
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
    for (const l of user) {
      folders.push({
        id: l.id,
        name: l.name,
        kind: "user",
        style: "label",
        unread: l.messagesUnread ?? 0,
        total: l.messagesTotal ?? 0,
        color: l.color?.backgroundColor ?? null,
      });
    }
    return folders;
  }

  async initialSync(opts: {
    maxMessages: number;
    onPage: (page: SyncPage, progress: { done: number; total: number }) => Promise<void> | void;
    signal?: AbortSignal;
  }): Promise<InitialSyncResult> {
    const { signal } = opts;
    signal?.throwIfAborted();
    // Read the history id first so nothing that changes during the listing is lost.
    const profile = await this.call<GmailProfile>(COST.profile, "/profile", undefined, { signal });
    const cursor = profile.historyId;

    // messages.list excludes SPAM and TRASH unless includeSpamTrash is set.
    const ids = await this.listIds(Math.max(0, opts.maxMessages), null, signal);
    const total = ids.length;
    let done = 0;
    for (let i = 0; i < ids.length; i += PAGE_SIZE) {
      signal?.throwIfAborted();
      const chunk = ids.slice(i, i + PAGE_SIZE);
      const { messages, missing } = await this.fetchMetas(chunk, signal);
      done += chunk.length;
      await opts.onPage({ messages, deleted: missing }, { done, total });
    }
    if (total === 0) await opts.onPage({ messages: [], deleted: [] }, { done: 0, total: 0 });
    return { cursor };
  }

  async changes(cursor: string): Promise<ChangesResult> {
    const state = new Map<string, "upsert" | "deleted">();
    let pageToken: string | undefined;
    let newCursor = cursor;
    try {
      do {
        const params: [string, string][] = [
          ["startHistoryId", cursor],
          ["historyTypes", "messageAdded"],
          ["historyTypes", "messageDeleted"],
          ["historyTypes", "labelAdded"],
          ["historyTypes", "labelRemoved"],
          ["maxResults", "500"],
        ];
        if (pageToken) params.push(["pageToken", pageToken]);
        const res = await this.call<GmailHistoryResponse>(COST.historyList, "/history", params);
        for (const rec of res.history ?? []) {
          for (const e of rec.messagesDeleted ?? []) state.set(e.message.id, "deleted");
          const touched = [
            ...(rec.messagesAdded ?? []),
            ...(rec.labelsAdded ?? []),
            ...(rec.labelsRemoved ?? []),
          ];
          for (const e of touched) if (state.get(e.message.id) !== "deleted") state.set(e.message.id, "upsert");
        }
        if (res.historyId) newCursor = res.historyId;
        pageToken = res.nextPageToken;
      } while (pageToken);
    } catch (err) {
      // 404: startHistoryId is older than Gmail keeps history (typically ~1 week) or invalid.
      if (isNotFound(err)) return { messages: [], deleted: [], cursor, resetRequired: true };
      throw err;
    }

    const deleted = [...state].filter(([, s]) => s === "deleted").map(([id]) => id);
    const upserts = [...state].filter(([, s]) => s === "upsert").map(([id]) => id);
    const { messages, missing } = await this.fetchMetas(upserts);
    return { messages, deleted: [...deleted, ...missing], cursor: newCursor, resetRequired: false };
  }

  async threadMessages(threadId: string): Promise<MessageMeta[]> {
    const t = await this.call<GmailThread>(COST.threadsGet, `/threads/${encodeURIComponent(threadId)}`, this.metadataParams());
    return (t.messages ?? []).map(gmailMessageToMeta).sort((a, b) => a.date.localeCompare(b.date));
  }

  private async fetchAttachmentData(messageId: string, attachmentId: string): Promise<GmailAttachment> {
    return this.call<GmailAttachment>(
      COST.attachmentsGet,
      `/messages/${encodeURIComponent(messageId)}/attachments/${encodeURIComponent(attachmentId)}`,
    );
  }

  private async fetchFull(messageId: string): Promise<GmailMessage> {
    return this.call<GmailMessage>(COST.messagesGet, `/messages/${encodeURIComponent(messageId)}`, [["format", "full"]]);
  }

  /** Remember attachment names from the last few getBody calls for getAttachment. */
  private rememberAttachments(messageId: string, list: AttachmentMeta[]) {
    const m = new Map<string, AttachmentInfo>();
    for (const a of list) m.set(a.id, { filename: a.filename, mimeType: a.mimeType, size: a.size });
    this.attachmentCache.delete(messageId);
    this.attachmentCache.set(messageId, m);
    while (this.attachmentCache.size > 16) {
      const oldest = this.attachmentCache.keys().next().value;
      if (oldest === undefined) break;
      this.attachmentCache.delete(oldest);
    }
  }

  async getBody(messageId: string): Promise<MessageBody> {
    const msg = await this.fetchFull(messageId);
    const payload = msg.payload;

    const readText = async (p: GmailPart, info: PartInfo): Promise<string> => {
      let bytes: Buffer | null = null;
      if (p.body?.data) bytes = decodeBase64Url(p.body.data);
      else if (p.body?.attachmentId) {
        // Large bodies are stored out of line like attachments.
        const a = await this.fetchAttachmentData(messageId, p.body.attachmentId);
        bytes = a.data ? decodeBase64Url(a.data) : null;
      }
      return bytes ? decodeText(bytes, info.charset) : "";
    };

    interface Collected {
      html: string[];
      text: string[];
    }
    const collect = async (p: GmailPart): Promise<Collected> => {
      const info = partInfo(p);
      if (info.mimeType.startsWith("multipart/")) {
        const children = await Promise.all((p.parts ?? []).map(collect));
        if (info.mimeType === "multipart/alternative") {
          // Alternatives are ordered least to most faithful: take the last HTML and the first plain text.
          const html = [...children].reverse().find((c) => c.html.length)?.html ?? [];
          const text = children.find((c) => c.text.length)?.text ?? [];
          return { html, text };
        }
        // mixed / related / signed / report...: body pieces in order.
        return { html: children.flatMap((c) => c.html), text: children.flatMap((c) => c.text) };
      }
      // message/rfc822 and other non-text parts are attachments, not body.
      if (!isBodyText(p, info)) return { html: [], text: [] };
      const s = await readText(p, info);
      return info.mimeType === "text/html" ? { html: [s], text: [] } : { html: [], text: [s] };
    };

    const body = payload ? await collect(payload) : { html: [], text: [] };
    const attachments = collectAttachments(payload).map((a) => a.meta);
    this.rememberAttachments(messageId, attachments);

    return {
      id: msg.id,
      html: body.html.length ? body.html.join("\n") : null,
      text: body.text.length ? body.text.join("\n") : null,
      uniqueHtml: null,
      attachments,
    };
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData> {
    let info = this.attachmentCache.get(messageId)?.get(attachmentId);
    let payload: GmailPart | undefined;

    // A partId (used for small attachments whose data Gmail returns inline) or a cache miss
    // needs the message structure.
    const isPartId = /^\d+(\.\d+)*$/.test(attachmentId);
    if (!info || isPartId) {
      const full = await this.fetchFull(messageId);
      payload = full.payload;
      const found = collectAttachments(payload).find((a) => a.meta.id === attachmentId || a.part.partId === attachmentId);
      if (found) info = { filename: found.meta.filename, mimeType: found.meta.mimeType, size: found.meta.size };
      if (isPartId) {
        const part = findPart(payload, (p) => p.partId === attachmentId);
        if (!part) throw new ApiError(404, `Attachment part ${attachmentId} not found`, this.base);
        const pi = partInfo(part);
        const data = part.body?.data
          ? decodeBase64Url(part.body.data)
          : part.body?.attachmentId
            ? decodeBase64Url((await this.fetchAttachmentData(messageId, part.body.attachmentId)).data ?? "")
            : Buffer.alloc(0);
        return {
          filename: info?.filename ?? (pi.filename || defaultFilename(pi)),
          mimeType: info?.mimeType ?? pi.mimeType,
          data,
        };
      }
    }

    const res = await this.fetchAttachmentData(messageId, attachmentId);
    const data = decodeBase64Url(res.data ?? "");
    if (!info && payload) {
      // Gmail attachment ids change between messages.get calls; fall back to a unique size match.
      const sameSize = collectAttachments(payload).filter((a) => a.meta.size === (res.size ?? data.length));
      if (sameSize.length === 1) info = sameSize[0].meta;
    }
    return {
      filename: info?.filename ?? "attachment",
      mimeType: info?.mimeType ?? "application/octet-stream",
      data,
    };
  }

  async modify(messageIds: string[], change: MessageChange): Promise<void> {
    const ids = [...new Set(messageIds)];
    if (!ids.length) return;

    const batch = async (add: string[], remove: string[]) => {
      for (let i = 0; i < ids.length; i += 1000) {
        const body: { ids: string[]; addLabelIds?: string[]; removeLabelIds?: string[] } = { ids: ids.slice(i, i + 1000) };
        if (add.length) body.addLabelIds = add;
        if (remove.length) body.removeLabelIds = remove;
        await this.call<void>(COST.batchModify, "/messages/batchModify", undefined, { method: "POST", body });
      }
    };

    switch (change.kind) {
      case "read":
        return change.value ? batch([], ["UNREAD"]) : batch(["UNREAD"], []);
      case "starred":
        return change.value ? batch(["STARRED"], []) : batch([], ["STARRED"]);
      case "archive":
        return batch([], ["INBOX"]);
      case "inbox":
        return batch(["INBOX"], ["TRASH", "SPAM"]);
      case "trash":
        // One batched call instead of one POST per message: trashing a long
        // thread used to take one round trip per message.
        return batch(["TRASH"], ["INBOX"]);
      case "spam":
        return batch(["SPAM"], ["INBOX"]);
      case "addLabel":
        if (change.folderId === "ARCHIVE") return batch([], ["INBOX"]);
        return batch([change.folderId], []);
      case "removeLabel":
        if (change.folderId === "ARCHIVE") return batch(["INBOX"], []);
        return batch([], [change.folderId]);
      case "move":
        // Gmail has no exclusive folders; emulate "move" with labels.
        switch (change.folderId) {
          case "INBOX":
            return batch(["INBOX"], ["TRASH", "SPAM"]);
          case "ARCHIVE":
            return batch([], ["INBOX"]);
          case "TRASH":
            return batch(["TRASH"], ["INBOX"]);
          case "SPAM":
            return batch(["SPAM"], ["INBOX"]);
          default:
            return batch([change.folderId], ["INBOX"]);
        }
    }
  }

  async send(msg: RawOutgoing): Promise<{ id: string | null; threadId: string | null }> {
    const raw = toBase64Url(buildMime(msg));
    const body: { raw: string; threadId?: string } = { raw };
    // Gmail threads a reply only when threadId is given and the References/In-Reply-To
    // headers and the subject match the thread.
    if ((msg.mode === "reply" || msg.mode === "replyAll") && msg.threadId) body.threadId = msg.threadId;
    const res = await this.call<GmailMessage>(COST.send, "/messages/send", undefined, { method: "POST", body });
    return { id: res?.id ?? null, threadId: res?.threadId ?? null };
  }

  async search(query: string, limit: number): Promise<MessageMeta[]> {
    const ids = await this.listIds(Math.max(0, Math.min(limit, 500)), query);
    const { messages } = await this.fetchMetas(ids);
    return messages;
  }
}
