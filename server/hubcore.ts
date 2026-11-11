// Platform-free hub logic: SSE subscriber management plus the snapshot
// registry of background runs. Shared by the HubDO (production) and the
// in-process LocalHubClient (tests).
import type { Run } from "../shared/types";
import type { ServerEvent } from "./bus";

const SSE_HEADERS = {
  "content-type": "text/event-stream; charset=utf-8",
  "cache-control": "no-cache",
  connection: "keep-alive",
  "x-accel-buffering": "no",
};

export class HubCore {
  private subscribers = new Set<WritableStreamDefaultWriter<string>>();
  private snapshots = new Map<string, { run: Run; at: number }>();
  private pingTimer: ReturnType<typeof setInterval> | null = null;

  /** An SSE response for one browser connection. */
  sse(): Response {
    const { readable, writable } = new TransformStream<string>();
    const writer = writable.getWriter();
    this.subscribers.add(writer);
    this.startPing();
    void writer.write("event: hello\ndata: \n\n").catch(() => this.drop(writer));
    void writer.closed.then(() => this.drop(writer)).catch(() => this.drop(writer));
    return new Response(readable, { headers: SSE_HEADERS });
  }

  private startPing(): void {
    if (this.pingTimer) return;
    this.pingTimer = setInterval(() => {
      for (const w of [...this.subscribers]) {
        void w.write("event: ping\ndata: \n\n").catch(() => this.drop(w));
      }
      if (!this.subscribers.size) this.stopPing();
    }, 25_000);
  }

  private stopPing(): void {
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
  }

  private drop(writer: WritableStreamDefaultWriter<string>): void {
    this.subscribers.delete(writer);
    void writer.close().catch(() => {});
    if (!this.subscribers.size) this.stopPing();
  }

  emit(e: ServerEvent): void {
    if (e.type === "run") this.recordRun(e.run);
    const frame = `data: ${JSON.stringify(e)}\n\n`;
    for (const w of [...this.subscribers]) {
      void w.write(frame).catch(() => this.drop(w));
    }
  }

  private recordRun(run: Run): void {
    this.snapshots.set(run.id, { run, at: Date.now() });
    if (this.snapshots.size > 200) {
      const cutoff = Date.now() - 30 * 60_000;
      for (const [id, entry] of this.snapshots) {
        const finished = entry.run.state !== "running" && entry.run.state !== "review";
        if (finished && entry.at < cutoff) this.snapshots.delete(id);
      }
    }
  }

  getRun(id: string): Run | null {
    return this.snapshots.get(id)?.run ?? null;
  }

  listRuns(): Run[] {
    const cutoff = Date.now() - 30 * 60_000;
    return [...this.snapshots.values()]
      .filter((e) => !e.run.startedAt || Date.parse(e.run.startedAt) >= cutoff || e.run.state === "running" || e.run.state === "review")
      .map((e) => e.run)
      .sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1));
  }
}
