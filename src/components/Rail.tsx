import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, ListChecks, RefreshCw, Sparkles, X } from "lucide-react";
import { api, ApiError } from "../api";
import { useAccount, useConfig, useThread } from "../hooks";
import { jumpToMessage, openComposer, setUi, toast, useUi } from "../store";
import { Avatar, StatusGlyph } from "./bits";
import { ago, bytes, dayLabel, ext } from "../lib/format";
import type { Message, Plan, PlanStep, Thread, ThreadBrief } from "../../shared/types";

/** Render text with [#n] citations as buttons that jump to message n. */
function Cited({ text, thread }: { text: string; thread: Thread }) {
  const parts = text.split(/(\[#\d+(?:\s*,\s*#?\d+)*\])/g);
  return (
    <>
      {parts.map((p, i) => {
        const m = p.match(/^\[(#\d+(?:\s*,\s*#?\d+)*)\]$/);
        if (!m) return <span key={i}>{p}</span>;
        const nums = m[1].split(/\s*,\s*/).map((x) => Number(x.replace("#", "")));
        return (
          <span key={i}>
            {nums.map((n) => {
              const msg = thread.messages[n - 1];
              return (
                <button key={n} className="cite" title={msg ? `${msg.from.name}, ${new Date(msg.date).toLocaleString()}` : `Message ${n}`} onClick={() => msg && jumpToMessage(msg.id)} disabled={!msg}>
                  {n}
                </button>
              );
            })}
          </span>
        );
      })}
    </>
  );
}

export function Rail() {
  const account = useAccount();
  const aid = account?.id ?? null;
  const tid = useUi((s) => s.openThreadId);
  const thread = useThread(aid, tid).data;
  if (!tid || !thread || !aid) {
    return (
      <aside className="rail" aria-label="Thread details">
        <div className="rail-scroll" />
      </aside>
    );
  }
  return (
    <aside className="rail" aria-label="Thread details">
      <div className="rail-scroll" key={thread.id}>
        <BriefSection aid={aid} thread={thread} />
        {thread.messages.length > 2 ? <ChartSection thread={thread} me={account?.email ?? ""} /> : null}
        {thread.messages.length > 2 ? <PeopleSection thread={thread} me={account?.email ?? ""} /> : null}
        <FilesSection thread={thread} />
      </div>
    </aside>
  );
}

function BriefSection({ aid, thread }: { aid: string; thread: Thread }) {
  const cfg = useConfig().data;
  const ai = !!cfg?.ai;
  const qc = useQueryClient();
  const basis = `${thread.summary.messageCount}:${thread.summary.lastDate}`;
  const auto = !ai || thread.messages.length >= 3 || thread.summary.lane === "needs";
  const brief = useQuery({
    queryKey: ["brief", aid, thread.id, basis],
    queryFn: async (): Promise<ThreadBrief | null> => {
      const cached = await api.brief(aid, thread.id);
      if (cached || !ai || !auto) return cached;
      return api.makeBrief(aid, thread.id);
    },
    staleTime: Infinity,
    retry: false,
  });
  const [making, setMaking] = useState(false);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [done, setDone] = useState<Set<number>>(new Set());
  const b = brief.data;

  useEffect(() => {
    setUi({ askMsgs: b ? b.asks.map((a) => a.messageId).filter(Boolean) : [] });
  }, [b]);

  useEffect(() => {
    const h = () => void makePlan();
    const c = () => void regenerate();
    window.addEventListener("tp:plan", h);
    window.addEventListener("tp:brief", c);
    return () => { window.removeEventListener("tp:plan", h); window.removeEventListener("tp:brief", c); };
  });

  const regenerate = async () => {
    setMaking(true);
    try {
      const nb = await api.makeBrief(aid, thread.id);
      qc.setQueryData(["brief", aid, thread.id, basis], nb);
    } catch (err) {
      toast({ text: err instanceof ApiError ? err.message : "The assistant couldn't summarize this thread.", tone: "error" });
    } finally {
      setMaking(false);
    }
  };

  const makePlan = async () => {
    setPlanning(true);
    try {
      setPlan(await api.plan(aid, thread.id));
    } catch (err) {
      toast({ text: err instanceof ApiError ? err.message : "Couldn't make a plan.", tone: "error" });
    } finally {
      setPlanning(false);
    }
  };

  const setStep = (id: string, patch: Partial<PlanStep>) => setPlan((p) => (p ? { ...p, steps: p.steps.map((s) => (s.id === id ? { ...s, ...patch } : s)) } : p));

  const runStep = async (step: PlanStep) => {
    if (step.kind === "reply") {
      setStep(step.id, { state: "done", result: "Draft opened in the composer. Review it before sending." });
      const last = [...thread.messages].reverse().find((m) => !m.fromMe) ?? thread.messages[thread.messages.length - 1];
      openComposer({ mode: thread.summary.audienceSize > 2 ? "replyAll" : "reply", accountId: aid, threadId: thread.id, messageId: last.id, notes: step.params.notes ?? "", autoDraft: true });
      return;
    }
    setStep(step.id, { state: "running" });
    try {
      const r = await api.runStep(aid, thread.id, step.kind, step.params);
      if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
      setStep(step.id, { state: "done", result: r.result });
      void qc.invalidateQueries({ queryKey: ["threads", aid] });
      void qc.invalidateQueries({ queryKey: ["counts", aid] });
      void qc.invalidateQueries({ queryKey: ["thread", aid, thread.id] });
    } catch (err) {
      setStep(step.id, { state: "failed", result: err instanceof Error ? err.message : "Failed" });
    }
  };

  const approve = (step: PlanStep) => {
    setStep(step.id, { state: "approved" });
    void runStep(step);
  };

  const lastMine = [...thread.messages].reverse().find((m) => m.fromMe);

  return (
    <section className="rail-section" aria-label="Brief">
      <h2 className="rail-title">
        <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>{ai ? <Sparkles size={12} /> : null} Brief</span>
        {b ? (
          <button className="icon-btn icon-btn-sm" title={ai ? "Regenerate (i)" : "Refresh"} aria-label="Regenerate brief" onClick={() => void regenerate()} disabled={making}>
            <RefreshCw size={13} className={making ? "glyph-working" : undefined} />
          </button>
        ) : null}
      </h2>
      {brief.isLoading || making ? (
        <div className="brief" aria-busy="true">
          <div className="brief-source"><StatusGlyph lane="needs" working /> Reading {thread.messages.length} messages…</div>
          <div className="skeleton" style={{ width: "92%" }} />
          <div className="skeleton" style={{ width: "80%" }} />
          <div className="skeleton" style={{ width: "64%" }} />
        </div>
      ) : b ? (
        <div className="brief">
          <p><Cited text={b.summary} thread={thread} /></p>
          {b.sinceYou ? <p className="since"><strong>Since your last reply{lastMine ? ` (${ago(lastMine.date)})` : ""}:</strong> <Cited text={b.sinceYou} thread={thread} /></p> : null}
          {b.asks.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <strong style={{ fontSize: 12, color: "var(--needs-text)" }}>{b.asks.length} open {b.asks.length === 1 ? "ask" : "asks"} for you</strong>
              <ul className="asks">
                {b.asks.map((a, i) => (
                  <li key={i} className="ask" data-done={done.has(i)}>
                    <button className="checkbox" role="checkbox" aria-checked={done.has(i)} aria-label="Mark handled" onClick={() => setDone((d) => { const n = new Set(d); if (n.has(i)) n.delete(i); else n.add(i); return n; })} style={{ marginTop: 2 }}>
                      {done.has(i) ? <Check size={10} /> : null}
                    </button>
                    <div>
                      <div className="ask-text">{a.text}</div>
                      <div className="ask-meta">
                        <span>{a.from}</span>
                        {a.due ? <span className="ask-due">due {a.due}</span> : null}
                        {a.messageId ? <button className="cite" onClick={() => jumpToMessage(a.messageId)}>{thread.messages.findIndex((m) => m.id === a.messageId) + 1}</button> : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
          {b.decisions.length ? (
            <div>
              <strong style={{ fontSize: 12 }}>Decided</strong>
              <ul className="decisions">{b.decisions.map((d, i) => <li key={i}><Cited text={d} thread={thread} /></li>)}</ul>
            </div>
          ) : null}
          {b.nextStep ? <div className="next-step"><Cited text={b.nextStep} thread={thread} /></div> : null}
          <div className="brief-source">
            {b.source === "ai" ? `Written by the assistant from ${thread.messages.length} messages` : "Basic summary. Add an Anthropic API key for full briefs."}
          </div>
        </div>
      ) : (
        <div className="brief">
          <p style={{ color: "var(--text-secondary)" }}>Get a summary of where this thread stands and what's being asked of you.</p>
          <div><button className="btn btn-sm" onClick={() => void regenerate()}><Sparkles size={13} /> Catch me up <kbd>i</kbd></button></div>
        </div>
      )}

      {plan ? (
        <div className="plan" aria-label="Plan">
          <div className="plan-head">
            <strong>Plan: nothing runs until you approve it</strong>
            <div style={{ display: "flex", gap: 4 }}>
              {plan.steps.some((s) => s.state === "pending") ? <button className="btn btn-sm" onClick={() => plan.steps.filter((s) => s.state === "pending").forEach(approve)}>Approve all</button> : null}
              <button className="icon-btn icon-btn-sm" aria-label="Close plan" onClick={() => setPlan(null)}><X size={13} /></button>
            </div>
          </div>
          {plan.rationale ? <div className="plan-rationale"><Cited text={plan.rationale} thread={thread} /></div> : null}
          {plan.steps.map((s, i) => (
            <div className="plan-step" key={s.id} data-state={s.state}>
              <span className="plan-num">{i + 1}</span>
              <div>
                <div className="plan-step-title">{s.title}</div>
                <div className="plan-step-detail">{s.detail}</div>
                <div className="plan-step-actions">
                  {s.state === "pending" ? (
                    <>
                      <button className="btn btn-primary btn-sm" onClick={() => approve(s)}>{s.kind === "reply" ? "Draft it" : "Approve"}</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => setStep(s.id, { state: "rejected" })}>Skip</button>
                    </>
                  ) : s.state === "running" || s.state === "approved" ? (
                    <span className="state-text state-running"><StatusGlyph lane="needs" working /> Running</span>
                  ) : s.state === "done" ? (
                    <span className="state-text state-done"><Check size={12} /> {s.result ?? "Done"}</span>
                  ) : s.state === "failed" ? (
                    <span className="state-text state-failed">{s.result ?? "Failed"}</span>
                  ) : (
                    <span className="state-text state-rejected">Skipped</span>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-sm" onClick={() => void makePlan()} disabled={planning} title="Propose next steps you approve one by one (/)">
            {planning ? <span className="spinner" /> : <ListChecks size={13} />} Plan next steps
          </button>
          {!thread.summary.isBulk && b?.asks.length ? (
            <button className="btn btn-sm btn-ghost" title="Start a reply with one line per ask" onClick={() => {
              const last = [...thread.messages].reverse().find((m) => !m.fromMe) ?? thread.messages[thread.messages.length - 1];
              openComposer({ mode: thread.summary.audienceSize > 2 ? "replyAll" : "reply", accountId: aid, threadId: thread.id, messageId: last.id, notes: b.asks.map((a) => `${a.text.replace(/\?$/, "")}: `).join("\n"), autoDraft: false });
            }}>Answer the asks</button>
          ) : null}
          {!thread.summary.isBulk && thread.summary.lastFromMe ? (
            <button className="btn btn-sm btn-ghost" title="Nudge the people you're waiting on" onClick={() => {
              const last = thread.messages[thread.messages.length - 1];
              openComposer({ mode: last.to.length + last.cc.length > 1 ? "replyAll" : "reply", accountId: aid, threadId: thread.id, messageId: last.id, notes: "Following up on my note below. Any update?", autoDraft: false });
            }}>Write a follow-up</button>
          ) : null}
        </div>
      )}
    </section>
  );
}

function ChartSection({ thread, me }: { thread: Thread; me: string }) {
  const visible = useUi((s) => s.visibleMsgs);
  const askMsgs = useUi((s) => s.askMsgs);
  const filterPeople = useUi((s) => s.filterPeople);
  const days = useMemo(() => {
    const groups: { key: string; label: string; msgs: { m: Message; i: number }[]; gapBefore: number }[] = [];
    let prevDate: number | null = null;
    thread.messages.forEach((m, i) => {
      const d = new Date(m.date);
      const key = `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.msgs.push({ m, i });
      else {
        const dayStart = new Date(d).setHours(0, 0, 0, 0);
        const gap = prevDate === null ? 0 : Math.round((dayStart - prevDate) / 86400000) - 1;
        groups.push({ key, label: dayLabel(m.date).replace(/^(\w{3}), /, ""), msgs: [{ m, i }], gapBefore: gap });
        prevDate = dayStart;
      }
    });
    return groups;
  }, [thread.messages]);
  const mineCount = thread.messages.filter((m) => m.fromMe).length;
  const busiest = days.reduce((a, d) => Math.max(a, d.msgs.length), 0);
  return (
    <section className="rail-section" aria-label="Thread chart">
      <h2 className="rail-title">
        <span>Thread chart</span>
        <span style={{ fontWeight: 400 }}>{days.length} {days.length === 1 ? "day" : "days"}{busiest >= 8 ? `, up to ${busiest} a day` : ""}</span>
      </h2>
      <div className="chart" role="list">
        {days.map((d) => (
          <div key={d.key} role="listitem">
            {d.gapBefore > 0 ? <div className="chart-gap">{d.gapBefore === 1 ? "1 quiet day" : `${d.gapBefore} quiet days`}</div> : null}
            <div className="chart-day">
              <span className="chart-label">{d.label}</span>
              <span className="chart-dots">
                {d.msgs.map(({ m, i }) => (
                  <button
                    key={m.id}
                    className="dot"
                    data-me={m.fromMe || m.from.email === me}
                    data-unread={m.unread}
                    data-ask={askMsgs.includes(m.id)}
                    data-visible={visible.includes(m.id)}
                    data-dim={filterPeople.length > 0 && !filterPeople.includes(m.from.email)}
                    title={`#${i + 1} ${m.fromMe ? "You" : m.from.name}, ${new Date(m.date).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })}\n${(m.uniqueText || m.snippet).replace(/\s+/g, " ").slice(0, 120)}`}
                    aria-label={`Message ${i + 1} from ${m.fromMe ? "you" : m.from.name}`}
                    onClick={() => jumpToMessage(m.id)}
                  />
                ))}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="chart-legend">
        <span className="legend-item"><span className="dot" data-me="true" /> You ({mineCount})</span>
        <span className="legend-item"><span className="dot" data-unread="true" /> Unread</span>
        <span className="legend-item"><span className="dot" data-ask="true" /> Asks you</span>
        <span className="legend-item"><span className="dot" data-visible="true" /> On screen</span>
      </div>
    </section>
  );
}

function PeopleSection({ thread, me }: { thread: Thread; me: string }) {
  const filterPeople = useUi((s) => s.filterPeople);
  const people = useMemo(() => {
    const map = new Map<string, { name: string; email: string; n: number; last: string }>();
    for (const m of thread.messages) {
      const e = map.get(m.from.email) ?? { name: m.from.name, email: m.from.email, n: 0, last: m.date };
      e.n++;
      e.last = m.date;
      map.set(m.from.email, e);
    }
    return [...map.values()].sort((a, b) => b.n - a.n);
  }, [thread.messages]);
  const silent = thread.summary.audienceSize - people.length;
  const shown = people.slice(0, 12);
  return (
    <section className="rail-section" aria-label="People">
      <h2 className="rail-title"><span>People</span><span style={{ fontWeight: 400 }}>{people.length} wrote{silent > 0 ? `, ${silent} only read` : ""}</span></h2>
      <div className="people">
        {shown.map((p) => (
          <button key={p.email} className="person" aria-pressed={filterPeople.includes(p.email)} title={`Show only messages from ${p.name}`} onClick={() => setUi((s) => ({ filterPeople: s.filterPeople.includes(p.email) ? s.filterPeople.filter((x) => x !== p.email) : [...s.filterPeople, p.email] }))}>
            <Avatar person={p} size="sm" />
            <span className="person-name">{p.email === me ? "You" : p.name}</span>
            <span className="person-n">{p.n}</span>
          </button>
        ))}
        {people.length > shown.length ? <span style={{ fontSize: 12, color: "var(--text-tertiary)", padding: "4px" }}>+{people.length - shown.length} more</span> : null}
      </div>
    </section>
  );
}

function FilesSection({ thread }: { thread: Thread }) {
  const files = thread.messages.flatMap((m) => m.attachments.filter((a) => !a.inline).map((a) => ({ a, m })));
  const pending = thread.messages.some((m) => !m.bodyLoaded) && thread.summary.hasAttachments;
  if (!files.length && !pending) return null;
  // Newest version of each filename first.
  const seen = new Set<string>();
  const uniq = [...files].reverse().filter(({ a }) => (seen.has(a.filename) ? false : (seen.add(a.filename), true)));
  return (
    <section className="rail-section" aria-label="Files">
      <h2 className="rail-title"><span>Files</span><span style={{ fontWeight: 400 }}>{uniq.length}</span></h2>
      <div className="files">
        {uniq.map(({ a, m }) => (
          <a key={`${m.id}-${a.id}`} className="file-row" href={api.attachmentUrl(m.accountId, m.id, a.id)} download={a.filename}>
            <span className="att-ext">{ext(a.filename)}</span>
            <span className="file-meta">
              <span className="att-name">{a.filename}</span>
              <span className="att-size">{bytes(a.size)}, {m.fromMe ? "you" : m.from.name.split(" ")[0]}, {ago(m.date)}</span>
            </span>
          </a>
        ))}
        {pending ? <span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>Expand all (;) to list files from collapsed messages.</span> : null}
      </div>
    </section>
  );
}
