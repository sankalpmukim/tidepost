import type { ProviderKind } from "../shared/types";
import { MAX_BODIES_PER_ACCOUNT, MAX_MESSAGES_PER_ACCOUNT, MAX_SEARCH_SCAN, MAX_THREADS_PER_ACCOUNT } from "./limits";
import { createMemoryPersist } from "./persistMemory";

export interface UserRow {
  id: string;
  created_at: number;
  settings: string;
}

export interface SessionRow {
  id: string;
  user_id: string;
  created_at: number;
  expires_at: number;
}

export interface AccountPersistRow {
  id: string;
  user_id: string;
  provider: ProviderKind;
  email: string;
  name: string;
  tokens: string | null;
  cursor: string | null;
  sync: string;
  created_at: number;
}

export interface MessagePersistRow {
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
  search_text: string;
}

export interface ThreadPersistRow {
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
}

export interface ThreadStateRow {
  account_id: string;
  thread_id: string;
  pinned: number;
  snoozed_until: number | null;
  remind_at: number | null;
  remind_set_at: number | null;
  nudged: number;
  waiting_dismissed_at: number | null;
  brief: string | null;
}

export interface QueuePersistRow {
  id: string;
  account_id: string;
  payload: string;
  send_at: number;
  status: "queued" | "sending" | "sent" | "failed" | "cancelled";
  error: string | null;
  thread_id: string | null;
  created_at: number;
  display_subject?: string;
  display_to_json?: string;
}

export interface Persist {
  insertUser(row: UserRow): Promise<void>;
  getUser(id: string): Promise<UserRow | null>;
  updateUserSettings(id: string, settings: string): Promise<void>;

  insertSession(row: SessionRow): Promise<void>;
  getSession(id: string): Promise<SessionRow | null>;
  deleteSession(id: string): Promise<void>;

  putAccount(row: AccountPersistRow): Promise<void>;
  getAccount(id: string): Promise<AccountPersistRow | null>;
  listAccounts(userId: string): Promise<AccountPersistRow[]>;
  findAccountByIdentity(provider: ProviderKind, email: string): Promise<AccountPersistRow | null>;
  findAccountByUserIdentity(userId: string, provider: ProviderKind, email: string): Promise<AccountPersistRow | null>;
  removeAccount(id: string): Promise<void>;

  putMessages(rows: MessagePersistRow[]): Promise<{ id: string; thread_id: string }[]>;
  deleteMessages(accountId: string, ids: string[]): Promise<{ id: string; thread_id: string }[]>;
  getMessage(accountId: string, id: string): Promise<MessagePersistRow | null>;
  messagesForThread(accountId: string, threadId: string): Promise<MessagePersistRow[]>;
  listRecentMessages(accountId: string, limit: number): Promise<MessagePersistRow[]>;
  touchSearchText(accountId: string, messageId: string, searchText: string): Promise<void>;
  pruneOldestMessages(accountId: string): Promise<void>;

  putThreads(rows: ThreadPersistRow[]): Promise<void>;
  deleteThread(accountId: string, threadId: string): Promise<void>;
  getThread(accountId: string, threadId: string): Promise<ThreadPersistRow | null>;
  listThreads(accountId: string): Promise<ThreadPersistRow[]>;

  getThreadState(accountId: string, threadId: string): Promise<ThreadStateRow | null>;
  listThreadStates(accountId: string): Promise<ThreadStateRow[]>;
  patchThreadState(accountId: string, threadId: string, patch: Partial<Omit<ThreadStateRow, "account_id" | "thread_id">>): Promise<void>;
  dueThreadStates(now: number): Promise<ThreadStateRow[]>;

  getBody(accountId: string, messageId: string): Promise<string | null>;
  putBody(accountId: string, messageId: string, json: string): Promise<void>;

  wipeIndex(accountId: string): Promise<void>;

  putQueue(row: QueuePersistRow): Promise<void>;
  getQueue(id: string): Promise<QueuePersistRow | null>;
  updateQueue(id: string, patch: Partial<Pick<QueuePersistRow, "status" | "error" | "thread_id" | "send_at">>, expectedStatus?: QueuePersistRow["status"]): Promise<boolean>;
  dueQueue(now: number): Promise<QueuePersistRow[]>;
  listQueueForAccounts(accountIds: string[], since: number): Promise<QueuePersistRow[]>;
  requeueSending(): Promise<void>;
}

let impl: Persist | null = null;

export function persist(): Persist {
  if (!impl) impl = createMemoryPersist();
  return impl;
}

export async function initPersist(): Promise<Persist> {
  const store = process.env.TIDEPOST_STORE;
  const url = process.env.CONVEX_URL || process.env.VITE_CONVEX_URL;
  if (store !== "memory" && url) {
    const { createConvexPersist } = await import("./persistConvex");
    impl = createConvexPersist(url);
  } else if (!impl) {
    impl = createMemoryPersist();
  }
  return impl;
}

export { MAX_BODIES_PER_ACCOUNT, MAX_MESSAGES_PER_ACCOUNT, MAX_SEARCH_SCAN, MAX_THREADS_PER_ACCOUNT };
