// The per-account Mailbox Durable Object. Owns the mail index in its SQLite
// storage, runs the sync engine, the undo-send queue, the snooze/reminder
// scheduler and bulk/sweep runs — all multiplexed onto a single alarm.
// Durable Objects can be evicted between requests; `ready()` rehydrates the
// engine from the D1 account row before any method runs.
import { DurableObject } from "cloudflare:workers";
import type {
  AccountPersistRow,
  AuthPersist,
  MailboxPersist,
} from "../persist";
import type { Env } from "../config";
import { initConfig } from "../config";
import type { ServerEvent } from "../bus";
import { MailboxEngine } from "./engine";
import { createSqliteMailbox } from "./sqlite";
import { createD1AuthStore } from "../authstore";
import { guard, type RpcResult } from "./rpc";
import type {
  Contact, Folder, LaneCounts, Message, OutgoingMessage, QueuedSend, Run, SweepKind, Thread,
  ThreadAction, ThreadPage, ThreadSummary, UnsubscribeResult,
} from "../../shared/types";

export class MailboxDO extends DurableObject<Env> {
  private auth: AuthPersist;
  private persist: MailboxPersist;
  private engine: MailboxEngine;

  constructor(state: DurableObjectState, env: Env) {
    super(state, env);
    const cfg = initConfig(env);
    this.auth = createD1AuthStore(env.DB!);
    this.persist = createSqliteMailbox(state.storage.sql);
    const accountId = state.id.name ?? "";
    this.engine = new MailboxEngine({
      accountId,
      persist: this.persist,
      auth: this.auth,
      config: cfg,
      emit: (e) => this.forward(e),
      host: {
        schedule: (whenMs) => void this.schedule(whenMs),
      },
    });
  }

  /** Rehydrate after eviction: pull the account row so the engine can run. */
  private async ready(): Promise<void> {
    if (this.engine.account !== null) return;
    const row = await this.auth.getAccount(this.engine.accountId);
    if (row) await this.engine.ensureAccount(row);
  }

  /** Forward an event to the user's hub (fire and forget). */
  private forward(e: ServerEvent): void {
    const userId = this.engine.account?.user_id;
    const ns = this.env.HUB;
    if (!userId || !ns) return;
    try {
      const stub = ns.get(ns.idFromName(userId)) as unknown as { emit(e: ServerEvent): Promise<void> };
      void stub.emit(e).catch(() => {});
    } catch {
      /* the hub wakes on demand; a lost event is no worse than before */
    }
  }

  private async schedule(whenMs: number): Promise<void> {
    const current = await this.ctx.storage.getAlarm();
    if (current === null || whenMs < current) {
      await this.ctx.storage.setAlarm(whenMs);
    }
  }

  async alarm(): Promise<void> {
    if (this.engine.account === null) await this.ready();
    await this.engine.tick();
    await this.schedule(await this.engine.nextWake());
  }

  /** Run a method against a hydrated engine, with the RPC error envelope. */
  private call<T>(fn: (e: MailboxEngine) => Promise<T>): Promise<RpcResult<T>> {
    return guard(async () => {
      await this.ready();
      return fn(this.engine);
    });
  }

  // ---------- lifecycle ----------

  async ensure(account: AccountPersistRow): Promise<RpcResult<null>> {
    return guard(async () => {
      await this.engine.ensureAccount(account);
      return null;
    });
  }

  async destroy(): Promise<RpcResult<null>> {
    return guard(async () => {
      await this.engine.destroy();
      return null;
    });
  }

  async syncNow(): Promise<RpcResult<null>> {
    return this.call(async (e) => {
      await e.syncNow();
      return null;
    });
  }

  // ---------- reads ----------

  async counts(): Promise<RpcResult<LaneCounts>> {
    return this.call((e) => e.laneCounts());
  }

  async threadsList(view: string, offset: number, limit: number): Promise<RpcResult<ThreadPage>> {
    return this.call((e) => e.listThreads(view, offset, limit));
  }

  async getThread(threadId: string, refresh: boolean): Promise<RpcResult<Thread | null>> {
    return this.call((e) => e.getThread(threadId, { refresh }));
  }

  async getMessages(ids: string[]): Promise<RpcResult<Message[]>> {
    return this.call((e) => e.getMessages(ids));
  }

  async summary(threadId: string): Promise<RpcResult<ThreadSummary | null>> {
    return this.call((e) => e.summary(threadId));
  }

  async search(q: string): Promise<RpcResult<ThreadSummary[]>> {
    return this.call((e) => e.search(q));
  }

  async localSearch(q: string): Promise<RpcResult<ThreadSummary[]>> {
    return this.call((e) => e.localSearch(q, 60));
  }

  async contacts(q: string): Promise<RpcResult<Contact[]>> {
    return this.call((e) => e.contacts(q));
  }

  async folders(): Promise<RpcResult<Folder[]>> {
    return this.call((e) => e.folders());
  }

  async threadForAssistant(threadId: string): Promise<RpcResult<Message[]>> {
    return this.call((e) => e.threadForAssistant(threadId));
  }

  async getBriefCache(threadId: string): Promise<RpcResult<string | null>> {
    return this.call(async (e) => e.getBriefCache(threadId));
  }

  async setBriefCache(threadId: string, brief: string): Promise<RpcResult<null>> {
    return this.call(async (e) => {
      await e.setBriefCache(threadId, brief);
      return null;
    });
  }

  // ---------- actions ----------

  async action(threadIds: string[], action: ThreadAction): Promise<RpcResult<{ threads: ThreadSummary[] }>> {
    return this.call(async (e) => {
      await e.applyAction(threadIds, action);
      return { threads: await e.summaries(threadIds) };
    });
  }

  async bulk(threadIds: string[], action: ThreadAction, label: string): Promise<RpcResult<Run>> {
    return this.call(async (e) => e.bulkAction(threadIds, action, label));
  }

  async runPlanStep(threadId: string, kind: string, params: Record<string, string>): Promise<RpcResult<{ result: string; url: string | null }>> {
    return this.call((e) => e.runPlanStep(threadId, kind, params));
  }

  async unsubscribe(threadId: string): Promise<RpcResult<UnsubscribeResult>> {
    return this.call((e) => e.unsubscribe(threadId));
  }

  // ---------- send queue ----------

  async enqueueSend(msg: OutgoingMessage, delaySeconds: number): Promise<RpcResult<QueuedSend>> {
    return this.call((e) => e.enqueueSend(msg, delaySeconds));
  }

  async cancelSend(id: string): Promise<RpcResult<{ ok: boolean; message: OutgoingMessage | null }>> {
    return this.call((e) => e.cancelSend(id));
  }

  async retrySend(id: string): Promise<RpcResult<QueuedSend | null>> {
    return this.call((e) => e.retrySend(id));
  }

  async sends(): Promise<RpcResult<QueuedSend[]>> {
    return this.call((e) => e.sends());
  }

  // ---------- runs ----------

  async sweep(kind: SweepKind): Promise<RpcResult<Run>> {
    return this.call((e) => e.startSweep(kind));
  }

  async runOp(runId: string, op: string): Promise<RpcResult<{ ok: true }>> {
    return this.call((e) => e.runOp(runId, op));
  }

  async listRuns(): Promise<RpcResult<Run[]>> {
    return this.call(async (e) => e.listRuns());
  }

  async getRun(runId: string): Promise<RpcResult<Run | null>> {
    return this.call(async (e) => e.getRun(runId));
  }
}
