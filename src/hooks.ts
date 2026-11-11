import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import { LEAVES_VIEW, projectThreadList, rollbackAction, stageAction, useOptimisticRevision } from "./optimistic";
import { getUi, setUi, toast, useUi, type UndoEntry } from "./store";
import type { Account, QueuedSend, Run, Settings, Thread, ThreadAction, ThreadPage, ThreadSummary } from "../shared/types";

/** How often purely time-based lanes (Waiting's 30-day window, due snoozes)
 *  re-evaluate. The old Convex subscriptions re-ran on a 30s client tick. */
const LANE_REFRESH_MS = 30_000;

export function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(t);
  }, []);
  return now;
}

export function useConfig() {
  return useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
}

export function useMe(): {
  data: { accounts: Account[]; settings: Settings } | undefined;
  isLoading: boolean;
  isPending: boolean;
  error: Error | null;
  refetch: () => Promise<unknown>;
} {
  // Sync state changes arrive as "sync" SSE events which invalidate ["me"].
  const q = useQuery({ queryKey: ["me"], queryFn: api.me, staleTime: 5_000, refetchInterval: 60_000 });
  return {
    data: q.data,
    isLoading: q.isLoading,
    isPending: q.isPending,
    error: q.error,
    refetch: q.refetch,
  };
}

export function useAccount(): Account | null {
  const me = useMe();
  const id = useUi((s) => s.accountId);
  return me.data?.accounts.find((a) => a.id === id) ?? me.data?.accounts[0] ?? null;
}

export function useCounts(aid: string | null) {
  const q = useQuery({
    queryKey: ["counts", aid],
    queryFn: () => api.counts(aid!),
    enabled: !!aid,
    staleTime: 5_000,
    refetchInterval: LANE_REFRESH_MS,
  });
  return { data: q.data, isLoading: aid ? q.isLoading : false };
}

export function useFolders(aid: string | null) {
  return useQuery({ queryKey: ["folders", aid], queryFn: () => api.folders(aid!), enabled: !!aid, staleTime: 120_000 });
}

/** Fetch every page of a lane so the virtualized list sees the full set,
 *  exactly like the old live query did (server caps threads at 600). */
async function fetchAllThreads(aid: string, view: string): Promise<ThreadPage> {
  let cursor: string | null = null;
  const threads: ThreadSummary[] = [];
  let total = 0;
  for (let page = 0; page < 5; page++) {
    const p = await api.threads(aid, view, cursor);
    threads.push(...p.threads);
    total = p.total;
    if (!p.nextCursor) break;
    cursor = p.nextCursor;
  }
  return { threads, nextCursor: null, total };
}

let lastVisibleIds: string[] = [];
let lastThreadSummaries: ThreadSummary[] = [];

export function liveSummaries(): ThreadSummary[] {
  return lastThreadSummaries;
}

export function useThreads(aid: string | null, view: string, search: string) {
  // Re-render when optimistic entries change so the list moves with actions.
  useOptimisticRevision();
  const list = useQuery({
    queryKey: ["threads", aid, view],
    queryFn: () => fetchAllThreads(aid!, view),
    enabled: !!aid && view !== "search",
    staleTime: 5_000,
    refetchInterval: LANE_REFRESH_MS,
  });
  const remote = useInfiniteQuery({
    queryKey: ["search", aid, search],
    queryFn: async (): Promise<ThreadPage> => api.search(aid!, search),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!aid && view === "search" && !!search.trim(),
    staleTime: 15_000,
  });
  if (view === "search") return remote;
  const isLoading = list.isPending;
  const data = list.data;
  if (data && aid) {
    const { threads: shown, hidden } = projectThreadList(aid, view, data.threads);
    lastVisibleIds = shown.map((t) => t.id);
    lastThreadSummaries = shown;
    const projected: ThreadPage = { threads: shown, total: Math.max(0, data.total - hidden), nextCursor: null };
    return {
      data: { pages: [projected], pageParams: [null] } as InfiniteData<ThreadPage, string | null>,
      isFetching: list.isFetching,
      isPending: isLoading,
      isLoading,
      hasNextPage: false,
      isFetchingNextPage: false,
      fetchNextPage: async () => undefined,
    };
  }
  return {
    data: undefined,
    isFetching: list.isFetching,
    isPending: isLoading,
    isLoading,
    hasNextPage: false,
    isFetchingNextPage: false,
    fetchNextPage: async () => undefined,
  };
}

export function useLocalSearch(aid: string | null, q: string, enabled: boolean) {
  const query = useQuery({
    queryKey: ["lsearch", aid, q],
    queryFn: () => api.search(aid!, q, true),
    enabled: !!aid && enabled && q.trim().length > 1,
    staleTime: 15_000,
  });
  return { data: query.data, isFetching: query.isFetching && !!query.data };
}

export function useThread(aid: string | null, tid: string | null) {
  const first = useRef<string | null>(null);
  return useQuery({
    queryKey: ["thread", aid, tid],
    queryFn: () => {
      const refresh = first.current !== tid;
      first.current = tid;
      return api.thread(aid!, tid!, refresh);
    },
    enabled: !!aid && !!tid,
    staleTime: 30_000,
  });
}

export function useRuns() {
  return useQuery({ queryKey: ["runs"], queryFn: api.runs, staleTime: 10_000 });
}

export function useSends() {
  // Status changes arrive as "send" SSE events which invalidate ["sends"].
  const q = useQuery({ queryKey: ["sends"], queryFn: api.sends, staleTime: 5_000, refetchInterval: 15_000 });
  return { data: q.data };
}

// ---------- live updates ----------

type ServerEvent =
  | { type: "threads"; accountId: string; threadIds: string[] }
  | { type: "sync"; accountId: string; sync: Account["sync"] }
  | { type: "run"; run: Run }
  | { type: "send"; send: QueuedSend }
  | { type: "folders"; accountId: string }
  | { type: "auth"; accountId: string; message: string };

export function useLiveEvents(onSend: (s: QueuedSend) => void) {
  const qc = useQueryClient();
  const sendRef = useRef(onSend);
  sendRef.current = onSend;
  const sends = useSends().data;
  const prevStatus = useRef(new Map<string, QueuedSend["status"]>());
  useEffect(() => {
    if (!sends) return;
    for (const s of sends) {
      const prev = prevStatus.current.get(s.id);
      if (prev && prev !== s.status) sendRef.current(s);
    }
    prevStatus.current = new Map(sends.map((s: QueuedSend) => [s.id, s.status]));
  }, [sends]);
  useEffect(() => {
    let es: EventSource | null = null;
    let retry: number | undefined;
    const connect = () => {
      es = new EventSource("/api/events");
      es.onmessage = (msg) => {
        const e = JSON.parse(msg.data as string) as ServerEvent;
        switch (e.type) {
          case "run":
            qc.setQueryData<Run[]>(["runs"], (old) => {
              const list = old ?? [];
              const i = list.findIndex((r) => r.id === e.run.id);
              return i >= 0 ? list.map((r) => (r.id === e.run.id ? e.run : r)) : [e.run, ...list];
            });
            break;
          case "sync":
            // Sync state lives on the account rows in /api/me.
            void qc.invalidateQueries({ queryKey: ["me"] });
            break;
          case "send":
            void qc.invalidateQueries({ queryKey: ["sends"] });
            break;
          case "folders":
            void qc.invalidateQueries({ queryKey: ["folders", e.accountId] });
            break;
          case "auth":
            toast({ text: `${e.message}`, tone: "error", sticky: true, action: { label: "Sign in again", run: () => { window.location.href = "/api/auth/google/start"; } } });
            break;
          case "threads": {
            void qc.invalidateQueries({ queryKey: ["threads", e.accountId] });
            void qc.invalidateQueries({ queryKey: ["counts", e.accountId] });
            const open = getUi().openThreadId;
            if (open && e.threadIds.includes(open)) void qc.invalidateQueries({ queryKey: ["thread", e.accountId, open] });
            break;
          }
          default:
            break;
        }
      };
      es.onerror = () => {
        es?.close();
        retry = window.setTimeout(connect, 3000);
      };
    };
    connect();
    return () => {
      es?.close();
      if (retry) clearTimeout(retry);
    };
  }, [qc]);
}

// ---------- actions ----------

const PAST: Partial<Record<ThreadAction["type"], string>> = {
  archive: "Archived", inbox: "Moved to inbox", trash: "Moved to trash", spam: "Reported as spam", read: "Marked read",
  unread: "Marked unread", star: "Starred", unstar: "Unstarred", pin: "Pinned", unpin: "Unpinned", snooze: "Snoozed",
  unsnooze: "Unsnoozed", remind: "Follow-up reminder set", unremind: "Reminder removed", label: "Labelled", unlabel: "Label removed",
  move: "Moved", stopWaiting: "Stopped waiting",
};

/** Visible thread ids in the current list, in order. */
export function visibleIds(qc: QueryClient): string[] {
  const { accountId, view, search } = getUi();
  if (view !== "search") return lastVisibleIds;
  const data = qc.getQueryData<InfiniteData<ThreadPage>>(["search", accountId, search]);
  return data ? data.pages.flatMap((p) => p.threads.map((t) => t.id)) : lastVisibleIds;
}

export function useActions() {
  const qc = useQueryClient();

  const perform = async (threadIds: string[], action: ThreadAction, opts: { silent?: boolean; undoable?: boolean } = {}) => {
    const { accountId: aid, view, openThreadId, focusedThreadId } = getUi();
    if (!aid || !threadIds.length) return;
    const ids = new Set(threadIds);
    const order = visibleIds(qc);
    const leaves = LEAVES_VIEW[action.type]?.(view) ?? false;
    // Move focus to the next thread before the current one disappears.
    if (leaves) {
      const anchor = openThreadId && ids.has(openThreadId) ? openThreadId : focusedThreadId && ids.has(focusedThreadId) ? focusedThreadId : null;
      if (anchor) {
        const idx = order.indexOf(anchor);
        const rest = order.filter((id) => !ids.has(id));
        const next = rest[Math.min(idx, rest.length - 1)] ?? null;
        setUi((s) => ({ focusedThreadId: next, openThreadId: s.openThreadId && ids.has(s.openThreadId) ? next : s.openThreadId }));
      }
    }
    // Optimistic: the list moves now; the entries roll back if the server rejects.
    stageAction(aid, view, threadIds, action);
    setUi((s) => ({ checked: new Set([...s.checked].filter((id) => !ids.has(id))) }));
    try {
      const res = await api.action(aid, threadIds, action);
      const inv = inverseOf(action);
      const undo: UndoEntry | null = inv && opts.undoable !== false ? { label: PAST[action.type] ?? "Done", accountId: aid, threadIds, inverse: inv } : null;
      if (undo) setUi({ undo });
      if (!opts.silent) {
        const n = threadIds.length;
        const what = res.run ? `${PAST[action.type] ?? "Updating"} ${n} threads in the background` : `${PAST[action.type] ?? "Done"}${n > 1 ? ` ${n} threads` : ""}`;
        toast({ text: what, action: undo ? { label: "Undo", run: () => void runUndo(undo) } : undefined }, 4000);
      }
    } catch (err) {
      rollbackAction(aid, threadIds);
      toast({ text: err instanceof ApiError ? err.message : "That didn't work. Try again.", tone: "error" });
    } finally {
      void qc.invalidateQueries({ queryKey: ["threads", aid] });
      void qc.invalidateQueries({ queryKey: ["counts", aid] });
      for (const t of threadIds) void qc.invalidateQueries({ queryKey: ["thread", aid, t] });
    }
  };

  const runUndo = async (u: UndoEntry) => {
    setUi({ undo: null });
    const { accountId: aid, view } = getUi();
    if (aid) stageAction(aid, view, u.threadIds, u.inverse);
    try {
      await api.action(u.accountId, u.threadIds, u.inverse);
      toast({ text: "Undone" }, 2000);
    } catch (err) {
      if (aid) rollbackAction(aid, u.threadIds);
      toast({ text: err instanceof ApiError ? err.message : "Couldn't undo.", tone: "error" });
    }
    void qc.invalidateQueries({ queryKey: ["threads", u.accountId] });
    void qc.invalidateQueries({ queryKey: ["counts", u.accountId] });
  };

  return { perform, undo: () => { const u = getUi().undo; if (u) void runUndo(u); else toast({ text: "Nothing to undo" }, 1500); } };
}

function inverseOf(a: ThreadAction): ThreadAction | null {
  switch (a.type) {
    case "archive": return { type: "inbox" };
    case "inbox": return { type: "archive" };
    case "trash": return { type: "inbox" };
    case "spam": return { type: "inbox" };
    case "read": return { type: "unread" };
    case "unread": return { type: "read" };
    case "star": return { type: "unstar" };
    case "unstar": return { type: "star" };
    case "pin": return { type: "unpin" };
    case "unpin": return { type: "pin" };
    case "snooze": return { type: "unsnooze" };
    case "remind": return { type: "unremind" };
    case "label": return { type: "unlabel", folderId: a.folderId };
    case "unlabel": return { type: "label", folderId: a.folderId };
    default: return null;
  }
}

export function threadFromCache(qc: QueryClient, aid: string, tid: string): Thread | undefined {
  return qc.getQueryData<Thread>(["thread", aid, tid]);
}
