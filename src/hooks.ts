import { useEffect, useRef } from "react";
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData, type QueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import { getUi, setUi, toast, useUi, type UndoEntry } from "./store";
import type { Account, QueuedSend, Run, Thread, ThreadAction, ThreadPage, ThreadSummary } from "../shared/types";

export function useConfig() {
  return useQuery({ queryKey: ["config"], queryFn: api.config, staleTime: Infinity });
}

export function useMe() {
  return useQuery({ queryKey: ["me"], queryFn: api.me, retry: false, staleTime: 60_000 });
}

export function useAccount(): Account | null {
  const me = useMe();
  const id = useUi((s) => s.accountId);
  return me.data?.accounts.find((a) => a.id === id) ?? me.data?.accounts[0] ?? null;
}

export function useCounts(aid: string | null) {
  return useQuery({ queryKey: ["counts", aid], queryFn: () => api.counts(aid!), enabled: !!aid, refetchInterval: 60_000 });
}

export function useFolders(aid: string | null) {
  return useQuery({ queryKey: ["folders", aid], queryFn: () => api.folders(aid!), enabled: !!aid, staleTime: 120_000 });
}

export function useThreads(aid: string | null, view: string, search: string) {
  return useInfiniteQuery({
    queryKey: view === "search" ? ["search", aid, search] : ["threads", aid, view],
    queryFn: async ({ pageParam }): Promise<ThreadPage> => {
      if (view === "search") return api.search(aid!, search);
      return api.threads(aid!, view, pageParam);
    },
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!aid && (view !== "search" || !!search.trim()),
    staleTime: 15_000,
    placeholderData: (prev) => prev,
  });
}

export function useLocalSearch(aid: string | null, q: string, enabled: boolean) {
  return useQuery({ queryKey: ["local-search", aid, q], queryFn: () => api.search(aid!, q, true), enabled: !!aid && enabled && q.trim().length > 1, staleTime: 10_000 });
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
  return useQuery({ queryKey: ["sends"], queryFn: api.sends, staleTime: 10_000 });
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
  useEffect(() => {
    let es: EventSource | null = null;
    let retry: number | undefined;
    const pending = new Map<string, Set<string>>();
    let flushTimer: number | undefined;
    const flush = () => {
      flushTimer = undefined;
      for (const [aid, tids] of pending) {
        void qc.invalidateQueries({ queryKey: ["threads", aid] });
        void qc.invalidateQueries({ queryKey: ["counts", aid] });
        const open = getUi().openThreadId;
        if (open && tids.has(open)) void qc.invalidateQueries({ queryKey: ["thread", aid, open] });
      }
      pending.clear();
    };
    const connect = () => {
      es = new EventSource("/api/events");
      es.onmessage = (msg) => {
        const e = JSON.parse(msg.data as string) as ServerEvent;
        switch (e.type) {
          case "threads": {
            const set = pending.get(e.accountId) ?? new Set<string>();
            e.threadIds.forEach((t) => set.add(t));
            pending.set(e.accountId, set);
            if (!flushTimer) flushTimer = window.setTimeout(flush, 350);
            break;
          }
          case "sync":
            qc.setQueryData<{ accounts: Account[] }>(["me"], (old) => (old ? { ...old, accounts: old.accounts.map((a) => (a.id === e.accountId ? { ...a, sync: e.sync } : a)) } : old));
            break;
          case "run":
            qc.setQueryData<Run[]>(["runs"], (old) => {
              const list = old ?? [];
              const i = list.findIndex((r) => r.id === e.run.id);
              return i >= 0 ? list.map((r) => (r.id === e.run.id ? e.run : r)) : [e.run, ...list];
            });
            break;
          case "send":
            qc.setQueryData<QueuedSend[]>(["sends"], (old) => {
              const list = old ?? [];
              const i = list.findIndex((s) => s.id === e.send.id);
              return i >= 0 ? list.map((s) => (s.id === e.send.id ? e.send : s)) : [e.send, ...list];
            });
            sendRef.current(e.send);
            break;
          case "folders":
            void qc.invalidateQueries({ queryKey: ["folders", e.accountId] });
            break;
          case "auth":
            toast({ text: `${e.message}`, tone: "error", sticky: true, action: { label: "Sign in again", run: () => { window.location.href = "/api/auth/google/start"; } } });
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
      if (flushTimer) clearTimeout(flushTimer);
    };
  }, [qc]);
}

// ---------- actions ----------

const LEAVES_VIEW: Partial<Record<ThreadAction["type"], (view: string) => boolean>> = {
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

const PAST: Partial<Record<ThreadAction["type"], string>> = {
  archive: "Archived", inbox: "Moved to inbox", trash: "Moved to trash", spam: "Reported as spam", read: "Marked read",
  unread: "Marked unread", star: "Starred", unstar: "Unstarred", pin: "Pinned", unpin: "Unpinned", snooze: "Snoozed",
  unsnooze: "Unsnoozed", remind: "Follow-up reminder set", unremind: "Reminder removed", label: "Labelled", unlabel: "Label removed",
  move: "Moved", stopWaiting: "Stopped waiting",
};

function patchLists(qc: QueryClient, aid: string, fn: (view: string, t: ThreadSummary) => ThreadSummary | null) {
  for (const [key, data] of qc.getQueriesData<InfiniteData<ThreadPage>>({ queryKey: ["threads", aid] })) {
    if (!data) continue;
    const view = String(key[2]);
    qc.setQueryData<InfiniteData<ThreadPage>>(key, {
      ...data,
      pages: data.pages.map((p) => ({ ...p, threads: p.threads.map((t) => fn(view, t)).filter((t): t is ThreadSummary => !!t) })),
    });
  }
}

/** Visible thread ids in the current list, in order. */
export function visibleIds(qc: QueryClient): string[] {
  const { accountId, view, search } = getUi();
  const key = view === "search" ? ["search", accountId, search] : ["threads", accountId, view];
  const data = qc.getQueryData<InfiniteData<ThreadPage>>(key);
  return data ? data.pages.flatMap((p) => p.threads.map((t) => t.id)) : [];
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
    patchLists(qc, aid, (v, t) => {
      if (!ids.has(t.id)) return t;
      if (LEAVES_VIEW[action.type]?.(v)) return null;
      if (action.type === "read") return { ...t, unreadCount: 0 };
      if (action.type === "unread") return { ...t, unreadCount: Math.max(1, t.unreadCount) };
      if (action.type === "star") return { ...t, starred: true };
      if (action.type === "unstar") return { ...t, starred: false };
      if (action.type === "pin") return { ...t, pinned: true };
      if (action.type === "unpin") return { ...t, pinned: false };
      return t;
    });
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
      toast({ text: err instanceof ApiError ? err.message : "That didn't work. Try again.", tone: "error" });
    } finally {
      void qc.invalidateQueries({ queryKey: ["threads", aid] });
      void qc.invalidateQueries({ queryKey: ["counts", aid] });
      for (const t of threadIds) void qc.invalidateQueries({ queryKey: ["thread", aid, t] });
    }
  };

  const runUndo = async (u: UndoEntry) => {
    setUi({ undo: null });
    try {
      await api.action(u.accountId, u.threadIds, u.inverse);
      toast({ text: "Undone" }, 2000);
    } catch (err) {
      toast({ text: err instanceof ApiError ? err.message : "Couldn't undo.", tone: "error" });
    }
    void qc.invalidateQueries({ queryKey: ["threads", u.accountId] });
    void qc.invalidateQueries({ queryKey: ["counts", u.accountId] });
  };

  return { perform, undo: () => { const u = getUi().undo; if (u) void runUndo(u); else toast({ text: "Nothing to undo" }, 1500); } };
}

export function threadFromCache(qc: QueryClient, aid: string, tid: string): Thread | undefined {
  return qc.getQueryData<Thread>(["thread", aid, tid]);
}
