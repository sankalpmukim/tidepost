// Types shared by the server and the web client.
// Everything crossing the HTTP boundary is described here.

export type ProviderKind = "gmail" | "outlook" | "demo";

export interface Person {
  name: string;
  email: string; // always lower-cased
}

export interface Account {
  id: string;
  provider: ProviderKind;
  email: string;
  name: string;
  /** Background sync state for this account. */
  sync: SyncState;
}

export interface SyncState {
  phase: "idle" | "initial" | "incremental" | "error";
  /** Messages fetched so far during the initial sync. */
  done: number;
  /** Target number of messages for the initial sync (0 when unknown). */
  total: number;
  lastSyncedAt: string | null;
  error: string | null;
}

/**
 * Where a thread sits in the triage model.
 * - needs:   someone else wrote last and it is addressed to you
 * - waiting: you wrote last and nobody has answered yet
 * - fyi:     you are only on Cc, or it went to a group
 * - updates: newsletters, notifications, automated mail
 * - done:    not in the inbox any more (archived)
 */
export type Lane = "needs" | "waiting" | "fyi" | "updates" | "done";

export type SystemFolder = "INBOX" | "SENT" | "DRAFT" | "TRASH" | "SPAM" | "ARCHIVE" | "STARRED" | "ALL";

export interface Folder {
  id: string; // "INBOX", "SENT", ... for system folders; provider id for user labels/folders
  name: string;
  kind: "system" | "user";
  /** Gmail labels can be stacked; Outlook folders are exclusive. */
  style: "label" | "folder";
  unread: number;
  total: number;
  color?: string | null;
}

export interface AttachmentMeta {
  id: string;
  filename: string;
  mimeType: string;
  size: number;
  inline: boolean;
  contentId?: string | null;
}

export interface ThreadSummary {
  id: string;
  accountId: string;
  subject: string;
  snippet: string;
  /** Distinct senders, oldest first. */
  participants: Person[];
  lastFrom: Person;
  lastFromMe: boolean;
  lastDate: string; // ISO
  firstDate: string; // ISO
  messageCount: number;
  unreadCount: number;
  starred: boolean;
  hasAttachments: boolean;
  folders: string[];
  inInbox: boolean;
  lane: Lane;
  /** You are in To: on the latest message from someone else. */
  toMeDirect: boolean;
  isBulk: boolean;
  pinned: boolean;
  snoozedUntil: string | null;
  /** A follow-up reminder you set on this thread. */
  remindAt: string | null;
  /** Set when a follow-up reminder fired with no reply. */
  nudged: boolean;
  /** Total number of distinct people on the thread (From/To/Cc). */
  audienceSize: number;
}

export interface ThreadPage {
  threads: ThreadSummary[];
  nextCursor: string | null;
  total: number;
}

export interface LaneCounts {
  needs: number;
  waiting: number;
  fyi: number;
  updates: number;
  inboxUnread: number;
  snoozed: number;
}

export interface Message {
  id: string;
  threadId: string;
  accountId: string;
  from: Person;
  to: Person[];
  cc: Person[];
  bcc: Person[];
  replyTo: Person[];
  date: string; // ISO
  subject: string;
  snippet: string;
  unread: boolean;
  starred: boolean;
  folders: string[];
  fromMe: boolean;
  attachments: AttachmentMeta[];
  /** False when only headers are loaded; fetch the body with POST /bodies. */
  bodyLoaded: boolean;
  /** Sanitizable HTML body, if the message has one. */
  html: string | null;
  /** Plain text body (always present; derived from HTML if needed). */
  text: string;
  /**
   * The part of the body that is new in this message, with quoted
   * history and signatures removed where we can detect them.
   */
  uniqueText: string;
  uniqueHtml: string | null;
  /** RFC 5322 Message-ID, used for threading replies. */
  messageIdHeader: string | null;
  references: string | null;
  listUnsubscribe: { mailto: string | null; url: string | null; oneClick: boolean } | null;
}

export interface Thread {
  id: string;
  accountId: string;
  subject: string;
  messages: Message[];
  summary: ThreadSummary;
}

export type ThreadAction =
  | { type: "archive" }
  | { type: "inbox" }
  | { type: "trash" }
  | { type: "spam" }
  | { type: "read" }
  | { type: "unread" }
  | { type: "star" }
  | { type: "unstar" }
  | { type: "pin" }
  | { type: "unpin" }
  | { type: "snooze"; until: string }
  | { type: "unsnooze" }
  | { type: "remind"; at: string }
  | { type: "unremind" }
  | { type: "stopWaiting" }
  | { type: "label"; folderId: string }
  | { type: "unlabel"; folderId: string }
  | { type: "move"; folderId: string };

export interface OutgoingAttachment {
  filename: string;
  mimeType: string;
  /** base64 */
  data: string;
}

export interface OutgoingMessage {
  to: Person[];
  cc: Person[];
  bcc: Person[];
  subject: string;
  /** Plain text the user wrote. The server renders HTML from it. */
  text: string;
  /** Optional quoted HTML appended below the reply (the original message). */
  quotedHtml?: string | null;
  quotedText?: string | null;
  attachments: OutgoingAttachment[];
  /** Reply / forward context. */
  inReplyTo?: { messageId: string; threadId: string } | null;
  mode: "new" | "reply" | "replyAll" | "forward";
}

export interface QueuedSend {
  id: string;
  accountId: string;
  sendAt: string;
  subject: string;
  to: Person[];
  status: "queued" | "sending" | "sent" | "failed" | "cancelled";
  error: string | null;
  threadId: string | null;
}

export interface SendCheck {
  level: "warn" | "info";
  code: "external" | "large-audience" | "missing-attachment" | "no-subject" | "reply-all-drop" | "unreviewed-draft";
  message: string;
}

// ---------- Assistant ----------

export interface Ask {
  text: string;
  from: string;
  messageId: string;
  due: string | null;
}

export interface ThreadBrief {
  threadId: string;
  /** Key of the latest message the brief was built from. */
  basis: string;
  source: "ai" | "heuristic";
  summary: string;
  /** What changed since you last wrote on this thread. */
  sinceYou: string | null;
  asks: Ask[];
  decisions: string[];
  nextStep: string | null;
  generatedAt: string;
}

export type DraftTone = "Brief" | "Warm" | "Firm";

export interface DraftProposal {
  source: "ai" | "template";
  notes: string;
  variants: Record<DraftTone, string>;
}

export type PlanStepKind = "reply" | "archive" | "snooze" | "remind" | "label" | "star" | "unsubscribe";

export interface PlanStep {
  id: string;
  kind: PlanStepKind;
  title: string;
  detail: string;
  params: Record<string, string>;
  state: "pending" | "approved" | "rejected" | "running" | "done" | "failed";
  result?: string | null;
}

export interface Plan {
  threadId: string;
  source: "ai" | "heuristic";
  rationale: string;
  steps: PlanStep[];
}

// ---------- Background runs ----------

export interface Run {
  id: string;
  accountId: string;
  kind: "sync" | "bulk" | "sweep";
  title: string;
  detail: string;
  state: "running" | "review" | "applied" | "done" | "failed" | "cancelled";
  done: number;
  total: number;
  /** For sweeps: what the run proposes, applied only after review. */
  proposal: { threadIds: string[]; action: ThreadAction; summary: string } | null;
  error: string | null;
  startedAt: string;
}

export interface AppConfig {
  providers: { gmail: boolean; outlook: boolean; demo: boolean };
  ai: boolean;
  aiModel: string | null;
  undoSendSeconds: number;
}

export interface Settings {
  undoSendSeconds: number;
  signature: string;
  density: "compact" | "comfortable";
  loadRemoteImages: "ask" | "always";
  theme: "system" | "light" | "dark";
  readingPane: "right" | "full";
}

export interface UnsubscribeResult {
  method: "one-click" | "mailto" | "url" | "none";
  url: string | null;
  message: string;
}

export type SweepKind = "updates-read" | "updates-archive" | "fyi-archive" | "stale-waiting";

export interface Contact {
  name: string;
  email: string;
  count: number;
}
