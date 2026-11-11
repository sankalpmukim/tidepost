// RFC 5322 / MIME (RFC 2045-2047, 2231) message builder for outgoing mail.
// Produces a complete message with CRLF line endings, ready to be
// base64url-encoded for Gmail's messages.send or handed to any SMTP-ish API.
import { randomBytes } from "node:crypto";
import type { Person } from "../shared/types";
import { formatAddress } from "./providers/address";
import type { RawOutgoing } from "./providers/types";

const CRLF = "\r\n";
/** Soft limit for header lines (RFC 5322 §2.1.1 recommends 78 characters). */
const HEADER_WIDTH = 78;

export function toBase64Url(s: string | Buffer): string {
  const buf = typeof s === "string" ? Buffer.from(s, "utf8") : s;
  return buf.toString("base64url");
}

// eslint-disable-next-line no-control-regex
const isPrintableAscii = (s: string) => /^[\x20-\x7e]*$/.test(s);

/** Header values must never contain bare CR/LF (header injection) or other control characters. */
function clean(value: string): string {
  // eslint-disable-next-line no-control-regex
  return value.replace(/[\r\n]+/g, " ").replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, "");
}

/**
 * Split text into RFC 2047 B-encoded words of at most 75 characters each,
 * never splitting a UTF-8 multi-byte sequence (RFC 2047 §5 rule 3).
 */
function encodedWords(value: string): string[] {
  const prefix = "=?UTF-8?B?";
  const suffix = "?=";
  // 39 raw bytes -> 52 base64 chars -> 64-char words, so even the first word after
  // "Subject: " or "Content-Type: ...; name=" stays within 78 columns (75 is the hard cap).
  const maxBytes = 39;
  const words: string[] = [];
  let chunk: Buffer[] = [];
  let size = 0;
  for (const ch of value) {
    const b = Buffer.from(ch, "utf8");
    if (size + b.length > maxBytes && size > 0) {
      words.push(prefix + Buffer.concat(chunk).toString("base64") + suffix);
      chunk = [];
      size = 0;
    }
    chunk.push(b);
    size += b.length;
  }
  if (size > 0) words.push(prefix + Buffer.concat(chunk).toString("base64") + suffix);
  return words;
}

/** Fold a header whose value is a sequence of tokens joined by `sep`. */
function foldTokens(name: string, tokens: string[], sep: string): string {
  let out = `${name}: `;
  let lineLen = out.length;
  tokens.forEach((tok, i) => {
    const piece = i === 0 ? tok : sep + tok;
    if (i > 0 && lineLen + piece.length > HEADER_WIDTH) {
      // Break after the separator's non-space part (e.g. the comma).
      const trimmedSep = sep.trimEnd();
      out += trimmedSep + CRLF + " " + tok;
      lineLen = 1 + tok.length;
    } else {
      out += piece;
      lineLen += piece.length;
    }
  });
  return out;
}

/** An unstructured header (Subject), RFC 2047-encoded when not plain ASCII, folded. */
function unstructuredHeader(name: string, raw: string): string {
  const value = clean(raw);
  if (isPrintableAscii(value) && !value.includes("=?")) {
    if (`${name}: ${value}`.length <= HEADER_WIDTH) return `${name}: ${value}`;
    // Fold at whitespace; words are kept intact.
    const words = value.split(/(?<=\S)(?= )/);
    let out = `${name}:`;
    let lineLen = out.length;
    for (const w of words) {
      const piece = w.startsWith(" ") ? w : ` ${w}`;
      if (lineLen + piece.length > HEADER_WIDTH && lineLen > name.length + 1) {
        out += CRLF + piece;
        lineLen = piece.length;
      } else {
        out += piece;
        lineLen += piece.length;
      }
    }
    return out;
  }
  // Encoded words separated by folding white space; decoders drop the whitespace between them.
  return `${name}: ` + encodedWords(value).join(CRLF + " ");
}

function addressHeader(name: string, list: Person[]): string | null {
  if (!list.length) return null;
  const tokens = list.map((p) => {
    const name = clean(p.name);
    const email = clean(p.email);
    // Long non-ASCII display names become several encoded words (each <= 75 chars).
    if (name && name !== email && !isPrintableAscii(name)) return `${encodedWords(name).join(" ")} <${email}>`;
    return formatAddress({ name, email });
  });
  return foldTokens(name, tokens, ", ");
}

/** RFC 5322 date-time, e.g. "Tue, 10 Nov 2026 09:05:00 +0000". */
export function formatRfc5322Date(d: Date): string {
  return d.toUTCString().replace(/GMT$/, "+0000");
}

function quotedPrintable(text: string): string {
  const lines = text.replace(/\r\n|\r|\n/g, "\n").split("\n");
  const out: string[] = [];
  for (const line of lines) {
    const bytes = Buffer.from(line, "utf8");
    let encoded = "";
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i];
      const isLast = i === bytes.length - 1;
      const safe = (b >= 33 && b <= 126 && b !== 61) || ((b === 32 || b === 9) && !isLast);
      encoded += safe ? String.fromCharCode(b) : "=" + b.toString(16).toUpperCase().padStart(2, "0");
    }
    // Soft-wrap at 76 characters (75 + "=") without splitting an =XX escape.
    while (encoded.length > 76) {
      let cut = 75;
      const esc = encoded.lastIndexOf("=", cut - 1);
      if (esc > cut - 3) cut = esc;
      out.push(encoded.slice(0, cut) + "=");
      encoded = encoded.slice(cut);
    }
    out.push(encoded);
  }
  return out.join(CRLF);
}

function base64Wrapped(data: Buffer): string {
  const b64 = data.toString("base64");
  const lines: string[] = [];
  for (let i = 0; i < b64.length; i += 76) lines.push(b64.slice(i, i + 76));
  return lines.join(CRLF);
}

/** Quoted-printable for mostly-ASCII text; base64 when QP would bloat it (e.g. CJK). */
function textPart(mime: "text/plain" | "text/html", body: string): string {
  const bytes = Buffer.from(body, "utf8");
  let high = 0;
  for (const b of bytes) if (b > 127) high++;
  const useBase64 = bytes.length > 0 && high / bytes.length > 0.3;
  return [
    `Content-Type: ${mime}; charset="UTF-8"`,
    `Content-Transfer-Encoding: ${useBase64 ? "base64" : "quoted-printable"}`,
    "",
    useBase64 ? base64Wrapped(bytes) : quotedPrintable(body),
  ].join(CRLF);
}

function quoteParam(v: string): string {
  return `"${v.replace(/(["\\])/g, "\\$1")}"`;
}

/** RFC 2231 extended-value percent encoding (attr-char set). */
function rfc2231Encode(v: string): string {
  const bytes = Buffer.from(v, "utf8");
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    const b = bytes[i]!;
    const c = String.fromCharCode(b);
    out += /[A-Za-z0-9!#$&+\-.^_`|~]/.test(c) ? c : "%" + b.toString(16).toUpperCase().padStart(2, "0");
  }
  return out;
}

/**
 * `filename` parameter: quoted string when ASCII, otherwise RFC 2231
 * (`filename*=UTF-8''...`), split into continuations when long.
 */
function filenameParam(param: string, filename: string): string {
  if (isPrintableAscii(filename) && filename.length <= 60) return `${param}=${quoteParam(filename)}`;
  const encoded = rfc2231Encode(filename);
  const first = `UTF-8''`;
  if (first.length + encoded.length <= 60) return `${param}*=${first}${encoded}`;
  const pieces: string[] = [];
  let rest = encoded;
  let budget = 60 - first.length;
  while (rest.length) {
    let cut = Math.min(budget, rest.length);
    // Do not split a %XX escape.
    const pct = rest.lastIndexOf("%", cut - 1);
    if (pct !== -1 && pct > cut - 3 && cut < rest.length) cut = pct;
    pieces.push(rest.slice(0, cut));
    rest = rest.slice(cut);
    budget = 60;
  }
  return pieces.map((p, i) => `${param}*${i}*=${i === 0 ? first : ""}${p}`).join(";" + CRLF + " ");
}

/** Legacy `name=` on Content-Type for clients that ignore RFC 2231 (RFC 2047 word, as Gmail/Outlook do). */
function legacyNameParam(filename: string): string {
  if (isPrintableAscii(filename)) return `name=${quoteParam(filename)}`;
  return `name="${encodedWords(filename).join(" ")}"`;
}

function boundaryFor(seed: string, kind: string): string {
  return `=_tidepost_${kind}_${seed}`;
}

export function buildMime(
  msg: RawOutgoing,
  opts: { date?: Date; messageId?: string; boundarySeed?: string } = {},
): string {
  const seed = (opts.boundarySeed ?? randomBytes(12).toString("hex")).replace(/[^A-Za-z0-9'()+_,\-./:=?]/g, "");
  const messageId = opts.messageId ?? `<${randomBytes(16).toString("hex")}@tidepost.local>`;

  const headers: string[] = [];
  const from = addressHeader("From", [msg.from]);
  if (from) headers.push(from);
  for (const [name, list] of [
    ["To", msg.to],
    ["Cc", msg.cc],
    // Bcc stays in the raw message: Gmail reads recipients from it and strips it before delivery.
    ["Bcc", msg.bcc],
  ] as const) {
    const h = addressHeader(name, list);
    if (h) headers.push(h);
  }
  headers.push(unstructuredHeader("Subject", msg.subject));
  headers.push(`Date: ${formatRfc5322Date(opts.date ?? new Date())}`);
  headers.push(`Message-ID: ${clean(messageId)}`);
  if (msg.inReplyTo) headers.push(`In-Reply-To: ${clean(msg.inReplyTo.trim())}`);
  if (msg.references || msg.inReplyTo) {
    const refs = clean(msg.references ?? msg.inReplyTo ?? "")
      .split(/\s+/)
      .filter(Boolean);
    if (msg.inReplyTo && !refs.includes(msg.inReplyTo.trim())) refs.push(clean(msg.inReplyTo.trim()));
    if (refs.length) headers.push(foldTokens("References", refs, " "));
  }
  headers.push("MIME-Version: 1.0");

  // Body: multipart/alternative of text + html (or a single part when only one exists).
  const hasText = msg.text.length > 0 || !msg.html;
  const hasHtml = msg.html.length > 0;
  let bodyHeaders: string;
  let bodyContent: string;
  if (hasText && hasHtml) {
    const alt = boundaryFor(seed, "alt");
    bodyHeaders = `Content-Type: multipart/alternative;${CRLF} boundary="${alt}"`;
    bodyContent = [
      `--${alt}`,
      textPart("text/plain", msg.text),
      `--${alt}`,
      textPart("text/html", msg.html),
      `--${alt}--`,
      "",
    ].join(CRLF);
  } else {
    const single = textPart(hasHtml ? "text/html" : "text/plain", hasHtml ? msg.html : msg.text);
    const split = single.indexOf(CRLF + CRLF);
    bodyHeaders = single.slice(0, split);
    bodyContent = single.slice(split + 4);
  }

  let entityHeaders: string;
  let entityBody: string;
  if (msg.attachments.length) {
    const mixed = boundaryFor(seed, "mixed");
    entityHeaders = `Content-Type: multipart/mixed;${CRLF} boundary="${mixed}"`;
    const parts: string[] = [`--${mixed}`, bodyHeaders, "", bodyContent];
    for (const att of msg.attachments) {
      const filename = clean(att.filename) || "attachment";
      const mimeType = /^[\w!#$&^.+-]+\/[\w!#$&^.+-]+$/.test(att.mimeType) ? att.mimeType : "application/octet-stream";
      parts.push(
        `--${mixed}`,
        `Content-Type: ${mimeType};${CRLF} ${legacyNameParam(filename)}`,
        `Content-Disposition: attachment;${CRLF} ${filenameParam("filename", filename)}`,
        "Content-Transfer-Encoding: base64",
        "",
        base64Wrapped(att.data),
      );
    }
    parts.push(`--${mixed}--`, "");
    entityBody = parts.join(CRLF);
  } else {
    entityHeaders = bodyHeaders;
    entityBody = bodyContent;
  }

  return [...headers, entityHeaders, "", entityBody].join(CRLF);
}
