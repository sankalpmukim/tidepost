import { ConvexHttpClient } from "convex/browser";
import { api } from "../convex/_generated/api";
import { config } from "./config";
import type {
  AccountPersistRow,
  MessagePersistRow,
  Persist,
  QueuePersistRow,
  ThreadPersistRow,
  ThreadStateRow,
} from "./persist";
import { BODY_JSON_MAX } from "./limits";
import type { ProviderKind } from "../shared/types";

function secret(): string {
  const s = config.secret || process.env.TIDEPOST_SECRET || "";
  if (!s) throw new Error("TIDEPOST_SECRET is required when using Convex");
  return s;
}

function toMessage(row: MessagePersistRow) {
  return {
    accountId: row.account_id,
    messageId: row.id,
    threadId: row.thread_id,
    fromName: row.from_name,
    fromEmail: row.from_email,
    toJson: row.to_json,
    ccJson: row.cc_json,
    bccJson: row.bcc_json,
    replyToJson: row.reply_to_json,
    subject: row.subject,
    snippet: row.snippet,
    dateMs: row.date_ms,
    unread: !!row.unread,
    starred: !!row.starred,
    folders: row.folders,
    hasAtt: !!row.has_att,
    msgidHdr: row.msgid_hdr,
    inReplyTo: row.in_reply_to,
    refs: row.refs,
    bulkJson: row.bulk_json,
    category: row.category,
    importance: row.importance,
    size: row.size,
    searchText: row.search_text,
  };
}

function fromMessage(row: ReturnType<typeof toMessage>): MessagePersistRow {
  return {
    account_id: row.accountId,
    id: row.messageId,
    thread_id: row.threadId,
    from_name: row.fromName,
    from_email: row.fromEmail,
    to_json: row.toJson,
    cc_json: row.ccJson,
    bcc_json: row.bccJson,
    reply_to_json: row.replyToJson,
    subject: row.subject,
    snippet: row.snippet,
    date_ms: row.dateMs,
    unread: row.unread ? 1 : 0,
    starred: row.starred ? 1 : 0,
    folders: row.folders,
    has_att: row.hasAtt ? 1 : 0,
    msgid_hdr: row.msgidHdr,
    in_reply_to: row.inReplyTo,
    refs: row.refs,
    bulk_json: row.bulkJson,
    category: row.category,
    importance: row.importance,
    size: row.size,
    search_text: row.searchText,
  };
}

function toThread(row: ThreadPersistRow) {
  return {
    accountId: row.account_id,
    threadId: row.id,
    subject: row.subject,
    snippet: row.snippet,
    participants: row.participants,
    lastFromName: row.last_from_name,
    lastFromEmail: row.last_from_email,
    lastFromMe: !!row.last_from_me,
    lastDateMs: row.last_date_ms,
    firstDateMs: row.first_date_ms,
    messageCount: row.message_count,
    unreadCount: row.unread_count,
    starred: !!row.starred,
    hasAtt: !!row.has_att,
    folders: row.folders,
    inInbox: !!row.in_inbox,
    toMeDirect: !!row.to_me_direct,
    isBulk: !!row.is_bulk,
    audience: row.audience,
  };
}

function fromThread(row: ReturnType<typeof toThread>): ThreadPersistRow {
  return {
    account_id: row.accountId,
    id: row.threadId,
    subject: row.subject,
    snippet: row.snippet,
    participants: row.participants,
    last_from_name: row.lastFromName,
    last_from_email: row.lastFromEmail,
    last_from_me: row.lastFromMe ? 1 : 0,
    last_date_ms: row.lastDateMs,
    first_date_ms: row.firstDateMs,
    message_count: row.messageCount,
    unread_count: row.unreadCount,
    starred: row.starred ? 1 : 0,
    has_att: row.hasAtt ? 1 : 0,
    folders: row.folders,
    in_inbox: row.inInbox ? 1 : 0,
    to_me_direct: row.toMeDirect ? 1 : 0,
    is_bulk: row.isBulk ? 1 : 0,
    audience: row.audience,
  };
}

function fromState(row: {
  accountId: string;
  threadId: string;
  pinned: number;
  snoozedUntil: number | null;
  remindAt: number | null;
  remindSetAt: number | null;
  nudged: number;
  waitingDismissedAt: number | null;
  brief: string | null;
}): ThreadStateRow {
  return {
    account_id: row.accountId,
    thread_id: row.threadId,
    pinned: row.pinned,
    snoozed_until: row.snoozedUntil,
    remind_at: row.remindAt,
    remind_set_at: row.remindSetAt,
    nudged: row.nudged,
    waiting_dismissed_at: row.waitingDismissedAt,
    brief: row.brief,
  };
}

function fromAccount(row: {
  accountId: string;
  userId: string;
  provider: ProviderKind;
  email: string;
  name: string;
  tokens: string | null;
  cursor: string | null;
  sync: string;
  createdAt: number;
}): AccountPersistRow {
  return {
    id: row.accountId,
    user_id: row.userId,
    provider: row.provider,
    email: row.email,
    name: row.name,
    tokens: row.tokens,
    cursor: row.cursor,
    sync: row.sync,
    created_at: row.createdAt,
  };
}

function fromQueue(row: {
  queueId: string;
  accountId: string;
  payload: string;
  sendAt: number;
  status: QueuePersistRow["status"];
  error: string | null;
  threadId: string | null;
  createdAt: number;
}): QueuePersistRow {
  return {
    id: row.queueId,
    account_id: row.accountId,
    payload: row.payload,
    send_at: row.sendAt,
    status: row.status,
    error: row.error,
    thread_id: row.threadId,
    created_at: row.createdAt,
  };
}

export function createConvexPersist(url: string): Persist {
  const client = new ConvexHttpClient(url);
  const s = () => ({ secret: secret() });

  return {
    async insertUser(row) {
      await client.mutation(api.users.putUser, { ...s(), appId: row.id, createdAt: row.created_at, settings: row.settings });
    },
    async getUser(id) {
      const row = await client.query(api.users.getUser, { ...s(), appId: id });
      return row ? { id: row.appId, created_at: row.createdAt, settings: row.settings } : null;
    },
    async updateUserSettings(id, settings) {
      await client.mutation(api.users.updateUserSettings, { ...s(), appId: id, settings });
    },
    async insertSession(row) {
      await client.mutation(api.users.putSession, {
        ...s(),
        sessionId: row.id,
        userId: row.user_id,
        createdAt: row.created_at,
        expiresAt: row.expires_at,
      });
    },
    async getSession(id) {
      const row = await client.query(api.users.getSession, { ...s(), sessionId: id });
      return row ? { id: row.sessionId, user_id: row.userId, created_at: row.createdAt, expires_at: row.expiresAt } : null;
    },
    async deleteSession(id) {
      await client.mutation(api.users.deleteSession, { ...s(), sessionId: id });
    },
    async putAccount(row) {
      await client.mutation(api.users.putAccount, {
        ...s(),
        account: {
          accountId: row.id,
          userId: row.user_id,
          provider: row.provider,
          email: row.email,
          name: row.name,
          tokens: row.tokens,
          cursor: row.cursor,
          sync: row.sync,
          createdAt: row.created_at,
        },
      });
    },
    async getAccount(id) {
      const row = await client.query(api.users.getAccount, { ...s(), accountId: id });
      return row ? fromAccount(row) : null;
    },
    async listAccounts(userId) {
      const rows = await client.query(api.users.listAccountsByUser, { ...s(), userId });
      return rows.map(fromAccount);
    },
    async findAccountByIdentity(provider, email) {
      const row = await client.query(api.users.findAccountByIdentity, { ...s(), provider, email });
      return row ? fromAccount(row) : null;
    },
    async findAccountByUserIdentity(userId, provider, email) {
      const row = await client.query(api.users.findAccountByUserIdentity, { ...s(), userId, provider, email });
      return row ? fromAccount(row) : null;
    },
    async removeAccount(id) {
      await client.mutation(api.mailIndex.removeAccount, { ...s(), accountId: id });
    },
    async putMessages(rows) {
      const prev = await client.mutation(api.mailIndex.putMessages, { ...s(), messages: rows.map(toMessage) });
      return prev.map((p) => ({ id: p.messageId, thread_id: p.threadId }));
    },
    async deleteMessages(accountId, ids) {
      const prev = await client.mutation(api.mailIndex.deleteMessages, { ...s(), accountId, ids });
      return prev.map((p) => ({ id: p.messageId, thread_id: p.threadId }));
    },
    async getMessage(accountId, id) {
      const row = await client.query(api.mailIndex.getMessage, { ...s(), accountId, messageId: id });
      return row ? fromMessage(row) : null;
    },
    async messagesForThread(accountId, threadId) {
      const rows = await client.query(api.mailIndex.messagesForThread, { ...s(), accountId, threadId });
      return rows.map(fromMessage);
    },
    async listRecentMessages(accountId, limit) {
      const rows = await client.query(api.mailIndex.listRecentMessages, { ...s(), accountId, limit });
      return rows.map(fromMessage);
    },
    async touchSearchText(accountId, messageId, searchText) {
      await client.mutation(api.mailIndex.touchSearchText, { ...s(), accountId, messageId, searchText });
    },
    async pruneOldestMessages(accountId) {
      await client.mutation(api.mailIndex.pruneOldestMessages, { ...s(), accountId });
    },
    async putThreads(rows) {
      await client.mutation(api.mailIndex.putThreads, { ...s(), threads: rows.map(toThread) });
    },
    async deleteThread(accountId, threadId) {
      await client.mutation(api.mailIndex.deleteThread, { ...s(), accountId, threadId });
    },
    async getThread(accountId, threadId) {
      const row = await client.query(api.mailIndex.getThread, { ...s(), accountId, threadId });
      return row ? fromThread(row) : null;
    },
    async listThreads(accountId) {
      const rows = await client.query(api.mailIndex.listThreads, { ...s(), accountId });
      return rows.map(fromThread);
    },
    async getThreadState(accountId, threadId) {
      const row = await client.query(api.mailIndex.getThreadState, { ...s(), accountId, threadId });
      return row ? fromState(row) : null;
    },
    async listThreadStates(accountId) {
      const rows = await client.query(api.mailIndex.listThreadStates, { ...s(), accountId });
      return rows.map(fromState);
    },
    async patchThreadState(accountId, threadId, patch) {
      const next: {
        pinned?: number;
        snoozedUntil?: number | null;
        remindAt?: number | null;
        remindSetAt?: number | null;
        nudged?: number;
        waitingDismissedAt?: number | null;
        brief?: string | null;
      } = {};
      if (patch.pinned !== undefined) next.pinned = patch.pinned;
      if (patch.snoozed_until !== undefined) next.snoozedUntil = patch.snoozed_until;
      if (patch.remind_at !== undefined) next.remindAt = patch.remind_at;
      if (patch.remind_set_at !== undefined) next.remindSetAt = patch.remind_set_at;
      if (patch.nudged !== undefined) next.nudged = patch.nudged;
      if (patch.waiting_dismissed_at !== undefined) next.waitingDismissedAt = patch.waiting_dismissed_at;
      if (patch.brief !== undefined) next.brief = patch.brief;
      await client.mutation(api.mailIndex.patchThreadState, { ...s(), accountId, threadId, patch: next });
    },
    async dueThreadStates(now) {
      const rows = await client.query(api.mailIndex.dueThreadStates, { ...s(), now });
      return rows.map(fromState);
    },
    async getBody(accountId, messageId) {
      return await client.query(api.mailIndex.getBody, { ...s(), accountId, messageId });
    },
    async putBody(accountId, messageId, json) {
      await client.mutation(api.mailIndex.putBody, { ...s(), accountId, messageId, json: json.slice(0, BODY_JSON_MAX) });
    },
    async wipeIndex(accountId) {
      await client.mutation(api.mailIndex.wipeIndex, { ...s(), accountId });
    },
    async putQueue(row) {
      await client.mutation(api.queue.putQueue, {
        ...s(),
        row: {
          queueId: row.id,
          accountId: row.account_id,
          payload: row.payload,
          sendAt: row.send_at,
          status: row.status,
          error: row.error,
          threadId: row.thread_id,
          createdAt: row.created_at,
          displaySubject: row.display_subject,
          displayToJson: row.display_to_json,
        },
      });
    },
    async getQueue(id) {
      const row = await client.query(api.queue.getQueue, { ...s(), queueId: id });
      return row ? fromQueue(row) : null;
    },
    async updateQueue(id, patch, expectedStatus) {
      return await client.mutation(api.queue.updateQueue, {
        ...s(),
        queueId: id,
        expectedStatus,
        status: patch.status,
        error: patch.error,
        threadId: patch.thread_id,
        sendAt: patch.send_at,
      });
    },
    async dueQueue(now) {
      const rows = await client.query(api.queue.dueQueue, { ...s(), now });
      return rows.map(fromQueue);
    },
    async listQueueForAccounts(accountIds, since) {
      const rows = await client.query(api.queue.listQueueForAccounts, { ...s(), accountIds, since });
      return rows.map(fromQueue);
    },
    async requeueSending() {
      await client.mutation(api.queue.requeueSending, s());
    },
  };
}
