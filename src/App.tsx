// Tidepost: example data only. Nothing in this file talks to a mail server.
import { useState, useEffect, useRef } from "react";
import type { KeyboardEvent, ChangeEvent, CSSProperties } from "react";
import { Page, Section, Table, Callout, LinkCards, Steps, Segmented, Button, useGrokTheme } from "./kit";

type Status = "needs" | "working" | "done" | "idle";
type Shelf = "pinned" | "active" | "snoozed" | "settled";
type Mode = "ask" | "plan" | "draft";
type StepKind = "draft" | "calendar" | "file" | "label" | "nudge";
type StepState = "pending" | "approved" | "rejected" | "done";
type Decision = "accept" | "reject";
type Filter = "all" | Status;

interface Msg { from: string; when: string; paras: string[] }
interface Turn { role: "you" | "agent"; text: string; quotes: string[]; acts: string[] }
interface PlanStep { id: string; kind: StepKind; title: string; detail: string; result: string; state: StepState }
interface Checkpoint { id: number; label: string; variant: string; decisions: Record<number, Decision> }
interface Draft { to: string; base: string[]; variants: Record<string, string[]>; variant: string; decisions: Record<number, Decision>; send: "idle" | "confirm" | "sent"; checkpoints: Checkpoint[] }
interface Thread { id: string; space: string; from: string; subject: string; when: string; status: Status; shelf: Shelf; summary: string; asks: string[]; answered: boolean[]; msgs: Msg[]; turns: Turn[]; live: string[]; plan: PlanStep[] | null; draft: Draft | null; queue: string[] }
interface Seed { id: string; space: string; from: string; subject: string; when: string; status: Status; shelf: Shelf; summary: string; asks?: string[]; msgs?: Msg[]; turns?: Turn[] }
interface Run { id: string; title: string; scope: string; total: number; done: number; state: "running" | "review" | "applied" | "dismissed"; current: string; names: string[]; labels: string[]; counts: number[] }
type Seg = { kind: "same"; lines: string[] } | { kind: "change"; id: number; del: string[]; add: string[] };

const FRAMES = ["◐", "◓", "◑", "◒"];
const SPACES = ["Home renovation", "Hiring", "Money", "Personal", "Newsletters"];
const NEWS = ["Morning Ledger", "Byte Sized", "Trail Mix Weekly", "Kernel Notes", "Design Drip", "Market Murmur", "Garden Gazette", "Late Commit", "Pixel Post", "City Eats"];
const COMMANDS = [
  { cmd: "/summarize", hint: "Summarize the thread and list its asks" },
  { cmd: "/plan", hint: "Propose next steps; nothing runs until you approve" },
  { cmd: "/draft", hint: "Edit your rough reply into a draft you review as a diff" },
  { cmd: "/schedule", hint: "Find a slot and hold it (tentative, local)" },
  { cmd: "/followup", hint: "Draft a nudge and set a reminder" },
  { cmd: "/triage", hint: "Label, file attachments, pin until answered" },
  { cmd: "/undo", hint: "Restore the previous draft checkpoint" },
];
const MENTIONS = ["@Priya Nair", "@Arjun Mehta", "@Dana Okafor", "@Sam Rivera", "@quote_v2.pdf", "@calendar", "@Home renovation"];

function mk(p: Seed): Thread {
  const asks = p.asks ?? [];
  return { id: p.id, space: p.space, from: p.from, subject: p.subject, when: p.when, status: p.status, shelf: p.shelf, summary: p.summary, asks, answered: asks.map(() => false), msgs: p.msgs ?? [], turns: p.turns ?? [], live: [], plan: null, draft: null, queue: [] };
}

// All people, threads, amounts and companies below are made-up example data.
function seed(): Thread[] {
  return [
    mk({ id: "t1", space: "Home renovation", from: "Priya Nair", subject: "Revised kitchen quote, site visit, tile finish", when: "10:12", status: "needs", shelf: "pinned",
      summary: "Priya sent a revised quote (₹4.2L, up ₹30k for an extra cabinet run) and needs three answers before ordering materials this week.",
      asks: ["Approve the revised quote (₹4.2L)", "Pick the site visit: Thu 11:00 or Fri 16:00", "Choose the backsplash: matte or gloss"],
      msgs: [{ from: "Priya Nair", when: "Today 10:12", paras: [
        "Hi! Attached is the revised quote (quote_v2.pdf). It comes to ₹4.2L, up from ₹3.9L because of the extra cabinet run on the window wall.",
        "Could you confirm you're okay with the revision so we can order materials this week?",
        "Our supervisor can do the site visit Thursday 11:00 or Friday 16:00. Which suits you?",
        "Last thing: for the backsplash, matte or gloss tiles? Matte hides water spots, gloss is easier to wipe.",
      ] }],
      turns: [{ role: "agent", text: "New mail from Priya with 3 asks. Cite the questions and answer them in one go, or type /plan.", quotes: [], acts: ["Read 1 message from Priya Nair", "Extracted 3 asks", "Found attachment quote_v2.pdf"] }] }),
    mk({ id: "t2", space: "Home renovation", from: "Leak Free Plumbing", subject: "Invoice #2231 paid", when: "Mon", status: "done", shelf: "active",
      summary: "Receipt for ₹6,800. Already filed to Home renovation/Receipts.",
      msgs: [{ from: "Leak Free Plumbing", when: "Mon 16:40", paras: ["Thanks for your payment of ₹6,800 for invoice #2231. Receipt attached."] }] }),
    mk({ id: "t3", space: "Hiring", from: "Arjun Mehta", subject: "Backend role: next round", when: "09:05", status: "idle", shelf: "active",
      summary: "Arjun wants availability for a 45-minute technical round and your notice period.",
      asks: ["Share availability for a 45-min technical round", "Confirm notice period"],
      msgs: [{ from: "Arjun Mehta", when: "Today 09:05", paras: ["Great speaking yesterday. The team would like a 45-minute technical round next week.", "Could you share two or three slots that work, and confirm your notice period?"] }] }),
    mk({ id: "t4", space: "Hiring", from: "Dana Okafor", subject: "Panel feedback due Wed", when: "Yesterday", status: "needs", shelf: "active",
      summary: "Dana needs your written feedback and a hire or no-hire call on candidate R. Iyer by Wednesday.",
      asks: ["Submit written feedback on R. Iyer", "Give a hire / no-hire call"],
      msgs: [{ from: "Dana Okafor", when: "Yesterday 18:20", paras: ["Thanks for sitting on the panel for R. Iyer.", "Please send written feedback and your hire / no-hire call by Wednesday so we can close the loop."] }] }),
    mk({ id: "t5", space: "Money", from: "Northbank", subject: "Your October card statement", when: "Sun", status: "done", shelf: "active",
      summary: "Statement total ₹42,310, due 28 Nov. Autopay is on.",
      msgs: [{ from: "Northbank", when: "Sun 07:00", paras: ["Your October statement is ready. Total due ₹42,310 by 28 Nov. Autopay is enabled."] }] }),
    mk({ id: "t6", space: "Money", from: "Example Health Co.", subject: "Policy renewal documents", when: "Fri", status: "idle", shelf: "snoozed",
      summary: "Renewal pack for next year's health policy. Snoozed until Monday.",
      msgs: [{ from: "Example Health Co.", when: "Fri 12:30", paras: ["Your renewal documents are attached. Renew before 1 Dec to keep your no-claim bonus."] }] }),
    mk({ id: "t7", space: "Personal", from: "Sam Rivera", subject: "Weekend hike?", when: "Thu", status: "done", shelf: "settled",
      summary: "Agreed: Saturday 6:30 pickup. Settled.",
      msgs: [{ from: "Sam Rivera", when: "Thu 21:10", paras: ["Saturday 6:30 pickup works. See you then!"] }] }),
  ];
}

function makeDraft(x: Thread): Draft {
  const first = x.from.split(" ")[0];
  let base: string[];
  let variants: Record<string, string[]>;
  if (x.id === "t1") {
    base = ["Hi Priya,", "ok on the quote i guess", "thu works", "matte", "Thanks!"];
    variants = {
      Brief: ["Hi Priya,", "The revised quote of ₹4.2L is approved.", "Thursday 11:00 works for the site visit.", "Matte tiles for the backsplash, please.", "Thanks!"],
      Warm: ["Hi Priya,", "Thanks for turning the revision around so quickly. The revised quote of ₹4.2L is approved.", "Thursday 11:00 works for the site visit; I'll be home all morning.", "Matte tiles for the backsplash, please.", "Thanks!"],
      Firm: ["Hi Priya,", "Approved at ₹4.2L, provided the three-week timeline holds.", "Thursday 11:00 for the site visit.", "Matte tiles for the backsplash, please.", "Please confirm the start date in writing.", "Thanks!"],
    };
  } else if (x.id === "t3") {
    base = ["Hi Arjun,", "free tue/wed afternoons", "notice 60 days", "Best,"];
    variants = {
      Brief: ["Hi Arjun,", "Tuesday or Wednesday, 14:00–17:00, both work for the technical round.", "My notice period is 60 days.", "Best,"],
      Warm: ["Hi Arjun,", "Thanks, I enjoyed the conversation too. Tuesday or Wednesday afternoon (14:00–17:00) works well.", "My notice period is 60 days.", "Best,"],
      Firm: ["Hi Arjun,", "Tuesday 15:00 or Wednesday 14:00 work for the technical round.", "My notice period is 60 days, negotiable to 45.", "Best,"],
    };
  } else {
    base = [`Hi ${first},`, "thanks will reply properly soon", "Best,"];
    const ask = x.asks[0] ? x.asks[0].toLowerCase() : "this";
    variants = {
      Brief: [`Hi ${first},`, `Thanks. I'll ${ask} by tomorrow.`, "Best,"],
      Warm: [`Hi ${first},`, `Thanks for the nudge. I'll ${ask} by tomorrow evening.`, "Best,"],
      Firm: [`Hi ${first},`, `Confirmed: I'll ${ask} by 18:00 tomorrow.`, "Best,"],
    };
  }
  return { to: x.from, base, variants, variant: "Brief", decisions: {}, send: "idle", checkpoints: [{ id: 1, label: "Assistant proposal", variant: "Brief", decisions: {} }] };
}

function diff(a: string[], b: string[]): Seg[] {
  const n = a.length; const m = b.length;
  const dp: number[][] = [];
  for (let i = 0; i <= n; i++) { dp.push(new Array<number>(m + 1).fill(0)); }
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const segs: Seg[] = []; let i = 0; let j = 0; let del: string[] = []; let add: string[] = []; let hid = 0;
  const flush = () => { if (del.length || add.length) { segs.push({ kind: "change", id: hid++, del, add }); del = []; add = []; } };
  while (i < n || j < m) {
    if (i < n && j < m && a[i] === b[j]) { flush(); segs.push({ kind: "same", lines: [a[i]] }); i++; j++; }
    else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) { add.push(b[j]); j++; }
    else { del.push(a[i]); i++; }
  }
  flush();
  return segs;
}

function finalLines(d: Draft): string[] {
  const out: string[] = [];
  diff(d.base, d.variants[d.variant]).forEach((s: Seg) => {
    if (s.kind === "same") out.push(...s.lines);
    else out.push(...(d.decisions[s.id] === "reject" ? s.del : s.add));
  });
  return out;
}

function statusOf(x: Thread): Status {
  if (x.plan && x.plan.some((s: PlanStep) => s.state === "approved")) return "working";
  if (x.plan && x.plan.some((s: PlanStep) => s.state === "pending")) return "needs";
  if (x.draft && x.draft.send !== "sent") return "needs";
  if (x.answered.some((a: boolean) => !a)) return "needs";
  return "done";
}

function planFor(cmd: string, x: Thread): PlanStep[] {
  const s = (kind: StepKind, title: string, detail: string, result: string, i: number): PlanStep => ({ id: `${x.id}-${x.turns.length}-${i}`, kind, title, detail, result, state: "pending" });
  if (cmd === "/schedule") return [
    s("calendar", "Hold Thu 11:00–12:00", "Tentative hold on your calendar only; no invite goes out.", "Held Thu 11:00–12:00 on your calendar (tentative, local only).", 0),
    s("draft", "Draft a reply proposing that slot", "Arrives as a draft you review as a diff.", "", 1),
  ];
  if (cmd === "/followup") return [
    s("nudge", "Remind me Fri 10:00 if no reply", "Reminder lives in Tidepost; nothing is sent.", "Reminder set for Fri 10:00.", 0),
    s("draft", "Draft a short follow-up", "You review and confirm before it sends.", "", 1),
  ];
  if (cmd === "/triage") return [
    s("label", `Label "${x.space}"`, "Keeps the thread in its space.", `Labelled "${x.space}".`, 0),
    s("file", "File attachments", `Saves attachments to ${x.space}/Files.`, `Filed attachments to ${x.space}/Files.`, 1),
    s("nudge", "Pin until every ask is answered", "Keeps it under Needs you.", "Pinned until answered.", 2),
  ];
  if (x.id === "t1") return [
    s("draft", "Draft one reply answering all 3 asks", "Quote approved, Thu 11:00 visit, matte tiles, built from your rough notes.", "", 0),
    s("calendar", "Hold Thu 11:00 for the site visit", "Tentative, local calendar only.", "Held Thu 11:00–12:00 for the site visit (tentative).", 1),
    s("file", "File quote_v2.pdf to Home renovation/Quotes", "Keeps the quote next to v1.", "Filed quote_v2.pdf to Home renovation/Quotes.", 2),
  ];
  return [
    s("draft", `Draft a reply covering ${Math.max(x.asks.length, 1)} ask${x.asks.length === 1 ? "" : "s"}`, "Arrives as a draft you review as a diff.", "", 0),
    s("nudge", "Remind me in 2 days if no reply", "Reminder only; nothing is sent.", "Reminder set for 2 days from now.", 1),
  ];
}

function actsFor(cmd: string, x: Thread): string[] {
  if (cmd === "/undo") return ["Looked up draft checkpoints"];
  const a = [`Read ${x.msgs.length} message${x.msgs.length === 1 ? "" : "s"} from ${x.from}`];
  if (x.asks.length) a.push(`Extracted ${x.asks.length} ask${x.asks.length === 1 ? "" : "s"}`);
  if (cmd === "/schedule" || (cmd === "/plan" && x.id === "t1")) a.push("Checked calendar Thu–Fri: Thu 11:00 free, Fri 16:00 clashes");
  if (x.id === "t1" && cmd !== "ask") a.push("Opened quote_v2.pdf (2 pages)");
  if (cmd === "/draft") a.push("Wrote edits on top of your rough reply");
  if (cmd.startsWith("/") && cmd !== "/summarize" && cmd !== "/draft") a.push("Prepared a plan for your approval");
  return a;
}

const later = (ms: number, f: () => void) => { window.setTimeout(f, ms); };

function advance(r: Run): Run {
  if (r.state !== "running") return r;
  const done = r.done + 1;
  return { ...r, done, current: r.names[done % r.names.length], state: done >= r.total ? "review" : "running" };
}

function newsRun(): Run {
  return { id: "news", title: "/triage 40 newsletters", scope: "Newsletters", total: 40, done: 0, state: "running", current: NEWS[0],
    names: NEWS.map((n: string, i: number) => `${n} #${210 + i}`), labels: ["archive", "digest", "need you"], counts: [29, 8, 3] };
}

function Tidepost() {
  const t = useGrokTheme();
  const [threads, setThreads] = useState<Thread[]>(seed);
  const [sel, setSel] = useState<string>("t1");
  const [filter, setFilter] = useState<Filter>("all");
  const [input, setInput] = useState<string>("");
  const [quotes, setQuotes] = useState<string[]>([]);
  const [mode, setMode] = useState<Mode>("plan");
  const [tick, setTick] = useState<number>(0);
  const [runs, setRuns] = useState<Run[]>([newsRun()]);
  const [openLog, setOpenLog] = useState<Record<string, boolean>>({});
  const [shelfOpen, setShelfOpen] = useState<Record<string, boolean>>({});
  const ref = useRef<Thread[]>(threads);
  ref.current = threads;
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    const h = window.setInterval(() => { setTick((x: number) => x + 1); setRuns((rs: Run[]) => rs.map(advance)); }, 240);
    return () => window.clearInterval(h);
  }, []);

  const upd = (id: string, f: (x: Thread) => Thread) => setThreads((ts: Thread[]) => ts.map((x: Thread) => (x.id === id ? f(x) : x)));
  const th = threads.find((x: Thread) => x.id === sel) ?? threads[0];

  const color = (s: Status): string => (s === "needs" ? t.text.warning : s === "working" ? t.text.accent : s === "done" ? t.text.success : t.text.tertiary);
  const glyph = (s: Status): string => (s === "needs" ? "?" : s === "working" ? FRAMES[tick % 4] : s === "done" ? "●" : "○");
  const word = (s: Status): string => (s === "needs" ? "Needs you" : s === "working" ? "Working" : s === "done" ? "Done" : "Idle");

  const runTurn = (id: string, text: string, qs: string[], m: Mode) => {
    const cur = ref.current.find((x: Thread) => x.id === id);
    if (!cur) return;
    const cmd = text.startsWith("/") ? text.split(/\s+/)[0] : m === "ask" ? "ask" : m === "draft" ? "/draft" : "/plan";
    upd(id, (x: Thread) => ({ ...x, status: "working", live: [], turns: [...x.turns, { role: "you", text, quotes: qs, acts: [] }] }));
    const acts = actsFor(cmd, cur);
    acts.forEach((a: string, i: number) => later(420 * (i + 1), () => upd(id, (x: Thread) => ({ ...x, live: [...x.live, a] }))));
    later(420 * (acts.length + 1), () => {
      upd(id, (x: Thread) => {
        let reply = "";
        let plan = x.plan;
        let draft = x.draft;
        const used = MENTIONS.filter((mm: string) => text.includes(mm));
        const pre = (used.length ? `Using ${used.join(", ")} as context. ` : "") + (qs.length ? `Answering ${qs.length} quoted point${qs.length === 1 ? "" : "s"}. ` : "");
        if (cmd === "ask") reply = `${x.summary} Ask mode is read-only, so nothing changed.`;
        else if (cmd === "/summarize") reply = `${x.summary}${x.asks.length ? " Open asks: " + x.asks.join("; ") + "." : ""}`;
        else if (cmd === "/draft") { draft = draft && draft.send !== "sent" ? draft : makeDraft(x); reply = "Edited your rough reply into a draft. Review the diff below; it only sends after you confirm."; }
        else if (cmd === "/undo") {
          if (draft && draft.checkpoints.length > 1) {
            const cps = draft.checkpoints.slice(0, -1);
            const cp = cps[cps.length - 1];
            draft = { ...draft, variant: cp.variant, decisions: { ...cp.decisions }, send: "idle", checkpoints: cps };
            reply = `Restored checkpoint "${cp.label}".`;
          } else reply = "Nothing to undo yet.";
        } else if (["/plan", "/schedule", "/followup", "/triage"].includes(cmd)) {
          plan = planFor(cmd, x);
          reply = `Proposed ${plan.length} steps. Approve the ones you want; nothing runs until you do.`;
        } else reply = `Unknown command ${cmd}. Try /plan.`;
        const nx: Thread = { ...x, live: [], plan, draft, turns: [...x.turns, { role: "agent", text: pre + reply, quotes: [], acts }] };
        return { ...nx, status: statusOf(nx) };
      });
      later(150, () => {
        const y = ref.current.find((x: Thread) => x.id === id);
        if (y && y.queue.length && y.status !== "working") {
          const next = y.queue[0];
          upd(id, (x: Thread) => ({ ...x, queue: x.queue.slice(1) }));
          runTurn(id, next, [], m);
        }
      });
    });
  };

  const send = () => {
    const text = input.trim();
    if (!text && !quotes.length) return;
    const body = text || "Answer the quoted points";
    if (th.status === "working") { upd(th.id, (x: Thread) => ({ ...x, queue: [...x.queue, body] })); setInput(""); return; }
    runTurn(th.id, body, quotes, mode);
    setInput(""); setQuotes([]);
  };

  const decide = (sid: string, ok: boolean) => {
    const id = th.id;
    upd(id, (x: Thread) => {
      const nx: Thread = { ...x, plan: x.plan ? x.plan.map((s: PlanStep) => (s.id === sid ? { ...s, state: ok ? "approved" : "rejected" } : s)) : null };
      return { ...nx, status: statusOf(nx) };
    });
    if (!ok) return;
    later(800, () => upd(id, (x: Thread) => {
      const step = x.plan ? x.plan.find((s: PlanStep) => s.id === sid) : undefined;
      if (!step || !x.plan) return x;
      let draft = x.draft;
      let note = step.result;
      if (step.kind === "draft") { draft = draft && draft.send !== "sent" ? draft : makeDraft(x); note = "Drafted a reply from your rough notes. Review it below; it will not send until you confirm."; }
      const nx: Thread = { ...x, draft, plan: x.plan.map((s: PlanStep) => (s.id === sid ? { ...s, state: "done" } : s)), turns: [...x.turns, { role: "agent", text: note, quotes: [], acts: [] }] };
      return { ...nx, status: statusOf(nx) };
    }));
  };

  const editDraft = (f: (d: Draft) => Draft) => upd(th.id, (x: Thread) => {
    if (!x.draft) return x;
    const nx: Thread = { ...x, draft: f(x.draft) };
    return { ...nx, status: statusOf(nx) };
  });
  const checkpoint = (d: Draft, label: string): Draft => ({ ...d, checkpoints: [...d.checkpoints, { id: d.checkpoints.length + 1, label, variant: d.variant, decisions: { ...d.decisions } }] });

  const confirmSend = () => upd(th.id, (x: Thread) => {
    if (!x.draft) return x;
    const lines = finalLines(x.draft);
    const nx: Thread = { ...x, draft: { ...x.draft, send: "sent" }, answered: x.asks.map(() => true),
      msgs: [...x.msgs, { from: "You", when: "Just now", paras: lines }],
      turns: [...x.turns, { role: "agent", text: `Sent to ${x.draft.to} after your confirm (simulated here: nothing leaves this page).`, quotes: [], acts: [] }] };
    return { ...nx, status: statusOf(nx) };
  });

  const setShelf = (s: Shelf) => upd(th.id, (x: Thread) => ({ ...x, shelf: s }));

  const applyRun = (r: Run) => {
    setRuns((rs: Run[]) => rs.map((q: Run) => (q.id === r.id ? { ...q, state: "applied" } : q)));
    const nt = r.id === "news"
      ? mk({ id: "t8", space: "Newsletters", from: "Tidepost triage", subject: "3 newsletters need you", when: "Now", status: "needs", shelf: "active",
          summary: "From 40 newsletters: two paid renewals and one reader-reply ask. 29 archived, 8 folded into tonight's digest.",
          asks: ["Renew Kernel Notes (₹499/yr)?", "Renew Design Drip (₹299/yr)?", "Answer Market Murmur's reader question?"],
          msgs: [{ from: "Tidepost triage", when: "Just now", paras: ["Kernel Notes: your paid plan renews 15 Nov at ₹499/yr.", "Design Drip: renewal at ₹299/yr unless you cancel.", "Market Murmur asked readers to reply with one tool they'd pay for."] }] })
      : mk({ id: "t9", space: "Hiring", from: "Tidepost follow-ups", subject: "4 follow-up nudges ready", when: "Now", status: "needs", shelf: "active",
          summary: "4 of 12 hiring threads have gone quiet for over 5 days. Nudges are drafted, none sent.",
          asks: ["Review the 4 drafted nudges"],
          msgs: [{ from: "Tidepost follow-ups", when: "Just now", paras: ["Quiet threads: Arjun Mehta, Lena Ortiz, Wei Zhang, Omar Haddad.", "Each has a short nudge drafted. Run /draft to review them as a diff."] }] });
    setThreads((ts: Thread[]) => (ts.some((x: Thread) => x.id === nt.id) ? ts : [...ts, nt]));
  };

  const startFollowups = () => {
    if (runs.some((r: Run) => r.id === "fu")) return;
    setRuns((rs: Run[]) => [...rs, { id: "fu", title: "/followup sweep", scope: "Hiring", total: 12, done: 0, state: "running", current: "Arjun Mehta",
      names: ["Arjun Mehta", "Lena Ortiz", "Wei Zhang", "Omar Haddad", "Rhea Kapoor", "Tom Becker"], labels: ["fine", "nudges drafted", "closed"], counts: [7, 4, 1] }]);
  };

  // visible order for j/k
  const live = threads.filter((x: Thread) => (x.shelf === "pinned" || x.shelf === "active") && (filter === "all" || x.status === filter));
  const order: Thread[] = [];
  SPACES.forEach((sp: string) => {
    live.filter((x: Thread) => x.space === sp && x.shelf === "pinned").forEach((x: Thread) => order.push(x));
    live.filter((x: Thread) => x.space === sp && x.shelf === "active").forEach((x: Thread) => order.push(x));
  });

  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const tag = (e.target as HTMLElement).tagName;
    if (tag === "TEXTAREA" || tag === "INPUT") return;
    const idx = order.findIndex((x: Thread) => x.id === sel);
    if (e.key === "j" && order.length) { setSel(order[Math.min(order.length - 1, idx + 1)].id); e.preventDefault(); }
    else if (e.key === "k" && order.length) { setSel(order[Math.max(0, idx - 1)].id); e.preventDefault(); }
    else if (e.key === "/") { e.preventDefault(); setInput("/"); taRef.current?.focus(); }
    else if (e.key === "e") { setShelf("settled"); e.preventDefault(); }
  };

  const tok = input.split(/\s/).pop() ?? "";
  const sugg = input.startsWith("/") && !input.includes(" ")
    ? COMMANDS.filter((c: { cmd: string; hint: string }) => c.cmd.startsWith(input)).map((c: { cmd: string; hint: string }) => ({ label: c.cmd, hint: c.hint, slash: true }))
    : tok.startsWith("@") ? MENTIONS.filter((mm: string) => mm.toLowerCase().startsWith(tok.toLowerCase())).map((mm: string) => ({ label: mm, hint: "add as context", slash: false })) : [];
  const pick = (label: string, slash: boolean) => { setInput(slash ? label + " " : input.slice(0, input.length - tok.length) + label + " "); taRef.current?.focus(); };

  // styles
  const small: CSSProperties = { ...t.font.caption, color: t.text.tertiary };
  const body: CSSProperties = { ...t.font.body2, color: t.text.primary };
  const card: CSSProperties = { border: `1px solid ${t.border.default}`, borderRadius: t.radius.lg, padding: 12, background: t.bg.base, display: "flex", flexDirection: "column", gap: 8 };
  const chip = (on?: boolean): CSSProperties => ({ ...t.font.caption, border: `1px solid ${on ? t.border.strong : t.border.default}`, borderRadius: t.radius.full, padding: "2px 10px", background: on ? t.fill.secondary : "transparent", color: t.text.primary, cursor: "pointer" });
  const mini: CSSProperties = { ...t.font.caption, border: `1px solid ${t.border.default}`, borderRadius: t.radius.sm, padding: "1px 8px", background: t.bg.base, color: t.text.secondary, cursor: "pointer" };
  const label: CSSProperties = { ...t.font.label, color: t.text.tertiary, textTransform: "uppercase", letterSpacing: "0.06em" };
  const row: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center" };

  const counts = (s: Status) => threads.filter((x: Thread) => x.status === s && x.shelf !== "settled").length;
  const threadRow = (x: Thread) => (
    <button key={x.id} onClick={() => setSel(x.id)} style={{ display: "flex", gap: 8, alignItems: "flex-start", textAlign: "left", width: "100%", padding: "6px 8px", borderRadius: t.radius.md, border: "none", cursor: "pointer", background: x.id === sel ? t.fill.secondary : "transparent", color: t.text.primary }}>
      <span style={{ ...t.font.body2, color: color(x.status), width: 14, flexShrink: 0, fontFamily: t.font.mono }}>{glyph(x.status)}</span>
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0, flex: 1 }}>
        <span style={{ ...t.font.body2, fontWeight: t.weight.medium, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.from}{x.shelf === "pinned" ? " · pinned" : ""}</span>
        <span style={{ ...small, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{x.subject}</span>
      </span>
      <span style={small}>{x.when}</span>
    </button>
  );

  const d = th.draft;
  const segs = d ? diff(d.base, d.variants[d.variant]) : [];
  const hunks = segs.filter((s: Seg) => s.kind === "change").length;
  const decided = d ? Object.keys(d.decisions).length : 0;

  return (
    <div tabIndex={0} onKeyDown={onKey} style={{ border: `1px solid ${t.border.default}`, borderRadius: t.radius.xl, overflow: "hidden", background: t.bg.base, fontFamily: t.font.family, outline: "none" }}>
      {/* top bar */}
      <div style={{ ...row, justifyContent: "space-between", padding: "10px 14px", borderBottom: `1px solid ${t.border.default}`, gap: 12 }}>
        <div style={row}>
          <span style={{ ...t.font.heading3, color: t.text.primary }}>Tidepost</span>
          <span style={small}>example data · nothing sends</span>
        </div>
        <Segmented<Filter> value={filter} onChange={(v: Filter) => setFilter(v)} options={[
          { value: "all", label: "All" },
          { value: "needs", label: "Needs you", count: counts("needs") },
          { value: "working", label: "Working", count: counts("working") },
          { value: "done", label: "Done", count: counts("done") },
        ]} />
        <span style={small}>j / k move · / commands · e settle</span>
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", alignItems: "stretch" }}>
        {/* sidebar */}
        <div style={{ flex: "1 1 220px", minWidth: 0, borderRight: `1px solid ${t.border.subtle}`, background: t.bg.subtle, padding: 10, display: "flex", flexDirection: "column", gap: 10 }}>
          {SPACES.map((sp: string) => {
            const items = order.filter((x: Thread) => x.space === sp);
            if (!items.length) return null;
            return (
              <div key={sp} style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                <div style={{ ...label, padding: "0 8px 2px" }}>{sp}</div>
                {items.map(threadRow)}
              </div>
            );
          })}
          {(["snoozed", "settled"] as Shelf[]).map((sh: Shelf) => {
            const items = threads.filter((x: Thread) => x.shelf === sh);
            if (!items.length) return null;
            return (
              <div key={sh} style={{ display: "flex", flexDirection: "column", gap: 2, borderTop: `1px solid ${t.border.subtle}`, paddingTop: 8 }}>
                <button onClick={() => setShelfOpen({ ...shelfOpen, [sh]: !shelfOpen[sh] })} style={{ ...label, background: "transparent", border: "none", textAlign: "left", cursor: "pointer", padding: "0 8px" }}>
                  {shelfOpen[sh] ? "▾" : "▸"} {sh} ({items.length})
                </button>
                {shelfOpen[sh] ? items.map(threadRow) : null}
              </div>
            );
          })}
        </div>

        {/* main */}
        <div style={{ flex: "3 1 440px", minWidth: 0, padding: 14, display: "flex", flexDirection: "column", gap: 12 }}>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <div style={{ ...row, justifyContent: "space-between" }}>
              <span style={{ ...t.font.heading3, color: t.text.primary }}>{th.subject}</span>
              <div style={row}>
                <span style={{ ...t.font.caption, color: color(th.status) }}>{glyph(th.status)} {word(th.status)}</span>
                <button style={mini} onClick={() => setShelf(th.shelf === "pinned" ? "active" : "pinned")}>{th.shelf === "pinned" ? "Unpin" : "Pin"}</button>
                <button style={mini} onClick={() => setShelf("snoozed")}>Snooze</button>
                <button style={mini} onClick={() => setShelf(th.shelf === "settled" ? "active" : "settled")}>{th.shelf === "settled" ? "Un-settle" : "Settle"}</button>
              </div>
            </div>
            <span style={small}>{th.from} · {th.space} · {th.shelf}</span>
          </div>

          <div style={{ ...card, background: t.bg.subtle }}>
            <span style={label}>Brief</span>
            <span style={body}>{th.summary}</span>
          </div>

          {th.msgs.map((m: Msg, mi: number) => (
            <div key={mi} style={card}>
              <span style={small}>{m.from} · {m.when}</span>
              {m.paras.map((p: string, pi: number) => (
                <div key={pi} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                  <span style={{ ...body, flex: 1 }}>{p}</span>
                  {m.from !== "You" ? (
                    <button style={{ ...mini, opacity: quotes.includes(p) ? 0.5 : 1 }} onClick={() => { if (!quotes.includes(p)) setQuotes([...quotes, p]); taRef.current?.focus(); }}>{quotes.includes(p) ? "Cited" : "Cite"}</button>
                  ) : null}
                </div>
              ))}
            </div>
          ))}

          {th.turns.map((u: Turn, ui: number) => {
            const key = `${th.id}-${ui}`;
            return (
              <div key={ui} style={{ display: "flex", flexDirection: "column", gap: 4, paddingLeft: 10, borderLeft: `2px solid ${u.role === "you" ? t.border.strong : t.dataviz.categorical[0]}` }}>
                <span style={small}>{u.role === "you" ? "You → assistant" : "Assistant"}</span>
                {u.quotes.map((q: string, qi: number) => (
                  <span key={qi} style={{ ...small, fontStyle: "italic" }}>“{q.length > 90 ? q.slice(0, 90) + "…" : q}”</span>
                ))}
                {u.acts.length ? (
                  <button onClick={() => setOpenLog({ ...openLog, [key]: !openLog[key] })} style={{ ...small, background: "transparent", border: "none", textAlign: "left", cursor: "pointer", padding: 0 }}>
                    {openLog[key] ? "▾" : "▸"} {u.acts.slice(0, 2).join(" · ")}{u.acts.length > 2 ? ` · +${u.acts.length - 2} more` : ""}
                  </button>
                ) : null}
                {openLog[key] ? u.acts.map((a: string, ai: number) => <span key={ai} style={{ ...small, fontFamily: t.font.mono, paddingLeft: 14 }}>✓ {a}</span>) : null}
                <span style={body}>{u.text}</span>
              </div>
            );
          })}

          {th.status === "working" && th.live.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 2, paddingLeft: 10, borderLeft: `2px solid ${t.dataviz.categorical[0]}` }}>
              {th.live.map((a: string, ai: number) => (
                <span key={ai} style={{ ...small, fontFamily: t.font.mono }}>{ai === th.live.length - 1 ? FRAMES[tick % 4] : "✓"} {a}</span>
              ))}
            </div>
          ) : null}

          {th.plan ? (
            <div style={card}>
              <div style={{ ...row, justifyContent: "space-between" }}>
                <span style={label}>Plan · {th.plan.length} steps · nothing runs until approved</span>
                {th.plan.some((s: PlanStep) => s.state === "pending") ? (
                  <button style={mini} onClick={() => (th.plan ?? []).filter((s: PlanStep) => s.state === "pending").forEach((s: PlanStep) => decide(s.id, true))}>Approve all</button>
                ) : null}
              </div>
              {th.plan.map((s: PlanStep, si: number) => (
                <div key={s.id} style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: "6px 0", borderTop: si ? `1px solid ${t.border.subtle}` : "none" }}>
                  <span style={{ ...small, fontFamily: t.font.mono, width: 18 }}>{si + 1}.</span>
                  <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 2 }}>
                    <span style={{ ...body, fontWeight: t.weight.medium, textDecoration: s.state === "rejected" ? "line-through" : "none" }}>{s.title}</span>
                    <span style={small}>{s.kind} · {s.detail}</span>
                  </div>
                  {s.state === "pending" ? (
                    <div style={row}>
                      <Button label="Approve" variant="primary" onClick={() => decide(s.id, true)} />
                      <Button label="Reject" onClick={() => decide(s.id, false)} />
                    </div>
                  ) : (
                    <span style={{ ...t.font.caption, color: s.state === "done" ? t.text.success : s.state === "rejected" ? t.text.danger : t.text.accent }}>
                      {s.state === "approved" ? `${FRAMES[tick % 4]} running` : s.state === "done" ? "✓ done" : "rejected"}
                    </span>
                  )}
                </div>
              ))}
            </div>
          ) : null}

          {d ? (
            <div style={card}>
              <div style={{ ...row, justifyContent: "space-between" }}>
                <span style={label}>Draft to {d.to} · review edits</span>
                {d.send !== "sent" ? (
                  <Segmented<string> value={d.variant} options={Object.keys(d.variants)} onChange={(v: string) => editDraft((x: Draft) => checkpoint({ ...x, variant: v, decisions: {}, send: "idle" }, `Switched to ${v}`))} />
                ) : null}
              </div>
              <span style={small}>Three variants were drafted in parallel; pick one. − is your rough note, + is the assistant's edit. Keep or reject each edit.</span>
              <div style={{ border: `1px solid ${t.border.subtle}`, borderRadius: t.radius.md, overflow: "hidden" }}>
                {segs.map((s: Seg, i: number) => s.kind === "same" ? (
                  <div key={i} style={{ ...t.font.code, fontFamily: t.font.mono, color: t.text.secondary, padding: "3px 10px" }}>  {s.lines[0]}</div>
                ) : (
                  <div key={i} style={{ borderTop: `1px solid ${t.border.subtle}`, borderBottom: `1px solid ${t.border.subtle}` }}>
                    {s.del.map((l: string, li: number) => (
                      <div key={`d${li}`} style={{ ...t.font.code, fontFamily: t.font.mono, padding: "3px 10px", background: t.fill.dangerSubtle, color: t.text.primary, opacity: d.decisions[s.id] === "accept" ? 0.45 : 1 }}>− {l}</div>
                    ))}
                    {s.add.map((l: string, li: number) => (
                      <div key={`a${li}`} style={{ ...t.font.code, fontFamily: t.font.mono, padding: "3px 10px", background: t.fill.successSubtle, color: t.text.primary, opacity: d.decisions[s.id] === "reject" ? 0.45 : 1 }}>+ {l}</div>
                    ))}
                    {d.send !== "sent" ? (
                      <div style={{ ...row, padding: "4px 10px", justifyContent: "flex-end" }}>
                        <span style={small}>{d.decisions[s.id] === "accept" ? "kept edit" : d.decisions[s.id] === "reject" ? "kept your words" : "undecided"}</span>
                        <button style={mini} onClick={() => editDraft((x: Draft) => checkpoint({ ...x, decisions: { ...x.decisions, [s.id]: "accept" } }, `Kept edit ${s.id + 1}`))}>Keep edit</button>
                        <button style={mini} onClick={() => editDraft((x: Draft) => checkpoint({ ...x, decisions: { ...x.decisions, [s.id]: "reject" } }, `Rejected edit ${s.id + 1}`))}>Reject</button>
                      </div>
                    ) : null}
                  </div>
                ))}
              </div>
              <div style={{ ...row, gap: 4 }}>
                <span style={small}>Checkpoints:</span>
                {d.checkpoints.map((c: Checkpoint) => (
                  <button key={c.id} style={chip(false)} disabled={d.send === "sent"} onClick={() => editDraft((x: Draft) => ({ ...x, variant: c.variant, decisions: { ...c.decisions }, send: "idle", checkpoints: x.checkpoints.filter((q: Checkpoint) => q.id <= c.id) }))}>↺ {c.id}. {c.label}</button>
                ))}
              </div>
              {d.send === "idle" ? (
                <div style={row}>
                  <Button label="Keep all edits" onClick={() => editDraft((x: Draft) => { const all: Record<number, Decision> = {}; diff(x.base, x.variants[x.variant]).forEach((s: Seg) => { if (s.kind === "change") all[s.id] = "accept"; }); return checkpoint({ ...x, decisions: all }, "Kept all edits"); })} />
                  <Button label="Approve & send…" variant="primary" disabled={decided < hunks} onClick={() => editDraft((x: Draft) => ({ ...x, send: "confirm" }))} />
                  <span style={small}>{decided < hunks ? `${hunks - decided} edit${hunks - decided === 1 ? "" : "s"} still undecided` : "All edits reviewed"}</span>
                </div>
              ) : null}
              {d.send === "confirm" ? (
                <div style={{ ...card, background: t.bg.subtle }}>
                  <span style={body}>Send this to {d.to}? This confirm is the only way mail leaves Tidepost.</span>
                  {finalLines(d).map((l: string, li: number) => <span key={li} style={body}>{l}</span>)}
                  <div style={row}>
                    <Button label="Confirm send" variant="primary" onClick={confirmSend} />
                    <Button label="Back to review" onClick={() => editDraft((x: Draft) => ({ ...x, send: "idle" }))} />
                  </div>
                </div>
              ) : null}
              {d.send === "sent" ? <span style={{ ...t.font.caption, color: t.text.success }}>✓ Sent (simulated; nothing left this page)</span> : null}
            </div>
          ) : null}

          {/* composer */}
          <div style={{ ...card, gap: 6, position: "relative" }}>
            {quotes.length ? (
              <div style={row}>
                {quotes.map((q: string, qi: number) => (
                  <span key={qi} style={chip(true)} onClick={() => setQuotes(quotes.filter((z: string) => z !== q))}>“{q.slice(0, 38)}…” ×</span>
                ))}
              </div>
            ) : null}
            {th.queue.length ? (
              <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
                {th.queue.map((q: string, qi: number) => (
                  <div key={qi} style={row}>
                    <span style={small}>Queued {qi + 1}: {q}</span>
                    <button style={mini} onClick={() => upd(th.id, (x: Thread) => ({ ...x, queue: x.queue.filter((_: string, k: number) => k !== qi), turns: [...x.turns, { role: "you", text: `(steer) ${q}`, quotes: [], acts: [] }] }))}>Steer now</button>
                    <button style={mini} onClick={() => upd(th.id, (x: Thread) => ({ ...x, queue: x.queue.filter((_: string, k: number) => k !== qi) }))}>Remove</button>
                  </div>
                ))}
              </div>
            ) : null}
            {sugg.length ? (
              <div style={{ display: "flex", flexDirection: "column", border: `1px solid ${t.border.default}`, borderRadius: t.radius.md, overflow: "hidden" }}>
                {sugg.map((s: { label: string; hint: string; slash: boolean }) => (
                  <button key={s.label} onClick={() => pick(s.label, s.slash)} style={{ display: "flex", gap: 10, padding: "5px 10px", border: "none", background: t.bg.subtle, cursor: "pointer", textAlign: "left", color: t.text.primary }}>
                    <span style={{ ...t.font.code, fontFamily: t.font.mono }}>{s.label}</span>
                    <span style={small}>{s.hint}</span>
                  </button>
                ))}
              </div>
            ) : null}
            <textarea ref={taRef} value={input} rows={2}
              placeholder={th.status === "working" ? "Assistant is working; Enter queues your message" : "Answer, instruct, or type / for commands and @ for people and files. Enter runs."}
              onChange={(e: ChangeEvent<HTMLTextAreaElement>) => setInput(e.target.value)}
              onKeyDown={(e: KeyboardEvent<HTMLTextAreaElement>) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); }
                else if (e.key === "Tab" && sugg.length) { e.preventDefault(); pick(sugg[0].label, sugg[0].slash); }
                else if (e.key === "Escape") { (e.target as HTMLTextAreaElement).blur(); }
              }}
              style={{ ...t.font.body2, fontFamily: t.font.family, width: "100%", boxSizing: "border-box", resize: "vertical", border: `1px solid ${t.border.default}`, borderRadius: t.radius.md, padding: 8, background: t.bg.base, color: t.text.primary, outline: "none" }} />
            <div style={{ ...row, justifyContent: "space-between" }}>
              <div style={row}>
                <Segmented<Mode> value={mode} onChange={(v: Mode) => setMode(v)} options={[{ value: "ask", label: "Ask" }, { value: "plan", label: "Plan" }, { value: "draft", label: "Draft" }]} />
                <span style={small}>Sending: always asks you (locked)</span>
              </div>
              <Button label={th.status === "working" ? "Queue" : "Run"} variant="primary" onClick={send} />
            </div>
          </div>
        </div>

        {/* right rail */}
        <div style={{ flex: "1 1 240px", minWidth: 0, borderLeft: `1px solid ${t.border.subtle}`, padding: 12, display: "flex", flexDirection: "column", gap: 14 }}>
          {th.asks.length ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <span style={label}>Open asks in this thread</span>
              {th.asks.map((a: string, ai: number) => (
                <div key={ai} style={{ display: "flex", gap: 6 }}>
                  <span style={{ ...t.font.caption, color: th.answered[ai] ? t.text.success : t.text.warning }}>{th.answered[ai] ? "✓" : "?"}</span>
                  <span style={{ ...small, color: t.text.secondary }}>{a}</span>
                </div>
              ))}
            </div>
          ) : null}
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <span style={label}>Background runs</span>
            {runs.filter((r: Run) => r.state !== "dismissed").map((r: Run) => (
              <div key={r.id} style={{ ...card, padding: 10, gap: 6 }}>
                <div style={{ ...row, justifyContent: "space-between" }}>
                  <span style={{ ...t.font.code, fontFamily: t.font.mono, color: t.text.primary }}>{r.title}</span>
                  <span style={{ ...t.font.caption, color: r.state === "running" ? t.text.accent : r.state === "review" ? t.text.warning : t.text.success }}>
                    {r.state === "running" ? `${FRAMES[tick % 4]} ${r.done}/${r.total}` : r.state === "review" ? "? review" : "✓ applied"}
                  </span>
                </div>
                <span style={small}>{r.scope}</span>
                <div style={{ height: 6, borderRadius: t.radius.full, background: t.fill.secondary, overflow: "hidden" }}>
                  <div style={{ width: `${Math.round((r.done / r.total) * 100)}%`, height: "100%", background: t.dataviz.categorical[0] }} />
                </div>
                {r.state === "running" ? <span style={{ ...small, fontFamily: t.font.mono }}>reading {r.current}</span> : null}
                {r.state !== "running" ? <span style={small}>{r.labels.map((l: string, li: number) => `${r.counts[li]} ${l}`).join(" · ")}</span> : null}
                {r.state === "review" ? (
                  <div style={row}>
                    <Button label="Apply" variant="primary" onClick={() => applyRun(r)} />
                    <Button label="Dismiss" onClick={() => setRuns((rs: Run[]) => rs.map((q: Run) => (q.id === r.id ? { ...q, state: "dismissed" } : q)))} />
                  </div>
                ) : null}
                {r.state === "applied" ? <span style={small}>Result added to Needs you as a new thread.</span> : null}
              </div>
            ))}
            {!runs.some((r: Run) => r.id === "fu") ? <Button label="Start /followup sweep on Hiring" onClick={startFollowups} /> : null}
            {runs.every((r: Run) => r.id !== "news" || r.state === "dismissed" || r.state === "applied") ? (
              <Button label="Re-run newsletter triage" onClick={() => setRuns((rs: Run[]) => [...rs.filter((q: Run) => q.id !== "news"), newsRun()])} />
            ) : null}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            <span style={label}>Keys (click the client first)</span>
            {["j / k  next / previous thread", "/  open commands", "e  settle thread", "Tab  complete / or @", "Enter  run · Shift+Enter newline"].map((k: string) => (
              <span key={k} style={{ ...small, fontFamily: t.font.mono }}>{k}</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

const PATTERNS: string[][] = [
  ["Status glyphs and a Needs You count", "Orca: https://www.onorca.dev/docs/model/agents-sessions", "Each thread shows needs you (?), working (spinner), done or idle; the top bar filters by state."],
  ["Projects holding threads; Pinned, Snoozed, Settled shelves", "T3 Code: https://github.com/pingdotgg/t3code/blob/main/docs/user/thread-sidebar.md", "Spaces (Home renovation, Hiring, Money) hold threads; Settle means done for now."],
  ["Parallel agents in their own worktrees", "Orca: https://www.onorca.dev/docs/model/worktrees", "Bulk jobs (newsletter triage, follow-up sweep) run in the background with progress, then wait for review."],
  ["Race agents on one task, pick the winner", "Orca: https://www.onorca.dev/docs/recipes/parallel-agents", "Every draft comes in three variants (Brief, Warm, Firm); you pick one."],
  ["Plan before act", "Cline: https://docs.cline.bot/core-workflows/plan-and-act", "/plan proposes steps; each needs Approve before it runs."],
  ["Permission modes in the composer", "T3 Code: https://github.com/pingdotgg/t3code/blob/main/docs/user/permission-modes.md", "Ask (read-only), Plan, Draft; sending is locked to always-confirm."],
  ["Review changes, keep or reject hunks", "Zed: https://zed.dev/docs/ai/agent-panel", "The assistant's edits to your rough reply show as a diff; keep or reject each edit."],
  ["Checkpoints and /undo", "Cline: https://docs.cline.bot/core-workflows/checkpoints and OpenCode: https://opencode.ai/docs/tui/", "Every draft decision is a checkpoint you can restore; /undo steps back one."],
  ["Slash commands and @ references", "OpenCode: https://opencode.ai/docs/tui/", "/summarize /plan /draft /schedule /followup /triage /undo; @ adds people, files, calendar."],
  ["Cite in composer", "T3 Code: https://github.com/pingdotgg/t3code/blob/main/docs/user/composer.md", "Cite any paragraph of an email, then answer several asks in one instruction."],
  ["Collapsed activity log", "T3 Code: https://github.com/pingdotgg/t3code/blob/main/docs/user/activity-log.md", "Each assistant turn folds its tool work into one line you can expand."],
  ["Queue or steer follow-ups", "T3 Code: https://github.com/pingdotgg/t3code/blob/main/docs/user/keybindings.md", "Messages sent while the assistant works queue up; Steer now pushes one in."],
  ["Keyboard-first navigation", "OpenCode and T3 Code keybindings", "j / k between threads, / for commands, e to settle, Tab to complete."],
];

export default function App() {
  return (
    <Page width="full" title="Tidepost: an email client built like an agent workbench" summary="A concept email client whose threads behave like agent sessions: live status, plans you approve step by step, drafts reviewed as diffs with checkpoints, and bulk work running in the background. Patterns come from open-source agent tools; nothing auto-sends.">
      <Callout tone="info">Concept prototype. Tidepost is a made-up name, every person, thread and amount is example data, and sending is simulated behind an explicit confirm.</Callout>
      <Section heading="Patterns borrowed" collapsible defaultOpen>
        <Table columns={["Pattern", "Source", "In Tidepost"]} rows={PATTERNS} />
      </Section>
      <Section heading="Try it">
        <Steps steps={[
          { title: "Answer several asks at once", detail: "On Priya's thread, click Cite on two questions, type your answers, press Enter." },
          { title: "Plan, then approve", detail: "Type /plan (or press / anywhere) and approve or reject each step." },
          { title: "Review the draft", detail: "Switch Brief, Warm or Firm, keep or reject each edit, restore a checkpoint, then Approve & send and Confirm." },
          { title: "Watch background work", detail: "Newsletter triage runs on load; Apply its result to get a new Needs you thread." },
        ]} />
      </Section>
      <Section heading="Prototype">
        <Tidepost />
      </Section>
      <Section heading="Sources">
        <LinkCards links={[
          { title: "Orca: agents and sessions", site: "onorca.dev", href: "https://www.onorca.dev/docs/model/agents-sessions" },
          { title: "Orca: race three agents", site: "onorca.dev", href: "https://www.onorca.dev/docs/recipes/parallel-agents" },
          { title: "T3 Code repository and docs", site: "github.com", href: "https://github.com/pingdotgg/t3code" },
          { title: "OpenCode TUI: commands and @ files", site: "opencode.ai", href: "https://opencode.ai/docs/tui/" },
          { title: "Zed agent panel: review and checkpoints", site: "zed.dev", href: "https://zed.dev/docs/ai/agent-panel" },
          { title: "Cline: Plan & Act", site: "docs.cline.bot", href: "https://docs.cline.bot/core-workflows/plan-and-act" },
          { title: "Cline: checkpoints", site: "docs.cline.bot", href: "https://docs.cline.bot/core-workflows/checkpoints" },
        ]} />
      </Section>
    </Page>
  );
}
