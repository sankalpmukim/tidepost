// Mailbox + hub client adapters. The HTTP layer only ever sees these
// interfaces: DoMailboxClient/DoHubClient cross the Durable Object RPC
// boundary in production; LocalMailboxClient/LocalHubClient run engines
// in-process for tests. Both use the same RpcResult envelope, so error
// behaviour is identical.
import type { AccountPersistRow, AuthPersist, MailboxPersist } from "../persist";
import type { Config } from "../config";
import type { ServerEvent } from "../bus";
import type { MailboxDO } from "./do";
import type { HubDO } from "../hub";
import { HubCore } from "../hubcore";
import { MailboxEngine } from "./engine";
import { guard, unwrap, type RpcResult } from "./rpc";
import type {
  Contact, Folder, LaneCounts, Message, OutgoingMessage, QueuedSend, Run, SweepKind, Thread,
  ThreadAction, ThreadPage, ThreadSummary, UnsubscribeResult,
} from "../../shared/types";

/** The mailbox surface the HTTP API talks to (mirrors MailboxDO's RPC). */
export interface MailboxClient {
  ensure(account: AccountPersistRow): Promise<null>;
  destroy(): Promise<null>;
  syncNow(): Promise<null>;
  counts(): Promise<LaneCounts>;
  threadsList(view: string, offset: number, limit: number): Promise<ThreadPage>;
  getThread(threadId: string, refresh: boolean): Promise<Thread | null>;
  getMessages(ids: string[]): Promise<Message[]>;
  summary(threadId: string): Promise<ThreadSummary | null>;
  search(q: string): Promise<ThreadSummary[]>;
  localSearch(q: string): Promise<ThreadSummary[]>;
  contacts(q: string): Promise<Contact[]>;
  folders(): Promise<Folder[]>;
  threadForAssistant(threadId: string): Promise<Message[]>;
  getBriefCache(threadId: string): Promise<string | null>;
  setBriefCache(threadId: string, brief: string): Promise<null>;
  action(threadIds: string[], action: ThreadAction): Promise<{ threads: ThreadSummary[] }>;
  bulk(threadIds: string[], action: ThreadAction, label: string): Promise<Run>;
  runPlanStep(threadId: string, kind: string, params: Record<string, string>): Promise<{ result: string; url: string | null }>;
  unsubscribe(threadId: string): Promise<UnsubscribeResult>;
  enqueueSend(msg: OutgoingMessage, delaySeconds: number): Promise<QueuedSend>;
  cancelSend(id: string): Promise<{ ok: boolean; message: OutgoingMessage | null }>;
  retrySend(id: string): Promise<QueuedSend | null>;
  sends(): Promise<QueuedSend[]>;
  sweep(kind: SweepKind): Promise<Run>;
  runOp(runId: string, op: string): Promise<{ ok: true }>;
  listRuns(): Promise<Run[]>;
  getRun(runId: string): Promise<Run | null>;
}

/** The hub surface the HTTP API talks to. */
export interface HubClient {
  emit(e: ServerEvent): Promise<void>;
  listRuns(): Promise<Run[]>;
  getRun(id: string): Promise<Run | null>;
  /** Returns the SSE stream for one browser connection. */
  sse(): Promise<Response>;
}

type MailboxStub = DurableObjectStub<MailboxDO>;

export class DoMailboxClient implements MailboxClient {
  constructor(private stub: MailboxStub) {}

  private call<T>(r: Promise<RpcResult<T>>): Promise<T> {
    return r.then(unwrap);
  }

  ensure(account: AccountPersistRow) {
    return this.call(this.stub.ensure(account)).then(() => null);
  }

  destroy() {
    return this.call(this.stub.destroy()).then(() => null);
  }

  syncNow() {
    return this.call(this.stub.syncNow()).then(() => null);
  }

  counts() {
    return this.call(this.stub.counts());
  }

  threadsList(view: string, offset: number, limit: number) {
    return this.call(this.stub.threadsList(view, offset, limit));
  }

  getThread(threadId: string, refresh: boolean) {
    return this.call(this.stub.getThread(threadId, refresh));
  }

  getMessages(ids: string[]) {
    return this.call(this.stub.getMessages(ids));
  }

  summary(threadId: string) {
    return this.call(this.stub.summary(threadId));
  }

  search(q: string) {
    return this.call(this.stub.search(q));
  }

  localSearch(q: string) {
    return this.call(this.stub.localSearch(q));
  }

  contacts(q: string) {
    return this.call(this.stub.contacts(q));
  }

  folders() {
    return this.call(this.stub.folders());
  }

  threadForAssistant(threadId: string) {
    return this.call(this.stub.threadForAssistant(threadId));
  }

  getBriefCache(threadId: string) {
    return this.call(this.stub.getBriefCache(threadId));
  }

  setBriefCache(threadId: string, brief: string) {
    return this.call(this.stub.setBriefCache(threadId, brief)).then(() => null);
  }

  action(threadIds: string[], action: ThreadAction) {
    return this.call(this.stub.action(threadIds, action));
  }

  bulk(threadIds: string[], action: ThreadAction, label: string) {
    return this.call(this.stub.bulk(threadIds, action, label));
  }

  runPlanStep(threadId: string, kind: string, params: Record<string, string>) {
    return this.call(this.stub.runPlanStep(threadId, kind, params));
  }

  unsubscribe(threadId: string) {
    return this.call(this.stub.unsubscribe(threadId));
  }

  enqueueSend(msg: OutgoingMessage, delaySeconds: number) {
    return this.call(this.stub.enqueueSend(msg, delaySeconds));
  }

  cancelSend(id: string) {
    return this.call(this.stub.cancelSend(id));
  }

  retrySend(id: string) {
    return this.call(this.stub.retrySend(id));
  }

  sends() {
    return this.call(this.stub.sends());
  }

  sweep(kind: SweepKind) {
    return this.call(this.stub.sweep(kind));
  }

  runOp(runId: string, op: string) {
    return this.call(this.stub.runOp(runId, op));
  }

  listRuns() {
    return this.call(this.stub.listRuns());
  }

  getRun(runId: string) {
    return this.call(this.stub.getRun(runId));
  }
}

/** In-process engine backing one mailbox (tests). Same envelope path. */
export class LocalMailboxClient implements MailboxClient {
  constructor(public engine: MailboxEngine) {}

  private run<T>(fn: () => Promise<T>): Promise<T> {
    return guard(fn).then(unwrap);
  }

  ensure(account: AccountPersistRow) {
    return this.run(() => this.engine.ensureAccount(account)).then(() => null);
  }

  destroy() {
    return this.run(() => this.engine.destroy()).then(() => null);
  }

  syncNow() {
    return this.run(() => this.engine.syncNow()).then(() => null);
  }

  counts() {
    return this.run(() => this.engine.laneCounts());
  }

  threadsList(view: string, offset: number, limit: number) {
    return this.run(() => this.engine.listThreads(view, offset, limit));
  }

  getThread(threadId: string, refresh: boolean) {
    return this.run(() => this.engine.getThread(threadId, { refresh }));
  }

  getMessages(ids: string[]) {
    return this.run(() => this.engine.getMessages(ids));
  }

  summary(threadId: string) {
    return this.run(() => this.engine.summary(threadId));
  }

  search(q: string) {
    return this.run(() => this.engine.search(q));
  }

  localSearch(q: string) {
    return this.run(() => this.engine.localSearch(q, 60));
  }

  contacts(q: string) {
    return this.run(() => this.engine.contacts(q));
  }

  folders() {
    return this.run(() => this.engine.folders());
  }

  threadForAssistant(threadId: string) {
    return this.run(() => this.engine.threadForAssistant(threadId));
  }

  getBriefCache(threadId: string) {
    return this.run(async () => this.engine.getBriefCache(threadId));
  }

  setBriefCache(threadId: string, brief: string) {
    return this.run(async () => {
      await this.engine.setBriefCache(threadId, brief);
      return null;
    });
  }

  action(threadIds: string[], action: ThreadAction) {
    return this.run(async () => {
      await this.engine.applyAction(threadIds, action);
      return { threads: await this.engine.summaries(threadIds) };
    });
  }

  bulk(threadIds: string[], action: ThreadAction, label: string) {
    return this.run(async () => this.engine.bulkAction(threadIds, action, label));
  }

  runPlanStep(threadId: string, kind: string, params: Record<string, string>) {
    return this.run(() => this.engine.runPlanStep(threadId, kind, params));
  }

  unsubscribe(threadId: string) {
    return this.run(() => this.engine.unsubscribe(threadId));
  }

  enqueueSend(msg: OutgoingMessage, delaySeconds: number) {
    return this.run(() => this.engine.enqueueSend(msg, delaySeconds));
  }

  cancelSend(id: string) {
    return this.run(() => this.engine.cancelSend(id));
  }

  retrySend(id: string) {
    return this.run(() => this.engine.retrySend(id));
  }

  sends() {
    return this.run(() => this.engine.sends());
  }

  sweep(kind: SweepKind) {
    return this.run(() => this.engine.startSweep(kind));
  }

  runOp(runId: string, op: string) {
    return this.run(() => this.engine.runOp(runId, op));
  }

  listRuns() {
    return this.run(async () => this.engine.listRuns());
  }

  getRun(runId: string) {
    return this.run(async () => this.engine.getRun(runId));
  }
}

type HubStub = DurableObjectStub<HubDO>;

/** The Env bindings hand out unparameterized stubs; these factories confine
 *  the one-time cast to the DO implementations. */
export function mailboxClient(stub: unknown): MailboxClient {
  return new DoMailboxClient(stub as never);
}

export function hubClient(stub: unknown): HubClient {
  return new DoHubClient(stub as never);
}

export class DoHubClient implements HubClient {
  constructor(private stub: HubStub) {}
  async emit(e: ServerEvent): Promise<void> {
    await this.stub.emit(e);
  }

  async listRuns(): Promise<Run[]> {
    return this.stub.listRuns();
  }

  async getRun(id: string): Promise<Run | null> {
    return this.stub.getRun(id);
  }

  async sse(): Promise<Response> {
    return this.stub.fetch("https://hub/sse");
  }
}

export class LocalHubClient implements HubClient {
  readonly core = new HubCore();

  async emit(e: ServerEvent): Promise<void> {
    this.core.emit(e);
  }

  async listRuns(): Promise<Run[]> {
    return this.core.listRuns();
  }

  async getRun(id: string): Promise<Run | null> {
    return this.core.getRun(id);
  }

  async sse(): Promise<Response> {
    return this.core.sse();
  }
}

/** Registry of in-process engines (tests): mirrors the DO namespace. */
export class LocalMailboxes {
  private engines = new Map<string, LocalMailboxClient>();

  constructor(
    private persistFor: (accountId: string) => MailboxPersist,
    private auth: AuthPersist,
    private config: Config,
    private hubFor: (userId: string) => HubClient,
  ) {}

  mailbox(accountId: string): LocalMailboxClient {
    let client = this.engines.get(accountId);
    if (!client) {
      const engine = new MailboxEngine({
        accountId,
        persist: this.persistFor(accountId),
        auth: this.auth,
        config: this.config,
        emit: (e) => {
          const userId = engine.account?.user_id;
          if (userId) void this.hubFor(userId).emit(e);
        },
        host: {
          // Tests drive time explicitly; a scheduled wake runs soon after.
          schedule: () => {
            setTimeout(() => void engine.tick().catch(() => {}), 10);
          },
        },
      });
      client = new LocalMailboxClient(engine);
      this.engines.set(accountId, client);
    }
    return client;
  }
}
