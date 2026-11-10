import { useEffect, useMemo, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Archive, Clock, Mail, MailOpen, Paperclip, Pin, Search, Star, Trash2, Users, X, RefreshCw } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useAccount, useActions, useCounts, useLocalSearch, useMe, useThreads } from "../hooks";
import { projectThreadList, useOptimisticRevision } from "../optimistic";
import { setUi, toast, useUi } from "../store";
import { api, ApiError } from "../api";
import { Menu, StatusGlyph, snoozeOptions, LANE_WORDS } from "./bits";
import { ago, listDate, plural, sendersLine, until } from "../lib/format";
import type { ThreadSummary } from "../../shared/types";

const LANES: { id: string; label: string; key: string }[] = [
  { id: "needs", label: "Needs you", key: "1" },
  { id: "waiting", label: "Waiting", key: "2" },
  { id: "fyi", label: "FYI", key: "3" },
  { id: "updates", label: "Updates", key: "4" },
  { id: "inbox", label: "All", key: "5" },
];

const VIEW_TITLES: Record<string, string> = {
  snoozed: "Snoozed", starred: "Starred", sent: "Sent", archive: "Archive", all: "All mail", spam: "Spam", trash: "Trash", search: "Search results",
};

const EMPTY: Record<string, { title: string; body: string }> = {
  needs: { title: "Nothing needs you", body: "Every thread addressed to you has an answer. New asks land here first." },
  waiting: { title: "Not waiting on anyone", body: "Threads where you wrote last show up here until someone replies." },
  fyi: { title: "No FYI mail", body: "Threads where you're only on Cc or a group list collect here." },
  updates: { title: "No updates", body: "Newsletters, notifications and automated mail go here." },
  inbox: { title: "Inbox zero", body: "Nothing left in the inbox." },
  snoozed: { title: "Nothing snoozed", body: "Press h on a thread to bring it back later." },
  search: { title: "No matches", body: "Try fewer words, or operators like from:, subject:, has:attachment." },
};

export function ThreadList() {
  const account = useAccount();
  const aid = account?.id ?? null;
  const me = account?.email ?? "";
  const view = useUi((s) => s.view);
  const search = useUi((s) => s.search);
  const openId = useUi((s) => s.openThreadId);
  const focusedId = useUi((s) => s.focusedThreadId);
  const checked = useUi((s) => s.checked);
  const counts = useCounts(aid).data;
  const q = useThreads(aid, view, search);
  const local = useLocalSearch(aid, search, view === "search" && q.isFetching && !q.data);
  const { perform } = useActions();
  const scrollRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState(search);
  const sync = useMe().data?.accounts.find((a) => a.id === aid)?.sync;
  const qc = useQueryClient();

  useEffect(() => setDraft(view === "search" ? search : ""), [search, view]);

  // Non-search lists come back from useThreads already projected through the
  // optimistic overlay; search results (react-query / local index) project here.
  const optimisticRev = useOptimisticRevision();
  const { threads, searchHidden } = useMemo(() => {
    const project = (list: ThreadSummary[]) => (aid ? projectThreadList(aid, "search", list) : { threads: list, hidden: 0 });
    if (q.data) {
      if (view !== "search") return { threads: q.data.pages.flatMap((p) => p.threads), searchHidden: 0 };
      const p = project(q.data.pages.flatMap((p) => p.threads));
      return { threads: p.threads, searchHidden: p.hidden };
    }
    if (view === "search" && local.data) {
      const p = project(local.data.threads);
      return { threads: p.threads, searchHidden: p.hidden };
    }
    return { threads: [] as ThreadSummary[], searchHidden: 0 };
  }, [q.data, local.data, view, aid, optimisticRev]);
  const total = Math.max(0, (q.data?.pages[0]?.total ?? threads.length) - (view === "search" ? searchHidden : 0));

  const virt = useVirtualizer({
    count: threads.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (document.documentElement.dataset.density === "compact" ? 40 : 64),
    overscan: 12,
  });

  // Infinite paging.
  const items = virt.getVirtualItems();
  useEffect(() => {
    const last = items[items.length - 1];
    if (last && last.index >= threads.length - 20 && q.hasNextPage && !q.isFetchingNextPage) void q.fetchNextPage();
  }, [items, threads.length, q]);

  // Keep the focused row in view.
  useEffect(() => {
    const target = focusedId ?? openId;
    if (!target) return;
    const i = threads.findIndex((t) => t.id === target);
    if (i >= 0) virt.scrollToIndex(i, { align: "auto" });
  }, [focusedId, openId, threads, virt]);

  useEffect(() => {
    const h = () => searchRef.current?.focus();
    window.addEventListener("tp:focus-search", h);
    return () => window.removeEventListener("tp:focus-search", h);
  }, []);

  const toggleCheck = (id: string, range: boolean) => {
    setUi((s) => {
      const next = new Set(s.checked);
      if (range && s.focusedThreadId) {
        const a = threads.findIndex((t) => t.id === s.focusedThreadId);
        const b = threads.findIndex((t) => t.id === id);
        const [lo, hi] = a < b ? [a, b] : [b, a];
        for (let i = lo; i <= hi; i++) next.add(threads[i].id);
      } else if (next.has(id)) next.delete(id);
      else next.add(id);
      return { checked: next, focusedThreadId: id };
    });
  };

  const open = (t: ThreadSummary) => {
    setUi({ openThreadId: t.id, focusedThreadId: t.id });
  };

  const isLane = LANES.some((l) => l.id === view);
  const selecting = checked.size > 0;
  const allChecked = selecting && threads.length > 0 && threads.every((t) => checked.has(t.id));
  const [snoozeMenu, setSnoozeMenu] = useState<HTMLElement | null>(null);

  const bulk = (action: Parameters<typeof perform>[1]) => void perform([...checked], action);

  const [checking, setChecking] = useState(false);
  const checkMail = async () => {
    if (!aid || checking) return;
    setChecking(true);
    const least = new Promise((r) => setTimeout(r, 500));
    try {
      await api.sync(aid);
      await qc.invalidateQueries({ queryKey: ["threads", aid] });
    } catch (err) {
      toast({ text: err instanceof ApiError ? err.message : "Couldn't check for new mail. Try again.", tone: "error" });
    } finally {
      await least;
      setChecking(false);
    }
  };

  return (
    <section className="list-pane" aria-label="Threads" data-selecting={selecting}>
      <div className="list-head">
        <form
          className="search"
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            const v = draft.trim();
            if (!v) return;
            setUi({ view: "search", search: v, openThreadId: null, focusedThreadId: null, checked: new Set() });
            searchRef.current?.blur();
          }}
        >
          <Search size={16} className="search-icon" />
          <input
            ref={searchRef}
            className="input"
            placeholder="Search mail"
            aria-label="Search mail"
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                (e.target as HTMLInputElement).blur();
                if (view === "search") setUi({ view: "needs", search: "" });
              }
            }}
          />
          {view === "search" ? (
            <button type="button" className="icon-btn icon-btn-sm" style={{ position: "absolute", right: 4, top: 2 }} aria-label="Clear search" onClick={() => setUi({ view: "needs", search: "", openThreadId: null })}><X size={14} /></button>
          ) : <kbd>/</kbd>}
        </form>
        {isLane ? (
          <div className="lanes" role="tablist" aria-label="Triage lanes">
            {LANES.map((l) => {
              const n = l.id === "needs" ? counts?.needs : l.id === "waiting" ? counts?.waiting : l.id === "fyi" ? counts?.fyi : l.id === "updates" ? counts?.updates : counts?.inboxUnread;
              return (
                <button key={l.id} role="tab" className="lane" data-lane={l.id} aria-selected={view === l.id} onClick={() => setUi({ view: l.id, openThreadId: null, focusedThreadId: null, checked: new Set() })} title={`${l.label} (${l.key})`}>
                  {l.label}
                  {n ? <span className={`count${l.id === "needs" && n ? " hot" : ""}`}>{n > 999 ? "999+" : n}</span> : null}
                </button>
              );
            })}
          </div>
        ) : (
          <div style={{ display: "flex", alignItems: "center", height: 36, fontWeight: 600, gap: 8 }}>
            {view === "search" ? <>Results for “{search}”</> : view.startsWith("folder:") ? "Label" : VIEW_TITLES[view] ?? view}
          </div>
        )}
      </div>

      {sync && (sync.phase === "initial" || sync.phase === "error") ? (
        <div className={`sync-banner${sync.phase === "error" ? " error" : ""}`} role="status">
          {sync.phase === "initial" ? <span className="spinner" /> : null}
          <span className="sync-banner-msg">
            {sync.phase === "initial"
              ? `Indexing your mailbox: ${sync.done.toLocaleString()} of ${sync.total.toLocaleString()} messages. You can start working now.`
              : sync.error}
          </span>
          {sync.phase === "error" && aid ? <button className="btn btn-sm" onClick={() => void api.sync(aid).then(() => qc.invalidateQueries({ queryKey: ["me"] }))}><RefreshCw size={12} /> Retry</button> : null}
        </div>
      ) : null}

      <div className={`list-toolbar${selecting ? " selecting" : ""}`}>
        <button
          className="checkbox"
          role="checkbox"
          aria-checked={allChecked ? "true" : selecting ? "mixed" : "false"}
          aria-label="Select all loaded threads"
          onClick={() => setUi({ checked: allChecked || selecting ? new Set() : new Set(threads.map((t) => t.id)) })}
        >
          {selecting ? <svg width="10" height="10" viewBox="0 0 10 10"><path d={allChecked ? "M1.5 5.2l2.2 2.2 4.8-5" : "M2 5h6"} stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg> : null}
        </button>
        {selecting ? (
          <>
            <span style={{ fontWeight: 600, marginLeft: 8 }}>{checked.size} selected</span>
            <span className="spacer" />
            <button className="icon-btn icon-btn-sm" title="Archive (e)" aria-label="Archive" onClick={() => bulk({ type: "archive" })}><Archive size={15} /></button>
            <button className="icon-btn icon-btn-sm" title="Mark read (Shift+I)" aria-label="Mark read" onClick={() => bulk({ type: "read" })}><MailOpen size={15} /></button>
            <button className="icon-btn icon-btn-sm" title="Mark unread (Shift+U)" aria-label="Mark unread" onClick={() => bulk({ type: "unread" })}><Mail size={15} /></button>
            <button className="icon-btn icon-btn-sm" title="Snooze (h)" aria-label="Snooze" onClick={(e) => setSnoozeMenu(e.currentTarget)}><Clock size={15} /></button>
            <button className="icon-btn icon-btn-sm" title="Move to trash (#)" aria-label="Move to trash" onClick={() => bulk({ type: "trash" })}><Trash2 size={15} /></button>
            <button className="icon-btn icon-btn-sm" title="Clear selection (Esc)" aria-label="Clear selection" onClick={() => setUi({ checked: new Set() })}><X size={15} /></button>
          </>
        ) : (
          <>
            <span style={{ marginLeft: 8 }}>{q.isLoading ? "Loading…" : plural(total, "thread")}</span>
            <span className="spacer" />
            {view === "waiting" ? <span>Oldest first</span> : null}
            {aid ? <button className="icon-btn icon-btn-sm" title="Check for new mail" aria-label="Check for new mail" disabled={checking} onClick={() => void checkMail()}><RefreshCw size={14} className={checking ? "glyph-working" : undefined} /></button> : null}
          </>
        )}
      </div>

      <div className="list-scroll" ref={scrollRef} tabIndex={-1}>
        {!q.isLoading && !threads.length ? (
          <div className="list-empty">
            <StatusGlyph lane={view === "needs" ? "done" : "fyi"} />
            <h3>{(EMPTY[view] ?? EMPTY.inbox).title}</h3>
            <p>{(EMPTY[view] ?? EMPTY.inbox).body}</p>
            {sync?.phase === "initial" ? <p>Still indexing. Threads appear as they arrive.</p> : null}
          </div>
        ) : null}
        <div style={{ height: virt.getTotalSize(), position: "relative" }}>
          {items.map((vi) => {
            const t = threads[vi.index];
            return (
              <Row
                key={t.id}
                t={t}
                me={me}
                view={view}
                top={vi.start}
                selected={t.id === openId}
                focused={t.id === focusedId && t.id !== openId}
                checked={checked.has(t.id)}
                onOpen={() => open(t)}
                onCheck={(range) => toggleCheck(t.id, range)}
                onAction={(a) => void perform([t.id], a)}
              />
            );
          })}
        </div>
        {q.isFetchingNextPage ? <div className="list-footer">Loading more…</div> : null}
        {!q.hasNextPage && threads.length > 30 ? <div className="list-footer">That's everything here: {plural(total, "thread")}.</div> : null}
      </div>
      {snoozeMenu ? (
        <Menu anchor={snoozeMenu} align="right" onClose={() => setSnoozeMenu(null)} items={snoozeOptions().map((o) => ({ label: o.label, hint: o.hint, onSelect: () => bulk({ type: "snooze", until: o.at.toISOString() }) }))} />
      ) : null}
    </section>
  );
}

function Row({ t, me, view, top, selected, focused, checked, onOpen, onCheck, onAction }: {
  t: ThreadSummary; me: string; view: string; top: number; selected: boolean; focused: boolean; checked: boolean;
  onOpen: () => void; onCheck: (range: boolean) => void; onAction: (a: Parameters<ReturnType<typeof useActions>["perform"]>[1]) => void;
}) {
  const unread = t.unreadCount > 0;
  const senders = view === "sent" ? `To: ${t.participants.filter((p) => p.email !== me).map((p) => p.name.split(" ")[0]).slice(0, 3).join(", ") || "me"}` : sendersLine(t.participants, me);
  let right: string;
  if (t.snoozedUntil) right = until(t.snoozedUntil);
  else if (t.lane === "waiting" && view === "waiting") right = ago(t.lastDate).replace(" ago", "");
  else right = listDate(t.lastDate);
  return (
    <div
      className="row"
      role="option"
      aria-selected={selected}
      data-selected={selected}
      data-focused={focused}
      data-checked={checked}
      data-unread={unread}
      style={{ transform: `translateY(${top}px)` }}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey) onCheck(e.shiftKey);
        else onOpen();
      }}
      title={`${t.subject}\n${LANE_WORDS[t.nudged ? "nudged" : t.lane]}`}
    >
      <div className="row-lead">
        <StatusGlyph lane={t.lane} nudged={t.nudged} />
        <button className="checkbox" role="checkbox" aria-checked={checked} aria-label="Select thread" onClick={(e) => { e.stopPropagation(); onCheck(e.shiftKey); }}>
          {checked ? <svg width="10" height="10" viewBox="0 0 10 10"><path d="M1.5 5.2l2.2 2.2 4.8-5" stroke="currentColor" strokeWidth="1.8" fill="none" strokeLinecap="round" /></svg> : null}
        </button>
      </div>
      <div className="row-main">
        <div className="row-top">
          {t.pinned ? <Pin size={12} style={{ flex: "none", color: "var(--accent-text)" }} aria-label="Pinned" /> : null}
          <span className="row-from">{senders}</span>
          {t.messageCount > 1 ? <span className="row-n count">{t.messageCount}</span> : null}
        </div>
        <div className="row-subject">
          <span className="row-subject-text">{t.subject}</span>
          <span className="row-snippet"> {t.nudged ? "No reply yet. " : ""}{t.snippet}</span>
        </div>
      </div>
      <div className="row-meta">
        <span className="row-date">{right}</span>
        <span className="row-icons">
          {t.starred ? <Star size={12} fill="var(--needs-fg)" color="var(--needs-fg)" aria-label="Starred" /> : null}
          {t.hasAttachments ? <Paperclip size={12} aria-label="Has attachments" /> : null}
          {t.audienceSize >= 10 ? <span className="badge" title={`${t.audienceSize} people on this thread`}><Users size={10} /> {t.audienceSize}</span> : null}
        </span>
      </div>
      <div className="row-actions" onClick={(e) => e.stopPropagation()}>
        {t.inInbox ? <button className="icon-btn icon-btn-sm" title="Archive (e)" aria-label="Archive" onClick={() => onAction({ type: "archive" })}><Archive size={14} /></button> : null}
        <button className="icon-btn icon-btn-sm" title={unread ? "Mark read" : "Mark unread"} aria-label={unread ? "Mark read" : "Mark unread"} onClick={() => onAction(unread ? { type: "read" } : { type: "unread" })}>{unread ? <MailOpen size={14} /> : <Mail size={14} />}</button>
        <button className="icon-btn icon-btn-sm" title={t.pinned ? "Unpin" : "Pin to top"} aria-label={t.pinned ? "Unpin" : "Pin"} onClick={() => onAction(t.pinned ? { type: "unpin" } : { type: "pin" })}><Pin size={14} /></button>
        <button className="icon-btn icon-btn-sm" title="Move to trash (#)" aria-label="Move to trash" onClick={() => onAction({ type: "trash" })}><Trash2 size={14} /></button>
      </div>
    </div>
  );
}
