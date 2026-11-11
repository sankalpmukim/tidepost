// Typed client for the Tidepost API.
import type {
  Account, AppConfig, Contact, DraftProposal, Folder, LaneCounts, Message, OutgoingMessage, Plan, QueuedSend, Run,
  Settings, SweepKind, Thread, ThreadAction, ThreadBrief, ThreadPage, ThreadSummary, UnsubscribeResult,
} from "../shared/types";

export class ApiError extends Error {
  status: number;
  code: string | null;
  constructor(status: number, message: string, code: string | null) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: { ...(body !== undefined ? { "Content-Type": "application/json" } : {}), "X-Tidepost": "1" },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    credentials: "same-origin",
  });
  const text = await res.text();
  const data = text ? (JSON.parse(text) as unknown) : null;
  if (!res.ok) {
    const err = (data ?? {}) as { error?: string; code?: string };
    throw new ApiError(res.status, err.error ?? `Request failed (${res.status})`, err.code ?? null);
  }
  return data as T;
}

const get = <T>(p: string) => request<T>("GET", p);
const post = <T>(p: string, b: unknown = {}) => request<T>("POST", p, b);
const enc = encodeURIComponent;

export const api = {
  config: () => get<AppConfig>("/config"),
  me: () => get<{ accounts: Account[]; settings: Settings }>("/me"),
  demo: () => post<{ accountId: string }>("/auth/demo"),
  logout: () => post<{ ok: true }>("/auth/logout"),
  saveSettings: (s: Partial<Settings>) => request<Settings>("PUT", "/settings", s),
  removeAccount: (aid: string) => request<{ ok: true }>("DELETE", `/accounts/${aid}`),
  sync: (aid: string) => post<{ ok: true }>(`/accounts/${aid}/sync`),

  folders: (aid: string) => get<Folder[]>(`/accounts/${aid}/folders`),
  counts: (aid: string) => get<LaneCounts>(`/accounts/${aid}/counts`),
  threads: (aid: string, view: string, cursor: string | null) => get<ThreadPage>(`/accounts/${aid}/threads?view=${enc(view)}&limit=200${cursor ? `&cursor=${cursor}` : ""}`),
  thread: (aid: string, tid: string, refresh = true) => get<Thread>(`/accounts/${aid}/threads/${enc(tid)}${refresh ? "" : "?refresh=0"}`),
  messages: (aid: string, ids: string[]) => post<Message[]>(`/accounts/${aid}/messages`, { ids }),
  action: (aid: string, threadIds: string[], action: ThreadAction) => post<{ threads?: ThreadSummary[]; run?: Run }>(`/accounts/${aid}/actions`, { threadIds, action }),
  search: (aid: string, q: string, local = false) => get<ThreadPage>(`/accounts/${aid}/search?q=${enc(q)}${local ? "&local=1" : ""}`),
  contacts: (aid: string, q: string) => get<Contact[]>(`/accounts/${aid}/contacts?q=${enc(q)}`),
  send: (aid: string, msg: OutgoingMessage) => post<QueuedSend>(`/accounts/${aid}/send`, msg),
  sends: () => get<QueuedSend[]>("/sends"),
  cancelSend: (aid: string, sid: string) => post<{ ok: boolean; message: OutgoingMessage }>(`/accounts/${aid}/sends/${sid}/cancel`),
  retrySend: (aid: string, sid: string) => post<QueuedSend>(`/accounts/${aid}/sends/${sid}/retry`),
  unsubscribe: (aid: string, tid: string) => post<UnsubscribeResult>(`/accounts/${aid}/threads/${enc(tid)}/unsubscribe`),

  brief: (aid: string, tid: string, auto = false) => get<ThreadBrief | null>(`/accounts/${aid}/threads/${enc(tid)}/brief${auto ? "?auto=1" : ""}`),
  makeBrief: (aid: string, tid: string) => post<ThreadBrief>(`/accounts/${aid}/threads/${enc(tid)}/brief`),
  draft: (aid: string, tid: string | null, body: { notes: string; mode: string; recipients: string[]; subject: string }) =>
    post<DraftProposal>(tid ? `/accounts/${aid}/threads/${enc(tid)}/draft` : `/accounts/${aid}/draft`, body),
  plan: (aid: string, tid: string, instruction = "") => post<Plan>(`/accounts/${aid}/threads/${enc(tid)}/plan`, { instruction }),
  runStep: (aid: string, tid: string, kind: string, params: Record<string, string>) => post<{ result: string; url?: string | null }>(`/accounts/${aid}/threads/${enc(tid)}/plan/run`, { kind, params }),

  runs: () => get<Run[]>("/runs"),
  sweep: (aid: string, kind: SweepKind) => post<Run>(`/accounts/${aid}/sweeps`, { kind }),
  runOp: (rid: string, op: "apply" | "dismiss" | "cancel") => post<{ ok: true }>(`/runs/${rid}/${op}`),

  attachmentUrl: (aid: string, mid: string, attId: string, inline = false) => `/api/accounts/${aid}/messages/${enc(mid)}/attachments/${enc(attId)}${inline ? "?inline=1" : ""}`,
};
