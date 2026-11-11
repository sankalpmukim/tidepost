// Server events pushed to browsers over SSE, and the run records the UI
// watches. Lives in plain modules so the Worker, the Hub Durable Object and
// the Mailbox engine all share one definition.
import type { QueuedSend, Run, SyncState } from "../shared/types";

export type ServerEvent =
  | { type: "threads"; accountId: string; threadIds: string[] }
  | { type: "sync"; accountId: string; sync: SyncState }
  | { type: "run"; run: Run }
  | { type: "send"; send: QueuedSend }
  | { type: "folders"; accountId: string }
  | { type: "auth"; accountId: string; message: string };
