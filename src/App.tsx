import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./api";
import { useActions, useLiveEvents, useMe, visibleIds, threadFromCache, liveSummaries } from "./hooks";
import { dismissToast, getUi, openComposer, setUi, toast, useUi, type ComposeRequest } from "./store";
import { SignIn } from "./components/SignIn";
import { Sidebar } from "./components/Sidebar";
import { ThreadList } from "./components/ThreadList";
import { Reader, unsubscribe } from "./components/Reader";
import { Rail } from "./components/Rail";
import { Composer } from "./components/Composer";
import { CommandPalette, Help, SettingsDialog, Toasts } from "./components/Overlays";
import type { OutgoingMessage, QueuedSend, ThreadSummary } from "../shared/types";
import type { InfiniteData } from "@tanstack/react-query";
import type { ThreadPage } from "../shared/types";

export default function App() {
  const me = useMe();
  if (me.isLoading) return <div style={{ height: "100vh", display: "grid", placeItems: "center" }}><span className="spinner" /></div>;
  if (!me.data?.accounts.length) return <SignIn />;
  return <Shell />;
}

function useTheme() {
  const settings = useMe().data?.settings;
  useEffect(() => {
    const root = document.documentElement;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => {
      const theme = settings?.theme ?? "system";
      root.dataset.theme = theme === "system" ? (mq.matches ? "dark" : "light") : theme;
      root.dataset.density = settings?.density ?? "comfortable";
    };
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [settings?.theme, settings?.density]);
}

function Shell() {
  const me = useMe().data!;
  const qc = useQueryClient();
  const accountId = useUi((s) => s.accountId);
  const openId = useUi((s) => s.openThreadId);
  const rail = useUi((s) => s.rail);
  const composers = useUi((s) => s.composers);
  const { perform, undo } = useActions();
  const sendToasts = useRef(new Map<string, { toastId: number; msg: OutgoingMessage; req: ComposeRequest }>());
  useTheme();
  useEffect(() => {
    void api.me();
    const t = window.setInterval(() => void api.me(), 45_000);
    return () => clearInterval(t);
  }, []);

  // Pick the account: ?account= after sign-in, else the first one.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const fromUrl = params.get("account");
    if (fromUrl || params.has("auth_error")) window.history.replaceState(null, "", "/");
    if (!accountId || !me.accounts.some((a) => a.id === accountId)) {
      setUi({ accountId: me.accounts.find((a) => a.id === fromUrl)?.id ?? me.accounts[0].id });
    }
  }, [accountId, me.accounts]);

  // Undo send: a countdown toast for every queued message.
  useEffect(() => {
    const onQueued = (e: Event) => {
      const { queued, msg, req } = (e as CustomEvent<{ queued: QueuedSend; msg: OutgoingMessage; req: ComposeRequest }>).detail;
      const ms = Date.parse(queued.sendAt) - Date.now();
      const toastId = toast({
        text: ms > 500 ? `Sending to ${queued.to.map((p) => p.name.split(" ")[0]).slice(0, 3).join(", ") || "recipients"}` : "Sending…",
        until: ms > 500 ? Date.parse(queued.sendAt) : undefined,
        sticky: true,
        action: ms > 500 ? {
          label: "Undo",
          run: () => void api.cancelSend(queued.accountId, queued.id).then((r) => {
            sendToasts.current.delete(queued.id);
            openComposer({ ...req, restore: r.message ?? msg });
            toast({ text: "Sending cancelled. Your draft is back." }, 3000);
          }).catch((err: unknown) => toast({ text: err instanceof ApiError ? err.message : "Too late to undo.", tone: "error" })),
        } : undefined,
      });
      sendToasts.current.set(queued.id, { toastId, msg, req });
    };
    window.addEventListener("tp:queued", onQueued);
    return () => window.removeEventListener("tp:queued", onQueued);
  }, []);

  useLiveEvents((s) => {
    const entry = sendToasts.current.get(s.id);
    if (s.status === "sent") {
      if (entry) dismissToast(entry.toastId);
      sendToasts.current.delete(s.id);
      toast({ text: `Sent “${s.subject || "(no subject)"}”` }, 3000);
    } else if (s.status === "failed") {
      if (entry) dismissToast(entry.toastId);
      toast({
        text: `Couldn't send “${s.subject}”: ${s.error ?? "unknown error"}`,
        tone: "error",
        sticky: true,
        action: { label: "Retry", run: () => void api.retrySend(s.accountId, s.id) },
      });
    } else if (s.status === "cancelled" && entry) {
      dismissToast(entry.toastId);
    }
  });

  // Switching reply / reply all / forward inside the composer.
  useEffect(() => {
    const h = (e: Event) => {
      const { key, mode } = (e as CustomEvent<{ key: string; mode: ComposeRequest["mode"] }>).detail;
      const c = getUi().composers.find((x) => x.key === key);
      if (c) openComposer({ ...c, mode, restore: undefined });
    };
    window.addEventListener("tp:compose-mode", h);
    return () => window.removeEventListener("tp:compose-mode", h);
  }, []);

  useKeyboard(perform, undo);

  const settings = me.settings;
  const docked = composers.filter((c) => c.mode === "new" || c.threadId !== openId);
  return (
    <div className="shell" data-rail={rail && openId ? "open" : "closed"} data-pane={settings.readingPane} data-open={openId ? "1" : "0"}>
      <Sidebar />
      <ThreadList />
      <Reader />
      <Rail />
      {docked.map((c, i) => (
        <div key={c.key} style={{ position: "fixed", right: 24 + i * 24, bottom: 0, zIndex: 40 + i }}>
          <Composer req={c} thread={c.threadId && accountId ? threadFromCache(qc, accountId, c.threadId) : undefined} />
        </div>
      ))}
      <CommandPalette />
      <Help />
      <SettingsDialog />
      <Toasts />
    </div>
  );
}

function summaryFor(qc: ReturnType<typeof useQueryClient>, id: string): ThreadSummary | null {
  const live = liveSummaries().find((x) => x.id === id);
  if (live) return live;
  for (const [, data] of qc.getQueriesData<InfiniteData<ThreadPage>>({ queryKey: ["search"] })) {
    const t = data?.pages.flatMap((p) => p.threads).find((x) => x.id === id);
    if (t) return t;
  }
  return null;
}

function useKeyboard(perform: ReturnType<typeof useActions>["perform"], undo: () => void) {
  const qc = useQueryClient();
  const seq = useRef<{ key: string; at: number } | null>(null);
  const me = useMe().data;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const ui = getUi();
      const target = e.target as HTMLElement;
      const typing = target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable;
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setUi({ palette: !ui.palette });
        return;
      }
      if (typing || ui.palette || ui.help || ui.settings) return;
      const aid = ui.accountId;
      if (!aid) return;
      const order = visibleIds(qc);
      const current = ui.openThreadId ?? ui.focusedThreadId;
      const targets = ui.checked.size ? [...ui.checked] : current ? [current] : [];
      const fullPane = me?.settings.readingPane === "full";

      // Two-key sequences: g x, * x
      const prev = seq.current;
      seq.current = null;
      if (prev && Date.now() - prev.at < 1200) {
        if (prev.key === "g") {
          const map: Record<string, string> = { i: "inbox", n: "needs", w: "waiting", s: "starred", t: "sent", b: "snoozed", a: "all", e: "archive", u: "updates", f: "fyi" };
          if (map[e.key]) {
            e.preventDefault();
            setUi({ view: map[e.key], openThreadId: null, focusedThreadId: null, checked: new Set() });
            return;
          }
        }
        if (prev.key === "*") {
          e.preventDefault();
          if (e.key === "a") setUi({ checked: new Set(order) });
          if (e.key === "n") setUi({ checked: new Set() });
          if (e.key === "u" || e.key === "r") {
            const wantUnread = e.key === "u";
            setUi({ checked: new Set(order.filter((id) => { const t = summaryFor(qc, id); return t ? (t.unreadCount > 0) === wantUnread : false; })) });
          }
          return;
        }
      }
      if (mod) {
        if (e.key.toLowerCase() === "u" && current) {
          e.preventDefault();
          void unsubscribe(aid, current, perform);
        } else if (e.key.toLowerCase() === "z") {
          e.preventDefault();
          undo();
        }
        return;
      }
      if (e.altKey) return;

      const move = (delta: number, extend: boolean) => {
        if (!order.length) return;
        // The keyboard cursor: the focused row (it moves ahead of the open thread while extending a selection).
        const cursor = ui.focusedThreadId ?? ui.openThreadId;
        const idx = cursor ? order.indexOf(cursor) : -1;
        const next = order[Math.max(0, Math.min(order.length - 1, idx < 0 ? 0 : idx + delta))];
        if (extend) {
          setUi((s) => {
            const c = new Set(s.checked);
            if (cursor) c.add(cursor);
            c.add(next);
            return { checked: c, focusedThreadId: next };
          });
          return;
        }
        if (!fullPane) setUi({ openThreadId: next, focusedThreadId: next });
        else setUi({ focusedThreadId: next });
      };

      const replyTo = (mode: "reply" | "replyAll" | "forward") => {
        if (!current) return;
        e.preventDefault();
        setUi({ openThreadId: current, focusedThreadId: current });
        const go = (attempt = 0) => {
          const thread = threadFromCache(qc, aid, current);
          if (!thread) {
            if (attempt < 40) window.setTimeout(() => go(attempt + 1), 100);
            return;
          }
          const last = [...thread.messages].reverse().find((m) => !m.fromMe) ?? thread.messages[thread.messages.length - 1];
          openComposer({ mode, accountId: aid, threadId: current, messageId: last.id });
        };
        go();
      };

      const s = current ? summaryFor(qc, current) : null;
      switch (e.key) {
        case "j": case "ArrowDown": e.preventDefault(); move(1, false); break;
        case "k": case "ArrowUp": e.preventDefault(); move(-1, false); break;
        case "J": e.preventDefault(); move(1, true); break;
        case "K": e.preventDefault(); move(-1, true); break;
        case "Enter": if (ui.focusedThreadId) { e.preventDefault(); setUi({ openThreadId: ui.focusedThreadId }); } break;
        case "o": if (!ui.openThreadId && ui.focusedThreadId) { e.preventDefault(); setUi({ openThreadId: ui.focusedThreadId }); } break;
        case "u": if (ui.openThreadId) { e.preventDefault(); setUi({ openThreadId: null }); } break;
        case "Escape":
          if (ui.checked.size) setUi({ checked: new Set() });
          else if (ui.openThreadId) setUi({ openThreadId: null });
          break;
        case "x": if (current) { e.preventDefault(); setUi((st) => { const c = new Set(st.checked); if (c.has(current)) c.delete(current); else c.add(current); return { checked: c, focusedThreadId: current }; }); } break;
        case "e": case "y": if (targets.length) { e.preventDefault(); void perform(targets, s && !s.inInbox && targets.length === 1 && ui.view !== "waiting" ? { type: "inbox" } : { type: "archive" }); } break;
        case "#": case "Delete": if (targets.length) { e.preventDefault(); void perform(targets, { type: "trash" }); } break;
        case "!": if (targets.length) { e.preventDefault(); void perform(targets, { type: "spam" }); } break;
        case "s": if (targets.length) { e.preventDefault(); void perform(targets, s?.starred ? { type: "unstar" } : { type: "star" }); } break;
        case "I": if (targets.length) { e.preventDefault(); void perform(targets, { type: "read" }); } break;
        case "U": if (targets.length) { e.preventDefault(); void perform(targets, { type: "unread" }); } break;
        case "P": if (targets.length) { e.preventDefault(); void perform(targets, s?.pinned ? { type: "unpin" } : { type: "pin" }); } break;
        case "h": case "b": if (targets.length) { e.preventDefault(); setUi({ palette: true, paletteQuery: "snooze" }); } break;
        case "H": if (targets.length) { e.preventDefault(); setUi({ palette: true, paletteQuery: "follow up" }); } break;
        case "l": case "v": if (targets.length) { e.preventDefault(); setUi({ palette: true, paletteQuery: me?.accounts.find((a) => a.id === aid)?.provider === "outlook" ? "move to" : "label" }); } break;
        case "c": e.preventDefault(); openComposer({ mode: "new", accountId: aid, threadId: null, messageId: null }); break;
        case "r": replyTo("reply"); break;
        case "a": replyTo("replyAll"); break;
        case "f": replyTo("forward"); break;
        case "/": e.preventDefault(); window.dispatchEvent(new Event("tp:focus-search")); break;
        case "?": e.preventDefault(); setUi({ help: true }); break;
        case ",": e.preventDefault(); setUi({ settings: true }); break;
        case "]": e.preventDefault(); setUi({ rail: !ui.rail }); break;
        case "i": if (ui.openThreadId) { e.preventDefault(); setUi({ rail: true }); window.setTimeout(() => window.dispatchEvent(new Event("tp:brief")), 30); } break;
        case "z": e.preventDefault(); undo(); break;
        case "g": case "*": seq.current = { key: e.key, at: Date.now() }; break;
        case "1": case "2": case "3": case "4": case "5": {
          e.preventDefault();
          const v = ["needs", "waiting", "fyi", "updates", "inbox"][Number(e.key) - 1];
          setUi({ view: v, openThreadId: null, focusedThreadId: null, checked: new Set() });
          break;
        }
        default: break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [qc, perform, undo, me]);
}
