import { memo, useEffect, useMemo, useRef, useState } from "react";
import { CornerUpLeft, CornerUpRight, Forward, MoreHorizontal, Paperclip, Reply, ReplyAll } from "lucide-react";
import { api } from "../api";
import { Avatar, Menu } from "./bits";
import { bytes, displayName, ext, fullDate, messageDate } from "../lib/format";
import { frameDocument, highlightIn, linkify, prepareHtml, splitPlainQuote } from "../lib/html";
import type { AttachmentMeta, Message, Person } from "../../shared/types";

const ALLOW_KEY = "tp.images.allow";
function senderAllowed(email: string): boolean {
  try {
    return (JSON.parse(localStorage.getItem(ALLOW_KEY) ?? "[]") as string[]).includes(email);
  } catch {
    return false;
  }
}
function allowSender(email: string): void {
  try {
    const list = JSON.parse(localStorage.getItem(ALLOW_KEY) ?? "[]") as string[];
    if (!list.includes(email)) localStorage.setItem(ALLOW_KEY, JSON.stringify([...list, email].slice(-500)));
  } catch {
    /* storage unavailable */
  }
}

export interface RecipientChange {
  added: Person[];
  removed: Person[];
}

interface Props {
  m: Message;
  index: number;
  meEmail: string;
  expanded: boolean;
  asksYou: boolean;
  change: RecipientChange | null;
  remoteImages: "ask" | "always";
  find: string;
  flash: boolean;
  onToggle: () => void;
  onReply: (mode: "reply" | "replyAll" | "forward") => void;
  onFindCount?: (n: number) => void;
}

/** Replying to a small subset of a big thread. */
function sideTalk(c: RecipientChange): boolean {
  return c.removed.length >= 5 && c.added.length === 0;
}

function peopleList(list: Person[], me: string, max = 3): string {
  const names = list.map((p) => displayName(p, me));
  return names.length <= max ? names.join(", ") : `${names.slice(0, max).join(", ")} +${names.length - max}`;
}

export const MessageView = memo(function MessageView(props: Props) {
  const { m, meEmail, expanded, asksYou, change, find, flash } = props;
  const [showDetails, setShowDetails] = useState(false);
  const [menu, setMenu] = useState<HTMLElement | null>(null);
  const toMe = m.to.some((p) => p.email === meEmail);
  const recipientsLine = `to ${peopleList(m.to, meEmail)}${m.cc.length ? `, cc ${peopleList(m.cc, meEmail, 2)}` : ""}`;

  return (
    <article id={`msg-${m.id}`} className="msg" data-expanded={expanded} data-unread={m.unread} data-flash={flash} aria-label={`Message ${props.index + 1} from ${m.from.name}`}>
      <div className="msg-head" onClick={expanded ? undefined : props.onToggle} onDoubleClick={expanded ? props.onToggle : undefined}>
        <Avatar person={m.from} />
        <div className="msg-who">
          <div className="msg-line1">
            <span className="msg-from">{m.fromMe ? "You" : m.from.name || m.from.email}</span>
            {expanded && !m.fromMe ? <span className="msg-email">{m.from.email}</span> : null}
            {asksYou ? <span className="badge badge-needs" title="The assistant found an ask for you in this message">Asks you</span> : null}
            {!expanded && change && (change.added.length || change.removed.length) ? (
              <span className="badge" title={[change.added.length ? `Added: ${change.added.map((p) => p.name).join(", ")}` : "", change.removed.length ? `Removed: ${change.removed.map((p) => p.name).join(", ")}` : ""].filter(Boolean).join("\n")}>
                {sideTalk(change) ? "Side conversation" : [change.added.length ? `${change.added.length} added` : "", change.removed.length ? `${change.removed.length} dropped` : ""].filter(Boolean).join(", ")}
              </span>
            ) : null}
          </div>
          {expanded ? (
            <div className="msg-to">
              <button onClick={() => setShowDetails((v) => !v)} aria-expanded={showDetails}>{recipientsLine}</button>
              {!toMe && !m.fromMe && m.cc.some((p) => p.email === meEmail) ? " (you're on Cc)" : ""}
            </div>
          ) : (
            <div className="msg-snippet">{m.uniqueText ? m.uniqueText.replace(/\s+/g, " ").slice(0, 200) : m.snippet}</div>
          )}
        </div>
        <div className="msg-side">
          {m.attachments.some((a) => !a.inline) ? <Paperclip size={12} aria-label="Attachments" /> : null}
          <time dateTime={m.date} title={fullDate(m.date)}>{messageDate(m.date)}</time>
          {expanded ? (
            <span className="msg-actions" onClick={(e) => e.stopPropagation()}>
              <button className="icon-btn icon-btn-sm" title="Reply (r)" aria-label="Reply" onClick={() => props.onReply("reply")}><Reply size={15} /></button>
              <button className="icon-btn icon-btn-sm" title="Reply all (a)" aria-label="Reply all" onClick={() => props.onReply("replyAll")}><ReplyAll size={15} /></button>
              <button className="icon-btn icon-btn-sm" title="More" aria-label="More actions" onClick={(e) => setMenu(e.currentTarget)}><MoreHorizontal size={15} /></button>
            </span>
          ) : null}
        </div>
      </div>
      {expanded && showDetails ? (
        <dl className="msg-recipients">
          <dt>From</dt><dd>{m.from.name} &lt;{m.from.email}&gt;</dd>
          {m.to.length ? <><dt>To</dt><dd>{m.to.map((p) => `${p.name} <${p.email}>`).join(", ")}</dd></> : null}
          {m.cc.length ? <><dt>Cc</dt><dd>{m.cc.map((p) => `${p.name} <${p.email}>`).join(", ")}</dd></> : null}
          {m.bcc.length ? <><dt>Bcc</dt><dd>{m.bcc.map((p) => `${p.name} <${p.email}>`).join(", ")}</dd></> : null}
          <dt>Date</dt><dd>{fullDate(m.date)}</dd>
        </dl>
      ) : null}
      {expanded && change && (change.added.length || change.removed.length) ? (
        <div className="msg-changes">
          {change.added.length ? <span className="badge badge-accent">Added {peopleList(change.added, meEmail, 4)}</span> : null}
          {change.removed.length ? <span className="badge">{sideTalk(change) ? `Side conversation: ${change.removed.length} people dropped, including ` : "Dropped "}{peopleList(change.removed, meEmail, sideTalk(change) ? 2 : 4)}</span> : null}
        </div>
      ) : null}
      {expanded ? (
        <div className="msg-body">
          {!m.bodyLoaded ? (
            <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: "4px 0 8px" }}>
              <div className="skeleton" style={{ width: "80%" }} />
              <div className="skeleton" style={{ width: "60%" }} />
            </div>
          ) : m.html || m.uniqueHtml ? (
            <HtmlBody m={m} remoteImages={props.remoteImages} find={find} onFindCount={props.onFindCount} />
          ) : (
            <PlainBody text={m.text} find={find} />
          )}
          <Attachments m={m} />
        </div>
      ) : null}
      {menu ? (
        <Menu
          anchor={menu}
          align="right"
          onClose={() => setMenu(null)}
          items={[
            { label: "Reply", hint: "r", icon: <CornerUpLeft size={14} />, onSelect: () => props.onReply("reply") },
            { label: "Reply all", hint: "a", icon: <ReplyAll size={14} />, onSelect: () => props.onReply("replyAll") },
            { label: "Forward", hint: "f", icon: <Forward size={14} />, onSelect: () => props.onReply("forward") },
            "sep",
            { label: "Show details", icon: <CornerUpRight size={14} />, onSelect: () => setShowDetails(true) },
            { label: "Collapse", onSelect: props.onToggle },
          ]}
        />
      ) : null}
    </article>
  );
});

function Attachments({ m }: { m: Message }) {
  const files = m.attachments.filter((a) => !a.inline);
  if (!files.length) return null;
  return (
    <div className="attachments">
      {files.map((a) => (
        <a key={a.id} className="attachment" href={api.attachmentUrl(m.accountId, m.id, a.id)} download={a.filename} title={`Download ${a.filename}`}>
          <span className="att-ext">{ext(a.filename)}</span>
          <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span className="att-name">{a.filename}</span>
            <span className="att-size">{bytes(a.size)}</span>
          </span>
        </a>
      ))}
    </div>
  );
}

function HtmlBody({ m, remoteImages, find, onFindCount }: { m: Message; remoteImages: "ask" | "always"; find: string; onFindCount?: (n: number) => void }) {
  const [allow, setAllow] = useState(remoteImages === "always" || senderAllowed(m.from.email));
  const [showQuoted, setShowQuoted] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(40);
  const inlineUrl = (a: AttachmentMeta) => api.attachmentUrl(m.accountId, m.id, a.id, true);

  const prepared = useMemo(() => {
    // Outlook gives us the new content separately; otherwise split the quote ourselves.
    if (m.uniqueHtml) {
      const unique = prepareHtml(m.uniqueHtml, { allowRemote: allow, attachments: m.attachments, inlineUrl });
      const full = m.html ? prepareHtml(m.html, { allowRemote: allow, attachments: m.attachments, inlineUrl }) : null;
      const same = !full || full.body.length + (full.quoted?.length ?? 0) <= unique.body.length + 40;
      return { body: unique.body, quoted: same ? null : (full ? full.body + (full.quoted ?? "") : null), remoteBlocked: Math.max(unique.remoteBlocked, full?.remoteBlocked ?? 0), fullMode: true };
    }
    return { ...prepareHtml(m.html ?? "", { allowRemote: allow, attachments: m.attachments, inlineUrl }), fullMode: false };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [m.html, m.uniqueHtml, allow, m.attachments]);

  const html = prepared.fullMode && showQuoted && prepared.quoted ? prepared.quoted : prepared.body + (showQuoted && prepared.quoted ? prepared.quoted : "");
  const doc = useMemo(() => frameDocument(html, allow), [html, allow]);

  useEffect(() => {
    const frame = frameRef.current;
    if (!frame) return;
    let ro: ResizeObserver | null = null;
    const measure = () => {
      const d = frame.contentDocument;
      if (!d?.documentElement) return;
      const h = Math.max(d.documentElement.scrollHeight, d.body?.scrollHeight ?? 0);
      setHeight(Math.min(h + 2, 20000));
    };
    const onLoad = () => {
      measure();
      const d = frame.contentDocument;
      if (d?.body) {
        ro = new ResizeObserver(measure);
        ro.observe(d.body);
        d.querySelectorAll("img").forEach((img) => img.addEventListener("load", measure));
        if (find) onFindCount?.(highlightIn(d, find).length);
      }
    };
    frame.addEventListener("load", onLoad);
    return () => {
      frame.removeEventListener("load", onLoad);
      ro?.disconnect();
    };
  }, [doc, find, onFindCount]);

  useEffect(() => {
    const d = frameRef.current?.contentDocument;
    if (d?.body && d.readyState === "complete") {
      const marks = highlightIn(d, find);
      onFindCount?.(marks.length);
      if (marks[0]) marks[0].classList.add("tp-current");
    }
  }, [find, onFindCount]);

  return (
    <div>
      {prepared.remoteBlocked > 0 && !allow ? (
        <div className="images-banner">
          <span>Remote images are hidden to protect your privacy.</span>
          <button className="btn-link" onClick={() => setAllow(true)}>Show images</button>
          <button className="btn-link" onClick={() => { allowSender(m.from.email); setAllow(true); }}>Always show from {m.from.email}</button>
        </div>
      ) : null}
      <div className="html-frame-wrap">
        <iframe
          ref={frameRef}
          title={`Message from ${m.from.name}`}
          sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
          srcDoc={doc}
          style={{ height }}
          loading="lazy"
        />
      </div>
      {prepared.quoted ? (
        <button className="quoted-toggle" onClick={() => setShowQuoted((v) => !v)} aria-expanded={showQuoted} title={showQuoted ? "Hide quoted text" : "Show quoted text"}>
          {showQuoted ? "Hide quoted text" : "••• Show quoted text"}
        </button>
      ) : null}
    </div>
  );
}

function highlightText(text: string, find: string): React.ReactNode[] {
  const parts = linkify(text);
  const out: React.ReactNode[] = [];
  parts.forEach((p, i) => {
    if (typeof p !== "string") {
      out.push(<a key={i} href={p.url} target="_blank" rel="noopener noreferrer">{p.url}</a>);
      return;
    }
    if (!find.trim()) {
      out.push(p);
      return;
    }
    const lower = p.toLowerCase();
    const needle = find.toLowerCase();
    let at = 0;
    let idx = lower.indexOf(needle);
    while (idx >= 0) {
      out.push(p.slice(at, idx));
      out.push(<mark key={`${i}-${idx}`} className="mark">{p.slice(idx, idx + needle.length)}</mark>);
      at = idx + needle.length;
      idx = lower.indexOf(needle, at);
    }
    out.push(p.slice(at));
  });
  return out;
}

function PlainBody({ text, find }: { text: string; find: string }) {
  const [showQuoted, setShowQuoted] = useState(false);
  const { body, quoted } = useMemo(() => splitPlainQuote(text), [text]);
  return (
    <div>
      <p className="plain">{highlightText(body, find)}</p>
      {quoted ? (
        <>
          <button className="quoted-toggle" onClick={() => setShowQuoted((v) => !v)} aria-expanded={showQuoted}>{showQuoted ? "Hide quoted text" : "••• Show quoted text"}</button>
          {showQuoted ? <p className="plain" style={{ color: "var(--text-tertiary)", marginTop: 8 }}>{highlightText(quoted, find)}</p> : null}
        </>
      ) : null}
    </div>
  );
}
