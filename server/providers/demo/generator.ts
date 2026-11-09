// Deterministic generation of the demo mailbox.
//
// Everything is derived from a seeded PRNG (mulberry32) and the `now` anchor,
// so two generators with the same seed and `now` produce identical mailboxes.
// Message metadata is built eagerly; bodies are rendered lazily from a small
// per-message spec (new text + sender + parent pointer) and are stable.
import { crc32, deflateSync } from "node:zlib";
import type { AttachmentMeta, Person } from "../../../shared/types";
import type { BulkSignals, MessageMeta } from "../types";
import {
  ALERTS,
  ARRIVALS,
  AUTO_REPLIES,
  CI_FAILURES,
  CI_REPOS,
  FORUM_LISTS,
  HR_IT_NOTICES,
  JIRA_ISSUES,
  LONG_THREADS,
  MARKETING,
  ME_DEFAULT,
  MEETINGS,
  NEWSLETTERS,
  PEOPLE,
  PULL_REQUESTS,
  RECEIPTS,
  RECENT_THREADS,
  SECURITY_ALERTS,
  SHOWCASE,
  SLOTS,
  SOCIAL,
  SPAM_MAIL,
  TOPICS,
  type ArrivalScript,
  type LabelName,
  type MailClient,
  type PersonDef,
  type ScriptMsg,
  type SimpleMailDef,
  type ThreadScript,
  type TopicBank,
} from "./content";

// ---------------------------------------------------------------------------
// PRNG
// ---------------------------------------------------------------------------

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class Rng {
  private readonly f: () => number;
  constructor(seed: number) {
    this.f = mulberry32(seed);
  }
  next(): number {
    return this.f();
  }
  /** Integer in [lo, hi] inclusive. */
  int(lo: number, hi: number): number {
    return lo + Math.floor(this.f() * (hi - lo + 1));
  }
  chance(p: number): boolean {
    return this.f() < p;
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.f() * arr.length)];
  }
  /** k distinct items. */
  sample<T>(arr: readonly T[], k: number): T[] {
    const copy = arr.slice();
    const out: T[] = [];
    while (out.length < k && copy.length) out.push(copy.splice(Math.floor(this.f() * copy.length), 1)[0]);
    return out;
  }
  alnum(n: number, alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789"): string {
    let s = "";
    for (let i = 0; i < n; i++) s += alphabet[Math.floor(this.f() * alphabet.length)];
    return s;
  }
  hex(n: number): string {
    return this.alnum(n, "0123456789abcdef");
  }
}

/** Small stable string hash (FNV-1a) used to derive per-item seeds. */
export function hashStr(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// ---------------------------------------------------------------------------
// Model
// ---------------------------------------------------------------------------

export const LABELS: { id: string; name: LabelName; color: string }[] = [
  { id: "Label_1", name: "Vendors", color: "#4a86e8" },
  { id: "Label_2", name: "Hiring", color: "#16a766" },
  { id: "Label_3", name: "Incidents", color: "#e66550" },
  { id: "Label_4", name: "Finance", color: "#ffad47" },
  { id: "Label_5", name: "Receipts", color: "#8e63ce" },
];
const LABEL_ID: Record<LabelName, string> = { Vendors: "Label_1", Hiring: "Label_2", Incidents: "Label_3", Finance: "Label_4", Receipts: "Label_5" };

export const SYSTEM_FOLDERS = ["INBOX", "SENT", "DRAFT", "TRASH", "SPAM", "ARCHIVE"] as const;

/** What a person "is" for rendering: identity plus signature data. */
export interface Sender {
  key: string;
  person: Person;
  title: string;
  org: string;
  phone: string | null;
  client: MailClient;
}

export type BodySpec =
  | { kind: "conv"; text: string; sender: Sender; mobile: boolean; fwd: boolean }
  | { kind: "newsletter"; def: number; issue: number; intro: number; items: number[]; cta: number; token: string }
  | { kind: "notice"; brand: string; accent: string; title: string; text: string; button: { label: string; url: string } | null; footer: string; html: boolean }
  | { kind: "marketing"; brand: string; domain: string; accent: string; text: string; token: string; unsubUrl: string }
  | { kind: "receipt"; def: number; num: string; brand: string; note: string }
  | { kind: "list"; text: string; sender: Sender; listName: string; listAddress: string }
  | { kind: "raw"; html: string | null; text: string };

export interface DemoAttachment extends AttachmentMeta {
  /** Bytes for attachments that were uploaded via send(). */
  data?: Buffer;
  /** Brand colour for generated images. */
  accent?: string;
}

export interface DemoMessage {
  meta: MessageMeta;
  attachments: DemoAttachment[];
  body: BodySpec;
  /** Message this one replies to (quoted in the body). */
  parent: DemoMessage | null;
  /** Version of the last change (for changes()). */
  version: number;
  /** Lower-cased search haystack, built lazily. */
  haystack?: string;
}

export interface DemoThread {
  id: string;
  key: string | null;
  messages: DemoMessage[]; // oldest first
}

export interface Mailbox {
  me: Person;
  meSender: Sender;
  now: number;
  messages: Map<string, DemoMessage>;
  threads: Map<string, DemoThread>;
  threadByKey: Map<string, DemoThread>;
  byHeader: Map<string, DemoMessage>;
  nextMessage: number;
  nextThread: number;
  /** Senders by lower-cased email (for auto-replies). */
  senders: Map<string, Sender>;
  rng: Rng;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const HOUR = 3_600_000;
const DAY = 86_400_000;

export function pad(n: number, w: number): string {
  return String(n).padStart(w, "0");
}

export function msgId(n: number): string {
  return `m${pad(n, 6)}`;
}
export function threadIdOf(n: number): string {
  return `t${pad(n, 5)}`;
}

function domainOf(email: string): string {
  return email.slice(email.indexOf("@") + 1);
}

function firstName(name: string): string {
  return name.split(/\s+/)[0];
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function fmtPerson(p: Person): string {
  return `${p.name} <${p.email}>`;
}

const clean = (s: string): string => s.replace(/[  ]/g, " ");

export function fmtGmailAttr(ms: number): string {
  const d = new Date(ms);
  const day = new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);
  return clean(`${day} at ${time}`);
}

function fmtOutlookSent(ms: number): string {
  const d = new Date(ms);
  const day = new Intl.DateTimeFormat("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);
  return clean(`${day} ${time}`);
}

function fmtIphone(ms: number): string {
  const d = new Date(ms);
  const day = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { hour: "numeric", minute: "2-digit" }).format(d);
  return clean(`${day}, at ${time}`);
}

function fmtShortDate(ms: number): string {
  return clean(new Intl.DateTimeFormat("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric" }).format(new Date(ms)));
}

function fmtCalTime(ms: number): string {
  const d = new Date(ms);
  const h = d.getHours();
  const m = d.getMinutes();
  const suffix = h >= 12 ? "pm" : "am";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${pad(m, 2)}${suffix}` : `${h12}${suffix}`;
}

function tzAbbr(ms: number): string {
  const part = new Intl.DateTimeFormat("en-US", { timeZoneName: "short" }).formatToParts(new Date(ms)).find((p) => p.type === "timeZoneName");
  return part?.value ?? "UTC";
}

function linkify(escaped: string): string {
  return escaped.replace(/\bhttps?:\/\/[^\s<>"']+[^\s<>"'.,;:)]/g, (u) => `<a href="${u}">${u}</a>`);
}

/** Convert authored plain text (paragraphs, "- " bullets) to client-flavoured HTML. */
export function textToHtml(text: string, client: MailClient | "generic"): string {
  const paras = text.trim().split(/\n{2,}/);
  const out: string[] = [];
  const outlook = client === "outlook";
  const line = (s: string) => (outlook ? `<div style="margin:0">${s}</div>` : `<div>${s}</div>`);
  for (const para of paras) {
    const lines = para.split("\n");
    let list: string[] | null = null;
    const chunk: string[] = [];
    const flushList = () => {
      if (list) chunk.push(`<ul style="margin:4px 0 4px 0;padding-left:24px">${list.map((l) => `<li>${l}</li>`).join("")}</ul>`);
      list = null;
    };
    for (const raw of lines) {
      const bullet = /^\s*[-•*]\s+(.*)$/.exec(raw);
      const esc = (s: string) => linkify(escapeHtml(s));
      if (bullet) {
        (list ??= []).push(esc(bullet[1]));
      } else {
        flushList();
        chunk.push(line(esc(raw) || "<br>"));
      }
    }
    flushList();
    out.push(chunk.join(""));
  }
  return out.join(line("<br>"));
}

function quoteText(text: string): string {
  return text
    .split("\n")
    .map((l) => (l.startsWith(">") ? `>${l}` : l ? `> ${l}` : ">"))
    .join("\n");
}

export function snippetOf(text: string): string {
  const s = text.replace(/\s+/g, " ").trim();
  return s.length > 160 ? `${s.slice(0, 157).trimEnd()}...` : s;
}

// ---------------------------------------------------------------------------
// Signatures
// ---------------------------------------------------------------------------

const ORG_BRAND: Record<string, string> = {
  "contoso.example": "#0f6cbd",
  "fabrikam.example": "#c2410c",
  "litware.example": "#334155",
  "tailspin.example": "#0e7490",
};
const LOGO_DOMAINS = new Set(["contoso.example", "fabrikam.example"]);
const LOGO_CID: Record<string, string> = {
  "contoso.example": "image001.png@01DB3A7E.4C1F2B90",
  "fabrikam.example": "image001.png@01DB2C4F.5A3E8B20",
};

const FABRIKAM_DISCLAIMER =
  "CONFIDENTIALITY NOTICE: This e-mail message, including any attachments, is for the sole use of the intended recipient(s) and may contain confidential and privileged information of Fabrikam, Inc. Any unauthorized review, use, disclosure or distribution is prohibited. If you are not the intended recipient, please contact the sender by reply e-mail and destroy all copies of the original message.";
const CONTOSO_DISCLAIMER =
  "This message is intended only for the addressee and may contain information that is confidential. If you received it in error, please notify the sender and delete it. Contoso Consulting LLC.";

function sigText(s: Sender): string {
  const d = domainOf(s.person.email);
  if (s.client === "outlook") {
    const lines = [s.person.name, s.org ? `${s.title} | ${s.org}` : s.title];
    if (s.phone) lines.push(`M: ${s.phone}`);
    lines.push(`www.${d}`);
    let t = lines.join("\n");
    if (d === "fabrikam.example") t += `\n\n${FABRIKAM_DISCLAIMER}`;
    if (d === "contoso.example") t += `\n\n${CONTOSO_DISCLAIMER}`;
    return t;
  }
  const lines = [s.person.name];
  if (s.title && s.org) lines.push(s.client === "plain" ? `${s.title}, ${s.org}` : `${s.title} | ${s.org}`);
  if (s.phone && s.client !== "plain") lines.push(s.phone);
  return `-- \n${lines.join("\n")}`;
}

function sigHtml(s: Sender): string {
  const d = domainOf(s.person.email);
  if (s.client === "outlook") {
    const brand = ORG_BRAND[d] ?? "#323130";
    const logo = LOGO_DOMAINS.has(d)
      ? `<td style="padding:0 12px 0 0;border-right:2px solid ${brand};vertical-align:top"><img src="cid:${LOGO_CID[d]}" width="64" height="64" alt="${escapeHtml(s.org)}" style="display:block;width:64px;height:64px"></td>`
      : "";
    const pl = logo ? "padding:0 0 0 12px" : "padding:0";
    let html =
      `<div id="Signature"><table cellpadding="0" cellspacing="0" border="0" style="font-family:'Segoe UI',Arial,sans-serif;font-size:10pt;color:#323130;margin-top:12px"><tr>${logo}` +
      `<td style="${pl};vertical-align:top;line-height:1.45"><b style="font-size:11pt;color:#201f1e">${escapeHtml(s.person.name)}</b><br>${escapeHtml(s.title)}<br>` +
      (s.org ? `<b style="color:${brand}">${escapeHtml(s.org)}</b><br>` : "") +
      (s.phone ? `M: <a href="tel:${s.phone.replace(/[^+\d]/g, "")}" style="color:#323130;text-decoration:none">${escapeHtml(s.phone)}</a><br>` : "") +
      `<a href="https://www.${d}" style="color:${brand}">www.${d}</a></td></tr></table>`;
    if (d === "fabrikam.example") html += `<p style="font-family:Arial,sans-serif;font-size:7.5pt;color:#8a8886;line-height:1.3;margin-top:12px;max-width:640px">${FABRIKAM_DISCLAIMER}</p>`;
    if (d === "contoso.example") html += `<p style="font-family:Arial,sans-serif;font-size:7.5pt;color:#8a8886;margin-top:10px">${CONTOSO_DISCLAIMER}</p>`;
    return `${html}</div>`;
  }
  const lines = [`<b>${escapeHtml(s.person.name)}</b>`];
  if (s.title && s.org) lines.push(`<span style="color:#555">${escapeHtml(s.title)} | ${escapeHtml(s.org)}</span>`);
  if (s.phone) lines.push(`<span style="color:#888">${escapeHtml(s.phone)}</span>`);
  return `<br><span class="gmail_signature_prefix">-- </span><br><div dir="ltr" class="gmail_signature" data-smartmail="gmail_signature"><div dir="ltr">${lines.join("<br>")}</div></div>`;
}

// ---------------------------------------------------------------------------
// Rendering: conversation messages (with quoted history)
// ---------------------------------------------------------------------------

export interface Rendered {
  html: string | null;
  text: string;
}

function recipientsLine(ps: Person[]): string {
  return ps.map((p) => `${p.name} <${p.email}>`).join("; ");
}

function outlookHeaderHtml(parent: DemoMessage): string {
  const m = parent.meta;
  const rows = [
    `<b>From:</b> ${escapeHtml(fmtPerson(m.from))}`,
    `<b>Sent:</b> ${fmtOutlookSent(Date.parse(m.date))}`,
    `<b>To:</b> ${escapeHtml(recipientsLine(m.to))}`,
  ];
  if (m.cc.length) rows.push(`<b>Cc:</b> ${escapeHtml(recipientsLine(m.cc))}`);
  rows.push(`<b>Subject:</b> ${escapeHtml(m.subject)}`);
  return `<div id="appendonsend"></div><hr style="display:inline-block;width:98%" tabindex="-1"><div id="divRplyFwdMsg" dir="ltr"><font face="Calibri, sans-serif" style="font-size:11pt" color="#000000">${rows.join("<br>")}</font><div>&nbsp;</div></div>`;
}

function outlookHeaderText(parent: DemoMessage): string {
  const m = parent.meta;
  const rows = [`From: ${fmtPerson(m.from)}`, `Sent: ${fmtOutlookSent(Date.parse(m.date))}`, `To: ${recipientsLine(m.to)}`];
  if (m.cc.length) rows.push(`Cc: ${recipientsLine(m.cc)}`);
  rows.push(`Subject: ${m.subject}`);
  return `________________________________\n${rows.join("\n")}`;
}

function forwardHeaderText(parent: DemoMessage): string {
  const m = parent.meta;
  const rows = [`From: ${fmtPerson(m.from)}`, `Date: ${fmtGmailAttr(Date.parse(m.date))}`, `Subject: ${m.subject}`, `To: ${m.to.map(fmtPerson).join(", ")}`];
  if (m.cc.length) rows.push(`Cc: ${m.cc.map(fmtPerson).join(", ")}`);
  return `---------- Forwarded message ---------\n${rows.join("\n")}`;
}

export function renderMessage(msg: DemoMessage, depth = 2, top = true): Rendered {
  const b = msg.body;
  switch (b.kind) {
    case "conv":
      return renderConv(msg, b, depth, top);
    case "raw":
      return { html: b.html, text: b.text };
    case "newsletter":
      return renderNewsletter(msg, b);
    case "notice":
      return renderNotice(msg, b);
    case "marketing":
      return renderMarketing(msg, b);
    case "receipt":
      return renderReceipt(msg, b);
    case "list":
      return renderList(b);
  }
}

function renderConv(msg: DemoMessage, b: Extract<BodySpec, { kind: "conv" }>, depth: number, top: boolean): Rendered {
  const s = b.sender;
  const parent = depth > 0 ? msg.parent : null;
  const pr = parent ? renderMessage(parent, depth - 1, false) : null;
  const parentHtml = pr ? (pr.html ?? `<div dir="ltr">${textToHtml(pr.text, "generic")}</div>`) : "";
  const pFrom = parent?.meta.from;
  const pDate = parent ? Date.parse(parent.meta.date) : 0;

  if (b.mobile) {
    const text = `${b.text}\n\nSent from my iPhone` + (parent && pr && pFrom ? `\n\n> On ${fmtIphone(pDate)}, ${pFrom.name} <${pFrom.email}> wrote:\n>\n${quoteText(pr.text)}` : "");
    const html =
      `<div dir="ltr">${textToHtml(b.text, "gmail")}</div><div dir="ltr"><br></div><div dir="ltr">Sent from my iPhone</div>` +
      (parent && pFrom ? `<div dir="ltr"><br><blockquote type="cite">On ${fmtIphone(pDate)}, ${escapeHtml(pFrom.name)} &lt;${escapeHtml(pFrom.email)}&gt; wrote:<br><br></blockquote></div><blockquote type="cite"><div dir="ltr">${parentHtml}</div></blockquote>` : "");
    return { html, text };
  }

  if (s.client === "plain") {
    let text = `${b.text}\n\n${sigText(s)}`;
    if (parent && pr && pFrom) {
      text += b.fwd ? `\n\n${forwardHeaderText(parent)}\n\n${pr.text}` : `\n\nOn ${fmtGmailAttr(pDate)}, ${pFrom.name} <${pFrom.email}> wrote:\n${quoteText(pr.text)}`;
    }
    return { html: null, text };
  }

  if (s.client === "outlook") {
    const font = `font-family:Aptos,Calibri,Helvetica,sans-serif;font-size:11pt;color:rgb(0,0,0)`;
    let html = `<div class="elementToProof" style="${font}">${textToHtml(b.text, "outlook")}</div>${sigHtml(s)}`;
    let text = `${b.text}\n\n${sigText(s)}`;
    if (parent && pr) {
      html += `${outlookHeaderHtml(parent)}<div>${parentHtml}</div>`;
      text += `\n\n${outlookHeaderText(parent)}\n\n${pr.text}`;
    }
    return { html: top ? `<html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"></head><body><div dir="ltr">${html}</div></body></html>` : `<div dir="ltr">${html}</div>`, text };
  }

  // gmail
  let html = `<div dir="ltr">${textToHtml(b.text, "gmail")}${sigHtml(s)}</div>`;
  let text = `${b.text}\n\n${sigText(s)}`;
  if (parent && pr && pFrom) {
    if (b.fwd) {
      const m = parent.meta;
      html +=
        `<br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">---------- Forwarded message ---------<br>From: <strong class="gmail_sendername" dir="auto">${escapeHtml(m.from.name)}</strong> <span dir="auto">&lt;${escapeHtml(m.from.email)}&gt;</span><br>Date: ${fmtGmailAttr(pDate)}<br>Subject: ${escapeHtml(m.subject)}<br>To: ${escapeHtml(m.to.map(fmtPerson).join(", "))}<br></div><br><br>${parentHtml}</div>`;
      text += `\n\n${forwardHeaderText(parent)}\n\n${pr.text}`;
    } else {
      html +=
        `<br><div class="gmail_quote gmail_quote_container"><div dir="ltr" class="gmail_attr">On ${fmtGmailAttr(pDate)} ${escapeHtml(pFrom.name)} &lt;<a href="mailto:${escapeHtml(pFrom.email)}">${escapeHtml(pFrom.email)}</a>&gt; wrote:<br></div>` +
        `<blockquote class="gmail_quote" style="margin:0px 0px 0px 0.8ex;border-left:1px solid rgb(204,204,204);padding-left:1ex">${parentHtml}</blockquote></div>`;
      text += `\n\nOn ${fmtGmailAttr(pDate)} ${pFrom.name} <${pFrom.email}> wrote:\n\n${quoteText(pr.text)}`;
    }
  }
  return { html, text };
}

function renderList(b: Extract<BodySpec, { kind: "list" }>): Rendered {
  const footer = `You received this message because you are subscribed to the "${b.listName}" group.\nTo unsubscribe from this group and stop receiving emails from it, send an email to ${b.listName}+unsubscribe@lists.northwind.example.\nTo view this discussion, visit https://lists.northwind.example/g/${b.listName}/`;
  const text = `${b.text}\n\n${sigText(b.sender)}\n\n-- \n${footer}`;
  const html = `<div dir="ltr">${textToHtml(b.text, "gmail")}${sigHtml(b.sender)}</div><p></p>-- <br><span style="font-size:12px;color:#5f6368">${textToHtml(footer, "generic")}</span>`;
  return { html, text };
}

// ---------------------------------------------------------------------------
// Rendering: automated mail
// ---------------------------------------------------------------------------

const TRACK = "https://track.newsletter.example/open.gif";

function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60);
}

function renderNewsletter(msg: DemoMessage, b: Extract<BodySpec, { kind: "newsletter" }>): Rendered {
  const def = NEWSLETTERS[b.def];
  const domain = domainOf(def.fromEmail);
  const items = b.items.map((i) => def.items[i]);
  const intro = def.intros[b.intro];
  const cta = def.ctas[b.cta];
  const dateStr = fmtShortDate(Date.parse(msg.meta.date));
  const unsub = `${def.unsubUrl}?u=${b.token}`;
  const link = (title: string) => `https://${domain}/r/${slug(title)}?utm_source=newsletter&utm_medium=email&u=${b.token}`;
  const accent = def.accent;
  const font = "font-family:-apple-system,'Segoe UI',Helvetica,Arial,sans-serif";

  let rows = "";
  if (def.layout === "minimal") {
    rows = items
      .map((it) => `<tr><td style="padding:10px 0;border-bottom:1px solid #eee;${font};font-size:15px;line-height:1.5"><a href="${link(it.title)}" style="color:${accent};font-weight:600;text-decoration:none">${escapeHtml(it.title)}</a> <span style="color:#555">— ${escapeHtml(it.blurb)}</span></td></tr>`)
      .join("");
  } else {
    rows = items
      .map((it, idx) => {
        const hero = idx === 0 ? `<img src="https://images.${domain}/stories/${slug(it.title)}.jpg" width="544" height="272" alt="" style="display:block;width:100%;max-width:544px;height:auto;border:0;border-radius:4px;margin:0 0 12px">` : "";
        const tag = it.tag ? `<div style="font-size:11px;letter-spacing:.08em;text-transform:uppercase;color:${accent};font-weight:700;margin-bottom:4px">${escapeHtml(it.tag)}</div>` : "";
        return `<tr><td style="padding:18px 28px;border-top:1px solid #eef0f3;${font}">${hero}${tag}<a href="${link(it.title)}" style="font-size:18px;line-height:1.35;color:#111827;font-weight:700;text-decoration:none">${escapeHtml(it.title)}</a><p style="margin:6px 0 0;font-size:15px;line-height:1.55;color:#374151">${escapeHtml(it.blurb)}</p></td></tr>`;
      })
      .join("");
  }
  const button = `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:8px auto 24px"><tr><td style="background:${accent};border-radius:4px"><a href="https://${domain}/issues/${b.issue}?u=${b.token}" style="display:inline-block;padding:12px 22px;${font};font-size:15px;color:#ffffff;text-decoration:none;font-weight:600">${escapeHtml(cta)}</a></td></tr></table>`;
  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(msg.meta.subject)}</title></head>` +
    `<body style="margin:0;padding:0;background:#f3f4f6">` +
    `<div style="display:none;max-height:0;overflow:hidden;opacity:0">${escapeHtml(intro.slice(0, 120))}</div>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:6px;overflow:hidden">` +
    `<tr><td style="background:${accent};padding:18px 28px"><img src="https://cdn.${domain}/email/logo-white.png" width="150" height="30" alt="${escapeHtml(def.fromName)}" style="display:block;border:0;color:#fff;${font};font-size:20px;font-weight:700"></td></tr>` +
    `<tr><td style="padding:20px 28px 4px;${font};font-size:12px;color:#6b7280">Issue #${b.issue} · ${dateStr} · <a href="https://${domain}/issues/${b.issue}?u=${b.token}" style="color:#6b7280">View in browser</a></td></tr>` +
    `<tr><td style="padding:8px 28px 16px;${font};font-size:16px;line-height:1.6;color:#1f2937">${escapeHtml(intro)}</td></tr>` +
    (def.layout === "minimal" ? `<tr><td style="padding:0 28px"><table role="presentation" width="100%">${rows}</table></td></tr>` : rows) +
    `<tr><td align="center" style="padding:12px 28px 0">${button}</td></tr>` +
    `<tr><td style="padding:20px 28px;background:#f9fafb;${font};font-size:12px;line-height:1.6;color:#6b7280">You're receiving this email because you subscribed to ${escapeHtml(def.fromName)} as ${escapeHtml(msg.meta.to[0]?.email ?? "")}.<br>` +
    `<a href="${unsub}" style="color:#6b7280">Unsubscribe</a> · <a href="https://${domain}/preferences?u=${b.token}" style="color:#6b7280">Manage preferences</a> · <a href="https://${domain}/privacy" style="color:#6b7280">Privacy</a><br>${escapeHtml(def.fromName)} · 500 Example Avenue, Suite 210 · Springfield</td></tr>` +
    `</table></td></tr></table>` +
    `<img src="${TRACK}?u=${b.token}&amp;c=${def.key}-${b.issue}" width="1" height="1" alt="" style="display:block;width:1px;height:1px;border:0">` +
    `</body></html>`;
  const text =
    `${def.fromName} — Issue #${b.issue} (${dateStr})\nView in browser: https://${domain}/issues/${b.issue}\n\n${intro}\n\n` +
    items.map((it) => `${it.tag ? `[${it.tag}] ` : ""}${it.title}\n${it.blurb}\n${link(it.title)}`).join("\n\n") +
    `\n\n${cta}: https://${domain}/issues/${b.issue}\n\n--\nYou're receiving this email because you subscribed to ${def.fromName}.\nUnsubscribe: ${unsub}`;
  return { html, text };
}

function noticeShell(brand: string, accent: string, title: string, bodyHtml: string, footer: string, button: { label: string; url: string } | null): string {
  const font = "font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif";
  const btn = button
    ? `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:20px 0 4px"><tr><td style="background:${accent};border-radius:4px"><a href="${button.url}" style="display:inline-block;padding:10px 18px;${font};font-size:14px;font-weight:600;color:#ffffff;text-decoration:none">${escapeHtml(button.label)}</a></td></tr></table>`
    : "";
  return (
    `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;padding:0;background:#f6f8fa">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f6f8fa"><tr><td align="center" style="padding:24px 12px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border:1px solid #e1e4e8;border-radius:6px">` +
    `<tr><td style="padding:14px 24px;border-bottom:3px solid ${accent};${font};font-size:14px;font-weight:700;color:${accent}">${escapeHtml(brand)}</td></tr>` +
    `<tr><td style="padding:20px 24px 4px;${font};font-size:18px;font-weight:600;color:#24292f">${escapeHtml(title)}</td></tr>` +
    `<tr><td style="padding:8px 24px 20px;${font};font-size:14px;line-height:1.6;color:#24292f">${bodyHtml}${btn}</td></tr>` +
    `<tr><td style="padding:14px 24px;background:#f6f8fa;border-top:1px solid #e1e4e8;${font};font-size:12px;line-height:1.5;color:#6e7781">${textToHtml(footer, "generic")}</td></tr>` +
    `</table></td></tr></table></body></html>`
  );
}

function renderNotice(_msg: DemoMessage, b: Extract<BodySpec, { kind: "notice" }>): Rendered {
  const text = `${b.text}${b.button ? `\n\n${b.button.label}: ${b.button.url}` : ""}\n\n--\n${b.footer}`;
  if (!b.html) return { html: null, text };
  return { html: noticeShell(b.brand, b.accent, b.title, textToHtml(b.text, "generic"), b.footer, b.button), text };
}

function renderMarketing(msg: DemoMessage, b: Extract<BodySpec, { kind: "marketing" }>): Rendered {
  const font = "font-family:Helvetica,Arial,sans-serif";
  const paras = b.text.trim().split(/\n{2,}/);
  const body = paras.map((p) => `<p style="margin:0 0 16px;font-size:16px;line-height:1.6;color:#1f2937">${linkify(escapeHtml(p)).replace(/\n/g, "<br>")}</p>`).join("");
  const n = hashStr(msg.meta.subject) % 9;
  const html =
    `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width"></head><body style="margin:0;background:#eef2f7">` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:20px 10px">` +
    `<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff">` +
    `<tr><td style="padding:20px 32px"><img src="https://cdn.${b.domain}/email/logo.png" width="140" height="32" alt="${escapeHtml(b.brand)}" style="display:block;border:0;${font};font-size:22px;font-weight:700;color:${b.accent}"></td></tr>` +
    `<tr><td><a href="https://${b.domain}/lp/${slug(msg.meta.subject)}?utm_source=email&amp;u=${b.token}"><img src="https://cdn.${b.domain}/email/hero-${n}.jpg" width="600" height="260" alt="${escapeHtml(msg.meta.subject)}" style="display:block;width:100%;height:auto;border:0;background:${b.accent}"></a></td></tr>` +
    `<tr><td style="padding:28px 32px 8px;${font}">${body}</td></tr>` +
    `<tr><td style="padding:0 32px 28px"><table role="presentation" cellpadding="0" cellspacing="0"><tr><td style="background:${b.accent};border-radius:999px"><a href="https://${b.domain}/lp/${slug(msg.meta.subject)}?utm_source=email&amp;u=${b.token}" style="display:inline-block;padding:13px 26px;${font};font-size:15px;font-weight:700;color:#fff;text-decoration:none">Learn more</a></td></tr></table></td></tr>` +
    `<tr><td style="padding:18px 32px;background:#f8fafc;${font};font-size:11px;line-height:1.6;color:#64748b">You are receiving this email because you registered for content from ${escapeHtml(b.brand)}.<br><a href="${b.unsubUrl}?u=${b.token}" style="color:#64748b">Unsubscribe</a> or <a href="https://${b.domain}/email/preferences?u=${b.token}" style="color:#64748b">update your email preferences</a>.<br>${escapeHtml(b.brand)} · 77 Example Plaza · Metropolis</td></tr>` +
    `</table></td></tr></table><img src="${TRACK}?u=${b.token}&amp;c=${slug(b.brand)}" width="1" height="1" alt="" style="display:block;border:0"></body></html>`;
  const text = `${b.text}\n\n--\nUnsubscribe: ${b.unsubUrl}?u=${b.token}`;
  return { html, text };
}

function money(n: number): string {
  return `$${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function renderReceipt(msg: DemoMessage, b: Extract<BodySpec, { kind: "receipt" }>): Rendered {
  const def = RECEIPTS[b.def];
  const total = def.lines.reduce((s, l) => s + l.amount, 0);
  const date = fmtShortDate(Date.parse(msg.meta.date));
  const rows = def.lines
    .map((l) => `<tr><td style="padding:8px 0;border-bottom:1px solid #eee">${escapeHtml(l.item)}</td><td align="right" style="padding:8px 0;border-bottom:1px solid #eee;white-space:nowrap">${money(l.amount)}</td></tr>`)
    .join("");
  const bodyHtml =
    `<p style="margin:0 0 12px">Receipt #${escapeHtml(b.num)} · ${date}</p>` +
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="font-size:14px">${rows}<tr><td style="padding:10px 0;font-weight:700">Total charged</td><td align="right" style="padding:10px 0;font-weight:700">${money(total)}</td></tr></table>` +
    `<p style="margin:12px 0 0;color:#57606a">Paid with Corporate card ending in 4417.</p><p style="margin:12px 0 0">${escapeHtml(b.note)}</p>`;
  const html = noticeShell(def.fromName, "#1f2937", msg.meta.subject, bodyHtml, `${def.fromName} · This receipt was sent to ${msg.meta.to[0]?.email ?? ""}.`, null);
  const text =
    `${def.fromName}\nReceipt #${b.num} · ${date}\n\n` + def.lines.map((l) => `${l.item}  ${money(l.amount)}`).join("\n") + `\n\nTotal charged: ${money(total)}\nPaid with Corporate card ending in 4417.\n\n${b.note}`;
  return { html, text };
}

// ---------------------------------------------------------------------------
// Attachments: metadata and bytes
// ---------------------------------------------------------------------------

const MIME: Record<string, string> = {
  pdf: "application/pdf",
  png: "image/png",
  jpg: "image/jpeg",
  csv: "text/csv",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  zip: "application/zip",
  ics: "text/calendar",
  json: "application/json",
  yaml: "application/yaml",
  md: "text/markdown",
  txt: "text/plain",
};
const SIZE_RANGE: Record<string, [number, number]> = {
  pdf: [84_000, 1_900_000],
  png: [38_000, 420_000],
  csv: [2_400, 64_000],
  xlsx: [18_000, 240_000],
  docx: [24_000, 310_000],
  pptx: [1_200_000, 6_400_000],
  zip: [200_000, 4_000_000],
  ics: [1_400, 3_200],
};

export function mimeFor(filename: string): string {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  return MIME[ext] ?? "application/octet-stream";
}

function attachmentMeta(filename: string, idx: number, rng: Rng): DemoAttachment {
  const ext = filename.split(".").pop()?.toLowerCase() ?? "";
  const [lo, hi] = SIZE_RANGE[ext] ?? [4_000, 90_000];
  return { id: `att${idx + 1}`, filename, mimeType: mimeFor(filename), size: rng.int(lo, hi), inline: false, contentId: null };
}

function logoAttachment(domain: string): DemoAttachment {
  return { id: "inl1", filename: "image001.png", mimeType: "image/png", size: 4_812, inline: true, contentId: LOGO_CID[domain], accent: ORG_BRAND[domain] };
}

function pdfEscape(s: string): string {
  return s.replace(/[^\x20-\x7e]/g, "-").replace(/([()\\])/g, "\\$1");
}

export function makePdf(title: string, lines: string[]): Buffer {
  const content = ["BT", "/F1 20 Tf", "72 720 Td", `(${pdfEscape(title)}) Tj`, "/F1 11 Tf", "0 -28 Td"];
  for (const l of lines) content.push(`(${pdfEscape(l)}) Tj`, "0 -16 Td");
  content.push("ET");
  const stream = content.join("\n");
  const objs = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  objs.forEach((o, i) => {
    offsets.push(Buffer.byteLength(out, "latin1"));
    out += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = Buffer.byteLength(out, "latin1");
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
  for (const off of offsets) out += `${pad(off, 10)} 00000 n \n`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(out, "latin1");
}

function pngChunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type, "latin1"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(td) >>> 0);
  return Buffer.concat([len, td, crc]);
}

export function makePng(width: number, height: number, hex: string): Buffer {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  const raw = Buffer.alloc((width * 3 + 1) * height);
  for (let y = 0; y < height; y++) {
    const row = y * (width * 3 + 1);
    raw[row] = 0;
    for (let x = 0; x < width; x++) {
      const band = (x + y) % 24 < 12;
      const k = band ? 1 : 0.82;
      raw[row + 1 + x * 3] = Math.round(r * k);
      raw[row + 2 + x * 3] = Math.round(g * k);
      raw[row + 3 + x * 3] = Math.round(b * k);
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // RGB
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), pngChunk("IHDR", ihdr), pngChunk("IDAT", deflateSync(raw)), pngChunk("IEND", Buffer.alloc(0))]);
}

/** Minimal ZIP writer (stored entries) for .xlsx/.docx/.zip placeholders. */
export function makeZip(files: { name: string; data: Buffer }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const name = Buffer.from(f.name, "utf8");
    const crc = crc32(f.data) >>> 0;
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0x21, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(f.data.length, 18);
    lh.writeUInt32LE(f.data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, name, f.data);
    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0x21, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(f.data.length, 20);
    ch.writeUInt32LE(f.data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, name);
    offset += 30 + name.length + f.data.length;
  }
  const cd = Buffer.concat(centrals);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(cd.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, end]);
}

function xmlEsc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function csvRowsFor(filename: string): string[][] {
  const f = filename.toLowerCase();
  if (f.includes("rollback")) {
    return [
      ["Component", "Trigger", "Threshold", "Window", "Decision owner", "Rollback steps", "Est. duration"],
      ["payments-api", "Error rate", "> 0.5%", "5 min", "Priya Raman (IC)", "DNS revert + drain landing zone pool", "15 min"],
      ["payments-api", "Fast trip error rate", "> 2%", "1 min", "Priya Raman (IC)", "DNS revert", "10 min"],
      ["payments-api", "p99 latency", "> 800 ms", "5 min sustained", "Priya Raman (IC)", "DNS revert", "15 min"],
      ["auth-gateway", "Login failure rate", "> 1%", "5 min", "Noah Fischer", "Revert session store pointer", "20 min"],
      ["ledger", "Replication lag", "> 30 s", "3 min", "Nora Lindqvist", "Stop writes, fail back to ledger-pg-03.dal1", "2 h 10 min"],
      ["settlement", "Batch failure", "2 consecutive", "n/a", "Ben Carter", "Re-run in DAL1", "45 min"],
    ];
  }
  if (f.includes("egress") || f.includes("nat")) {
    return [
      ["Range", "Purpose", "Region", "Status"],
      ["198.51.100.32/28", "payments-api egress (primary)", "us-central", "final"],
      ["198.51.100.48/28", "payments-api egress (secondary)", "us-central", "final"],
      ["203.0.113.64/28", "settlement batch egress (phase 2)", "us-central", "final"],
      ["192.0.2.0/27", "DAL1 legacy (remove after phase 2)", "dal1", "existing"],
    ];
  }
  if (f.includes("timeline")) {
    return [
      ["Time", "Event", "Owner"],
      ["21:58", "p99 latency alert fires for payments-api", "Pagerline"],
      ["22:04", "Incident declared, bridge opened", "Paul Henriksen"],
      ["22:11", "PgBouncer cl_waiting > 400 observed on ledger pool", "Jonah Feld"],
      ["22:23", "Config push identified as trigger; rollback started", "Ines Duarte"],
      ["22:38", "Retry storm from mobile clients throttled", "Aisha Khan"],
      ["22:45", "Latency back under SLO", "Priya Raman"],
    ];
  }
  if (f.includes("usage") || f.includes("ingest") || f.includes("spend") || f.includes("reforecast") || f.includes("estimate") || f.includes("headcount")) {
    return [
      ["Team", "Q1", "Q2", "Q3", "Q4 (forecast)", "Notes"],
      ["Platform Runtime", "48210", "51344", "55902", "58100", "Includes load-test cluster"],
      ["Payments", "36120", "37005", "39870", "41200", ""],
      ["Data Platform", "29400", "31220", "34015", "36900", "Kafka tiered storage pending"],
      ["Identity", "11208", "11950", "12404", "12600", ""],
      ["Developer Experience", "8805", "9120", "9433", "9800", "Preview environments"],
    ];
  }
  if (f.includes("access") || f.includes("cohort")) {
    return [
      ["User", "Role", "System", "Last used", "Decision"],
      ["owen.price", "break-glass-admin", "prod-k8s", "41 days ago", "review"],
      ["lena.kowalski", "platform-admin", "prod-k8s", "2 days ago", "keep"],
      ["sam.okoye", "oncall-operator", "prod-k8s", "today", "keep"],
      ["felix.wagner", "db-readonly", "ledger-pg", "9 days ago", "keep"],
    ];
  }
  return [
    ["Item", "Owner", "Status", "Notes"],
    ["Scope confirmed", "Grace Liu", "done", ""],
    ["Dependencies mapped", "Lena Kowalski", "in progress", "Two services outstanding"],
    ["Sign-off", "Alex Morgan", "pending", ""],
  ];
}

function toCsv(rows: string[][]): string {
  return rows.map((r) => r.map((c) => (/[",\n]/.test(c) ? `"${c.replace(/"/g, '""')}"` : c)).join(",")).join("\r\n") + "\r\n";
}

function colName(i: number): string {
  return String.fromCharCode(65 + i);
}

export function makeXlsx(rows: string[][]): Buffer {
  const sheetRows = rows
    .map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => `<c r="${colName(ci)}${ri + 1}" t="inlineStr"><is><t>${xmlEsc(c)}</t></is></c>`).join("")}</row>`)
    .join("");
  const files = [
    {
      name: "[Content_Types].xml",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/></Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`,
      ),
    },
    {
      name: "xl/workbook.xml",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Sheet1" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      ),
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/></Relationships>`,
      ),
    },
    {
      name: "xl/worksheets/sheet1.xml",
      data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${sheetRows}</sheetData></worksheet>`),
    },
  ];
  return makeZip(files);
}

export function makeDocx(title: string, paras: string[]): Buffer {
  const body = [title, ...paras].map((p, i) => `<w:p>${i === 0 ? '<w:pPr><w:pStyle w:val="Title"/></w:pPr>' : ""}<w:r><w:t xml:space="preserve">${xmlEsc(p)}</w:t></w:r></w:p>`).join("");
  return makeZip([
    {
      name: "[Content_Types].xml",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`,
      ),
    },
    {
      name: "_rels/.rels",
      data: Buffer.from(
        `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
      ),
    },
    { name: "word/document.xml", data: Buffer.from(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`) },
  ]);
}

function icsFor(title: string, startMs: number, minutes: number, organizer: Person, attendees: Person[], uid: string): string {
  const fmt = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  return [
    "BEGIN:VCALENDAR",
    "PRODID:-//Northwind//Calendar//EN",
    "VERSION:2.0",
    "METHOD:REQUEST",
    "BEGIN:VEVENT",
    `DTSTART:${fmt(startMs)}`,
    `DTEND:${fmt(startMs + minutes * 60_000)}`,
    `DTSTAMP:${fmt(startMs - DAY)}`,
    `ORGANIZER;CN=${organizer.name}:mailto:${organizer.email}`,
    `UID:${uid}`,
    ...attendees.map((a) => `ATTENDEE;CUTYPE=INDIVIDUAL;ROLE=REQ-PARTICIPANT;PARTSTAT=NEEDS-ACTION;CN=${a.name}:mailto:${a.email}`),
    `SUMMARY:${title.replace(/[,;]/g, (c) => `\\${c}`)}`,
    "LOCATION:https://meet.northwind.example",
    "STATUS:CONFIRMED",
    "END:VEVENT",
    "END:VCALENDAR",
    "",
  ].join("\r\n");
}

/** Produce small but valid bytes for an attachment. */
export function attachmentBytes(msg: DemoMessage, att: DemoAttachment): Buffer {
  if (att.data) return att.data;
  const ext = att.filename.split(".").pop()?.toLowerCase() ?? "";
  const title = att.filename.replace(/\.[^.]+$/, "").replace(/[_-]+/g, " ");
  const date = fmtShortDate(Date.parse(msg.meta.date));
  switch (ext) {
    case "pdf":
      return makePdf(title, [
        `${msg.meta.from.name} · ${date}`,
        `Re: ${msg.meta.subject.replace(/^(re|fw|fwd):\s*/i, "")}`,
        "",
        "This is a placeholder document from the Tidepost demo mailbox.",
        "Northwind - Internal / Confidential",
      ]);
    case "png":
    case "jpg":
      return makePng(att.inline ? 64 : 320, att.inline ? 64 : 180, att.accent ?? "#3b6fb6");
    case "csv":
      return Buffer.from(toCsv(csvRowsFor(att.filename)), "utf8");
    case "xlsx":
      return makeXlsx(csvRowsFor(att.filename));
    case "docx":
      return makeDocx(title, [`Prepared by ${msg.meta.from.name}, ${date}.`, "Placeholder document from the Tidepost demo mailbox."]);
    case "pptx":
    case "zip":
      return makeZip([{ name: "README.txt", data: Buffer.from(`${att.filename}\nPlaceholder archive from the Tidepost demo mailbox.\n`) }]);
    case "ics": {
      const start = Date.parse(msg.meta.date) + 3 * DAY;
      return Buffer.from(icsFor(title, start, 60, msg.meta.from, msg.meta.to, `${msg.meta.id}@calendar.northwind.example`), "utf8");
    }
    case "json":
      return Buffer.from(JSON.stringify({ name: title, generatedBy: "tidepost-demo", date }, null, 2));
    default:
      return Buffer.from(`${att.filename}\n\nPlaceholder file from the Tidepost demo mailbox (${date}).\n`, "utf8");
  }
}

// ---------------------------------------------------------------------------
// Generation
// ---------------------------------------------------------------------------

interface Draft {
  t: ThreadDraft;
  date: number;
  from: Person;
  to: Person[];
  cc: Person[];
  /** Cc used as the reply-all base (without the visibility Cc for Alex). */
  baseCc: Person[];
  replyTo: Person[];
  subject: string;
  body: BodySpec;
  attachments: DemoAttachment[];
  parent: Draft | null;
  bulk: BulkSignals;
  category: string | null;
  importance: "low" | "normal" | "high";
  header: string;
  fromMe: boolean;
  unread: boolean;
  starred: boolean;
  /** Explicit folders (spam/trash) override thread state. */
  forceFolders?: string[];
}

interface ThreadDraft {
  key: string | null;
  drafts: Draft[];
  labels: string[];
  /** undefined = decide by recency. */
  inbox?: boolean;
  unread?: number;
  starred?: boolean;
  /** scripted threads keep their explicit unread state during calibration */
  scripted: boolean;
  bulk: boolean;
  spam?: boolean;
  trash?: boolean;
}

const NO_BULK: BulkSignals = { listId: null, listUnsubscribe: null, listUnsubscribePost: null, precedence: null, autoSubmitted: null };
const AUTO: BulkSignals = { ...NO_BULK, autoSubmitted: "auto-generated", precedence: "bulk" };

function listSignals(listId: string, mailto: string, url: string, precedence = "bulk"): BulkSignals {
  return { listId, listUnsubscribe: `<${mailto}>, <${url}>`, listUnsubscribePost: "List-Unsubscribe=One-Click", precedence, autoSubmitted: null };
}

export class Generator {
  readonly rng: Rng;
  readonly now: number;
  readonly me: Person;
  readonly meSender: Sender;
  readonly senders = new Map<string, Sender>();
  readonly byEmail = new Map<string, Sender>();
  private threads: ThreadDraft[] = [];
  /** Scripts are written against a working day; early in the morning "today" means yesterday. */
  private readonly scriptShift: number;

  constructor(seed: number, now: number, me: Person) {
    this.rng = new Rng(seed);
    this.now = now;
    this.me = me;
    this.meSender = { key: "me", person: me, title: ME_DEFAULT.title, org: ME_DEFAULT.org, phone: ME_DEFAULT.phone, client: "gmail" };
    this.senders.set("me", this.meSender);
    this.scriptShift = new Date(now).getHours() < 9 ? 1 : 0;
    for (const p of PEOPLE) {
      const s: Sender = { key: p.key, person: { name: p.name, email: p.email.toLowerCase() }, title: p.title, org: p.org, phone: p.phone, client: p.client };
      this.senders.set(p.key, s);
      this.byEmail.set(s.person.email, s);
    }
  }

  sender(key: string): Sender {
    const s = this.senders.get(key);
    if (!s) throw new Error(`demo content: unknown person key "${key}"`);
    return s;
  }

  // ---- time ----

  /** Local time `d` days before now at "HH:MM". */
  at(d: number, t: string): number {
    const [h, m] = t.split(":").map(Number);
    const base = new Date(this.now - d * DAY);
    base.setHours(h, m, this.rng.int(0, 59), this.rng.int(0, 999));
    return base.getTime();
  }

  /** Like at(), but never in the future (rolls back a day instead). */
  past(d: number, t: string): number {
    const ms = this.at(d, t);
    return ms > this.now - 5 * 60_000 ? ms - DAY : ms;
  }

  /** Push a timestamp into business hours on a weekday. */
  business(ms: number): number {
    const d = new Date(ms);
    if (d.getHours() < 8) d.setHours(8, this.rng.int(0, 59));
    if (d.getHours() >= 19) d.setHours(this.rng.int(15, 18), this.rng.int(0, 59));
    const wd = d.getDay();
    if (wd === 6) d.setDate(d.getDate() - 1);
    if (wd === 0) d.setDate(d.getDate() + 1);
    return d.getTime();
  }

  /** Ensure a thread's dates are strictly increasing and in the past. */
  private settle(t: ThreadDraft): void {
    const ds = t.drafts;
    for (let i = 1; i < ds.length; i++) if (ds[i].date <= ds[i - 1].date) ds[i].date = ds[i - 1].date + this.rng.int(40, 600) * 1000;
    let cap = this.now - this.rng.int(3, 9) * 60_000;
    for (let i = ds.length - 1; i >= 0; i--) {
      if (ds[i].date > cap) ds[i].date = cap;
      cap = ds[i].date - this.rng.int(2, 11) * 60_000;
    }
  }

  // ---- headers ----

  messageIdFor(s: Sender | null, date: number, fallbackDomain: string): string {
    const r = this.rng;
    if (!s) return `<${r.hex(24)}.${r.int(10000, 99999)}@mailer.${fallbackDomain}>`;
    const domain = domainOf(s.person.email);
    if (s.client === "outlook") {
      const host = `${r.alnum(2, "ABCDEFGHJKLMNPQRSTUVWXYZ")}${r.int(1, 9)}PR${pad(r.int(1, 19), 2)}MB${r.int(1000, 9999)}`;
      return `<${host}${r.alnum(32, "0123456789ABCDEF")}@${host}.namprd${pad(r.int(1, 19), 2)}.prod.${domain}>`;
    }
    if (s.client === "plain") {
      const d = new Date(date);
      const stamp = `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1, 2)}${pad(d.getUTCDate(), 2)}${pad(d.getUTCHours(), 2)}${pad(d.getUTCMinutes(), 2)}${pad(d.getUTCSeconds(), 2)}`;
      return `<${stamp}.GA${r.int(1000, 99999)}@${firstName(s.person.name).toLowerCase()}-wks.${domain}>`;
    }
    return `<CA${r.alnum(1, "BDFHJKLMNPRSTVWXYZ")}${r.alnum(38)}@mail.${domain}>`;
  }

  // ---- recipients ----

  private replyAll(parent: Draft, sender: Person): { to: Person[]; cc: Person[] } {
    const seen = new Set<string>([sender.email]);
    const to: Person[] = [];
    const cc: Person[] = [];
    for (const p of [parent.from, ...parent.to]) if (!seen.has(p.email)) (seen.add(p.email), to.push(p));
    for (const p of parent.baseCc) if (!seen.has(p.email)) (seen.add(p.email), cc.push(p));
    return { to, cc };
  }

  subjectFor(base: string, s: Sender, fwd: boolean): string {
    const hasPrefix = /^\s*(re|fw|fwd)\s*:/i.test(base);
    if (fwd) return `${s.client === "outlook" ? "FW" : "Fwd"}: ${base.replace(/^\s*(re|fw|fwd)\s*:\s*/i, "")}`;
    if (hasPrefix) return s.client === "outlook" ? base.replace(/^\s*re\s*:/i, "RE:") : base;
    return `${s.client === "outlook" ? "RE" : "Re"}: ${base}`;
  }

  /** Make a conversation draft (scripted, generated, or live). */
  convDraft(t: ThreadDraft, opts: { sender: Sender; date: number; text: string; parent: Draft | null; subject?: string; to?: Person[]; cc?: Person[]; add?: Person[]; drop?: string[]; attach?: string[]; mobile?: boolean; fwd?: boolean; important?: boolean; ensureMe?: boolean }): Draft {
    const s = opts.sender;
    let to: Person[];
    let cc: Person[];
    if (opts.to) {
      to = opts.to;
      cc = opts.cc ?? [];
    } else if (opts.parent) {
      ({ to, cc } = this.replyAll(opts.parent, s.person));
    } else {
      to = [];
      cc = opts.cc ?? [];
    }
    if (opts.add) for (const p of opts.add) if (p.email !== s.person.email && !to.some((x) => x.email === p.email) && !cc.some((x) => x.email === p.email)) cc.push(p);
    if (opts.drop?.length) {
      const drop = new Set(opts.drop);
      to = to.filter((p) => !drop.has(p.email));
      cc = cc.filter((p) => !drop.has(p.email));
    }
    const fromMe = s.person.email === this.me.email;
    const hasMe = fromMe || to.some((p) => p.email === this.me.email) || cc.some((p) => p.email === this.me.email);
    // Alex must be able to see the message: loop him in on Cc for visibility.
    const ccOut = !hasMe && opts.ensureMe !== false ? [...cc, this.me] : cc;
    const attachments = (opts.attach ?? []).map((f, i) => attachmentMeta(f, i, this.rng));
    const domain = domainOf(s.person.email);
    if (s.client === "outlook" && LOGO_DOMAINS.has(domain) && !opts.mobile) attachments.push(logoAttachment(domain));
    const subject = opts.subject ?? (opts.parent ? this.subjectFor(opts.parent.subject, s, !!opts.fwd) : "(no subject)");
    const d: Draft = {
      t,
      date: opts.date,
      from: s.person,
      to,
      cc: ccOut,
      baseCc: cc,
      replyTo: [],
      subject,
      body: { kind: "conv", text: opts.text.trim(), sender: s, mobile: !!opts.mobile, fwd: !!opts.fwd },
      attachments,
      parent: opts.parent,
      bulk: NO_BULK,
      category: "personal",
      importance: opts.important ? "high" : "normal",
      header: this.messageIdFor(s, opts.date, domain),
      fromMe,
      unread: false,
      starred: false,
    };
    t.drafts.push(d);
    return d;
  }

  private persons(keys: string[] | undefined): Person[] | undefined {
    return keys?.map((k) => this.sender(k).person);
  }

  // ---- scripted threads ----

  private script(ts: ThreadScript): ThreadDraft {
    const t: ThreadDraft = { key: ts.key, drafts: [], labels: (ts.labels ?? []).map((l) => LABEL_ID[l]), inbox: ts.inbox, unread: ts.unread, starred: ts.starred, scripted: true, bulk: false };
    const drafts: Draft[] = [];
    ts.messages.forEach((m: ScriptMsg, i: number) => {
      const s = this.sender(m.from);
      const parentIdx = m.re ?? i - 1;
      const parent = i === 0 ? null : (drafts[parentIdx] ?? drafts[i - 1]);
      const d = this.convDraft(t, {
        sender: s,
        date: this.at(m.d + this.scriptShift, m.t),
        text: m.text,
        parent,
        subject: i === 0 ? ts.subject : undefined,
        to: this.persons(m.to),
        cc: this.persons(m.cc),
        add: this.persons(m.add),
        drop: m.drop?.map((k) => this.sender(k).person.email),
        attach: m.attach,
        mobile: m.mobile,
        fwd: m.fwd,
        important: m.important,
      });
      drafts.push(d);
    });
    this.settle(t);
    return t;
  }

  // ---- generated work threads ----

  private fill(text: string, slots: Map<string, string>): string {
    return text.replace(/\{(\w+)\}/g, (all, name: string) => {
      const vals = SLOTS[name];
      if (!vals) return all;
      let v = slots.get(name);
      if (!v) {
        v = this.rng.pick(vals);
        slots.set(name, v);
      }
      return v;
    });
  }

  private greeting(toNames: Person[], s: Sender): string {
    const r = this.rng;
    if (toNames.length === 1) {
      const fn = firstName(toNames[0].name);
      return r.pick(s.client === "outlook" ? [`Hi ${fn},`, `Hello ${fn},`, `Dear ${fn},`, `Hi ${fn},`] : [`Hi ${fn},`, `${fn},`, `Hey ${fn} —`, `Hi ${fn},`, ""]);
    }
    return r.pick(["Hi all,", "Hi team,", "Hi everyone,", "All,", ""]);
  }

  private signoff(s: Sender): string {
    const fn = firstName(s.person.name);
    const r = this.rng;
    if (s.key === "me") return r.pick([`Thanks,\n${fn}`, fn, `— ${fn}`, `Thanks!\n${fn}`, `Best,\n${fn}`, "A."]);
    if (s.client === "outlook") return r.pick([`Best regards,\n${fn}`, `Kind regards,\n${fn}`, `Thanks,\n${fn}`, `Best,\n${fn}`]);
    if (s.client === "plain") return r.pick([`-${fn.toLowerCase()}`, fn, `thanks,\n${fn.toLowerCase()}`]);
    return r.pick([`Thanks,\n${fn}`, `Best,\n${fn}`, `Cheers,\n${fn}`, fn, `Thanks!\n${fn}`, `— ${fn}`]);
  }

  private compose(s: Sender, to: Person[], body: string, withGreeting = true): string {
    const g = withGreeting ? this.greeting(to, s) : "";
    return [g, body, this.signoff(s)].filter(Boolean).join("\n\n");
  }

  private topicThread(topic: TopicBank, endDay: number): ThreadDraft | null {
    const r = this.rng;
    const slots = new Map<string, string>();
    const t: ThreadDraft = { key: null, drafts: [], labels: (topic.labels ?? []).map((l) => LABEL_ID[l]), scripted: false, bulk: false };
    const pool = topic.people.filter((k) => this.senders.has(k) && k !== "me");
    if (pool.length === 0) return null;
    const starter = this.sender(r.pick(pool));
    const others = r.sample(pool.filter((k) => k !== starter.key), r.int(0, 2)).map((k) => this.sender(k));
    const lane = r.next() < 0.6 ? "ask" : "fyi";
    const n = r.pick([2, 2, 3, 3, 3, 4, 4, 5, 6, 7, 8]);
    let date = this.business(this.past(endDay, `${r.int(8, 17)}:${pad(r.int(0, 59), 2)}`));
    const subject = this.fill(r.pick(topic.subjects), slots);

    let to: Person[];
    let cc: Person[];
    if (lane === "ask") {
      to = [this.me];
      cc = others.map((o) => o.person);
    } else {
      const main = others.length ? others : [this.sender(r.pick(PEOPLE.filter((p) => p.org === "Northwind" && p.key !== starter.key)).key)];
      to = main.map((o) => o.person);
      cc = [this.me];
    }
    let body = this.fill(r.pick(topic.openers), slots);
    if (lane === "ask") body += ` ${this.fill(r.pick(topic.asks), slots)}`;
    let prev = this.convDraft(t, { sender: starter, date, text: this.compose(starter, to, body), parent: null, subject, to, cc, attach: r.chance(0.12) ? [this.attachName(subject)] : undefined });
    const participants = [starter, ...others];
    let lastWasMe = false;
    for (let i = 1; i < n; i++) {
      date += r.int(20, 60 * 26) * 60_000;
      date = this.business(date);
      // Generated threads stay out of the most recent days, which belong to the hand-written scripts.
      if (date >= this.now - 5 * DAY) break;
      const isLast = i === n - 1;
      const meTurn: boolean = !lastWasMe && (lane === "ask" ? r.chance(0.55) : r.chance(0.2));
      let s: Sender;
      let text: string;
      if (meTurn) {
        s = this.meSender;
        text = this.compose(s, [prev.from], this.fill(r.pick(topic.myReplies), slots), r.chance(0.6));
      } else {
        const cands = participants.filter((p) => p.person.email !== prev.from.email);
        s = cands.length ? r.pick(cands) : starter;
        text = this.compose(s, [prev.from], this.fill(r.pick(isLast ? topic.closers : topic.replies), slots), r.chance(0.5));
      }
      lastWasMe = meTurn;
      prev = this.convDraft(t, { sender: s, date, text, parent: prev, mobile: s.key !== "me" && r.chance(0.06) });
    }
    this.settle(t);
    return t;
  }

  private attachName(subject: string): string {
    const base = subject.replace(/[^A-Za-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 40);
    return `${base}.${this.rng.pick(["pdf", "pdf", "xlsx", "docx", "csv", "png"])}`;
  }

  // ---- bulk ----

  private bulkThread(labels: string[] = []): ThreadDraft {
    return { key: null, drafts: [], labels, scripted: false, bulk: true };
  }

  private bulkDraft(t: ThreadDraft, o: { from: Person; date: number; subject: string; body: BodySpec; bulk: BulkSignals; category: string | null; to?: Person[]; cc?: Person[]; replyTo?: Person[]; parent?: Draft | null; attachments?: DemoAttachment[]; importance?: "low" | "normal" | "high"; header?: string }): Draft {
    const d: Draft = {
      t,
      date: o.date,
      from: o.from,
      to: o.to ?? [this.me],
      cc: o.cc ?? [],
      baseCc: o.cc ?? [],
      replyTo: o.replyTo ?? [],
      subject: o.subject,
      body: o.body,
      attachments: o.attachments ?? [],
      parent: o.parent ?? null,
      bulk: o.bulk,
      category: o.category,
      importance: o.importance ?? "normal",
      header: o.header ?? this.messageIdFor(null, o.date, domainOf(o.from.email)),
      fromMe: false,
      unread: false,
      starred: false,
    };
    t.drafts.push(d);
    return d;
  }

  private fillSimple(s: string, slots: Map<string, string>): string {
    return s.replace(/\{(\w+)\}/g, (all, name: string) => {
      let v = slots.get(name);
      if (v) return v;
      const r = this.rng;
      switch (name) {
        case "num":
          v = String(r.int(10000, 99999));
          break;
        case "amount":
          v = money(r.int(1800, 240000) / 100);
          break;
        case "weekday":
          v = r.pick(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"]);
          break;
        case "person": {
          const p = r.pick(PEOPLE.filter((x) => x.org === "Northwind"));
          v = p.name;
          break;
        }
        case "n":
          v = String(r.int(100, 400));
          break;
        default:
          return all;
      }
      slots.set(name, v);
      return v;
    });
  }

  private personalize(s: string): string {
    if (this.me.name === ME_DEFAULT.name) return s;
    return s.replace(/Alex Morgan/g, this.me.name).replace(/\bAlex\b/g, firstName(this.me.name));
  }

  private newsletters(): void {
    const r = this.rng;
    NEWSLETTERS.forEach((def, di) => {
      const domain = domainOf(def.fromEmail);
      const from = { name: def.fromName, email: def.fromEmail.toLowerCase() };
      const hour = r.int(5, 10);
      let day = r.int(0, Math.max(0, def.everyDays - 1));
      let issue = r.int(120, 420);
      const token = r.alnum(22);
      const labels = domain === "fabrikam.example" ? [LABEL_ID.Vendors] : [];
      while (day <= 118) {
        const date = this.at(day, `${hour}:${pad(r.int(0, 59), 2)}`);
        const wd = new Date(date).getDay();
        if (date > this.now - 5 * 60_000 || (def.everyDays === 1 && (wd === 0 || wd === 6))) {
          day += 1;
          continue;
        }
        const n = def.layout === "promo" ? r.int(3, 4) : def.layout === "minimal" ? r.int(6, 8) : r.int(4, 6);
        const items = r.sample(def.items.map((_, i) => i), n);
        const subject = this.fillSimple(r.pick(def.subjects).replace(/\{headline\}/g, def.items[items[0]].title).replace(/\{n\}/g, String(issue)), new Map());
        const t = this.bulkThread(labels);
        this.bulkDraft(t, {
          from,
          date,
          subject,
          body: { kind: "newsletter", def: di, issue, intro: r.int(0, def.intros.length - 1), items, cta: r.int(0, def.ctas.length - 1), token },
          bulk: listSignals(def.listId, def.unsubMailto, `${def.unsubUrl}?u=${token}&list=${def.key}`),
          category: def.category,
          replyTo: [{ name: def.fromName, email: `reply@${domain}` }],
        });
        this.threads.push(t);
        day += def.everyDays === 1 ? 1 : def.everyDays + (r.chance(0.2) ? r.int(-1, 1) : 0);
        issue -= 1;
      }
    });
  }

  private simpleMails(defs: SimpleMailDef[], count: number, category: string, accent: string[], marketing: boolean, spam = false): void {
    const r = this.rng;
    const rounds = Math.ceil(count / defs.length);
    const span = Math.floor(118 / rounds);
    const offsets = defs.map(() => r.int(0, Math.max(0, span - 1)));
    for (let i = 0; i < count; i++) {
      const di = i % defs.length;
      const def = defs[di];
      const domain = domainOf(def.fromEmail);
      const from = { name: def.fromName, email: def.fromEmail.toLowerCase() };
      const day = spam ? r.int(0, 30) : Math.floor(i / defs.length) * span + offsets[di];
      const date = this.past(day, `${r.int(6, 21)}:${pad(r.int(0, 59), 2)}`);
      const slots = new Map<string, string>();
      const subject = this.fillSimple(def.subject, slots);
      const text = this.personalize(this.fillSimple(def.body, slots));
      const token = r.alnum(20);
      const t = this.bulkThread(domain === "fabrikam.example" ? [LABEL_ID.Vendors] : []);
      if (spam) t.spam = true;
      const unsubUrl = `https://${domain}/email/unsubscribe`;
      this.bulkDraft(t, {
        from,
        date,
        subject,
        body: marketing || spam ? { kind: "marketing", brand: def.fromName, domain, accent: r.pick(accent), text, token, unsubUrl } : { kind: "notice", brand: def.fromName, accent: r.pick(accent), title: subject, text, button: null, footer: `${def.fromName} · ${domain}\nUnsubscribe: ${unsubUrl}?u=${token}`, html: true },
        bulk: spam ? NO_BULK : listSignals(`${slug(def.fromName)}.${domain}`, `mailto:unsubscribe@${domain}?subject=unsubscribe`, `${unsubUrl}?u=${token}`),
        category: spam ? null : category,
        importance: marketing ? "low" : "normal",
      });
      this.threads.push(t);
    }
  }

  private systemMails(defs: SimpleMailDef[], count: number, accent: string, labelFor: (d: SimpleMailDef) => string[]): void {
    const r = this.rng;
    for (let i = 0; i < count; i++) {
      const def = i < defs.length ? defs[i] : r.pick(defs);
      const slots = new Map<string, string>();
      const subject = this.fillSimple(def.subject, slots);
      const text = this.personalize(this.fillSimple(def.body, slots));
      const domain = domainOf(def.fromEmail);
      const t = this.bulkThread(labelFor(def));
      this.bulkDraft(t, {
        from: { name: def.fromName, email: def.fromEmail.toLowerCase() },
        date: this.past(r.int(0, 118), `${r.int(6, 20)}:${pad(r.int(0, 59), 2)}`),
        subject,
        body: { kind: "notice", brand: def.fromName, accent, title: subject, text, button: null, footer: `This is an automated message from ${def.fromName} (${domain}). Please do not reply.`, html: true },
        bulk: AUTO,
        category: "updates",
      });
      this.threads.push(t);
    }
  }

  private jira(): void {
    const r = this.rng;
    const statuses = ["In Progress", "In Review", "Blocked", "Done", "Ready for QA"];
    for (const issue of JIRA_ISSUES) {
      const t = this.bulkThread(issue.type === "Incident" ? [LABEL_ID.Incidents] : []);
      const subject = `[Tracker] (${issue.key}) ${issue.title}`;
      const reporter = this.sender(issue.reporter);
      const assignee = this.sender(issue.assignee);
      let date = this.past(r.int(4, 112), `${r.int(8, 18)}:${pad(r.int(0, 59), 2)}`);
      const url = `https://tracker.northwind.example/browse/${issue.key}`;
      const footer = `You are receiving this because you are a watcher of ${issue.key}.\nManage notifications: https://tracker.northwind.example/settings/notifications`;
      const rootHeader = `<tracker.${issue.key}.${r.hex(10)}@tracker.northwind.example>`;
      const mk = (who: Sender, text: string, title: string, parent: Draft | null): Draft =>
        this.bulkDraft(t, {
          from: { name: `${who.person.name} (Tracker)`, email: "tracker@tracker.northwind.example" },
          date,
          subject: parent ? `Re: ${subject}` : subject,
          body: { kind: "notice", brand: "Northwind Tracker", accent: "#0052cc", title, text, button: { label: `View ${issue.key}`, url }, footer, html: true },
          bulk: AUTO,
          category: "updates",
          parent,
          replyTo: [{ name: "Northwind Tracker", email: "no-reply@tracker.northwind.example" }],
          header: parent ? `<tracker.${issue.key}.${r.hex(10)}@tracker.northwind.example>` : rootHeader,
        });
      const first = reporter.key === "me" ? null : reporter;
      let prev: Draft | null = null;
      if (first) {
        prev = mk(first, `${first.person.name} created ${issue.key}.\n\nType: ${issue.type}\nPriority: ${issue.priority}\nComponent: ${issue.component}\nAssignee: ${assignee.person.name}\nReporter: ${reporter.person.name}\n\n${issue.title}`, `${issue.key}: ${issue.title}`, null);
      }
      for (const c of issue.comments) {
        date += r.int(2, 60 * 50) * 60_000;
        if (date > this.now - HOUR) break;
        const who = this.sender(r.chance(0.6) ? (assignee.key === "me" ? issue.reporter : issue.assignee) : r.pick([issue.reporter, issue.assignee, "priya", "grace", "lena"]));
        if (who.key === "me") continue;
        prev = mk(who, `${who.person.name} commented on ${issue.key}:\n\n${this.personalize(c)}`, `${who.person.name} commented on ${issue.key}`, prev);
      }
      if (r.chance(0.6) && date < this.now - 3 * DAY) {
        date += r.int(60, 60 * 30) * 60_000;
        const st = r.pick(statuses);
        prev = mk(assignee.key === "me" ? reporter : assignee, `${(assignee.key === "me" ? reporter : assignee).person.name} changed the status of ${issue.key} to ${st}.`, `${issue.key} → ${st}`, prev);
      }
      if (t.drafts.length) this.threads.push(t);
    }
  }

  private ciRun(day: number | null, dateOverride?: number): ThreadDraft {
    const r = this.rng;
    const repo = r.pick(CI_REPOS);
    const wf = r.pick(repo.workflows);
    const branch = r.pick(repo.branches);
    const sha = r.hex(7);
    const run = r.int(18000, 48000);
    const kind = r.next();
    const failed = kind < 0.62;
    const fixed = !failed && kind < 0.9;
    const status = failed ? "Run failed" : fixed ? "Run fixed" : "Run cancelled";
    const pr = r.pick(PULL_REQUESTS);
    const author = this.sender(pr.author);
    const subject = `[${repo.repo}] ${status}: ${wf} - ${branch} (${sha})`;
    const url = `https://forge.northwind.example/${repo.repo}/actions/runs/${run}`;
    const text = failed
      ? `${wf} failed on ${branch} (${sha}).\n\nTriggered by: ${author.person.name}\nCommit: ${pr.title}\nDuration: ${r.int(2, 38)}m ${r.int(0, 59)}s\n\nFailing step: ${r.pick(["test", "integration", "plan", "deploy", "lint", "e2e"])}\n${r.pick(CI_FAILURES)}`
      : fixed
        ? `${wf} is passing again on ${branch} (${sha}) after ${r.int(1, 4)} failed run(s).\n\nTriggered by: ${author.person.name}\nCommit: ${pr.title}\nDuration: ${r.int(2, 30)}m ${r.int(0, 59)}s`
        : `${wf} on ${branch} (${sha}) was cancelled by ${author.person.name} after ${r.int(1, 9)}m.\n\nA newer run superseded it.`;
    const t = this.bulkThread();
    this.bulkDraft(t, {
      from: { name: "Forge CI", email: "ci@forge.northwind.example" },
      date: dateOverride ?? this.past(day ?? 0, `${r.int(0, 23)}:${pad(r.int(0, 59), 2)}`),
      subject,
      body: { kind: "notice", brand: "Forge CI", accent: failed ? "#cf222e" : fixed ? "#1a7f37" : "#6e7781", title: `${status}: ${wf}`, text, button: { label: "View workflow run", url }, footer: `You are receiving this because you are subscribed to workflow notifications for ${repo.repo}.\nManage your notification settings: https://forge.northwind.example/settings/notifications`, html: true },
      bulk: { ...AUTO, listId: `${repo.repo.replace("/", ".")}.forge.northwind.example`, listUnsubscribe: `<https://forge.northwind.example/notifications/unsubscribe/${r.alnum(16)}>`, listUnsubscribePost: null },
      category: "updates",
      importance: failed ? "normal" : "low",
    });
    return t;
  }

  private pulls(): void {
    const r = this.rng;
    const reviewers = ["priya", "lena", "ravi", "noah", "owen", "felix", "victor", "jonah", "aisha", "hana"];
    for (const pr of PULL_REQUESTS) {
      const t = this.bulkThread();
      const author = this.sender(pr.author);
      const subject = `[${pr.repo}] ${pr.title} (#${pr.number})`;
      const url = `https://forge.northwind.example/${pr.repo}/pull/${pr.number}`;
      const list = `${pr.repo.replace("/", ".")}.forge.northwind.example`;
      const bulk: BulkSignals = { listId: `${pr.repo} <${list}>`, listUnsubscribe: `<mailto:unsub+${r.alnum(12)}@forge.northwind.example>, <https://forge.northwind.example/notifications/unsubscribe/${r.alnum(16)}>`, listUnsubscribePost: "List-Unsubscribe=One-Click", precedence: "list", autoSubmitted: null };
      const footer = `—\nReply to this email directly, view it on Forge, or unsubscribe.\nYou are receiving this because your review was requested.`;
      let date = this.business(this.past(r.int(2, 110), `${r.int(9, 18)}:${pad(r.int(0, 59), 2)}`));
      const root = `<${pr.repo}/pull/${pr.number}@forge.northwind.example>`;
      const meHandle = this.me.email.split("@")[0].replace(/\./g, "-");
      let prev = this.bulkDraft(t, {
        from: { name: author.person.name, email: "notifications@forge.northwind.example" },
        date,
        subject,
        body: { kind: "notice", brand: "Forge", accent: "#24292f", title: `${pr.title} #${pr.number}`, text: `${author.person.name} requested your review on: ${pr.repo}#${pr.number}\n\n${pr.description}\n\n@${meHandle} requested as reviewer (code owner of the changed paths).`, button: { label: "View pull request", url }, footer, html: true },
        bulk,
        category: "updates",
        cc: [{ name: "Review requested", email: "review_requested@noreply.forge.northwind.example" }],
        header: root,
      });
      for (const c of pr.reviewComments) {
        date += r.int(15, 60 * 30) * 60_000;
        if (date > this.now - HOUR) break;
        const who = this.sender(r.pick(reviewers.filter((k) => k !== pr.author)));
        prev = this.bulkDraft(t, {
          from: { name: who.person.name, email: "notifications@forge.northwind.example" },
          date,
          subject: `Re: ${subject}`,
          body: { kind: "notice", brand: "Forge", accent: "#24292f", title: `${who.person.name} commented on #${pr.number}`, text: `@${who.person.email.split("@")[0].replace(/\./g, "-")} commented on this pull request.\n\n${c}`, button: { label: "View it on Forge", url: `${url}#discussion_r${r.int(100000, 999999)}` }, footer, html: true },
          bulk,
          category: "updates",
          parent: prev,
          header: `<${pr.repo}/pull/${pr.number}/c${r.int(1000000, 9999999)}@forge.northwind.example>`,
        });
      }
      if (r.chance(0.7)) {
        date += r.int(30, 60 * 20) * 60_000;
        if (date < this.now - HOUR) {
          this.bulkDraft(t, {
            from: { name: author.person.name, email: "notifications@forge.northwind.example" },
            date,
            subject: `Re: ${subject}`,
            body: { kind: "notice", brand: "Forge", accent: "#8250df", title: `Merged #${pr.number}`, text: `Merged #${pr.number} into main.`, button: { label: "View pull request", url }, footer, html: true },
            bulk,
            category: "updates",
            parent: prev,
            header: `<${pr.repo}/pull/${pr.number}/merged@forge.northwind.example>`,
          });
        }
      }
      this.threads.push(t);
    }
  }

  private meetings(): void {
    const r = this.rng;
    MEETINGS.forEach((mt, i) => {
      const organizer = this.sender(mt.organizer);
      const sends = mt.recurring ? r.int(1, 3) : 1;
      for (let k = 0; k < sends; k++) {
        const sentDay = r.int(0, 110);
        const sent = this.business(this.past(sentDay, `${r.int(8, 17)}:${pad(r.int(0, 59), 2)}`));
        const start = new Date(this.business(sent + r.int(1, 9) * DAY));
        start.setHours(r.int(9, 16), r.pick([0, 0, 30]), 0, 0);
        const startMs = start.getTime();
        const when = `${fmtShortDate(startMs).replace(/,(?= \d{4})/, "")} ${fmtCalTime(startMs)} - ${fmtCalTime(startMs + mt.minutes * 60_000)} (${tzAbbr(startMs)})`;
        const updated = k > 0;
        const subject = `${updated ? "Updated invitation" : "Invitation"}: ${mt.title} @ ${mt.recurring ? "Weekly from " : ""}${when} (${this.me.email})`;
        const attendees = mt.attendees.map((a) => this.sender(a).person);
        const text = `${updated ? "This event has been updated.\n\n" : ""}${mt.title}\n${when}${mt.recurring ? "\nRepeats weekly" : ""}\n\nOrganizer: ${organizer.person.name}\nGuests:\n${attendees.map((a) => `- ${a.name}`).join("\n")}\n\n${mt.description}\n\nReply for ${this.me.email}: Yes / No / Maybe`;
        const t = this.bulkThread();
        const uid = `${hashStr(mt.title + i).toString(16)}${k}@calendar.northwind.example`;
        const ics: DemoAttachment = { id: "att1", filename: "invite.ics", mimeType: "text/calendar", size: 2_000 + attendees.length * 120, inline: false, contentId: null, data: Buffer.from(icsFor(mt.title, startMs, mt.minutes, organizer.person, attendees, uid), "utf8") };
        this.bulkDraft(t, {
          from: organizer.person,
          date: sent,
          subject,
          to: [this.me],
          body: { kind: "notice", brand: "Northwind Calendar", accent: "#1a73e8", title: mt.title, text, button: { label: "View on calendar", url: `https://calendar.northwind.example/event?eid=${r.alnum(24)}` }, footer: `Invitation from Northwind Calendar. You are receiving this email because you are an attendee on the event.\nForwarding this invitation could allow any recipient to send a response to the organizer.`, html: true },
          bulk: NO_BULK,
          category: updated ? "updates" : "personal",
          attachments: [ics],
          header: `<calendar-${r.hex(8)}-${r.hex(4)}-${r.hex(4)}-${r.hex(12)}@northwind.example>`,
        });
        this.threads.push(t);
      }
    });
  }

  private alerts(count: number): void {
    const r = this.rng;
    for (let i = 0; i < count; i++) {
      const a = i < ALERTS.length ? ALERTS[i] : r.pick(ALERTS);
      this.threads.push(this.alertThread(a, this.past(r.int(0, 115), `${r.int(0, 23)}:${pad(r.int(0, 59), 2)}`)));
    }
  }

  alertThread(a: (typeof ALERTS)[number], date: number): ThreadDraft {
    const r = this.rng;
    const t = this.bulkThread(a.severity === "P1" || a.severity === "P2" ? [LABEL_ID.Incidents] : []);
    const subject = `[FIRING:1] ${a.name} ${a.service} (${a.severity})`;
    const url = `https://pagerline.northwind.example/incidents/${r.alnum(7, "ABCDEFGHJKLMNPQRSTUVWXYZ0123456789")}`;
    const footer = "Pagerline · Northwind on-call. You are receiving this because you are on the Platform escalation policy (level 3).";
    const first = this.bulkDraft(t, {
      from: { name: "Pagerline", email: "alerts@pagerline.northwind.example" },
      date,
      subject,
      body: { kind: "notice", brand: "Pagerline", accent: a.severity === "P1" ? "#b91c1c" : "#d97706", title: `${a.severity} · ${a.name}`, text: `Alert: ${a.name}\nService: ${a.service}\nSeverity: ${a.severity}\nStatus: FIRING\n\n${a.summary}\n\nRunbook: https://runbooks.northwind.example/${slug(a.name)}`, button: { label: "Acknowledge", url }, footer, html: true },
      bulk: AUTO,
      category: "updates",
      importance: a.severity === "P1" ? "high" : "normal",
    });
    if (date < this.now - 2 * HOUR && r.chance(0.8)) {
      this.bulkDraft(t, {
        from: { name: "Pagerline", email: "alerts@pagerline.northwind.example" },
        date: date + r.int(4, 90) * 60_000,
        subject: `[RESOLVED] ${a.name} ${a.service} (${a.severity})`,
        body: { kind: "notice", brand: "Pagerline", accent: "#15803d", title: `Resolved · ${a.name}`, text: `Alert: ${a.name}\nService: ${a.service}\nStatus: RESOLVED\n\nResolved automatically after the condition cleared.`, button: { label: "View incident", url }, footer, html: true },
        bulk: AUTO,
        category: "updates",
        parent: first,
      });
    }
    return t;
  }

  private receipts(count: number): void {
    const r = this.rng;
    for (let i = 0; i < count; i++) {
      const di = i < RECEIPTS.length ? i : r.int(0, RECEIPTS.length - 1);
      const def = RECEIPTS[di];
      const slots = new Map<string, string>();
      const t = this.bulkThread([LABEL_ID.Receipts]);
      const num = String(r.int(100000, 999999));
      slots.set("num", num);
      this.bulkDraft(t, {
        from: { name: def.fromName, email: def.fromEmail.toLowerCase() },
        date: this.past(r.int(1, 118), `${r.int(6, 22)}:${pad(r.int(0, 59), 2)}`),
        subject: this.fillSimple(def.subject, slots),
        body: { kind: "receipt", def: di, num, brand: def.fromName, note: this.fillSimple(def.note, slots) },
        bulk: AUTO,
        category: "updates",
      });
      this.threads.push(t);
    }
  }

  private forums(): void {
    const r = this.rng;
    for (const list of FORUM_LISTS) {
      for (const topic of list.topics) {
        const t = this.bulkThread();
        let date = this.business(this.past(r.int(1, 110), `${r.int(8, 18)}:${pad(r.int(0, 59), 2)}`));
        let prev: Draft | null = null;
        const listPerson = { name: list.name, email: list.address.toLowerCase() };
        const subject = `[${list.name}] ${topic.subject}`;
        for (const post of topic.posts) {
          if (date > this.now - HOUR) break;
          const s = this.sender(post.from);
          prev = this.bulkDraft(t, {
            from: s.person,
            date,
            subject: prev ? `Re: ${subject}` : subject,
            body: { kind: "list", text: this.personalize(this.fillSimple(post.text, new Map())), sender: s, listName: list.name, listAddress: list.address },
            bulk: { listId: `<${list.listId}>`, listUnsubscribe: `<mailto:${list.name}+unsubscribe@lists.northwind.example>, <https://lists.northwind.example/g/${list.name}/unsubscribe>`, listUnsubscribePost: "List-Unsubscribe=One-Click", precedence: "list", autoSubmitted: null },
            category: "forums",
            to: [listPerson],
            replyTo: [listPerson],
            parent: prev,
            header: this.messageIdFor(s, date, "lists.northwind.example"),
          });
          date += r.int(10, 60 * 20) * 60_000;
          date = this.business(date);
        }
        if (t.drafts.length) this.threads.push(t);
      }
    }
  }

  // ---- states ----

  private decideStates(): void {
    const r = this.rng;
    for (const t of this.threads) {
      const last = t.drafts[t.drafts.length - 1];
      const age = (this.now - last.date) / DAY;
      let inbox: boolean;
      if (t.spam || t.trash) inbox = false;
      else if (t.inbox !== undefined) inbox = t.inbox;
      else if (t.scripted) inbox = age <= 10;
      else if (t.bulk) inbox = age <= 10 ? r.chance(0.8) : age <= 30 ? r.chance(0.25) : false;
      else inbox = age <= 10 ? r.chance(0.8) : age <= 30 ? r.chance(0.12) : false;
      t.inbox = inbox;
      // unread
      if (t.scripted) {
        let n = t.unread ?? (inbox && !last.fromMe && age <= 3 ? 1 : 0);
        for (let i = t.drafts.length - 1; i >= 0 && n > 0; i--) {
          if (t.drafts[i].fromMe) continue;
          t.drafts[i].unread = true;
          n--;
        }
      } else if (inbox) {
        const p = t.bulk ? (age <= 3 ? 0.5 : 0.15) : age <= 2 ? 0.6 : 0.15;
        if (!last.fromMe && r.chance(p)) last.unread = true;
      } else if (t.bulk && r.chance(0.04)) {
        last.unread = true; // a few archived-unread bulk messages, like real life
      }
      if (t.starred) {
        const target = [...t.drafts].reverse().find((d) => !d.fromMe) ?? last;
        target.starred = true;
      }
    }
    // A few extra stars on ordinary threads.
    const conv = this.threads.filter((t) => !t.bulk && !t.scripted && !t.spam);
    for (const t of r.sample(conv, 6)) t.drafts[0].starred = true;
    // A few messages in the trash.
    const trashable = this.threads.filter((t) => t.bulk && !t.inbox && !t.spam && t.drafts.length === 1);
    for (const t of r.sample(trashable, 16)) t.trash = true;
  }

  private calibrateUnread(target: number): void {
    const inboxThreads = this.threads.filter((t) => t.inbox && !t.spam && !t.trash);
    const hasUnread = (t: ThreadDraft) => t.drafts.some((d) => d.unread);
    let count = inboxThreads.filter(hasUnread).length;
    const lastDate = (t: ThreadDraft) => t.drafts[t.drafts.length - 1].date;
    if (count > target) {
      const cands = inboxThreads.filter((t) => !t.scripted && hasUnread(t)).sort((a, b) => lastDate(a) - lastDate(b));
      for (const t of cands) {
        if (count <= target) break;
        for (const d of t.drafts) d.unread = false;
        count--;
      }
    } else if (count < target) {
      const cands = inboxThreads.filter((t) => !t.scripted && !hasUnread(t) && !t.drafts[t.drafts.length - 1].fromMe).sort((a, b) => lastDate(b) - lastDate(a));
      for (const t of cands) {
        if (count >= target) break;
        t.drafts[t.drafts.length - 1].unread = true;
        count++;
      }
    }
  }

  // ---- main ----

  build(): Mailbox {
    const r = this.rng;
    // Conversations
    this.threads.push(this.script(SHOWCASE));
    for (const ts of LONG_THREADS) this.threads.push(this.script(ts));
    for (const ts of RECENT_THREADS) this.threads.push(this.script(ts));
    for (let i = 0; i < 270; i++) {
      // Skew towards recent days, but cover the whole 120-day window.
      const endDay = Math.min(119, Math.floor(6 + Math.pow(r.next(), 1.25) * 113));
      const t = this.topicThread(TOPICS[i % TOPICS.length], endDay);
      if (t) this.threads.push(t);
    }
    // Bulk
    this.newsletters();
    this.simpleMails(MARKETING, 78, "promotions", ["#7c3aed", "#0ea5e9", "#f97316", "#10b981", "#e11d48", "#2563eb"], true);
    this.simpleMails(SOCIAL, 58, "social", ["#0a66c2", "#4a154b"], false);
    this.simpleMails(SPAM_MAIL, 18, "promotions", ["#16a34a", "#dc2626"], true, true);
    this.jira();
    for (let i = 0; i < 100; i++) this.threads.push(this.ciRun(Math.floor(Math.pow(r.next(), 1.15) * 118)));
    this.pulls();
    this.meetings();
    this.alerts(36);
    this.systemMails(SECURITY_ALERTS, 14, "#b42318", () => []);
    this.systemMails(HR_IT_NOTICES, 46, "#1d4ed8", (d) => (/expense|ledgerly/i.test(d.fromName + d.fromEmail) ? [LABEL_ID.Finance] : []));
    this.receipts(26);
    this.forums();

    for (const t of this.threads) for (const d of t.drafts) if (d.date > this.now - 60_000) d.date = this.now - this.rng.int(2, 40) * 60_000;
    for (const t of this.threads) t.drafts.sort((a, b) => a.date - b.date);
    this.decideStates();
    this.calibrateUnread(60);
    return this.materialize();
  }

  private materialize(): Mailbox {
    const threads = this.threads.slice().sort((a, b) => a.drafts[0].date - b.drafts[0].date);
    const all: Draft[] = [];
    for (const t of threads) for (const d of t.drafts) all.push(d);
    all.sort((a, b) => a.date - b.date);
    const ids = new Map<Draft, string>();
    all.forEach((d, i) => ids.set(d, msgId(i + 1)));
    const box: Mailbox = {
      me: this.me,
      meSender: this.meSender,
      now: this.now,
      messages: new Map(),
      threads: new Map(),
      threadByKey: new Map(),
      byHeader: new Map(),
      nextMessage: all.length + 1,
      nextThread: threads.length + 1,
      senders: this.byEmail,
      rng: this.rng,
    };
    const built = new Map<Draft, DemoMessage>();
    threads.forEach((t, ti) => {
      const thread: DemoThread = { id: threadIdOf(ti + 1), key: t.key, messages: [] };
      box.threads.set(thread.id, thread);
      if (t.key) box.threadByKey.set(t.key, thread);
      for (const d of t.drafts) {
        let folders: string[];
        if (t.spam) folders = ["SPAM"];
        else if (t.trash) folders = ["TRASH"];
        else if (d.fromMe) folders = ["SENT"];
        else folders = [t.inbox ? "INBOX" : "ARCHIVE"];
        if (!t.spam) folders.push(...t.labels);
        const parent = d.parent ? (built.get(d.parent) ?? null) : null;
        built.set(d, this.toMessage(box, thread, d, ids.get(d) ?? "", folders, parent));
      }
    });
    return box;
  }

  /** Turn a draft into a stored message (registers it in the mailbox). */
  private toMessage(box: Mailbox, thread: DemoThread, d: Draft, id: string, folders: string[], parent: DemoMessage | null): DemoMessage {
    const references = parent ? trimRefs(`${parent.meta.references ?? ""} ${parent.meta.messageIdHeader ?? ""}`) : null;
    const m: DemoMessage = {
      meta: {
        id,
        threadId: thread.id,
        from: d.from,
        to: d.to,
        cc: d.cc,
        bcc: [],
        replyTo: d.replyTo,
        subject: d.subject,
        snippet: d.body.kind === "conv" ? snippetOf(d.body.text) : "",
        date: new Date(d.date).toISOString(),
        unread: d.fromMe ? false : d.unread,
        starred: d.starred,
        folders,
        hasAttachments: d.attachments.some((a) => !a.inline),
        messageIdHeader: d.header,
        inReplyTo: parent?.meta.messageIdHeader ?? null,
        references,
        bulk: d.bulk,
        category: d.category,
        importance: d.importance,
        sizeEstimate: 0,
      },
      attachments: d.attachments,
      body: d.body,
      parent,
      version: 0,
    };
    finishMeta(m);
    thread.messages.push(m);
    box.messages.set(id, m);
    box.byHeader.set(d.header, m);
    return m;
  }

  /** Add a live conversation message (arrival or auto-reply) to the mailbox. */
  live(box: Mailbox, o: { sender: Sender; date: number; text: string; parent: DemoMessage | null; threadId: string | null; subject?: string; to?: Person[]; cc?: Person[]; attach?: string[]; labels?: string[] }): DemoMessage {
    const s = o.sender;
    let to: Person[];
    let cc: Person[];
    if (o.to) {
      to = o.to;
      cc = o.cc ?? [];
    } else if (o.parent) {
      const seen = new Set<string>([s.person.email]);
      to = [];
      cc = [];
      for (const p of [o.parent.meta.from, ...o.parent.meta.to]) if (!seen.has(p.email)) (seen.add(p.email), to.push(p));
      for (const p of o.parent.meta.cc) if (!seen.has(p.email)) (seen.add(p.email), cc.push(p));
    } else {
      to = [this.me];
      cc = o.cc ?? [];
    }
    const fromMe = s.person.email === this.me.email;
    if (!fromMe && !to.some((p) => p.email === this.me.email) && !cc.some((p) => p.email === this.me.email)) cc = [...cc, this.me];
    const t: ThreadDraft = { key: null, drafts: [], labels: [], scripted: false, bulk: false };
    const d = this.convDraft(t, { sender: s, date: o.date, text: o.text, parent: null, subject: o.subject ?? (o.parent ? this.subjectFor(o.parent.meta.subject, s, false) : "(no subject)"), to, cc, attach: o.attach, ensureMe: false });
    d.unread = !fromMe;
    let thread = o.threadId ? box.threads.get(o.threadId) : undefined;
    if (!thread) {
      thread = { id: threadIdOf(box.nextThread++), key: null, messages: [] };
      box.threads.set(thread.id, thread);
    }
    const labels = o.labels ?? [];
    return this.toMessage(box, thread, d, msgId(box.nextMessage++), fromMe ? ["SENT", ...labels] : ["INBOX", ...labels], o.parent);
  }

  /** Add a live automated notification (new thread). */
  liveAuto(box: Mailbox, which: "ci" | "alert", date: number): DemoMessage[] {
    const t = which === "ci" ? this.ciRun(null, date) : this.alertThread(this.rng.pick(ALERTS), date);
    const thread: DemoThread = { id: threadIdOf(box.nextThread++), key: null, messages: [] };
    box.threads.set(thread.id, thread);
    const out: DemoMessage[] = [];
    let parent: DemoMessage | null = null;
    for (const d of t.drafts.slice(0, 1)) {
      d.unread = true;
      parent = this.toMessage(box, thread, d, msgId(box.nextMessage++), ["INBOX", ...t.labels], parent);
      out.push(parent);
    }
    return out;
  }

  labelId(name: LabelName): string {
    return LABEL_ID[name];
  }
}

function trimRefs(refs: string): string {
  const parts = refs.split(/\s+/).filter(Boolean);
  if (parts.length <= 12) return parts.join(" ");
  return [parts[0], ...parts.slice(-11)].join(" ");
}

/** Fill snippet/size for a message once its parent pointer is set. */
export function finishMeta(m: DemoMessage): void {
  if (!m.meta.snippet || m.body.kind !== "conv") {
    const r = renderMessage(m, 0);
    if (!m.meta.snippet) m.meta.snippet = snippetOf(r.text.replace(/^(View in browser|Issue #).*$/gm, ""));
    m.meta.sizeEstimate = 1_800 + r.text.length + (r.html?.length ?? 0) + m.attachments.reduce((s, a) => s + a.size, 0);
  } else {
    const len = m.body.text.length;
    m.meta.sizeEstimate = 4_200 + len * 3 + (m.parent ? 2_500 + len : 0) + m.attachments.reduce((s, a) => s + a.size, 0);
  }
}

export function generateMailbox(opts: { seed: number; now: number; me: Person }): Mailbox {
  return new Generator(opts.seed, opts.now, opts.me).build();
}

// ---------------------------------------------------------------------------
// Live arrivals and auto-replies
// ---------------------------------------------------------------------------

export type ArrivalItem = ArrivalScript | { type: "auto"; which: "ci" | "alert" };

/** The deterministic arrival pool: scripted human mail interleaved with automated mail. */
export function arrivalPool(): ArrivalItem[] {
  const out: ArrivalItem[] = [];
  const autos: ("ci" | "alert")[] = ["ci", "alert", "ci", "ci", "alert"];
  let a = 0;
  ARRIVALS.forEach((item, i) => {
    out.push(item);
    if (i % 3 === 2) out.push({ type: "auto", which: autos[a++ % autos.length] });
  });
  return out;
}

export function autoReplyText(i: number): string {
  return AUTO_REPLIES[i % AUTO_REPLIES.length];
}

export { firstName, domainOf, HOUR, DAY };
export type { PersonDef };
