// The contract every mail backend (Gmail, Outlook, demo) implements.
// The sync engine, the HTTP API and the assistant only talk to this interface.
import type { AttachmentMeta, Folder, Person } from "../../shared/types";

/**
 * Header-level data for one message. This is what the local index stores
 * for every synced message; bodies are fetched on demand.
 */
export interface MessageMeta {
  id: string;
  threadId: string;
  from: Person;
  to: Person[];
  cc: Person[];
  bcc: Person[];
  replyTo: Person[];
  subject: string;
  snippet: string;
  date: string; // ISO 8601
  unread: boolean;
  starred: boolean;
  /**
   * Normalized folder/label ids. System folders use the upper-case names
   * "INBOX" | "SENT" | "DRAFT" | "TRASH" | "SPAM" | "ARCHIVE".
   * Gmail: label ids mapped (INBOX, SENT, DRAFT, TRASH, SPAM, STARRED is NOT
   * included here — use `starred`); user labels keep their Gmail label id.
   * A Gmail message with no INBOX/TRASH/SPAM/SENT/DRAFT label gets "ARCHIVE".
   * Outlook: the parent folder mapped to a system name when it is a well-known
   * folder (inbox, sentitems, drafts, deleteditems, junkemail, archive),
   * otherwise the Graph folder id.
   */
  folders: string[];
  hasAttachments: boolean;
  /** RFC 5322 Message-ID header value including angle brackets. */
  messageIdHeader: string | null;
  inReplyTo: string | null;
  references: string | null;
  /** List-Id / List-Unsubscribe / Precedence: bulk / Auto-Submitted / category signals. */
  bulk: BulkSignals;
  /** Provider category hint, e.g. Gmail CATEGORY_PROMOTIONS or Outlook inferenceClassification "other". */
  category: string | null;
  importance: "low" | "normal" | "high";
  sizeEstimate: number;
}

export interface BulkSignals {
  listId: string | null;
  listUnsubscribe: string | null;
  listUnsubscribePost: string | null;
  precedence: string | null;
  autoSubmitted: string | null;
}

export interface MessageBody {
  id: string;
  html: string | null;
  text: string | null;
  /**
   * Provider-supplied "new content only" body when available
   * (Outlook `uniqueBody`). Null when the provider has no such field.
   */
  uniqueHtml: string | null;
  attachments: AttachmentMeta[];
  /**
   * Header data only available on a full fetch (Outlook internetMessageHeaders).
   * When present the sync engine merges it into the stored metadata.
   */
  headers?: {
    bulk?: Partial<BulkSignals>;
    messageIdHeader?: string | null;
    inReplyTo?: string | null;
    references?: string | null;
  };
}

export interface AttachmentData {
  filename: string;
  mimeType: string;
  data: Buffer;
}

export interface SyncPage {
  messages: MessageMeta[];
  /** Ids the provider reports as permanently gone. */
  deleted: string[];
}

export interface InitialSyncResult {
  /** Opaque cursor for incremental sync (Gmail historyId, Graph deltaLinks JSON, ...). */
  cursor: string;
}

export interface ChangesResult {
  messages: MessageMeta[];
  deleted: string[];
  cursor: string;
  /** True when the cursor is too old and the caller must run an initial sync again. */
  resetRequired: boolean;
}

/** A change applied to a set of messages. Exactly one field is set per call. */
export type MessageChange =
  | { kind: "read"; value: boolean }
  | { kind: "starred"; value: boolean }
  | { kind: "archive" } // remove from inbox (Gmail) / move to Archive (Outlook)
  | { kind: "inbox" } // put back in inbox
  | { kind: "trash" }
  | { kind: "spam" }
  | { kind: "addLabel"; folderId: string } // Gmail only
  | { kind: "removeLabel"; folderId: string } // Gmail only
  | { kind: "move"; folderId: string }; // Outlook folders; Gmail emulates with labels

export interface RawOutgoing {
  from: Person;
  to: Person[];
  cc: Person[];
  bcc: Person[];
  subject: string;
  text: string;
  html: string;
  attachments: { filename: string; mimeType: string; data: Buffer }[];
  inReplyTo: string | null; // Message-ID header of the message being answered
  references: string | null;
  /** Provider thread id to attach the reply to (Gmail threadId / Outlook conversation). */
  threadId: string | null;
  /** Provider id of the message being answered or forwarded, if any. */
  replyToProviderId: string | null;
  mode: "new" | "reply" | "replyAll" | "forward";
}

export interface MailProvider {
  readonly kind: "gmail" | "outlook" | "demo";
  /** Whether labels can be stacked (Gmail) or folders are exclusive (Outlook). */
  readonly folderStyle: "label" | "folder";

  getProfile(): Promise<Person>;
  listFolders(): Promise<Folder[]>;

  /**
   * Fetch metadata for the newest `maxMessages` messages across the mailbox
   * (inbox, sent, archive, user folders; not trash/spam), newest first.
   * Calls `onPage` as batches arrive so the UI can fill progressively.
   */
  initialSync(opts: {
    maxMessages: number;
    onPage: (page: SyncPage, progress: { done: number; total: number }) => Promise<void> | void;
    signal?: AbortSignal;
  }): Promise<InitialSyncResult>;

  /** Changes since `cursor`. */
  changes(cursor: string): Promise<ChangesResult>;

  /** All messages of one thread (metadata), used when a thread is opened. */
  threadMessages(threadId: string): Promise<MessageMeta[]>;

  getBody(messageId: string): Promise<MessageBody>;
  getAttachment(messageId: string, attachmentId: string): Promise<AttachmentData>;

  modify(messageIds: string[], change: MessageChange): Promise<void>;

  /** Sends a message. Returns provider ids when known. */
  send(msg: RawOutgoing): Promise<{ id: string | null; threadId: string | null }>;

  /** Full-mailbox search using the provider's own search. Returns metadata, newest first. */
  search(query: string, limit: number): Promise<MessageMeta[]>;
}

/** Thrown by providers when the stored credentials no longer work. */
export class AuthExpiredError extends Error {
  constructor(message = "The mail provider rejected the saved sign-in. Sign in again.") {
    super(message);
    this.name = "AuthExpiredError";
  }
}

/** Thrown when the provider rate-limits us; `retryAfterMs` when known. */
export class RateLimitedError extends Error {
  retryAfterMs: number;
  constructor(retryAfterMs = 5000) {
    super("Rate limited by mail provider");
    this.name = "RateLimitedError";
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * Token access for OAuth providers. The provider calls `getAccessToken()`
 * before each request; the implementation refreshes and persists tokens.
 */
export interface TokenSource {
  getAccessToken(): Promise<string>;
  /** Force a refresh after a 401. */
  refresh(): Promise<string>;
}
