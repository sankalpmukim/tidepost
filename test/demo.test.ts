import { describe, expect, it } from "vitest";
import type { MessageMeta, SyncPage } from "../server/providers/types";
import { DemoProvider } from "../server/providers/demo/index";

// A fixed local-time anchor (a Tuesday afternoon) so results don't depend on when tests run.
const NOW = new Date(2026, 10, 10, 15, 0, 0);
const make = (extra: ConstructorParameters<typeof DemoProvider>[0] = {}) => new DemoProvider({ seed: 7, now: NOW, latencyMs: 0, arrivalEverySeconds: 0, ...extra });

const shared = make();
const ALL = shared.allMessages();
const byId = new Map(ALL.map((m) => [m.id, m]));

function threadOf(p: DemoProvider, key: string): MessageMeta[] {
  const id = p.threadIdFor(key);
  if (!id) throw new Error(`no thread ${key}`);
  return p
    .allMessages()
    .filter((m) => m.threadId === id)
    .reverse();
}

describe("demo mailbox: shape", () => {
  it("builds a big mailbox quickly", () => {
    const t0 = performance.now();
    const p = make({ seed: 99 });
    expect(performance.now() - t0).toBeLessThan(1500);
    expect(p.allMessages().length).toBeGreaterThan(2000);
  });

  it("has ~2,500 messages across ~1,100 threads, newest first, over ~120 days", () => {
    expect(ALL.length).toBeGreaterThanOrEqual(2000);
    expect(ALL.length).toBeLessThan(3200);
    const threads = new Set(ALL.map((m) => m.threadId));
    expect(threads.size).toBeGreaterThan(900);
    expect(threads.size).toBeLessThan(1400);
    for (let i = 1; i < ALL.length; i++) expect(ALL[i - 1].date >= ALL[i].date).toBe(true);
    const spanDays = (Date.parse(ALL[0].date) - Date.parse(ALL[ALL.length - 1].date)) / 86_400_000;
    expect(spanDays).toBeGreaterThan(100);
    expect(spanDays).toBeLessThan(125);
    expect(Date.parse(ALL[0].date)).toBeLessThanOrEqual(NOW.getTime());
    expect(new Set(ALL.map((m) => m.id)).size).toBe(ALL.length);
    expect(ALL.every((m) => /^m\d{6}$/.test(m.id) && /^t\d{5}$/.test(m.threadId))).toBe(true);
  });

  it("uses only .example domains and lower-case emails", () => {
    for (const m of ALL) {
      for (const p of [m.from, ...m.to, ...m.cc, ...m.bcc, ...m.replyTo]) {
        expect(p.email).toBe(p.email.toLowerCase());
        expect(p.email).toMatch(/\.example$/);
      }
    }
  });

  it("has a realistic bulk mix with proper list headers", () => {
    const bulk = ALL.filter((m) => m.bulk.listId || m.bulk.autoSubmitted || m.bulk.precedence || ["updates", "promotions", "social", "forums"].includes(m.category ?? ""));
    const ratio = bulk.length / ALL.length;
    expect(ratio).toBeGreaterThan(0.33);
    expect(ratio).toBeLessThan(0.45);
    const nl = ALL.find((m) => m.from.name === "Infra Weekly");
    expect(nl).toBeTruthy();
    expect(nl?.bulk.listUnsubscribe).toMatch(/^<mailto:[^>]+>, <https:\/\/[^>]+>$/);
    expect(nl?.bulk.listUnsubscribePost).toBe("List-Unsubscribe=One-Click");
    expect(nl?.bulk.listId).toBeTruthy();
    const cats = new Set(ALL.map((m) => m.category));
    for (const c of ["updates", "promotions", "forums", "social"]) expect(cats.has(c)).toBe(true);
    expect(ALL.some((m) => m.bulk.autoSubmitted === "auto-generated")).toBe(true);
  });

  it("newsletters have real-looking HTML with a tracking pixel and unsubscribe footer", async () => {
    const nl = ALL.find((m) => m.from.name === "Infra Weekly");
    const b = await shared.getBody(nl?.id ?? "");
    expect(b.html).toContain("<table");
    expect(b.html).toContain("https://track.newsletter.example/open.gif?u=");
    expect(b.html).toMatch(/Unsubscribe<\/a>/);
    expect(b.text).toBeTruthy();
  });

  it("states: ~60 unread inbox threads, sent/archive/spam/trash/starred present", () => {
    const inbox = ALL.filter((m) => m.folders.includes("INBOX"));
    const unreadThreads = new Set(inbox.filter((m) => m.unread).map((m) => m.threadId));
    expect(unreadThreads.size).toBeGreaterThanOrEqual(50);
    expect(unreadThreads.size).toBeLessThanOrEqual(70);
    const inboxThreads = new Set(inbox.map((m) => m.threadId));
    expect(inboxThreads.size).toBeGreaterThan(unreadThreads.size + 30);
    expect(ALL.filter((m) => m.folders.includes("SENT")).length).toBeGreaterThan(100);
    expect(ALL.filter((m) => m.folders.includes("ARCHIVE")).length).toBeGreaterThan(ALL.length / 2);
    expect(ALL.some((m) => m.folders.includes("SPAM"))).toBe(true);
    expect(ALL.some((m) => m.folders.includes("TRASH"))).toBe(true);
    expect(ALL.filter((m) => m.starred).length).toBeGreaterThanOrEqual(3);
    for (const m of ALL) {
      expect(m.folders.includes("INBOX") && m.folders.includes("ARCHIVE")).toBe(false);
      if (m.folders.includes("SENT")) {
        expect(m.from.email).toBe("alex.morgan@northwind.example");
        expect(m.folders).not.toContain("ARCHIVE");
        expect(m.unread).toBe(false);
      }
    }
    for (const label of ["Label_1", "Label_2", "Label_3", "Label_4", "Label_5"]) expect(ALL.some((m) => m.folders.includes(label))).toBe(true);
  });

  it("the showcase thread is ultra-long with 25+ participants across 4 domains", async () => {
    const sc = threadOf(shared, "showcase");
    expect(sc.length).toBeGreaterThanOrEqual(120);
    const people = new Set(sc.flatMap((m) => [m.from, ...m.to, ...m.cc].map((p) => p.email)));
    expect(people.size).toBeGreaterThanOrEqual(25);
    const domains = new Set([...people].map((e) => e.split("@")[1]));
    for (const d of ["northwind.example", "contoso.example", "fabrikam.example", "adatum.example"]) expect(domains.has(d)).toBe(true);
    expect(sc[sc.length - 1].subject).toBe("RE: Q4 platform migration – cutover plan & rollback criteria");
    const span = (Date.parse(sc[sc.length - 1].date) - Date.parse(sc[0].date)) / 86_400_000;
    expect(span).toBeGreaterThan(18);
    expect(span).toBeLessThan(24);
    // Attachments in the thread
    const names: string[] = [];
    for (const m of sc.filter((x) => x.hasAttachments)) names.push(...(await shared.getBody(m.id)).attachments.map((a) => a.filename));
    expect(names).toContain("cutover_runbook_v3.pdf");
    expect(names).toContain("rollback_matrix.xlsx");
    // Open asks near the end, addressed to Alex.
    const tail = sc.slice(-8);
    const tailText = await Promise.all(tail.map(async (m) => (await shared.getBody(m.id)).text ?? ""));
    expect(tailText.some((t) => t.includes("by Thursday EOD"))).toBe(true);
    expect(tail.filter((m) => m.to.some((p) => p.email === "alex.morgan@northwind.example")).length).toBeGreaterThanOrEqual(2);
    // Alex participates; Cc changes over time.
    expect(sc.filter((m) => m.folders.includes("SENT")).length).toBeGreaterThanOrEqual(8);
    expect(new Set(sc.map((m) => m.cc.length)).size).toBeGreaterThan(5);
  });

  it("replies carry quoted history (Gmail, Outlook and plain-text styles) and signatures", async () => {
    const sc = threadOf(shared, "showcase").slice(1);
    let gmail = 0;
    let outlook = 0;
    let plain = 0;
    for (const m of sc) {
      const b = await shared.getBody(m.id);
      expect(b.text).toBeTruthy();
      const text = b.text ?? "";
      const quoted = /wrote:/.test(text) || /\nFrom: .*\nSent: /.test(text);
      expect(quoted, `${m.id} has no quoted history`).toBe(true);
      if (b.html?.includes('class="gmail_quote"')) gmail++;
      if (b.html?.includes('id="divRplyFwdMsg"') && b.html.includes('id="appendonsend"')) outlook++;
      if (b.html === null && /\n> /.test(text)) plain++;
    }
    expect(gmail).toBeGreaterThan(20);
    expect(outlook).toBeGreaterThan(10);
    expect(plain).toBeGreaterThan(3);
    // A Fabrikam message has a corporate signature with a cid: logo and disclaimer.
    const fab = sc.find((m) => m.from.email.endsWith("@fabrikam.example"));
    const fb = await shared.getBody(fab?.id ?? "");
    expect(fb.html).toContain("CONFIDENTIALITY NOTICE");
    const inline = fb.attachments.find((a) => a.inline);
    expect(inline?.contentId).toBeTruthy();
    expect(fb.html).toContain(`cid:${inline?.contentId}`);
    // Plain-text signature delimiter
    const gm = sc.find((m) => m.from.email === "priya.raman@northwind.example");
    expect((await shared.getBody(gm?.id ?? "")).text).toContain("\n-- \nPriya Raman");
  });

  it("has the other long threads", () => {
    for (const [key, min] of [["hiring", 30], ["incident", 30], ["renewal", 30], ["design", 30]] as const) {
      expect(threadOf(shared, key).length, key).toBeGreaterThanOrEqual(min);
    }
  });

  it("every thread's In-Reply-To chain resolves within the thread", () => {
    const byThread = new Map<string, MessageMeta[]>();
    for (const m of ALL) byThread.set(m.threadId, [...(byThread.get(m.threadId) ?? []), m]);
    for (const [, msgs] of byThread) {
      const headers = new Map(msgs.map((m) => [m.messageIdHeader, m]));
      for (const m of msgs) {
        expect(m.messageIdHeader).toMatch(/^<[^<>\s]+@[^<>\s]+>$/);
        let cur: MessageMeta | undefined = m;
        const seen = new Set<string>();
        while (cur?.inReplyTo) {
          expect(seen.has(cur.id)).toBe(false);
          seen.add(cur.id);
          const parent = headers.get(cur.inReplyTo);
          expect(parent, `${cur.id} -> ${cur.inReplyTo}`).toBeTruthy();
          expect(Date.parse(parent?.date ?? "")).toBeLessThanOrEqual(Date.parse(cur.date));
          expect(cur.references?.split(" ")).toContain(cur.inReplyTo);
          cur = parent;
        }
      }
    }
  });

  it("is deterministic for the same seed and now", async () => {
    const a = make();
    const b = make();
    expect(JSON.stringify(a.allMessages())).toBe(JSON.stringify(b.allMessages()));
    for (const id of ["m000001", "m001000", ALL[0].id, ALL[5].id]) {
      expect(JSON.stringify(await a.getBody(id))).toBe(JSON.stringify(await b.getBody(id)));
    }
    const c = make({ seed: 8 });
    expect(JSON.stringify(c.allMessages())).not.toBe(JSON.stringify(a.allMessages()));
    // Bodies are stable across calls.
    expect(JSON.stringify(await a.getBody(ALL[3].id))).toBe(JSON.stringify(await a.getBody(ALL[3].id)));
  });

  it("serves valid attachment bytes", async () => {
    const sc = threadOf(shared, "showcase");
    const find = async (name: string) => {
      for (const m of sc.filter((x) => x.hasAttachments)) {
        const a = (await shared.getBody(m.id)).attachments.find((x) => x.filename === name);
        if (a) return shared.getAttachment(m.id, a.id);
      }
      throw new Error(name);
    };
    const pdf = await find("cutover_runbook_v3.pdf");
    expect(pdf.mimeType).toBe("application/pdf");
    expect(pdf.data.subarray(0, 5).toString()).toBe("%PDF-");
    expect(pdf.data.toString("latin1")).toContain("%%EOF");
    const xlsx = await find("rollback_matrix.xlsx");
    expect(xlsx.data.subarray(0, 2).toString()).toBe("PK");
    const png = await find("rehearsal2_timeline.png");
    expect([...png.data.subarray(0, 8)]).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    const csv = await find("egress_nat_ranges_final.csv");
    expect(csv.data.toString()).toContain("Range,");
  });

  it("lists folders with counts", async () => {
    const folders = await shared.listFolders();
    const ids = folders.map((f) => f.id);
    expect(ids).toEqual(["INBOX", "STARRED", "SENT", "DRAFT", "ARCHIVE", "SPAM", "TRASH", "Label_1", "Label_2", "Label_3", "Label_4", "Label_5"]);
    expect(folders.slice(7).map((f) => f.name)).toEqual(["Vendors", "Hiring", "Incidents", "Finance", "Receipts"]);
    const inbox = folders[0];
    expect(inbox.total).toBe(ALL.filter((m) => m.folders.includes("INBOX")).length);
    expect(inbox.unread).toBe(ALL.filter((m) => m.folders.includes("INBOX") && m.unread).length);
    expect(folders.every((f) => f.style === "label")).toBe(true);
    expect(await shared.getProfile()).toEqual({ name: "Alex Morgan", email: "alex.morgan@northwind.example" });
  });

  it("threadMessages returns non-trash messages oldest first, including sent", async () => {
    const id = shared.threadIdFor("showcase") ?? "";
    const msgs = await shared.threadMessages(id);
    expect(msgs.length).toBe(threadOf(shared, "showcase").length);
    for (let i = 1; i < msgs.length; i++) expect(msgs[i - 1].date <= msgs[i].date).toBe(true);
    expect(msgs.some((m) => m.folders.includes("SENT"))).toBe(true);
  });
});

describe("demo mailbox: sync", () => {
  it("initialSync pages newest-first in 100s with progress and excludes spam/trash", async () => {
    const p = make();
    const pages: SyncPage[] = [];
    const progress: { done: number; total: number }[] = [];
    const res = await p.initialSync({ maxMessages: 1050, onPage: (page, prog) => void (pages.push(page), progress.push(prog)) });
    expect(res.cursor).toMatch(/^\d+$/);
    expect(pages.length).toBe(11);
    expect(pages.slice(0, 10).every((pg) => pg.messages.length === 100)).toBe(true);
    expect(pages[10].messages.length).toBe(50);
    expect(progress.at(-1)).toEqual({ done: 1050, total: 1050 });
    for (let i = 1; i < progress.length; i++) expect(progress[i].done).toBeGreaterThan(progress[i - 1].done);
    const msgs = pages.flatMap((pg) => pg.messages);
    for (let i = 1; i < msgs.length; i++) expect(msgs[i - 1].date >= msgs[i].date).toBe(true);

    const full: MessageMeta[] = [];
    await p.initialSync({ maxMessages: 100_000, onPage: (pg) => void full.push(...pg.messages) });
    expect(full.some((m) => m.folders.includes("SPAM") || m.folders.includes("TRASH"))).toBe(false);
    expect(full.length).toBe(ALL.filter((m) => !m.folders.includes("SPAM") && !m.folders.includes("TRASH")).length);
  });

  it("initialSync honours abort signals", async () => {
    const p = make();
    const ac = new AbortController();
    let pagesSeen = 0;
    await expect(
      p.initialSync({
        maxMessages: 1000,
        signal: ac.signal,
        onPage: () => {
          pagesSeen++;
          if (pagesSeen === 2) ac.abort();
        },
      }),
    ).rejects.toThrow(/abort/i);
    expect(pagesSeen).toBe(2);
  });

  it("changes() reports modified messages after modify()", async () => {
    const p = make();
    const { cursor } = await p.initialSync({ maxMessages: 10, onPage: () => {} });
    expect((await p.changes(cursor)).messages).toEqual([]);
    const target = p.allMessages().find((m) => m.folders.includes("INBOX") && m.unread && !m.folders.includes("SENT"));
    if (!target) throw new Error("no unread inbox message");
    await p.modify([target.id], { kind: "read", value: true });
    const c1 = await p.changes(cursor);
    expect(c1.resetRequired).toBe(false);
    expect(c1.messages.map((m) => m.id)).toEqual([target.id]);
    expect(c1.messages[0].unread).toBe(false);
    expect(Number(c1.cursor)).toBeGreaterThan(Number(cursor));

    await p.modify([target.id], { kind: "archive" });
    const c2 = await p.changes(c1.cursor);
    expect(c2.messages[0].folders).toContain("ARCHIVE");
    expect(c2.messages[0].folders).not.toContain("INBOX");

    await p.modify([target.id], { kind: "addLabel", folderId: "Label_2" });
    await p.modify([target.id], { kind: "starred", value: true });
    const c3 = await p.changes(c2.cursor);
    expect(c3.messages[0].folders).toContain("Label_2");
    expect(c3.messages[0].starred).toBe(true);
    expect((await p.listFolders()).find((f) => f.id === "Label_2")?.total).toBe(ALL.filter((m) => m.folders.includes("Label_2")).length + 1);

    await p.modify([target.id], { kind: "inbox" });
    expect((await p.changes(c3.cursor)).messages[0].folders).toEqual(expect.arrayContaining(["INBOX", "Label_2"]));

    await p.modify([target.id], { kind: "move", folderId: "Label_4" });
    const moved = (await p.changes(c3.cursor)).messages[0];
    expect(moved.folders).toEqual(expect.arrayContaining(["ARCHIVE", "Label_4"]));
    expect(moved.folders).not.toContain("INBOX");

    await p.modify([target.id], { kind: "trash" });
    const trashed = (await p.changes(c3.cursor)).messages[0];
    expect(trashed.folders).toContain("TRASH");
    expect((await p.threadMessages(target.threadId)).some((m) => m.id === target.id)).toBe(false);

    // Archiving a sent message never adds ARCHIVE.
    const sent = p.allMessages().find((m) => m.folders.includes("SENT"));
    await p.modify([sent?.id ?? ""], { kind: "archive" });
    expect(p.allMessages().find((m) => m.id === sent?.id)?.folders).not.toContain("ARCHIVE");

    expect((await p.changes("not-a-number")).resetRequired).toBe(true);
  });

  it("send() appends to the thread and a recipient auto-replies ~20s later", async () => {
    let t = NOW.getTime() + 60_000;
    const p = make({ clock: () => t });
    const sc = threadOf(p, "showcase");
    const last = sc[sc.length - 1];
    const { cursor } = await p.initialSync({ maxMessages: 10, onPage: () => {} });
    const carlos = { name: "Carlos Mendes", email: "carlos.mendes@adatum.example" };
    const res = await p.send({
      from: { name: "Alex Morgan", email: "alex.morgan@northwind.example" },
      to: [carlos],
      cc: [],
      bcc: [],
      subject: last.subject,
      text: "Carlos — confirmed, the ranges in the CSV are final. Please file the CAB change.\n\nAlex",
      html: "<div>Carlos — confirmed, the ranges in the CSV are final. Please file the CAB change.</div><div>Alex</div>",
      attachments: [{ filename: "notes.txt", mimeType: "text/plain", data: Buffer.from("hello") }],
      inReplyTo: last.messageIdHeader,
      references: last.references,
      threadId: last.threadId,
      replyToProviderId: last.id,
      mode: "reply",
    });
    expect(res.threadId).toBe(last.threadId);
    const c1 = await p.changes(cursor);
    expect(c1.messages.map((m) => m.id)).toEqual([res.id]);
    const sent = c1.messages[0];
    expect(sent.folders).toEqual(["SENT"]);
    expect(sent.inReplyTo).toBe(last.messageIdHeader);
    expect(sent.hasAttachments).toBe(true);
    expect((await p.getAttachment(sent.id, "att1")).data.toString()).toBe("hello");
    expect((await p.threadMessages(last.threadId)).at(-1)?.id).toBe(res.id);

    t += 10_000;
    expect((await p.changes(c1.cursor)).messages).toEqual([]);
    t += 11_000;
    const c2 = await p.changes(c1.cursor);
    expect(c2.messages.length).toBe(1);
    const reply = c2.messages[0];
    expect(reply.from.email).toBe("carlos.mendes@adatum.example");
    expect(reply.threadId).toBe(last.threadId);
    expect(reply.inReplyTo).toBe(sent.messageIdHeader);
    expect(reply.folders).toContain("INBOX");
    expect(reply.unread).toBe(true);
    const body = await p.getBody(reply.id);
    expect(body.text).toMatch(/wrote:/);
    expect(body.text).toContain("ranges in the CSV are final");

    // A brand-new thread for a fresh message.
    const fresh = await p.send({ from: carlos, to: [{ name: "Someone", email: "someone@nowhere.example" }], cc: [], bcc: [], subject: "Hello", text: "Hi", html: "", attachments: [], inReplyTo: null, references: null, threadId: null, replyToProviderId: null, mode: "new" });
    expect(fresh.threadId).not.toBe(last.threadId);
    expect(p.allMessages()[0].from.email).toBe("alex.morgan@northwind.example");
  });

  it("delivers deterministic live arrivals as time passes", async () => {
    const run = async () => {
      let t = NOW.getTime();
      const p = make({ clock: () => t, arrivalEverySeconds: 120 });
      const { cursor } = await p.initialSync({ maxMessages: 1, onPage: () => {} });
      t += 60_000;
      expect((await p.changes(cursor)).messages).toEqual([]);
      const got: MessageMeta[] = [];
      let cur = cursor;
      for (let i = 0; i < 6; i++) {
        t += 121_000;
        const c = await p.changes(cur);
        got.push(...c.messages);
        cur = c.cursor;
      }
      return got;
    };
    const a = await run();
    const b = await run();
    expect(a.length).toBe(6);
    expect(a.map((m) => `${m.from.email}|${m.subject}`)).toEqual(b.map((m) => `${m.from.email}|${m.subject}`));
    expect(a.every((m) => m.folders.includes("INBOX") && m.unread)).toBe(true);
    // The first arrival continues the showcase thread.
    const sc = make().threadIdFor("showcase");
    expect(a[0].threadId).toBe(sc);
    expect(a[0].subject).toBe("RE: Q4 platform migration – cutover plan & rollback criteria");
  });
});

describe("demo mailbox: search", () => {
  const p = shared;
  const ids = (ms: MessageMeta[]) => ms.map((m) => m.id);
  const live = ALL.filter((m) => !m.folders.includes("SPAM") && !m.folders.includes("TRASH"));

  it("plain words are case-insensitive across subject, people and body", async () => {
    const r = await p.search("PGBOUNCER", 5000);
    expect(r.length).toBeGreaterThan(5);
    const r2 = await p.search("Kevin", 5000);
    expect(r2.some((m) => m.from.email === "kevin.walsh@contoso.example")).toBe(true);
    for (let i = 1; i < r.length; i++) expect(r[i - 1].date >= r[i].date).toBe(true);
    expect((await p.search("pgbouncer", 3)).length).toBe(3);
  });

  it("from:, to:, subject:", async () => {
    const r = await p.search("from:carlos", 5000);
    expect(r.length).toBeGreaterThan(3);
    expect(r.every((m) => m.from.email.includes("carlos") || m.from.name.toLowerCase().includes("carlos"))).toBe(true);
    const to = await p.search("to:alex.morgan@northwind.example", 5000);
    expect(to.every((m) => [...m.to, ...m.cc, ...m.bcc].some((x) => x.email === "alex.morgan@northwind.example"))).toBe(true);
    const sub = await p.search('subject:"cutover plan"', 5000);
    expect(sub.length).toBe(threadOf(p, "showcase").length);
  });

  it("has:attachment, is:unread, is:starred, in:inbox/sent/archive, label:", async () => {
    expect(ids(await p.search("has:attachment", 5000))).toEqual(ids(live.filter((m) => m.hasAttachments)));
    expect(ids(await p.search("is:unread", 5000))).toEqual(ids(live.filter((m) => m.unread)));
    expect(ids(await p.search("is:starred", 5000))).toEqual(ids(live.filter((m) => m.starred)));
    expect(ids(await p.search("in:inbox", 5000))).toEqual(ids(live.filter((m) => m.folders.includes("INBOX"))));
    expect(ids(await p.search("in:sent", 5000))).toEqual(ids(live.filter((m) => m.folders.includes("SENT"))));
    expect(ids(await p.search("in:archive", 5000))).toEqual(ids(live.filter((m) => m.folders.includes("ARCHIVE"))));
    expect(ids(await p.search("label:hiring", 5000))).toEqual(ids(live.filter((m) => m.folders.includes("Label_2"))));
    expect(ids(await p.search("in:spam", 5000))).toEqual(ids(ALL.filter((m) => m.folders.includes("SPAM"))));
  });

  it("before:/after:, quoted phrases, negation and combinations", async () => {
    const d = new Date(NOW.getTime() - 10 * 86_400_000);
    const day = `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")}`;
    const start = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    expect(ids(await p.search(`after:${day}`, 5000))).toEqual(ids(live.filter((m) => Date.parse(m.date) >= start)));
    expect(ids(await p.search(`before:${day}`, 5000))).toEqual(ids(live.filter((m) => Date.parse(m.date) < start)));

    const phrase = await p.search('"by Thursday EOD"', 5000);
    expect(phrase.length).toBeGreaterThan(0);
    expect(phrase.length).toBeLessThan((await p.search("Thursday", 5000)).length);

    const withNeg = await p.search("from:grace -subject:cutover", 5000);
    expect(withNeg.length).toBeGreaterThan(0);
    expect(withNeg.every((m) => !m.subject.toLowerCase().includes("cutover"))).toBe(true);
    const combo = await p.search("from:priya has:attachment in:inbox", 5000);
    expect(combo.every((m) => m.hasAttachments && m.folders.includes("INBOX"))).toBe(true);
    const neg = await p.search("-is:unread in:inbox", 5000);
    expect(neg.every((m) => !m.unread)).toBe(true);
    expect(byId.size).toBe(ALL.length);
  });
});
