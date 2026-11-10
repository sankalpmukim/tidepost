import { describe, expect, it } from "vitest";
import { createConvexPersist } from "../server/persistConvex";
import type { MessagePersistRow, ThreadPersistRow } from "../server/persist";

process.env.TIDEPOST_SECRET ||= "test-secret";

function fakeClient() {
  const calls: Record<string, unknown>[] = [];
  const client = {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async mutation(_ref: any, args: Record<string, unknown>) {
      calls.push(args);
      if ("messages" in args) return [];
      if ("ids" in args) return [];
      return null;
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    async query(_ref: any, _args: any) {
      return null;
    },
  };
  return { calls, client };
}

function msgRow(i: number): MessagePersistRow {
  return {
    account_id: "a1",
    id: `m${i}`,
    thread_id: `t${i % 3}`,
    from_name: "A",
    from_email: "a@x.example",
    to_json: "[]",
    cc_json: "[]",
    bcc_json: "[]",
    reply_to_json: "[]",
    subject: "s",
    snippet: "s",
    date_ms: i,
    unread: 0,
    starred: 0,
    folders: ",INBOX,",
    has_att: 0,
    msgid_hdr: null,
    in_reply_to: null,
    refs: null,
    bulk_json: "{}",
    category: null,
    importance: "normal",
    size: 0,
    search_text: "s",
  };
}

function threadRow(i: number): ThreadPersistRow {
  return {
    account_id: "a1",
    id: `t${i}`,
    subject: "s",
    snippet: "s",
    participants: "[]",
    last_from_name: "A",
    last_from_email: "a@x.example",
    last_from_me: 0,
    last_date_ms: i,
    first_date_ms: i,
    message_count: 1,
    unread_count: 0,
    starred: 0,
    has_att: 0,
    folders: ",INBOX,",
    in_inbox: 1,
    to_me_direct: 1,
    is_bulk: 0,
    audience: 1,
  };
}

describe("convex persist write chunking", () => {
  it("splits putMessages into calls of at most 40 rows and writes every row", async () => {
    const { calls, client } = fakeClient();
    const persist = createConvexPersist("https://example.convex.cloud", client);
    const rows = Array.from({ length: 95 }, (_, i) => msgRow(i));
    await persist.putMessages(rows);
    const writes = calls.filter((c) => "messages" in c) as { messages: { messageId: string }[] }[];
    expect(writes.map((c) => c.messages.length)).toEqual([40, 40, 15]);
    const sent = writes.flatMap((c) => c.messages);
    expect(sent.map((m) => m.messageId)).toEqual(rows.map((r) => r.id));
  });

  it("splits deleteMessages into calls of at most 80 ids", async () => {
    const { calls, client } = fakeClient();
    const persist = createConvexPersist("https://example.convex.cloud", client);
    const ids = Array.from({ length: 170 }, (_, i) => `m${i}`);
    await persist.deleteMessages("a1", ids);
    const deletes = calls.filter((c) => "ids" in c) as { ids: string[] }[];
    expect(deletes.map((c) => c.ids.length)).toEqual([80, 80, 10]);
  });

  it("splits putThreads into calls of at most 40 rows", async () => {
    const { calls, client } = fakeClient();
    const persist = createConvexPersist("https://example.convex.cloud", client);
    const rows = Array.from({ length: 85 }, (_, i) => threadRow(i));
    await persist.putThreads(rows);
    const writes = calls.filter((c) => "threads" in c) as { threads: unknown[] }[];
    expect(writes.map((c) => c.threads.length)).toEqual([40, 40, 5]);
  });
});
