// In-process event bus. Each browser keeps one SSE connection per user.
import type { Run, QueuedSend, SyncState } from "../shared/types";
import { newId } from "./db";

export type ServerEvent =
  | { type: "threads"; accountId: string; threadIds: string[] }
  | { type: "sync"; accountId: string; sync: SyncState }
  | { type: "run"; run: Run }
  | { type: "send"; send: QueuedSend }
  | { type: "folders"; accountId: string }
  | { type: "auth"; accountId: string; message: string };

type Listener = (e: ServerEvent) => void;
const listeners = new Map<string, Set<Listener>>(); // userId -> listeners

export function subscribe(userId: string, fn: Listener): () => void {
  let set = listeners.get(userId);
  if (!set) listeners.set(userId, (set = new Set()));
  set.add(fn);
  return () => set!.delete(fn);
}

export function emit(userId: string, e: ServerEvent): void {
  for (const fn of listeners.get(userId) ?? []) {
    try {
      fn(e);
    } catch {
      /* a broken connection must not stop others */
    }
  }
}

// ---------- background runs ----------

const runs = new Map<string, { userId: string; run: Run; cancel?: () => void; apply?: () => Promise<void> }>();

export function startRun(userId: string, init: Omit<Run, "id" | "startedAt" | "error" | "proposal" | "done" | "state"> & Partial<Run>): Run {
  const run: Run = { id: newId("run"), startedAt: new Date().toISOString(), error: null, proposal: null, done: 0, state: "running", ...init };
  runs.set(run.id, { userId, run });
  emit(userId, { type: "run", run });
  return run;
}

export function updateRun(id: string, patch: Partial<Run>): Run | null {
  const entry = runs.get(id);
  if (!entry) return null;
  entry.run = { ...entry.run, ...patch };
  emit(entry.userId, { type: "run", run: entry.run });
  return entry.run;
}

export function setRunHandlers(id: string, h: { cancel?: () => void; apply?: () => Promise<void> }): void {
  const entry = runs.get(id);
  if (entry) Object.assign(entry, h);
}

export function getRunEntry(id: string) {
  return runs.get(id) ?? null;
}

export function listRuns(userId: string): Run[] {
  const out: Run[] = [];
  const cutoff = Date.now() - 30 * 60_000;
  for (const [id, e] of runs) {
    if (e.userId !== userId) continue;
    const finished = e.run.state === "done" || e.run.state === "applied" || e.run.state === "cancelled" || e.run.state === "failed";
    if (finished && Date.parse(e.run.startedAt) < cutoff) {
      runs.delete(id);
      continue;
    }
    out.push(e.run);
  }
  return out.sort((a, b) => b.startedAt.localeCompare(a.startedAt));
}
