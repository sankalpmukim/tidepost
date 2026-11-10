// Microsoft Graph (Outlook / Microsoft 365 / Outlook.com) mail provider.
//
// Notes for maintainers:
// - Every request carries `Prefer: IdType="ImmutableId"` so message ids survive
//   moves between folders (archive, trash, move). Without it Graph hands out a
//   new id whenever an item changes folder.
// - Thread id = Graph `conversationId`.
// - Sync uses per-folder message delta queries; the cursor is a JSON object
//   { [graphFolderId]: deltaLink }.
// - Bulk-mail headers (List-Unsubscribe, ...) and In-Reply-To/References are not
//   cheaply available in list/delta calls, so MessageMeta leaves them null during
//   sync; getBody() fetches internetMessageHeaders and returns them in `headers`.
import type { AttachmentMeta, Folder, Person } from "../../shared/types";
import { ApiError, apiFetch, mapLimit } from "./http";
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

const DEFAULT_BASE_URL = "https://graph.microsoft.com/v1.0";
const PREFER_IMMUTABLE = 'IdType="ImmutableId"';
const PREFER_HTML = 'outlook.body-content-type="html"';
const PREFER_DELTA_PAGE = "odata.maxpagesize=100";

/** Graph JSON batching accepts at most 20 sub-requests per batch. */
const BATCH_SIZE = 20;
const BATCH_MAX_ATTEMPTS = 6;
/** Outlook allows ~4 concurrent requests per mailbox; leave room for user actions. */
const MAILBOX_CONCURRENCY = 3;
/** Single-POST attachments (and sendMail payloads) must stay under Graph's 4 MB request cap after base64. */
const SMALL_ATTACHMENT_LIMIT = 3 * 1024 * 1024;
/** Upload-session chunks must be multiples of 320 KiB and below 4 MiB: 12 × 320 KiB = 3.75 MiB. */
const UPLOAD_CHUNK = 320 * 1024 * 12;
/** Inline images up to this size are fetched individually to learn their contentId. */
const INLINE_DETAIL_LIMIT = 4 * 1024 * 1024;
const BYTES_CACHE_LIMIT = 16 * 1024 * 1024;
/** How often changes() re-lists folders to pick up newly created ones. */
const FOLDER_SCAN_INTERVAL_MS = 10 * 60 * 1000;

const META_SELECT = [
  "id",
  "conversationId",
  "subject",
  "bodyPreview",
  "from",
  "sender",
  "toRecipients",
  "ccRecipients",
  "bccRecipients",
  "replyTo",
  "receivedDateTime",
  "sentDateTime",
  "isRead",
  "isDraft",
  "flag",
  "hasAttachments",
  "parentFolderId",
  "internetMessageId",
  "importance",
  "inferenceClassification",
].join(",");

type SystemName = "INBOX" | "SENT" | "DRAFT" | "TRASH" | "SPAM" | "ARCHIVE";

/** Well-known Graph folder name → normalized system id + display name (in listFolders order). */
const WELL_KNOWN: ReadonlyArray<{ wk: string; system: SystemName; name: string }> = [
  { wk: "inbox", system: "INBOX", name: "Inbox" },
  { wk: "sentitems", system: "SENT", name: "Sent" },
  { wk: "drafts", system: "DRAFT", name: "Drafts" },
  { wk: "archive", system: "ARCHIVE", name: "Archive" },
  { wk: "junkemail", system: "SPAM", name: "Spam" },
  { wk: "deleteditems", system: "TRASH", name: "Trash" },
];
const SYSTEM_TO_WK = new Map(WELL_KNOWN.map((w) => [w.system, w.wk]));
const SYSTEM_NAME = new Map(WELL_KNOWN.map((w) => [w.system, w.name]));
/** System-ish folders that are noise in a mail client. */
const NOISE_WELL_KNOWN = ["outbox", "conversationhistory", "syncissues"];
const NOISE_NAMES = /^(conversation history|outbox|sync issues|conflicts|local failures|server failures)( \(this computer only\))?$/i;
const SYNCED_SYSTEM = new Set<SystemName>(["INBOX", "SENT", "DRAFT", "ARCHIVE"]);
const AUTOMATED_SENDER =
  /^(no[-_.]?reply|do[-_.]?not[-_.]?reply|notifications?|notify|alerts?|mailer-daemon|postmaster|bounces?)([+._-]|$)/i;

// ---------- Graph shapes (only the fields we read) ----------

interface GraphEmailAddress {
  name?: string | null;
  address?: string | null;
}
interface GraphRecipient {
  emailAddress?: GraphEmailAddress | null;
}
interface GraphHeader {
  name?: string;
  value?: string;
}
interface GraphItemBody {
  contentType?: string | null;
  content?: string | null;
}
interface GraphMessage {
  id: string;
  conversationId?: string | null;
  subject?: string | null;
  bodyPreview?: string | null;
  from?: GraphRecipient | null;
  sender?: GraphRecipient | null;
  toRecipients?: GraphRecipient[] | null;
  ccRecipients?: GraphRecipient[] | null;
  bccRecipients?: GraphRecipient[] | null;
  replyTo?: GraphRecipient[] | null;
  receivedDateTime?: string | null;
  sentDateTime?: string | null;
  isRead?: boolean | null;
  isDraft?: boolean | null;
  flag?: { flagStatus?: string | null } | null;
  hasAttachments?: boolean | null;
  parentFolderId?: string | null;
  internetMessageId?: string | null;
  importance?: string | null;
  inferenceClassification?: string | null;
  internetMessageHeaders?: GraphHeader[] | null;
  body?: GraphItemBody | null;
  uniqueBody?: GraphItemBody | null;
  "@removed"?: { reason?: string } | null;
}
interface GraphFolder {
  id: string;
  displayName?: string | null;
  parentFolderId?: string | null;
  childFolderCount?: number | null;
  unreadItemCount?: number | null;
  totalItemCount?: number | null;
  isHidden?: boolean | null;
  /** Beta-only property; used when present. */
  wellKnownName?: string | null;
}
interface GraphAttachment {
  "@odata.type"?: string;
  id: string;
  name?: string | null;
  contentType?: string | null;
  size?: number | null;
  isInline?: boolean | null;
  contentId?: string | null;
  contentBytes?: string | null;
}
interface GraphList<T> {
  value?: T[];
  "@odata.nextLink"?: string;
  "@odata.deltaLink"?: string;
}
interface BatchSubRequest {
  id: string;
  method: string;
  url: string;
  body?: unknown;
}
interface BatchSubResponse {
  id: string;
  status: number;
  headers?: Record<string, string>;
  body?: unknown;
}

interface WellKnownMap {
  idToSystem: Map<string, SystemName>;
  systemToId: Map<SystemName, string>;
  noise: Set<string>;
}
interface FolderNode {
  folder: GraphFolder;
  name: string;
  system: SystemName | null;
}

// ---------- helpers ----------

const enc = encodeURIComponent;
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function qs(params: Record<string, string | undefined>): string {
  return Object.entries(params)
    .filter((e): e is [string, string] => e[1] !== undefined)
    .map(([k, v]) => `${k}=${enc(v)}`)
    .join("&");
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function isGraphMessage(v: unknown): v is GraphMessage {
  return isRecord(v) && typeof v.id === "string";
}

function toPerson(r: GraphRecipient | null | undefined): Person | null {
  const address = r?.emailAddress?.address?.trim() ?? "";
  const name = r?.emailAddress?.name?.trim() ?? "";
  if (!address) return null;
  const email = address.toLowerCase();
  return { name: name || email.split("@")[0], email };
}

function toPeople(list: GraphRecipient[] | null | undefined): Person[] {
  return (list ?? []).map(toPerson).filter((p): p is Person => p !== null);
}

function toRecipients(list: Person[]): GraphRecipient[] {
  return list.map((p) => ({ emailAddress: { name: p.name || p.email, address: p.email } }));
}

function isoDate(v: string | null | undefined): string {
  const t = v ? Date.parse(v) : NaN;
  return new Date(Number.isNaN(t) ? 0 : t).toISOString();
}

function angle(v: string | null | undefined): string | null {
  const s = v?.trim();
  if (!s) return null;
  return s.startsWith("<") ? s : `<${s}>`;
}

function headerLookup(headers: GraphHeader[] | null | undefined): (name: string) => string | null {
  const map = new Map<string, string>();
  for (const h of headers ?? []) {
    if (!h.name || h.value === undefined) continue;
    const k = h.name.toLowerCase();
    // Keep the first occurrence (topmost header), like a mail client would.
    if (!map.has(k)) map.set(k, h.value);
  }
  return (name) => map.get(name.toLowerCase())?.trim() || null;
}

function stripAngles(v: string | null | undefined): string | null {
  const s = v?.trim();
  if (!s) return null;
  return s.replace(/^<(.*)>$/, "$1");
}

function textToHtml(text: string): string {
  const esc = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  return `<div style="white-space:pre-wrap">${esc}</div>`;
}

function isResetError(err: unknown): boolean {
  if (!(err instanceof ApiError)) return false;
  if (err.status === 410 || err.status === 404) return true;
  return /syncStateNotFound|syncStateInvalid|resyncRequired|ErrorInvalidSyncStateData/i.test(err.body);
}

function headerValue(headers: Record<string, string> | undefined, name: string): string | undefined {
  if (!headers) return undefined;
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  return key ? headers[key] : undefined;
}

function batchErrorMessage(r: BatchSubResponse): string {
  if (isRecord(r.body) && isRecord(r.body.error) && typeof r.body.error.message === "string") {
    const code = typeof r.body.error.code === "string" ? `${r.body.error.code}: ` : "";
    return `HTTP ${r.status} ${code}${r.body.error.message}`;
  }
  return `HTTP ${r.status}`;
}

export class OutlookProvider implements MailProvider {
  readonly kind = "outlook" as const;
  readonly folderStyle = "folder" as const;

  private readonly tokens: TokenSource;
  private readonly baseUrl: string;
  private readonly origin: string;
  private wellKnownPromise: Promise<WellKnownMap> | null = null;
  private lastFolderScan = 0;
  private readonly attachmentInfo = new Map<string, { filename: string; mimeType: string; kind: "file" | "item" | "reference" }>();
  private readonly bytesCache = new Map<string, AttachmentData>();
  private bytesCacheSize = 0;

  constructor(tokens: TokenSource, opts: { baseUrl?: string } = {}) {
    this.tokens = tokens;
    this.baseUrl = (opts.baseUrl ?? DEFAULT_BASE_URL).replace(/\/$/, "");
    this.origin = new URL(this.baseUrl).origin;
  }

  // ---------- HTTP ----------

  private url(pathOrUrl: string): string {
    if (/^https?:\/\//i.test(pathOrUrl)) {
      // nextLink / deltaLink: never send our bearer token anywhere but Graph.
      if (new URL(pathOrUrl).origin !== this.origin) throw new Error(`Refusing to follow a link outside Microsoft Graph: ${pathOrUrl}`);
      return pathOrUrl;
    }
    return this.baseUrl + pathOrUrl;
  }

  private request<T>(
    pathOrUrl: string,
    opts: { method?: string; body?: unknown; prefer?: string[]; raw?: boolean; signal?: AbortSignal } = {},
  ): Promise<T> {
    return apiFetch<T>(this.tokens, this.url(pathOrUrl), {
      method: opts.method,
      body: opts.body,
      raw: opts.raw,
      signal: opts.signal,
      headers: { Prefer: [PREFER_IMMUTABLE, ...(opts.prefer ?? [])].join(", ") },
    });
  }

  /** GET a collection and follow @odata.nextLink; stops early once `limit` items are collected. */
  private async getAll<T>(path: string, limit = Infinity, prefer?: string[]): Promise<T[]> {
    const out: T[] = [];
    let next: string | undefined = path;
    while (next && out.length < limit) {
      const page: GraphList<T> = await this.request<GraphList<T>>(next, { prefer });
      out.push(...(page.value ?? []));
      next = page["@odata.nextLink"];
    }
    return out;
  }

  /**
   * POST /$batch in chunks of 20, retrying sub-requests that come back 429/5xx
   * (Outlook throttles concurrent sub-requests per mailbox). Returns one
   * response per request, in order; the caller inspects statuses.
   */
  private async batch(requests: BatchSubRequest[]): Promise<BatchSubResponse[]> {
    const results = new Map<string, BatchSubResponse>();
    for (let i = 0; i < requests.length; i += BATCH_SIZE) {
      let pending = requests.slice(i, i + BATCH_SIZE);
      for (let attempt = 0; pending.length; attempt++) {
        const res = await this.request<{ responses?: BatchSubResponse[] }>("/$batch", {
          method: "POST",
          body: {
            requests: pending.map((r) => ({
              id: r.id,
              method: r.method,
              url: r.url,
              headers: {
                Prefer: PREFER_IMMUTABLE,
                ...(r.body !== undefined ? { "Content-Type": "application/json" } : {}),
              },
              ...(r.body !== undefined ? { body: r.body } : {}),
            })),
          },
        });
        const byId = new Map((res?.responses ?? []).map((r) => [String(r.id), r]));
        const retry: BatchSubRequest[] = [];
        let wait = 0;
        for (const r of pending) {
          const sr = byId.get(r.id) ?? { id: r.id, status: 0 };
          const retryable = sr.status === 0 || sr.status === 429 || sr.status >= 500;
          if (retryable && attempt < BATCH_MAX_ATTEMPTS - 1) {
            retry.push(r);
            const ra = Number(headerValue(sr.headers, "Retry-After"));
            wait = Math.max(wait, Number.isFinite(ra) ? Math.min(ra * 1000, 60_000) : Math.min(1000 * 2 ** attempt, 30_000));
          } else {
            results.set(r.id, sr);
          }
        }
        pending = retry;
        if (pending.length) await sleep(wait);
      }
    }
    return requests.map((r) => results.get(r.id) ?? { id: r.id, status: 0 });
  }

  // ---------- folders ----------

  private wellKnown(): Promise<WellKnownMap> {
    if (!this.wellKnownPromise) {
      this.wellKnownPromise = this.resolveWellKnown().catch((err: unknown) => {
        this.wellKnownPromise = null;
        throw err;
      });
    }
    return this.wellKnownPromise;
  }

  private async resolveWellKnown(): Promise<WellKnownMap> {
    const names = [...WELL_KNOWN.map((w) => w.wk), ...NOISE_WELL_KNOWN];
    const ids = await mapLimit(names, MAILBOX_CONCURRENCY, async (wk) => {
      try {
        const f = await this.request<GraphFolder>(`/me/mailFolders/${wk}?$select=id`);
        return f?.id ?? null;
      } catch (err) {
        // `archive` (and the noise folders) don't exist on every mailbox.
        if (err instanceof ApiError && (err.status === 404 || err.status === 400)) return null;
        if (NOISE_WELL_KNOWN.includes(wk) && err instanceof ApiError) return null;
        throw err;
      }
    });
    const map: WellKnownMap = { idToSystem: new Map(), systemToId: new Map(), noise: new Set() };
    names.forEach((wk, i) => {
      const id = ids[i];
      if (!id) return;
      const sys = WELL_KNOWN.find((w) => w.wk === wk)?.system;
      if (sys) {
        map.idToSystem.set(id, sys);
        map.systemToId.set(sys, id);
      } else {
        map.noise.add(id);
      }
    });
    return map;
  }

  private isNoise(f: GraphFolder, wk: WellKnownMap): boolean {
    if (f.isHidden) return true;
    if (wk.noise.has(f.id)) return true;
    if (wk.idToSystem.has(f.id)) return false;
    if (f.wellKnownName && NOISE_WELL_KNOWN.includes(f.wellKnownName.toLowerCase())) return true;
    return NOISE_NAMES.test((f.displayName ?? "").trim());
  }

  /** Top-level folders plus one level of children, minus noise folders and children of Trash/Spam. */
  private async folderTree(): Promise<FolderNode[]> {
    const wk = await this.wellKnown();
    const top = await this.getAll<GraphFolder>(`/me/mailFolders?$top=250&includeHiddenFolders=false`);
    const nodes: FolderNode[] = top
      .filter((f) => !this.isNoise(f, wk))
      .map((f) => {
        const system = wk.idToSystem.get(f.id) ?? null;
        return { folder: f, system, name: (system && SYSTEM_NAME.get(system)) || f.displayName || "(unnamed)" };
      });
    const parents = nodes.filter(
      (n) => (n.folder.childFolderCount ?? 0) > 0 && n.system !== "TRASH" && n.system !== "SPAM",
    );
    const children = await mapLimit(parents, MAILBOX_CONCURRENCY, async (p) => {
      const kids = await this.getAll<GraphFolder>(`/me/mailFolders/${enc(p.folder.id)}/childFolders?$top=250`);
      return kids
        .filter((c) => !this.isNoise(c, wk))
        .map((c): FolderNode => ({
          folder: c,
          system: wk.idToSystem.get(c.id) ?? null,
          name: `${p.name}/${c.displayName ?? "(unnamed)"}`,
        }));
    });
    return [...nodes, ...children.flat()];
  }

  private static isSynced(n: FolderNode): boolean {
    return n.system === null || SYNCED_SYSTEM.has(n.system);
  }

  // ---------- mapping ----------

  private toMeta(m: GraphMessage, wk: WellKnownMap): MessageMeta {
    const folder = m.parentFolderId ? (wk.idToSystem.get(m.parentFolderId) ?? m.parentFolderId) : null;
    const from = toPerson(m.from) ?? toPerson(m.sender) ?? { name: "", email: "" };
    const date = folder === "SENT" && m.sentDateTime ? m.sentDateTime : (m.receivedDateTime ?? m.sentDateTime);
    const importance = (m.importance ?? "normal").toLowerCase();
    const h = headerLookup(m.internetMessageHeaders);
    const bulk: BulkSignals = {
      listId: h("List-Id"),
      listUnsubscribe: h("List-Unsubscribe"),
      listUnsubscribePost: h("List-Unsubscribe-Post"),
      precedence: h("Precedence"),
      autoSubmitted: h("Auto-Submitted"),
    };
    const automated = AUTOMATED_SENDER.test(from.email.split("@")[0] ?? "");
    const isDraft = m.isDraft === true;
    return {
      id: m.id,
      threadId: m.conversationId ?? m.id,
      from,
      to: toPeople(m.toRecipients),
      cc: toPeople(m.ccRecipients),
      bcc: toPeople(m.bccRecipients),
      replyTo: toPeople(m.replyTo),
      subject: m.subject ?? "",
      snippet: m.bodyPreview ?? "",
      date: isoDate(date),
      unread: isDraft ? false : m.isRead === false,
      starred: m.flag?.flagStatus === "flagged",
      folders: folder ? [folder] : [],
      hasAttachments: m.hasAttachments === true,
      messageIdHeader: angle(m.internetMessageId),
      inReplyTo: h("In-Reply-To"),
      references: h("References"),
      bulk,
      category: m.inferenceClassification === "other" || automated ? "other" : null,
      importance: importance === "high" || importance === "low" ? importance : "normal",
      sizeEstimate: 0,
    };
  }

  // ---------- MailProvider ----------

  async getProfile(): Promise<Person> {
    const me = await this.request<{ displayName?: string | null; mail?: string | null; userPrincipalName?: string | null }>(
      `/me?$select=displayName,mail,userPrincipalName`,
    );
    const email = (me.mail || me.userPrincipalName || "").trim().toLowerCase();
    return { name: me.displayName?.trim() || email, email };
  }

  async listFolders(): Promise<Folder[]> {
    const nodes = await this.folderTree();
    const order = (n: FolderNode) => (n.system ? WELL_KNOWN.findIndex((w) => w.system === n.system) : WELL_KNOWN.length);
    return nodes
      .slice()
      .sort((a, b) => order(a) - order(b) || (a.system || b.system ? 0 : a.name.localeCompare(b.name)))
      .map((n) => ({
        id: n.system ?? n.folder.id,
        name: n.name,
        kind: n.system ? ("system" as const) : ("user" as const),
        style: "folder" as const,
        unread: n.folder.unreadItemCount ?? 0,
        total: n.folder.totalItemCount ?? 0,
      }));
  }

  /**
   * Run a message delta query to completion. `onPage` gets each page's messages and
   * "@removed" ids; returns the final deltaLink.
   */
  private async runDelta(
    startUrl: string,
    wk: WellKnownMap,
    onPage: (messages: MessageMeta[], removed: string[]) => Promise<void> | void,
    signal?: AbortSignal,
  ): Promise<string> {
    let url = startUrl;
    for (;;) {
      signal?.throwIfAborted();
      const page = await this.request<GraphList<GraphMessage>>(url, { prefer: [PREFER_DELTA_PAGE], signal });
      const messages: MessageMeta[] = [];
      const removed: string[] = [];
      for (const v of page.value ?? []) {
        if (!isGraphMessage(v)) continue;
        if (v["@removed"]) removed.push(v.id);
        else messages.push(this.toMeta(v, wk));
      }
      if (messages.length || removed.length) await onPage(messages, removed);
      if (page["@odata.nextLink"]) url = page["@odata.nextLink"];
      else if (page["@odata.deltaLink"]) return page["@odata.deltaLink"];
      else throw new Error("Microsoft Graph delta response had neither nextLink nor deltaLink");
    }
  }

  private deltaStart(folderId: string, filter: string | null): string {
    return `/me/mailFolders/${enc(folderId)}/messages/delta?${qs({ $select: META_SELECT, $filter: filter ?? undefined })}`;
  }

  async initialSync(opts: {
    maxMessages: number;
    onPage: (page: SyncPage, progress: { done: number; total: number }) => Promise<void> | void;
    signal?: AbortSignal;
  }): Promise<InitialSyncResult> {
    const { maxMessages, onPage, signal } = opts;
    const wk = await this.wellKnown();
    // Inbox first so the UI fills with what matters most, then Sent, Archive, Drafts, user folders.
    const rank = (n: FolderNode) => (n.system ? ["INBOX", "SENT", "ARCHIVE", "DRAFT"].indexOf(n.system) : 4);
    const targets = (await this.folderTree()).filter(OutlookProvider.isSynced).sort((a, b) => rank(a) - rank(b));
    this.lastFolderScan = Date.now();

    // Delta has no $top/$orderby: bound the volume with a receivedDateTime cutoff taken
    // from the maxMessages-th newest message mailbox-wide.
    let filter: string | null = null;
    if (maxMessages > 0) {
      const probe = await this.request<GraphList<GraphMessage>>(
        `/me/messages?${qs({ $top: "1", $skip: String(maxMessages), $orderby: "receivedDateTime desc", $select: "receivedDateTime" })}`,
        { signal },
      );
      const cutoff = probe.value?.[0]?.receivedDateTime;
      if (cutoff && !Number.isNaN(Date.parse(cutoff))) filter = `receivedDateTime ge ${new Date(cutoff).toISOString()}`;
    }

    const items = targets.reduce((s, n) => s + (n.folder.totalItemCount ?? 0), 0);
    let total = maxMessages > 0 ? Math.min(maxMessages, items) : items;
    let done = 0;
    const cursor: Record<string, string> = {};
    for (const node of targets) {
      cursor[node.folder.id] = await this.runDelta(
        this.deltaStart(node.folder.id, filter),
        wk,
        async (messages, deleted) => {
          done += messages.length;
          if (done > total) total = done;
          await onPage({ messages, deleted }, { done, total });
        },
        signal,
      );
    }
    return { cursor: JSON.stringify(cursor) };
  }

  async changes(cursor: string): Promise<ChangesResult> {
    const reset: ChangesResult = { messages: [], deleted: [], cursor, resetRequired: true };
    let links: Record<string, string>;
    try {
      const parsed: unknown = JSON.parse(cursor);
      if (!isRecord(parsed)) return reset;
      links = {};
      for (const [k, v] of Object.entries(parsed)) {
        if (typeof v !== "string" || !v.startsWith(this.origin + "/")) return reset;
        links[k] = v;
      }
    } catch {
      return reset;
    }

    const wk = await this.wellKnown();
    const next: Record<string, string> = { ...links };
    const byId = new Map<string, MessageMeta>();
    const removed = new Set<string>();
    const collect = (messages: MessageMeta[], gone: string[]) => {
      for (const m of messages) byId.set(m.id, m);
      for (const id of gone) removed.add(id);
    };

    // Folders created since the cursor (rate-limited; new folders are fully synced, no date filter).
    const newFolders: string[] = [];
    if (Date.now() - this.lastFolderScan > FOLDER_SCAN_INTERVAL_MS) {
      const nodes = await this.folderTree();
      this.lastFolderScan = Date.now();
      for (const n of nodes) if (OutlookProvider.isSynced(n) && !(n.folder.id in next)) newFolders.push(n.folder.id);
    }

    try {
      await mapLimit(Object.keys(links), MAILBOX_CONCURRENCY, async (fid) => {
        next[fid] = await this.runDelta(links[fid], wk, collect);
      });
      await mapLimit(newFolders, MAILBOX_CONCURRENCY, async (fid) => {
        next[fid] = await this.runDelta(this.deltaStart(fid, null), wk, collect);
      });
    } catch (err) {
      if (isResetError(err)) return reset;
      throw err;
    }

    // "@removed" in a folder delta means "left this folder": the message may have moved to
    // another synced folder (same immutable id). Check where each one is now; anything not in
    // a synced folder (Deleted Items, Junk, unsynced folder, hard-deleted) is reported deleted.
    const synced = new Set(Object.keys(next));
    const toCheck = [...removed].filter((id) => !byId.has(id));
    const deleted: string[] = [];
    if (toCheck.length) {
      const responses = await this.batch(
        toCheck.map((id, i) => ({ id: String(i), method: "GET", url: `/me/messages/${enc(id)}?$select=${META_SELECT}` })),
      );
      responses.forEach((r, i) => {
        const id = toCheck[i];
        if (r.status >= 200 && r.status < 300 && isGraphMessage(r.body)) {
          if (r.body.parentFolderId && synced.has(r.body.parentFolderId)) byId.set(id, this.toMeta(r.body, wk));
          else deleted.push(id);
        } else if (r.status === 404) {
          deleted.push(id);
        } else {
          throw new Error(`Could not check message state in Outlook: ${batchErrorMessage(r)}`);
        }
      });
    }

    return { messages: [...byId.values()], deleted, cursor: JSON.stringify(next), resetRequired: false };
  }

  async threadMessages(threadId: string): Promise<MessageMeta[]> {
    const wk = await this.wellKnown();
    // No $orderby: Graph rejects orderby combined with a conversationId filter (InefficientFilter).
    const filter = `conversationId eq '${threadId.replace(/'/g, "''")}'`;
    const list = await this.getAll<GraphMessage>(`/me/messages?${qs({ $filter: filter, $select: META_SELECT, $top: "250" })}`);
    return list
      .filter(isGraphMessage)
      .map((m) => this.toMeta(m, wk))
      .sort((a, b) => Date.parse(a.date) - Date.parse(b.date));
  }

  async getBody(messageId: string): Promise<MessageBody> {
    const m = await this.request<GraphMessage>(
      `/me/messages/${enc(messageId)}?$select=body,uniqueBody,hasAttachments,internetMessageHeaders`,
      { prefer: [PREFER_HTML] },
    );
    const isHtml = (b: GraphItemBody | null | undefined) => (b?.contentType ?? "html").toLowerCase() === "html";
    const content = m.body?.content ?? null;
    const html = content !== null && isHtml(m.body) ? content : null;
    const text = content !== null && !isHtml(m.body) ? content : null;
    const uniqueHtml = m.uniqueBody?.content
      ? isHtml(m.uniqueBody)
        ? m.uniqueBody.content
        : textToHtml(m.uniqueBody.content)
      : null;

    const hasCid = !!html && /cid:/i.test(html);
    const attachments = m.hasAttachments || hasCid ? await this.listAttachments(messageId, hasCid) : [];

    const h = headerLookup(m.internetMessageHeaders);
    const headers: MessageBody["headers"] = m.internetMessageHeaders?.length
      ? {
          bulk: {
            listId: h("List-Id"),
            listUnsubscribe: h("List-Unsubscribe"),
            listUnsubscribePost: h("List-Unsubscribe-Post"),
            precedence: h("Precedence"),
            autoSubmitted: h("Auto-Submitted"),
          },
          messageIdHeader: h("Message-ID"),
          inReplyTo: h("In-Reply-To"),
          references: h("References"),
        }
      : undefined;

    return { id: messageId, html, text, uniqueHtml, attachments, ...(headers ? { headers } : {}) };
  }

  private async listAttachments(messageId: string, hasCid: boolean): Promise<AttachmentMeta[]> {
    // $select keeps contentBytes out of the listing. contentId only exists on fileAttachment and
    // can't be selected on the base type, so inline images are fetched one by one below.
    const list = await this.getAll<GraphAttachment>(
      `/me/messages/${enc(messageId)}/attachments?$select=id,name,contentType,size,isInline`,
    );
    return mapLimit(list, MAILBOX_CONCURRENCY, async (a): Promise<AttachmentMeta> => {
      const type = (a["@odata.type"] ?? "").toLowerCase();
      const kind = type.includes("itemattachment") ? "item" : type.includes("referenceattachment") ? "reference" : "file";
      const filename =
        kind === "item" ? (/\.eml$/i.test(a.name ?? "") ? a.name! : `${a.name || "message"}.eml`) : a.name || "attachment";
      const mimeType = kind === "item" ? "message/rfc822" : a.contentType || "application/octet-stream";
      this.attachmentInfo.set(`${messageId}\n${a.id}`, { filename, mimeType, kind });
      const size = kind === "reference" ? 0 : (a.size ?? 0);
      let contentId: string | null = a.contentId ?? null;
      const wantsDetail =
        kind === "file" &&
        !contentId &&
        size <= INLINE_DETAIL_LIMIT &&
        (a.isInline === true || (hasCid && mimeType.startsWith("image/")));
      if (wantsDetail) {
        const full = await this.request<GraphAttachment>(`/me/messages/${enc(messageId)}/attachments/${enc(a.id)}`);
        contentId = full.contentId ?? null;
        if (full.contentBytes) {
          this.cacheBytes(`${messageId}\n${a.id}`, { filename, mimeType, data: Buffer.from(full.contentBytes, "base64") });
        }
      }
      return { id: a.id, filename, mimeType, size, inline: a.isInline === true, contentId: stripAngles(contentId) };
    });
  }

  private cacheBytes(key: string, data: AttachmentData): void {
    if (data.data.length > BYTES_CACHE_LIMIT / 4) return;
    const old = this.bytesCache.get(key);
    if (old) this.bytesCacheSize -= old.data.length;
    this.bytesCache.delete(key);
    this.bytesCache.set(key, data);
    this.bytesCacheSize += data.data.length;
    for (const [k, v] of this.bytesCache) {
      if (this.bytesCacheSize <= BYTES_CACHE_LIMIT) break;
      this.bytesCache.delete(k);
      this.bytesCacheSize -= v.data.length;
    }
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData> {
    const key = `${messageId}\n${attachmentId}`;
    const cached = this.bytesCache.get(key);
    if (cached) return cached;
    const base = `/me/messages/${enc(messageId)}/attachments/${enc(attachmentId)}`;
    const infoPromise = (async () => {
      const known = this.attachmentInfo.get(key);
      if (known) return known;
      const a = await this.request<GraphAttachment>(`${base}?$select=name,contentType`);
      const type = (a["@odata.type"] ?? "").toLowerCase();
      const kind: "file" | "item" | "reference" = type.includes("itemattachment")
        ? "item"
        : type.includes("referenceattachment")
          ? "reference"
          : "file";
      const info = {
        kind,
        filename: kind === "item" ? `${a.name || "message"}.eml` : a.name || "attachment",
        mimeType: kind === "item" ? "message/rfc822" : a.contentType || "application/octet-stream",
      };
      this.attachmentInfo.set(key, info);
      return info;
    })();
    const info = await infoPromise;
    if (info.kind === "reference") {
      throw new Error("This attachment is a link to a cloud file (OneDrive/SharePoint) and can't be downloaded as a file.");
    }
    const res = await this.request<Response>(`${base}/$value`, { raw: true });
    const data = Buffer.from(await res.arrayBuffer());
    return { filename: info.filename, mimeType: info.mimeType, data };
  }

  async modify(messageIds: string[], change: MessageChange): Promise<void> {
    if (change.kind === "addLabel" || change.kind === "removeLabel") {
      throw new Error("Outlook uses folders; use move");
    }
    if (!messageIds.length) return;

    let make: (id: string) => { method: string; url: string; body: unknown };
    const patch = (body: unknown) => (id: string) => ({ method: "PATCH", url: `/me/messages/${enc(id)}`, body });
    const move = (destinationId: string) => (id: string) => ({
      method: "POST",
      url: `/me/messages/${enc(id)}/move`,
      body: { destinationId },
    });
    switch (change.kind) {
      case "read":
        make = patch({ isRead: change.value });
        break;
      case "starred":
        make = patch({ flag: { flagStatus: change.value ? "flagged" : "notFlagged" } });
        break;
      case "archive": {
        const wk = await this.wellKnown();
        if (!wk.systemToId.has("ARCHIVE")) throw new Error("This Outlook mailbox has no Archive folder.");
        make = move("archive");
        break;
      }
      case "inbox":
        make = move("inbox");
        break;
      case "trash":
        make = move("deleteditems");
        break;
      case "spam":
        make = move("junkemail");
        break;
      case "move": {
        const wkName = SYSTEM_TO_WK.get(change.folderId as SystemName);
        make = move(wkName ?? change.folderId);
        break;
      }
    }

    const responses = await this.batch(messageIds.map((id, i) => ({ id: String(i), ...make(id) })));
    const failed = responses.filter((r) => r.status < 200 || r.status >= 300);
    if (failed.length) {
      throw new Error(`Outlook rejected ${failed.length} of ${messageIds.length} changes (${batchErrorMessage(failed[0])})`);
    }
  }

  async send(msg: RawOutgoing): Promise<{ id: string | null; threadId: string | null }> {
    const content = {
      subject: msg.subject,
      body: { contentType: "HTML", content: msg.html || textToHtml(msg.text) },
      toRecipients: toRecipients(msg.to),
      ccRecipients: toRecipients(msg.cc),
      bccRecipients: toRecipients(msg.bcc),
    };
    const fileAttachment = (a: RawOutgoing["attachments"][number]) => ({
      "@odata.type": "#microsoft.graph.fileAttachment",
      name: a.filename,
      contentType: a.mimeType || "application/octet-stream",
      contentBytes: a.data.toString("base64"),
    });
    const reply = msg.mode !== "new" && msg.replyToProviderId ? msg.replyToProviderId : null;
    const attachmentBytes = msg.attachments.reduce((s, a) => s + a.data.length, 0);

    if (!reply && attachmentBytes < SMALL_ATTACHMENT_LIMIT) {
      await this.request("/me/sendMail", {
        method: "POST",
        body: { message: { ...content, attachments: msg.attachments.map(fileAttachment) }, saveToSentItems: true },
      });
      return { id: null, threadId: null };
    }

    // Draft flow: replies/forwards (Exchange keeps conversationId, In-Reply-To, References and,
    // for forwards, the original attachments) and new mail with large attachments.
    let draft: GraphMessage;
    if (reply) {
      const action = msg.mode === "reply" ? "createReply" : msg.mode === "replyAll" ? "createReplyAll" : "createForward";
      draft = await this.request<GraphMessage>(`/me/messages/${enc(reply)}/${action}`, { method: "POST", body: {} });
    } else {
      draft = await this.request<GraphMessage>("/me/messages", { method: "POST", body: content });
    }
    const draftPath = `/me/messages/${enc(draft.id)}`;
    try {
      // Our HTML already contains the quoted original, so it replaces the generated body.
      if (reply) await this.request(draftPath, { method: "PATCH", body: content });
      for (const a of msg.attachments) {
        if (a.data.length < SMALL_ATTACHMENT_LIMIT) {
          await this.request(`${draftPath}/attachments`, { method: "POST", body: fileAttachment(a) });
        } else {
          await this.uploadLargeAttachment(draftPath, a);
        }
      }
    } catch (err) {
      await this.request(draftPath, { method: "DELETE" }).catch(() => undefined);
      throw err;
    }
    await this.request(`${draftPath}/send`, { method: "POST" });
    // Sending moves the draft to Sent Items under a new id, so the draft id is not returned.
    return { id: null, threadId: draft.conversationId ?? msg.threadId ?? null };
  }

  private async uploadLargeAttachment(draftPath: string, a: RawOutgoing["attachments"][number]): Promise<void> {
    const session = await this.request<{ uploadUrl?: string }>(`${draftPath}/attachments/createUploadSession`, {
      method: "POST",
      body: {
        AttachmentItem: {
          attachmentType: "file",
          name: a.filename,
          size: a.data.length,
          contentType: a.mimeType || "application/octet-stream",
        },
      },
    });
    const uploadUrl = session.uploadUrl;
    if (!uploadUrl || !uploadUrl.startsWith("https://")) throw new Error("Outlook did not return a valid attachment upload URL");
    const total = a.data.length;
    for (let start = 0; start < total; start += UPLOAD_CHUNK) {
      const chunk = a.data.subarray(start, Math.min(start + UPLOAD_CHUNK, total));
      for (let attempt = 0; ; attempt++) {
        // The upload URL is pre-authenticated: no Authorization header.
        const res = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "Content-Type": "application/octet-stream",
            "Content-Range": `bytes ${start}-${start + chunk.length - 1}/${total}`,
          },
          body: new Uint8Array(chunk),
        });
        if (res.ok) {
          await res.arrayBuffer().catch(() => undefined);
          break;
        }
        const body = await res.text().catch(() => "");
        if ((res.status === 429 || res.status >= 500) && attempt < 4) {
          const ra = Number(res.headers.get("retry-after"));
          await sleep(Number.isFinite(ra) && ra >= 0 ? Math.min(ra * 1000, 60_000) : 1000 * 2 ** attempt);
          continue;
        }
        throw new Error(`Uploading "${a.filename}" to Outlook failed: HTTP ${res.status} ${body.slice(0, 200)}`);
      }
    }
  }

  async search(query: string, limit: number): Promise<MessageMeta[]> {
    const wk = await this.wellKnown();
    const max = Math.max(1, limit);
    const term = query.replace(/\\/g, "\\\\").replace(/"/g, '\\"');
    // $search can't be combined with $orderby; sort locally.
    const list = await this.getAll<GraphMessage>(
      `/me/messages?${qs({ $search: `"${term}"`, $top: String(Math.min(max, 250)), $select: META_SELECT })}`,
      max,
    );
    return list
      .filter(isGraphMessage)
      .map((m) => this.toMeta(m, wk))
      .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
      .slice(0, max);
  }
}
