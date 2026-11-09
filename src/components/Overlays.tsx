import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Archive, BellRing, Clock, Inbox, ListChecks, Mail, MailOpen, Moon, PenSquare, Pin, Reply, ReplyAll, Search, Settings as SettingsIcon, Sparkles, Star, Sun, Trash2, User, Forward, Rows3 } from "lucide-react";
import { api } from "../api";
import { useAccount, useActions, useFolders, useLocalSearch, useMe } from "../hooks";
import { dismissToast, getUi, openComposer, setUi, toast, useUi } from "../store";
import { Dialog, StatusGlyph, remindOptions, snoozeOptions } from "./bits";
import { listDate } from "../lib/format";
import type { Settings } from "../../shared/types";

interface Cmd { id: string; label: string; group: string; hint?: string; icon?: React.ReactNode; run: () => void }

export function CommandPalette() {
  const open = useUi((s) => s.palette);
  if (!open) return null;
  return <PaletteInner />;
}

function PaletteInner() {
  const account = useAccount();
  const aid = account?.id ?? null;
  const me = useMe().data;
  const tid = useUi((s) => s.openThreadId ?? s.focusedThreadId);
  const checked = useUi((s) => s.checked);
  const folders = useFolders(aid).data ?? [];
  const { perform } = useActions();
  const qc = useQueryClient();
  const [q, setQ] = useState(() => getUi().paletteQuery);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const found = useLocalSearch(aid, q, q.trim().length > 1);
  const close = () => setUi({ palette: false, paletteQuery: "" });
  useEffect(() => inputRef.current?.focus(), []);

  const targets = checked.size ? [...checked] : tid ? [tid] : [];
  const cmds: Cmd[] = useMemo(() => {
    const list: Cmd[] = [];
    const act = (id: string, label: string, hint: string, icon: React.ReactNode, a: Parameters<typeof perform>[1]) => {
      if (targets.length) list.push({ id, label: targets.length > 1 ? `${label} (${targets.length} threads)` : label, group: "Thread", hint, icon, run: () => void perform(targets, a) });
    };
    act("archive", "Archive", "e", <Archive size={15} />, { type: "archive" });
    if (targets.length === 1 && aid && tid) {
      const reply = (mode: "reply" | "replyAll" | "forward") => () => {
        const thread = qc.getQueryData<{ messages: { id: string; fromMe: boolean }[] }>(["thread", aid, tid]);
        const last = thread ? [...thread.messages].reverse().find((m) => !m.fromMe) ?? thread.messages[thread.messages.length - 1] : null;
        setUi({ openThreadId: tid });
        if (last) openComposer({ mode, accountId: aid, threadId: tid, messageId: last.id });
      };
      list.push({ id: "reply", label: "Reply", group: "Thread", hint: "r", icon: <Reply size={15} />, run: reply("reply") });
      list.push({ id: "replyall", label: "Reply all", group: "Thread", hint: "a", icon: <ReplyAll size={15} />, run: reply("replyAll") });
      list.push({ id: "forward", label: "Forward", group: "Thread", hint: "f", icon: <Forward size={15} />, run: reply("forward") });
      list.push({ id: "brief", label: "Catch me up on this thread", group: "Assistant", hint: "i", icon: <Sparkles size={15} />, run: () => { setUi({ openThreadId: tid, rail: true }); setTimeout(() => window.dispatchEvent(new Event("tp:brief")), 50); } });
      list.push({ id: "plan", label: "Plan next steps for this thread", group: "Assistant", hint: "/", icon: <ListChecks size={15} />, run: () => { setUi({ openThreadId: tid, rail: true }); setTimeout(() => window.dispatchEvent(new Event("tp:plan")), 50); } });
    }
    for (const o of snoozeOptions()) act(`snooze-${o.label}`, `Snooze: ${o.label.toLowerCase()}`, o.hint, <Clock size={15} />, { type: "snooze", until: o.at.toISOString() });
    for (const o of remindOptions()) act(`remind-${o.label}`, `Follow up if no reply: ${o.label.toLowerCase()}`, o.hint, <BellRing size={15} />, { type: "remind", at: o.at.toISOString() });
    act("read", "Mark read", "⇧I", <MailOpen size={15} />, { type: "read" });
    act("unread", "Mark unread", "⇧U", <Mail size={15} />, { type: "unread" });
    act("star", "Star", "s", <Star size={15} />, { type: "star" });
    act("pin", "Pin to top", "⇧P", <Pin size={15} />, { type: "pin" });
    act("trash", "Move to trash", "#", <Trash2 size={15} />, { type: "trash" });
    act("inbox", "Move to inbox", "", <Inbox size={15} />, { type: "inbox" });
    for (const f of folders.filter((x) => x.kind === "user")) {
      act(`label-${f.id}`, account?.provider === "outlook" ? `Move to ${f.name}` : `Label: ${f.name}`, "", <span className="label-dot" />, account?.provider === "outlook" ? { type: "move", folderId: f.id } : { type: "label", folderId: f.id });
    }
    const go = (v: string, label: string, hint: string, icon: React.ReactNode) => list.push({ id: `go-${v}`, label: `Go to ${label}`, group: "Go to", hint, icon, run: () => setUi({ view: v, openThreadId: null, focusedThreadId: null, checked: new Set() }) });
    go("needs", "Needs you", "1", <StatusGlyph lane="needs" />);
    go("waiting", "Waiting", "2", <StatusGlyph lane="waiting" />);
    go("fyi", "FYI", "3", <StatusGlyph lane="fyi" />);
    go("updates", "Updates", "4", <StatusGlyph lane="updates" />);
    go("inbox", "Everything in inbox", "5", <Inbox size={15} />);
    go("snoozed", "Snoozed", "g b", <Clock size={15} />);
    go("starred", "Starred", "g s", <Star size={15} />);
    go("sent", "Sent", "g t", <Mail size={15} />);
    go("all", "All mail", "g a", <Mail size={15} />);
    for (const f of folders.filter((x) => x.kind === "user")) go(`folder:${f.id}`, f.name, "", <span className="label-dot" />);
    if (aid) {
      list.push({ id: "compose", label: "Compose a new message", group: "Mail", hint: "c", icon: <PenSquare size={15} />, run: () => openComposer({ mode: "new", accountId: aid, threadId: null, messageId: null }) });
      list.push({ id: "sweep-updates", label: "Clean up: archive updates older than 2 days", group: "Background", icon: <Sparkles size={15} />, run: () => void api.sweep(aid, "updates-archive") });
      list.push({ id: "sweep-read", label: "Clean up: mark all updates read", group: "Background", icon: <Sparkles size={15} />, run: () => void api.sweep(aid, "updates-read") });
      list.push({ id: "sweep-fyi", label: "Clean up: archive read FYI older than a week", group: "Background", icon: <Sparkles size={15} />, run: () => void api.sweep(aid, "fyi-archive") });
      list.push({ id: "sweep-wait", label: "Clean up: bring back threads with no reply in 3 days", group: "Background", icon: <Sparkles size={15} />, run: () => void api.sweep(aid, "stale-waiting") });
    }
    for (const a of me?.accounts ?? []) {
      if (a.id !== aid) list.push({ id: `acct-${a.id}`, label: `Switch to ${a.email}`, group: "Accounts", icon: <User size={15} />, run: () => setUi({ accountId: a.id, openThreadId: null, focusedThreadId: null }) });
    }
    list.push({ id: "settings", label: "Settings", group: "App", hint: ",", icon: <SettingsIcon size={15} />, run: () => setUi({ settings: true }) });
    list.push({ id: "help", label: "Keyboard shortcuts", group: "App", hint: "?", icon: <Rows3 size={15} />, run: () => setUi({ help: true }) });
    const s = me?.settings;
    if (s) {
      list.push({ id: "theme", label: `Switch to ${document.documentElement.dataset.theme === "dark" ? "light" : "dark"} theme`, group: "App", icon: document.documentElement.dataset.theme === "dark" ? <Sun size={15} /> : <Moon size={15} />, run: () => void saveSettings(qc, { theme: document.documentElement.dataset.theme === "dark" ? "light" : "dark" }) });
      list.push({ id: "density", label: `Use ${s.density === "compact" ? "comfortable" : "compact"} density`, group: "App", icon: <Rows3 size={15} />, run: () => void saveSettings(qc, { density: s.density === "compact" ? "comfortable" : "compact" }) });
    }
    return list;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets.join(","), folders, me, aid, tid]);

  const needle = q.trim().toLowerCase();
  const filtered = needle ? cmds.filter((c) => c.label.toLowerCase().includes(needle) || c.group.toLowerCase().includes(needle)) : cmds;
  const threadHits = (found.data?.threads ?? []).slice(0, 8).map<Cmd>((t) => ({
    id: `t-${t.id}`, label: t.subject, group: "Threads", hint: listDate(t.lastDate), icon: <StatusGlyph lane={t.lane} />,
    run: () => setUi({ openThreadId: t.id, focusedThreadId: t.id }),
  }));
  const searchCmd: Cmd[] = needle ? [{ id: "search", label: `Search all mail for “${q.trim()}”`, group: "Search", icon: <Search size={15} />, run: () => setUi({ view: "search", search: q.trim(), openThreadId: null }) }] : [];
  const all = [...filtered.slice(0, 40), ...threadHits, ...searchCmd];

  const pick = (c: Cmd) => {
    close();
    c.run();
  };

  return createPortal(
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && close()}>
      <div className="dialog" role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          className="palette-input"
          placeholder={targets.length ? "Type a command, a label, or search threads" : "Type a command or search threads"}
          value={q}
          onChange={(e) => { setQ(e.target.value); setActive(0); }}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setActive((a) => Math.min(all.length - 1, a + 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setActive((a) => Math.max(0, a - 1)); }
            else if (e.key === "Enter") { e.preventDefault(); const c = all[active]; if (c) pick(c); }
            else if (e.key === "Escape") { e.preventDefault(); close(); }
          }}
          aria-activedescendant={all[active] ? `pc-${all[active].id}` : undefined}
        />
        <div className="palette-list" role="listbox">
          {all.length === 0 ? <div className="palette-group">No matching commands</div> : null}
          {all.map((c, i) => (
            <div key={c.id}>
              {i === 0 || all[i - 1].group !== c.group ? <div className="palette-group">{c.group}</div> : null}
              <div id={`pc-${c.id}`} className="palette-item" role="option" aria-selected={i === active} onMouseEnter={() => setActive(i)} onClick={() => pick(c)}>
                <span className="pi-icon">{c.icon}</span>
                <span className="pi-label">{c.label}</span>
                {c.hint ? <span className="pi-hint">{c.hint}</span> : null}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>,
    document.body,
  );
}

export async function saveSettings(qc: ReturnType<typeof useQueryClient>, patch: Partial<Settings>) {
  try {
    const next = await api.saveSettings(patch);
    qc.setQueryData<{ accounts: unknown[]; settings: Settings }>(["me"], (old) => (old ? { ...old, settings: next } : old));
  } catch (err) {
    toast({ text: err instanceof Error ? err.message : "Couldn't save settings.", tone: "error" });
  }
}

const KEYS: { group: string; rows: [string[], string][] }[] = [
  { group: "Move around", rows: [[["j"], "Next thread"], [["k"], "Previous thread"], [["Enter"], "Open thread"], [["u"], "Back to the list"], [["n"], "Next message in thread"], [["p"], "Previous message in thread"], [["1", "–", "4"], "Needs you, Waiting, FYI, Updates"], [["5"], "Everything in inbox"], [["g", "s"], "Starred"], [["g", "t"], "Sent"], [["g", "b"], "Snoozed"], [["g", "a"], "All mail"], [["/"], "Search"], [["⌘", "K"], "Command palette"]] },
  { group: "Triage", rows: [[["e"], "Archive"], [["h"], "Snooze"], [["⇧", "H"], "Follow up if no reply"], [["s"], "Star"], [["⇧", "P"], "Pin to top"], [["⇧", "I"], "Mark read"], [["⇧", "U"], "Mark unread"], [["#"], "Move to trash"], [["!"], "Report spam"], [["x"], "Select thread"], [["⇧", "J/K"], "Extend selection"], [["*", "a"], "Select all"], [["Esc"], "Clear selection"], [["z"], "Undo last action"]] },
  { group: "Long threads", rows: [[[";"], "Expand all messages"], [[":"], "Collapse all"], [["o"], "Expand or collapse message"], [["⌘", "F"], "Find in thread"], [["i"], "Catch me up (brief)"], [["]"], "Show or hide the side panel"]] },
  { group: "Write", rows: [[["c"], "Compose"], [["r"], "Reply"], [["a"], "Reply all"], [["f"], "Forward"], [["⌘", "J"], "Draft from your notes"], [["⌘", "Enter"], "Send"], [["⌘", "⇧", "C"], "Show Cc and Bcc"], [["Esc"], "Leave the composer"]] },
];

export function Help() {
  const open = useUi((s) => s.help);
  if (!open) return null;
  return (
    <Dialog title="Keyboard shortcuts" onClose={() => setUi({ help: false })} wide>
      <div className="help-cols">
        {KEYS.map((g) => (
          <div className="help-group" key={g.group}>
            <h3>{g.group}</h3>
            {g.rows.map(([keys, label]) => (
              <div className="help-row" key={label}>
                <span>{label}</span>
                <span className="keys">{keys.map((k, i) => (k === "–" ? <span key={i}>–</span> : <kbd key={i}>{k}</kbd>))}</span>
              </div>
            ))}
          </div>
        ))}
      </div>
    </Dialog>
  );
}

export function SettingsDialog() {
  const open = useUi((s) => s.settings);
  const me = useMe().data;
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Settings | null>(null);
  useEffect(() => {
    if (open && me) setDraft(me.settings);
  }, [open, me]);
  if (!open || !draft || !me) return null;
  const close = () => setUi({ settings: false });
  const save = async () => {
    await saveSettings(qc, draft);
    toast({ text: "Settings saved" }, 2000);
    close();
  };
  return (
    <Dialog title="Settings" onClose={close} footer={<><button className="btn" onClick={close}>Cancel</button><button className="btn btn-primary" onClick={() => void save()}>Save settings</button></>}>
      <div className="form-row">
        <label htmlFor="undo">Undo send window</label>
        <select id="undo" className="input" value={draft.undoSendSeconds} onChange={(e) => setDraft({ ...draft, undoSendSeconds: Number(e.target.value) })}>
          {[0, 5, 10, 20, 30].map((n) => <option key={n} value={n}>{n === 0 ? "Send immediately" : `${n} seconds`}</option>)}
        </select>
        <p className="form-help">Mail waits this long before it leaves, so you can take it back.</p>
      </div>
      <div className="form-row">
        <label htmlFor="sig">Signature</label>
        <textarea id="sig" className="input" rows={4} value={draft.signature} onChange={(e) => setDraft({ ...draft, signature: e.target.value })} placeholder={"Alex Morgan\nDirector, Platform Engineering"} />
        <p className="form-help">Added below your message as plain text.</p>
      </div>
      <div className="form-row">
        <span className="form-label">Remote images</span>
        <div className="seg" role="group" aria-label="Remote images">
          <button aria-pressed={draft.loadRemoteImages === "ask"} onClick={() => setDraft({ ...draft, loadRemoteImages: "ask" })}>Ask first</button>
          <button aria-pressed={draft.loadRemoteImages === "always"} onClick={() => setDraft({ ...draft, loadRemoteImages: "always" })}>Always load</button>
        </div>
        <p className="form-help">Remote images can tell senders when and where you opened their mail.</p>
      </div>
      <div className="form-row">
        <span className="form-label">Appearance</span>
        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <div className="seg" role="group" aria-label="Theme">
            {(["system", "light", "dark"] as const).map((t) => <button key={t} aria-pressed={draft.theme === t} onClick={() => setDraft({ ...draft, theme: t })}>{t === "system" ? "System" : t === "light" ? "Light" : "Dark"}</button>)}
          </div>
          <div className="seg" role="group" aria-label="Density">
            {(["comfortable", "compact"] as const).map((t) => <button key={t} aria-pressed={draft.density === t} onClick={() => setDraft({ ...draft, density: t })}>{t === "compact" ? "Compact" : "Comfortable"}</button>)}
          </div>
          <div className="seg" role="group" aria-label="Reading pane">
            {(["right", "full"] as const).map((t) => <button key={t} aria-pressed={draft.readingPane === t} onClick={() => setDraft({ ...draft, readingPane: t })}>{t === "right" ? "Reading pane" : "Full width"}</button>)}
          </div>
        </div>
      </div>
      <div className="form-row">
        <span className="form-label">Accounts</span>
        {me.accounts.map((a) => (
          <div key={a.id} style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <span style={{ flex: 1 }}>{a.email} <span style={{ color: "var(--text-tertiary)", fontSize: 12 }}>{a.provider === "gmail" ? "Gmail" : a.provider === "outlook" ? "Outlook" : "Demo"}</span></span>
            <button className="btn btn-ghost btn-sm" onClick={async () => {
              if (!window.confirm(`Remove ${a.email} from Tidepost? Mail stays in your ${a.provider === "outlook" ? "Outlook" : a.provider === "gmail" ? "Gmail" : "demo"} account.`)) return;
              await api.removeAccount(a.id);
              await qc.invalidateQueries({ queryKey: ["me"] });
              if (getUi().accountId === a.id) setUi({ accountId: null, openThreadId: null });
            }}>Remove</button>
          </div>
        ))}
      </div>
    </Dialog>
  );
}

export function Toasts() {
  const toasts = useUi((s) => s.toasts);
  const [, force] = useState(0);
  useEffect(() => {
    if (!toasts.some((t) => t.until)) return;
    const h = window.setInterval(() => force((x) => x + 1), 250);
    return () => clearInterval(h);
  }, [toasts]);
  return createPortal(
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div key={t.id} className={`toast${t.tone === "error" ? " toast-error" : ""}`}>
          <span>{t.text}</span>
          {t.until ? <span className="countdown">{Math.max(0, Math.ceil((t.until - Date.now()) / 1000))}s</span> : null}
          {t.action ? <button className="btn-link" onClick={() => { dismissToast(t.id); t.action!.run(); }}>{t.action.label}</button> : null}
          <button className="icon-btn icon-btn-sm" style={{ color: "inherit" }} aria-label="Dismiss" onClick={() => dismissToast(t.id)}>×</button>
        </div>
      ))}
    </div>,
    document.body,
  );
}
