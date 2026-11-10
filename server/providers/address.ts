// RFC 5322 address-list parsing and formatting, tolerant of real-world headers.
import type { Person } from "../../shared/types";

/** Decode RFC 2047 encoded-words (=?utf-8?B?...?= / =?utf-8?Q?...?=). */
export function decodeMimeWords(input: string): string {
  return input
    .replace(/\?=\s+=\?/g, "?==?")
    .replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (_m, charset: string, enc: string, data: string) => {
      try {
        let bytes: Buffer;
        if (enc.toUpperCase() === "B") bytes = Buffer.from(data, "base64");
        else {
          const s = data.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_x, h: string) => String.fromCharCode(parseInt(h, 16)));
          bytes = Buffer.from(s, "latin1");
        }
        return new TextDecoder(charset.toLowerCase()).decode(bytes);
      } catch {
        return data;
      }
    });
}

function splitTopLevel(input: string): string[] {
  const parts: string[] = [];
  let cur = "";
  let quoted = false;
  let angle = 0;
  for (let i = 0; i < input.length; i++) {
    const c = input[i];
    if (c === "\\" && quoted) { cur += c + (input[i + 1] ?? ""); i++; continue; }
    if (c === '"') quoted = !quoted;
    else if (!quoted && c === "<") angle++;
    else if (!quoted && c === ">") angle = Math.max(0, angle - 1);
    if ((c === "," || c === ";") && !quoted && angle === 0) { parts.push(cur); cur = ""; continue; }
    cur += c;
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

export function parseAddress(raw: string): Person | null {
  const s = decodeMimeWords(raw).trim();
  if (!s) return null;
  const m = s.match(/^(.*?)<\s*([^>]+?)\s*>\s*$/);
  if (m) {
    const name = m[1].trim().replace(/^"(.*)"$/, "$1").replace(/\\"/g, '"').trim();
    const email = m[2].trim().toLowerCase();
    if (!email.includes("@")) return null;
    return { name: name || email.split("@")[0], email };
  }
  const bare = s.replace(/\(.*?\)/g, "").trim().toLowerCase();
  if (!bare.includes("@")) return null;
  const comment = s.match(/\((.*?)\)/);
  return { name: comment ? comment[1] : bare.split("@")[0], email: bare };
}

export function parseAddressList(raw: string | null | undefined): Person[] {
  if (!raw) return [];
  const out: Person[] = [];
  for (const part of splitTopLevel(raw)) {
    // Skip group syntax "undisclosed-recipients:;"
    const p = parseAddress(part.replace(/^[^:<"]*:\s*/, (g) => (g.includes("@") ? g : "")));
    if (p) out.push(p);
  }
  return out;
}

/** Encode a header value as an RFC 2047 encoded-word when it is not plain ASCII. */
export function encodeHeaderWord(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x20-\x7e]*$/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, "utf8").toString("base64")}?=`;
}

export function formatAddress(p: Person): string {
  if (!p.name || p.name === p.email) return p.email;
  // eslint-disable-next-line no-control-regex
  const ascii = /^[\x20-\x7e]*$/.test(p.name);
  const name = ascii ? `"${p.name.replace(/(["\\])/g, "\\$1")}"` : encodeHeaderWord(p.name);
  return `${name} <${p.email}>`;
}

export function formatAddressList(list: Person[]): string {
  return list.map(formatAddress).join(", ");
}
