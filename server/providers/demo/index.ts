// The demo mail provider: an in-memory, deterministic, "busy corporate" mailbox
// for trying Tidepost without an account (and for automated UI tests).
import type { Folder, Person } from "../../../shared/types";
import type {
  AttachmentData,
  ChangesResult,
  InitialSyncResult,
  MailProvider,
  MessageBody,
  MessageChange,
  MessageMeta,
  RawOutgoing,
  SyncPage,
} from "../types";
import { ME_DEFAULT } from "./content";
import {
  LABELS,
  arrivalPool,
  attachmentBytes,
  autoReplyText,
  domainOf,
  escapeHtml,
  finishMeta,
  firstName,
  Generator,
  msgId,
  renderMessage,
  snippetOf,
  threadIdOf,
  type ArrivalItem,
  type DemoMessage,
  type DemoThread,
  type Mailbox,
  type Sender,
} from "./generator";

export interface DemoProviderOptions {
  seed?: number;
  /** Anchor for the generated history (default: clock()). */
  now?: Date;
  me?: Person;
  /** Simulated latency per initialSync page, ms (default 20; tests use 0). */
  latencyMs?: number;
  /** A live message arrives when changes() is called this often (default 120; 0 disables). */
  arrivalEverySeconds?: number;
  /** Delay before a recipient auto-replies to a sent message (default 20). */
  autoReplySeconds?: number;
  /** Injectable wall clock (ms since epoch). */
  clock?: () => number;
}

const SYSTEM: { id: string; name: string }[] = [
  { id: "INBOX", name: "Inbox" },
  { id: "STARRED", name: "Starred" },
  { id: "SENT", name: "Sent" },
  { id: "DRAFT", name: "Drafts" },
  { id: "ARCHIVE", name: "Archive" },
  { id: "SPAM", name: "Spam" },
  { id: "TRASH", name: "Trash" },
];
const MAILBOXES = new Set(["INBOX", "SENT", "DRAFT", "TRASH", "SPAM"]);
const PAGE = 100;

interface PendingReply {
  dueAt: number;
  threadId: string;
  parentId: string;
  sender: Sender;
}

function clone(m: DemoMessage): MessageMeta {
  const x = m.meta;
  return { ...x, to: [...x.to], cc: [...x.cc], bcc: [...x.bcc], replyTo: [...x.replyTo], folders: [...x.folders], bulk: { ...x.bulk } };
}

function isLive(m: DemoMessage): boolean {
  return !m.meta.folders.includes("TRASH") && !m.meta.folders.includes("SPAM");
}

function abortError(): Error {
  const e = new Error("The operation was aborted");
  e.name = "AbortError";
  return e;
}

export class DemoProvider implements MailProvider {
  readonly kind = "demo" as const;
  readonly folderStyle = "label" as const;

  private readonly clock: () => number;
  private readonly latencyMs: number;
  private readonly arrivalEveryMs: number;
  private readonly autoReplyMs: number;
  private readonly gen: Generator;
  private readonly box: Mailbox;
  /** Messages newest first (kept sorted). */
  private order: DemoMessage[];
  private version = 1;
  private lastArrivalAt: number;
  private arrivalIndex = 0;
  private readonly pool: ArrivalItem[];
  private pending: PendingReply[] = [];
  private autoReplyCount = 0;

  constructor(opts: DemoProviderOptions = {}) {
    this.clock = opts.clock ?? (() => Date.now());
    this.latencyMs = opts.latencyMs ?? 20;
    this.arrivalEveryMs = (opts.arrivalEverySeconds ?? 120) * 1000;
    this.autoReplyMs = (opts.autoReplySeconds ?? 20) * 1000;
    const me: Person = opts.me ? { name: opts.me.name || ME_DEFAULT.name, email: opts.me.email.toLowerCase() } : { name: ME_DEFAULT.name, email: ME_DEFAULT.email };
    const now = (opts.now ?? new Date(this.clock())).getTime();
    this.gen = new Generator(opts.seed ?? 42, now, me);
    this.box = this.gen.build();
    this.order = [...this.box.messages.values()].sort((a, b) => b.meta.date.localeCompare(a.meta.date) || b.meta.id.localeCompare(a.meta.id));
    for (const m of this.order) m.version = 1;
    this.lastArrivalAt = this.clock();
    this.pool = arrivalPool();
  }

  // ---- introspection helpers (handy for tests and the UI team) ----

  /** Thread id of a scripted thread ("showcase", "hiring", "incident", "renewal", "design", "r-..."). */
  threadIdFor(key: string): string | null {
    return this.box.threadByKey.get(key)?.id ?? null;
  }

  /** Synchronous snapshot of every message's metadata, newest first (includes spam/trash). */
  allMessages(): MessageMeta[] {
    return this.order.map(clone);
  }

  // ---- MailProvider ----

  async getProfile(): Promise<Person> {
    return { ...this.box.me };
  }

  async listFolders(): Promise<Folder[]> {
    const count = (pred: (m: DemoMessage) => boolean) => {
      let total = 0;
      let unread = 0;
      for (const m of this.order) {
        if (!pred(m)) continue;
        total++;
        if (m.meta.unread) unread++;
      }
      return { total, unread };
    };
    const out: Folder[] = SYSTEM.map((f) => {
      const c =
        f.id === "STARRED"
          ? count((m) => m.meta.starred && isLive(m))
          : f.id === "ARCHIVE"
            ? count((m) => m.meta.folders.includes("ARCHIVE") && isLive(m))
            : count((m) => m.meta.folders.includes(f.id));
      return { id: f.id, name: f.name, kind: "system", style: "label", unread: f.id === "SENT" || f.id === "DRAFT" ? 0 : c.unread, total: c.total };
    });
    for (const l of LABELS) {
      const c = count((m) => m.meta.folders.includes(l.id) && isLive(m));
      out.push({ id: l.id, name: l.name, kind: "user", style: "label", unread: c.unread, total: c.total, color: l.color });
    }
    return out;
  }

  async initialSync(opts: { maxMessages: number; onPage: (page: SyncPage, progress: { done: number; total: number }) => Promise<void> | void; signal?: AbortSignal }): Promise<InitialSyncResult> {
    const cursor = String(this.version);
    const eligible = this.order.filter(isLive);
    const total = Math.min(Math.max(0, opts.maxMessages), eligible.length);
    let done = 0;
    while (done < total) {
      if (opts.signal?.aborted) throw abortError();
      if (this.latencyMs > 0) await new Promise((r) => setTimeout(r, this.latencyMs));
      if (opts.signal?.aborted) throw abortError();
      const batch = eligible.slice(done, Math.min(total, done + PAGE)).map(clone);
      done += batch.length;
      await opts.onPage({ messages: batch, deleted: [] }, { done, total });
    }
    return { cursor };
  }

  async changes(cursor: string): Promise<ChangesResult> {
    if (!/^\d+$/.test(cursor.trim())) return { messages: [], deleted: [], cursor: String(this.version), resetRequired: true };
    this.tick();
    const since = Number(cursor);
    const messages = this.order.filter((m) => m.version > since).map(clone);
    return { messages, deleted: [], cursor: String(this.version), resetRequired: false };
  }

  async threadMessages(threadId: string): Promise<MessageMeta[]> {
    const t = this.box.threads.get(threadId);
    if (!t) return [];
    return t.messages
      .filter((m) => !m.meta.folders.includes("TRASH"))
      .sort((a, b) => a.meta.date.localeCompare(b.meta.date) || a.meta.id.localeCompare(b.meta.id))
      .map(clone);
  }

  async getBody(messageId: string): Promise<MessageBody> {
    const m = this.must(messageId);
    const r = renderMessage(m);
    return {
      id: m.meta.id,
      html: r.html,
      text: r.text,
      uniqueHtml: null,
      attachments: m.attachments.map((a) => ({ id: a.id, filename: a.filename, mimeType: a.mimeType, size: a.size, inline: a.inline, contentId: a.contentId ?? null })),
    };
  }

  async getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData> {
    const m = this.must(messageId);
    const a = m.attachments.find((x) => x.id === attachmentId);
    if (!a) throw new Error(`Attachment ${attachmentId} not found on ${messageId}`);
    return { filename: a.filename, mimeType: a.mimeType, data: attachmentBytes(m, a) };
  }

  async modify(messageIds: string[], change: MessageChange): Promise<void> {
    let touched = false;
    for (const id of messageIds) {
      const m = this.box.messages.get(id);
      if (!m) continue;
      this.apply(m, change);
      touched = true;
      m.version = this.version + 1;
      m.haystack = undefined;
    }
    if (touched) this.version++;
  }

  async send(msg: RawOutgoing): Promise<{ id: string | null; threadId: string | null }> {
    const me = this.box.me;
    const date = this.stamp(this.clock());
    let thread: DemoThread | undefined = msg.threadId ? this.box.threads.get(msg.threadId) : undefined;
    let parent: DemoMessage | null = msg.replyToProviderId ? (this.box.messages.get(msg.replyToProviderId) ?? null) : null;
    if (!parent && msg.inReplyTo) parent = this.box.byHeader.get(msg.inReplyTo) ?? null;
    if (!thread && parent && msg.mode !== "forward") thread = this.box.threads.get(parent.meta.threadId);
    if (!thread) {
      thread = { id: threadIdOf(this.box.nextThread++), key: null, messages: [] };
      this.box.threads.set(thread.id, thread);
    }
    const id = msgId(this.box.nextMessage++);
    const header = `<CA${this.box.rng.alnum(40)}@mail.${domainOf(me.email)}>`;
    const references = msg.references ?? (parent ? [parent.meta.references, parent.meta.messageIdHeader].filter(Boolean).join(" ") || null : null);
    const attachments = msg.attachments.map((a, i) => ({ id: `att${i + 1}`, filename: a.filename, mimeType: a.mimeType, size: a.data.length, inline: false, contentId: null, data: Buffer.from(a.data) }));
    const lower = (ps: Person[]) => ps.map((p) => ({ name: p.name || p.email, email: p.email.toLowerCase() }));
    const m: DemoMessage = {
      meta: {
        id,
        threadId: thread.id,
        from: { ...me },
        to: lower(msg.to),
        cc: lower(msg.cc),
        bcc: lower(msg.bcc),
        replyTo: [],
        subject: msg.subject,
        snippet: snippetOf(msg.text),
        date: new Date(date).toISOString(),
        unread: false,
        starred: false,
        folders: ["SENT"],
        hasAttachments: attachments.length > 0,
        messageIdHeader: header,
        inReplyTo: msg.inReplyTo ?? parent?.meta.messageIdHeader ?? null,
        references,
        bulk: { listId: null, listUnsubscribe: null, listUnsubscribePost: null, precedence: null, autoSubmitted: null },
        category: "personal",
        importance: "normal",
        sizeEstimate: 0,
      },
      attachments,
      body: { kind: "raw", html: msg.html || `<div dir="ltr">${escapeHtml(msg.text).replace(/\n/g, "<br>")}</div>`, text: msg.text },
      parent,
      version: 0,
    };
    finishMeta(m);
    this.insert(thread, m);

    // Schedule a plausible reply from the first known recipient.
    const recipient = [...m.meta.to, ...m.meta.cc].map((p) => this.box.senders.get(p.email)).find((s): s is Sender => !!s && s.person.email.endsWith(".example") && s.person.email !== me.email);
    if (recipient && this.autoReplyMs >= 0) this.pending.push({ dueAt: this.clock() + this.autoReplyMs, threadId: thread.id, parentId: id, sender: recipient });
    return { id, threadId: thread.id };
  }

  async search(query: string, limit: number): Promise<MessageMeta[]> {
    const preds = parseQuery(query, this.labelLookup());
    const wantsHidden = preds.some((p) => !p.neg && p.kind === "in" && (p.value === "spam" || p.value === "trash" || p.value === "anywhere"));
    const out: MessageMeta[] = [];
    for (const m of this.order) {
      if (!wantsHidden && !isLive(m)) continue;
      if (preds.every((p) => this.test(m, p) !== p.neg)) {
        out.push(clone(m));
        if (out.length >= limit) break;
      }
    }
    return out;
  }

  // ---- internals ----

  private must(id: string): DemoMessage {
    const m = this.box.messages.get(id);
    if (!m) throw new Error(`Message ${id} not found`);
    return m;
  }

  /** Never let a new message sort before the newest existing one. */
  private stamp(ms: number): number {
    const newest = this.order.length ? Date.parse(this.order[0].meta.date) : 0;
    return Math.max(ms, newest + 1000);
  }

  private insert(thread: DemoThread, m: DemoMessage): void {
    this.version++;
    m.version = this.version;
    if (!thread.messages.includes(m)) thread.messages.push(m);
    this.box.messages.set(m.meta.id, m);
    if (m.meta.messageIdHeader) this.box.byHeader.set(m.meta.messageIdHeader, m);
    this.order = this.order.filter((x) => x !== m);
    this.order.unshift(m);
  }

  private apply(m: DemoMessage, change: MessageChange): void {
    const f = new Set(m.meta.folders);
    const toArchive = () => {
      f.delete("INBOX");
    };
    switch (change.kind) {
      case "read":
        m.meta.unread = !change.value;
        return;
      case "starred":
        m.meta.starred = change.value;
        return;
      case "archive":
        toArchive();
        break;
      case "inbox":
        f.delete("ARCHIVE");
        f.delete("TRASH");
        f.delete("SPAM");
        f.add("INBOX");
        break;
      case "trash":
        f.delete("INBOX");
        f.delete("ARCHIVE");
        f.delete("SPAM");
        f.add("TRASH");
        break;
      case "spam":
        f.delete("INBOX");
        f.delete("ARCHIVE");
        f.delete("TRASH");
        f.add("SPAM");
        break;
      case "addLabel":
        if (change.folderId === "INBOX") return this.apply(m, { kind: "inbox" });
        if (change.folderId === "TRASH") return this.apply(m, { kind: "trash" });
        if (change.folderId === "SPAM") return this.apply(m, { kind: "spam" });
        if (change.folderId === "STARRED") return this.apply(m, { kind: "starred", value: true });
        if (change.folderId === "UNREAD") return this.apply(m, { kind: "read", value: false });
        if (change.folderId !== "ARCHIVE") f.add(change.folderId);
        break;
      case "removeLabel":
        if (change.folderId === "STARRED") return this.apply(m, { kind: "starred", value: false });
        if (change.folderId === "UNREAD") return this.apply(m, { kind: "read", value: true });
        f.delete(change.folderId);
        break;
      case "move":
        if (change.folderId === "INBOX") return this.apply(m, { kind: "inbox" });
        if (change.folderId === "TRASH") return this.apply(m, { kind: "trash" });
        if (change.folderId === "SPAM") return this.apply(m, { kind: "spam" });
        if (change.folderId !== "ARCHIVE") f.add(change.folderId);
        toArchive();
        break;
    }
    // Normalise: ARCHIVE means "in no mailbox"; sent mail never carries ARCHIVE.
    const inMailbox = [...f].some((x) => MAILBOXES.has(x));
    if (inMailbox) f.delete("ARCHIVE");
    else f.add("ARCHIVE");
    const system = [...f].filter((x) => MAILBOXES.has(x) || x === "ARCHIVE");
    const labels = [...f].filter((x) => !MAILBOXES.has(x) && x !== "ARCHIVE");
    m.meta.folders = [...system, ...labels];
  }

  /** Deliver due auto-replies and periodic live arrivals. */
  private tick(): void {
    const now = this.clock();
    const due = this.pending.filter((p) => p.dueAt <= now);
    this.pending = this.pending.filter((p) => p.dueAt > now);
    for (const p of due) this.deliverAutoReply(p);
    if (this.arrivalEveryMs > 0) {
      let n = 0;
      while (now - this.lastArrivalAt >= this.arrivalEveryMs && n < 3) {
        this.lastArrivalAt += this.arrivalEveryMs;
        this.deliverArrival();
        n++;
      }
      if (now - this.lastArrivalAt >= this.arrivalEveryMs) this.lastArrivalAt = now;
    }
  }

  private deliverAutoReply(p: PendingReply): void {
    const parent = this.box.messages.get(p.parentId) ?? null;
    if (!parent) return;
    const thread = this.box.threads.get(p.threadId);
    if (!thread) return;
    const fn = firstName(this.box.me.name);
    const greet = this.autoReplyCount % 3 === 0 ? `Hi ${fn},` : this.autoReplyCount % 3 === 1 ? `${fn} —` : "";
    const sign = p.sender.client === "outlook" ? `Best regards,\n${firstName(p.sender.person.name)}` : `Thanks,\n${firstName(p.sender.person.name)}`;
    const text = [greet, autoReplyText(this.autoReplyCount++), sign].filter(Boolean).join("\n\n");
    const labels = parent.meta.folders.filter((f) => f.startsWith("Label_"));
    const m = this.gen.live(this.box, { sender: p.sender, date: this.stamp(this.clock()), text, parent, threadId: thread.id, to: [this.box.me], cc: [], labels });
    this.inserted(m);
  }

  private deliverArrival(): void {
    const item = this.arrivalIndex < this.pool.length ? this.pool[this.arrivalIndex] : { type: "auto" as const, which: (this.arrivalIndex % 3 === 0 ? "alert" : "ci") as "ci" | "alert" };
    this.arrivalIndex++;
    const date = this.stamp(this.clock());
    if (item.type === "auto") {
      for (const m of this.gen.liveAuto(this.box, item.which, date)) this.inserted(m);
      return;
    }
    const sender = this.gen.sender(item.from);
    if (item.type === "reply") {
      const thread = this.box.threadByKey.get(item.thread);
      const latest = thread?.messages.filter((m) => !m.meta.folders.includes("TRASH")).sort((a, b) => a.meta.date.localeCompare(b.meta.date)).at(-1) ?? null;
      if (!thread || !latest) return;
      const labels = [...new Set(thread.messages.flatMap((m) => m.meta.folders.filter((f) => f.startsWith("Label_"))))];
      const m = this.gen.live(this.box, {
        sender,
        date,
        text: item.text,
        parent: latest,
        threadId: thread.id,
        to: item.to?.map((k) => this.gen.sender(k).person),
        cc: item.cc?.map((k) => this.gen.sender(k).person),
        attach: item.attach,
        labels,
      });
      this.inserted(m);
      return;
    }
    const m = this.gen.live(this.box, {
      sender,
      date,
      text: item.text,
      parent: null,
      threadId: null,
      subject: item.subject,
      to: item.to.map((k) => this.gen.sender(k).person),
      cc: (item.cc ?? []).map((k) => this.gen.sender(k).person),
      attach: item.attach,
      labels: (item.labels ?? []).map((l) => this.gen.labelId(l)),
    });
    this.inserted(m);
  }

  /** Bookkeeping after the generator registered a live message. */
  private inserted(m: DemoMessage): void {
    const thread = this.box.threads.get(m.meta.threadId);
    if (thread) this.insert(thread, m);
  }

  private labelLookup(): Map<string, string> {
    const map = new Map<string, string>();
    for (const l of LABELS) {
      map.set(l.name.toLowerCase(), l.id);
      map.set(l.id.toLowerCase(), l.id);
    }
    return map;
  }

  private haystack(m: DemoMessage): string {
    if (m.haystack === undefined) {
      const x = m.meta;
      const people = [x.from, ...x.to, ...x.cc].map((p) => `${p.name} ${p.email}`).join(" ");
      m.haystack = `${x.subject}\n${x.snippet}\n${people}\n${renderMessage(m).text}\n${m.attachments.map((a) => a.filename).join(" ")}`.toLowerCase();
    }
    return m.haystack;
  }

  private test(m: DemoMessage, p: Pred): boolean {
    const x = m.meta;
    const has = (ps: Person[]) => ps.some((q) => q.email.includes(p.value) || q.name.toLowerCase().includes(p.value));
    switch (p.kind) {
      case "text":
        return this.haystack(m).includes(p.value);
      case "from":
        return has([x.from]);
      case "to":
        return has([...x.to, ...x.cc, ...x.bcc]);
      case "cc":
        return has(x.cc);
      case "subject":
        return x.subject.toLowerCase().includes(p.value);
      case "has":
        if (p.value === "attachment" || p.value === "attachments") return x.hasAttachments;
        if (p.value === "userlabels") return x.folders.some((f) => f.startsWith("Label_"));
        return false;
      case "filename":
        return m.attachments.some((a) => a.filename.toLowerCase().includes(p.value));
      case "is":
        if (p.value === "unread") return x.unread;
        if (p.value === "read") return !x.unread;
        if (p.value === "starred") return x.starred;
        if (p.value === "important") return x.importance === "high";
        return false;
      case "in":
        if (p.value === "anywhere" || p.value === "all") return true;
        if (p.value === "starred") return x.starred;
        if (p.value === "archive" || p.value === "archived") return x.folders.includes("ARCHIVE");
        if (p.value === "drafts") return x.folders.includes("DRAFT");
        return x.folders.includes(p.value.toUpperCase());
      case "label":
        return p.labelId ? x.folders.includes(p.labelId) : false;
      case "category":
        return (x.category ?? "") === p.value || (p.value === "primary" && x.category === "personal");
      case "after":
        return Date.parse(x.date) >= (p.time ?? 0);
      case "before":
        return Date.parse(x.date) < (p.time ?? 0);
      case "newer":
        return Date.parse(x.date) >= this.clock() - (p.time ?? 0);
      case "older":
        return Date.parse(x.date) < this.clock() - (p.time ?? 0);
    }
  }
}

// ---------------------------------------------------------------------------
// Query parsing (Gmail-style subset)
// ---------------------------------------------------------------------------

type PredKind = "text" | "from" | "to" | "cc" | "subject" | "has" | "filename" | "is" | "in" | "label" | "category" | "after" | "before" | "newer" | "older";

interface Pred {
  kind: PredKind;
  value: string;
  neg: boolean;
  time?: number;
  labelId?: string;
}

const OPERATORS = new Set(["from", "to", "cc", "subject", "has", "filename", "is", "in", "label", "category", "after", "before", "newer_than", "older_than"]);

function parseDay(v: string): number | null {
  const m = /^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/.exec(v);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

function parseSpan(v: string): number | null {
  const m = /^(\d+)([dmy])$/.exec(v);
  if (!m) return null;
  const n = Number(m[1]);
  return n * (m[2] === "d" ? 86_400_000 : m[2] === "m" ? 30 * 86_400_000 : 365 * 86_400_000);
}

export function tokenize(q: string): string[] {
  const out: string[] = [];
  const re = /-?(?:[a-z_]+:)?"[^"]*"?|\S+/gi;
  for (const m of q.matchAll(re)) out.push(m[0]);
  return out;
}

function parseQuery(q: string, labels: Map<string, string>): Pred[] {
  const preds: Pred[] = [];
  for (let tok of tokenize(q)) {
    let neg = false;
    if (tok.startsWith("-") && tok.length > 1) {
      neg = true;
      tok = tok.slice(1);
    }
    const op = /^([a-z_]+):(.*)$/i.exec(tok);
    if (op && OPERATORS.has(op[1].toLowerCase())) {
      const key = op[1].toLowerCase();
      const value = op[2].replace(/^"|"$/g, "").toLowerCase();
      if (!value) continue;
      if (key === "after" || key === "before") {
        const t = parseDay(value);
        if (t !== null) preds.push({ kind: key, value, neg, time: t });
        continue;
      }
      if (key === "newer_than" || key === "older_than") {
        const t = parseSpan(value);
        if (t !== null) preds.push({ kind: key === "newer_than" ? "newer" : "older", value, neg, time: t });
        continue;
      }
      if (key === "label") {
        const norm = value.replace(/-/g, " ");
        preds.push({ kind: "label", value, neg, labelId: labels.get(value) ?? labels.get(norm) });
        continue;
      }
      preds.push({ kind: key as PredKind, value, neg });
      continue;
    }
    const value = tok.replace(/^"|"$/g, "").toLowerCase();
    if (value && value.toUpperCase() !== "AND") preds.push({ kind: "text", value, neg });
  }
  return preds;
}
