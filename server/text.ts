// Text helpers: HTML -> plain text, quoted-history stripping for plain text,
// and plain text -> safe HTML for outgoing mail.

const ENTITIES: Record<string, string> = {
  amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", ndash: "–", mdash: "—",
  hellip: "…", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", bull: "•", middot: "·",
  copy: "©", reg: "®", trade: "™", euro: "€", pound: "£", zwnj: "", zwj: "", shy: "",
};

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    const v = ENTITIES[code.toLowerCase()];
    return v === undefined ? m : v;
  });
}

/** Rough but dependable HTML to text conversion for summaries, search and quoting. */
export function htmlToText(html: string): string {
  let s = html;
  s = s.replace(/<(script|style|head|title)[^>]*>[\s\S]*?<\/\1>/gi, "");
  s = s.replace(/<!--[\s\S]*?-->/g, "");
  s = s.replace(/<br\s*\/?>/gi, "\n");
  s = s.replace(/<li[^>]*>/gi, "\n• ");
  s = s.replace(/<\/(p|div|tr|h[1-6]|blockquote|table|ul|ol|pre|section|article|header|footer)>/gi, "\n");
  s = s.replace(/<(p|div|tr|h[1-6]|blockquote|table|ul|ol|pre|hr)[^>]*>/gi, "\n");
  s = s.replace(/<\/t[dh]>/gi, "\t");
  s = s.replace(/<a\s[^>]*href="(https?:[^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_m, href: string, inner: string) => {
    const text = inner.replace(/<[^>]+>/g, "").trim();
    return text && !text.includes(href) && text.length < 80 && /^https?:/.test(text) === false ? `${text}` : text || href;
  });
  s = s.replace(/<[^>]+>/g, "");
  s = decodeEntities(s);
  s = s.replace(/\r/g, "").replace(/[ \t ]+\n/g, "\n").replace(/\n[ \t ]+/g, "\n").replace(/[ \t ]{2,}/g, " ");
  s = s.replace(/\n{3,}/g, "\n\n");
  return s.trim();
}

const QUOTE_HEADERS: RegExp[] = [
  /^On .{4,200}(wrote|schrieb|a écrit|escribió|ha scritto|написал)\s*:\s*$/im,
  /^-{2,}\s*Original Message\s*-{2,}\s*$/im,
  /^-{2,}\s*Forwarded message\s*-{2,}\s*$/im,
  /^_{10,}\s*$/m,
  /^From:\s.+\n(Sent|Date):\s.+\n/im,
  /^\*?From:\*?\s.+\n\*?(Sent|Date):\*?\s.+/im,
];

/**
 * The new part of a plain-text message: cut at the first reply header
 * ("On … wrote:", "-----Original Message-----", Outlook "From:/Sent:" block)
 * and drop trailing "> " quoted lines and the "-- " signature.
 */
export function stripQuotedText(text: string): string {
  let s = text.replace(/\r/g, "");
  let cut = s.length;
  for (const re of QUOTE_HEADERS) {
    const m = re.exec(s);
    if (m && m.index < cut && m.index > 0) cut = m.index;
  }
  // "On <date>, X <x@y>" often wraps onto two lines before "wrote:".
  const wrapped = /^On .{4,120}\n.{0,120}wrote:\s*$/im.exec(s);
  if (wrapped && wrapped.index > 0 && wrapped.index < cut) cut = wrapped.index;
  s = s.slice(0, cut);
  const lines = s.split("\n");
  // Remove quoted lines (">") anywhere at the end block.
  while (lines.length && (/^\s*>/.test(lines[lines.length - 1]) || lines[lines.length - 1].trim() === "")) lines.pop();
  s = lines.filter((l) => !/^\s*>/.test(l)).join("\n");
  const sig = s.search(/\n-- ?\n/);
  if (sig > 0) s = s.slice(0, sig);
  return s.trim();
}

export function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

const URL_RE = /\b(https?:\/\/[^\s<>"')\]]+[^\s<>"')\].,;:!?])/g;

/** Plain text written by the user -> simple, email-safe HTML. */
export function textToHtml(text: string): string {
  const paras = text.replace(/\r/g, "").split(/\n{2,}/);
  return paras
    .map((p) => {
      const html = escapeHtml(p).replace(URL_RE, (u) => `<a href="${u}">${u}</a>`).replace(/\n/g, "<br>");
      return `<p style="margin:0 0 12px 0">${html}</p>`;
    })
    .join("\n");
}

export function firstSentence(text: string, max = 180): string {
  const t = text.replace(/\s+/g, " ").trim();
  const m = t.match(/^(.{20,}?[.!?])(\s|$)/);
  const s = m ? m[1] : t;
  return s.length > max ? s.slice(0, max - 1).trimEnd() + "…" : s;
}
