// Exercises the Claude code path against a local mock of the Messages API.
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import type { Message, ThreadSummary } from "../shared/types";

interface Captured { headers: http.IncomingHttpHeaders; body: Record<string, unknown> }
const captured: Captured[] = [];
let reply: unknown = {};
let server: http.Server;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    let raw = "";
    req.on("data", (c) => (raw += c));
    req.on("end", () => {
      captured.push({ headers: req.headers, body: JSON.parse(raw) as Record<string, unknown> });
      res.writeHead(200, { "content-type": "application/json" });
      res.end(JSON.stringify({
        id: "msg_test", type: "message", role: "assistant", model: "claude-opus-5-5",
        content: [{ type: "text", text: JSON.stringify(reply) }],
        stop_reason: "end_turn", stop_sequence: null,
        usage: { input_tokens: 10, output_tokens: 10, cache_creation_input_tokens: 0, cache_read_input_tokens: 0 },
      }));
    });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  process.env.ANTHROPIC_API_KEY = "test-key";
  process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

afterAll(() => server.close());

const person = (name: string, email: string) => ({ name, email });
const me = person("Alex Morgan", "alex@northwind.example");
function message(i: number, from = person("Priya Nair", "priya@contoso.example"), text = "Could you approve the SOW by Friday?"): Message {
  return {
    id: `m${i}`, threadId: "t1", accountId: "a1", from, to: [me], cc: [], bcc: [], replyTo: [], date: new Date(2026, 10, i).toISOString(),
    subject: "SOW", snippet: text, unread: false, starred: false, folders: ["INBOX"], fromMe: from.email === me.email, attachments: [],
    bodyLoaded: true, html: null, text, uniqueText: text, uniqueHtml: null, messageIdHeader: null, references: null, listUnsubscribe: null,
  };
}
const summary = { id: "t1", subject: "SOW", audienceSize: 2, isBulk: false, lastFromMe: false } as ThreadSummary;

describe("assistant (Claude path)", () => {
  it("requests a structured brief with fallbacks and caching, and maps citations to messages", async () => {
    const { aiBrief } = await import("../server/assistant");
    reply = { summary: "Priya needs the SOW approved [#2].", since_you: null, asks: [{ text: "Approve the SOW", from: "Priya Nair", message_number: 2, due: "Friday" }], decisions: [], next_step: "Reply to Priya." };
    const out = await aiBrief(summary, [message(1, me, "Sending the SOW."), message(2)], me);
    expect(out.source).toBe("ai");
    expect(out.asks[0]).toEqual({ text: "Approve the SOW", from: "Priya Nair", messageId: "m2", due: "Friday" });
    const req = captured[captured.length - 1];
    expect(req.body.model).toBe("claude-opus-5-5");
    expect(req.body.fallbacks).toBe("default");
    expect(String(req.headers["anthropic-beta"])).toContain("server-side-fallback-2026-07-01");
    const oc = req.body.output_config as { effort: string; format: { type: string; schema: { properties: Record<string, unknown> } } };
    expect(oc.effort).toBe("low");
    expect(oc.format.type).toBe("json_schema");
    expect(Object.keys(oc.format.schema.properties)).toEqual(expect.arrayContaining(["summary", "asks", "decisions", "next_step"]));
    const system = req.body.system as { cache_control?: unknown }[];
    expect(system[0].cache_control).toEqual({ type: "ephemeral" });
    const content = (req.body.messages as { content: string }[])[0].content;
    expect(content).toContain("#1 · YOU (Alex Morgan)");
    expect(content).toContain("#2 · Priya Nair <priya@contoso.example>");
  });

  it("drafts three tones from rough notes", async () => {
    const { aiDraft } = await import("../server/assistant");
    reply = { brief: "Hi Priya,\n\nApproved.\n\nAlex", warm: "Hi Priya,\n\nThanks! Approved.\n\nAlex", firm: "Hi Priya,\n\nApproved, provided the dates hold.\n\nAlex" };
    const d = await aiDraft({ messages: [message(1)], me, notes: "approved", mode: "reply", recipients: ["Priya Nair"], subject: "Re: SOW" });
    expect(Object.keys(d.variants)).toEqual(["Brief", "Warm", "Firm"]);
    expect(d.variants.Firm).toContain("provided");
    expect((captured[captured.length - 1].body.messages as { content: string }[])[0].content).toContain("<your_rough_notes>\napproved");
  });

  it("turns a plan into approvable steps with params", async () => {
    const { aiPlan } = await import("../server/assistant");
    reply = { rationale: "Priya asked for approval [#1].", steps: [
      { kind: "reply", title: "Approve the SOW", detail: "Opens a draft.", notes: "approved, start Monday", days: null, label: null },
      { kind: "remind", title: "Follow up in 2 days", detail: "Reminder.", notes: null, days: 2, label: null },
    ] };
    const p = await aiPlan({ summary, messages: [message(1)], me, labels: ["Vendors"], instruction: "" });
    expect(p.steps.map((s) => s.state)).toEqual(["pending", "pending"]);
    expect(p.steps[0].params).toEqual({ notes: "approved, start Monday" });
    expect(p.steps[1].params).toEqual({ days: "2" });
  });
});
