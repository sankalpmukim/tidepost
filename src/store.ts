// Small UI store (no dependency): useSyncExternalStore over a plain object.
import { useSyncExternalStore } from "react";
import type { OutgoingMessage, ThreadAction } from "../shared/types";

export type ComposeMode = "new" | "reply" | "replyAll" | "forward";

export interface ComposeRequest {
  key: string;
  mode: ComposeMode;
  accountId: string;
  threadId: string | null;
  /** Provider id of the message being replied to / forwarded. */
  messageId: string | null;
  /** Prefilled notes (from a plan step) to draft from. */
  notes?: string;
  autoDraft?: boolean;
  restore?: OutgoingMessage;
}

export interface Toast {
  id: number;
  text: string;
  tone?: "error";
  action?: { label: string; run: () => void };
  /** Countdown target (ms epoch) for undo-send toasts. */
  until?: number;
  sticky?: boolean;
}

export interface UndoEntry {
  label: string;
  accountId: string;
  threadIds: string[];
  inverse: ThreadAction;
}

export interface UiState {
  accountId: string | null;
  view: string; // needs | waiting | fyi | updates | inbox | snoozed | starred | sent | all | folder:<id> | search
  search: string;
  openThreadId: string | null;
  focusedThreadId: string | null;
  checked: Set<string>;
  composers: ComposeRequest[];
  palette: boolean;
  paletteQuery: string;
  help: boolean;
  settings: boolean;
  rail: boolean;
  toasts: Toast[];
  undo: UndoEntry | null;
  /** Reader filters for long threads. */
  filterPeople: string[];
  onlyMine: boolean;
  /** Message ids currently on screen in the reader (drives the thread chart). */
  visibleMsgs: string[];
  /** Messages the assistant says contain asks for you. */
  askMsgs: string[];
  authTick: number;
}

let state: UiState = {
  accountId: null,
  view: "needs",
  search: "",
  openThreadId: null,
  focusedThreadId: null,
  checked: new Set(),
  composers: [],
  palette: false,
  paletteQuery: "",
  help: false,
  settings: false,
  rail: readRail(),
  toasts: [],
  undo: null,
  filterPeople: [],
  onlyMine: false,
  visibleMsgs: [],
  askMsgs: [],
  authTick: 0,
};

function readRail(): boolean {
  try {
    return localStorage.getItem("tp.rail") !== "0";
  } catch {
    return true;
  }
}

const listeners = new Set<() => void>();

export function getUi(): UiState {
  return state;
}

export function setUi(patch: Partial<UiState> | ((s: UiState) => Partial<UiState>)): void {
  const p = typeof patch === "function" ? patch(state) : patch;
  state = { ...state, ...p };
  if ("rail" in p) {
    try {
      localStorage.setItem("tp.rail", state.rail ? "1" : "0");
    } catch {
      /* storage unavailable */
    }
  }
  for (const l of listeners) l();
}

export function useUi<T>(select: (s: UiState) => T): T {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => select(state),
  );
}

let toastId = 0;
export function toast(t: Omit<Toast, "id">, ms = 5000): number {
  const id = ++toastId;
  // Keep at most two on screen; sticky ones (sending, errors) survive.
  setUi((s) => ({ toasts: [...s.toasts.filter((x) => x.sticky).slice(-1), ...s.toasts.filter((x) => !x.sticky).slice(-1), { ...t, id }].slice(-3) }));
  if (!t.sticky) setTimeout(() => dismissToast(id), ms);
  return id;
}

export function dismissToast(id: number): void {
  setUi((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }));
}

export function openComposer(req: Omit<ComposeRequest, "key">): void {
  const key = `${req.mode}:${req.threadId ?? "new"}:${Date.now()}`;
  setUi((s) => {
    // One inline composer per thread; replace it when switching reply mode.
    const others = s.composers.filter((c) => !(req.threadId && c.threadId === req.threadId) && !(req.mode === "new" && c.mode === "new" && !c.restore));
    return { composers: [...others, { ...req, key }] };
  });
}

export function closeComposer(key: string): void {
  setUi((s) => ({ composers: s.composers.filter((c) => c.key !== key) }));
}

/** Ask the reader to reveal, expand and scroll to a message. */
export function jumpToMessage(id: string): void {
  window.dispatchEvent(new CustomEvent("tp:jump", { detail: id }));
}
