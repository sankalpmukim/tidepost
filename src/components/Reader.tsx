import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Archive, ArrowLeft, BellRing, ChevronsDownUp, ChevronsUpDown, Clock, Inbox, Mail, MailX, MoreHorizontal, PanelRight, Pin, Reply, ReplyAll,
  Search, ShieldAlert, Star, Tag, Trash2, Users, ArrowDownToLine, X, CircleSlash, FolderInput, Forward,
} from "lucide-react";
import { api } from "../api";
import { useAccount, useActions, useFolders, useMe, useThread } from "../hooks";
import { getUi, openComposer, setUi, toast, useUi } from "../store";
import { Menu, StatusGlyph, remindOptions, snoozeOptions, LANE_WORDS, type MenuEntry } from "./bits";
import { MessageView, type RecipientChange } from "./MessageView";
import { Composer } from "./Composer";
import { dayLabel, plural, shortDay, until } from "../lib/format";
import type { Message, Person, Thread } from "../../shared/types";

/** Messages always shown in a long thread; the rest collapse into "N more" bars. */
function anchorsFor(msgs: Message[], expanded: Set<string>, revealed: Set<string>): Set<number> {
  const keep = new Set<number>();
  if (msgs.length <= 6) {
    msgs.forEach((_, i) => keep.add(i));
    return keep;
  }
  keep.add(0);
  for (let i = Math.max(0, msgs.length - 3); i < msgs.length; i++) keep.add(i);
  msgs.forEach((m, i) => {
    if (m.unread || expanded.has(m.id) || revealed.has(m.id)) keep.add(i);
  });
  return keep;
}

function recipientChanges(msgs: Message[]): Map<string, RecipientChange> {
  const out = new Map<string, RecipientChange>();
  for (let i = 1; i < msgs.length; i++) {
    const prev = msgs[i - 1];
    const cur = msgs[i];
    const prevSet = new Map<string, Person>();
    for (const p of [prev.from, ...prev.to, ...prev.cc]) prevSet.set(p.email, p);
    const curSet = new Map<string, Person>();
    for (const p of [cur.from, ...cur.to, ...cur.cc]) curSet.set(p.email, p);
    const added = [...curSet.values()].filter((p) => !prevSet.has(p.email));
    const removed = [...prev.to, ...prev.cc].filter((p) => !curSet.has(p.email));
    // Ignore the first reply flipping sender/recipient, and tiny threads.
    if ((added.length || removed.length) && msgs.length > 2) out.set(cur.id, { added, removed });
  }
  return out;
}

export function Reader() {
  const account = useAccount();
  const aid = account?.id ?? null;
  const me = account?.email ?? "";
  const tid = useUi((s) => s.openThreadId);
  const filterPeople = useUi((s) => s.filterPeople);
  const onlyMine = useUi((s) => s.onlyMine);
  const askMsgs = useUi((s) => s.askMsgs);
  const rail = useUi((s) => s.rail);
  const composers = useUi((s) => s.composers);
  const settings = useMe().data?.settings;
  const q = useThread(aid, tid);
  const thread = q.data;
  const qc = useQueryClient();
  const { perform } = useActions();
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [revealed, setRevealed] = useState<Set<string>>(new Set());
  const [flash, setFlash] = useState<string | null>(null);
  const [find, setFind] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [findIdx, setFindIdx] = useState(0);
  const [menu, setMenu] = useState<{ kind: "snooze" | "remind" | "more" | "label" | "people"; el: HTMLElement } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const findRef = useRef<HTMLInputElement>(null);
  const initFor = useRef<string | null>(null);
  const folders = useFolders(aid).data ?? [];

  const msgs = thread?.messages ?? [];

  // Reset per-thread state when a different thread opens.
  useEffect(() => {
    setExpanded(new Set());
    setRevealed(new Set());
    setFind("");
    setFindOpen(false);
    initFor.current = null;
    setUi({ filterPeople: [], onlyMine: false, visibleMsgs: [], askMsgs: [] });
    scrollRef.current?.scrollTo({ top: 0 });
  }, [tid]);

  // Initial expansion: unread messages plus the last one. Scroll to the first unread.
  useEffect(() => {
    if (!thread || initFor.current === thread.id) return;
    initFor.current = thread.id;
    const ex = new Set<string>();
    thread.messages.forEach((m) => m.unread && ex.add(m.id));
    const last = thread.messages[thread.messages.length - 1];
    if (last) ex.add(last.id);
    setExpanded(ex);
    const firstUnread = thread.messages.find((m) => m.unread);
    if (firstUnread && thread.messages.length > 3) {
      requestAnimationFrame(() => document.getElementById(`msg-${firstUnread.id}`)?.scrollIntoView({ block: "start" }));
    }
  }, [thread]);

  // Mark read after a short dwell.
  useEffect(() => {
    if (!thread || thread.summary.unreadCount === 0) return;
    const id = thread.id;
    const t = window.setTimeout(() => {
      if (getUi().openThreadId === id) void perform([id], { type: "read" }, { silent: true, undoable: false });
    }, 900);
    return () => clearTimeout(t);
  }, [thread, perform]);

  // Load bodies for expanded messages that only have headers.
  useEffect(() => {
    if (!thread || !aid) return;
    const missing = thread.messages.filter((m) => expanded.has(m.id) && !m.bodyLoaded).map((m) => m.id);
    if (!missing.length) return;
    let cancelled = false;
    void api.messages(aid, missing).then((loaded) => {
      if (cancelled) return;
      qc.setQueryData<Thread>(["thread", aid, thread.id], (old) => old ? { ...old, messages: old.messages.map((m) => loaded.find((l) => l.id === m.id) ?? m) } : old);
    }).catch(() => toast({ text: "Couldn't load some messages. Check your connection.", tone: "error" }));
    return () => { cancelled = true; };
  }, [expanded, thread, aid, qc]);

  const filtered = useMemo(() => {
    let list = msgs.map((m, i) => ({ m, i }));
    if (filterPeople.length) list = list.filter(({ m }) => filterPeople.includes(m.from.email));
    if (onlyMine) list = list.filter(({ m }) => m.fromMe || m.to.some((p) => p.email === me) || askMsgs.includes(m.id));
    return list;
  }, [msgs, filterPeople, onlyMine, me, askMsgs]);

  const findMatches = useMemo(() => {
    const n = find.trim().toLowerCase();
    if (n.length < 2) return [] as string[];
    return filtered.filter(({ m }) => (m.bodyLoaded ? m.text : m.snippet).toLowerCase().includes(n) || m.from.name.toLowerCase().includes(n)).map(({ m }) => m.id);
  }, [find, filtered]);

  const jump = useCallback((id: string) => {
    setRevealed((r) => new Set(r).add(id));
    setExpanded((e) => new Set(e).add(id));
    setFlash(id);
    window.setTimeout(() => setFlash((f) => (f === id ? null : f)), 1300);
    requestAnimationFrame(() => requestAnimationFrame(() => document.getElementById(`msg-${id}`)?.scrollIntoView({ block: "start", behavior: "smooth" })));
  }, []);

  useEffect(() => {
    const h = (e: Event) => jump((e as CustomEvent<string>).detail);
    window.addEventListener("tp:jump", h);
    return () => window.removeEventListener("tp:jump", h);
  }, [jump]);

  // Go to the current find match.
  useEffect(() => {
    if (!findMatches.length) return;
    const id = findMatches[Math.min(findIdx, findMatches.length - 1)];
    jump(id);
  }, [findIdx, findMatches, jump]);

  // Scroll spy for the thread chart.
  useEffect(() => {
    const root = scrollRef.current;
    if (!root || !msgs.length) return;
    const visible = new Set<string>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        const id = (e.target as HTMLElement).id.replace(/^msg-/, "");
        if (e.isIntersecting) visible.add(id);
        else visible.delete(id);
      }
      setUi({ visibleMsgs: [...visible] });
    }, { root, threshold: 0.01 });
    root.querySelectorAll("article.msg").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [msgs, expanded, revealed, filtered]);

  // Reader keyboard shortcuts (thread-level).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!thread) return;
      const tag = (e.target as HTMLElement).tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || (e.target as HTMLElement).isContentEditable) return;
      if (e.metaKey || e.ctrlKey || e.altKey) {
        if ((e.metaKey || e.ctrlKey) && e.key === "f" && msgs.length > 1) {
          e.preventDefault();
          setFindOpen(true);
          requestAnimationFrame(() => findRef.current?.focus());
        }
        return;
      }
      if (e.key === ";") { e.preventDefault(); setExpanded(new Set(msgs.map((m) => m.id))); setRevealed(new Set(msgs.map((m) => m.id))); }
      else if (e.key === ":") { e.preventDefault(); setExpanded(new Set([msgs[msgs.length - 1].id])); setRevealed(new Set()); }
      else if (e.key === "n" || e.key === "p") {
        e.preventDefault();
        const visible = getUi().visibleMsgs;
        const order = filtered.map(({ m }) => m.id);
        const cur = order.findIndex((id) => visible.includes(id));
        const next = e.key === "n" ? Math.min(order.length - 1, cur + 1) : Math.max(0, cur - 1);
        if (order[next]) jump(order[next]);
      } else if (e.key === "u" && e.shiftKey === false && thread.messages.some((m) => m.unread)) {
        // handled by App (back); keep default
      } else if (e.key === "o" && !e.shiftKey) {
        const visible = getUi().visibleMsgs;
        const id = filtered.find(({ m }) => visible.includes(m.id))?.m.id;
        if (id) setExpanded((x) => { const n = new Set(x); if (n.has(id)) n.delete(id); else n.add(id); return n; });
      } else if (e.key === "O") {
        e.preventDefault();
        setExpanded(new Set(msgs.map((m) => m.id)));
        setRevealed(new Set(msgs.map((m) => m.id)));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [thread, msgs, filtered, jump]);

  if (!tid) return <ReaderEmpty />;
  if (q.isLoading || !thread || !aid) {
    return (
      <section className="reader-pane" aria-busy="true">
        <div className="reader-bar" />
        <div className="reader-scroll">
          <div className="reader-inner">
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-3)" }}>
              <div className="skeleton" style={{ height: 24, width: "70%" }} />
              <div style={{ display: "flex", gap: "var(--space-2)" }}>
                <div className="skeleton" style={{ height: 14, width: 120 }} />
                <div className="skeleton" style={{ height: 14, width: 80 }} />
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)", marginTop: "var(--space-6)" }}>
              <div style={{ display: "flex", gap: "var(--space-3)" }}>
                <div className="skeleton" style={{ height: 40, width: 40, borderRadius: "50%" }} />
                <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: "var(--space-2)" }}>
                  <div className="skeleton" style={{ height: 16, width: "40%" }} />
                  <div className="skeleton" style={{ height: 14, width: "60%" }} />
                </div>
              </div>
              <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-2)", marginLeft: 52 }}>
                <div className="skeleton" style={{ height: 14, width: "90%" }} />
                <div className="skeleton" style={{ height: 14, width: "85%" }} />
                <div className="skeleton" style={{ height: 14, width: "75%" }} />
              </div>
            </div>
            {q.isError ? <p style={{ color: "var(--danger-text)", marginTop: "var(--space-4)" }}>{(q.error as Error).message}</p> : null}
          </div>
        </div>
      </section>
    );
  }

  const s = thread.summary;
  const changes = recipientChanges(msgs);
  const anchors = anchorsFor(msgs, expanded, revealed);
  const unreadCount = msgs.filter((m) => m.unread).length;
  const people = new Map<string, { p: Person; n: number }>();
  for (const m of msgs) people.set(m.from.email, { p: m.from, n: (people.get(m.from.email)?.n ?? 0) + 1 });
  const composer = composers.find((c) => c.threadId === thread.id && c.mode !== "new");
  const last = msgs[msgs.length - 1];
  const filtering = filterPeople.length > 0 || onlyMine;
  const userFolders = folders.filter((f) => f.kind === "user");
  const isOutlook = account?.provider === "outlook";
  const days = Math.max(1, Math.round((Date.parse(s.lastDate) - Date.parse(s.firstDate)) / 86400000) + 1);

  const reply = (mode: "reply" | "replyAll" | "forward", m?: Message) => {
    const target = m ?? [...msgs].reverse().find((x) => !x.fromMe) ?? last;
    openComposer({ mode, accountId: aid, threadId: thread.id, messageId: target.id });
  };

  // Build the rendered list: anchors, collapse bars for hidden runs, day dividers.
  const nodes: React.ReactNode[] = [];
  const list = filtering ? filtered : msgs.map((m, i) => ({ m, i }));
  let hidden: Message[] = [];
  let lastDay = "";
  const flushHidden = () => {
    if (!hidden.length) return;
    const run = hidden;
    hidden = [];
    const span = run.length > 1 ? `${shortDay(run[0].date)} – ${shortDay(run[run.length - 1].date)}` : shortDay(run[0].date);
    const people = new Set(run.map((m) => m.from.email)).size;
    nodes.push(
      <button key={`bar-${run[0].id}`} className="collapse-bar" onClick={() => setRevealed((r) => { const n = new Set(r); run.forEach((m) => n.add(m.id)); return n; })}>
        <span><ChevronsUpDown size={14} /> {plural(run.length, "earlier message")} from {plural(people, "person", "people")} · {span}</span>
      </button>,
    );
  };
  for (const { m, i } of list) {
    if (!filtering && !anchors.has(i)) {
      hidden.push(m);
      continue;
    }
    flushHidden();
    const day = dayLabel(m.date);
    if (msgs.length > 6 && day !== lastDay) {
      nodes.push(<div key={`day-${m.id}`} className="day-divider">{day}</div>);
      lastDay = day;
    }
    nodes.push(
      <MessageView
        key={m.id}
        m={m}
        index={i}
        meEmail={me}
        expanded={expanded.has(m.id) || msgs.length === 1}
        asksYou={askMsgs.includes(m.id)}
        change={changes.get(m.id) ?? null}
        remoteImages={settings?.loadRemoteImages ?? "ask"}
        find={findMatches.includes(m.id) ? find.trim() : ""}
        flash={flash === m.id}
        onToggle={() => setExpanded((x) => { const n = new Set(x); if (n.has(m.id)) n.delete(m.id); else n.add(m.id); return n; })}
        onReply={(mode) => reply(mode, m)}
      />,
    );
  }
  flushHidden();

  const moreItems: MenuEntry[] = [
    { label: "Forward", hint: "f", icon: <Forward size={14} />, onSelect: () => reply("forward") },
    { label: s.unreadCount ? "Mark read" : "Mark unread", hint: s.unreadCount ? "⇧I" : "⇧U", icon: <Mail size={14} />, onSelect: () => void perform([s.id], s.unreadCount ? { type: "read" } : { type: "unread" }) },
    ...(s.lane === "waiting" ? [{ label: "Stop waiting for a reply", icon: <CircleSlash size={14} />, onSelect: () => void perform([s.id], { type: "stopWaiting" }) }] : []),
    ...(s.remindAt || s.nudged ? [{ label: "Remove follow-up reminder", icon: <BellRing size={14} />, onSelect: () => void perform([s.id], { type: "unremind" }) }] : []),
    ...(s.isBulk ? [{ label: "Unsubscribe", hint: "⌘U", icon: <MailX size={14} />, onSelect: () => void unsubscribe(aid, s.id, perform) }] : []),
    "sep",
    { label: "Report spam", hint: "!", icon: <ShieldAlert size={14} />, onSelect: () => void perform([s.id], { type: "spam" }) },
    { label: "Move to trash", hint: "#", icon: <Trash2 size={14} />, onSelect: () => void perform([s.id], { type: "trash" }) },
  ];

  return (
    <section className="reader-pane" aria-label="Conversation">
      <div className="reader-bar">
        <button className="icon-btn" title="Back to list (u)" aria-label="Back to list" onClick={() => setUi({ openThreadId: null })}><ArrowLeft size={16} /></button>
        <span className="bar-sep" />
        {s.inInbox ? (
          <button className="btn btn-ghost btn-sm" title="Archive (e)" onClick={() => void perform([s.id], { type: "archive" })}><Archive size={15} /> Archive</button>
        ) : (
          <button className="btn btn-ghost btn-sm" title="Move to inbox" onClick={() => void perform([s.id], { type: "inbox" })}><Inbox size={15} /> Move to inbox</button>
        )}
        <button className="btn btn-ghost btn-sm" title="Snooze (h)" onClick={(e) => setMenu({ kind: "snooze", el: e.currentTarget })}><Clock size={15} /> Snooze</button>
        <button className="btn btn-ghost btn-sm" title="Remind me if nobody replies (Shift+H)" onClick={(e) => setMenu({ kind: "remind", el: e.currentTarget })}><BellRing size={15} /> Follow up</button>
        <button className="icon-btn" title={s.pinned ? "Unpin (Shift+P)" : "Pin to top (Shift+P)"} aria-label="Pin" aria-pressed={s.pinned} onClick={() => void perform([s.id], s.pinned ? { type: "unpin" } : { type: "pin" })}><Pin size={15} /></button>
        <button className="icon-btn" title={s.starred ? "Unstar (s)" : "Star (s)"} aria-label="Star" aria-pressed={s.starred} onClick={() => void perform([s.id], s.starred ? { type: "unstar" } : { type: "star" })}><Star size={15} fill={s.starred ? "currentColor" : "none"} /></button>
        {userFolders.length ? <button className="icon-btn" title={isOutlook ? "Move to folder (v)" : "Label (l)"} aria-label={isOutlook ? "Move to folder" : "Label"} onClick={(e) => setMenu({ kind: "label", el: e.currentTarget })}>{isOutlook ? <FolderInput size={15} /> : <Tag size={15} />}</button> : null}
        <button className="icon-btn" title="More" aria-label="More actions" onClick={(e) => setMenu({ kind: "more", el: e.currentTarget })}><MoreHorizontal size={15} /></button>
        <span className="spacer" />
        <button className="btn btn-sm" onClick={() => reply("replyAll")} title="Reply all (a)"><ReplyAll size={14} /> Reply all</button>
        <button className="icon-btn" onClick={() => reply("reply")} title="Reply (r)" aria-label="Reply"><Reply size={15} /></button>
        <span className="bar-sep" />
        <button className="icon-btn" aria-pressed={rail} title="Toggle the brief and thread chart (])" aria-label="Toggle side panel" onClick={() => setUi({ rail: !rail })}><PanelRight size={16} /></button>
      </div>

      <div className="reader-scroll" ref={scrollRef}>
        <div className="reader-inner">
          <header className="thread-head">
            <h1 className="thread-subject">{thread.subject}</h1>
            <div className="thread-facts">
              <span className="fact"><StatusGlyph lane={s.lane} nudged={s.nudged} /> {s.nudged ? "No reply yet" : LANE_WORDS[s.lane]}</span>
              {msgs.length > 1 ? <span className="fact">{plural(msgs.length, "message")}</span> : null}
              {s.audienceSize > 2 ? <span className="fact"><Users size={12} /> {plural(s.audienceSize, "person", "people")}</span> : null}
              {msgs.length > 1 ? <span className="fact">{days === 1 ? shortDay(s.firstDate) : `${shortDay(s.firstDate)} – ${shortDay(s.lastDate)}`}</span> : null}
              {s.snoozedUntil ? <span className="badge badge-waiting">Snoozed until {until(s.snoozedUntil)}</span> : null}
              {s.remindAt ? <span className="badge badge-waiting">Follow up {until(s.remindAt)} if no reply</span> : null}
              {s.audienceSize >= 15 ? <span className="badge badge-needs" title="Reply all reaches everyone on the thread">Large audience</span> : null}
            </div>
            {s.folders.some((f) => userFolders.some((u) => u.id === f)) ? (
              <div className="thread-labels">
                {userFolders.filter((u) => s.folders.includes(u.id)).map((u) => (
                  <span key={u.id} className="badge">{u.name}{!isOutlook ? <button className="icon-btn" style={{ width: 14, height: 14 }} aria-label={`Remove label ${u.name}`} onClick={() => void perform([s.id], { type: "unlabel", folderId: u.id })}><X size={10} /></button> : null}</span>
                ))}
              </div>
            ) : null}
          </header>

          {msgs.length > 3 ? (
            <div className="thread-tools">
              {unreadCount ? (
                <button className="chip chip-needs" onClick={() => { const f = msgs.find((m) => m.unread); if (f) jump(f.id); }}><ArrowDownToLine size={13} /> First unread ({unreadCount})</button>
              ) : null}
              {expanded.size >= msgs.length ? (
                <button className="chip" title="Collapse all (:)" onClick={() => { setExpanded(new Set([last.id])); setRevealed(new Set()); }}><ChevronsDownUp size={13} /> Collapse all</button>
              ) : (
                <button className="chip" title="Expand all (;)" onClick={() => { setExpanded(new Set(msgs.map((m) => m.id))); setRevealed(new Set(msgs.map((m) => m.id))); }}><ChevronsUpDown size={13} /> Expand all</button>
              )}
              <button className="chip" aria-pressed={onlyMine} title="Only messages from you, to you, or asking you something" onClick={() => setUi({ onlyMine: !onlyMine })}>To or from me</button>
              <button className="chip" aria-pressed={filterPeople.length > 0} onClick={(e) => setMenu({ kind: "people", el: e.currentTarget })}><Users size={13} /> {filterPeople.length ? `${filterPeople.length} ${filterPeople.length === 1 ? "person" : "people"}` : "People"}</button>
              <span className="spacer" />
              {findOpen ? (
                <span className="find-box">
                  <input
                    ref={findRef}
                    className="input"
                    placeholder="Find in thread"
                    value={find}
                    onChange={(e) => { setFind(e.target.value); setFindIdx(0); }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") { e.preventDefault(); setFindIdx((i) => (findMatches.length ? (e.shiftKey ? (i - 1 + findMatches.length) % findMatches.length : (i + 1) % findMatches.length) : 0)); }
                      if (e.key === "Escape") { setFindOpen(false); setFind(""); }
                    }}
                  />
                  <span style={{ fontSize: 12, color: "var(--text-tertiary)", minWidth: 64 }}>{find.trim().length > 1 ? (findMatches.length ? `${Math.min(findIdx, findMatches.length - 1) + 1} of ${findMatches.length}` : "No matches") : ""}</span>
                  <button className="icon-btn icon-btn-sm" aria-label="Close find" onClick={() => { setFindOpen(false); setFind(""); }}><X size={14} /></button>
                </span>
              ) : (
                <button className="chip" title="Find in thread (Ctrl+F)" onClick={() => { setFindOpen(true); requestAnimationFrame(() => findRef.current?.focus()); }}><Search size={13} /> Find</button>
              )}
            </div>
          ) : null}

          {filtering ? (
            <div style={{ fontSize: 12, color: "var(--text-tertiary)", display: "flex", gap: 8, alignItems: "center" }}>
              Showing {filtered.length} of {msgs.length} messages.
              <button className="btn-link" onClick={() => setUi({ filterPeople: [], onlyMine: false })}>Show all</button>
            </div>
          ) : null}

          {nodes.map((n, i) => <Fragment key={i}>{n}</Fragment>)}

          {composer ? (
            <Composer req={composer} thread={thread} inline />
          ) : (
            <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
              <button className="btn" onClick={() => reply("reply")}><Reply size={15} /> Reply <kbd>r</kbd></button>
              <button className="btn" onClick={() => reply("replyAll")}><ReplyAll size={15} /> Reply all <kbd>a</kbd></button>
              <button className="btn" onClick={() => reply("forward")}><Forward size={15} /> Forward <kbd>f</kbd></button>
            </div>
          )}
        </div>
      </div>

      {menu?.kind === "snooze" ? <Menu anchor={menu.el} onClose={() => setMenu(null)} items={[{ heading: "Bring it back to the inbox" }, ...snoozeOptions().map((o) => ({ label: o.label, hint: o.hint, onSelect: () => void perform([s.id], { type: "snooze", until: o.at.toISOString() }) }))]} /> : null}
      {menu?.kind === "remind" ? <Menu anchor={menu.el} onClose={() => setMenu(null)} items={[{ heading: "If nobody replies, bring it back" }, ...remindOptions().map((o) => ({ label: o.label, hint: o.hint, onSelect: () => void perform([s.id], { type: "remind", at: o.at.toISOString() }) }))]} /> : null}
      {menu?.kind === "more" ? <Menu anchor={menu.el} align="right" onClose={() => setMenu(null)} items={moreItems} /> : null}
      {menu?.kind === "label" ? (
        <Menu anchor={menu.el} onClose={() => setMenu(null)} items={[{ heading: isOutlook ? "Move to folder" : "Apply label" }, ...userFolders.map((f) => ({
          label: f.name,
          hint: s.folders.includes(f.id) ? "applied" : undefined,
          onSelect: () => void perform([s.id], isOutlook ? { type: "move", folderId: f.id } : s.folders.includes(f.id) ? { type: "unlabel", folderId: f.id } : { type: "label", folderId: f.id }),
        }))]} />
      ) : null}
      {menu?.kind === "people" ? (
        <Menu anchor={menu.el} onClose={() => setMenu(null)} items={[
          { heading: "Show messages from" },
          ...(filterPeople.length ? [{ label: "Everyone", onSelect: () => setUi({ filterPeople: [] }) }, "sep" as const] : []),
          ...[...people.values()].sort((a, b) => b.n - a.n).map(({ p, n }) => ({
            label: `${p.email === me ? "You" : p.name}`,
            hint: `${n}${filterPeople.includes(p.email) ? " ✓" : ""}`,
            onSelect: () => setUi((st) => ({ filterPeople: st.filterPeople.includes(p.email) ? st.filterPeople.filter((x) => x !== p.email) : [...st.filterPeople, p.email] })),
          })),
        ]} />
      ) : null}
    </section>
  );
}

export async function unsubscribe(aid: string, tid: string, perform: ReturnType<typeof useActions>["perform"]) {
  try {
    const r = await api.unsubscribe(aid, tid);
    if (r.method === "url" && r.url) {
      window.open(r.url, "_blank", "noopener,noreferrer");
      toast({ text: r.message });
      return;
    }
    if (r.method === "none") {
      toast({ text: r.message, tone: "error" }, 7000);
      return;
    }
    toast({ text: r.message });
    void perform([tid], { type: "archive" }, { silent: true });
  } catch (err) {
    toast({ text: err instanceof Error ? err.message : "Couldn't unsubscribe.", tone: "error" });
  }
}

function ReaderEmpty() {
  return (
    <section className="reader-pane">
      <div className="reader-empty">
        <div className="reader-empty-inner">
          <h2>Pick a thread</h2>
          <p style={{ margin: 0 }}>Start with Needs you. Everything there is addressed to you and waiting on your answer.</p>
          <div className="keys-grid">
            <span><kbd>j</kbd> <kbd>k</kbd></span><span>Next and previous thread</span>
            <span><kbd>e</kbd></span><span>Archive (done for now)</span>
            <span><kbd>r</kbd> <kbd>a</kbd></span><span>Reply, reply all</span>
            <span><kbd>h</kbd></span><span>Snooze until later</span>
            <span><kbd>1</kbd>–<kbd>4</kbd></span><span>Switch lanes</span>
            <span><kbd>⌘</kbd> <kbd>K</kbd></span><span>Every command</span>
            <span><kbd>?</kbd></span><span>All shortcuts</span>
          </div>
        </div>
      </div>
    </section>
  );
}
