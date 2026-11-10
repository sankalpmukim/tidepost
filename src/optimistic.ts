// Optimistic thread-list overlay: actions applied to the rendered list before
// the server confirms them, rolled back if the server disagrees.
//
// The list itself renders from the Convex live query, which only reflects the
// database — so without this layer the row a user just trashed sits in place
// for the whole server round trip (provider API + Convex writes) while the
// keyboard focus has already moved on. Entries are temporary by construction:
// they expire so server truth always wins, and hide entries are dropped as
// soon as the live query stops returning the thread.
import { useSyncExternalStore } from "react";
import type { ThreadAction, ThreadSummary } from "../shared/types";

/** Actions that take a thread out of the given view (it should disappear there). */
export const LEAVES_VIEW: Partial<Record<ThreadAction["type"], (view: string) => boolean>> = {
  archive: (v) => v !== "all" && v !== "search" && v !== "starred" && v !== "sent" && v !== "waiting" && !v.startsWith("folder:"),
  trash: () => true,
  spam: () => true,
  snooze: (v) => v !== "snoozed",
  unsnooze: (v) => v === "snoozed",
  move: (v) => v !== "all" && v !== "search",
  stopWaiting: (v) => v === "waiting",
  read: (v) => v === "fyi-unread",
  unstar: (v) => v === "starred",
  inbox: (v) => v === "archive" || v === "trash" || v === "spam",
};

interface Entry {
  id: string;
  accountId: string;
  /** View the hide was staged in; hides are view-scoped, patches are not. */
  view: string;
  /** Epoch ms when staged. */
  at: number;
  /** Remove the row from `view` until the live query confirms. */
  hide: boolean;
  /** In-place field updates, applied in every view. */
  patch?: Partial<ThreadSummary>;
}

/** How long an entry may outlive its action before server truth wins again. */
const EXPIRE_MS = 10_000;

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();
let revision = 0;

const key = (aid: string, id: string) => `${aid}:${id}`;

function notify(): void {
  revision++;
  for (const l of listeners) l();
}

/** Re-render whenever staged entries change (stage, rollback, expiry). */
export function useOptimisticRevision(): number {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => {
        listeners.delete(cb);
      };
    },
    () => revision,
  );
}

function patchFor(action: ThreadAction): Partial<ThreadSummary> | undefined {
  switch (action.type) {
    case "read": return { unreadCount: 0 };
    case "unread": return { unreadCount: 1 };
    case "star": return { starred: true };
    case "unstar": return { starred: false };
    case "pin": return { pinned: true };
    case "unpin": return { pinned: false };
    default: return undefined;
  }
}

/** Record an action's intended effect so the list can move before the server confirms. */
export function stageAction(accountId: string, view: string, threadIds: string[], action: ThreadAction): void {
  const hide = LEAVES_VIEW[action.type]?.(view) ?? false;
  const patch = patchFor(action);
  if ((!hide && !patch) || !threadIds.length) return;
  const at = Date.now();
  for (const id of threadIds) {
    const k = key(accountId, id);
    const prev = entries.get(k);
    entries.set(k, {
      id,
      accountId,
      view,
      at,
      hide: hide || (prev?.view === view ? prev.hide : false),
      patch: { ...prev?.patch, ...patch },
    });
  }
  notify();
  // Safety valve: if the server never confirms, stop overriding it.
  const timer = setTimeout(() => {
    const now = Date.now();
    let changed = false;
    for (const [k, e] of entries) {
      if (now - e.at >= EXPIRE_MS) {
        entries.delete(k);
        changed = true;
      }
    }
    if (changed) notify();
  }, EXPIRE_MS + 20);
  timer.unref?.();
}

/** Drop staged entries (e.g. the server rejected the action): the row comes back. */
export function rollbackAction(accountId: string, threadIds: string[]): void {
  let changed = false;
  for (const id of threadIds) {
    const k = key(accountId, id);
    if (entries.delete(k)) changed = true;
  }
  if (changed) notify();
}

/** Apply staged entries to a list of threads for one account + view. */
export function projectThreadList(aid: string, view: string, threads: ThreadSummary[]): { threads: ThreadSummary[]; hidden: number } {
  const now = Date.now();
  const live = new Set(threads.map((t) => t.id));
  let hidden = 0;
  const out: ThreadSummary[] = [];
  for (const t of threads) {
    const e = entries.get(key(aid, t.id));
    if (!e) {
      out.push(t);
      continue;
    }
    if (now - e.at > EXPIRE_MS) {
      entries.delete(key(aid, t.id));
      out.push(t);
      continue;
    }
    if (e.hide && e.view === view) {
      hidden++;
      continue;
    }
    out.push(e.patch ? { ...t, ...e.patch } : t);
  }
  // The live query no longer returns a hidden thread: the server confirmed.
  // Drop those entries so they cannot hide it again later (e.g. after undo).
  for (const [k, e] of entries) {
    if (e.accountId === aid && e.hide && e.view === view && !live.has(e.id)) entries.delete(k);
  }
  return { threads: out, hidden };
}
