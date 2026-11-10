import { describe, expect, it } from "vitest";
import { diff, finalText, hunkCount, toLines } from "../src/lib/diff";
import { sendChecks } from "../src/lib/checks";
import { sendersLine, initials, listDate } from "../src/lib/format";

describe("draft diff", () => {
  const notes = "Hi Priya,\nok on the quote i guess\nthu works\nmatte\nThanks!";
  const variant = "Hi Priya,\n\nThe revised quote of ₹4.2L is approved.\n\nThursday 11:00 works for the site visit.\n\nMatte tiles for the backsplash, please.\n\nThanks!";
  const segs = diff(toLines(notes), toLines(variant));

  it("finds the changed hunks and keeps shared lines", () => {
    expect(hunkCount(segs)).toBe(1);
    expect(segs[0]).toMatchObject({ kind: "same" });
  });

  it("composes the final text from keep/reject decisions", () => {
    expect(finalText(segs, {})).toContain("The revised quote of ₹4.2L is approved.");
    const rejected = finalText(segs, { 0: "reject" });
    expect(rejected).toContain("ok on the quote i guess");
    expect(rejected).not.toContain("approved");
  });

  it("splits multi-hunk drafts independently", () => {
    const a = toLines("Hi\nline one\nkeep\nline two\nBye");
    const b = toLines("Hi\nLine one, edited\nkeep\nLine two, edited\nBye");
    const s = diff(a, b);
    expect(hunkCount(s)).toBe(2);
    expect(finalText(s, { 0: "accept", 1: "reject" })).toBe("Hi\nLine one, edited\nkeep\nline two\nBye");
  });
});

describe("send checks", () => {
  const base = { me: "alex@northwind.example", to: [{ name: "Dana", email: "dana@northwind.example" }], cc: [], bcc: [], subject: "Plan", text: "Looks good", attachmentCount: 0, unreviewedDraft: false };

  it("passes an ordinary internal message", () => {
    expect(sendChecks(base)).toEqual([]);
  });

  it("flags external recipients, big audiences, missing attachments and empty subjects", () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `P${i}`, email: `p${i}@northwind.example` }));
    const codes = sendChecks({ ...base, to: [{ name: "V", email: "v@contoso.example" }], cc: many, subject: "", text: "Please see the attached runbook" }).map((c) => c.code);
    expect(codes).toEqual(expect.arrayContaining(["external", "large-audience", "missing-attachment", "no-subject"]));
  });

  it("ignores external checks for personal domains", () => {
    expect(sendChecks({ ...base, me: "alex@gmail.com" }).map((c) => c.code)).not.toContain("external");
  });
});

describe("format", () => {
  it("summarizes senders", () => {
    const me = "me@x.example";
    expect(sendersLine([{ name: "Priya Nair", email: "p@x.example" }, { name: "Me", email: me }], me)).toBe("Priya, me");
    expect(initials({ name: "Nair, Priya", email: "p@x.example" })).toBe("PN");
  });
  it("formats list dates relative to now", () => {
    const now = new Date("2026-11-10T15:00:00");
    expect(listDate("2026-11-09T10:00:00", now)).toBe("Yesterday");
  });
});
