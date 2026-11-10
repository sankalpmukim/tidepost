import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { Maximize2, Minus, Paperclip, Send, Sparkles, Trash2, Undo2, X } from "lucide-react";
import { api, ApiError } from "../api";
import { useAccount, useConfig, useMe } from "../hooks";
import { closeComposer, toast, type ComposeRequest } from "../store";
import { diff, finalText, hunkCount, toLines, type Decision, type Seg } from "../lib/diff";
import { sendChecks, LARGE_AUDIENCE } from "../lib/checks";
import { bytes, domainOf, ext, isPublicDomain } from "../lib/format";
import type { Contact, DraftProposal, DraftTone, Message, OutgoingAttachment, OutgoingMessage, Person, SendCheck, Thread } from "../../shared/types";

const TONES: DraftTone[] = ["Brief", "Warm", "Firm"];

interface Checkpoint { id: number; label: string; tone: DraftTone; decisions: Record<number, Decision> }

function reSubject(s: string, mode: string): string {
  if (mode === "forward") return /^fwd?:/i.test(s) ? s : `Fwd: ${s}`;
  return /^re:/i.test(s) ? s : `Re: ${s}`;
}

function uniqPeople(list: Person[], exclude: Set<string>): Person[] {
  const out: Person[] = [];
  for (const p of list) {
    if (exclude.has(p.email)) continue;
    exclude.add(p.email);
    out.push(p);
  }
  return out;
}

function initialFields(req: ComposeRequest, thread: Thread | undefined, me: string) {
  if (req.restore) {
    return { to: req.restore.to, cc: req.restore.cc, bcc: req.restore.bcc, subject: req.restore.subject, text: req.restore.text };
  }
  const original = thread?.messages.find((m) => m.id === req.messageId) ?? null;
  if (!original) return { to: [] as Person[], cc: [] as Person[], bcc: [] as Person[], subject: "", text: req.notes ?? "" };
  const subject = reSubject(original.subject || thread?.subject || "", req.mode);
  if (req.mode === "forward") return { to: [], cc: [], bcc: [], subject, text: req.notes ?? "" };
  const fromMe = original.fromMe || original.from.email === me;
  const primary = fromMe ? original.to : original.replyTo.length ? original.replyTo : [original.from];
  if (req.mode === "reply") return { to: uniqPeople(primary, new Set([me])), cc: [], bcc: [], subject, text: req.notes ?? "" };
  const seen = new Set([me]);
  const to = uniqPeople([...primary, ...(fromMe ? [] : original.to)], seen);
  const cc = uniqPeople(original.cc, seen);
  return { to, cc, bcc: [], subject, text: req.notes ?? "" };
}

function draftKey(req: ComposeRequest) {
  return `tp.draft.${req.accountId}.${req.threadId ?? "new"}.${req.mode}`;
}

export function Composer({ req, thread, inline }: { req: ComposeRequest; thread?: Thread; inline?: boolean }) {
  const account = useAccount();
  const me = account?.email ?? "";
  const cfg = useConfig().data;
  const settings = useMe().data?.settings;
  const qc = useQueryClient();
  const original: Message | null = thread?.messages.find((m) => m.id === req.messageId) ?? null;
  const init = useMemo(() => {
    const base = initialFields(req, thread, me);
    try {
      const saved = localStorage.getItem(draftKey(req));
      if (saved && !req.restore && !req.notes) {
        const d = JSON.parse(saved) as { text: string; to: Person[]; cc: Person[]; bcc: Person[]; subject: string };
        if (d.text.trim()) return { ...base, ...d };
      }
    } catch {
      /* ignore */
    }
    return base;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req.key]);

  const [to, setTo] = useState<Person[]>(init.to);
  const [cc, setCc] = useState<Person[]>(init.cc);
  const [bcc, setBcc] = useState<Person[]>(init.bcc);
  const [showCc, setShowCc] = useState(init.cc.length > 0 || init.bcc.length > 0);
  const [subject, setSubject] = useState(init.subject);
  const [text, setText] = useState(init.text);
  const [files, setFiles] = useState<OutgoingAttachment[]>(req.restore?.attachments ?? []);
  const [minimized, setMinimized] = useState(false);
  const [checks, setChecks] = useState<SendCheck[] | null>(null);
  const [sending, setSending] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [proposal, setProposal] = useState<DraftProposal | null>(null);
  const [tone, setTone] = useState<DraftTone>("Brief");
  const [decisions, setDecisions] = useState<Record<number, Decision>>({});
  const [checkpoints, setCheckpoints] = useState<Checkpoint[]>([]);
  const [drafting, setDrafting] = useState(false);
  const [unreviewed, setUnreviewed] = useState(false);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const autoDrafted = useRef(false);

  // Focus: body for replies, To for new messages.
  useEffect(() => {
    if (req.mode === "new" || req.mode === "forward") return;
    const el = bodyRef.current;
    if (el) {
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [req.key, req.mode]);

  // Grow the message box with its content (up to most of the window).
  useLayoutEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(Math.max(el.scrollHeight, inline ? 160 : 260), Math.round(window.innerHeight * (inline ? 0.6 : 0.5)))}px`;
  }, [text, inline]);

  // Autosave locally.
  useEffect(() => {
    const t = window.setTimeout(() => {
      try {
        if (text.trim()) localStorage.setItem(draftKey(req), JSON.stringify({ text, to, cc, bcc, subject }));
        else localStorage.removeItem(draftKey(req));
      } catch {
        /* storage unavailable */
      }
    }, 400);
    return () => clearTimeout(t);
  }, [text, to, cc, bcc, subject, req]);

  // Forward the original's attachments (Outlook's createForward copies them itself).
  useEffect(() => {
    if (req.mode !== "forward" || !original || account?.provider === "outlook" || req.restore) return;
    const atts = original.attachments.filter((a) => !a.inline);
    if (!atts.length) return;
    let cancelled = false;
    void Promise.all(atts.map(async (a) => {
      const res = await fetch(api.attachmentUrl(original.accountId, original.id, a.id));
      const buf = new Uint8Array(await res.arrayBuffer());
      let bin = "";
      for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
      return { filename: a.filename, mimeType: a.mimeType, data: btoa(bin) };
    })).then((list) => { if (!cancelled) setFiles((f) => [...f, ...list]); }).catch(() => toast({ text: "Couldn't attach the original files.", tone: "error" }));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req.key]);

  // Plan step "reply": draft straight away from the notes.
  useEffect(() => {
    if (req.autoDraft && !autoDrafted.current) {
      autoDrafted.current = true;
      void runDraft();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [req.autoDraft]);

  const segs: Seg[] = useMemo(() => (proposal ? diff(toLines(proposal.notes), toLines(proposal.variants[tone])) : []), [proposal, tone]);
  const hunks = hunkCount(segs);
  const decided = Object.keys(decisions).length;

  const addFiles = async (list: FileList | File[]) => {
    const arr = Array.from(list);
    const read = await Promise.all(arr.map((f) => new Promise<OutgoingAttachment>((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve({ filename: f.name, mimeType: f.type || "application/octet-stream", data: String(r.result).split(",")[1] ?? "" });
      r.onerror = () => reject(r.error);
      r.readAsDataURL(f);
    })));
    setFiles((x) => [...x, ...read]);
  };

  const runDraft = async () => {
    if (!account) return;
    setDrafting(true);
    try {
      const p = await api.draft(account.id, req.threadId, {
        notes: text,
        mode: req.mode,
        recipients: to.map((p) => p.name || p.email),
        subject,
      });
      setProposal(p);
      setTone("Brief");
      setDecisions({});
      setCheckpoints([{ id: 1, label: "Assistant draft", tone: "Brief", decisions: {} }]);
    } catch (err) {
      toast({ text: err instanceof ApiError ? err.message : "The assistant couldn't draft this.", tone: "error" });
    } finally {
      setDrafting(false);
    }
  };

  const checkpoint = (label: string, nextTone: DraftTone, nextDecisions: Record<number, Decision>) => {
    setCheckpoints((c) => [...c, { id: (c[c.length - 1]?.id ?? 0) + 1, label, tone: nextTone, decisions: nextDecisions }]);
  };

  const decide = (id: number, d: Decision) => {
    const next = { ...decisions, [id]: d };
    setDecisions(next);
    checkpoint(`${d === "accept" ? "Kept" : "Rejected"} edit ${id + 1}`, tone, next);
  };

  const useDraft = () => {
    if (!proposal) return;
    setText(finalText(segs, decisions));
    setUnreviewed(decided < hunks);
    setProposal(null);
    requestAnimationFrame(() => bodyRef.current?.focus());
  };

  const discard = () => {
    try {
      localStorage.removeItem(draftKey(req));
    } catch {
      /* ignore */
    }
    closeComposer(req.key);
  };

  const buildMessage = (): OutgoingMessage => ({
    to, cc, bcc, subject, text, attachments: files, mode: req.mode,
    inReplyTo: original ? { messageId: original.id, threadId: original.threadId } : null,
    quotedHtml: original && req.mode !== "new" ? original.html : null,
    quotedText: original && req.mode !== "new" ? original.text : null,
  });

  const send = async (force = false) => {
    if (!account || sending) return;
    if (!to.length && !cc.length && !bcc.length) {
      toast({ text: "Add at least one recipient.", tone: "error" });
      return;
    }
    if (proposal) {
      toast({ text: "Finish reviewing the assistant's draft first: use it or close it.", tone: "error" });
      return;
    }
    const found = sendChecks({ me, to, cc, bcc, subject, text, attachmentCount: files.length, unreviewedDraft: unreviewed });
    if (found.length && !force) {
      setChecks(found);
      return;
    }
    setSending(true);
    const msg = buildMessage();
    try {
      const queued = await api.send(account.id, msg);
      try {
        localStorage.removeItem(draftKey(req));
      } catch {
        /* ignore */
      }
      closeComposer(req.key);
      window.dispatchEvent(new CustomEvent("tp:queued", { detail: { queued, msg, req } }));
      void qc.invalidateQueries({ queryKey: ["sends"] });
    } catch (err) {
      toast({ text: err instanceof ApiError ? err.message : "Couldn't send. Your draft is kept.", tone: "error" });
      setSending(false);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void send(!!checks);
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "j") {
      e.preventDefault();
      void runDraft();
    } else if (e.key === "Escape") {
      e.preventDefault();
      if (proposal) setProposal(null);
      else if (checks) setChecks(null);
      else (e.target as HTMLElement).blur();
    } else if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key.toLowerCase() === "c") {
      e.preventDefault();
      setShowCc(true);
    }
  };

  const myDomain = domainOf(me);
  const isExternal = (p: Person) => !!myDomain && !isPublicDomain(myDomain) && domainOf(p.email) !== myDomain;
  const audience = to.length + cc.length;
  const title = req.mode === "new" ? "New message" : req.mode === "forward" ? "Forward" : req.mode === "replyAll" ? `Reply all${audience ? ` to ${audience}` : ""}` : "Reply";

  if (minimized && !inline) {
    return (
      <div className="composer composer-dock" style={{ width: 320 }}>
        <div className="composer-head">
          <strong>{subject || title}</strong>
          <button className="icon-btn icon-btn-sm" aria-label="Restore" onClick={() => setMinimized(false)}><Maximize2 size={14} /></button>
          <button className="icon-btn icon-btn-sm" aria-label="Close" onClick={() => closeComposer(req.key)}><X size={14} /></button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`composer${inline ? "" : " composer-dock"}`}
      onKeyDown={onKeyDown}
      onDragOver={(e) => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragging(true); } }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => { e.preventDefault(); setDragging(false); if (e.dataTransfer.files.length) void addFiles(e.dataTransfer.files); }}
      aria-label={title}
    >
      <div className="composer-head">
        <strong>{title}</strong>
        {req.mode !== "new" && thread ? (
          <div className="seg" role="group" aria-label="Reply mode">
            {(["reply", "replyAll", "forward"] as const).map((m) => (
              <button key={m} aria-pressed={req.mode === m} onClick={() => { if (req.mode !== m) window.dispatchEvent(new CustomEvent("tp:compose-mode", { detail: { key: req.key, mode: m } })); }}>
                {m === "reply" ? "Reply" : m === "replyAll" ? "Reply all" : "Forward"}
              </button>
            ))}
          </div>
        ) : null}
        {!inline ? <button className="icon-btn icon-btn-sm" aria-label="Minimize" onClick={() => setMinimized(true)}><Minus size={14} /></button> : null}
        <button className="icon-btn icon-btn-sm" aria-label="Close (draft is kept)" title="Close (draft is kept)" onClick={() => closeComposer(req.key)}><X size={14} /></button>
      </div>
      <div className="composer-fields">
        <RecipientField label="To" people={to} onChange={(p) => { setTo(p); setChecks(null); }} accountId={account?.id ?? ""} isExternal={isExternal} autoFocus={req.mode === "new" || req.mode === "forward"}
          trailing={!showCc ? <button className="btn-link" style={{ fontSize: 12 }} onClick={() => setShowCc(true)}>Cc Bcc</button> : null} />
        {showCc ? <RecipientField label="Cc" people={cc} onChange={(p) => { setCc(p); setChecks(null); }} accountId={account?.id ?? ""} isExternal={isExternal} /> : null}
        {showCc ? <RecipientField label="Bcc" people={bcc} onChange={(p) => { setBcc(p); setChecks(null); }} accountId={account?.id ?? ""} isExternal={isExternal} /> : null}
        {req.mode === "new" || req.mode === "forward" || !inline ? (
          <div className="field">
            <label htmlFor={`subj-${req.key}`}>Subject</label>
            <input id={`subj-${req.key}`} value={subject} onChange={(e) => setSubject(e.target.value)} />
            <span />
          </div>
        ) : null}
      </div>
      <div className="composer-body">
        <textarea
          ref={bodyRef}
          className="body"
          value={text}
          onChange={(e) => { setText(e.target.value); setChecks(null); }}
          placeholder={`${req.mode === "new" ? "Write your message" : req.mode === "forward" ? "Add a note" : "Write your reply"}${cfg?.ai ? ", or jot rough notes and press ⌘J to have the assistant draft it" : ""}`}
          aria-label="Message body"
        />
        {dragging ? <div className="drop-hint">Drop files to attach</div> : null}
      </div>
      {files.length ? (
        <div className="composer-files">
          {files.map((f, i) => (
            <span key={i} className="attachment" style={{ height: 32 }}>
              <span className="att-ext" style={{ width: 22, height: 22 }}>{ext(f.filename)}</span>
              <span className="att-name">{f.filename}</span>
              <span className="att-size">{bytes(Math.round(f.data.length * 0.75))}</span>
              <button className="icon-btn icon-btn-sm" style={{ width: 20, height: 20 }} aria-label={`Remove ${f.filename}`} onClick={() => setFiles((x) => x.filter((_, k) => k !== i))}><X size={12} /></button>
            </span>
          ))}
        </div>
      ) : null}
      {original && req.mode !== "new" ? (
        <div className="composer-quoted"><span style={{ fontSize: 12, color: "var(--text-tertiary)" }}>{req.mode === "forward" ? "The original message is included below your note." : `Quoting ${original.from.name}'s message below your reply.`}</span></div>
      ) : null}

      {proposal ? (
        <div className="review" aria-label="Review the assistant's draft">
          <div className="review-head">
            <span className="title"><Sparkles size={12} /> {proposal.source === "ai" ? "Assistant draft" : "Template draft"}: review each edit</span>
            <span className="spacer" />
            <div className="seg" role="group" aria-label="Tone">
              {TONES.map((t) => (
                <button key={t} aria-pressed={tone === t} onClick={() => { setTone(t); setDecisions({}); checkpoint(`Switched to ${t}`, t, {}); }}>{t}</button>
              ))}
            </div>
          </div>
          <div className="diff" role="list">
            {segs.map((s, i) => s.kind === "same" ? (
              s.lines.map((l, k) => <div key={`${i}-${k}`} className="diff-line diff-same">{l.text}</div>)
            ) : (
              <div key={i} className="diff-hunk" data-decision={decisions[s.id] ?? ""}>
                {s.del.map((l, k) => <div key={`d${k}`} className="diff-line diff-del">{l.text}</div>)}
                {s.add.map((l, k) => <div key={`a${k}`} className="diff-line diff-add">{l.text}</div>)}
                <div className="hunk-bar">
                  <span className="decided">{decisions[s.id] === "accept" ? "Kept the edit" : decisions[s.id] === "reject" ? "Kept your words" : "Not reviewed"}</span>
                  <button className="btn btn-sm" aria-pressed={decisions[s.id] === "accept"} onClick={() => decide(s.id, "accept")}>Keep edit</button>
                  <button className="btn btn-sm btn-ghost" onClick={() => decide(s.id, "reject")}>{s.del.length ? "Keep mine" : "Drop"}</button>
                </div>
              </div>
            ))}
          </div>
          {checkpoints.length > 1 ? (
            <div className="checkpoints">
              <span>Checkpoints:</span>
              {checkpoints.map((c, i) => (
                <button key={c.id} className="checkpoint" aria-current={i === checkpoints.length - 1} title="Restore this checkpoint" onClick={() => { setTone(c.tone); setDecisions({ ...c.decisions }); setCheckpoints((cs) => cs.filter((x) => x.id <= c.id)); }}>
                  {c.label}
                </button>
              ))}
              <button className="btn-link" style={{ fontSize: 12 }} onClick={() => { if (checkpoints.length > 1) { const prev = checkpoints[checkpoints.length - 2]; setTone(prev.tone); setDecisions({ ...prev.decisions }); setCheckpoints((cs) => cs.slice(0, -1)); } }}><Undo2 size={12} /> Undo</button>
            </div>
          ) : null}
          <div className="review-foot">
            <button className="btn btn-sm" onClick={() => { const all: Record<number, Decision> = {}; segs.forEach((s) => { if (s.kind === "change") all[s.id] = "accept"; }); setDecisions(all); checkpoint("Kept all edits", tone, all); }}>Keep all edits</button>
            <button className="btn btn-primary btn-sm" onClick={useDraft}>Use this draft</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setProposal(null)}>Close</button>
            <span className="hint">{hunks === 0 ? "No changes to review." : decided < hunks ? `${hunks - decided} of ${hunks} edits not reviewed yet. Unreviewed edits are kept.` : "All edits reviewed."}</span>
          </div>
        </div>
      ) : null}

      {checks?.length ? (
        <div className="checks" role="alert">
          {checks.map((c) => (
            <div className="check" key={c.code}>
              <strong>•</strong>
              <span style={{ flex: 1 }}>
                {c.message}{" "}
                {c.code === "large-audience" && cc.length ? <button className="btn-link" onClick={() => { setBcc([...bcc, ...cc]); setCc([]); setShowCc(true); setChecks(null); }}>Move Cc to Bcc</button> : null}
                {c.code === "missing-attachment" ? <button className="btn-link" onClick={() => fileRef.current?.click()}>Attach a file</button> : null}
              </span>
            </div>
          ))}
          <div className="check">Press <kbd>⌘</kbd><kbd>Enter</kbd> again or choose Send anyway.</div>
        </div>
      ) : null}

      <div className="composer-foot">
        <button className="btn btn-primary" onClick={() => void send(!!checks)} disabled={sending}>
          <Send size={14} /> {checks ? "Send anyway" : "Send"}
        </button>
        <span className="hint"><kbd>⌘</kbd><kbd>Enter</kbd></span>
        <button className="btn btn-ghost btn-sm" onClick={() => void runDraft()} disabled={drafting} title={cfg?.ai ? "Turn your notes into a draft (⌘J)" : "Tidy your notes into a draft (⌘J). Add an Anthropic API key for full drafting."}>
          {drafting ? <span className="spinner" /> : <Sparkles size={13} />} {cfg?.ai ? "Draft from notes" : "Tidy notes"}
        </button>
        <input ref={fileRef} type="file" multiple hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = ""; }} />
        <button className="icon-btn icon-btn-sm" title="Attach files" aria-label="Attach files" onClick={() => fileRef.current?.click()}><Paperclip size={15} /></button>
        <span className="spacer" />
        {audience >= LARGE_AUDIENCE ? <span className="badge badge-needs">{audience} recipients</span> : null}
        <span className="hint">{settings?.undoSendSeconds ? `${settings.undoSendSeconds}s to undo` : ""}</span>
        <button className="icon-btn icon-btn-sm" title="Discard draft" aria-label="Discard draft" onClick={discard}><Trash2 size={15} /></button>
      </div>
    </div>
  );
}

function RecipientField({ label, people, onChange, accountId, isExternal, autoFocus, trailing }: {
  label: string; people: Person[]; onChange: (p: Person[]) => void; accountId: string; isExternal: (p: Person) => boolean; autoFocus?: boolean; trailing?: React.ReactNode;
}) {
  const [input, setInput] = useState("");
  const [sugg, setSugg] = useState<Contact[]>([]);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (autoFocus) inputRef.current?.focus();
  }, [autoFocus]);

  useEffect(() => {
    const q = input.trim();
    if (!q || !accountId) {
      setSugg([]);
      return;
    }
    const t = window.setTimeout(() => {
      void api.contacts(accountId, q).then((c) => {
        setSugg(c.filter((x) => !people.some((p) => p.email === x.email)));
        setActive(0);
      }).catch(() => setSugg([]));
    }, 120);
    return () => clearTimeout(t);
  }, [input, accountId, people]);

  const add = (p: Person) => {
    if (!people.some((x) => x.email === p.email)) onChange([...people, p]);
    setInput("");
    setSugg([]);
  };

  const commitTyped = () => {
    const parts = input.split(/[,;\s]+/).map((s) => s.trim()).filter(Boolean);
    const valid = parts.filter((s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s));
    if (valid.length) {
      onChange([...people, ...valid.filter((e) => !people.some((p) => p.email === e.toLowerCase())).map((e) => ({ name: e, email: e.toLowerCase() }))]);
      setInput("");
      setSugg([]);
      return true;
    }
    return false;
  };

  return (
    <div className="field">
      <label onClick={() => inputRef.current?.focus()}>{label}</label>
      <div className="recipients">
        {people.map((p) => (
          <span key={p.email} className="recipient" data-external={isExternal(p)} title={`${p.name} <${p.email}>${isExternal(p) ? " (outside your organization)" : ""}`}>
            <span>{p.name && p.name !== p.email ? p.name : p.email}</span>
            <button aria-label={`Remove ${p.email}`} onClick={() => onChange(people.filter((x) => x.email !== p.email))}><X size={11} /></button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          aria-label={`${label} recipients`}
          onChange={(e) => setInput(e.target.value)}
          onBlur={() => window.setTimeout(() => { commitTyped(); setSugg([]); }, 150)}
          onKeyDown={(e) => {
            if (sugg.length && (e.key === "ArrowDown" || e.key === "ArrowUp")) {
              e.preventDefault();
              setActive((a) => (e.key === "ArrowDown" ? Math.min(sugg.length - 1, a + 1) : Math.max(0, a - 1)));
            } else if ((e.key === "Enter" || e.key === "Tab") && sugg.length && input.trim()) {
              e.preventDefault();
              add(sugg[active]);
            } else if (e.key === "Enter" || e.key === "," || e.key === ";") {
              if (input.trim() && commitTyped()) e.preventDefault();
            } else if (e.key === "Backspace" && !input && people.length) {
              onChange(people.slice(0, -1));
            }
          }}
          onPaste={(e) => {
            const t = e.clipboardData.getData("text");
            if (t.includes("@") && /[,;\n]/.test(t)) {
              e.preventDefault();
              const found = [...t.matchAll(/(?:"?([^"<,;\n]*)"?\s*)?<?([^\s<>,;]+@[^\s<>,;]+\.[^\s<>,;]+)>?/g)].map((m) => ({ name: (m[1] ?? "").trim() || m[2], email: m[2].toLowerCase() }));
              onChange([...people, ...found.filter((f) => !people.some((p) => p.email === f.email))]);
            }
          }}
        />
        {sugg.length ? (
          <div className="suggest" role="listbox">
            {sugg.map((c, i) => (
              <div key={c.email} className="suggest-item" role="option" aria-selected={i === active} onMouseDown={(e) => { e.preventDefault(); add({ name: c.name, email: c.email }); }}>
                <span>{c.name}</span>
                <span className="se">{c.email}</span>
              </div>
            ))}
          </div>
        ) : null}
      </div>
      {trailing ?? <span />}
    </div>
  );
}
