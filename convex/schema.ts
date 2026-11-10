import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  users: defineTable({
    appId: v.string(),
    createdAt: v.number(),
    settings: v.string(),
  }).index("by_appId", ["appId"]),

  sessions: defineTable({
    sessionId: v.string(),
    userId: v.string(),
    createdAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_sessionId", ["sessionId"])
    .index("by_userId", ["userId"])
    .index("by_expiresAt", ["expiresAt"]),

  accounts: defineTable({
    accountId: v.string(),
    userId: v.string(),
    provider: v.union(v.literal("gmail"), v.literal("outlook"), v.literal("demo")),
    email: v.string(),
    name: v.string(),
    tokens: v.union(v.string(), v.null()),
    cursor: v.union(v.string(), v.null()),
    sync: v.string(),
    createdAt: v.number(),
  })
    .index("by_accountId", ["accountId"])
    .index("by_userId", ["userId"])
    .index("by_provider_and_email", ["provider", "email"])
    .index("by_userId_and_provider_and_email", ["userId", "provider", "email"]),

  messages: defineTable({
    accountId: v.string(),
    messageId: v.string(),
    threadId: v.string(),
    fromName: v.string(),
    fromEmail: v.string(),
    toJson: v.string(),
    ccJson: v.string(),
    bccJson: v.string(),
    replyToJson: v.string(),
    subject: v.string(),
    snippet: v.string(),
    dateMs: v.number(),
    unread: v.boolean(),
    starred: v.boolean(),
    folders: v.string(),
    hasAtt: v.boolean(),
    msgidHdr: v.union(v.string(), v.null()),
    inReplyTo: v.union(v.string(), v.null()),
    refs: v.union(v.string(), v.null()),
    bulkJson: v.string(),
    category: v.union(v.string(), v.null()),
    importance: v.string(),
    size: v.number(),
    searchText: v.string(),
  })
    .index("by_accountId_and_messageId", ["accountId", "messageId"])
    .index("by_accountId_and_threadId", ["accountId", "threadId"])
    .index("by_accountId_and_dateMs", ["accountId", "dateMs"]),

  threads: defineTable({
    accountId: v.string(),
    threadId: v.string(),
    subject: v.string(),
    snippet: v.string(),
    participants: v.string(),
    lastFromName: v.string(),
    lastFromEmail: v.string(),
    lastFromMe: v.boolean(),
    lastDateMs: v.number(),
    firstDateMs: v.number(),
    messageCount: v.number(),
    unreadCount: v.number(),
    starred: v.boolean(),
    hasAtt: v.boolean(),
    folders: v.string(),
    inInbox: v.boolean(),
    toMeDirect: v.boolean(),
    isBulk: v.boolean(),
    audience: v.number(),
  })
    .index("by_accountId_and_threadId", ["accountId", "threadId"])
    .index("by_accountId_and_lastDateMs", ["accountId", "lastDateMs"]),

  threadStates: defineTable({
    accountId: v.string(),
    threadId: v.string(),
    pinned: v.number(),
    snoozedUntil: v.union(v.number(), v.null()),
    remindAt: v.union(v.number(), v.null()),
    remindSetAt: v.union(v.number(), v.null()),
    nudged: v.number(),
    waitingDismissedAt: v.union(v.number(), v.null()),
    brief: v.union(v.string(), v.null()),
  })
    .index("by_accountId_and_threadId", ["accountId", "threadId"])
    .index("by_snoozedUntil", ["snoozedUntil"])
    .index("by_remindAt", ["remindAt"]),

  bodies: defineTable({
    accountId: v.string(),
    messageId: v.string(),
    json: v.string(),
    accessedAt: v.number(),
  })
    .index("by_accountId_and_messageId", ["accountId", "messageId"])
    .index("by_accountId_and_accessedAt", ["accountId", "accessedAt"]),

  sendQueue: defineTable({
    queueId: v.string(),
    accountId: v.string(),
    payload: v.string(),
    sendAt: v.number(),
    status: v.union(
      v.literal("queued"),
      v.literal("sending"),
      v.literal("sent"),
      v.literal("failed"),
      v.literal("cancelled"),
    ),
    error: v.union(v.string(), v.null()),
    threadId: v.union(v.string(), v.null()),
    createdAt: v.number(),
    displaySubject: v.optional(v.string()),
    displayToJson: v.optional(v.string()),
  })
    .index("by_queueId", ["queueId"])
    .index("by_status_and_sendAt", ["status", "sendAt"])
    .index("by_accountId_and_createdAt", ["accountId", "createdAt"]),
});
