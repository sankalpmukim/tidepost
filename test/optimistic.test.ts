import { afterEach, describe, expect, it } from "vitest";
import { LEAVES_VIEW, projectThreadList, rollbackAction, stageAction } from "../src/optimistic";
import type { ThreadSummary } from "../shared/types";

const AID = "acc1";

function thread(id: string, over: Partial<ThreadSummary> = {}): ThreadSummary {
  return {
    id,
    accountId: AID,
    subject: `s ${id}`,
    snippet: "",
    participants: [],
    lastFrom: { name: "A", email: "a@x.example" },
    lastFromMe: false,
    lastDate: new Date().toISOString(),
    firstDate: new Date().toISOString(),
    messageCount: 1,
    unreadCount: 1,
    starred: false,
    hasAttachments: false,
    folders: ["INBOX"],
    inInbox: true,
    lane: "needs",
    toMeDirect: true,
    isBulk: false,
    pinned: false,
    snoozedUntil: null,
    remindAt: null,
    nudged: false,
    audienceSize: 2,
    ...over,
  };
}

const ids = (list: ThreadSummary[]) => list.map((t) => t.id);

afterEach(() => {
  rollbackAction(AID, ["t1", "t2", "t3", "t9"]);
});

describe("optimistic overlay", () => {
  it("hides trashed threads in the current view immediately", () => {
    stageAction(AID, "needs", ["t1"], { type: "trash" });
    const { threads, hidden } = projectThreadList(AID, "needs", [thread("t1"), thread("t2")]);
    expect(ids(threads)).toEqual(["t2"]);
    expect(hidden).toBe(1);
  });

  it("hides are scoped to the view the action was staged in", () => {
    stageAction(AID, "needs", ["t1"], { type: "archive" });
    // Archive keeps the thread visible in All mail.
    expect(ids(projectThreadList(AID, "all", [thread("t1")]).threads)).toEqual(["t1"]);
    expect(ids(projectThreadList(AID, "needs", [thread("t1")]).threads)).toEqual([]);
  });

  it("patches fields in place for non-leaving actions", () => {
    stageAction(AID, "needs", ["t1"], { type: "read" });
    const { threads } = projectThreadList(AID, "needs", [thread("t1")]);
    expect(threads[0].unreadCount).toBe(0);
  });

  it("rollback brings a hidden thread back", () => {
    stageAction(AID, "needs", ["t1"], { type: "trash" });
    rollbackAction(AID, ["t1"]);
    expect(ids(projectThreadList(AID, "needs", [thread("t1")]).threads)).toEqual(["t1"]);
  });

  it("drops the hide once the live list stops returning the thread", () => {
    stageAction(AID, "needs", ["t1"], { type: "trash" });
    // Live query confirms: thread gone server-side.
    projectThreadList(AID, "needs", [thread("t2")]);
    // Same view again but the thread reappears (e.g. an undo raced in): it must show.
    expect(ids(projectThreadList(AID, "needs", [thread("t1")]).threads)).toEqual(["t1"]);
  });

  it("keeps hiding while the server still returns the thread", () => {
    stageAction(AID, "needs", ["t1"], { type: "trash" });
    projectThreadList(AID, "needs", [thread("t1"), thread("t2")]);
    expect(ids(projectThreadList(AID, "needs", [thread("t1"), thread("t2")]).threads)).toEqual(["t2"]);
  });

  it("does not hide other accounts' threads with the same id", () => {
    stageAction(AID, "needs", ["t1"], { type: "trash" });
    expect(ids(projectThreadList("acc2", "needs", [thread("t1")]).threads)).toEqual(["t1"]);
  });

  it("LEAVES_VIEW: trash always leaves, archive stays in all mail", () => {
    expect(LEAVES_VIEW.trash?.("all")).toBe(true);
    expect(LEAVES_VIEW.archive?.("all")).toBe(false);
    expect(LEAVES_VIEW.archive?.("needs")).toBe(true);
  });
});
