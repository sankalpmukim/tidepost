import { describe, expect, it } from "vitest";
import { decodeMimeWords } from "../server/providers/address";
import { buildMime, toBase64Url } from "../server/mime";
import type { RawOutgoing } from "../server/providers/types";

function outgoing(over: Partial<RawOutgoing> = {}): RawOutgoing {
  return {
    from: { name: "Ada Lovelace", email: "ada@example.com" },
    to: [{ name: "Charles Babbage", email: "charles@example.org" }],
    cc: [],
    bcc: [],
    subject: "Analytical engine notes",
    text: "Hello Charles,\n\nThe notes are attached.\n\n— Ada",
    html: "<p>Hello Charles,</p><p>The notes are attached.</p><p>— Ada</p>",
    attachments: [],
    inReplyTo: null,
    references: null,
    threadId: null,
    replyToProviderId: null,
    mode: "new",
    ...over,
  };
}

/** Split a raw message into its header block (unfolded) and body. */
function parse(raw: string): { headers: Map<string, string>; body: string } {
  const idx = raw.indexOf("\r\n\r\n");
  const headerBlock = raw.slice(0, idx).replace(/\r\n[ \t]/g, " ");
  const headers = new Map<string, string>();
  for (const line of headerBlock.split("\r\n")) {
    const c = line.indexOf(":");
    headers.set(line.slice(0, c).toLowerCase(), line.slice(c + 1).trim());
  }
  return { headers, body: raw.slice(idx + 4) };
}

function decodeQP(s: string): string {
  const bytes = s
    .replace(/=\r\n/g, "")
    .replace(/=([0-9A-F]{2})/g, (_m, h: string) => String.fromCharCode(parseInt(h, 16)));
  return Buffer.from(bytes, "latin1").toString("utf8");
}

describe("buildMime", () => {
  const date = new Date("2026-11-10T09:05:00Z");

  it("uses CRLF line endings only and emits the core headers", () => {
    const raw = buildMime(outgoing(), { date, messageId: "<abc@tidepost.local>", boundarySeed: "seed1" });
    expect(raw).not.toMatch(/[^\r]\n/);
    expect(raw).not.toMatch(/\r(?!\n)/);
    const { headers } = parse(raw);
    expect(headers.get("from")).toBe('"Ada Lovelace" <ada@example.com>');
    expect(headers.get("to")).toBe('"Charles Babbage" <charles@example.org>');
    expect(headers.get("subject")).toBe("Analytical engine notes");
    expect(headers.get("date")).toBe("Tue, 10 Nov 2026 09:05:00 +0000");
    expect(headers.get("message-id")).toBe("<abc@tidepost.local>");
    expect(headers.get("mime-version")).toBe("1.0");
    expect(headers.has("cc")).toBe(false);
    expect(headers.has("in-reply-to")).toBe(false);
    expect(headers.get("content-type")).toBe('multipart/alternative; boundary="=_tidepost_alt_seed1"');
  });

  it("generates a Message-ID when none is given", () => {
    const { headers } = parse(buildMime(outgoing()));
    expect(headers.get("message-id")).toMatch(/^<[0-9a-f]{32}@tidepost\.local>$/);
  });

  it("builds multipart/alternative with utf-8 quoted-printable parts", () => {
    const raw = buildMime(outgoing(), { date, boundarySeed: "s" });
    const { body } = parse(raw);
    const parts = body.split("--=_tidepost_alt_s");
    // preamble, text, html, closing "--"
    expect(parts).toHaveLength(4);
    expect(parts[3].startsWith("--")).toBe(true);
    expect(parts[1]).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(parts[1]).toContain("Content-Transfer-Encoding: quoted-printable");
    expect(parts[2]).toContain('Content-Type: text/html; charset="UTF-8"');
    const textBody = parts[1].slice(parts[1].indexOf("\r\n\r\n") + 4).replace(/\r\n$/, "");
    expect(decodeQP(textBody)).toBe("Hello Charles,\r\n\r\nThe notes are attached.\r\n\r\n— Ada");
    expect(textBody).toContain("=E2=80=94 Ada");
  });

  it("wraps quoted-printable lines at 76 characters", () => {
    const long = "word ".repeat(60) + "é".repeat(40);
    const raw = buildMime(outgoing({ text: long, html: "" }), { date });
    const { headers, body } = parse(raw);
    expect(headers.get("content-type")).toBe('text/plain; charset="UTF-8"');
    for (const line of body.split("\r\n")) expect(line.length).toBeLessThanOrEqual(76);
    expect(decodeQP(body)).toBe(long);
  });

  it("encodes non-ASCII subjects as folded RFC 2047 words", () => {
    const subject = "Réunion de planification — trimestre 4 — budget, équipe et calendrier 🚀";
    const raw = buildMime(outgoing({ subject }), { date });
    const headerBlock = raw.slice(0, raw.indexOf("\r\n\r\n"));
    const subjLines: string[] = [];
    const lines = headerBlock.split("\r\n");
    const start = lines.findIndex((l) => l.startsWith("Subject:"));
    subjLines.push(lines[start]);
    for (let i = start + 1; i < lines.length && /^[ \t]/.test(lines[i]); i++) subjLines.push(lines[i]);
    expect(subjLines.length).toBeGreaterThan(1);
    for (const l of subjLines) {
      expect(l.length).toBeLessThanOrEqual(78);
      for (const word of l.match(/=\?[^?]+\?B\?[^?]*\?=/g) ?? []) expect(word.length).toBeLessThanOrEqual(75);
    }
    const value = subjLines.join("\r\n").replace(/^Subject: /, "").replace(/\r\n /g, " ");
    expect(value.startsWith("=?UTF-8?B?")).toBe(true);
    expect(decodeMimeWords(value)).toBe(subject);
  });

  it("folds long ASCII subjects at whitespace", () => {
    const subject = "This is a very long subject line that goes on and on well past the seventy-eight character limit";
    const raw = buildMime(outgoing({ subject }), { date });
    const block = raw.slice(0, raw.indexOf("\r\n\r\n"));
    for (const l of block.split("\r\n")) expect(l.length).toBeLessThanOrEqual(78);
    expect(parse(raw).headers.get("subject")).toBe(subject);
  });

  it("keeps Bcc in the raw message and encodes non-ASCII display names", () => {
    const raw = buildMime(
      outgoing({
        to: [
          { name: "Zoë Müller", email: "zoe@example.de" },
          { name: "", email: "plain@example.com" },
        ],
        cc: [{ name: 'Smith, "JJ"', email: "jj@example.com" }],
        bcc: [{ name: "Hidden", email: "hidden@example.com" }],
      }),
      { date },
    );
    const { headers } = parse(raw);
    expect(headers.get("bcc")).toBe('"Hidden" <hidden@example.com>');
    expect(headers.get("cc")).toBe('"Smith, \\"JJ\\"" <jj@example.com>');
    const to = headers.get("to")!;
    expect(to).toMatch(/^=\?UTF-8\?B\?[^?]+\?= <zoe@example\.de>, plain@example\.com$/);
    expect(decodeMimeWords(to)).toBe("Zoë Müller <zoe@example.de>, plain@example.com");
  });

  it("folds long recipient lists", () => {
    const to = Array.from({ length: 12 }, (_, i) => ({ name: `Person Number ${i}`, email: `person${i}@example.com` }));
    const raw = buildMime(outgoing({ to }), { date });
    const block = raw.slice(0, raw.indexOf("\r\n\r\n"));
    for (const l of block.split("\r\n")) expect(l.length).toBeLessThanOrEqual(78);
    expect(parse(raw).headers.get("to")!.split(", ")).toHaveLength(12);
  });

  it("adds In-Reply-To and References for replies", () => {
    const raw = buildMime(
      outgoing({
        mode: "reply",
        subject: "Re: Analytical engine notes",
        inReplyTo: "<msg2@example.org>",
        references: "<msg1@example.org> <msg2@example.org>",
      }),
      { date },
    );
    const { headers } = parse(raw);
    expect(headers.get("in-reply-to")).toBe("<msg2@example.org>");
    expect(headers.get("references")).toBe("<msg1@example.org> <msg2@example.org>");
  });

  it("appends In-Reply-To to References when missing", () => {
    const raw = buildMime(outgoing({ inReplyTo: "<msg3@example.org>", references: "<msg1@example.org>" }), { date });
    expect(parse(raw).headers.get("references")).toBe("<msg1@example.org> <msg3@example.org>");
    const raw2 = buildMime(outgoing({ inReplyTo: "<only@example.org>", references: null }), { date });
    expect(parse(raw2).headers.get("references")).toBe("<only@example.org>");
  });

  it("strips CR/LF from header values (no header injection)", () => {
    const raw = buildMime(outgoing({ subject: "Hi\r\nBcc: victim@example.com" }), { date });
    const { headers } = parse(raw);
    expect(headers.has("bcc")).toBe(false);
    expect(headers.get("subject")).toBe("Hi Bcc: victim@example.com");
  });

  it("builds multipart/mixed with base64 attachments and RFC 2231 filenames", () => {
    const pdf = Buffer.alloc(300, 7);
    const raw = buildMime(
      outgoing({
        attachments: [
          { filename: "notes.pdf", mimeType: "application/pdf", data: pdf },
          { filename: "Résumé – année 2026.txt", mimeType: "text/plain", data: Buffer.from("hi") },
        ],
      }),
      { date, boundarySeed: "b" },
    );
    const { headers, body } = parse(raw);
    expect(headers.get("content-type")).toBe('multipart/mixed; boundary="=_tidepost_mixed_b"');
    const parts = body.split("--=_tidepost_mixed_b");
    expect(parts).toHaveLength(5); // preamble, alternative, 2 attachments, closing
    expect(parts[4].startsWith("--")).toBe(true);
    expect(parts[1].replace(/\r\n /g, " ")).toContain('Content-Type: multipart/alternative; boundary="=_tidepost_alt_b"');
    expect(parts[1]).toContain("--=_tidepost_alt_b--");

    const [attHead, attBody] = parts[2].split("\r\n\r\n");
    expect(attHead.replace(/\r\n /g, " ")).toContain('Content-Type: application/pdf; name="notes.pdf"');
    expect(attHead.replace(/\r\n /g, " ")).toContain('Content-Disposition: attachment; filename="notes.pdf"');
    expect(attHead).toContain("Content-Transfer-Encoding: base64");
    const b64Lines = attBody.replace(/\r\n$/, "").split("\r\n");
    expect(b64Lines[0]).toHaveLength(76);
    for (const l of b64Lines) expect(l.length).toBeLessThanOrEqual(76);
    expect(Buffer.from(b64Lines.join(""), "base64").equals(pdf)).toBe(true);

    const head2 = parts[3].split("\r\n\r\n")[0].replace(/\r\n /g, " ");
    expect(head2).toContain("filename*=UTF-8''R%C3%A9sum%C3%A9%20%E2%80%93%20ann%C3%A9e%202026.txt");
    expect(head2).toMatch(/name="=\?UTF-8\?B\?/);
  });

  it("splits very long non-ASCII filenames into RFC 2231 continuations", () => {
    const filename = "Ünïcödé-".repeat(8) + ".pdf";
    const raw = buildMime(
      outgoing({ attachments: [{ filename, mimeType: "application/pdf", data: Buffer.from("x") }] }),
      { date, boundarySeed: "c" },
    );
    const head = raw.split("--=_tidepost_mixed_c")[2].split("\r\n\r\n")[0];
    for (const l of head.split("\r\n").filter((x) => x.includes("filename"))) expect(l.length).toBeLessThanOrEqual(78);
    const unfolded = head.replace(/\r\n /g, " ");
    const pieces = [...unfolded.matchAll(/filename\*(\d+)\*=([^;\s]+)/g)];
    expect(pieces.length).toBeGreaterThan(1);
    const joined = pieces.map((m) => m[2]).join("").replace(/^UTF-8''/, "");
    expect(decodeURIComponent(joined)).toBe(filename);
  });

  it("uses base64 for mostly non-Latin text", () => {
    const text = "こんにちは、世界。これはテストです。".repeat(10);
    const raw = buildMime(outgoing({ text, html: "" }), { date });
    const { headers, body } = parse(raw);
    expect(headers.get("content-transfer-encoding")).toBe("base64");
    for (const l of body.split("\r\n")) expect(l.length).toBeLessThanOrEqual(76);
    expect(Buffer.from(body.replace(/\r\n/g, ""), "base64").toString("utf8")).toBe(text);
  });
});

describe("toBase64Url", () => {
  it("encodes strings and buffers without padding or +/", () => {
    expect(toBase64Url("hi?>")).toBe("aGk_Pg");
    expect(toBase64Url(Buffer.from([0xfb, 0xff]))).toBe("-_8");
  });
});
