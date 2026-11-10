import { useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, ChevronsUpDown, Clock, Inbox, LogOut, Mail, PenSquare, Plus, Send, Settings as SettingsIcon, Sparkles, Star, Tag, Trash2, Folder as FolderIcon, ShieldAlert, Check, X } from "lucide-react";
import { api } from "../api";
import { useAccount, useCounts, useFolders, useMe, useRuns } from "../hooks";
import { openComposer, setUi, toast, useUi } from "../store";
import { BrandMark, Menu, StatusGlyph, type MenuEntry } from "./bits";
import type { Run, SweepKind } from "../../shared/types";

export function Sidebar() {
  const account = useAccount();
  const me = useMe();
  const aid = account?.id ?? null;
  const counts = useCounts(aid).data;
  const folders = useFolders(aid).data ?? [];
  const view = useUi((s) => s.view);
  const [menu, setMenu] = useState<"account" | "sweep" | null>(null);
  const accountRef = useRef<HTMLButtonElement>(null);
  const sweepRef = useRef<HTMLButtonElement>(null);
  const qc = useQueryClient();

  const go = (v: string) => setUi({ view: v, openThreadId: null, focusedThreadId: null, checked: new Set(), search: "" });

  const nav = (v: string, label: string, icon: React.ReactNode, count?: number, strong?: boolean, hint?: string) => (
    <button className="nav-item" aria-current={view === v} onClick={() => go(v)} title={hint ? `${label} (${hint})` : label}>
      <span className="nav-icon">{icon}</span>
      <span className="label-text">{label}</span>
      {count ? <span className={`nav-count${strong ? " strong" : ""}`}>{count.toLocaleString()}</span> : null}
    </button>
  );

  const userLabels = folders.filter((f) => f.kind === "user");
  const sweep = async (kind: SweepKind) => {
    if (!aid) return;
    try {
      await api.sweep(aid, kind);
      void qc.invalidateQueries({ queryKey: ["runs"] });
    } catch (err) {
      toast({ text: err instanceof Error ? err.message : "Couldn't start the sweep.", tone: "error" });
    }
  };

  const accountItems: MenuEntry[] = [
    { heading: "Accounts" },
    ...(me.data?.accounts ?? []).map((a) => ({
      label: `${a.name} · ${a.provider === "gmail" ? "Gmail" : a.provider === "outlook" ? "Outlook" : "Demo"}`,
      hint: a.id === aid ? "current" : undefined,
      icon: a.id === aid ? <Check size={14} /> : <span style={{ width: 14 }} />,
      onSelect: () => setUi({ accountId: a.id, openThreadId: null, focusedThreadId: null, checked: new Set() }),
    })),
    "sep",
    { label: "Add a Gmail account", icon: <Plus size={14} />, onSelect: () => { window.location.href = "/api/auth/google/start"; } },
    { label: "Add an Outlook account", icon: <Plus size={14} />, onSelect: () => { window.location.href = "/api/auth/microsoft/start"; } },
    "sep",
    { label: "Settings", icon: <SettingsIcon size={14} />, hint: ",", onSelect: () => setUi({ settings: true }) },
    { label: "Sign out", icon: <LogOut size={14} />, onSelect: async () => { await api.logout(); window.location.href = "/"; } },
  ];

  const sweepItems: MenuEntry[] = [
    { heading: "Proposed first, applied after you review" },
    { label: "Archive updates older than 2 days", icon: <Archive size={14} />, onSelect: () => void sweep("updates-archive") },
    { label: "Mark all updates as read", icon: <Mail size={14} />, onSelect: () => void sweep("updates-read") },
    { label: "Archive read FYI older than a week", icon: <Archive size={14} />, onSelect: () => void sweep("fyi-archive") },
    { label: "Bring back threads with no reply in 3 days", icon: <Clock size={14} />, onSelect: () => void sweep("stale-waiting") },
  ];

  return (
    <nav className="sidebar" aria-label="Mailboxes">
      <div className="brand">
        <BrandMark />
        <span className="brand-name label-text">Tidepost</span>
      </div>
      <button className="btn btn-primary compose-btn" onClick={() => aid && openComposer({ mode: "new", accountId: aid, threadId: null, messageId: null })}>
        <PenSquare size={16} /> <span className="label-text">Compose</span> <kbd className="label-text">c</kbd>
      </button>

      <div className="side-section">
        <div className="side-section-title">Inbox</div>
        {nav("needs", "Needs you", <StatusGlyph lane="needs" />, counts?.needs, true, "1")}
        {nav("waiting", "Waiting", <StatusGlyph lane="waiting" />, counts?.waiting, false, "2")}
        {nav("fyi", "FYI", <StatusGlyph lane="fyi" />, counts?.fyi, false, "3")}
        {nav("updates", "Updates", <StatusGlyph lane="updates" />, counts?.updates, false, "4")}
        {nav("inbox", "Everything in inbox", <Inbox size={15} />, counts?.inboxUnread, false, "5")}
      </div>

      <div className="side-section">
        <div className="side-section-title">Mail</div>
        {nav("snoozed", "Snoozed", <Clock size={15} />, counts?.snoozed)}
        {nav("starred", "Starred", <Star size={15} />)}
        {nav("sent", "Sent", <Send size={15} />)}
        {nav("archive", "Archive", <Archive size={15} />)}
        {nav("all", "All mail", <Mail size={15} />)}
        {nav("spam", "Spam", <ShieldAlert size={15} />)}
        {nav("trash", "Trash", <Trash2 size={15} />)}
      </div>

      {userLabels.length ? (
        <div className="side-section">
          <div className="side-section-title">{account?.provider === "outlook" ? "Folders" : "Labels"}</div>
          {userLabels.slice(0, 40).map((f) => (
            <span key={f.id}>{nav(`folder:${f.id}`, f.name, account?.provider === "outlook" ? <FolderIcon size={15} /> : f.color ? <span className="label-dot" style={{ background: f.color }} /> : <Tag size={15} />, f.unread || undefined)}</span>
          ))}
        </div>
      ) : null}

      <div className="sidebar-foot">
        <Runs onSweepMenu={() => setMenu("sweep")} sweepRef={sweepRef} />
        <button ref={accountRef} className="account-switch" onClick={() => setMenu(menu === "account" ? null : "account")} aria-haspopup="menu">
          <span className="avatar avatar-sm" style={{ background: "var(--surface-selected)", color: "var(--accent-text)" }}>{(account?.name ?? "?").slice(0, 1)}</span>
          <span className="account-meta" style={{ flex: 1 }}>
            <span className="name">{account?.name}</span>
            <span className="email">{account?.email}</span>
          </span>
          <ChevronsUpDown size={14} className="label-text" />
        </button>
      </div>
      {menu === "account" ? <Menu anchor={accountRef.current} items={accountItems} onClose={() => setMenu(null)} /> : null}
      {menu === "sweep" ? <Menu anchor={sweepRef.current} items={sweepItems} onClose={() => setMenu(null)} /> : null}
    </nav>
  );
}

function Runs({ onSweepMenu, sweepRef }: { onSweepMenu: () => void; sweepRef: React.RefObject<HTMLButtonElement | null> }) {
  const runs = (useRuns().data ?? []).filter((r) => r.state !== "cancelled").slice(0, 4);
  const qc = useQueryClient();
  const op = async (r: Run, o: "apply" | "dismiss") => {
    await api.runOp(r.id, o);
    void qc.invalidateQueries({ queryKey: ["runs"] });
  };
  return (
    <div className="runs side-section">
      <div className="side-section-title">
        <span>Background</span>
        <button ref={sweepRef} className="btn btn-ghost btn-sm" onClick={onSweepMenu} title="Bulk clean-up, reviewed before it runs">
          <Sparkles size={12} /> Clean up
        </button>
      </div>
      {runs.map((r) => (
        <div className="run-card" key={r.id} data-state={r.state}>
          <div className="run-title">
            {r.state === "running" ? <span className="spinner" /> : r.state === "review" ? <StatusGlyph lane="needs" title="Waiting for your review" /> : r.state === "failed" ? <X size={14} color="var(--danger-fg)" /> : <StatusGlyph lane="done" />}
            <span style={{ flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.title}</span>
            {r.state !== "running" && r.state !== "review" ? (
              <button className="icon-btn icon-btn-sm" style={{ width: 20, height: 20 }} aria-label="Dismiss" onClick={() => void op(r, "dismiss")}><X size={12} /></button>
            ) : null}
          </div>
          {r.state === "running" && r.total > 0 ? <div className="progress"><div style={{ width: `${Math.min(100, Math.round((r.done / Math.max(1, r.total)) * 100))}%` }} /></div> : null}
          <div className="run-detail">{r.detail}</div>
          {r.state === "review" && r.proposal ? (
            <div style={{ display: "flex", gap: 4 }}>
              <button className="btn btn-primary btn-sm" onClick={() => void op(r, "apply")}>{r.proposal.summary}</button>
              <button className="btn btn-ghost btn-sm" onClick={() => void op(r, "dismiss")}>Dismiss</button>
            </div>
          ) : null}
        </div>
      ))}
    </div>
  );
}
