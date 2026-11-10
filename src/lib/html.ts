// Email HTML: sanitize, block remote content, split off quoted history,
// and build the sandboxed iframe document.
import DOMPurify from "dompurify";
import type { AttachmentMeta } from "../../shared/types";

export interface PreparedHtml {
  body: string;
  quoted: string | null;
  remoteBlocked: number;
}

const QUOTE_SELECTORS = [
  "div.gmail_quote",
  "blockquote.gmail_quote",
  "#appendonsend",
  "div[id^='divRplyFwdMsg']",
  "#divRplyFwdMsg",
  "#mail-editor-reference-message-container",
  "div.yahoo_quoted",
  "blockquote.protonmail_quote",
  "div.moz-cite-prefix",
  "hr#stopSpelling",
  "blockquote[type='cite']",
  "div[style*='border-top:solid #E1E1E1']",
  "div[style*='border-top: solid #E1E1E1']",
  "div[style*='border-top:solid #B5C4DF']",
  "div[style*='border-top: solid #B5C4DF']",
].join(",");

const REMOTE = /^(https?:)?\/\//i;

function textLen(n: Node): number {
  return (n.textContent ?? "").replace(/\s+/g, "").length;
}

/** Text that appears before `node` in document order within `root`. */
function textBefore(root: HTMLElement, node: Node): number {
  const range = document.createRange();
  range.setStart(root, 0);
  range.setEndBefore(node);
  return range.toString().replace(/\s+/g, "").length;
}

export function prepareHtml(html: string, opts: { allowRemote: boolean; attachments: AttachmentMeta[]; inlineUrl: (att: AttachmentMeta) => string }): PreparedHtml {
  let remoteBlocked = 0;
  const cid = new Map<string, AttachmentMeta>();
  for (const a of opts.attachments) if (a.contentId) cid.set(a.contentId.replace(/^<|>$/g, "").toLowerCase(), a);

  DOMPurify.removeAllHooks();
  DOMPurify.addHook("afterSanitizeAttributes", (node) => {
    const el = node as Element;
    if (el.tagName === "A") {
      el.setAttribute("target", "_blank");
      el.setAttribute("rel", "noopener noreferrer");
    }
    if (el.tagName === "IMG") {
      const src = el.getAttribute("src") ?? "";
      if (src.toLowerCase().startsWith("cid:")) {
        const att = cid.get(src.slice(4).replace(/^<|>$/g, "").toLowerCase());
        if (att) el.setAttribute("src", opts.inlineUrl(att));
        else el.removeAttribute("src");
      } else if (REMOTE.test(src) && !opts.allowRemote) {
        el.setAttribute("data-blocked-src", src);
        el.removeAttribute("src");
        el.removeAttribute("srcset");
        remoteBlocked++;
        // Tracking pixels: hide outright.
        const w = Number(el.getAttribute("width") ?? 0);
        const h = Number(el.getAttribute("height") ?? 0);
        if ((w > 0 && w <= 2) || (h > 0 && h <= 2)) el.setAttribute("style", "display:none");
      }
    }
    if (!opts.allowRemote) {
      const style = el.getAttribute("style");
      if (style && /url\(\s*['"]?(https?:)?\/\//i.test(style)) {
        el.setAttribute("style", style.replace(/url\(\s*['"]?(https?:)?\/\/[^)]*\)/gi, "none"));
        remoteBlocked++;
      }
      if (el.hasAttribute("background")) {
        el.removeAttribute("background");
        remoteBlocked++;
      }
    }
  });
  DOMPurify.addHook("uponSanitizeElement", (node, data) => {
    if (data.tagName === "style" && !opts.allowRemote) {
      const el = node as Element;
      el.textContent = (el.textContent ?? "").replace(/url\(\s*['"]?(https?:)?\/\/[^)]*\)/gi, "none").replace(/@import[^;]+;/gi, "");
    }
  });

  const frag = DOMPurify.sanitize(html, {
    RETURN_DOM: true,
    WHOLE_DOCUMENT: false,
    FORBID_TAGS: ["script", "iframe", "object", "embed", "form", "input", "button", "textarea", "select", "base", "meta", "link", "frame", "frameset", "audio", "video"],
    FORBID_ATTR: ["onerror", "onload", "onclick", "formaction"],
    ADD_TAGS: ["style"],
    ADD_ATTR: ["target"],
    FORCE_BODY: true,
  }) as HTMLElement;
  DOMPurify.removeAllHooks();

  const root = frag;
  let quoted: string | null = null;
  const candidates = Array.from(root.querySelectorAll(QUOTE_SELECTORS));
  for (const node of candidates) {
    // Skip quotes nested inside an earlier candidate.
    if (candidates.some((o) => o !== node && o.contains(node))) continue;
    if (textBefore(root, node) < 2 || textLen(node) < 2) continue;
    let start: Node = node;
    // Apple Mail / Thunderbird: the "On … wrote:" line sits just before the blockquote.
    const prev = node.previousElementSibling;
    if (prev && /wrote:\s*$/i.test((prev.textContent ?? "").trim()) && (prev.textContent ?? "").length < 300) start = prev;
    const range = document.createRange();
    range.setStartBefore(start);
    range.setEndAfter(root.lastChild ?? node);
    const extracted = range.extractContents();
    const holder = document.createElement("div");
    holder.appendChild(extracted);
    quoted = holder.innerHTML;
    break;
  }
  return { body: root.innerHTML, quoted, remoteBlocked };
}

export function frameDocument(bodyHtml: string, allowRemote: boolean): string {
  const img = allowRemote ? "img-src data: blob: 'self' https: http:" : "img-src data: blob: 'self'";
  const font = allowRemote ? "font-src data: https:" : "font-src data:";
  return `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; ${img}; style-src 'unsafe-inline'; ${font}; media-src 'none'; script-src 'none'">
<style>
html,body{margin:0;padding:0;background:transparent}
body{font-family:"IBM Plex Sans",Arial,Helvetica,sans-serif;font-size:14px;line-height:1.55;color:#18262f;word-wrap:break-word;overflow-wrap:anywhere;overflow-x:auto}
img{max-width:100%;height:auto}
pre{white-space:pre-wrap}
a{color:#0b5f68}
blockquote{margin:0 0 0 8px;padding-left:12px;border-left:2px solid #cfd8dc;color:#46555e}
p{margin:0 0 10px}
table{border-collapse:collapse}
mark.tp-find{background:rgba(255,196,0,.55);color:inherit;border-radius:2px}
mark.tp-find.tp-current{background:rgba(255,140,0,.85)}
</style></head><body>${bodyHtml}</body></html>`;
}

// ---------- plain text ----------

export function splitPlainQuote(text: string): { body: string; quoted: string | null } {
  const lines = text.replace(/\r/g, "").split("\n");
  let cut = -1;
  for (let i = 1; i < lines.length; i++) {
    const l = lines[i];
    if (/^On .{4,200}wrote:\s*$/i.test(l) || /^-{2,}\s*(Original|Forwarded) Message\s*-{2,}/i.test(l) || (/^From:\s/.test(l) && /^(Sent|Date):\s/.test(lines[i + 1] ?? ""))) {
      cut = i;
      break;
    }
    if (/^On .{4,120}$/.test(l) && /wrote:\s*$/.test(lines[i + 1] ?? "")) {
      cut = i;
      break;
    }
    if (/^>/.test(l) && lines.slice(i).every((x) => /^>/.test(x) || !x.trim())) {
      cut = i;
      break;
    }
  }
  if (cut <= 0) return { body: text, quoted: null };
  const body = lines.slice(0, cut).join("\n").trimEnd();
  if (!body.trim()) return { body: text, quoted: null };
  return { body, quoted: lines.slice(cut).join("\n") };
}

const URL_RE = /\b(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])/g;

export function linkify(text: string): (string | { url: string })[] {
  const out: (string | { url: string })[] = [];
  let last = 0;
  for (const m of text.matchAll(URL_RE)) {
    if (m.index! > last) out.push(text.slice(last, m.index));
    out.push({ url: m[0] });
    last = m.index! + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

/** Highlight `needle` inside an iframe document. Returns the marks created. */
export function highlightIn(doc: Document, needle: string): HTMLElement[] {
  for (const m of Array.from(doc.querySelectorAll("mark.tp-find"))) {
    const parent = m.parentNode;
    if (!parent) continue;
    parent.replaceChild(doc.createTextNode(m.textContent ?? ""), m);
    parent.normalize();
  }
  if (!needle.trim() || !doc.body) return [];
  const lower = needle.toLowerCase();
  const walker = doc.createTreeWalker(doc.body, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  const marks: HTMLElement[] = [];
  for (const node of nodes) {
    const text = node.data;
    let idx = text.toLowerCase().indexOf(lower);
    if (idx < 0) continue;
    let current: Text = node;
    while (idx >= 0) {
      const after = current.splitText(idx);
      const rest = after.splitText(needle.length);
      const mark = doc.createElement("mark");
      mark.className = "tp-find";
      mark.textContent = after.data;
      after.parentNode!.replaceChild(mark, after);
      marks.push(mark);
      current = rest;
      idx = current.data.toLowerCase().indexOf(lower);
    }
  }
  return marks;
}
