// Hand-written content for the demo mailbox: people, thread scripts,
// newsletter templates and notification banks. Everything here is fictional;
// every domain is an RFC 2606 ".example" domain.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type MailClient = "gmail" | "outlook" | "plain";

export interface PersonDef {
  /** Short key used by scripts ("me" is reserved for the mailbox owner). */
  key: string;
  name: string;
  email: string;
  title: string;
  org: string;
  phone: string | null;
  /** Which mail client they use: decides quoting style and signature. */
  client: MailClient;
}

export interface ScriptMsg {
  /** Person key of the sender ("me" = Alex). */
  from: string;
  /** Days before "now" (0 = today, 1 = yesterday, ...). */
  d: number;
  /** Local time "HH:MM" (24h). */
  t: string;
  /**
   * New content only: greeting, body paragraphs (blank-line separated), sign-off.
   * No quoted history and no signature block: the generator adds those.
   */
  text: string;
  /** 0-based index of the message this one replies to; default: the previous message. */
  re?: number;
  /** Explicit recipients (person keys). Default: reply-all to the replied message. Required on message 0. */
  to?: string[];
  cc?: string[];
  /** Added to Cc on top of the reply-all default. */
  add?: string[];
  /** Removed from To/Cc. */
  drop?: string[];
  /** Attachment filenames (extension decides the type). */
  attach?: string[];
  /** Sent from a phone: no HTML signature, "Sent from my iPhone". */
  mobile?: boolean;
  /** Forward rather than reply. */
  fwd?: boolean;
  important?: boolean;
}

export type LabelName = "Vendors" | "Hiring" | "Incidents" | "Finance" | "Receipts";

export interface ThreadScript {
  key: string;
  /** Base subject (no Re:/RE: prefix; the generator adds prefixes on replies). */
  subject: string;
  labels?: LabelName[];
  /** Still in Alex's inbox? Default: true when the last message is within 10 days. */
  inbox?: boolean;
  /** Number of newest messages not from Alex that are unread. Default: computed. */
  unread?: number;
  starred?: boolean;
  messages: ScriptMsg[];
}

/** A scripted live arrival: delivered while the demo is running. */
export type ArrivalScript =
  | {
      type: "reply";
      /** ThreadScript key to reply into ("showcase" = the cutover thread). */
      thread: string;
      from: string;
      text: string;
      attach?: string[];
      /** Recipients; default reply-all to the latest message of the thread. */
      to?: string[];
      cc?: string[];
    }
  | {
      type: "new";
      subject: string;
      from: string;
      to: string[];
      cc?: string[];
      text: string;
      attach?: string[];
      labels?: LabelName[];
    };

/** Bank used to generate many ordinary work threads with variation. */
export interface TopicBank {
  key: string;
  /** Subject templates; slots like {project} are filled from SLOTS. */
  subjects: string[];
  /** Who usually starts the thread. */
  starter: "colleague" | "vendor" | "exec" | "staff";
  /** Person keys that fit this topic (the generator picks starters/participants from here). */
  people: string[];
  /** Opening message bodies, 2–4 sentences, no greeting and no sign-off. */
  openers: string[];
  /** Direct questions to Alex appended to an opener ("Could you approve ... by Friday?"). */
  asks: string[];
  /** Follow-ups from other participants (no greeting/sign-off). */
  replies: string[];
  /** Alex's replies (no greeting/sign-off). */
  myReplies: string[];
  /** Short closing messages from others ("Thanks, that works."). */
  closers: string[];
  labels?: LabelName[];
}

export interface NewsletterDef {
  key: string;
  fromName: string;
  fromEmail: string;
  /** List-Id header value, e.g. "Infra Weekly <weekly.infraweekly.example>". */
  listId: string;
  unsubMailto: string;
  unsubUrl: string;
  category: "promotions" | "updates" | "forums" | "social";
  /** Roughly how often an issue goes out. */
  everyDays: number;
  /** Subject templates. {n} = issue number, {headline} = first item's title. */
  subjects: string[];
  intros: string[];
  items: { title: string; blurb: string; tag?: string }[];
  /** Call-to-action button labels. */
  ctas: string[];
  /** Brand colour, CSS hex. */
  accent: string;
  layout: "digest" | "promo" | "minimal";
}

export interface SimpleMailDef {
  fromName: string;
  fromEmail: string;
  subject: string;
  /** Plain-text body, paragraphs separated by blank lines. */
  body: string;
}

// ---------------------------------------------------------------------------
// People
// ---------------------------------------------------------------------------

export const ME_DEFAULT = { key: "me", name: "Alex Morgan", email: "alex.morgan@northwind.example", title: "Director, Platform Engineering", org: "Northwind", phone: "+1 (415) 555-0142", client: "gmail" } satisfies PersonDef;

export const PEOPLE: PersonDef[] = [
  // ---- Northwind (Google Workspace; a few plain-text holdouts) ----
  { key: "renata", name: "Renata Okafor", email: "renata.okafor@northwind.example", title: "Chief Technology Officer", org: "Northwind", phone: "+1 (415) 555-0100", client: "gmail" },
  { key: "marcus", name: "Marcus Bell", email: "marcus.bell@northwind.example", title: "VP Engineering", org: "Northwind", phone: "+1 (415) 555-0118", client: "gmail" },
  { key: "helen", name: "Helen Varga", email: "helen.varga@northwind.example", title: "Finance Director", org: "Northwind", phone: "+1 (415) 555-0131", client: "gmail" },
  { key: "priya", name: "Priya Raman", email: "priya.raman@northwind.example", title: "Staff Site Reliability Engineer", org: "Northwind", phone: "+1 (415) 555-0157", client: "gmail" },
  { key: "jonah", name: "Jonah Feld", email: "jonah.feld@northwind.example", title: "Senior SRE", org: "Northwind", phone: null, client: "plain" },
  { key: "mei", name: "Mei Tanaka", email: "mei.tanaka@northwind.example", title: "Engineering Manager, Platform Runtime", org: "Northwind", phone: "+1 (415) 555-0163", client: "gmail" },
  { key: "diego", name: "Diego Alvarez", email: "diego.alvarez@northwind.example", title: "Engineering Manager, Data Platform", org: "Northwind", phone: "+1 (415) 555-0171", client: "gmail" },
  { key: "sam", name: "Sam Okoye", email: "sam.okoye@northwind.example", title: "Site Reliability Engineer", org: "Northwind", phone: null, client: "gmail" },
  { key: "lena", name: "Lena Kowalski", email: "lena.kowalski@northwind.example", title: "Senior Platform Engineer", org: "Northwind", phone: null, client: "gmail" },
  { key: "tariq", name: "Tariq Haddad", email: "tariq.haddad@northwind.example", title: "Network Engineer", org: "Northwind", phone: "+1 (415) 555-0189", client: "plain" },
  { key: "nora", name: "Nora Lindqvist", email: "nora.lindqvist@northwind.example", title: "Database Engineering Lead", org: "Northwind", phone: "+1 (415) 555-0192", client: "gmail" },
  { key: "owen", name: "Owen Price", email: "owen.price@northwind.example", title: "Platform Engineer", org: "Northwind", phone: null, client: "gmail" },
  { key: "ines", name: "Inês Duarte", email: "ines.duarte@northwind.example", title: "Release Manager", org: "Northwind", phone: "+1 (415) 555-0124", client: "gmail" },
  { key: "kofi", name: "Kofi Mensah", email: "kofi.mensah@northwind.example", title: "Security Engineer", org: "Northwind", phone: null, client: "gmail" },
  { key: "rachel", name: "Rachel Stein", email: "rachel.stein@northwind.example", title: "Head of Security", org: "Northwind", phone: "+1 (415) 555-0109", client: "gmail" },
  { key: "ben", name: "Ben Carter", email: "ben.carter@northwind.example", title: "Engineering Manager, Payments", org: "Northwind", phone: "+1 (415) 555-0136", client: "gmail" },
  { key: "aisha", name: "Aisha Khan", email: "aisha.khan@northwind.example", title: "Staff Engineer, Payments", org: "Northwind", phone: null, client: "gmail" },
  { key: "tom", name: "Tom Becker", email: "tom.becker@northwind.example", title: "Product Manager, Payments", org: "Northwind", phone: "+1 (415) 555-0145", client: "gmail" },
  { key: "grace", name: "Grace Liu", email: "grace.liu@northwind.example", title: "Senior Technical Program Manager", org: "Northwind", phone: "+1 (415) 555-0150", client: "gmail" },
  { key: "harper", name: "Harper Quinn", email: "harper.quinn@northwind.example", title: "Senior Technical Recruiter", org: "Northwind", phone: "+1 (415) 555-0177", client: "gmail" },
  { key: "elena", name: "Elena Petrova", email: "elena.petrova@northwind.example", title: "Recruiting Coordinator", org: "Northwind", phone: null, client: "gmail" },
  { key: "victor", name: "Victor Chen", email: "victor.chen@northwind.example", title: "Principal Engineer", org: "Northwind", phone: null, client: "plain" },
  { key: "zoe", name: "Zoe Adams", email: "zoe.adams@northwind.example", title: "Customer Support Lead", org: "Northwind", phone: "+1 (415) 555-0183", client: "gmail" },
  { key: "malik", name: "Malik Johnson", email: "malik.johnson@northwind.example", title: "Finance Business Partner, Engineering", org: "Northwind", phone: "+1 (415) 555-0128", client: "gmail" },
  { key: "olivia", name: "Olivia Grant", email: "olivia.grant@northwind.example", title: "Procurement Manager", org: "Northwind", phone: "+1 (415) 555-0114", client: "gmail" },
  { key: "chris", name: "Chris Navarro", email: "chris.navarro@northwind.example", title: "Senior Counsel", org: "Northwind", phone: "+1 (415) 555-0105", client: "gmail" },
  { key: "sofia", name: "Sofia Romano", email: "sofia.romano@northwind.example", title: "HR Business Partner", org: "Northwind", phone: null, client: "gmail" },
  { key: "ethan", name: "Ethan Brooks", email: "ethan.brooks@northwind.example", title: "Data Engineer", org: "Northwind", phone: null, client: "gmail" },
  { key: "hana", name: "Hana Sato", email: "hana.sato@northwind.example", title: "Frontend Lead", org: "Northwind", phone: null, client: "gmail" },
  { key: "liam", name: "Liam O'Connor", email: "liam.oconnor@northwind.example", title: "IT Service Desk", org: "Northwind", phone: "+1 (415) 555-0199", client: "gmail" },
  { key: "maya", name: "Maya Patel", email: "maya.patel@northwind.example", title: "Executive Assistant to the CTO", org: "Northwind", phone: "+1 (415) 555-0101", client: "gmail" },
  { key: "paul", name: "Paul Henriksen", email: "paul.henriksen@northwind.example", title: "Site Reliability Engineer", org: "Northwind", phone: null, client: "plain" },
  { key: "julia", name: "Julia Martins", email: "julia.martins@northwind.example", title: "QA Lead", org: "Northwind", phone: null, client: "gmail" },
  { key: "ravi", name: "Ravi Iyer", email: "ravi.iyer@northwind.example", title: "Senior Engineer, Platform API", org: "Northwind", phone: null, client: "gmail" },
  { key: "claire", name: "Claire Dubois", email: "claire.dubois@northwind.example", title: "Director, Enterprise Applications", org: "Northwind", phone: "+1 (415) 555-0139", client: "gmail" },
  { key: "noah", name: "Noah Fischer", email: "noah.fischer@northwind.example", title: "Staff Engineer, Identity", org: "Northwind", phone: null, client: "gmail" },
  { key: "amelia", name: "Amelia Ross", email: "amelia.ross@northwind.example", title: "Engineering Manager, Developer Experience", org: "Northwind", phone: null, client: "gmail" },
  { key: "felix", name: "Felix Wagner", email: "felix.wagner@northwind.example", title: "Senior SRE", org: "Northwind", phone: null, client: "gmail" },

  // ---- Contoso: cloud migration partner (Outlook) ----
  { key: "kevin", name: "Kevin Walsh", email: "kevin.walsh@contoso.example", title: "Engagement Manager", org: "Contoso Consulting", phone: "+1 (312) 555-0144", client: "outlook" },
  { key: "anika", name: "Anika Sharma", email: "anika.sharma@contoso.example", title: "Lead Solutions Architect", org: "Contoso Consulting", phone: "+1 (312) 555-0187", client: "outlook" },
  { key: "bruno", name: "Bruno Costa", email: "bruno.costa@contoso.example", title: "Senior Migration Engineer", org: "Contoso Consulting", phone: "+1 (312) 555-0121", client: "outlook" },
  { key: "fiona", name: "Fiona McAllister", email: "fiona.mcallister@contoso.example", title: "Project Coordinator", org: "Contoso Consulting", phone: "+1 (312) 555-0166", client: "outlook" },
  { key: "daniel", name: "Daniel Kim", email: "daniel.kim@contoso.example", title: "Database Migration Specialist", org: "Contoso Consulting", phone: "+1 (312) 555-0173", client: "outlook" },
  { key: "laura", name: "Laura Jensen", email: "laura.jensen@contoso.example", title: "Account Executive", org: "Contoso Consulting", phone: "+1 (312) 555-0110", client: "outlook" },

  // ---- Fabrikam: observability vendor (Outlook, corporate signature + disclaimer) ----
  { key: "megan", name: "Megan O'Brien", email: "megan.obrien@fabrikam.example", title: "Senior Account Executive", org: "Fabrikam, Inc.", phone: "+1 (206) 555-0148", client: "outlook" },
  { key: "steve", name: "Steve Parker", email: "steve.parker@fabrikam.example", title: "Principal Solutions Engineer", org: "Fabrikam, Inc.", phone: "+1 (206) 555-0193", client: "outlook" },
  { key: "yuki", name: "Yuki Morita", email: "yuki.morita@fabrikam.example", title: "Customer Success Manager", org: "Fabrikam, Inc.", phone: "+1 (206) 555-0137", client: "outlook" },
  { key: "arjun", name: "Arjun Mehta", email: "arjun.mehta@fabrikam.example", title: "Support Engineer II", org: "Fabrikam, Inc.", phone: null, client: "outlook" },
  { key: "rebecca", name: "Rebecca Hale", email: "rebecca.hale@fabrikam.example", title: "Renewals Manager", org: "Fabrikam, Inc.", phone: "+1 (206) 555-0115", client: "outlook" },

  // ---- Adatum: payments processor partner (Gmail) ----
  { key: "carlos", name: "Carlos Mendes", email: "carlos.mendes@adatum.example", title: "Partner Engineering Lead", org: "Adatum Payments", phone: "+1 (646) 555-0152", client: "gmail" },
  { key: "ingrid", name: "Ingrid Nilsen", email: "ingrid.nilsen@adatum.example", title: "Technical Account Manager", org: "Adatum Payments", phone: "+1 (646) 555-0179", client: "gmail" },
  { key: "peter", name: "Peter Wu", email: "peter.wu@adatum.example", title: "Site Reliability Engineer", org: "Adatum Payments", phone: null, client: "plain" },
  { key: "amara", name: "Amara Obi", email: "amara.obi@adatum.example", title: "Integration Engineer", org: "Adatum Payments", phone: null, client: "gmail" },

  // ---- Tailspin: recruiting agency (Outlook) ----
  { key: "jess", name: "Jess Morales", email: "jess.morales@tailspin.example", title: "Senior Recruiter, Infrastructure", org: "Tailspin Talent", phone: "+1 (512) 555-0168", client: "outlook" },
  { key: "marco", name: "Marco Bianchi", email: "marco.bianchi@tailspin.example", title: "Account Director", org: "Tailspin Talent", phone: "+1 (512) 555-0103", client: "outlook" },

  // ---- Litware: security assessment firm (Outlook) ----
  { key: "monica", name: "Monica Reyes", email: "monica.reyes@litware.example", title: "Engagement Lead", org: "Litware Security", phone: "+1 (617) 555-0156", client: "outlook" },
  { key: "hugo", name: "Hugo Lambert", email: "hugo.lambert@litware.example", title: "Senior Security Consultant", org: "Litware Security", phone: null, client: "outlook" },
  { key: "tess", name: "Tess Ward", email: "tess.ward@litware.example", title: "Compliance Analyst", org: "Litware Security", phone: null, client: "outlook" },

  // ---- Candidates and outside contacts ----
  { key: "ryan", name: "Ryan Holt", email: "ryan.holt@mail.example", title: "Candidate, Staff SRE", org: "", phone: null, client: "gmail" },
  { key: "dev", name: "Dev Kapoor", email: "dev.kapoor@mail.example", title: "Candidate, Staff SRE", org: "", phone: null, client: "gmail" },
  { key: "sarah", name: "Sarah Lin", email: "sarah.lin@wingtip.example", title: "VP Infrastructure", org: "Wingtip Toys", phone: null, client: "gmail" },
  { key: "omar", name: "Omar Farouk", email: "omar@infrasummit.example", title: "Program Chair", org: "InfraSummit", phone: null, client: "gmail" },
];

// ===========================================================================
// showcase
// ===========================================================================


// The showcase thread: a three-week, ~142-message cutover planning thread
// across Northwind, Contoso, Fabrikam and Adatum. Ends with open asks to Alex.
export const SHOWCASE: ThreadScript = {
  key: "showcase",
  subject: "Q4 platform migration – cutover plan & rollback criteria",
  labels: ["Vendors"],
  inbox: true,
  unread: 6,
  starred: true,
  messages: [
    // 0
    { from: "kevin", d: 21, t: "09:12", to: ["me","grace"], cc: ["marcus","priya","nora","victor","tariq","kofi","anika","daniel","bruno","fiona","ines","ben"], attach: ["cutover_runbook_v2.pdf"], text: "Alex, Grace,\n\nPlease find attached the draft cutover plan (runbook v2) for the Q4 migration of the core payments platform from DAL1 to the us-central landing zone. This version incorporates the feedback from last week's architecture review.\n\nSummary of the proposed approach:\n- Scope: payments-api, auth-gateway, ledger (Postgres 14, ~6 TB) and the settlement batch jobs\n- Window: Saturday 22:00–04:00, three weeks out, with a go/no-go at T-24h\n- Ledger: physical base backup seeded in advance, WAL shipping over the interconnect, promotion at T+90m\n- Traffic: DNS weighted shift plus BGP announcement of the payments prefix from the landing zone edge (runbook steps 18–24)\n\nProposed rollback criteria (section 6), any one of which triggers a rollback decision:\n- Error rate > 0.5% sustained for 10 minutes\n- p99 latency > 800ms on payments-api\n- Ledger replication lag > 30s\n- Any settlement batch failure\n\nWe would welcome comments by Thursday close of business so that we can incorporate them ahead of Rehearsal #1 in staging this Saturday.\n\nKind regards,\nKevin" },
    // 1
    { from: "grace", d: 21, t: "09:48", text: "Thanks Kevin.\n\nTo keep this moving, proposed review plan:\n1. Section owners comment in the doc by Thursday 17:00 (Nora – ledger, Tariq – network, Kofi – security, Priya – SRE/rollback, Ben – payments)\n2. Rehearsal #1 in staging Saturday night, Felix coordinating the environment\n3. Contoso consolidates comments + rehearsal findings into v3\n4. Option/approach decision at steering, go/no-go criteria finalized there too\n\nAlex – one ask for you: can you confirm who owns the rollback decision on the night? The runbook currently says \"Northwind lead\", which isn't a person.\n\nTracking in #mig-cutover and CHG-20931.\n\nGrace" },
    // 2
    { from: "victor", d: 21, t: "10:31", text: "Section 6 is too loose.\n\n0.5% for 10 minutes at Saturday-night volume is roughly 1,900 failed authorizations before we even start deciding. And none of the four criteria catch the thing that actually hurts us: the ledger accepting writes that DAL1 never sees. Where is the divergence check?\n\nAlso \"any settlement batch failure\" – the batch retries three times by design. Is a retry a failure?\n\nVictor" },
    // 3
    { from: "ines", d: 21, t: "11:02", text: "CHG-20931 is open and linked to the runbook folder. I've pencilled the window into the release calendar and will set the change freeze once the approach is decided.\n\nInês" },
    // 4
    { from: "kevin", d: 21, t: "12:15", re: 2, text: "Victor,\n\nThank you, these are fair points. The thresholds in section 6 were derived from the platform SLO document and are intended as a starting position rather than a final recommendation.\n\nOn ledger divergence: the current design relies on WAL shipping being strictly one-directional until promotion, so divergence before T+90m is not possible by construction. After promotion we agree a check is needed, and Daniel will propose one.\n\nOn settlement, we would define failure as a job exhausting its retries or missing the 05:00 file deadline to Adatum. We will make this explicit in v3.\n\nKind regards,\nKevin" },
    // 5
    { from: "priya", d: 21, t: "14:02", text: "Some numbers to anchor this. Last 8 Saturdays, 22:00–04:00:\n\n- Error rate baseline: 0.07% (p95 of 5-min buckets: 0.12%)\n- payments-api p99: 310ms median, 520ms worst bucket\n- Peak auth rate in the window: ~320/s at 22:00, down to ~60/s by 02:00\n\nAt 0.5% we're at ~7x baseline before tripping, and 10 minutes is too long to sit there. I'd suggest 0.5% over 5 minutes, plus a fast trip at 2% over 1 minute. p99 > 800ms is fine as long as it's sustained for 5 minutes, not a single bucket.\n\nHappy to own the burn-rate math if we want these expressed as SLO burn instead of raw thresholds.\n\nPriya" },
    // 6
    { from: "me", d: 21, t: "16:40", text: "Grace – rollback owner: Priya is incident commander on the bridge and owns calling a rollback against the criteria. Final authority to roll back or proceed sits with me; Marcus is my backup if I'm unreachable. Please update the runbook header accordingly.\n\nPriya's thresholds (0.5%/5m, 2%/1m fast trip, p99 sustained 5m) are adopted as the working version. Kevin, please reflect them in v3.\n\nVictor's divergence point stands. I want a post-promotion check in the plan, not a promise.\n\nAlex" },
    // 7
    { from: "nora", d: 20, t: "09:10", text: "Picking up the ledger piece, since that's where most of the risk is.\n\nI'm not convinced physical backup + WAL shipping is the right default. It's simple until promotion, but after that we have no way back to DAL1 without a full reverse rebuild, and 6 TB doesn't come back inside a 6-hour window.\n\nLogical replication gives us a reversible path, but it isn't free:\n- ledger_entries_archive (2.1 TB) has no primary key, so it needs REPLICA IDENTITY FULL or a surrogate key\n- Sequences aren't replicated; we'd have to sync them at cutover (no step for that today)\n- Initial table sync for the big tables is days, not hours\n\nDaniel, what did Contoso see on the last engagement of this size?\n\nNora" },
    // 8
    { from: "daniel", d: 20, t: "10:26", text: "Hi Nora,\n\nGood questions. On engagements of comparable size we have generally preferred physical for the primary move, precisely because of the initial sync time and the REPLICA IDENTITY FULL overhead on wide, keyless tables, which in our experience can push apply lag into minutes during batch windows.\n\nOur proposal would be a hybrid: physical base backup + WAL shipping for the move itself and, immediately after promotion, logical replication in reverse (landing zone → DAL1) for the tables needed to re-hydrate DAL1 if we roll back within 24 hours. The archive table would be excluded, since it is append-only and can be reconciled offline.\n\nI can write up the detailed steps as runbook appendix D.\n\nBest regards,\nDaniel" },
    // 9
    { from: "victor", d: 20, t: "10:52", text: "Reverse replication that has never been tested is a rollback plan on paper. If it's in the plan it gets rehearsed, or it isn't in the plan." },
    // 10
    { from: "nora", d: 20, t: "11:20", text: "Agree with Victor. Daniel – hybrid is reasonable, but appendix D has to be part of Rehearsal #1, including an actual fail-back to the DAL1 replica on ledger-pg-03.dal1.\n\nAlso, the landing zone primary needs wal_level=logical from day one for the reverse publication. That's a restart we take well before the window, not during it.\n\nNora" },
    // 11
    { from: "daniel", d: 20, t: "13:40", text: "Understood. I will have appendix D drafted by Thursday and Bruno will add the fail-back to the Rehearsal #1 scope. Agreed on wal_level=logical ahead of time: staging before Saturday, production in next Tuesday's maintenance slot.\n\nBest regards,\nDaniel" },
    // 12
    { from: "me", d: 20, t: "14:20", text: "Hybrid is approved as the working design, on Victor's condition: appendix D gets rehearsed with a real fail-back, or it comes out of the plan. Daniel, Nora – please work the slot and sequence details directly and bring one answer to v3.\n\nAlex" },
    // 13
    { from: "tariq", d: 20, t: "15:05", text: "Network notes on section 5:\n\n1. TTL on api.northwind.example and auth.northwind.example is 3600 today. Needs to drop to 60 at least 72h before the window, not \"T-4h\" as step 9 says. Anything that cached the old record holds it for an hour.\n2. Step 21 announces the payments /24 from the landing zone edge before withdrawing it from DAL1. Fine, but the prepend is on the wrong side. We prepend at DAL1 to drain, not at the new edge.\n3. Interconnect is a 2x10G LAG. Haven't seen a throughput test with real traffic on it yet.\n\nTariq" },
    // 14
    { from: "bruno", d: 20, t: "16:18", text: "Hi Tariq,\n\nThanks for the detail. You are right on step 9; that is a carry-over from an earlier template and we will move the TTL change to T-72h. On step 21, agreed: we will move the prepend to the DAL1 routers (new step 21b) and keep the landing zone announcement clean.\n\nCould you share the ASN and current route-map names so we can write the exact commands into the runbook rather than placeholders?\n\nRegards,\nBruno" },
    // 15
    { from: "tariq", d: 20, t: "16:44", text: "AS64512. Route-maps are RM-PAY-OUT-DAL1 and RM-PAY-OUT-LZ. I'll review the commands once they're in the doc.\n\nTariq" },
    // 16
    { from: "kofi", d: 19, t: "09:22", add: ["rachel"], text: "Adding Rachel, since this touches a few security decisions.\n\nGaps in v2 from the security side:\n- Section 7 assumes we copy secrets from the DAL1 vault to the landing zone. We should rotate instead: new DB credentials, new service tokens, new mTLS client cert for the Adatum connection. Copying means any old exposure moves with us.\n- Firewall rules for the landing zone live in Terraform (network-policies module), but the egress rules to Adatum still reference the DAL1 NAT range.\n- Break-glass accounts for the bridge need to be issued and tested before the window, not on the night.\n\nKofi" },
    // 17
    { from: "rachel", d: 19, t: "10:05", text: "Thanks Kofi. Agree on rotate-not-copy; for anything touching card flows that's non-negotiable.\n\nAlex – does security get a seat on the bridge call for the window? I'd like Kofi on it for the full six hours and me reachable for escalation, especially around the cert swap with Adatum.\n\nRachel" },
    // 18
    { from: "me", d: 19, t: "10:47", add: ["carlos","ingrid"], text: "Rachel – yes. Kofi on the bridge for the full window, you as escalation. Grace, please add both to the bridge roster.\n\nRotate-not-copy is the plan of record.\n\nI'm adding Carlos and Ingrid from Adatum now so they see the egress and cert requirements early rather than two weeks out. Carlos, Ingrid – short version: payments traffic will leave from new egress NAT ranges in our landing zone, with a new mTLS client cert. Tariq will send the ranges.\n\nAlex" },
    // 19
    { from: "carlos", d: 19, t: "13:12", text: "Hi Alex, thanks for looping us in early, much appreciated.\n\nA few things from our side so there are no surprises later:\n- Any allowlist change goes through our change board (CAB), which needs 5 business days' notice.\n- We'll need the new egress NAT ranges and the CSR for the new mTLS client cert.\n- We'd like to run a connectivity test from the new ranges against our sandbox first, then production, before the window.\n\nHappy to set up a short call with Ingrid and Tariq early next week.\n\nBest,\nCarlos" },
    // 20
    { from: "tariq", d: 19, t: "14:30", attach: ["egress_nat_ranges.csv"], text: "Carlos, draft ranges attached. Two /28s for payments-api egress, one /29 for the settlement batch. Treat as draft until Kofi confirms the firewall side.\n\nTariq" },
    // 21
    { from: "ingrid", d: 19, t: "15:52", add: ["amara"], text: "Thanks Tariq. I've opened ADT-4418 to track this on our side, and I'm adding Amara, who will handle the CSR and cert issuance.\n\nPeter from our SRE team can run the connectivity tests. We'd suggest sandbox early next week and production the week after; I'll send an invite.\n\nBest,\nIngrid" },
    // 22
    { from: "amara", d: 19, t: "16:30", text: "Hi all – for the CSR, please use RSA 2048 or ECDSA P-256, CN payments-egress.northwind.example, and send it through the partner portal rather than email. Turnaround on our side is 2 business days.\n\nThanks,\nAmara" },
    // 23
    { from: "ben", d: 19, t: "17:20", drop: ["amara"], text: "Payments-side concern: the nightly settlement run kicks off at 01:30 and the file has to be at Adatum by 05:00. That's inside the window. Options are (a) run settlement from DAL1 before the cutover, i.e. shift it to 21:00, or (b) run it from the landing zone after the ledger is promoted.\n\n(a) is safer but means a partial day's settlement. Aisha knows this best.\n\nBen" },
    // 24
    { from: "aisha", d: 18, t: "09:15", text: "Settlement can run early. The job is idempotent and checkpoints per merchant batch. If we run at 21:00 we capture everything up to 21:00 and the remaining hour of transactions rolls into Sunday's run. Merchants won't notice; finance will see one slightly larger file on Monday.\n\nWhat I don't want is (b) on the night of a ledger promotion. If anything about the ledger is off, settlement is where it shows up, and it shows up in front of Adatum.\n\nAisha" },
    // 25
    { from: "tom", d: 18, t: "09:40", text: "From the product side: Saturday 22:00–04:00 is ~4% of weekly volume, so the window is right. If we pull settlement forward I'd like support to have a short note for merchants who ask why Sunday's file is larger. I'll draft it.\n\nTom" },
    // 26
    { from: "kevin", d: 18, t: "11:05", text: "All,\n\nFollowing the discussion, we see two viable options and would like a decision at steering:\n\nOption A – single window: payments-api, auth-gateway, ledger and settlement in one Saturday window. Ledger via physical seed + WAL shipping, with reverse logical replication (appendix D) for a 24-hour rollback.\n\nOption B – phased: payments-api and auth-gateway first, with the ledger following on a later weekend behind logical replication.\n\nContoso recommends Option A. It minimises the period during which the application tier and the ledger are split across sites (cross-site latency is ~11ms per round trip), avoids a second weekend of staffing, and is the pattern we have delivered most often.\n\nKind regards,\nKevin" },
    // 27
    { from: "victor", d: 18, t: "11:31", text: "B. 11ms per query for a week is cheaper than a 6 TB rollback nobody has done for real." },
    // 28
    { from: "marcus", d: 18, t: "12:20", text: "Let's take it at steering next Thursday. Grace, please put it first on the agenda.\n\nMy lean is A if Rehearsal #1 is clean, including the fail-back Nora asked for. If it isn't, we talk about B.\n\nMarcus" },
    // 29
    { from: "grace", d: 18, t: "13:05", add: ["noah","mei","diego","julia"], text: "On the agenda. Also adding Noah (auth-gateway), Mei (runtime), Diego (data platform / CDC) and Julia (QA), since v3 needs their sections.\n\nOpen items before steering:\n1. Appendix D, reverse replication + fail-back – Daniel – Thursday\n2. Runbook steps 9 / 21b network fixes – Bruno, Tariq – Wednesday\n3. Secrets rotation plan – Kofi – Friday\n4. Settlement moved to 21:00 – Aisha – Wednesday\n5. Rollback thresholds in burn-rate form – Priya – Wednesday\n6. Bridge roster incl. security – me – today\n\nGrace" },
    // 30
    { from: "noah", d: 18, t: "15:30", text: "Thanks Grace. auth-gateway notes:\n\n- Token signing keys: we should publish the landing zone signing key in JWKS at least 24h before the window so both sides validate both keys. Otherwise every session issued on one side 401s on the other during the DNS shift.\n- The session store is Redis in DAL1. We can replicate it or accept a forced re-login. For server-to-server payments-api clients re-auth is cheap; for the merchant dashboard it's a support ticket spike.\n\nI'd lean towards a forced re-login for dashboard users, communicated in advance.\n\nNoah" },
    // 31
    { from: "mei", d: 18, t: "16:12", text: "Runtime side is in decent shape. The landing zone clusters (lz-uc-prod-1/2) run the same Kubernetes minor as DAL1, with node pools sized for 1.5x peak. Two things I want in the runbook:\n- HPA min replicas pinned high for the window so we're not scaling cold under the traffic shift\n- Image pulls from the landing zone registry verified for every service in scope (we found two charts still pointing at the DAL1 registry last week)\n\nMei" },
    // 32
    { from: "diego", d: 18, t: "16:55", text: "Data platform dependency nobody has mentioned yet: our CDC connectors read from a logical replication slot on the ledger primary (cdc_ledger_01). That slot doesn't survive a physical restore. We'd have to recreate it on the landing zone primary and either re-snapshot or accept a gap in the analytics stream. A full re-snapshot of the ledger tables into Kafka is ~9h.\n\nDiego" },
    // 33
    { from: "nora", d: 18, t: "17:22", text: "Good catch. If we record confirmed_flush_lsn on the DAL1 slot at the moment we stop writes, and create the new slot on the landing zone primary right after promotion, Diego's connectors can resume from there without a full snapshot. I'll add it as step 14b.\n\nNora" },
    // 34
    { from: "me", d: 18, t: "17:48", text: "Thanks all. This is the detail I wanted surfaced before rehearsal, not during it.\n\nFor steering: Option A remains the working assumption, conditional on Rehearsal #1 passing, fail-back included. Kevin, I need the rehearsal report by Monday noon with timings per step, not a summary.\n\nNora's step 14b, Noah's JWKS pre-publish and Mei's two runtime items go into v3 as must-haves.\n\nAlex" },
    // 35
    { from: "julia", d: 18, t: "18:10", text: "QA plan for post-cutover validation: 42 synthetic transactions covering auth, capture, refund, void and the three merchant dashboard flows, run at T+15m and T+60m. Full list will be attached to the v3 review.\n\nI need a test merchant allowlisted at Adatum from the new ranges. Carlos, is that possible in sandbox?\n\nJulia" },
    // 36
    { from: "paul", d: 18, t: "23:48", text: "Ran an iperf test across the interconnect in the overnight quiet window (NET-4471). Sustained 9.6 Gbps. Second LAG member is down, so we have 10G, not 20G. Daniel, that matters for your WAL catch-up numbers.\n\nPaul" },
    // 37
    { from: "jonah", d: 17, t: "07:10", text: "confirmed from the dal1 side. member 2 on ix-dal1-01 has been down since tuesday, carrier ticket is open. their ETA is \"this week\". tariq has it." },
    // 38
    { from: "carlos", d: 17, t: "08:30", re: 35, mobile: true, text: "Julia – yes, we'll provision test merchant NW-TEST-07 in sandbox against the new ranges once ADT-4418 is approved.\n\nCarlos" },
    // 39
    { from: "tariq", d: 17, t: "11:02", re: 36, text: "Carrier swapped the optic this morning. Both members up, 19.2 Gbps sustained on Paul's retest. NET-4471 closed.\n\nTariq" },
    // 40
    { from: "daniel", d: 17, t: "12:30", text: "Thank you Paul, Tariq. For reference: at 19 Gbps the base backup seeds in roughly 50 minutes of raw transfer for the staging copy and ~45 minutes per TB for production, but we seed days ahead anyway. The number that matters on the night is WAL catch-up, which we estimate at under 20 minutes from a 2-hour-old seed.\n\nBest regards,\nDaniel" },
    // 41
    { from: "felix", d: 17, t: "21:15", text: "Rehearsal #1 is underway in staging. Bridge is open, live notes in #mig-rehearsal. Results tomorrow.\n\nFelix" },
    // 42
    { from: "felix", d: 16, t: "10:40", text: "Rehearsal #1 results (staging):\n\n- End to end: 4h22m, inside the 6h window\n- Ledger restore + WAL catch-up (staging dataset, 1.2 TB): 38m\n- Promotion + app reconnect: 6m\n- DNS shift + BGP: clean, 61s to 95% of traffic on the new edge\n- Fail-back via appendix D: worked, 27m, with two manual steps that aren't in the runbook (noted in the report)\n- Smoke tests: 41/42. One refund flow failed on a hardcoded DAL1 hostname in the refund-worker config (fixed in PR #2287)\n\nCaveat: the staging ledger is 1.2 TB, not 6. Rehearsal #2 should be on a full-size copy.\n\nFelix" },
    // 43
    { from: "bruno", d: 16, t: "13:05", text: "Hi all,\n\nAdding detail on the two manual fail-back steps from last night, since they will matter for the runbook:\n\n1. After reversing the publication, the subscription on ledger-pg-03.dal1 had to be created with copy_data = false and an explicit LSN; the runbook assumed the default, which would have attempted a full copy.\n2. Sequences on DAL1 had to be advanced past the landing zone values by hand before writes could resume. We used a +10,000 safety margin per sequence; v3 will script this as step D-9 rather than leaving it to the operator at 03:00.\n\nBoth are being scripted for v3. Neither changed the 27-minute fail-back time materially.\n\nRegards,\nBruno" },
    // 44
    { from: "kevin", d: 15, t: "11:20", attach: ["rehearsal1_report.pdf"], text: "All,\n\nFurther to Felix's summary, the full Rehearsal #1 report with per-step timings is attached.\n\nContoso's assessment is that Rehearsal #1 meets the exit criteria for Option A. The two manual fail-back steps will be scripted in v3, and the refund-worker configuration issue has been resolved.\n\nKind regards,\nKevin" },
    // 45
    { from: "victor", d: 15, t: "11:58", text: "It met the exit criteria on a dataset a fifth of the size. Catch-up time doesn't scale linearly with that WAL volume. I want the full-size number before anyone signs anything." },
    // 46
    { from: "priya", d: 15, t: "13:10", text: "Victor is right that 1.2 TB tells us little about catch-up at 6 TB. For what it's worth, the throughput numbers extrapolate to ~1h50m for full-size restore + catch-up, which fits a 2h RTO, just. Not enough margin to sign on an extrapolation.\n\nI'd treat Rehearsal #2 at full size as a hard gate.\n\nPriya" },
    // 47
    { from: "me", d: 15, t: "14:05", text: "Agreed. Rehearsal #2 on a full-size ledger copy is a hard gate for go/no-go, whatever steering decides on the approach. Felix, please book the staging capacity for this coming weekend.\n\nThanks Kevin for the report. That's the level of detail I want from here on.\n\nAlex" },
    // 48
    { from: "felix", d: 15, t: "15:30", text: "Booked. Full-size copy (6.1 TB snapshot from Sunday) is restoring into ledger-pg-stg-02 now; should be ready by Thursday.\n\nFelix" },
    // 49
    { from: "lena", d: 14, t: "10:12", re: 47, text: "Hi all – Grace asked me to join for the Terraform side. The landing zone payments stack is merged and applied in lz-uc-prod (plan was a no-op as of this morning).\n\nOne open item: the network-policies module still has the DAL1 NAT range for Adatum egress, as Kofi flagged. PR #2291 fixes it and needs Tariq's review before Friday.\n\nLena" },
    // 50
    { from: "tariq", d: 14, t: "14:40", text: "Reviewed #2291, approved. Ranges match the CSV I sent Carlos.\n\nTariq" },
    // 51
    { from: "kofi", d: 14, t: "15:10", text: "Secrets rotation plan for section 7 is in the doc. Short version:\n\n- DB credentials: new roles per service in the landing zone vault, 24h TTL leases, DAL1 creds revoked 24h after cutover\n- Service tokens: reissued, scoped to the landing zone namespaces only\n- Adatum mTLS: new client cert from a fresh key generated in the landing zone HSM; the key never leaves it\n- Break-glass: two accounts for the bridge, issued Thursday before the window, tested with the IC\n\nRachel has reviewed. Kofi" },
    // 52
    { from: "aisha", d: 14, t: "16:05", text: "Settlement at 21:00 tested in staging Saturday as part of the rehearsal: 412 merchant batches, all checkpointed, file generated in 47 minutes. Step 3a in the doc is updated.\n\nAisha" },
    // 53
    { from: "grace", d: 13, t: "09:30", text: "Pre-read for tomorrow's steering is in the folder. Summary:\n\n1. Rehearsal #1 passed on the 1.2 TB staging dataset, fail-back included\n2. Rehearsal #2 (full size) this weekend, hard gate per Alex\n3. Decision needed: Option A (single window, Contoso recommendation) vs Option B (phased)\n4. Network, security and runtime must-haves are tracked in CHG-20931, all on track\n\nGrace" },
    // 54
    { from: "priya", d: 13, t: "11:15", add: ["steve","yuki"], text: "Adding Steve and Yuki from Fabrikam. They're building the cutover validation dashboards and the SLO burn alerts for section 6, so they need to be on this.\n\nSteve, Yuki – thresholds are in section 6 of the runbook (v2 attached further down; v3 is coming this week). We'd like burn-rate alerts that page the IC, and one dashboard showing DAL1 and the landing zone side by side for the window.\n\nPriya" },
    // 55
    { from: "steve", d: 13, t: "13:40", text: "Hi Priya, all,\n\nThank you for including us. For the window we can deliver:\n- A cutover validation dashboard with DAL1 and landing zone panels side by side (error rate, p99, throughput, ledger replication lag, settlement job status)\n- Multi-window burn-rate alerts for the section 6 thresholds, routed to the IC rotation\n- A short validation checklist so the bridge can confirm the dashboards are reading the right sources before T-0\n\nWe will have a first version in your staging tenant early next week.\n\nBest regards,\nSteve" },
    // 56
    { from: "me", d: 13, t: "14:10", text: "Thanks Steve. Please make the side-by-side view the default on the bridge screen, and include settlement file delivery status to Adatum, not just job status.\n\nAlex" },
    // 57
    { from: "yuki", d: 13, t: "15:25", text: "Hi all, I'll coordinate on the Fabrikam side and have set up a shared channel, #fabrikam-northwind-cutover. We'll also have a support engineer on standby during the window and I'll confirm the name next week.\n\nBest,\nYuki" },
    // 58
    { from: "priya", d: 13, t: "16:40", text: "Steve, Yuki – burn-rate spec so you're not reverse-engineering it from section 6. Against a 99.9% monthly availability SLO on payments-api:\n\n- Page (fast): 2% errors over 1m, confirmed by 14.4x burn over 5m. That's the 2%/1m fast trip\n- Page (slow): 0.5% over 5m, confirmed by 6x burn over 30m\n- Latency: p99 > 800ms for 5 consecutive 1m buckets, per site\n- Ledger: replication lag > 30s for 2m (not a single sample, the metric is noisy)\n\nAll four route to the IC rotation for the window only; normal on-call routing resumes at 06:00.\n\nPriya" },
    // 59
    { from: "marcus", d: 12, t: "16:30", re: 53, text: "Steering outcome: we're proceeding with Option A, single window, everything including the ledger. Rehearsal #2 on the full-size copy remains a hard gate; if it misses RTO we revisit.\n\nThanks to Kevin and the Contoso team for the recommendation, and to everyone for the quality of the debate on this thread.\n\nMarcus" },
    // 60
    { from: "me", d: 12, t: "16:52", text: "Confirming: we're going with option A.\n\nGrace owns the plan of record, Priya is IC on the night, rollback authority sits with me with Marcus as backup. Kevin, v3 by tomorrow EOD please, with appendix D, step 14b, the JWKS pre-publish and the network fixes folded in.\n\nAlex" },
    // 61
    { from: "kevin", d: 12, t: "17:15", text: "Alex, thank you. Anika will circulate v3 tomorrow.\n\nKind regards,\nKevin" },
    // 62
    { from: "anika", d: 11, t: "10:15", attach: ["cutover_runbook_v3.pdf"], text: "Hi all,\n\nPlease find attached runbook v3 reflecting the Option A decision. Key changes from v2:\n- Section 4: single window, T-0 = Saturday 22:00; settlement moved to 21:00 from DAL1 (step 3a)\n- Section 5: TTLs to 60s at T-72h (step 9); BGP prepend moved to the DAL1 routers (step 21b)\n- Section 6: rollback thresholds per Priya (0.5%/5m, 2%/1m fast trip, p99 > 800ms sustained 5m, replication lag > 30s, settlement exhausting retries or missing 05:00)\n- Section 7: rotate-not-copy secrets plan (Kofi)\n- Step 14b: CDC slot recreation at the recorded LSN (Nora, Diego)\n- Appendix D: reverse logical replication and fail-back, with the two manual steps from Rehearsal #1 now scripted\n- Header: rollback owner Priya (IC); rollback authority Alex, backup Marcus\n\nA tracked-changes version is in the shared folder. Comments by Tuesday, please.\n\nBest regards,\nAnika" },
    // 63
    { from: "ines", d: 11, t: "11:30", add: ["ravi"], text: "Release management: change freeze on payments-api, auth-gateway, ledger schema and settlement from the Wednesday before the window (18:00) through the following Tuesday. Exceptions go through me. CHG-20931 now references v3.\n\nAdding Ravi, who owns the payments-api config changes in the freeze scope.\n\nInês" },
    // 64
    { from: "ravi", d: 11, t: "13:05", text: "Thanks Inês. payments-api config: all DAL1 hostnames are now behind service discovery, including the refund-worker one Felix found. I'd like a config diff check against the landing zone added before T-0 – step 12 seems the natural place.\n\nRavi" },
    // 65
    { from: "kofi", d: 11, t: "14:20", text: "Section 7 in v3 looks right. One correction: the Adatum client cert is issued by Adatum, not our internal CA, so step 7c should reference Amara's portal process. Comment left in the doc.\n\nKofi" },
    // 66
    { from: "fiona", d: 11, t: "15:02", add: ["sam","owen","hana","ethan","amelia","claire","laura","paul","felix","jonah"], text: "Hi all,\n\nPlease see below the logistics for Rehearsal #2 this weekend:\n- Bridge line: +1 (312) 555-0400, PIN 448 210 7\n- Slack: #mig-rehearsal (war room), #mig-cutover-exec (status updates every 30 minutes)\n- Start: Saturday 20:00 (settlement replay at 21:00), staging, full-size ledger copy\n\nCalendar holds will follow.\n\nKind regards,\nFiona" },
    // 67
    { from: "claire", d: 11, t: "15:15", text: "I think I've been added to this by mistake – please remove me.\n\nClaire" },
    // 68
    { from: "ethan", d: 11, t: "15:21", text: "+1, please remove me as well." },
    // 69
    { from: "hana", d: 11, t: "15:24", mobile: true, text: "Please remove me from this thread" },
    // 70
    { from: "amelia", d: 11, t: "15:30", text: "Same." },
    // 71
    { from: "priya", d: 11, t: "15:34", text: "Everyone, please stop replying all. This thread has partners on it. Fiona, can you drop the people who were added by mistake?" },
    // 72
    { from: "owen", d: 11, t: "15:36", text: "Agree with Priya." },
    // 73
    { from: "sam", d: 11, t: "15:41", add: ["zoe"], text: "Adding Zoe for support coverage. She needs the window details for the support rota.\n\nSam" },
    // 74
    { from: "laura", d: 11, t: "15:52", text: "Hi all, please take me off the distribution. Fiona, I'll catch up with you offline.\n\nThanks,\nLaura" },
    // 75
    { from: "kevin", d: 11, t: "16:05", text: "Apologies, all. The logistics note was intended for the rehearsal invite list only. Fiona will send a corrected invite separately.\n\nKind regards,\nKevin" },
    // 76
    { from: "grace", d: 11, t: "16:20", drop: ["claire","ethan","hana","amelia","laura"], text: "Done – dropped Claire, Ethan, Hana, Amelia and Laura. Sam, Owen, Paul, Felix, Jonah and Zoe stay on; you're on the SRE/support rota for the window.\n\nBack to the actual work: please keep v3 comments in the doc, not here.\n\nGrace" },
    // 77
    { from: "zoe", d: 11, t: "17:05", text: "Thanks Sam. Support will staff the window with two agents plus me on call until 06:00. Tom, I'll turn your merchant note into a macro.\n\nZoe" },
    // 78
    { from: "felix", d: 10, t: "20:05", re: 76, text: "Rehearsal #2 kicking off in staging on the full-size ledger copy (6.1 TB). Usual bridge, #mig-rehearsal.\n\nFelix" },
    // 79
    { from: "jonah", d: 10, t: "23:55", text: "restore finished 23:41, 1h58m. catch-up running and lag is ugly. numbers when it's done." },
    // 80
    { from: "felix", d: 9, t: "03:20", text: "Stopped at T+4h30m. Ledger catch-up overran badly; app tier portion was clean. Priya will send the write-up Monday morning. Thanks all for staying on.\n\nFelix" },
    // 81
    { from: "priya", d: 8, t: "09:20", attach: ["rehearsal2_timeline.png"], important: true, text: "Rehearsal #2 findings (full size, 6.1 TB). Timeline attached.\n\n- Base restore: 1h58m\n- WAL catch-up: 1h12m (estimate was 20m). Total restore + catch-up: 3h10m against a 2h RTO\n- Replication lag peaked at 90s and stayed above 30s for 41 minutes, which on its own trips our rollback criterion\n- Preliminary cause: the 21:00 settlement replay generated ~380 GB of WAL in 50 minutes, and apply on the landing zone replica couldn't keep up\n- Fail-back via appendix D: not reached, we stopped at T+4h30m\n- payments-api + auth-gateway: clean, 34m including DNS/BGP, smoke tests 42/42\n\nBottom line: the app tier is ready. The ledger isn't, on this plan, inside this window.\n\nPriya" },
    // 82
    { from: "jonah", d: 8, t: "09:48", text: "more detail: catch-up apply was single-threaded and cpu bound on ledger-pg-lz-01, one core pinned at 100%, the rest idle. io was not the bottleneck. tuning max_wal_size and checkpoint_timeout helps some. it does not get us 70 minutes back." },
    // 83
    { from: "victor", d: 8, t: "10:05", text: "So the plan fails its own rollback criteria in rehearsal. Good thing we rehearsed at size." },
    // 84
    { from: "me", d: 8, t: "10:40", text: "Thanks Priya, Jonah. This is exactly why the gate was there.\n\nI don't want us tuning our way into the window. Grace, please get an emergency steering on the calendar this week. I want phased (Option B) on the table with real numbers next to A-with-tuning.\n\nAlex" },
    // 85
    { from: "daniel", d: 8, t: "13:30", attach: ["rollback_matrix.xlsx"], text: "Hi all,\n\nAttached is the rollback matrix: for each runbook phase, the rollback path, estimated time to roll back, data-loss exposure and owner. It now includes the Rehearsal #2 measurements.\n\nTwo observations from our side. First, we believe the WAL volume from the 21:00 settlement replay was partly a test artefact, since the staging replay compressed a full day of batches. Second, even adjusting for that, we cannot demonstrate restore + catch-up inside 2 hours with confidence.\n\nBest regards,\nDaniel" },
    // 86
    { from: "nora", d: 8, t: "14:15", text: "Daniel, I don't agree it's an artefact. Settlement at 21:00 is the production schedule for the window; we moved it there in v3. The WAL burst is real and it will happen on the night.\n\nGiven that, I'd now prefer to move the ledger on its own weekend, behind logical replication with dual-read validation for the days in between. Initial sync runs while DAL1 is still primary, so nothing on the night depends on catch-up speed.\n\nNora" },
    // 87
    { from: "daniel", d: 8, t: "16:05", to: ["nora"], cc: ["priya"], text: "Nora,\n\nTaking this off the main thread. If we go logical for the ledger, the slot on ledger-pg-01.dal1 retains WAL during the initial sync of the big tables. At current write rates that's ~1.4 TB of retained WAL over three days, and the DAL1 primary has 2.2 TB free. It works, but with very little margin.\n\nBest regards,\nDaniel" },
    // 88
    { from: "nora", d: 8, t: "16:40", text: "We can load ledger_entries_archive separately from a snapshot, since it's append-only. That takes the 2.1 TB table out of the initial copy and slot retention drops to a few hundred GB. I'd also set max_slot_wal_keep_size to 800GB as a guardrail, so a stuck slot can't fill the disk on the primary.\n\nNora" },
    // 89
    { from: "priya", d: 8, t: "17:10", text: "I'll add alerts on retained WAL per slot > 500GB and slot inactive > 5m, paging DB on-call. Will ask Steve to put both on the cutover dashboard.\n\nPriya" },
    // 90
    { from: "daniel", d: 8, t: "17:35", text: "Agreed on both. I'll update the rollback matrix with the archive snapshot path.\n\nDaniel" },
    // 91
    { from: "grace", d: 7, t: "08:45", re: 86, text: "Emergency steering is tomorrow 15:00; Maya has sent the invite. Pre-read: Priya's findings, Daniel's rollback matrix and Nora's note above.\n\nQuestion for steering: Option A with tuning, or switch to phased.\n\nGrace" },
    // 92
    { from: "kevin", d: 7, t: "11:20", text: "All,\n\nContoso's view is that Option A remains achievable with checkpoint tuning and a pre-settlement WAL flush, and we would propose a Rehearsal #3 midweek to validate this. We recognise the concern and want to present both paths fairly at steering.\n\nKind regards,\nKevin" },
    // 93
    { from: "anika", d: 7, t: "11:35", text: "To give steering the full picture: if phased is chosen, Phase 2 is well understood. Logical replication for the ledger with the archive table loaded from snapshot, initial sync over 2–3 days while DAL1 stays primary, dual-read validation for the rest of the week, and a ledger cutover the following Saturday that is mostly a switch of the write path rather than a data move. On the night, the RTO stops depending on catch-up speed.\n\nI'm happy to present that option alongside Kevin's at steering.\n\nBest regards,\nAnika" },
    // 94
    { from: "victor", d: 7, t: "11:44", text: "A third rehearsal midweek, inside a change freeze, testing tuning nobody has written yet, three days before the window. No." },
    // 95
    { from: "ben", d: 7, t: "14:30", text: "From payments: if we go phased, settlement doesn't need to move in phase 1. It runs from DAL1 at 01:30 as normal, and we avoid the 21:00 WAL burst entirely on the first weekend. That's a point in phased's favour that isn't in the matrix.\n\nBen" },
    // 96
    { from: "marcus", d: 6, t: "16:10", important: true, text: "Steering decision: we're switching to a phased cutover.\n\nPhase 1 – payments-api and auth-gateway – in Saturday's window as planned. Phase 2 – ledger and settlement – the following weekend, migrated behind logical replication with dual-read validation during the week in between.\n\nRehearsal #2 showed the app tier is ready and the ledger isn't. Alex, over to you for the plan changes.\n\nMarcus" },
    // 97
    { from: "me", d: 6, t: "16:35", text: "Agree with Marcus. To be explicit:\n\n- Phase 1 (Saturday): payments-api + auth-gateway. Ledger stays in DAL1; the app tier reaches it across the interconnect. Settlement runs from DAL1 at the normal 01:30.\n- Phase 2 (following Saturday): ledger cutover behind logical replication, dual-read validation all week, settlement moves with it.\n- Rollback criteria unchanged; the replication lag criterion applies to Phase 2.\n\nKevin, I need v3 split into a Phase 1 runbook and a Phase 2 addendum by Friday. Grace, please re-baseline the plan.\n\nAlex" },
    // 98
    { from: "tom", d: 6, t: "17:10", text: "Product side of the phased plan: since settlement stays at 01:30 for Phase 1, the \"larger Sunday file\" merchant note isn't needed this weekend; it moves to Phase 2. The dashboard re-login comms still go out for Phase 1. Zoe, I'll update the macro.\n\nTom" },
    // 99
    { from: "kevin", d: 6, t: "17:50", text: "Alex,\n\nUnderstood; we will deliver the split runbook by Friday.\n\nI do need to flag that a second weekend is not in the current statement of work. Phase 2 requires the same team of five for a second window plus support for the dual-read week, which we estimate at an additional 9–11 consultant-days. I will send a change order through Laura.\n\nFor the record, Contoso's recommendation remains Option A with tuning.\n\nKind regards,\nKevin" },
    // 100
    { from: "victor", d: 6, t: "18:02", text: "Noted for the record." },
    // 101
    { from: "marcus", d: 5, t: "08:40", re: 99, add: ["malik"], mobile: true, text: "Adding Malik for the cost side of Kevin's note." },
    // 102
    { from: "malik", d: 5, t: "10:05", text: "Thanks Marcus. Two questions:\n\n1. Kevin – is the 9–11 days at the SOW blended rate, or with the weekend premium?\n2. Alex – do we have room for the extra weekend in the migration budget line, or is this a request against Q4 contingency? The rough all-in number I'm seeing is $38–46k, including our own on-call overtime.\n\nMalik" },
    // 103
    { from: "me", d: 5, t: "11:10", text: "Malik – take it against the migration contingency. There's about $120k unallocated there and this is what it's for. Cap it at $45k all-in, our overtime included. I'll approve the change order once it lands at or under that.\n\nAlex" },
    // 104
    { from: "kevin", d: 5, t: "12:30", text: "Malik, the estimate uses the SOW blended rate, with the 1.25x weekend uplift from section 8 of the MSA applied to window hours. Laura will send the change order today.\n\nKind regards,\nKevin" },
    // 105
    { from: "marcus", d: 5, t: "13:15", to: ["me"], cc: [], text: "Alex – between us. I'm not thrilled with how Contoso has handled this. They recommended A, rehearsed on a fifth-size dataset, the first full-size test missed RTO by over an hour, and now there's a change order with a weekend uplift.\n\nIs this a team problem or a Kevin problem? I want to know before the QBR.\n\nM" },
    // 106
    { from: "me", d: 5, t: "13:58", text: "Mostly a Kevin problem. Daniel and Anika are strong and were candid in the rehearsal review; Daniel flagged the catch-up risk in writing and it got smoothed over in the summary.\n\nI'd keep the team, push back on the uplift (a re-plan caused by their own rehearsal gap isn't a scope change), and ask for Anika as delivery lead for Phase 2. Happy to raise it with you at the QBR.\n\nAlex" },
    // 107
    { from: "marcus", d: 5, t: "14:10", mobile: true, text: "Agree on all three. You take the rate, I'll raise the delivery lead point with their practice head." },
    // 108
    { from: "carlos", d: 5, t: "15:30", re: 20, to: ["tariq"], cc: ["ingrid","peter"], text: "Hi Tariq,\n\nWith the phased plan, can you confirm which ranges are used when? I want our CAB change to cover Phase 1 (payments-api egress) and make sure settlement keeps coming from the DAL1 NAT until Phase 2.\n\nBest,\nCarlos" },
    // 109
    { from: "tariq", d: 5, t: "16:05", text: "Phase 1: 198.51.100.32/28 and 198.51.100.48/28 (payments-api). Settlement stays on the DAL1 NAT, 203.0.113.64/29, until Phase 2. Phase 2 adds 198.51.100.72/29 for settlement from the landing zone.\n\nUpdated CSV once Kofi signs off the Phase 2 firewall rules.\n\nTariq" },
    // 110
    { from: "peter", d: 5, t: "16:40", text: "Sandbox test from 198.51.100.32/28 passed, TLS handshake with the new client cert OK. Production test booked Monday 14:00 your time.\n\nPeter" },
    // 111
    { from: "ravi", d: 5, t: "17:20", re: 104, text: "One Phase 1 risk worth naming: with payments-api in the landing zone and the ledger in DAL1, every ledger query crosses the interconnect. payments-api does ~6 ledger round trips per authorization, so ~11ms each is ~65ms added to p99. Inside the 800ms threshold, but we should move PgBouncer next to the app (landing zone side) so connection setup isn't crossing the link too.\n\nRavi" },
    // 112
    { from: "priya", d: 5, t: "18:05", text: "Measured it in staging this afternoon with PgBouncer on the landing zone side: p99 went from 310ms to 362ms, error rate unchanged. Fine for a week. Steve, can you add a cross-site latency panel to the Phase 1 dashboard?\n\nPriya" },
    // 113
    { from: "anika", d: 4, t: "10:00", attach: ["cutover_runbook_v3.1_phase1.pdf","phase2_ledger_addendum.pdf"], text: "Hi all,\n\nAttached are the Phase 1 runbook (v3.1) and the Phase 2 ledger addendum.\n\nPhase 1: ledger steps removed and steps renumbered; settlement back at 01:30 from DAL1; PgBouncer on the landing zone side per Ravi (step 11); config diff check at step 12.\n\nPhase 2 addendum: logical replication with the archive table loaded from snapshot; max_slot_wal_keep_size 800GB; sequence sync at cutover (step P2-17); dual-read validation comparing balances for a 1% sample of accounts every 5 minutes, plus a full per-merchant checksum nightly. CDC step 14b moves here as P2-14b.\n\nI will be delivery lead for Phase 2 on the Contoso side.\n\nBest regards,\nAnika" },
    // 114
    { from: "nora", d: 4, t: "11:15", text: "Reviewed the Phase 2 addendum. Looks right. Initial sync starts Sunday morning if Phase 1 closes clean, so we get five full days of dual-read before the second window.\n\nNora" },
    // 115
    { from: "diego", d: 4, t: "11:50", text: "With the ledger staying put for Phase 1 there's no CDC impact this Saturday. P2-14b works for us.\n\nDiego" },
    // 116
    { from: "victor", d: 4, t: "12:30", text: "Alex, practical question. Phase 1, 02:00, payments-api in the landing zone is throwing errors and Priya wants to roll back. You're not on the bridge and Marcus doesn't pick up. Who decides? \"Alex, backup Marcus\" isn't an answer if neither of you answers.\n\nVictor" },
    // 117
    { from: "me", d: 4, t: "13:05", text: "Fair. I'll be on the bridge from 21:30 until we close. If I drop off, Marcus. If neither of us responds within 10 minutes, Priya has full authority to roll back against the criteria, and nobody second-guesses that call afterwards. Grace, please put that sentence in the runbook header verbatim.\n\nAlex" },
    // 118
    { from: "noah", d: 4, t: "14:20", re: 113, text: "JWKS: the landing zone signing key is published at auth.northwind.example/.well-known/jwks.json and both keys validate on both sides. Forced re-login for dashboard users is agreed with Zoe and Tom; the banner goes up Thursday.\n\nNoah" },
    // 119
    { from: "steve", d: 4, t: "15:10", attach: ["dashboard_validation_checklist.pdf"], text: "Hi all,\n\nThe cutover validation dashboard (\"Payments Cutover – Phase 1\") is live in your staging and production tenants, side-by-side view as the default. Attached is the validation checklist for the bridge.\n\nBurn-rate alerts: fast (2%/1m) and slow (0.5%/5m), routed to the IC rotation. Per Priya, there's a cross-site latency panel and a Phase 2 panel group for slot retention and dual-read mismatches.\n\nBest regards,\nSteve" },
    // 120
    { from: "julia", d: 4, t: "16:30", text: "Thanks all. I'm out from tomorrow, so post-cutover QA for the window is with Owen, who has the 42-case suite. Could you drop me from this thread from here on? Zoe is covering the merchant-facing checks with support.\n\nJulia" },
    // 121
    { from: "grace", d: 4, t: "17:05", drop: ["julia"], text: "Done, Julia. Have a good break.\n\nRe-baselined plan of record:\n1. Phase 1 runbook v3.1 sign-off – Kevin / Anika – Monday\n2. Adatum production connectivity test – Peter / Tariq – Monday 14:00\n3. TTL drop to 60s – Tariq – Wednesday 22:00 (T-72h)\n4. Go/no-go – steering, Friday 14:00\n5. Phase 1 window – Saturday 22:00–04:00\n6. Phase 2 readiness review – the following Wednesday\n\nGrace" },
    // 122
    { from: "kofi", d: 4, t: "17:40", text: "Phase 1 secrets rotation is staged: new DB credentials for payments-api (scoped to the DAL1 ledger over the interconnect), new service tokens, new Adatum mTLS client cert. Activation is step 6 of v3.1; old credentials are revoked 24h after Phase 1 closes. Break-glass accounts tested with Priya and Felix this afternoon.\n\nKofi" },
    // 123
    { from: "rachel", d: 4, t: "18:15", mobile: true, text: "Thanks Kofi. Security signs off for Phase 1.\n\nRachel" },
    // 124
    { from: "bruno", d: 4, t: "18:40", text: "Hi Tariq, the step 21b commands are now in v3.1 with the real route-map names. Could you give them a final look before Monday?\n\nRegards,\nBruno" },
    // 125
    { from: "tariq", d: 3, t: "09:15", text: "Checked. Correct." },
    // 126
    { from: "renata", d: 2, t: "08:30", add: ["maya"], text: "Catching up on this thread. Good call on phasing. I'd much rather explain a second weekend than a ledger rollback.\n\nMarcus, Alex: I'll join the go/no-go on Friday for the first 15 minutes. Maya will sort out the invite.\n\nRenata" },
    // 127
    { from: "maya", d: 1, t: "08:50", text: "Hi all, the go/no-go invite is updated: Friday 14:00–14:45, with Renata joining for the first 15 minutes. Bridge details unchanged.\n\nBest,\nMaya" },
    // 128
    { from: "kevin", d: 1, t: "09:30", text: "All,\n\nContoso confirms readiness for Phase 1, and the v3.1 runbook is signed off on our side. Laura has issued change order CO-0147 for Phase 2 at the estimate shared earlier.\n\nKind regards,\nKevin" },
    // 129
    { from: "me", d: 1, t: "10:15", text: "Kevin, thanks. I'll approve CO-0147 at the SOW blended rate without the weekend uplift. The second weekend follows from a rehearsal gap, not a scope change. Happy to discuss with you and Laura this week.\n\nAlex" },
    // 130
    { from: "yuki", d: 1, t: "11:05", add: ["arjun"], text: "Hi all, adding Arjun, who will be our support engineer on standby for Saturday's window. He has access to your tenants and is in #fabrikam-northwind-cutover.\n\nBest,\nYuki" },
    // 131
    { from: "arjun", d: 1, t: "11:20", text: "Hi all, confirming I'm on standby 21:00–05:00 Central and reachable on the bridge.\n\nThanks,\nArjun" },
    // 132
    { from: "mei", d: 1, t: "12:40", text: "HPA mins pinned at 2x for payments-api and auth-gateway in lz-uc-prod-1/2 from Saturday 18:00, auto-revert Sunday 12:00. Every image in scope verified against the landing zone registry.\n\nMei" },
    // 133
    { from: "ingrid", d: 1, t: "14:30", text: "Production connectivity test passed: 198.51.100.32/28 and 198.51.100.48/28 to our production auth endpoints, 500 test auths, 0 errors, p99 142ms. ADT-4418 is approved by our CAB for Phase 1.\n\nBest,\nIngrid" },
    // 134
    { from: "sam", d: 1, t: "14:40", text: "SRE rota for Saturday's window:\n- IC: Priya (21:30–05:00)\n- DAL1 side: Jonah, Paul\n- Landing zone side: Felix, Sam\n- Network: Tariq\n- Security: Kofi\n- Payments: Aisha (from 01:00)\n- Fabrikam standby: Arjun\n\nShadow IC is Felix. Handoff notes go in #mig-cutover, not DMs.\n\nSam" },
    // 135
    { from: "priya", d: 1, t: "14:55", text: "Phase 1 readiness from SRE, against the go/no-go checklist:\n\n- Dashboards validated per Fabrikam's checklist, 14/14 items\n- Burn-rate alerts tested with synthetic errors in staging, paged in 40s\n- Cross-site p99 in staging: 362ms (baseline 310ms)\n- Rollback path for Phase 1 is DNS + BGP only, measured at 4m in Rehearsal #2\n- Break-glass accounts tested\n\nFrom my side Phase 1 is a go, pending the TTL drop on Wednesday.\n\nPriya" },
    // 136
    { from: "ben", d: 1, t: "15:10", text: "Payments is ready for Phase 1. Settlement runs from DAL1 at 01:30 as normal; Aisha is on call and on the bridge from 01:00.\n\nBen" },
    // 137
    { from: "grace", d: 1, t: "15:40", re: 121, to: ["me"], cc: ["marcus"], important: true, text: "Alex,\n\nSteering pack for Friday is nearly done. The one thing I still need is your formal go/no-go sign-off, by Thursday EOD. A short written statement is enough:\n1. Phase 1 readiness (runbook v3.1, rehearsal results, partner readiness)\n2. Open risks you're accepting (cross-site latency, Phase 2 dependency on the CAB)\n3. Your recommendation: go / no-go\n\nI'll attach it to CHG-20931 and circulate it with the pack Friday morning.\n\nThanks,\nGrace" },
    // 138
    { from: "jonah", d: 1, t: "23:20", re: 136, text: "dal1 side checked tonight. ledger-pg-01.dal1 healthy, replica lag 0 on -02 and -03, interconnect 19.1 Gbps. nothing blocking phase 1 from here." },
    // 139
    { from: "carlos", d: 0, t: "08:05", re: 108, to: ["me"], cc: ["tariq","ingrid"], attach: ["egress_nat_ranges_final.csv"], text: "Hi Alex,\n\nPhase 1 is all set on our side. Looking ahead to Phase 2: can you confirm the egress NAT ranges in the attached CSV are final so we can file the allowlist change with our CAB? It adds 198.51.100.72/29 for settlement from the landing zone.\n\nOur CAB needs 5 business days' notice, so to be safely approved before the Phase 2 window I'd like to file by tomorrow.\n\nBest,\nCarlos" },
    // 140
    { from: "felix", d: 0, t: "08:40", re: 138, text: "Dress run of v3.1 steps 1–12 in staging this morning, all green, config diff check clean. Bridge roster is final in #mig-cutover.\n\nFelix" },
    // 141
    { from: "zoe", d: 0, t: "09:35", re: 138, to: ["me"], cc: ["tom","noah","grace"], text: "Hi Alex,\n\nQuick one: should support post a status-page notice for Saturday's window? I'd suggest a \"scheduled maintenance, no expected impact\" notice going up Thursday, with the merchant dashboard re-login called out. Happy either way, I just need a yes/no.\n\nThanks,\nZoe" },
  ],
};

// ===========================================================================
// long
// ===========================================================================

// Long, hand-written threads for the demo mailbox (30–55 messages each).
// Fictional people and companies only; see ../content.ts for the PEOPLE table.


export const LONG_THREADS: ThreadScript[] = [
  // ===========================================================================
  // 1. Hiring loop: Staff SRE
  // ===========================================================================
  {
    key: "hiring",
    subject: "Staff SRE candidate – panel feedback",
    labels: ["Hiring"],
    inbox: true,
    unread: 1,
    messages: [
      /* 0 */ {
        from: "harper", d: 34, t: "09:12",
        to: ["me"], cc: ["elena", "mei", "sofia"],
        attach: ["Ryan_Holt_resume.pdf", "Dev_Kapoor_resume.pdf", "staff_sre_scorecard_template.docx"],
        text: "Hi Alex,\n\nWe're down to two finalists for the Staff SRE role and I'd like to lock the final loops this week so we don't lose momentum:\n\n- Ryan Holt — internal referral from Lena; currently a senior SRE at a mid-size logistics company, has run their Postgres and Kafka on-call for four years\n- Dev Kapoor — submitted by Tailspin (Jess Morales); currently a staff engineer on the reliability team at a fintech, strong distributed systems background\n\nProposed panel, using the standard Staff SRE scorecard (template attached):\n\n- System design: Victor\n- Incident management: Priya\n- Coding (pair): Felix + Sam\n- Values & collaboration: Mei\n- Cross-team partnership: Noah\n\nElena will coordinate scheduling once you confirm. Sofia is copied for comp planning — we're targeting the L6 band for both.\n\nCan you confirm the panel by end of day tomorrow? Resumes attached.\n\nThanks,\nHarper",
      },
      /* 1 */ {
        from: "me", d: 34, t: "10:05",
        add: ["priya", "victor", "felix", "sam", "noah"],
        text: "Thanks Harper — panel confirmed. Adding everyone here so we have one thread.\n\nPanelists, a note on the bar: this is a Staff role reporting to me, and the person will own our multi-region reliability work and the database tier roadmap. I want unambiguous signal on two things: depth in distributed systems (consistency and failure modes, not just box diagrams) and incident leadership under pressure. Coding and values matter, but those two are the job.\n\nPlease post scorecards in the ATS within 24 hours of your session and reply here with your headline vote. Don't read each other's feedback before submitting your own.\n\nAlex",
      },
      /* 2 */ {
        from: "elena", d: 33, t: "11:20",
        text: "Hi all,\n\nLoops are booked. All sessions are on video; invites with links are on your calendars.\n\nRyan Holt — next Tuesday\n- 10:00–11:00 Incident management (Priya)\n- 11:15–12:15 Coding (Felix + Sam)\n- 13:30–14:30 System design (Victor)\n- 14:45–15:30 Values & collaboration (Mei)\n- 15:45–16:30 Cross-team partnership (Noah)\n\nDev Kapoor — next Thursday\n- 10:00–11:00 System design (Victor)\n- 11:15–12:15 Incident management (Priya)\n- 13:30–14:30 Coding (Felix + Sam)\n- 14:45–15:30 Values & collaboration (Mei)\n- 15:45–16:30 Cross-team partnership (Noah)\n\nScorecards are open in the ATS now. Let me know right away if anything conflicts.\n\nThanks,\nElena",
      },
      /* 3 */ {
        from: "victor", d: 33, t: "13:02",
        text: "Elena - I have the capacity review Thursday morning. Can Noah and I swap slots for Dev? I'd take 15:45, he takes 10:00.\n\nV",
      },
      /* 4 */ {
        from: "elena", d: 33, t: "13:40",
        text: "Done — Victor is now 15:45–16:45 on Thursday and Noah 10:00–10:45. Updated invites are out.\n\nElena",
      },
      /* 5 */ {
        from: "felix", d: 32, t: "09:15",
        text: "Sam, quick one before Tuesday: are we using the log-parser rate limiter exercise or the new connection-pool one? The pool exercise gives better signal on concurrency, but we've only run it twice so it's less calibrated.\n\nFelix",
      },
      /* 6 */ {
        from: "sam", d: 32, t: "09:48",
        text: "I'd go with the pool exercise. I ran it with two candidates last quarter and the rubric held up — the eviction and backpressure parts separate senior from staff pretty cleanly.\n\nSam",
      },
      /* 7 */ {
        from: "me", d: 32, t: "10:30",
        text: "Use the pool exercise for both candidates so we compare like for like. Thanks, both.",
      },
      /* 8 */ {
        from: "harper", d: 29, t: "10:10", re: 2,
        to: ["jess"], cc: ["elena", "me"],
        text: "Hi Jess,\n\nConfirming Dev's final loop for this Thursday, 10:00–16:45 Pacific, all on video. Elena will send Dev the calendar invites and links directly today. He'll meet five interviewers across system design, incident management, coding, values and cross-team partnership.\n\nPlease flag any constraints on his side — time zone, breaks, accommodations — and we'll adjust.\n\nBest,\nHarper",
      },
      /* 9 */ {
        from: "jess", d: 29, t: "11:45",
        add: ["marco"],
        text: "Hi Harper,\n\nThanks for the quick turnaround — Dev is excited about the loop. Adding Marco, who manages the Northwind account on our side.\n\nTwo things to flag:\n\n- Dev is in final rounds with another company and expects an offer within roughly two weeks. He's told me Northwind is his first choice, but he'll need a decision timeline he can plan around.\n- He asked about on-call expectations for the role (rotation size and frequency) and whether the team is open to remote with periodic travel. He's based in Denver.\n\nCould you share how quickly you typically get to a decision after a final loop?\n\nKind regards,\nJess",
      },
      /* 10 */ {
        from: "harper", d: 29, t: "12:02",
        text: "Thanks Jess — understood. We'll aim to have a decision within three business days of Thursday's loop, and I'll get you answers on on-call and the remote question this week.\n\nHarper",
      },
      /* 11 */ {
        from: "priya", d: 28, t: "18:40", re: 7,
        text: "Ryan — Incident management: Strong Hire (4/4). Scorecard is in the ATS.\n\nHeadline: best mock incident I've run in a long time. I gave him the degraded checkout scenario with misleading signals (healthy hosts, rising queue depth, a fresh deploy that was a red herring). Within ten minutes he had assigned a comms lead, set a 15-minute update cadence, and chose to shed load before he had a root cause — exactly the right call. He also asked who had authority to roll back the payments config, which most candidates never think about.\n\nThe postmortem discussion was mature: he talked about contributing factors rather than a single root cause, and pushed back when I baited him toward blaming the deploying engineer.\n\nMinor: he could have pulled in the database team a few minutes earlier.\n\nPriya",
      },
      /* 12 */ {
        from: "victor", d: 28, t: "21:15",
        text: "Ryan - System design: No Hire (2/4).\n\nProblem: global rate limiter for the public API across three regions, per-tenant limits, fail-open vs fail-closed tradeoffs.\n\nThe initial sketch was fine. Things fell apart once we got to partitions. He proposed syncing counters across regions every second but couldn't say what happens to a tenant's limit when a region is isolated, and treated clock skew as 'NTP handles it'. When I asked about leader leases vs quorum reads for the config store he didn't know the difference. Prompted twice; didn't recover.\n\nHe's a strong operator. For staff on this team that's not enough - whoever takes this role will be in the middle of the RFC-112 follow-ons and the Postgres HA work.\n\nV",
      },
      /* 13 */ {
        from: "felix", d: 27, t: "08:50",
        text: "Ryan — Coding (pair with Sam): Hire (3/4).\n\nClean, test-first, talked through tradeoffs out loud. Got the bounded pool and the waiter queue right on the first pass. Missed that an evicted connection could be handed to a waiter mid-close, but found it himself once Sam asked him to walk through a slow-close scenario. Solid senior-plus coding; not a differentiator either way.\n\nFelix",
      },
      /* 14 */ {
        from: "sam", d: 27, t: "09:05",
        text: "+1 to Felix, same vote. I'll add that he narrated his debugging really well — easy to follow, which matters at 3am.\n\nSam",
      },
      /* 15 */ {
        from: "mei", d: 27, t: "10:20",
        text: "Ryan — Values & collaboration: Hire (3/4).\n\nGreat examples of mentoring: he built an on-call onboarding program at his current company that cut time-to-first-shift from eight weeks to four. Talks about people generously and gives credit specifically. One watch-out: when I asked about a disagreement with a peer team, his answer was mostly about how they eventually came around to his view. I'd want more evidence that he changes his own mind.\n\nMei",
      },
      /* 16 */ {
        from: "noah", d: 27, t: "11:30",
        text: "Ryan — Cross-team partnership: Hire (3/4).\n\nGood questions about how SRE and product teams split ownership of SLOs, and a concrete error budget model he has actually run. Comfortable saying no to a product team with data. Lighter on influencing without authority at the org level, but that's normal for where he is.\n\nNoah",
      },
      /* 17 */ {
        from: "priya", d: 27, t: "12:10", re: 12,
        text: "Victor, I respect the bar, but I think we're grading Ryan against a Principal expectation in a single round. Multi-region rate limiting with partition semantics is a hard problem to solve live in 50 minutes, and he's spent his career operating these systems rather than designing them from scratch.\n\nWhat I saw on Tuesday is the thing we're shortest on: someone who can run a SEV1 calmly and make the people around them better. Between you, Noah and Lena we have depth in design. We don't have that on the SRE team today.\n\nNot asking you to change your vote — I just want the debrief to weigh the whole picture.\n\nPriya",
      },
      /* 18 */ {
        from: "victor", d: 27, t: "12:44",
        text: "Not trying to be the bar raiser for sport. My concern is concrete: the Staff SRE will own failure-mode analysis for the multi-region work, and that means reasoning about partitions without me in the room.\n\nIf it's useful, I'm happy to do a 30-minute follow-up with him on a different problem (replication lag and read-your-writes, say). If he does well, I'll move my vote. Fair?\n\nV",
      },
      /* 19 */ {
        from: "me", d: 27, t: "14:20",
        text: "Good discussion — keep the substance in the scorecards and let's not settle it over email.\n\nVictor, yes to the follow-up: 30 minutes, a different problem, focused on replication and consistency. It's not a retest of the rate limiter. Elena, can you set it up with Ryan for Monday?\n\nWe'll debrief both candidates together on Tuesday, after Dev's loop, so we're comparing against the bar and not against each other's first impressions. Harper, please have a one-page summary of all scorecards ready before the debrief.\n\nAlex",
      },
      /* 20 */ {
        from: "elena", d: 27, t: "15:05",
        text: "Follow-up with Ryan and Victor is set for Monday 11:00–11:30. Debrief is Tuesday 14:00–15:00 in Lighthouse (4th floor), with a video link for remote folks. Invites sent.\n\nElena",
      },
      /* 21 */ {
        from: "victor", d: 26, t: "19:30",
        text: "Dev - System design: Strong Hire (4/4).\n\nSame rate limiter prompt. He went straight to the failure domain question: what does over-admitting cost vs under-admitting, per tenant, and designed from there. Region-local token buckets with async reconciliation, bounded drift, explicit fail-open for reads and fail-closed for writes. Brought up fencing tokens unprompted when we got to config leader election. When I pushed on clock skew he quantified it instead of waving it away.\n\nWeaker on cost and on how he'd roll it out incrementally. Coachable.\n\nThis is what I'd expect from a staff engineer on day one.\n\nV",
      },
      /* 22 */ {
        from: "priya", d: 26, t: "20:05",
        text: "Dev — Incident management: Lean Hire (3/4).\n\nTechnically excellent: found the queue-depth signal faster than anyone I've interviewed and correctly ignored the red-herring deploy. But for most of the first fifteen minutes he was debugging himself instead of running the incident. No comms lead until I nudged him, and his stakeholder updates were mostly technical detail that a support lead couldn't use.\n\nWhen I asked about it afterwards he was self-aware and gave a good example of learning that lesson before. Coachable, but it's a real gap at staff level for an SRE role specifically.\n\nPriya",
      },
      /* 23 */ {
        from: "felix", d: 25, t: "09:10",
        text: "Dev — Coding (pair with Sam): Hire (3/4).\n\nFast and correct on the pool exercise, handled the slow-close eviction edge without prompting. Code was a bit dense — Sam had to ask him to slow down and explain twice — but quality was high. Sam's vote matches.\n\nFelix",
      },
      /* 24 */ {
        from: "mei", d: 25, t: "10:00",
        text: "Dev — Values & collaboration: Hire (3/4).\n\nThoughtful, low-ego, clearly cares about doing the job well. Strong example of handing off a project he'd started so a more junior engineer could lead it. He asked a lot about scope and growth — fair questions, but we should be clear that the first six months are hands-on reliability work, not pure architecture.\n\nMei",
      },
      /* 25 */ {
        from: "harper", d: 25, t: "11:15",
        text: "Hi all,\n\nThanks for the fast turnaround. Summary so far (full scorecards in the ATS):\n\nRyan Holt\n- System design (Victor): No Hire — follow-up Monday\n- Incident management (Priya): Strong Hire\n- Coding (Felix/Sam): Hire\n- Values (Mei): Hire\n- Partnership (Noah): Hire\n\nDev Kapoor\n- System design (Victor): Strong Hire\n- Incident management (Priya): Lean Hire\n- Coding (Felix/Sam): Hire\n- Values (Mei): Hire\n- Partnership (Noah): pending\n\nNoah, could you post Dev's scorecard today? And flagging for Alex: Jess tells me Dev's other offer is expected next week, so if we move forward on him I'd like to start references right after Tuesday's debrief.\n\nHarper",
      },
      /* 26 */ {
        from: "noah", d: 25, t: "13:40",
        text: "Sorry — posted now. Dev: Hire (3/4). Very strong written communication; he walked me through a design doc he wrote that was the clearest I've seen from a candidate. A bit quick to propose a platform rewrite when I described a cross-team pain point.\n\nNoah",
      },
      /* 27 */ {
        from: "victor", d: 22, t: "16:30",
        text: "Follow-up with Ryan done.\n\nBetter. On replication lag and read-your-writes he got to session-pinned reads and version tokens with a bit of help, and was honest about where his knowledge stopped. He clearly went and read up over the weekend, which I respect.\n\nUpdated vote: Lean Hire at L5 (Senior), still No Hire at L6. I don't think it's a close call at staff, but I'd be glad to have him on the team as a senior.\n\nV",
      },
      /* 28 */ {
        from: "me", d: 21, t: "17:10",
        text: "Thanks everyone for a sharp debrief. Recording the decision here so it's in one place.\n\nDev Kapoor: we're moving to references and an offer at L6. Strongest design signal we've seen for this role. The incident leadership gap Priya identified is real but coachable, and Priya has agreed to pair with him on the IC rotation for his first two months.\n\nRyan Holt: not a hire at L6. The panel was split on depth, and for this role I'm not willing to bet on the one dimension the job is built around. But Ryan's incident leadership was the best in the loop, and I'd like to make him an offer at L5 (Senior SRE). Harper, please have that conversation with him; I'm happy to join a call if he wants to hear the reasoning from me.\n\nNext steps:\n- Harper: references for Dev (two, including a former manager) and the Ryan conversation this week\n- Sofia: comp proposals for Dev at L6 and Ryan at L5\n- Me: offer approval with Marcus once references are back\n\nPriya, I know you'd have made a different call on Ryan — thank you for arguing it well.\n\nAlex",
      },
      /* 29 */ {
        from: "priya", d: 21, t: "17:40",
        text: "For the record I'd still have hired Ryan at L6, but I support the decision and I'm glad we're making him an offer. If he accepts, I'd like to be his onboarding buddy.\n\nPriya",
      },
      /* 30 */ {
        from: "harper", d: 20, t: "09:30",
        text: "Thanks Alex. Starting Dev's references today — Jess is collecting contacts. I've set up a call with Ryan for Thursday to walk him through the L5 offer and the feedback.\n\nHarper",
      },
      /* 31 */ {
        from: "harper", d: 20, t: "09:45", re: 10,
        to: ["jess"], cc: ["marco", "elena", "me"],
        text: "Hi Jess,\n\nGood news — the panel's feedback on Dev was positive and we'd like to move to references. We need two, ideally including a former direct manager. If Dev can send contact details today, Elena will schedule the calls for tomorrow and Thursday.\n\nOn timing: if references come back as expected, we're aiming to extend a verbal offer by the end of this week.\n\nBest,\nHarper",
      },
      /* 32 */ {
        from: "jess", d: 20, t: "10:30",
        text: "Hi Harper,\n\nWonderful news, thank you! Reference contacts are in the candidate portal: his former manager at the fintech and a principal engineer he worked with on their payments migration. Both know to expect a call.\n\nIn the spirit of transparency: Dev's competing offer has firmed up — base in the mid-240s plus equity, with a response deadline of next Friday. He'd much rather join Northwind, but he'll need a written offer before that deadline to decide with confidence.\n\nKind regards,\nJess",
      },
      /* 33 */ {
        from: "marco", d: 20, t: "11:05",
        text: "Harper, adding a note from my side — I spoke to Dev this morning and his preference for Northwind is genuine: the team, the scope, and the multi-region work in particular. Let's make it easy for him to say yes. Happy to help with any comp alignment conversations.\n\nBest regards,\nMarco",
      },
      /* 34 */ {
        from: "sofia", d: 19, t: "14:20", re: 30,
        to: ["me", "harper"], cc: ["elena"],
        text: "Alex, Harper —\n\nComp proposal, keeping this to a smaller group.\n\nDev Kapoor, L6 Staff SRE:\n- L6 base band: $212k–$258k, midpoint $235k\n- Proposed base: $250k\n- Sign-on: $35k, paid in the first payroll, 12-month clawback\n- Equity: standard L6 new-hire grant, 4-year vest with 1-year cliff\n\nThat beats the competing base Jess described and keeps us inside the band. Anything above midpoint needs VP approval, so Marcus will have to sign off.\n\nRyan Holt, L5 Senior SRE: base $198k (L5 band $172k–$210k), standard L5 grant, no sign-on unless he negotiates.\n\nAlex, can you confirm you're comfortable with the Dev numbers before I draft the approval form?\n\nSofia",
      },
      /* 35 */ {
        from: "me", d: 19, t: "15:05",
        add: ["marcus"],
        attach: ["offer_approval_L6.pdf"],
        text: "Confirmed — those numbers work for me. Adding Marcus for approval.\n\nMarcus: we're recommending Dev Kapoor for the Staff SRE role at L6, base $250k, $35k sign-on, standard grant. He's the strongest distributed systems candidate we've seen for this role, and he has a competing offer due next Friday, so the above-midpoint base is deliberate. Approval form attached; the panel summary is in the ATS. Could you approve by Thursday so we can extend a verbal on Friday?\n\nRyan Holt at L5 is within band and doesn't need your sign-off.\n\nAlex",
      },
      /* 36 */ {
        from: "harper", d: 18, t: "10:00", re: 29,
        text: "References for Dev are back and both are strong. His former manager called him 'the person you want on the bridge at 3am' and said she'd rehire him tomorrow. The principal engineer highlighted his design reviews and mentoring. One consistent theme: he tends to take too much on himself during incidents — which lines up with Priya's scorecard.\n\nNo concerns from my side. Ryan's call is this afternoon.\n\nHarper",
      },
      /* 37 */ {
        from: "marcus", d: 18, t: "18:20", re: 35, mobile: true,
        text: "Approved. $250k + $35k sign-on is fine given the competing offer. Make sure the leveling packet reflects the system design signal — that's what justifies top of band. Nice work, team.\n\nMarcus",
      },
      /* 38 */ {
        from: "harper", d: 17, t: "16:10",
        text: "Verbal extended to Dev this afternoon — he was clearly happy and asked for the weekend to go over the details with his family. The written offer goes out early next week once Sofia finalizes the letter.\n\nRyan took the L5 news graciously yesterday. He wants a few days to think and asked for more specific feedback.\n\nHarper",
      },
      /* 39 */ {
        from: "jess", d: 17, t: "17:30", re: 33,
        text: "Hi Harper,\n\nThank you — Dev called me right afterwards and he's thrilled. He sent over a few questions he'd like answered before he signs:\n\n- What does the on-call rotation look like in practice (rotation size, primary vs secondary, compensation)?\n- What would success look like in his first 90 days?\n- Is remote from Denver fine long-term, and how often would he travel?\n- How do equity refreshes work at Northwind?\n\nHe'd appreciate answers early next week if possible.\n\nKind regards,\nJess",
      },
      /* 40 */ {
        from: "harper", d: 15, t: "09:40", re: 39, fwd: true,
        to: ["me", "priya"], cc: ["sofia"],
        text: "Alex, Priya — forwarding Dev's questions from Jess. Could you take on-call and the 90-day scope? Sofia can cover equity refreshes and the travel policy. I'd like to send answers back today if possible.\n\nHarper",
      },
      /* 41 */ {
        from: "me", d: 15, t: "11:30",
        text: "Harper — answers below, feel free to paste.\n\n- On-call: six-person rotation, one week as primary roughly every six weeks, with a secondary week in between. Follow-the-sun handoff with our Dublin SREs covers the Pacific overnight. Staff engineers also join the incident commander rotation. On-call is compensated with our standard stipend.\n- First 90 days: own the PgBouncer/Postgres reliability roadmap coming out of the INC-4821 postmortem, lead the first production failover game day for auth-gateway, and get onto the IC rotation paired with Priya.\n- Remote: fully remote from Denver is fine. We'd expect a team week in San Francisco once a quarter plus the occasional design review.\n\nAlso tell him I'd be glad to talk directly if he wants to hear about the team from me.\n\nAlex",
      },
      /* 42 */ {
        from: "priya", d: 15, t: "12:05",
        text: "One addition on on-call: page volume last quarter averaged 4.1 pages per primary week, and we have a hard rule that anything paging more than twice a week without action gets a ticket and an owner. He'll ask — everyone does.\n\nPriya",
      },
      /* 43 */ {
        from: "harper", d: 14, t: "09:20", re: 28,
        text: "Quick update on Ryan: he'd like to understand the L6 vs L5 decision before he responds to the offer. Victor, would you be OK with me sharing a summary of your design feedback with him — three or four specific points he could work on? I'll relay it in my own words.\n\nHarper",
      },
      /* 44 */ {
        from: "victor", d: 14, t: "10:02",
        text: "Yes. I'll send you bullets this morning: partition semantics, consistency models for config stores, and quantifying tradeoffs. He's close.\n\nV",
      },
      /* 45 */ {
        from: "harper", d: 13, t: "15:30", re: 39,
        to: ["jess"], cc: ["marco", "elena", "me"],
        text: "Hi Jess,\n\nThe written offer went to Dev this afternoon through the offer portal, along with written answers to his questions on on-call, scope, remote work and equity refreshes. Alex has also offered to speak with him directly if that would help.\n\nPlease let us know if anything in the letter needs clarifying.\n\nBest,\nHarper",
      },
      /* 46 */ {
        from: "jess", d: 12, t: "10:15",
        text: "Hi Harper,\n\nThanks — Dev has the offer and appreciated the detailed answers. Two updates:\n\n- The other company has moved their deadline up to the end of next week and added a sign-on bonus to close the gap.\n- Dev would really like to take Alex up on the offer to talk. He wants to hear how Alex sees the role evolving over the next two years before he decides.\n\nIs there any flexibility on the sign-on? And could we get the call with Alex on the calendar quickly?\n\nKind regards,\nJess",
      },
      /* 47 */ {
        from: "harper", d: 8, t: "09:05", re: 46,
        to: ["me"], cc: ["sofia", "elena"],
        text: "Alex,\n\nDev's decision is coming down to the wire — the other company's deadline is now Friday end of day, and Jess says a conversation with you is the thing most likely to tip it. Can you do a 20-min sell call with Dev before Friday? Elena can grab Wednesday 16:00 or Thursday 09:30 on your calendar if either works.\n\nSofia is checking whether we can move the sign-on to $45k without re-approval; we'll have an answer before your call.\n\nSeparately, Ryan accepted the L5 offer on Friday — he starts in four weeks, and Priya is already planning his onboarding.\n\nHarper",
      },
    ],
  },

  // ===========================================================================
  // 2. Incident postmortem: INC-4821
  // ===========================================================================
  {
    key: "incident",
    subject: "INC-4821 postmortem: payments latency",
    labels: ["Incidents"],
    inbox: false,
    messages: [
      /* 0 */ {
        from: "paul", d: 52, t: "10:30",
        to: ["me", "ben", "priya"], cc: ["jonah", "felix", "aisha", "tom", "zoe", "nora", "ines", "marcus"],
        attach: ["INC-4821_timeline.csv"],
        text: "All,\n\nInitial summary for INC-4821 (SEV1) from yesterday afternoon. Draft postmortem doc: docs.northwind.example/postmortems/INC-4821 - please put line-level comments there, not here.\n\nImpact\n- payments-authz p99 went from ~180ms to 4.2s for 47 minutes (14:12-14:59 PT Friday)\n- ~3.1% of card authorizations timed out at the gateway, roughly 17,500 attempts\n- checkout success rate dipped from 98.6% to 94.9% at worst\n- no data loss, no duplicate captures as far as we know (Aisha to confirm)\n\nWhat we know so far\n- 14:10 infra-config release r1187 changed PgBouncer settings. pgbouncer-payments ended up with default_pool_size 25 (was 120)\n- clients queued in PgBouncer, authz requests started timing out\n- 14:16 first alert (pay-authz-p99-high), paged\n- the mobile app retried timeouts aggressively; request rate on /v2/authorize went up ~5x\n- 14:41 config rolled back. latency stayed high until ~14:59 while the retry wave drained\n\nTimeline CSV attached. It's rough, corrections welcome.\n\nI'm IC for the postmortem. Proposing Ben as co-owner for the payments sections.\n\nPaul",
      },
      /* 1 */ {
        from: "ben", d: 52, t: "11:05", mobile: true,
        text: "Thanks Paul. Yes to co-owning. Aisha and I will take the authz service and idempotency sections, and Tom will pull merchant impact on Monday.\n\nBen",
      },
      /* 2 */ {
        from: "zoe", d: 52, t: "12:40",
        text: "Hi all — support impact as of noon today:\n\n- 214 tickets tagged INC-4821 since Friday 14:15\n- 38 from merchants, 176 from consumers\n- ~60 consumers report 'two pending charges' on their card after a failed checkout\n\nThe double-pending ones are generating the most anger. Before we reply at scale: are these real duplicate charges, or pending authorizations that will drop off? I want to give agents a macro that's accurate.\n\nZoe",
      },
      /* 3 */ {
        from: "aisha", d: 52, t: "13:15",
        text: "Zoe — they're not duplicate charges. Idempotency keys held: every retry carrying the same key was either deduplicated by us or rejected by Adatum as a duplicate transmission, and nothing was captured twice. What customers are seeing are pending authorizations from attempts that timed out on our side but were approved by the issuer.\n\nOur reversal job queued 1,920 reversals for those, and about 1,400 have already been acknowledged. Most issuers drop the pending hold within 1–3 business days of a reversal, worst case 7.\n\nSuggested macro wording: 'You were not charged twice. The second item is a temporary authorization hold that has already been released on our side and will disappear from your statement within a few business days.'\n\nAisha",
      },
      /* 4 */ {
        from: "me", d: 50, t: "08:45",
        add: ["victor", "ravi"],
        text: "Thanks Paul, and thanks to everyone who jumped on this Friday and over the weekend.\n\nA few ground rules for the postmortem:\n\n- Paul owns the doc, Ben co-owns. Final timeline by Wednesday end of day.\n- Blameless, as always. We describe what the system allowed, not who pushed what.\n- I don't want a single 'root cause' heading. From what I've read, this was at least two failures compounding.\n\nAdding Victor for the resilience angle, and Ravi because the Envoy retry config on the gateway is likely in scope. Nora, can you confirm exactly what r1187 changed on the PgBouncer side? I'll reach out to Adatum for their view of the window.\n\nAlex",
      },
      /* 5 */ {
        from: "jonah", d: 50, t: "09:30",
        text: "Timeline corrections, from the deploy log and the paging tool:\n\n- r1187 hit pgbouncer-payments at 14:06, not 14:10. 14:10 is when the reporting pool finished.\n- first alert (pay-authz-p99-high) at 14:16 is right\n- page acked 14:19, not 14:16. I was mid-handoff with Felix.\n- rollback started 14:38, finished 14:41\n\nUpdated the CSV in the doc.\n\nJonah",
      },
      /* 6 */ {
        from: "ines", d: 50, t: "10:05",
        text: "From the release side: r1187 was part of the normal Friday infra-config train, approved and green in CI. The change was intended for pgbouncer-reporting — lowering its pool to 25 to protect the analytics replica.\n\nThe override was added at the chart level in the shared Helm values file rather than under the reporting release, so every PgBouncer release rendered from that chart picked it up, including pgbouncer-payments. Our CI checks validate the YAML and run a dry-run apply; they don't diff rendered values per release, so nothing flagged it.\n\nInês",
      },
      /* 7 */ {
        from: "nora", d: 50, t: "11:20",
        text: "Confirmed from the PgBouncer side:\n\n- pgbouncer-payments-a/b/c went from default_pool_size 120 to 25 at 14:06\n- cl_waiting climbed from ~0 to 3,800 by 14:20; maxwait peaked at 9.4s\n- Postgres itself was healthy throughout: CPU ~31%, 210 active backends, no lock contention\n\nThe database didn't fall over; we starved it of connections. Worth noting there's no alert on cl_waiting today — we only alert on Postgres-level metrics.\n\nNora",
      },
      /* 8 */ {
        from: "felix", d: 50, t: "13:10",
        attach: ["p99_latency_graph.png"],
        text: "Retry analysis attached (p99 graph with request rate overlaid).\n\nMobile app 8.14 and earlier retries /v2/authorize on timeout up to 3 times, with a fixed 500ms delay and no jitter. On top of that, the gateway's Envoy route retries once on timeout. So a single tap can turn into up to 8 upstream attempts.\n\nRequest rate on /v2/authorize went from ~210 rps baseline to ~1,150 rps at peak. After the rollback at 14:41 the pool was back at 120, but the queue was already deep and retries kept refilling it — that's the 18-minute tail on the graph.\n\nFelix",
      },
      /* 9 */ {
        from: "victor", d: 50, t: "14:02",
        text: "I'd push back on framing the config push as the root cause.\n\nA pool of 25 per instance should give us a degraded payments path, maybe 2x latency. It shouldn't produce a 23x p99 and timeouts. The retry storm is what turned a capacity reduction into an outage, and it's also why the rollback didn't fix it.\n\nIf the action items are mostly about the config pipeline, we'll have this exact incident the next time we lose a PgBouncer node or a Postgres failover takes 30 seconds. Client and gateway retry policy is the bigger risk.\n\nV",
      },
      /* 10 */ {
        from: "paul", d: 50, t: "14:40",
        text: "Agree it's not one cause. Proposed framing for the doc:\n\n- Trigger: r1187 reduced the pgbouncer-payments pool from 120 to 25\n- Amplifier: mobile client + Envoy retries, no backoff, no jitter, no budget\n- Contributing: shared Helm values; no alert on PgBouncer queueing; no load shedding in payments-authz\n\nObjections?\n\nPaul",
      },
      /* 11 */ {
        from: "aisha", d: 50, t: "15:30",
        text: "Mostly agree with Victor, with one addition: payments-authz has no load shedding at all. When PgBouncer queues, we keep accepting requests and hold them for up to 5s, while the mobile client gives up at 3s. So we're doing work for requests nobody is waiting on anymore. Even with sane client retries, that timeout mismatch alone makes things worse.\n\nI'd add it to the contributing factors, and frankly I'd rank it above the Helm issue.\n\nAisha",
      },
      /* 12 */ {
        from: "tom", d: 49, t: "09:10",
        text: "Merchant impact for the doc:\n\n- 3 enterprise merchants escalated through their account managers, including one top-20 merchant that saw a 7% checkout failure rate during the window\n- estimated GMV at risk during the window: ~$410k, though a good part of it recovered on retry later in the day\n- status page: investigating at 14:24, identified at 14:45, resolved at 15:06\n\nThe enterprise merchants are asking for a written reason-for-outage. I'd like to send an RFO by the end of next week, once the postmortem has been reviewed. I'll draft it.\n\nTom",
      },
      /* 13 */ {
        from: "me", d: 49, t: "10:00",
        text: "Victor and Aisha are both right, and Paul's framing captures it. Let's go with trigger / amplifier / contributing factors, and the section heading is 'Why it was this bad', not 'Root cause'.\n\nWhat I need from the action items:\n\n- Config: no shared chart-level override can silently reach payments again\n- Retries: client backoff with jitter, a retry budget at the gateway, and honoring Retry-After\n- Server: load shedding in payments-authz and aligned timeouts\n- Detection: we should know PgBouncer is queueing before the p99 alert fires\n\nEvery item gets a ticket and a named owner before the review. Tom, yes on the RFO — draft it and route it through Ben and me.\n\nAlex",
      },
      /* 14 */ {
        from: "me", d: 49, t: "10:20",
        to: ["carlos", "ingrid"], cc: ["paul", "ben", "aisha"],
        text: "Hi Carlos, Ingrid,\n\nLast Friday between 14:06 and 14:59 Pacific we had a latency incident on our authorization path (internal reference INC-4821). The trigger was on our side, but during the window our clients retried heavily, and you likely saw elevated traffic and timeouts from our merchant IDs.\n\nTo complete our postmortem, could you share processor-side data for that window?\n\n- authorization request counts and response codes for our MIDs, per minute\n- any timeouts or duplicate-transmission responses on your side\n- reversal processing status for the reversals we sent afterwards\n\nPaul, Ben and Aisha are copied and can take any follow-up questions. Thanks in advance — I know it's extra work.\n\nBest,\nAlex",
      },
      /* 15 */ {
        from: "ingrid", d: 49, t: "13:45",
        text: "Hi Alex,\n\nThanks for the heads-up and the clear ask. I've opened an internal ticket and Carlos's team is pulling the logs now.\n\nPreliminary look from our dashboards: authorization requests from your MIDs spiked about 5.4x between 14:14 and 14:58 Pacific, and roughly 2.2% of them received response code 94 (duplicate transmission), which is consistent with retries carrying the same idempotency key. Our own processing latency stayed normal throughout.\n\nWe'll send the full per-minute export by tomorrow.\n\nBest,\nIngrid",
      },
      /* 16 */ {
        from: "carlos", d: 48, t: "10:30",
        text: "Hi all,\n\nThe export is on our SFTP drop: sftp.adatum.example:/outbound/northwind/INC-4821/ (per-minute counts, response codes and reversal acknowledgments). Same credentials as the monthly settlement files.\n\nHighlights:\n- our p99 processing time stayed at ~410ms throughout\n- 61,800 auth requests from your MIDs in the window vs ~11,200 expected\n- all 1,920 reversals you sent have been acknowledged as of this morning\n\nOne suggestion for your action items: our API returns Retry-After on 429 and 503. Honoring it client-side would have damped a good part of that wave.\n\nCarlos",
      },
      /* 17 */ {
        from: "aisha", d: 48, t: "11:00",
        text: "Thanks Carlos — this is exactly what we needed. I'll correlate it with our gateway logs today.\n\nAisha",
      },
      /* 18 */ {
        from: "paul", d: 48, t: "16:50", re: 13,
        add: ["rachel"],
        attach: ["INC-4821_timeline.csv"],
        text: "Timeline v2 attached and in the doc, now including Adatum's per-minute data. Adding Rachel since we pulled processor logs and are sharing a timeline outside the payments team.\n\nTwo things changed from v1:\n- trigger time is 14:06 (Jonah's correction)\n- the retry wave peaked at 14:31, ten minutes before the rollback, not after it\n\nPlease review by Thursday noon. I'll freeze the timeline after that.\n\nPaul",
      },
      /* 19 */ {
        from: "zoe", d: 48, t: "17:20",
        text: "Updated support numbers: 312 tickets total (41 merchant, 271 consumer), 57 of them about double pending charges. All closed except 19, which are waiting for issuer holds to clear. Aisha's macro worked well — CSAT on those tickets is 4.1, honestly better than I expected.\n\nZoe",
      },
      /* 20 */ {
        from: "ravi", d: 47, t: "09:15",
        text: "Gateway side: the /v2/authorize route in Envoy has retry_on: 5xx,reset,connect-failure with num_retries: 1 and per_try_timeout 2s. There's no retry budget, so under load we add up to 100% extra upstream traffic.\n\nProposal: a retry budget on the authz cluster (budget_percent 20, min_retry_concurrency 10), and drop 'reset' from retry_on for this route. I can have a PR up this week.\n\nRavi",
      },
      /* 21 */ {
        from: "rachel", d: 47, t: "10:05",
        text: "Quick check from security: can someone confirm that neither the timeline CSV nor the Adatum export contains PANs or full card data? Tokens and last-4 are fine. Otherwise I'll stay out of your way.\n\nRachel",
      },
      /* 22 */ {
        from: "aisha", d: 47, t: "10:20",
        text: "Confirmed — network tokens and last-4 only. I spot-checked the Adatum files as well. Nothing else in there.\n\nAisha",
      },
      /* 23 */ {
        from: "paul", d: 47, t: "11:00",
        text: "Postmortem review: Tuesday 10:00-11:00 PT, room Mariner + meet.northwind.example/inc-4821. Invite is out. Marcus will join for the last 20 minutes.\n\nAgenda:\n- timeline walkthrough (10 min)\n- why it was this bad (20 min)\n- action items and owners (20 min)\n- customer comms (10 min)\n\nPlease read the doc beforehand. Action items draft goes out tomorrow.\n\nPaul",
      },
      /* 24 */ {
        from: "ines", d: 47, t: "11:40",
        text: "Tuesday at 10 clashes with the release go/no-go. Any chance we could do Wednesday? The config pipeline items are mine and I'd rather be in the room.\n\nInês",
      },
      /* 25 */ {
        from: "me", d: 47, t: "12:15",
        text: "Let's keep Tuesday — Marcus's calendar is the constraint. Inês, can you send a delegate to go/no-go for that hour? If not, leave comments on the config section and we'll cover them first.\n\nAlex",
      },
      /* 26 */ {
        from: "paul", d: 46, t: "15:30",
        text: "Action items draft. All have tickets. Owners, please confirm or push back before Tuesday.\n\n- SRE-1182: alert on PgBouncer cl_waiting > 50 for 2 min and maxwait > 1s (Jonah) - P1\n- SRE-1183: per-release Helm values + CI check that diffs rendered manifests for payments-tier releases (Felix) - P1\n- PAY-3307: mobile client exponential backoff with jitter, max 2 retries, honor Retry-After (Aisha, with the mobile team) - P1\n- PAY-3308: load shedding in payments-authz when pool wait exceeds 500ms; server timeout below client timeout (Aisha) - P2\n- PLAT-921: Envoy retry budget on the authz cluster, drop reset from retry_on (Ravi) - P2\n- REL-412: payments-tier config changes need a payments approver and are excluded from the Friday train (Inês) - P2\n- DBE-77: PgBouncer pool sizing policy with a minimum floor for payments pools (Nora) - P3\n\nPaul",
      },
      /* 27 */ {
        from: "ben", d: 46, t: "16:40",
        text: "Thanks Paul. One thing before the review: the Trigger section currently reads 'the reporting team pushed an untested config change without checking downstream impact'. That isn't blameless, and it isn't accurate either — the change was reviewed, passed CI, and went out on the normal train. The tooling let a chart-level override reach payments without anyone being able to see it.\n\nCould we reword it to something like 'A change intended for pgbouncer-reporting was applied to all PgBouncer releases through a shared chart-level override that our review and CI process could not detect'?\n\nBen",
      },
      /* 28 */ {
        from: "paul", d: 46, t: "17:05",
        text: "That one's mine - written at 2am Saturday. You're right. Replaced with your wording.\n\nPaul",
      },
      /* 29 */ {
        from: "victor", d: 46, t: "17:30",
        text: "PAY-3308 should be P1, not P2. Load shedding is the only item on the list that protects us from the next trigger we haven't thought of. The retry budget and client backoff reduce amplification; they don't stop the server from accepting work it can't finish.\n\nV",
      },
      /* 30 */ {
        from: "nora", d: 43, t: "09:20",
        text: "On DBE-77: I'll add a policy check that blocks any default_pool_size below 80 for pgbouncer-payments-* unless the PR has a database-team approval, and set reserve_pool_size 20 with reserve_pool_timeout 2s so a sudden queue gets temporary headroom. Should be ready for review Thursday.\n\nNora",
      },
      /* 31 */ {
        from: "tom", d: 43, t: "11:00",
        text: "Draft RFO for enterprise merchants below. Alex, Ben, please review before I send it through the account managers after Tuesday's review.\n\n'On Friday between 14:12 and 14:59 Pacific, a configuration change reduced the database connection capacity available to our payment authorization service. Elevated retries from client applications prolonged the impact. During this window, approximately 3.1% of card authorization requests timed out. No transactions were captured twice, and all temporary authorization holds have been reversed. We have implemented additional safeguards on configuration changes, retry behavior and load management to prevent a recurrence.'\n\nTom",
      },
      /* 32 */ {
        from: "me", d: 43, t: "13:30",
        text: "Good draft, Tom. Three edits:\n\n- Say 'a configuration change on our side' so no one reads it as a processor or third-party issue. Adatum was not at fault, and they were very helpful.\n- 'We have implemented' isn't true yet. Use 'We are implementing' and keep the three areas.\n- Add a line offering a call with Ben to any merchant that wants more detail.\n\nWith those changes, approved to send after Tuesday's review.\n\nAlex",
      },
      /* 33 */ {
        from: "zoe", d: 43, t: "14:00",
        text: "I'll update the support macro to match the RFO wording so we're consistent.\n\nZoe",
      },
      /* 34 */ {
        from: "paul", d: 42, t: "12:30",
        text: "Review notes from this morning.\n\nAttendees: Paul, Ben, Aisha, Jonah, Felix, Nora, Ravi, Victor, Tom, Zoe, Priya, Alex, Marcus (last 20 min). Inês sent comments async.\n\nDecisions\n- framing accepted: trigger / amplifier / contributing factors\n- PAY-3308 raised to P1 (Victor's point accepted)\n- REL-412: payments-tier config changes frozen on Fridays effective immediately, pending a formal policy\n- RFO approved with Alex's edits, Tom sends today\n\nOpen\n- force-upgrade for mobile 8.14 and below? Aisha and Tom to decide after seeing 8.16 adoption\n- 30-day follow-up review requested by Marcus\n\nThe doc is updated. I'll publish the final version once the P1 items are closed or have dates.\n\nPaul",
      },
      /* 35 */ {
        from: "marcus", d: 42, t: "13:10",
        text: "Thanks Paul, good review. Two asks: track SRE-1182, SRE-1183, PAY-3307 and PAY-3308 to completion in the weekly ops review, and I want the 'no payments config on Fridays' rule to be written policy, not a norm people remember after an incident. Alex, can you own that with Inês?\n\nMarcus",
      },
      /* 36 */ {
        from: "me", d: 42, t: "13:40",
        text: "Yes. Inês and I will have a draft change policy for payments-tier config by next Friday.\n\nAlex",
      },
      /* 37 */ {
        from: "aisha", d: 39, t: "10:00",
        text: "PAY-3307 update: mobile 8.16 with exponential backoff (400ms base, full jitter, max 2 retries, Retry-After honored) is in beta and starts a staged rollout on Monday — 10%, 50%, 100% over a week.\n\nIn the load test that replays Friday's traffic, retry amplification dropped from 5.4x to 1.3x. With PAY-3308's load shedding also enabled in staging, p99 stayed under 900ms with the pool at 25. That's the result I wanted to see.\n\nAisha",
      },
      /* 38 */ {
        from: "jonah", d: 36, t: "09:40",
        text: "SRE-1182 done. cl_waiting and maxwait alerts are live for all pgbouncer-* releases. Tested in staging on Friday by dropping the pool to 10 - alert fired in 2m10s.\n\nJonah",
      },
      /* 39 */ {
        from: "felix", d: 36, t: "10:15",
        text: "SRE-1183 merged: Helm values are now per-release, and CI renders every PgBouncer release and posts a diff on the PR for anything that changes a payments-tier value. It caught one more cross-release override on its first run (pgbouncer-ledger inheriting a reporting timeout). Fixed in the same PR.\n\nFelix",
      },
      /* 40 */ {
        from: "ingrid", d: 35, t: "09:30", re: 17,
        text: "Hi Alex,\n\nChecking in — has your postmortem been finalized? If there's a processor-facing section, we'd be happy to review it for accuracy before you share it more widely. Carlos also mentioned your team might adopt Retry-After; we can share our recommended client settings.\n\nBest,\nIngrid",
      },
      /* 41 */ {
        from: "me", d: 35, t: "10:10",
        text: "Hi Ingrid,\n\nWe're publishing the final version on Friday. I'll have Aisha send you the processor-facing section beforehand — and yes, please send the recommended client settings. Retry-After support ships in our mobile release this week.\n\nThanks again for the fast turnaround on the logs. They settled the duplicate-charge question for our support team within a day.\n\nAlex",
      },
      /* 42 */ {
        from: "paul", d: 32, t: "16:00", re: 39,
        attach: ["INC-4821_postmortem_final.pdf"],
        text: "The INC-4821 postmortem is final and published: docs.northwind.example/postmortems/INC-4821 (PDF attached for anyone who wants it offline).\n\nAction item status:\n- SRE-1182 done\n- SRE-1183 done\n- PAY-3307 done (8.16 at 100%; 8.14 and below now 11% of auth traffic)\n- PAY-3308 in review, ships Tuesday\n- PLAT-921 done\n- REL-412 policy draft with Marcus\n- DBE-77 done\n\nThanks all. This was a good one to learn from.\n\nPaul",
      },
      /* 43 */ {
        from: "me", d: 32, t: "16:45",
        text: "Thank you, Paul and Ben — this is a model postmortem. Clear, blameless, and the action items address why the impact was so large, not just what set it off.\n\nSpecial thanks to Aisha for the idempotency work that kept this from being a much worse day, and to Zoe's team for absorbing 300+ tickets without missing a beat.\n\nWe'll do the 30-day follow-up on PAY-3308 and REL-412 in the ops review.\n\nAlex",
      },
      /* 44 */ {
        from: "marcus", d: 31, t: "10:20", mobile: true,
        text: "Read it on the flight. Well done, everyone.\n\nMarcus",
      },
    ],
  },

  // ===========================================================================
  // 3. Vendor renewal: Fabrikam observability
  // ===========================================================================
  {
    key: "renewal",
    subject: "Renewal: observability contract FY26",
    labels: ["Vendors", "Finance"],
    inbox: true,
    unread: 2,
    messages: [
      /* 0 */ {
        from: "rebecca", d: 75, t: "10:00",
        to: ["me", "olivia"], cc: ["megan", "yuki"],
        attach: ["Fabrikam_Renewal_Quote_FY26.pdf"],
        text: "Dear Alex and Olivia,\n\nI hope you're both well. I'm reaching out because Northwind's observability subscription with Fabrikam comes up for renewal at the end of the current term, roughly 90 days from now.\n\nFor reference, Northwind's spend over the last twelve months was $412,600:\n- Platform subscription (logs, metrics, traces): $318,000\n- Ingest overages above the 4.5 TB/day commit: ~$94,600 (average ingest has run at 5.6 TB/day)\n\nFor the renewal, we're proposing a 3-year term with an expanded 5.5 TB/day commit, which would eliminate most overage charges. Pricing reflects a 9% uplift on the current platform rate, in line with our standard renewal schedule. The attached quote has the details.\n\nI'm happy to walk through it at your convenience. Megan and Yuki are copied as your account and customer success contacts.\n\nBest regards,\nRebecca",
      },
      /* 1 */ {
        from: "megan", d: 75, t: "11:30",
        add: ["steve"],
        text: "Hi Alex, Olivia,\n\nThanks Rebecca. Adding Steve Parker, our principal solutions engineer, who can go deep on usage optimization and the new pipeline features if that's helpful for your evaluation.\n\nWe value the partnership with Northwind and want to get this right. Would a 45-minute call next week work to walk through the proposal together?\n\nBest,\nMegan",
      },
      /* 2 */ {
        from: "olivia", d: 74, t: "09:15", re: 0,
        to: ["me", "malik"], cc: [],
        text: "Internal only — not for Fabrikam.\n\nQuick math: the 9% uplift plus the bigger commit lands year one around $455k before any overages. That's a 10% increase on a line item Finance has already flagged as growing too fast.\n\nMy suggestion for an opening position: 18% off the current platform rate, committed-use tiering instead of a flat commit, and a 1-year term unless 3 years comes with a real price cap. To back that up I need data: ingest by team, and ideally how much of what we ingest is actually used.\n\nOlivia",
      },
      /* 3 */ {
        from: "me", d: 74, t: "10:00",
        add: ["priya", "lena"],
        text: "Agree with all of it. Adding Priya and Lena.\n\nPriya, Lena — can you pull ingest volume by team for the last 90 days, plus query stats: what percentage of indexed log volume is ever queried within 30 days? If we can show we're paying to store data no one reads, that's our strongest card — and we should cut it regardless of the negotiation.\n\nMalik, what's the budget envelope for next year?\n\nAlex",
      },
      /* 4 */ {
        from: "malik", d: 74, t: "14:20",
        text: "Next year's plan has $380k for observability, which assumed flat usage and a modest discount. Anything above that needs Helen's approval. Also note: any multi-year commitment over $1M in total contract value needs Helen's sign-off plus the CFO's, so a 3-year term at Fabrikam's numbers would go all the way up.\n\nMalik",
      },
      /* 5 */ {
        from: "olivia", d: 71, t: "09:00", re: 1,
        to: ["rebecca", "megan"], cc: ["me", "yuki", "steve", "priya", "lena"],
        text: "Hi Rebecca, Megan,\n\nThanks for the proposal. Before we discuss term length, we'd like to understand the overage calculation in more detail and see committed-use tiering options rather than a single flat commit.\n\nWould tomorrow, Tuesday, 10:00–10:45 Pacific work for a call? On our side: Alex, myself, and Priya and Lena from engineering. Steve, it would be great to have you there too.\n\nBest,\nOlivia",
      },
      /* 6 */ {
        from: "megan", d: 71, t: "10:12",
        text: "Tuesday at 10:00 works — invite sent with a video link. Looking forward to it.\n\nMegan",
      },
      /* 7 */ {
        from: "yuki", d: 70, t: "15:30",
        text: "Hi all,\n\nThank you for your time this morning. A short recap:\n\n- Overage is calculated on monthly average daily ingest above the 4.5 TB/day commit, at $0.42/GB\n- Northwind asked for tiered commit options (a base commit with discounted bands above it) and a lower overage rate\n- Steve will share recommendations on ingest pipelines and the archive tier to reduce billable volume\n- Fabrikam will come back with commercial options once Northwind shares its usage targets\n\nPlease let me know if I've missed anything.\n\nBest regards,\nYuki",
      },
      /* 8 */ {
        from: "lena", d: 68, t: "16:00", re: 4,
        attach: ["ingest_usage_by_team.csv"],
        text: "Usage data attached (90 days, per team, per source).\n\nHeadline numbers:\n- average ingest 5.6 TB/day, peak 7.1 TB/day during the INC-4821 week\n- top sources: payments 1.4 TB/day, platform runtime 1.1, data platform 0.9, edge (Envoy access logs) 0.8\n- 40% of indexed log bytes were never queried in a 30-day window\n- three services emit DEBUG in production — ledger-svc, notif-dispatch and search-indexer — together 0.7 TB/day with essentially zero queries\n\nWe could cut 1.2–1.5 TB/day without anyone noticing.\n\nLena",
      },
      /* 9 */ {
        from: "priya", d: 68, t: "16:45",
        text: "Adding the ops view to Lena's numbers:\n\n- Envoy access logs can be sampled at 10% for 2xx and kept at 100% for errors — that's ~0.6 TB/day on its own\n- metrics: 2.1M active series, ~30% of them from per-pod labels we never aggregate on\n- traces: we could drop head sampling from 10% to 5% and add tail-based sampling for errors\n\nOne caveat: 'never queried' is not the same as 'worthless'. The PgBouncer logs we relied on for INC-4821 sit in that 40% bucket. Low-query, high-value data should go to cheap storage, not be deleted.\n\nPriya",
      },
      /* 10 */ {
        from: "me", d: 67, t: "09:30",
        text: "Thanks both — this is exactly what I needed.\n\nOur position:\n\n- Cleanup happens regardless: we target 3.9 TB/day billable within six weeks. Lena owns it; Priya reviews anything that touches incident forensics.\n- Commercially: commit at 3.9 TB/day with tiered bands above it, 18% off the current platform rate, overage under $0.30/GB.\n- Term: 1 year, or 3 years only with a hard uplift cap and a flex-down right.\n\nOlivia, let's get a quote from the alternative vendor so this isn't a bluff. I'd rather not switch, but I want a real number in hand.\n\nAlex",
      },
      /* 11 */ {
        from: "olivia", d: 67, t: "10:15",
        text: "The RFQ went out to the alternative vendor yesterday with our usage profile. Expecting a quote within ten business days.\n\nOlivia",
      },
      /* 12 */ {
        from: "steve", d: 64, t: "11:00", re: 7,
        text: "Hi team,\n\nFollowing up on last Tuesday's call with technical recommendations:\n\n- Ingest pipelines: exclusion and sampling rules are applied before billing, at no additional cost. Based on the patterns we discussed, rules for DEBUG logs and successful access logs could reduce billable ingest by roughly 1.2 TB/day.\n- Archive tier: logs routed to archive are billed at $0.05/GB and can be rehydrated on demand.\n- Metrics: our cardinality analyzer can identify unused label combinations. I'm happy to run it against your account.\n\nI'd be glad to run a working session with Lena's team to set these up.\n\nBest regards,\nSteve",
      },
      /* 13 */ {
        from: "lena", d: 64, t: "13:20",
        text: "Thanks Steve — helpful. Is the archive tier queryable without rehydration? For incident forensics we need to search a few hours of logs within minutes, not wait on a job.\n\nLena",
      },
      /* 14 */ {
        from: "steve", d: 64, t: "14:05",
        text: "Hi Lena — today, rehydration takes 15–45 minutes depending on volume. Direct archive search is in preview, and I can get Northwind into it if you're interested. In practice most customers keep 7 days hot for incident work and archive the rest.\n\nSteve",
      },
      /* 15 */ {
        from: "olivia", d: 61, t: "10:00", re: 14,
        to: ["megan", "rebecca"], cc: ["me", "malik", "yuki", "steve"],
        text: "Hi Megan, Rebecca,\n\nFollowing our call and Steve's recommendations, here is Northwind's position for the renewal:\n\n- Committed ingest of 3.9 TB/day, reflecting optimization work already under way\n- Tiered bands above the commit (4.5 and 5.5 TB/day) at discounted rates\n- Overage rate of $0.28/GB\n- 18% discount on the current platform rate\n- Term: 1 year, or 3 years with no year-one uplift, a 3% annual cap and a 15% annual flex-down right\n\nChris Navarro from our legal team will send redlines on data retention and the DPA separately.\n\nWe'd appreciate a revised proposal within two weeks.\n\nBest,\nOlivia",
      },
      /* 16 */ {
        from: "megan", d: 60, t: "17:20",
        text: "Hi Olivia,\n\nThank you — received. I'll review it with our deal desk. I'll be candid that 18% is a significant ask, and that our strongest pricing is reserved for 3-year commitments, but I appreciate the clarity and the work your team is doing on optimization.\n\nI'll come back to you next week.\n\nBest,\nMegan",
      },
      /* 17 */ {
        from: "chris", d: 57, t: "11:00", re: 16,
        to: ["rebecca", "megan"], cc: ["olivia", "me"],
        attach: ["MSA_redlines_v2.docx"],
        text: "Rebecca, Megan,\n\nAttached are Northwind's redlines to the MSA and DPA. The substantive changes:\n\n- Data retention: customer data deleted within 30 days of termination, with a written certificate of deletion\n- Sub-processors: 30 days' advance notice of new sub-processors, with a right to object\n- Breach notification: 48 hours from discovery, replacing 'without undue delay'\n- Data residency: logs from payments systems stored and processed in US regions only\n- Liability: a super-cap of 3x annual fees for data protection breaches\n\nHappy to set up a call with your counsel.\n\nChris",
      },
      /* 18 */ {
        from: "rebecca", d: 56, t: "10:30",
        text: "Hi Chris,\n\nThank you. I've passed these to our legal team. Initial feedback: retention, sub-processor notice and US residency should be workable. Our standard breach notification is 72 hours, which aligns with most regulatory frameworks, and we'd ask to keep that. Counsel will respond on the liability super-cap directly.\n\nBest regards,\nRebecca",
      },
      /* 19 */ {
        from: "malik", d: 56, t: "15:00", re: 11,
        to: ["me", "olivia"], cc: ["helen"],
        text: "Alex, Olivia — looping in Helen ahead of any multi-year decision.\n\nRough model, platform plus expected overage after cleanup:\n\n- Their ask: ~$455k year one, ~$1.42M over 3 years\n- Our ask (18% off, 3.9 TB commit, 3% cap): ~$338k year one, ~$1.05M over 3 years\n- 1-year at our ask: $338k, then renegotiate next year with less leverage\n\nHelen, the 3-year scenario at our ask lands right at the CFO threshold.\n\nMalik",
      },
      /* 20 */ {
        from: "helen", d: 55, t: "09:40",
        text: "Thanks Malik. I can support a 3-year term if the total stays under $1.06M, there's a meaningful flex-down (15% a year, not 5%), and there's no auto-renewal at list price. If Fabrikam can't meet that, do the 1-year.\n\nHelen",
      },
      /* 21 */ {
        from: "megan", d: 50, t: "14:00", re: 16,
        to: ["olivia", "me"], cc: ["rebecca", "yuki", "steve", "malik"],
        text: "Hi Olivia, Alex,\n\nThank you for your patience. Our deal desk has approved the following for a 3-year term:\n\n- 10% discount on the current platform rate in year one\n- 5% annual uplift in years two and three\n- Committed ingest of 4.2 TB/day, overage at $0.35/GB\n- Archive tier at the list rate\n\nThis is a meaningful move from our original proposal and reflects the value we place on the partnership. We're not able to offer the 1-year term at a comparable discount.\n\nBest,\nMegan",
      },
      /* 22 */ {
        from: "olivia", d: 50, t: "15:10", re: 21,
        to: ["me", "malik"], cc: [],
        text: "Internal.\n\nThey moved from +9% to -10%, which is something, but a 5% annual uplift eats most of it by year three. Separately: the alternative vendor's quote came in at $331k/year for a comparable footprint on a 2-year term. That's real leverage, if we're willing to use it.\n\nOlivia",
      },
      /* 23 */ {
        from: "me", d: 49, t: "09:20",
        add: ["priya"],
        text: "Adding Priya. Priya — gut check on the cost of migrating to the alternative? I don't want to wave around a quote we wouldn't actually take.\n\nAlex",
      },
      /* 24 */ {
        from: "priya", d: 49, t: "10:40",
        text: "Honest answer: doable but painful.\n\n- ~640 dashboards and 1,140 alert rules to port, many with query syntax that doesn't translate cleanly\n- agent re-rollout across ~3,200 nodes\n- two engineers for a quarter, plus about two months of dual-running at roughly $60k in overlap\n\nAt $331k vs Fabrikam at ~$370k effective, payback is a year and a half, and we'd lose a quarter of reliability work. I'd only take it if Fabrikam stays above ~$390k a year.\n\nPriya",
      },
      /* 25 */ {
        from: "me", d: 49, t: "11:30",
        text: "That's our walk-away: if the effective rate stays above $390k a year, we run a real evaluation of the alternative. Below that, we stay with Fabrikam and spend the engineering time elsewhere.\n\nI'm going to ask for an exec-to-exec call to try to close the gap. Olivia, please hold the alternative quote in reserve — we'll reference it, not share it.\n\nAlex",
      },
      /* 26 */ {
        from: "me", d: 48, t: "09:00", re: 21,
        to: ["megan"], cc: ["olivia", "rebecca", "malik"],
        text: "Hi Megan,\n\nThanks for the movement — it's appreciated. We're still meaningfully apart, though, mainly on the uplift and the commit level.\n\nTwo things to be transparent about. First, we're reducing ingest regardless: Lena's team has already cut 0.8 TB/day and we're on track for 3.9. Committing to 4.2 would mean paying for data we've decided not to send. Second, we have a competitive quote that is materially lower than your current offer.\n\nWe'd prefer to stay with Fabrikam. Could we set up a call between your regional VP and me this week to see whether we can close the gap?\n\nBest,\nAlex",
      },
      /* 27 */ {
        from: "megan", d: 48, t: "10:10",
        text: "Hi Alex,\n\nUnderstood, and thank you for being direct. I've set up a call with Dana Whitfield, our RVP for the West, for Thursday at 13:00 Pacific — invite on its way. I'll join as well.\n\nBest,\nMegan",
      },
      /* 28 */ {
        from: "me", d: 47, t: "17:30", re: 25,
        to: ["olivia", "malik", "helen"], cc: ["priya"],
        text: "Internal — summary of today's call with Fabrikam's RVP.\n\nTheir new position: 15% off the current platform rate, 3-year term, uplift capped at 3%, 10% annual flex-down, commit at 4.0 TB/day. They asked about the competing number and I didn't share it.\n\nI pushed for 18% and a 15% flex-down, and told them 3.9 is our commit because it's our actual plan. She said she'd take it back to their deal desk.\n\nBy Malik's model, 15% with a 3% cap comes to roughly $1.08M over three years — over Helen's line.\n\nAlex",
      },
      /* 29 */ {
        from: "helen", d: 46, t: "08:40", mobile: true,
        text: "Close. Hold for 18% one more round, but I won't block at 16-17% if the flex-down is 15% and the total stays under $1.06M.\n\nHelen",
      },
      /* 30 */ {
        from: "chris", d: 43, t: "14:30", re: 18,
        attach: ["MSA_redlines_v3.docx"],
        text: "Rebecca,\n\nUpdated redlines attached (v3). We've accepted 72-hour breach notification in exchange for a 24-hour preliminary notice when a breach is suspected to involve payments data. Retention, sub-processor notice and US residency are reflected as agreed.\n\nThe one remaining open item is the liability super-cap, where we're at 3x annual fees.\n\nChris",
      },
      /* 31 */ {
        from: "rebecca", d: 40, t: "10:00",
        text: "Hi Chris,\n\nThank you. Our counsel has accepted the v3 language on breach notification, retention and residency. On the super-cap, we can offer 2x annual fees for data protection breaches, which is above our standard terms.\n\nBest regards,\nRebecca",
      },
      /* 32 */ {
        from: "chris", d: 36, t: "09:50",
        text: "Rebecca — we can accept 2x provided the DPA audit rights stay as drafted in v3 (one audit per year, plus one after any breach). If you confirm, legal terms are closed from our side.\n\nChris",
      },
      /* 33 */ {
        from: "yuki", d: 29, t: "11:00", re: 14,
        text: "Hi Lena, Priya,\n\nGreat working session last week! Summary of where things landed:\n\n- Pipeline rules for DEBUG logs from ledger-svc, notif-dispatch and search-indexer are live\n- Envoy access logs sampled at 10% for 2xx, 100% for 4xx/5xx\n- Average ingest over the last 7 days: 4.3 TB/day, down from 5.6\n\nWith the next phase (archive routing for audit logs) you should land comfortably under 4.0.\n\nBest regards,\nYuki",
      },
      /* 34 */ {
        from: "lena", d: 29, t: "13:15",
        text: "Thanks Yuki — that matches our numbers. One more batch to go: the batch-scheduler audit logs move to archive next week, which should get us to ~3.9 TB/day.\n\nLena",
      },
      /* 35 */ {
        from: "olivia", d: 22, t: "10:00", re: 27,
        text: "Hi Megan,\n\nChecking in on the commercial terms following Alex's call with Dana. Legal is closed and our ingest is now tracking at 4.0 TB/day and falling, so we're ready to finalize.\n\nTo make our budget cycle, we need a revised quote reflecting a 3.9 TB/day commit, 18% off the current platform rate, a 3% uplift cap and a 15% annual flex-down by the end of next week.\n\nBest,\nOlivia",
      },
      /* 36 */ {
        from: "megan", d: 18, t: "16:00",
        text: "Hi Olivia,\n\nThanks for the nudge. Deal desk approval is in progress — I expect to have a revised quote to you early the week after next. I appreciate your patience.\n\nBest,\nMegan",
      },
      /* 37 */ {
        from: "malik", d: 15, t: "09:30", re: 29,
        to: ["me", "olivia"], cc: ["helen"],
        text: "Heads-up: Helen's budget lock is in three weeks. If we don't have signed terms by then, I'll carry observability at the $412k run-rate as a placeholder, which squeezes other platform lines.\n\nMalik",
      },
      /* 38 */ {
        from: "me", d: 15, t: "10:05",
        text: "Understood. Olivia, please push Megan for rev2 this week; I'll follow up directly if it slips.\n\nAlex",
      },
      /* 39 */ {
        from: "me", d: 8, t: "09:10", re: 36,
        text: "Hi Megan,\n\nWe're now two weeks from our budget lock. If the revised quote doesn't arrive this week, we'll need to start evaluating the alternative in parallel to protect our timeline. That's not the outcome I want, but I can't let this slide past the budget cycle.\n\nBest,\nAlex",
      },
      /* 40 */ {
        from: "megan", d: 7, t: "09:15",
        text: "Hi Alex,\n\nUnderstood, and apologies for the delay. Deal desk has signed off and Rebecca is finalizing the paperwork now. You'll have rev2 from her this week.\n\nBest,\nMegan",
      },
      /* 41 */ {
        from: "rebecca", d: 3, t: "15:40", re: 40,
        to: ["me", "olivia"], cc: ["megan", "yuki", "malik"],
        attach: ["Fabrikam_Renewal_Quote_FY26_rev2.pdf"],
        text: "Dear Alex and Olivia,\n\nPlease find attached the revised renewal quote (rev2). Summary of terms:\n\n- 3-year term\n- Year-one price of $342,460, a 17% reduction from your current annual spend\n- Annual uplift capped at 2.5% in years two and three (3-year total $1,053,279)\n- Committed ingest of 3.9 TB/day, with tiered bands at 4.5 and 5.5 TB/day\n- Overage rate of $0.29/GB\n- 15% annual flex-down right\n- Archive tier included\n- Legal terms per MSA redlines v3, with the 2x data protection super-cap\n\nCould you confirm by Friday whether Northwind will accept the 3-year term at the revised rate? If so, we'll issue the order form for signature early next week.\n\nBest regards,\nRebecca",
      },
    ],
  },

  // ===========================================================================
  // 4. Design review: RFC-112
  // ===========================================================================
  {
    key: "design",
    subject: "Design review: multi-region active-passive for auth-gateway (RFC-112)",
    labels: [],
    inbox: false,
    messages: [
      /* 0 */ {
        from: "noah", d: 98, t: "10:00",
        to: ["me", "victor", "priya"], cc: ["ravi", "lena", "owen", "tariq", "kofi", "mei", "hana", "amelia"],
        attach: ["RFC-112_auth_gateway_multiregion.pdf", "failover_sequence.png"],
        text: "Hi all,\n\nRFC-112 is ready for review: docs.northwind.example/rfc/112 (PDF and the failover sequence diagram attached).\n\nTL;DR: auth-gateway runs in a single region today (west1), which makes it our largest single point of failure — every login, token refresh and API call validates through it. I'm proposing an active-passive setup with a warm standby in east1:\n\n- Session store: Redis primary in west1, cross-region replica in east1 (async)\n- Credentials DB: Postgres streaming replication to east1\n- Token signing: keys replicated to the east1 HSM cluster\n- Failover: DNS-based (auth.northwind.example, 60s TTL), triggered by the on-call engineer via runbook\n- Targets: RTO 15 minutes; RPO 1 minute for sessions, ≤5 seconds for credentials\n- Cost: roughly $19k/month for the standby footprint\n\nPlease leave comments in the doc by next Friday. I'd like to hold a review meeting the week after and get to a decision.\n\nThanks,\nNoah",
      },
      /* 1 */ {
        from: "me", d: 98, t: "11:20",
        text: "Thanks Noah — this is overdue, and the doc is a strong starting point.\n\nTo frame the review, here's what I need to decide:\n\n- Is active-passive the right first step toward our 99.95% availability target for login, or should we go straight to something else?\n- Is the cost justified against the risk we're carrying today?\n- What does this require from other teams, and in what order?\n\nVictor, please act as lead reviewer. Kofi, I'd like your eyes specifically on signing key distribution. Hana and Amelia, please flag client and developer impact early rather than at the end.\n\nAlex",
      },
      /* 2 */ {
        from: "ravi", d: 97, t: "09:40",
        text: "Questions on session replication:\n\n- With async replication, any session created or refreshed in the last few seconds before failover is lost. What's the measured replication lag?\n- Web refresh tokens live in Redis too, right? If so, a user who refreshed just before failover gets logged out in east1.\n- Have we considered moving web to short-lived JWT access tokens (15 min) with refresh tokens in Postgres? Then only refresh tokens need durable replication and the session store becomes a cache.\n\nRavi",
      },
      /* 3 */ {
        from: "noah", d: 97, t: "10:30",
        text: "Good questions.\n\n- Measured cross-region replication lag in the load test: p50 120ms, p99 ~800ms. The 1-minute RPO is deliberately conservative.\n- Yes, web refresh tokens are in Redis today. Mobile already uses JWTs with refresh tokens in Postgres.\n- Moving web to the mobile model is the right long-term direction, but it's a big change for the SPA and I kept it out of scope. Happy to discuss whether it should be a prerequisite.\n\nNoah",
      },
      /* 4 */ {
        from: "hana", d: 97, t: "11:15",
        text: "Frontend impact, since that's my area:\n\nIf we lose web sessions on failover, ~2.3M active web sessions get a 401 on their next request. The SPA handles 401 by redirecting to login, which drops whatever the user was doing — half-filled forms, cart state, the lot. With a 15-minute RTO that would be a very visible event.\n\nIf refresh tokens survived failover, the SPA could do a silent re-auth and most users would never notice. So from my side, Ravi's suggestion is closer to a requirement than a nice-to-have.\n\nHana",
      },
      /* 5 */ {
        from: "tariq", d: 96, t: "08:30",
        text: "DNS failover concerns.\n\n60s TTL is what we publish, not what clients honor. In the last DR test, 8-12% of traffic was still hitting the old records 10 minutes after the change, mostly corporate resolvers and older Android clients that cache aggressively.\n\nOptions:\n- anycast on the edge (we already do this for the API edge in west1, not yet in east1)\n- GSLB with health checks\n- client-side failover to a secondary hostname for the apps we control\n\nAnycast is the cleanest, but east1 won't have BGP sessions until the edge refresh lands.\n\nTariq",
      },
      /* 6 */ {
        from: "noah", d: 96, t: "09:45",
        text: "Thanks Tariq, that matches what I've heard from the edge team. Proposal for phase 1: DNS with a 30s TTL plus a secondary hostname (auth-east1.northwind.example) that mobile clients try on connection failure. Anycast becomes phase 2 once the edge refresh lands. I'll update the RFC.\n\nNoah",
      },
      /* 7 */ {
        from: "kofi", d: 96, t: "14:00",
        text: "On signing keys:\n\nReplicating the private signing key to a second HSM cluster doubles the number of places that key can leak from, and the key ceremony for cross-region export is not something we want to do routinely.\n\nAlternative: per-region signing keys. Each region signs with its own key, and both public keys are published in the JWKS (jwks.northwind.example/.well-known/jwks.json) with distinct kid values. Validators accept either. Rotation stays at 30 days per region.\n\nCaveat: this only works if every token validator handles multiple kids correctly and refreshes the JWKS. I'm not confident they all do. Also, if east1 is passive its key never gets exercised — we should sign a small slice of real traffic there to prove it works.\n\nKofi",
      },
      /* 8 */ {
        from: "victor", d: 95, t: "16:30",
        text: "Alternative proposal, since several of the concerns above point the same way: active-active.\n\nMy problem with active-passive is the standby. A passive region that serves no traffic rots — config drifts, capacity assumptions go stale, and the failover path is the one we exercise least. We'd be spending $19k/month on the thing we trust least on the day we need it.\n\nSketch:\n- both regions serve login and token validation; users are routed to the nearest region\n- sessions are region-local, and refresh tokens carry a home-region claim\n- credentials DB stays single-writer (writes are rare: password changes, MFA enrollment) with read replicas in both regions\n- signing per Kofi's per-region keys\n- no split-brain on writes because there's one writer; losing a region degrades writes, reads continue\n\nCost: roughly $9-12k/month more than A-P. In exchange, failover is just a traffic shift, and we exercise both regions every day.\n\nI'll write it up properly if there's interest.\n\nV",
      },
      /* 9 */ {
        from: "lena", d: 92, t: "10:00",
        text: "On split-brain in A-P:\n\nThe RFC doesn't say who decides that east1 is primary. If the inter-region link partitions but both regions are healthy, an automated system could promote east1 while west1 keeps serving — two primaries and diverging session and credential state.\n\nTwo options:\n- manual trigger only, with a runbook (simple, slower)\n- automated failover with a lease held by a witness in a third location (central1), so only the lease holder can be primary\n\nI'd lean toward the witness plus a manual trigger in phase 1: automation performs the promotion steps, a human decides to start them.\n\nLena",
      },
      /* 10 */ {
        from: "owen", d: 92, t: "11:20",
        text: "Cost breakdown from the Terraform plan (modules/auth-gateway with region = east1):\n\nActive-passive\n- 6 gateway nodes in east1 (vs 18 in west1): $7.8k\n- Redis replica: $3.1k\n- Postgres replica: $4.6k\n- cross-region replication transfer (~4 TB/month): $0.4k\n- load balancers, NAT, egress: $3.5k\n- total: ~$19.4k/month\n\nActive-active (Victor's sketch)\n- 14 gateway nodes in east1, a full Redis cluster, read replica, more egress\n- total: ~$31k/month\n\nThe module already supports multiple regions; most of the work is in the data layer.\n\nOwen",
      },
      /* 11 */ {
        from: "priya", d: 92, t: "13:00",
        text: "SRE view.\n\nAn RTO of 15 minutes is only realistic with automation. Our last DR exercise for auth-gateway was fully manual and took 52 minutes, most of it spent on DNS, Redis promotion and waiting for confirmation.\n\nI'm sympathetic to Victor's point about standby rot, but I'd rather crawl, walk, run: A-P with automated promotion and quarterly game days first, then A-A once we trust the data layer. Going straight to A-A means learning region-local sessions and failover at the same time, in the most critical service we run.\n\nPriya",
      },
      /* 12 */ {
        from: "amelia", d: 92, t: "15:40",
        text: "Developer experience impact:\n\n- Staging: running two regions doubles staging cost. I'd propose staging stays single-region with a simulated failover mode, plus one shared two-region environment for game days.\n- Token validation: services validate JWTs through auth-client. 41 services are pinned to auth-client v2, which caches a single JWKS key. Kofi's per-region keys need v3, which handles multiple kids. That's a migration across 41 repos.\n- I can drive it with a codemod and a tracking epic, but it's 4-6 weeks of elapsed time and should be on the critical path.\n\nAmelia",
      },
      /* 13 */ {
        from: "noah", d: 91, t: "09:00",
        text: "Thanks everyone — summary of what's changing in v2:\n\n- Signing: per-region keys with multi-kid JWKS (Kofi); auth-client v3 migration as a prerequisite (Amelia)\n- Sessions: web refresh tokens move to Postgres so they survive failover; the SPA does silent re-auth on 401 (Ravi, Hana)\n- Split-brain: witness in central1 holding a promotion lease; promotion automated, triggered by a human (Lena)\n- Traffic: DNS with 30s TTL + secondary hostname for mobile in phase 1, anycast in phase 2 (Tariq)\n- Game days: quarterly, the first one in staging before prod (Priya)\n\nVictor, could you write up active-active as an alternatives appendix? I want the review to weigh both properly.\n\nNoah",
      },
      /* 14 */ {
        from: "victor", d: 91, t: "10:15",
        text: "Will do — Appendix B by end of week. To be clear, I'm not trying to block this. I think A-P is the expensive way to get to A-A, and I want that on the record before we decide.\n\nV",
      },
      /* 15 */ {
        from: "mei", d: 91, t: "11:00",
        text: "Capacity note from Platform Runtime: auth-gateway depends on rate-limit-svc and the feature flag service, so those need to exist in east1 too.\n\n- For A-P, we can stand up passive copies of both in about three weeks.\n- For A-A, the rate limiter needs globally consistent per-tenant limits across regions. That's a quarter of work for my team, and it isn't on our roadmap.\n\nNot a vote, just the cost on our side.\n\nMei",
      },
      /* 16 */ {
        from: "me", d: 90, t: "09:30",
        text: "Great thread — this is how design reviews should go.\n\nReview meeting: next Tuesday 10:00–11:30, room Foundry plus meet.northwind.example/rfc-112. Pre-reads are RFC v2 and Victor's Appendix B; please read both before you arrive.\n\nI want to leave the room with a decision on phase 1 (A-P vs A-A), named owners for the prerequisites, and a list of open questions with dates. Noah will drive, Owen will take notes, and I'll make the call if we don't converge.\n\nAlex",
      },
      /* 17 */ {
        from: "victor", d: 88, t: "17:00",
        text: "Appendix B is up in the RFC. Short version:\n\n- A-A removes the standby-rot problem and makes failover a routine traffic shift\n- it costs ~$11.6k/month more than A-P, plus Mei's quarter on the rate limiter\n- refresh tokens need a home-region claim; credential writes stay single-region\n- a migration path from A-P to A-A exists but isn't free: we'd rebuild session routing\n\nV",
      },
      /* 18 */ {
        from: "ravi", d: 85, t: "09:10",
        text: "One problem with A-A I want to raise before Tuesday: refresh token rotation with reuse detection.\n\nWe rotate refresh tokens on every use and revoke the whole token family if an old one is presented (standard reuse detection). In A-A with async replication, a token rotated in west1 and then presented to east1 within the lag window looks like reuse, and we'd revoke a legitimate user's session. At a p99 lag of 800ms that's rare per user, but at our volume it's hundreds of false revocations a day.\n\nRavi",
      },
      /* 19 */ {
        from: "victor", d: 85, t: "10:00",
        text: "Good catch. Mitigation: route refresh requests to the token's home region using the rgn claim, so rotation always happens on the writer for that family. Validation stays local.\n\nV",
      },
      /* 20 */ {
        from: "kofi", d: 85, t: "10:40",
        text: "That works if rgn is inside the signed token, not a header. I'd also add a 2s grace window on reuse detection either way — we have the same race today with mobile clients retrying.\n\nKofi",
      },
      /* 21 */ {
        from: "hana", d: 85, t: "11:30",
        text: "As long as the SPA doesn't need to know which region it's talking to, I'm fine with either design.\n\nHana",
      },
      /* 22 */ {
        from: "owen", d: 84, t: "13:30",
        text: "Review meeting notes (RFC-112).\n\nAttendees: Noah, Victor, Ravi, Lena, Tariq, Kofi, Priya, Mei, Hana, Amelia, Owen, Alex.\n\nDecisions\n- D1: phase 1 is active-passive with automated, human-triggered promotion\n- D2: targets — RTO 15 min; RPO 1 min for sessions, ≤5s for credentials\n- D3: per-region signing keys with multi-kid JWKS; east1 signs 1% of production traffic to keep its key exercised\n- D4: web refresh tokens move to Postgres; SPA silent re-auth on 401\n- D5: witness in central1 holds the promotion lease\n- D6: DNS with 30s TTL + secondary hostname for mobile; anycast deferred to phase 2\n- D7: active-active (Appendix B) is re-evaluated after two successful production game days\n\nOwners\n- auth-client v3 migration: Amelia\n- witness + promotion automation: Lena\n- refresh token migration: Ravi, with Hana for the SPA\n- east1 footprint (Terraform): Owen\n- rate-limit-svc and flags in east1: Mei\n- game day plan: Priya\n\nAlex will give final approval once the cost estimate is updated for the witness and the 1% signing slice.\n\nOwen",
      },
      /* 23 */ {
        from: "victor", d: 84, t: "15:00",
        text: "Notes are accurate. Recording my dissent on D1 for the decision log: I still think A-P is the more expensive path to where we'll end up. But the group's reasoning about sequencing risk is sound and I'll commit to it. D7 makes this a two-way door, which is what matters.\n\nV",
      },
      /* 24 */ {
        from: "tariq", d: 83, t: "09:20",
        text: "30s TTL is fine. I'll set up health checks for auth.northwind.example from three vantage points (west1, east1, central1) and require 2 of 3 failing before alerting. Cert for the secondary hostname is requested.\n\nTariq",
      },
      /* 25 */ {
        from: "lena", d: 83, t: "10:30",
        text: "The witness design is in a sub-doc linked from the RFC (section 6.3). Short version: lease TTL 10s, renewed every 3s; promotion requires holding the lease plus an explicit trigger from the runbook command. Without the trigger, losing the lease only alerts.\n\nLena",
      },
      /* 26 */ {
        from: "noah", d: 81, t: "14:00",
        attach: ["RFC-112_auth_gateway_multiregion.pdf", "failover_sequence.png"],
        text: "RFC-112 v3 is posted with the decision log (D1–D7), Victor's dissent recorded under D1, and an updated failover sequence diagram that reflects the witness and the secondary hostname. Both attached.\n\nOwen is updating the cost estimate; once that's in, I'll ask Alex for final approval.\n\nNoah",
      },
      /* 27 */ {
        from: "kofi", d: 78, t: "11:00",
        text: "Security sign-off on v3, with two conditions:\n\n- the east1 HSM partition is provisioned and the key ceremony for the east1 signing key is completed before any traffic is signed there\n- auth-client v3 caps the JWKS cache TTL at 5 minutes so a revoked key falls out quickly\n\nThe ceremony is booked for two weeks from Thursday.\n\nKofi",
      },
      /* 28 */ {
        from: "amelia", d: 78, t: "14:20",
        text: "auth-client v3 migration plan: the codemod is ready and tested on four services. Tracking under DEVX-640; we'll open PRs against all 41 repos next week, targeting 90% merged within four weeks. Teams that don't merge get a pairing session, not a nag.\n\nAmelia",
      },
      /* 29 */ {
        from: "owen", d: 77, t: "10:00",
        text: "Updated cost: $20.1k/month for phase 1, including the witness in central1 ($0.4k) and the extra signing load in east1 ($0.3k). Malik confirmed it fits inside the platform infrastructure budget without a reforecast.\n\nOwen",
      },
      /* 30 */ {
        from: "priya", d: 74, t: "10:00",
        text: "Game day plan:\n\n- Staging drill in two weeks: full promotion of east1, including Redis, Postgres, DNS and the witness\n- First production drill after phase 1 ships, in a low-traffic window with support on standby\n- Success criteria: RTO ≤ 15 min, no credential writes lost, < 2% 5xx during cutover, ≥ 95% of web users retained via silent re-auth\n\nI'll own the runbook and run the first drill myself.\n\nPriya",
      },
      /* 31 */ {
        from: "mei", d: 71, t: "09:30",
        text: "Confirmed: rate-limit-svc and the flag service will be running in east1 (passive) by the end of next sprint. Tracked under RUN-318.\n\nMei",
      },
      /* 32 */ {
        from: "me", d: 70, t: "11:00",
        text: "I'm approving RFC-112 as written in v3.\n\nThe reasoning, for the decision log: active-passive closes our biggest single point of failure within a quarter, at a cost we've budgeted, and it sequences the risk sensibly — we learn failover before we learn region-local sessions. Victor's concern about standby rot is real; D3 (signing 1% of traffic in east1) and quarterly game days are how we address it. D7 stands: after two successful production drills, we revisit active-active with real data.\n\nConditions:\n- Kofi's two security conditions are met before east1 signs any traffic\n- No production drill until auth-client v3 is on 100% of token-validating services\n- Noah posts a short status update to this list every two weeks until phase 1 ships\n\nThank you all. Noah, please mark the RFC Approved.\n\nAlex",
      },
      /* 33 */ {
        from: "noah", d: 70, t: "11:30",
        text: "Thank you. Marked Approved in the RFC index; the implementation epic is AUTH-2140.\n\nNoah",
      },
      /* 34 */ {
        from: "victor", d: 70, t: "12:10",
        text: "+1. Looking forward to being wrong about standby rot.\n\nV",
      },
      /* 35 */ {
        from: "hana", d: 69, t: "15:20",
        text: "Silent re-auth has shipped to the SPA behind the web_silent_reauth flag. It's on for internal users now; we'll ramp it once Ravi's refresh token migration is done.\n\nHana",
      },
      /* 36 */ {
        from: "lena", d: 64, t: "16:00",
        text: "Staging drill results:\n\n- Total failover time: 11m40s (target 15m)\n- 97.8% of web sessions retained via silent re-auth\n- No credential writes lost; replication lag at promotion was 340ms\n- One issue: the witness lease flapped once under synthetic packet loss because the renewal timeout was too tight. Fix is in PLAT-955 (renewal every 2s, TTL 12s).\n\nNo blockers for the production drill once auth-client v3 is fully rolled out.\n\nLena",
      },
      /* 37 */ {
        from: "noah", d: 62, t: "10:00",
        attach: ["failover_sequence.png"],
        text: "Wrapping up this thread: phase 1 is on track. PLAT-955 is merged, auth-client v3 is on 37 of 41 services, and the east1 key ceremony is done. The updated failover sequence attached reflects the lease timings from the drill.\n\nFurther updates will come through the biweekly status email. Thanks again — one of the most useful reviews I've been part of.\n\nNoah",
      },
      /* 38 */ {
        from: "me", d: 62, t: "10:40",
        text: "Nice work — 11m40s on the first drill is better than I expected. Lena, thanks for chasing down the witness flap. Let's get the last four services onto v3 and book the production drill.\n\nAlex",
      },
    ],
  },
];

// ===========================================================================
// recent
// ===========================================================================

// Hand-written recent threads (last two weeks), scripted live arrivals and
// generic auto-replies for the demo mailbox. Fictional content only.


export const RECENT_THREADS: ThreadScript[] = [
  // =========================================================================
  // NEEDS YOU — someone else wrote last, addressed To: Alex, with a question
  // =========================================================================
  {
    key: "r-headcount-plan",
    subject: "H1 headcount plan – Platform input",
    starred: true,
    unread: 1,
    messages: [
      {
        from: "marcus", d: 6, t: "09:12", to: ["me"], cc: ["helen", "malik"],
        attach: ["H1_Headcount_Template.xlsx"],
        text: "Hi Alex,\n\nWe're kicking off H1 headcount planning. I need Platform's input in the attached template — one tab per scenario:\n\n- Flat: no net new, backfills only\n- +4: what you'd add with a modest increase\n- +8: what you'd do if the migration savings land as promised\n\nFor each role, a one-line justification tied to an outcome (reliability, cost, delivery). Malik has pre-filled loaded cost per level so you don't have to guess.\n\nThanks,\nMarcus",
      },
      {
        from: "me", d: 5, t: "17:40",
        text: "Will do. Quick question before I start — do the two open SRE backfills count against the +4, or do they sit outside the scenarios?\n\nAlex",
      },
      {
        from: "marcus", d: 4, t: "08:05",
        text: "Outside. Backfills are baseline in every scenario. Only net new counts.\n\nM",
      },
      {
        from: "malik", d: 1, t: "16:20", to: ["me"], cc: ["marcus", "helen"],
        text: "Hi Alex,\n\nPlatform is the last org not in yet — Data, Payments and DevEx all submitted on Friday. Can you get your tab back to me by Wednesday noon? I need a few hours to roll it up before Marcus's review with Renata on Thursday.\n\nIf it helps, I've copied last half's Platform justifications into a hidden column so you can reuse anything still relevant.\n\nThanks,\nMalik",
      },
    ],
  },
  {
    key: "r-po-loadtest",
    subject: "PO approval: load-test cluster capacity (PO-30417)",
    labels: ["Finance"],
    unread: 2,
    messages: [
      {
        from: "olivia", d: 2, t: "10:30", to: ["me"], cc: ["owen"],
        attach: ["Quote_LoadTest_Reserved_6wk.pdf"],
        text: "Hi Alex,\n\nOwen has requested six weeks of reserved compute for the payments-api load-test cluster (48 nodes, perf-lt-01). The quote comes to $18,400 all-in, quote attached.\n\nAnything over $15k needs director approval, so it's sitting in your queue in the procurement portal under PO-30417. Could you approve it by Thursday?\n\nThanks,\nOlivia",
      },
      {
        from: "owen", d: 1, t: "09:02",
        text: "For context: this is for the 3x-peak soak test that came out of the INC-4821 action items. We want to run it before the ledger moves, so ideally the nodes are up by Monday. Happy to walk through the sizing if useful.\n\nOwen",
      },
      {
        from: "olivia", d: 0, t: "08:47", to: ["me"], cc: ["owen"],
        text: "Bumping this one — the reservation price only holds until Thursday 17:00, after that it reprices at on-demand rates (roughly +30%). Could you approve PO-30417 today or tomorrow?\n\nOlivia",
      },
    ],
  },
  {
    key: "r-oncall-policy",
    subject: "Proposal: on-call policy change (secondary rotation + comp time)",
    unread: 1,
    messages: [
      {
        from: "mei", d: 9, t: "11:15", to: ["me"], cc: ["priya", "jonah", "felix", "sofia"],
        attach: ["OnCall_Policy_v3.docx"],
        text: "Hi Alex,\n\nAs promised after the last retro, here's the draft on-call policy change. Summary:\n\n- Add a secondary rotation for payments-api and auth-gateway (today secondary is 'whoever answers Slack')\n- Primary shifts drop from 7 days to 3.5 days (Mon–Thu noon / Thu noon–Mon)\n- Any page between 00:00 and 06:00 earns half a day of comp time, capped at 2 days per month\n- Pages that recur 3+ times in a month auto-file a reliability ticket against the owning team\n\nFull doc attached. Would love comments from the group before I take it to you formally.\n\nMei",
      },
      {
        from: "priya", d: 8, t: "09:40",
        text: "Strong +1 on the secondary rotation. One note: once we have people in Lisbon next year we should revisit follow-the-sun instead of shorter shifts, but this is the right step for now.\n\nPriya",
      },
      {
        from: "jonah", d: 8, t: "14:22",
        text: "Comp time is nice in theory. Who tracks it? Last time we tried this it lived in a spreadsheet nobody updated and it quietly died.\n\n- Jonah",
      },
      {
        from: "sofia", d: 7, t: "10:05",
        text: "Hi all,\n\nFrom the HR side, comp time is fine as long as it's logged in the HR system as 'on-call recovery' leave. I can set up that leave type, and managers approve it like any other time off — no spreadsheet needed, Jonah.\n\nSofia",
      },
      {
        from: "me", d: 6, t: "18:30",
        text: "Thanks Mei, this is good. Two asks before it goes final:\n\n- Make the auto-filed reliability ticket go to the owning team's EM, not just the backlog\n- Add a line on how we handle swaps that cross a major change window (cutover weekends)\n\nOtherwise I'm supportive.\n\nAlex",
      },
      {
        from: "mei", d: 1, t: "15:48", to: ["me"], cc: ["priya", "jonah", "felix", "sofia"],
        attach: ["OnCall_Policy_v4.docx"],
        text: "Hi Alex,\n\nv4 attached with both changes (section 4.2 and the new 6.1 on change windows). Sofia has the leave type ready.\n\nAre you OK with me announcing it at Monday's eng managers sync, effective two weeks after? I'd need your yes by Friday to get it into the agenda.\n\nMei",
      },
    ],
  },
  {
    key: "r-pentest-scope",
    subject: "Litware penetration test – scope and testing window",
    labels: ["Vendors"],
    starred: true,
    unread: 1,
    messages: [
      {
        from: "monica", d: 11, t: "10:02", to: ["me"], cc: ["rachel", "kofi"],
        attach: ["Litware_SOW_Northwind_PenTest_v1.pdf"],
        text: "Hello Alex,\n\nThank you for selecting Litware for this year's assessment. Attached is the draft SOW. Proposed scope:\n\n- External perimeter (all internet-facing hosts under northwind.example)\n- auth-gateway and payments-api, authenticated and unauthenticated\n- Internal Kubernetes, from an assumed-breach starting point (one compromised workload)\n\nWe've pencilled a two-week window starting the Monday after next. Please let me know if that clashes with anything on your side.\n\nKind regards,\nMonica",
      },
      {
        from: "me", d: 10, t: "08:55",
        text: "Hi Monica,\n\nThanks — scope looks right. One important wrinkle: payments-api and auth-gateway move to our new cloud landing zone this Saturday, so I'd rather you test the new endpoints than the DAL1 ones that will be gone a week later. Can we shift the window so it starts after the cutover?\n\nKofi will handle source IP allowlisting and test accounts.\n\nAlex",
      },
      {
        from: "hugo", d: 9, t: "13:30",
        text: "Hi Alex, Kofi,\n\nA few technical questions so we can prepare:\n\n1. Should we test production or a staging environment with parity?\n2. We'll originate from 203.0.113.40/29 — please allowlist at the WAF but not at the rate limiter.\n3. We need two test tenants with standard and admin roles.\n4. Are there any rate limits we must stay under on payments-api?\n\nBest,\nHugo",
      },
      {
        from: "kofi", d: 8, t: "11:12",
        text: "Hi Hugo,\n\nTest tenants are created (lt-standard-01, lt-admin-01) — credentials coming via the shared vault link separately. Allowlisting is done at the WAF. Payments-api: please stay under 50 rps sustained.\n\nOn prod vs staging: staging parity is decent for auth-gateway but not for payments-api (no real processor connection). Alex, your call.\n\nKofi",
      },
      {
        from: "tess", d: 3, t: "16:45",
        attach: ["Litware_SOW_Northwind_PenTest_v2.pdf"],
        text: "Hello all,\n\nFor your SOC 2 evidence you'll want a letter of attestation in addition to the full report — I've added that as a deliverable in v2 of the SOW (attached). No change to price for the letter itself.\n\nRegards,\nTess",
      },
      {
        from: "monica", d: 0, t: "10:15", to: ["me"], cc: ["rachel", "kofi", "hugo", "tess"],
        attach: ["Litware_SOW_Northwind_PenTest_v3.pdf"],
        text: "Hello Alex,\n\nRevised SOW attached: 12 testing days, $42,500, window starting the Monday after your cutover, production for auth-gateway and staging for payments-api as Kofi suggested.\n\nTwo decisions we need from you:\n\n1. Do you want the assumed-breach internal Kubernetes segment included? It adds 3 days and $6,800.\n2. Can you sign by Friday? After that I can't guarantee Hugo's availability for that window.\n\nKind regards,\nMonica",
      },
    ],
  },
  {
    key: "r-contoso-co3",
    subject: "Contoso SOW – Change Order #3 (ledger phase extension)",
    labels: ["Vendors", "Finance"],
    unread: 1,
    messages: [
      {
        from: "laura", d: 7, t: "14:10", to: ["me"], cc: ["kevin", "olivia"],
        attach: ["Northwind_Contoso_CO3.pdf"],
        text: "Hi Alex,\n\nFollowing the decision to phase the migration, please find attached Change Order #3. It covers three additional weeks for the ledger phase with two consultants (Daniel and Bruno), for a total of $64,200.\n\nHappy to discuss before you route it for signature.\n\nBest regards,\nLaura",
      },
      {
        from: "me", d: 6, t: "09:20",
        text: "Hi Laura, Kevin,\n\nI understand the need for extra time, but the failed rehearsal was partly down to the replication runbook Contoso provided — the lag check was pointed at the wrong replica. I'm not comfortable with Northwind carrying all three weeks.\n\nCan you come back with a split that reflects that?\n\nAlex",
      },
      {
        from: "kevin", d: 5, t: "11:48",
        text: "Hi Alex,\n\nFair point, and I've raised it internally. We're prepared to absorb 50% of the first week, which was largely rework. That brings CO3 to $53,500. I'll have Laura reissue the paperwork.\n\nRegards,\nKevin",
      },
      {
        from: "olivia", d: 4, t: "10:02",
        text: "One procurement note: please issue this against the existing PO-29870 as an amendment rather than a new PO, otherwise it resets the payment terms.\n\nOlivia",
      },
      {
        from: "kevin", d: 1, t: "17:05", to: ["me"], cc: ["laura", "olivia"],
        attach: ["Northwind_Contoso_CO3_rev1.pdf"],
        text: "Hi Alex,\n\nRevised CO3 attached at $53,500, written as an amendment to PO-29870 per Olivia.\n\nCan you confirm you're OK with this number so Laura can send it for signature? Daniel and Bruno are pencilled in for the ledger weekend and I'd hate to release them to another client.\n\nRegards,\nKevin",
      },
    ],
  },
  {
    key: "r-adatum-v1-deprecation",
    subject: "Adatum Charges API v1 – deprecation timeline",
    labels: ["Vendors"],
    unread: 1,
    messages: [
      {
        from: "ingrid", d: 12, t: "15:00", to: ["me"], cc: ["ben", "aisha", "amara"],
        attach: ["Adatum_Charges_v1_Sunset_Notice.pdf"],
        text: "Hi Alex,\n\nAs part of our platform roadmap, Charges API v1 will be retired in 120 days. Before that we'll run scheduled brownouts (v1 returns 503 for 15 minutes, then 1 hour, then 4 hours). Details and the v1→v2 mapping are in the attached notice.\n\nOur logs show Northwind still sends about 9% of traffic to v1 endpoints. Let me know who should be our point of contact for the migration.\n\nBest,\nIngrid",
      },
      {
        from: "aisha", d: 12, t: "17:32",
        text: "We have three call sites still on v1:\n\n- refunds (refund-worker)\n- payouts reconciliation (nightly batch)\n- dispute webhooks (inbound, v1 signature scheme)\n\nRefunds is a small change. The other two are more involved, especially webhooks because the signing scheme changed.\n\nAisha",
      },
      {
        from: "me", d: 11, t: "10:10",
        text: "Hi Ingrid,\n\nThanks for the heads-up. We're in the middle of a datacenter migration, with ledger moving in two weekends. Two requests:\n\n- Can the brownouts avoid our cutover weekends? Grace can send you the dates.\n- Is an extension possible for the dispute webhooks specifically?\n\nAlex",
      },
      {
        from: "amara", d: 6, t: "14:05",
        text: "Hi all,\n\nWe can skip the brownouts on your cutover weekends — I've noted them on our side. On webhooks: the v2 payload is mostly the same, but signatures move to HMAC-SHA256 with a timestamp header. Your sandbox account already has v2 enabled.\n\nAmara",
      },
      {
        from: "ingrid", d: 2, t: "11:30", to: ["me"], cc: ["ben", "aisha", "amara"],
        text: "Hi Alex,\n\nGood news: we can offer a 45-day extension for the dispute webhooks only. To file the exception I need a named owner and a target date from your side for each of the remaining two (refunds and payouts reconciliation).\n\nCould you send those by next Wednesday?\n\nBest,\nIngrid",
      },
    ],
  },
  {
    key: "r-budget-reforecast",
    subject: "Q4 reforecast – Platform cloud spend",
    labels: ["Finance"],
    unread: 1,
    messages: [
      {
        from: "malik", d: 8, t: "09:00", to: ["me"], cc: ["helen"],
        attach: ["Platform_Reforecast_Q4_v1.xlsx"],
        text: "Hi Alex,\n\nPlatform is tracking 11% over plan on cloud spend: $212k/month run rate against $191k. Main drivers:\n\n- Dual-running DAL1 and the landing zone (expected, but longer than planned since the rehearsal slipped)\n- Cross-region egress on the event bus, up 40% since the mirror went live\n- Three staging clusters that look idle on weekends\n\nWorkbook attached. Can we talk through it this week?\n\nMalik",
      },
      {
        from: "me", d: 7, t: "13:15",
        text: "Thanks Malik. The dual-running cost is real but temporary — once ledger moves and DAL1 is decommissioned we should drop roughly $38k/month. The egress number surprises me; I'll ask Diego's team to look at the mirror topology.\n\nAlex",
      },
      {
        from: "helen", d: 6, t: "10:40",
        text: "Hi Alex,\n\nI understand the dual-running piece. What I need is a number you can commit to for the quarter. Can we hold Platform to +6% over plan?\n\nHelen",
      },
      {
        from: "me", d: 6, t: "16:55",
        text: "Helen — I think +6% is doable with three levers:\n\n- Scale staging clusters to zero outside working hours (~$6k/month)\n- Move the batch fleet to reserved capacity (~$4k/month)\n- Compress event-bus mirror traffic (~$3k/month, needs a week of Ravi's time)\n\nMalik, could you model those?\n\nAlex",
      },
      {
        from: "malik", d: 0, t: "09:30", to: ["me"], cc: ["helen"],
        attach: ["Platform_Reforecast_Q4_v2_scenarios.xlsx"],
        text: "Hi Alex,\n\nI modelled your three levers in the attached (low / medium / high confidence tabs). Helen is asking whether you can commit in writing to the medium scenario — $201k/month, +5.2% over plan — before finance close on Friday.\n\nCan you reply with a yes, or tell me which scenario you'd rather commit to?\n\nThanks,\nMalik",
      },
    ],
  },
  {
    key: "r-infrasummit-talk",
    subject: "InfraSummit – invitation to speak",
    unread: 1,
    messages: [
      {
        from: "omar", d: 5, t: "19:20", to: ["me"],
        text: "Hi Alex,\n\nI'm the program chair for InfraSummit this spring. A few people on our committee heard about Northwind's datacenter-to-cloud migration and we'd love for you to give a 30-minute talk in our invited track — the theme this year is 'boring migrations', which I mean as a compliment.\n\nTravel and two hotel nights are covered for speakers. Would you be interested?\n\nBest,\nOmar",
      },
      {
        from: "me", d: 4, t: "08:40",
        text: "Hi Omar,\n\nThanks, that's very kind. I'm interested, though I'd want to wait until the migration is fully done before promising any war stories. Would it be possible to co-present with Priya Raman, our staff SRE? She's done a lot of the actual work.\n\nAlex",
      },
      {
        from: "omar", d: 0, t: "07:55", to: ["me"],
        text: "Hi Alex,\n\nCo-presenting is great — we cover travel for both speakers.\n\nCould you send a working title and a ~100-word abstract by Monday? And do you prefer the morning slot on day one or the afternoon slot on day two?\n\nThanks,\nOmar",
      },
    ],
  },
  {
    key: "r-sarah-reference",
    subject: "Coffee + a reference?",
    unread: 1,
    messages: [
      {
        from: "sarah", d: 3, t: "12:10", to: ["me"],
        text: "Hi Alex!\n\nIt's been way too long. Two things:\n\n1. We're about to make an offer to Jordan Pike for our infra lead role, and Jordan listed you as a reference from your time together on the storage team. Would you be up for a 20-minute call with our recruiter?\n2. Unrelated: I'd love to grab coffee and compare notes on cloud migrations. We're starting ours next year and I have a hundred questions.\n\nSarah",
      },
      {
        from: "me", d: 2, t: "20:15", mobile: true,
        text: "Hi Sarah! Great to hear from you. Yes to both — Jordan was one of the best engineers I've worked with. Coffee Thursday afternoon?\n\nAlex",
      },
      {
        from: "sarah", d: 1, t: "08:30", to: ["me"],
        text: "Amazing. Thursday at 4 works — the place on Harbor Street we used to go to?\n\nAnd for the reference: could you do Wednesday at 11:00 with our recruiter, Pat? If that doesn't work, what times would?\n\nSarah",
      },
    ],
  },
  {
    key: "r-laptop-refresh",
    subject: "Laptop refresh – please choose your model by Friday",
    unread: 1,
    messages: [
      {
        from: "liam", d: 4, t: "10:00", to: ["me"],
        text: "Hi Alex,\n\nYour laptop is part of this quarter's refresh cohort. Please choose one of the two standard models in the IT portal:\n\n- Option A: 14\", 32 GB RAM, 1 TB\n- Option B: 16\", 64 GB RAM, 2 TB (engineering profile)\n\nPlease choose by Friday so we can image it before the holiday shipping slowdown.\n\nThanks,\nLiam\nIT Service Desk",
      },
      {
        from: "liam", d: 1, t: "14:25", to: ["me"],
        attach: ["Platform_Refresh_Cohort.csv"],
        text: "Hi Alex,\n\nQuick reminder on your own selection. Also, six people on your team are in the same cohort (list attached). Managers can approve the engineering profile in bulk — could you approve the batch in the portal, or reply here with 'approve all' and I'll do it for you?\n\nThanks,\nLiam",
      },
    ],
  },
  {
    key: "r-soc2-access-review",
    subject: "SOC 2 quarterly access review – Platform (due Friday)",
    unread: 1,
    messages: [
      {
        from: "rachel", d: 6, t: "09:30", to: ["me"], cc: ["kofi"],
        attach: ["Access_Review_Platform_Prod.csv"],
        text: "Hi Alex,\n\nIt's that time again. Attached is the list of 37 accounts with production access owned by Platform. Please review and certify in the GRC tool by Friday — the auditors pull evidence the following Monday.\n\nKofi has pre-flagged anything that looks odd.\n\nRachel",
      },
      {
        from: "kofi", d: 5, t: "11:05",
        text: "Hi Alex,\n\nFour flags:\n\n- owen.price — still has break-glass admin from INC-4821\n- svc-contoso-migr — contractor service account, last used 19 days ago\n- felix.wagner — kubectl admin on prod-east, but he moved to the SRE team; probably fine, just confirm\n- jenkins-legacy — no owner listed\n\nKofi",
      },
      {
        from: "me", d: 4, t: "17:20",
        text: "Thanks Kofi.\n\n- Revoke svc-contoso-migr now; Bruno can request a new one if he needs it for ledger\n- Felix: confirmed, keep\n- jenkins-legacy: Amelia's team owns it, I'll ask her\n- Owen: keep until the soak test is done next week\n\nAlex",
      },
      {
        from: "kofi", d: 1, t: "13:40", to: ["me"], cc: ["rachel"],
        text: "Hi Alex,\n\nContractor account revoked, and Amelia claimed jenkins-legacy.\n\nOn Owen's break-glass: the auditors will flag a standing admin grant with no expiry. Can you either approve a time-bound exception (I've drafted one, expires next Friday) or let me revoke it today? And I still need your sign-off in the GRC tool by Friday.\n\nKofi",
      },
    ],
  },
  {
    key: "r-rfc-118",
    subject: "RFC-118: tiered storage for event-bus Kafka – review request",
    unread: 1,
    messages: [
      {
        from: "victor", d: 5, t: "10:45", to: ["me", "nora", "diego"], cc: ["ravi"],
        text: "All,\n\nRFC-118 is ready for review: moving event-bus Kafka to tiered storage, keeping 24h on local disk and offloading the rest to object storage. Retention for audit topics goes from 7 to 90 days without growing the brokers.\n\nDoc is in the RFC folder. Reviewers: Alex (approver), Nora, Diego.\n\n-- Victor",
      },
      {
        from: "diego", d: 3, t: "15:30",
        text: "Left comments. Main concern is consumer lag on replays from the remote tier — the analytics jobs replay 30 days at a time. Victor's added a section on fetch throttling which mostly addresses it.\n\nDiego",
      },
      {
        from: "victor", d: 0, t: "09:05", to: ["me"], cc: ["nora", "diego", "ravi"],
        text: "Alex,\n\nYou're the only approver left. Can you leave your review by Thursday so it makes Friday's architecture forum?\n\nThe main open question for you is cost vs. effort: it saves about $9k/month in broker storage but needs two weeks of Lena's time, which overlaps with the ledger weekend.\n\n-- Victor",
      },
    ],
  },
  {
    key: "r-allhands-slides",
    subject: "Thursday all-hands – Platform segment",
    unread: 2,
    messages: [
      {
        from: "maya", d: 2, t: "11:00", to: ["me"], cc: ["renata"],
        attach: ["AllHands_Template.pptx"],
        text: "Hi Alex,\n\nRenata would like you to do a 5-minute segment on migration progress at Thursday's all-hands (10:00, Bayview 4 plus the livestream). Template attached — two or three slides max.\n\nWould you be able to? If so I'd need the slides by Wednesday noon so AV can load them.\n\nThanks,\nMaya",
      },
      {
        from: "renata", d: 1, t: "21:40", mobile: true, to: ["me"], cc: ["maya"],
        text: "+1. Keep it non-technical, celebrate the team, and mention the payments cutover this weekend so nobody is surprised by the maintenance banner.\n\nR",
      },
      {
        from: "maya", d: 0, t: "08:20", to: ["me"], cc: ["renata"],
        text: "Hi Alex, just checking you saw this — could you confirm today so I can lock the run of show?\n\nMaya",
      },
    ],
  },
  {
    key: "r-calibration",
    subject: "Mid-year calibration – Platform ratings",
    unread: 0,
    messages: [
      {
        from: "sofia", d: 7, t: "09:15", to: ["me"],
        attach: ["Calibration_Guide_Managers.pdf"],
        text: "Hi Alex,\n\nCalibration for Engineering is next Tuesday. Please enter preliminary ratings for your 14 direct and skip-level reports in the review tool by Friday. The guide attached covers the rating definitions and the expected distribution.\n\nSofia",
      },
      {
        from: "me", d: 6, t: "12:30",
        text: "Hi Sofia,\n\nOne question: Felix moved from Mei's team to the SRE team mid-cycle. Should his rating reflect the incident work he did before the transfer? It was a big chunk of his half.\n\nAlex",
      },
      {
        from: "sofia", d: 3, t: "10:50", to: ["me"],
        text: "Hi Alex,\n\nYes — please get Mei's input and rate on the whole half.\n\nTwo more things: could you nominate one person for the promotion pre-read by Monday, and confirm you'll attend the session on Tuesday, 14:00–16:00 in Bayview 2?\n\nSofia",
      },
    ],
  },
  {
    key: "r-oncall-swap",
    subject: "On-call swap next week",
    unread: 2,
    messages: [
      {
        from: "sam", d: 1, t: "16:05", to: ["me"], cc: ["paul"],
        text: "Hi Alex,\n\nPaul and I would like to swap: I take his primary shift Monday–Wednesday next week, and he takes my weekend shift after that. The policy says you approve swaps that touch a cutover weekend, and mine does by a few hours (Sunday 04:00 handoff).\n\nAre you OK with me taking the swap?\n\nThanks,\nSam",
      },
      {
        from: "paul", d: 0, t: "09:12", to: ["me"], cc: ["sam"],
        text: "Fine by me. Schedule freezes at 17:00 today, so a yes or no before then would help. I'll update the rotation once you OK it.\n\n- Paul",
      },
    ],
  },
  {
    key: "r-dal1-lease",
    subject: "DAL1 colocation lease – extend another quarter?",
    labels: ["Finance"],
    unread: 1,
    messages: [
      {
        from: "helen", d: 6, t: "14:00", to: ["me"], cc: ["tariq", "olivia"],
        text: "Hi Alex,\n\nWe've received the renewal notice for the DAL1 cage (4 racks, $27,900/month). Options are another quarter on the same terms, or month-to-month at a 30% premium. Given the migration timeline, what do you recommend?\n\nHelen",
      },
      {
        from: "tariq", d: 5, t: "09:18",
        text: "After ledger moves we only need 2 racks: the HSMs and the backup appliances, until those get replaced. Racks 3 and 4 can be emptied the week after ledger.\n\n-- Tariq",
      },
      {
        from: "olivia", d: 4, t: "15:30",
        text: "I asked the provider: they'll let us reduce to 2 racks on a quarterly term for $15,600/month, provided we give notice before the renewal date.\n\nOlivia",
      },
      {
        from: "helen", d: 1, t: "11:45", to: ["me"], cc: ["tariq", "olivia"],
        text: "Hi Alex,\n\nCan you confirm by Friday whether we keep the DAL1 lease for another quarter — and if so, the full four racks or Olivia's two-rack option? The notice deadline is Monday, and I'd rather not end up on month-to-month by default.\n\nHelen",
      },
    ],
  },
  {
    key: "r-tailspin-profiles",
    subject: "Senior SRE shortlist – 2 profiles for review",
    labels: ["Hiring", "Vendors"],
    unread: 1,
    messages: [
      {
        from: "jess", d: 4, t: "13:00", to: ["me"], cc: ["harper"],
        attach: ["Profile_Candidate_A_SeniorSRE.pdf", "Profile_Candidate_B_SeniorSRE.pdf"],
        text: "Hi Alex,\n\nAs discussed with Harper, two profiles for the Senior SRE role:\n\n- Candidate A: 8 years, ran Kubernetes platform for a fintech, strong on Postgres operations\n- Candidate B: 6 years, ex-payments processor SRE, led their on-call redesign\n\nBoth are open to hybrid in the office two days a week.\n\nKind regards,\nJess",
      },
      {
        from: "harper", d: 3, t: "10:15",
        text: "I've screened both lightly. B is the stronger communicator; A has deeper database experience, which would help Nora's team. I'd phone-screen both.\n\nHarper",
      },
      {
        from: "jess", d: 0, t: "11:20", to: ["me"], cc: ["harper"],
        text: "Hi Alex,\n\nBoth candidates have other processes moving, and Candidate B has a final round elsewhere next week. Could you let us know by Wednesday whether you'd like to move either of them to a phone screen?\n\nKind regards,\nJess",
      },
    ],
  },

  // =========================================================================
  // WAITING — Alex wrote last, no answer yet
  // =========================================================================
  {
    key: "r-contoso-decom-estimate",
    subject: "Estimate: DAL1 decommission work",
    labels: ["Vendors"],
    starred: true,
    unread: 0,
    messages: [
      {
        from: "anika", d: 10, t: "16:30", to: ["me"], cc: ["kevin"],
        attach: ["Contoso_DAL1_Decommission_Estimate.xlsx"],
        text: "Hi Alex,\n\nAs requested, here's our estimate for the DAL1 decommission phase: 22 consultant-days covering data wipe verification, hardware return logistics, HSM key ceremony support and network teardown.\n\nRegards,\nAnika",
      },
      {
        from: "me", d: 9, t: "09:45",
        text: "Hi Anika,\n\nThanks. 22 days is more than I expected. Tariq is running the HSM key ceremony himself, and our network team will do the teardown, so I'd expect those lines to drop out. Could you send a revised estimate without them?\n\nAlex",
      },
      {
        from: "kevin", d: 8, t: "12:10",
        text: "Understood, Alex. We'll revise and come back to you this week.\n\nKevin",
      },
      {
        from: "me", d: 4, t: "15:20", to: ["kevin"], cc: ["anika"],
        text: "Hi Kevin,\n\nFollowing up on the revised decommission estimate. Helen needs to decide on the DAL1 lease by Monday and the decommission timeline feeds directly into that. Could you send it by Wednesday?\n\nThanks,\nAlex",
      },
    ],
  },
  {
    key: "r-adatum-sandbox",
    subject: "Sandbox credentials for v2 dispute webhooks",
    labels: ["Vendors"],
    unread: 0,
    messages: [
      {
        from: "me", d: 5, t: "10:30", to: ["amara"], cc: ["aisha"],
        text: "Hi Amara,\n\nCould you issue sandbox credentials for v2 dispute webhooks to our account, including a signing secret we can rotate? Aisha's team wants to test signature verification and secret rotation before we touch production.\n\nThanks,\nAlex",
      },
      {
        from: "amara", d: 4, t: "09:15",
        text: "Hi Alex,\n\nRequested internally — the sandbox team usually turns these around in a day or two. I'll forward as soon as I have them.\n\nAmara",
      },
      {
        from: "me", d: 3, t: "11:00", add: ["ingrid"],
        text: "Thanks Amara — any update? Aisha's team is blocked on the signature tests, and the webhook work is the long pole for the v1 sunset. Even a temporary key would unblock them. Adding Ingrid in case she can help expedite.\n\nAlex",
      },
    ],
  },
  {
    key: "r-cost-breakdown",
    subject: "Cloud spend by team – breakdown request",
    labels: ["Finance"],
    unread: 0,
    messages: [
      {
        from: "me", d: 6, t: "08:50", to: ["malik"],
        text: "Hi Malik,\n\nCould you pull a breakdown of the last three months of cloud spend by cost-center tag? I'm especially interested in egress and anything untagged. I want to show each team their own number before we talk about the reforecast levers.\n\nAlex",
      },
      {
        from: "malik", d: 6, t: "11:30",
        text: "Sure. Heads-up: tag coverage is only ~78%, so the untagged bucket will be big.\n\nMalik",
      },
      {
        from: "me", d: 5, t: "09:10",
        text: "That's fine, it's part of the story. If you can split untagged by account ID that would help me chase owners. Monday would be ideal — I want it for my 1:1 with Renata.\n\nAlex",
      },
    ],
  },
  {
    key: "r-dev-followup",
    subject: "Following up – Staff SRE role",
    labels: ["Hiring"],
    unread: 0,
    messages: [
      {
        from: "me", d: 9, t: "17:30", to: ["dev"], cc: ["harper"],
        text: "Hi Dev,\n\nThanks again for spending the day with us. The panel's feedback was very positive, and I'd like to set up a final conversation with Renata, our CTO. Could you share some times that work for you over the next week?\n\nBest,\nAlex",
      },
      {
        from: "dev", d: 8, t: "08:20",
        text: "Hi Alex,\n\nThank you, I really enjoyed the conversations — especially the incident review exercise. I'll send times shortly. Full transparency: I'm also in late stages with another company, so the sooner the better on my side too.\n\nDev",
      },
      {
        from: "me", d: 6, t: "10:05",
        text: "Hi Dev,\n\nChecking in — do you have a few 30-minute windows for Renata this week or early next? Also happy to jump on a call myself if you have questions about the team or the on-call setup.\n\nAlex",
      },
    ],
  },
  {
    key: "r-fabrikam-dpa",
    subject: "Fabrikam DPA – new subprocessor clause",
    labels: ["Vendors"],
    unread: 0,
    messages: [
      {
        from: "me", d: 7, t: "11:20", to: ["chris"], cc: ["rachel"],
        attach: ["Fabrikam_DPA_v4_redline.pdf"],
        text: "Hi Chris,\n\nFabrikam sent an updated DPA with the renewal. Section 7.2 adds a subprocessor for log storage in a second region. Does that conflict with any of our customer data-residency commitments? I need an answer before we countersign the renewal.\n\nThanks,\nAlex",
      },
      {
        from: "chris", d: 7, t: "14:00",
        text: "Got it — I'll look at it this week.\n\nChris",
      },
      {
        from: "me", d: 4, t: "09:35",
        text: "Hi Chris, gentle nudge on this one. Rebecca at Fabrikam would like the countersigned renewal by the end of next week. Do you have a view on 7.2 yet, even a preliminary one?\n\nAlex",
      },
    ],
  },
  {
    key: "r-headcount-swap",
    subject: "Headcount swap: one EntApps req for an SRE?",
    unread: 0,
    messages: [
      {
        from: "claire", d: 4, t: "16:40", to: ["me"],
        text: "Hi Alex,\n\nSaw your note in the managers channel about needing another SRE. I have a backend req that's been open for five months with no luck — the role's too niche. Might be worth a conversation.\n\nClaire",
      },
      {
        from: "me", d: 2, t: "19:10", add: ["marcus"],
        text: "Hi Claire,\n\nThat would be a huge help. Proposal: you transfer the open backend req to Platform now as a Senior SRE, and I give you one of my approved roles back next half, once your CRM integration work is staffed up and you know what level you need. Adding Marcus since he'd need to bless it.\n\nWould you be open to that?\n\nAlex",
      },
    ],
  },
  {
    key: "r-fabrikam-overage",
    subject: "Ingest overage – credit request",
    labels: ["Vendors", "Finance"],
    unread: 0,
    messages: [
      {
        from: "yuki", d: 9, t: "10:00", to: ["me"], cc: ["steve"],
        text: "Hi Alex,\n\nYour account exceeded committed ingest by 14% last month, mostly over a three-day period. At contract rates the overage comes to $7,350. Happy to walk through the usage breakdown.\n\nBest regards,\nYuki",
      },
      {
        from: "me", d: 8, t: "08:45",
        text: "Hi Yuki,\n\nThose three days were INC-4821 — we turned on debug logging on payments-api at Steve's team's suggestion to diagnose the latency issue. I'd like to request a credit for that overage. Can you raise it with Rebecca?\n\nAlex",
      },
      {
        from: "steve", d: 8, t: "13:20",
        text: "Hi all,\n\nI can confirm we recommended debug-level logging during the incident. I'll back the credit request internally.\n\nSteve",
      },
      {
        from: "me", d: 5, t: "14:50",
        text: "Yuki, Steve — any word from Rebecca on the credit? I'd like to settle this before we open the renewal conversation.\n\nThanks,\nAlex",
      },
    ],
  },
  {
    key: "r-runbook-owners",
    subject: "Runbook owners for post-cutover services",
    unread: 0,
    messages: [
      {
        from: "me", d: 3, t: "09:00", to: ["jonah", "felix", "paul"], cc: ["priya"],
        text: "Hi all,\n\nAfter Saturday, these runbooks need a named owner in the landing zone (the DAL1 versions get archived):\n\n- auth-gateway failover\n- payments-api scale-up\n- ledger-writer recovery\n- egress-nat rotation\n- cert-rotation\n- kafka-mirror lag\n- dns-failover\n- secrets-sync\n\nPlease reply and claim the ones you'll own by Friday. Owning means: you review it after every use and keep it current.\n\nThanks,\nAlex",
      },
      {
        from: "felix", d: 3, t: "11:30",
        text: "I'll take auth-gateway failover, payments-api scale-up and secrets-sync.\n\nFelix",
      },
      {
        from: "me", d: 2, t: "10:15",
        text: "Thanks Felix. Jonah, Paul — can you split the remaining five between you (ledger-writer, egress-nat, cert-rotation, kafka-mirror, dns-failover)?\n\nAlex",
      },
    ],
  },
  {
    key: "r-tailspin-terms",
    subject: "Contract-to-hire terms",
    labels: ["Hiring", "Vendors"],
    unread: 0,
    messages: [
      {
        from: "marco", d: 10, t: "15:15", to: ["me"], cc: ["jess"],
        attach: ["Tailspin_Terms_Northwind.pdf"],
        text: "Hi Alex,\n\nFollowing our call, attached are our standard terms: 22% placement fee on first-year base, 60-day replacement guarantee, and contract-to-hire at $145/hour with conversion after 90 days at no extra fee.\n\nBest,\nMarco",
      },
      {
        from: "me", d: 9, t: "10:20",
        text: "Hi Marco,\n\nThanks. For us to sign up for multiple roles I'd need 18% and a 90-day guarantee — our onboarding for SRE alone is six weeks, so 60 days doesn't tell us much. Could you send a redline with those changes?\n\nAlex",
      },
    ],
  },
  {
    key: "r-pg-upgrade",
    subject: "Postgres 16 upgrade – window for ledger-db?",
    unread: 0,
    messages: [
      {
        from: "nora", d: 6, t: "13:25", to: ["me"], cc: ["diego"],
        text: "Hi Alex,\n\nledger-db is still on Postgres 14. I'd like to upgrade to 16 before it moves, so we're not migrating an old major and then upgrading again in the cloud. I could do it the weekend before the ledger cutover — pg_upgrade with link mode, about 40 minutes of downtime.\n\nThoughts?\n\nNora",
      },
      {
        from: "me", d: 2, t: "17:45",
        text: "Hi Nora,\n\nMy instinct is not to stack two risky changes in back-to-back weekends, especially after the rehearsal. Can you confirm whether the upgrade can wait until two weeks after the ledger move, and what we'd lose if it does (support window, extensions, anything Daniel's tooling depends on)?\n\nAlex",
      },
    ],
  },

  // =========================================================================
  // FYI — Alex only on Cc
  // =========================================================================
  {
    key: "r-fyi-runtime-weekly",
    subject: "Platform Runtime – weekly update",
    unread: 2,
    messages: [
      {
        from: "mei", d: 1, t: "17:00", to: ["lena", "owen", "sam", "ravi"], cc: ["me", "grace"],
        text: "Hi team,\n\nThis week:\n\n- Landing zone node pools resized for Saturday (payments-api min replicas 12 → 18)\n- Image build times down from 14 to 6 minutes after Owen's layer caching change\n- prod-east control plane upgrade finished (thanks Lena)\n- Two pages this week, both for cert-manager renewals, ticket RUN-882 to fix\n\nNext week: cutover support, then a quieter week to pay down toil.\n\nMei",
      },
      {
        from: "lena", d: 0, t: "08:40",
        text: "Small correction: min replicas went to 16, not 18 — we capped it because of the egress NAT port budget. Ravi has the math.\n\nLena",
      },
    ],
  },
  {
    key: "r-fyi-k8s-upgrade",
    subject: "prod-east cluster upgrade complete",
    unread: 0,
    messages: [
      {
        from: "lena", d: 3, t: "07:55", to: ["ines"], cc: ["me", "mei"],
        text: "Hi Inês,\n\nprod-east control plane is upgraded and all node pools have rolled. Two workloads had PodDisruptionBudgets that blocked draining (search-indexer and notif-worker); I relaxed them temporarily and filed tickets with the owning teams.\n\nNo customer impact. You can lift the change freeze for prod-east.\n\nLena",
      },
      {
        from: "ines", d: 3, t: "09:10",
        text: "Thanks Lena, freeze lifted. Nice work.\n\nInês",
      },
    ],
  },
  {
    key: "r-fyi-fabrikam-lag",
    subject: "Fabrikam ingestion delay – resolved",
    labels: ["Vendors", "Incidents"],
    unread: 1,
    messages: [
      {
        from: "arjun", d: 5, t: "06:40", to: ["priya"], cc: ["me", "yuki"],
        text: "Hello Priya,\n\nBetween 03:10 and 05:55 UTC, metrics ingestion in the us-central region was delayed by up to 18 minutes. Alerts evaluated on delayed data during that window. The issue was a stuck partition rebalance on our side and has been resolved; no data was lost.\n\nRegards,\nArjun",
      },
      {
        from: "priya", d: 5, t: "08:15",
        text: "Thanks Arjun. Confirmed our alerts have recovered. Please send an RCA — we had two late pages during that window and I want to understand whether this can happen during our cutover on Saturday.\n\nPriya",
      },
      {
        from: "yuki", d: 2, t: "16:00",
        attach: ["Fabrikam_RCA_Ingestion_Delay.pdf"],
        text: "Hi Priya,\n\nRCA attached. We've added monitoring on rebalance duration and frozen partition changes in us-central for your cutover window.\n\nBest regards,\nYuki",
      },
    ],
  },
  {
    key: "r-fyi-saved-cards",
    subject: "Launch notes: saved cards v2 at 100%",
    unread: 1,
    messages: [
      {
        from: "tom", d: 2, t: "15:30", to: ["ben", "aisha", "zoe"], cc: ["me", "marcus"],
        attach: ["SavedCards_v2_LaunchNotes.pdf"],
        text: "Hi all,\n\nSaved cards v2 is at 100% as of this afternoon. Headlines:\n\n- Checkout conversion for returning customers +2.3%\n- Tokenization errors down from 0.4% to 0.05%\n- p95 checkout latency unchanged\n\nThanks to Aisha and the payments team, and to Platform for the extra headroom on payments-api. Full notes attached.\n\nTom",
      },
      {
        from: "ben", d: 2, t: "16:10",
        text: "Great work everyone. Special shout-out to Aisha for the token migration script — zero manual fixes.\n\nBen",
      },
      {
        from: "zoe", d: 1, t: "10:00",
        text: "Support macros are updated and the help-center article goes live tomorrow morning.\n\nZoe",
      },
    ],
  },
  {
    key: "r-fyi-backfill",
    subject: "Events backfill finished",
    unread: 0,
    messages: [
      {
        from: "diego", d: 4, t: "18:20", to: ["ethan", "nora"], cc: ["me"],
        text: "Hi both,\n\nThe events backfill into the warehouse finished: 1.9B rows, reconciliation diff 0.002% (all in one partition from the DAL1 log rotation gap). Ethan, can you re-run that partition tomorrow?\n\nDiego",
      },
      {
        from: "ethan", d: 4, t: "19:05",
        text: "Will do first thing. Should take about an hour.\n\nEthan",
      },
    ],
  },
  {
    key: "r-fyi-devex-survey",
    subject: "DevEx survey results",
    unread: 0,
    messages: [
      {
        from: "amelia", d: 6, t: "10:30", to: ["mei", "diego", "ben"], cc: ["me", "marcus"],
        attach: ["DevEx_Survey_Results.pdf"],
        text: "Hi all,\n\nResults are in (71% response rate). Top three pain points:\n\n1. CI wait times (median 22 minutes for the monorepo)\n2. Flaky integration tests\n3. Local environment setup for payments services\n\nSatisfaction with deploy tooling went up 14 points. Full report attached; team-level breakdowns are in the appendix.\n\nAmelia",
      },
      {
        from: "marcus", d: 5, t: "08:50",
        text: "Thanks Amelia. Let's spend 20 minutes on this in next week's staff meeting.\n\nM",
      },
    ],
  },
  {
    key: "r-fyi-phishing",
    subject: "Phishing simulation results – Engineering",
    unread: 1,
    messages: [
      {
        from: "rachel", d: 3, t: "13:00", to: ["mei", "diego", "ben", "amelia"], cc: ["me"],
        text: "Hi all,\n\nResults from last week's phishing simulation: Engineering click rate was 6.1%, down from 9.4%. Platform came in at 3%. Report rate (people who used the report button) was 41%.\n\nPlease remind your teams that reporting is the goal, not just not clicking.\n\nRachel",
      },
      {
        from: "kofi", d: 2, t: "09:20",
        text: "Small correction: report rate was 44% once we de-duplicated forwards to the security inbox.\n\nKofi",
      },
    ],
  },
  {
    key: "r-fyi-dup-charges",
    subject: "Escalation: duplicate charge reports",
    labels: ["Incidents"],
    unread: 0,
    messages: [
      {
        from: "zoe", d: 8, t: "11:40", to: ["ben"], cc: ["me", "tom"],
        text: "Hi Ben,\n\nWe've had 14 tickets since this morning about duplicate charges, all for orders that showed a timeout on the confirmation page. Customers are understandably upset. Can someone take a look?\n\nZoe",
      },
      {
        from: "ben", d: 8, t: "13:15",
        text: "Thanks Zoe. Found it: the retry path in payments-api wasn't reusing the idempotency key after a gateway timeout. Fix is in review now, and we're compiling the list of affected orders.\n\nBen",
      },
      {
        from: "aisha", d: 7, t: "10:30",
        text: "Fix deployed at 18:40 yesterday. 23 affected orders, all refunded this morning. Zoe, the list with order IDs is in the ticket for your macros.\n\nAisha",
      },
    ],
  },
  {
    key: "r-fyi-contoso-staffing",
    subject: "Contoso staffing – coverage next week",
    labels: ["Vendors"],
    unread: 2,
    messages: [
      {
        from: "fiona", d: 1, t: "15:10", to: ["grace"], cc: ["me", "kevin"],
        text: "Hi Grace,\n\nFor your planning: Bruno will be out Tuesday to Thursday next week. Daniel will cover his workstream, and Anika is backup for anything architecture-related. Bridge numbers and the escalation list are unchanged.\n\nBest,\nFiona",
      },
      {
        from: "grace", d: 0, t: "09:00",
        text: "Thanks Fiona — I've updated the RACI and the ledger rehearsal staffing. Nothing changes for the weekend.\n\nGrace",
      },
    ],
  },
  {
    key: "r-fyi-sre-pipeline",
    subject: "SRE hiring pipeline – weekly",
    labels: ["Hiring"],
    unread: 0,
    messages: [
      {
        from: "harper", d: 4, t: "09:30", to: ["elena"], cc: ["me", "mei"],
        text: "Hi Elena,\n\nPipeline this week for SRE roles: 46 applied, 9 recruiter screens, 4 hiring-manager screens, 3 onsites next week. We need panel slots for system design and incident response on Tuesday and Thursday.\n\nHarper",
      },
      {
        from: "elena", d: 4, t: "11:15",
        text: "Booked Bayview 4 for both days, and invites to the panelists are out.\n\nElena",
      },
    ],
  },

  // =========================================================================
  // DONE — resolved and archived
  // =========================================================================
  {
    key: "r-done-offsite",
    subject: "Platform offsite – room",
    inbox: false,
    unread: 0,
    messages: [
      {
        from: "maya", d: 13, t: "10:00", to: ["me"],
        text: "Hi Alex,\n\nBayview 6 is free on Wednesday or Thursday the week after next for your offsite. Which do you prefer?\n\nMaya",
      },
      {
        from: "me", d: 13, t: "10:20",
        text: "Thursday please — thanks Maya!\n\nAlex",
      },
      {
        from: "maya", d: 12, t: "09:00",
        attach: ["Platform_Offsite.ics"],
        text: "Booked 09:00–17:00 with lunch for 16. Invite attached.\n\nMaya",
      },
      {
        from: "me", d: 12, t: "09:15",
        text: "Perfect, thank you.\n\nAlex",
      },
    ],
  },
  {
    key: "r-done-receipt",
    subject: "Receipt: team dinner – Contoso workshop",
    labels: ["Receipts", "Finance"],
    inbox: false,
    unread: 0,
    messages: [
      {
        from: "me", d: 12, t: "21:30", to: ["malik"],
        attach: ["Receipt_TeamDinner.pdf"],
        text: "Hi Malik,\n\nReceipt for the team dinner after the Contoso workshop: $612.40 for 9 people. Cost center PLAT-200.\n\nAlex",
      },
      {
        from: "malik", d: 11, t: "09:40",
        text: "Coded, thanks Alex.\n\nMalik",
      },
    ],
  },
  {
    key: "r-done-1on1",
    subject: "Move our 1:1?",
    inbox: false,
    unread: 0,
    messages: [
      {
        from: "mei", d: 9, t: "08:10", to: ["me"],
        text: "Hi Alex, could we move Thursday's 1:1 to Friday 9:30? I have a vendor call that can't move.\n\nMei",
      },
      {
        from: "me", d: 9, t: "08:25", mobile: true,
        text: "Sure, done.",
      },
      {
        from: "mei", d: 9, t: "08:27",
        text: "Thanks!",
      },
    ],
  },
  {
    key: "r-done-pager-seats",
    subject: "Approval: 3 additional pager seats",
    labels: ["Finance"],
    inbox: false,
    unread: 0,
    messages: [
      {
        from: "olivia", d: 11, t: "14:00", to: ["me"],
        text: "Hi Alex,\n\nMei has requested 3 additional seats on the paging tool for the new secondary rotation: $1,080/year total. OK to approve?\n\nOlivia",
      },
      {
        from: "me", d: 11, t: "14:30",
        text: "Approved.\n\nAlex",
      },
      {
        from: "olivia", d: 10, t: "09:00",
        text: "Thanks — PO-30388 issued, seats will be active by end of day.\n\nOlivia",
      },
    ],
  },
  {
    key: "r-done-guest-wifi",
    subject: "Guest Wi-Fi and badges for Litware onsite",
    inbox: false,
    unread: 0,
    messages: [
      {
        from: "me", d: 10, t: "11:00", to: ["liam"], cc: ["kofi"],
        text: "Hi Liam,\n\nTwo consultants from Litware will be onsite next week for scoping (Hugo Lambert and Monica Reyes). Could you set up guest Wi-Fi and visitor badges for Monday to Wednesday? Kofi is their host.\n\nThanks,\nAlex",
      },
      {
        from: "liam", d: 10, t: "13:45",
        text: "Done. Badges will be at the front desk, Wi-Fi vouchers are in Kofi's inbox.\n\nLiam",
      },
      {
        from: "me", d: 10, t: "14:00",
        text: "Thanks Liam!",
      },
    ],
  },
  {
    key: "r-done-lunch-learn",
    subject: "Lunch & learn: Terraform module patterns",
    inbox: false,
    unread: 0,
    messages: [
      {
        from: "amelia", d: 8, t: "10:00", to: ["me"],
        text: "Hi Alex,\n\nWe're looking for a speaker for the next lunch & learn. Lena's Terraform module refactor came up a few times in the DevEx survey — would she be up for presenting?\n\nAmelia",
      },
      {
        from: "me", d: 8, t: "10:30", add: ["lena"],
        text: "Great idea. Adding Lena — Lena, interested?\n\nAlex",
      },
      {
        from: "lena", d: 7, t: "09:15",
        text: "Happy to! Thursday the week after cutover works best for me.\n\nLena",
      },
      {
        from: "amelia", d: 7, t: "09:40",
        text: "Booked — Bayview 3, 12:00–13:00. Thanks both!\n\nAmelia",
      },
    ],
  },
  {
    key: "r-done-weekend-thanks",
    subject: "Thank you for the weekend support",
    inbox: false,
    unread: 0,
    messages: [
      {
        from: "ben", d: 7, t: "09:00", to: ["me"], cc: ["priya", "jonah"],
        text: "Hi Alex,\n\nJust wanted to say thanks to Platform for jumping in on the duplicate charges fix over the weekend. Priya and Jonah turned around the payments-api hotfix rollout in under an hour. Much appreciated.\n\nBen",
      },
      {
        from: "me", d: 7, t: "10:15",
        text: "Thanks Ben, I'll pass it on — all credit to Priya and Jonah.\n\nAlex",
      },
    ],
  },
  {
    key: "r-done-interview-slot",
    subject: "Interview slot – Thursday 14:00",
    labels: ["Hiring"],
    inbox: false,
    unread: 0,
    messages: [
      {
        from: "elena", d: 6, t: "15:00", to: ["me"],
        text: "Hi Alex,\n\nCould you take the 14:00 system design slot on Thursday for the SRE onsite? Victor had to drop out.\n\nElena",
      },
      {
        from: "me", d: 6, t: "15:20",
        text: "Yes, I can do that.\n\nAlex",
      },
      {
        from: "elena", d: 6, t: "15:25",
        text: "Thanks! Invite sent with the candidate's packet.\n\nElena",
      },
    ],
  },
];

export const ARRIVALS: ArrivalScript[] = [
  {
    type: "reply", thread: "showcase", from: "grace",
    text: "Hi Alex,\n\nGentle nudge on the go/no-go sign-off — I need it by Thursday EOD so I can send the final comms to support and the customer status page team on Friday morning. If there's anything still blocking a yes, tell me and I'll chase it today.\n\nGrace",
  },
  {
    type: "new", subject: "Quick one: Owen's conference travel", from: "mei", to: ["me"], cc: ["owen"],
    text: "Hi Alex,\n\nOwen's talk on build caching got accepted at a regional DevOps conference next month. Travel plus registration is about $1,450, which is over my approval limit. Could you approve it in the travel tool? He's already done the internal talk review with Amelia.\n\nMei",
  },
  {
    type: "reply", thread: "showcase", from: "priya",
    text: "All,\n\nFinal validation dashboards are live (thanks Steve and Yuki):\n\n- Cutover overview: error rate, p95/p99 latency, saturation for payments-api and auth-gateway, side by side DAL1 vs landing zone\n- Rollback criteria panel: each criterion from the plan with its threshold and a green/red state\n- Adatum egress panel: per-NAT-IP success rate\n\nLinks are pinned in the cutover channel. I'll run a dry walkthrough on the bridge on Friday at 15:00.\n\nPriya",
  },
  {
    type: "new", subject: "Heads-up: elevated 5xx on auth-gateway canary", from: "paul", to: ["me"], cc: ["priya", "noah"],
    text: "Alex,\n\nFYI: the auth-gateway canary in the landing zone is throwing ~0.8% 5xx since 13:20, all token refresh calls. Looks like a clock skew issue on two nodes (NTP pointing at the old DAL1 servers). Draining those nodes now, no customer traffic on the canary.\n\nWill confirm once it's clean. Doesn't block Saturday as far as I can tell, but you'll want to know before the go/no-go.\n\n- Paul",
  },
  {
    type: "reply", thread: "r-po-loadtest", from: "owen",
    attach: ["Quote_LoadTest_Reserved_5wk.pdf"],
    text: "Hi Alex,\n\nIn case it helps: we can do the soak test in five weeks instead of six. Updated quote attached at $15,300. Still needs your approval, but it's a bit easier to justify.\n\nOwen",
  },
  {
    type: "reply", thread: "showcase", from: "carlos",
    text: "Hi Alex,\n\nFollowing up on the egress NAT ranges: our CAB slots for this week are filling up and the last one that lands before your Saturday window is Thursday at 11:00 our time. I need the final ranges confirmed by Wednesday EOD to get the allowlist change on that agenda.\n\nCan you confirm the four /28s in Bruno's last message are final?\n\nCarlos",
  },
  {
    type: "new", subject: "Litware recon: publicly resolvable staging admin host", from: "hugo", to: ["me"], cc: ["kofi", "monica"],
    text: "Hi Alex,\n\nDuring pre-engagement reconnaissance we noticed staging-admin.northwind.example resolves publicly and serves a login page. We have not attempted to authenticate.\n\nWould you like us to include it in scope for the test, or would you prefer to take it offline first? Either is fine — we just need a decision before we finalise the rules of engagement.\n\nBest,\nHugo",
  },
  {
    type: "new", subject: "Renata 1:1 – move to Friday?", from: "maya", to: ["me"],
    text: "Hi Alex,\n\nRenata has a board prep session that landed on your Thursday 1:1. Could we move it to Friday 08:30, or Monday 16:00 if Friday is too close to the cutover?\n\nMaya",
  },
  {
    type: "reply", thread: "showcase", from: "kevin",
    text: "Hi all,\n\nConfirming bridge details for Saturday:\n\n- Bridge opens 21:15, cutover starts 22:00 sharp\n- Contoso on the bridge: Anika (lead), Bruno, Daniel; Fiona running the timeline\n- Go/no-go checkpoints at 21:45, 00:30 and 02:30\n\nThe dial-in is unchanged from the rehearsal. Fiona will send the calendar update this afternoon.\n\nRegards,\nKevin",
  },
  {
    type: "new", subject: "Board pre-read: one paragraph on cutover risk", from: "marcus", to: ["me"],
    text: "Alex,\n\nRenata wants a short paragraph in the board pre-read on the migration: where we are, the main risk this weekend, and what rollback looks like. Three or four sentences, no jargon. Can you send me something by tomorrow noon?\n\nThanks,\nMarcus",
  },
  {
    type: "reply", thread: "r-infrasummit-talk", from: "omar",
    text: "Hi Alex,\n\nQuick follow-up: I'm holding the day-two afternoon slot for you and Priya for now, since it's the one people ask about most. Let me know if you'd rather have day one.\n\nOmar",
  },
  {
    type: "new", subject: "Support staffing for the Saturday cutover", from: "zoe", to: ["me"], cc: ["ben", "grace"],
    text: "Hi Alex,\n\nFor Saturday night we'll have two support agents on shift from 21:00 to 05:00 with the status page macros ready. Is there anything specific you'd like them to watch for, beyond login failures and declined payments? And who should they escalate to — the bridge directly, or Ben?\n\nZoe",
  },
  {
    type: "new", subject: "Could you sponsor RFC-121?", from: "noah", to: ["me"],
    text: "Hi Alex,\n\nI'm writing up RFC-121 on moving auth-gateway session storage off the shared Redis cluster after the cutover. It needs a director sponsor to get on the architecture forum agenda. Would you be willing to sponsor it? Happy to walk you through the draft in 20 minutes whenever suits.\n\nNoah",
  },
];

export const AUTO_REPLIES: string[] = [
  "Thanks Alex — got it. I'll take a look this afternoon and come back to you with numbers.",
  "Will do. Looping in Fiona so she can get it on the calendar.",
  "Makes sense. I'll update the doc and send a new version tomorrow morning.",
  "Thanks for the quick reply. That unblocks us — I'll let the team know.",
  "Understood. I'll check with my team and confirm by end of day.",
  "Sounds good to me. I'll set up 30 minutes later this week to go through it.",
  "Got it, thanks. I'll make sure that's reflected in the next update.",
  "Thanks — I'll pass this on and get back to you once I hear from them.",
  "Appreciate it. I'll draft something and share it with you before it goes out.",
  "Perfect, that's exactly what I needed.",
  "Thanks Alex. One small follow-up question, but I'll raise it in our next 1:1 rather than over email.",
  "Noted. I'll hold off until we've talked it through on Thursday.",
  "Thanks, I've added it to the tracker so it doesn't get lost.",
  "Great — I'll get the paperwork started today.",
  "Understood, I'll make that change and re-share the link.",
  "Thanks for the context, that helps a lot. I'll come back with a proposal early next week.",
  "On it. Should have an answer for you by tomorrow.",
  "Thanks — agreed on all points. I'll confirm with the others and close the loop here.",
  "Got it. I'm out tomorrow, but Sam is covering and has the details.",
  "Thank you! I'll send over the updated numbers as soon as finance signs off.",
  "Makes sense. I'll book a slot with the team and report back after.",
];

// ===========================================================================
// topics
// ===========================================================================


export const SLOTS: Record<string, string[]> = {
  project: ["Atlas", "Harbor", "Beacon", "Meridian", "Keystone", "Lantern", "Tidewater", "Compass", "Granite", "Northstar", "Juniper", "Halyard", "Cobalt", "Driftwood"],
  service: ["ledger-api", "auth-gateway", "notification-svc", "search-indexer", "billing-worker", "profile-svc", "events-ingest", "report-builder", "checkout-api", "media-resizer", "feature-flags", "session-store", "webhook-relay", "audit-log"],
  team: ["Platform Runtime", "Data Platform", "Payments", "Identity", "Developer Experience", "Mobile", "Growth", "Search", "Core API", "Observability", "Network", "Enterprise Apps"],
  quarter: ["Q1", "Q2", "Q3", "Q4", "H1", "H2"],
  weekday: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday"],
  num: ["4127", "3862", "5519", "20431", "7704", "1188", "6250", "31907", "9043", "2716", "8835", "4472", "15260", "6081", "11394"],
  room: ["Bayview 4", "Harbor 2", "Redwood", "Pier 7", "Summit", "Foundry", "Cascade 3", "Atrium", "Granary", "Boathouse", "Driftwood 1", "Mezzanine"],
  amount: ["$12,400", "$8,750", "$46,000", "$3,200", "$27,900", "$118,000", "$5,640", "$64,300", "$19,850", "$2,480", "$91,200", "$33,600"],
  tool: ["Forge CI", "the deploy bot", "Keel", "Ferry", "the access portal", "Pagerline", "Stackwatch", "the cost explorer", "Tracer", "Runbook Hub", "the release train bot", "Gatekeeper"],
  region: ["us-central", "us-east", "us-west", "eu-west", "eu-central", "ap-southeast", "ap-northeast", "ca-east", "sa-east", "uk-south"],
  env: ["staging", "prod", "perf", "dev", "sandbox", "canary", "prod-eu", "qa", "preprod", "load-test"],
};

export const TOPICS: TopicBank[] = [
  {
    key: "capacity-planning",
    subjects: [
      "{quarter} capacity plan for {service}",
      "Capacity forecast: {region} cluster headroom",
      "Node pool sizing for {project}",
      "Headroom review ahead of the {project} launch",
      "Storage growth on {service} is ahead of plan",
      "{team} capacity request for {quarter}",
      "Reserved capacity renewal in {region}",
    ],
    starter: "staff",
    people: ["priya", "jonah", "mei", "felix", "lena", "diego", "grace", "nora"],
    openers: [
      "I finished the {quarter} capacity model for {service}. At current growth we hit 80% CPU on the {region} node pool in roughly seven weeks, which is earlier than we assumed in planning. The spreadsheet is linked in ticket PLAT-{num}.",
      "The {team} team expects traffic on {service} to roughly double once {project} goes live. I ran the numbers against our current {env} footprint and we would need about 40 more vCPUs and another two database replicas to keep p99 latency under target.",
      "Heads up that disk usage on the {service} cluster grew 18% in the last month, mostly from retained event payloads. If the trend holds we run out of headroom in {region} before the end of {quarter}.",
      "I pulled together the headroom numbers for every production cluster. Most are fine, but {region} is sitting at 71% memory at peak and the autoscaler is already hitting its max node count on busy afternoons.",
      "We have the reserved capacity commitment in {region} coming up for renewal. Usage has been steady at about 85% of the reservation, so I would suggest renewing at the same level rather than growing it.",
      "Load tests against {env} for {project} came back this morning. We sustained 3x current peak with no errors, but the connection pool on {service} saturated at about 3.4x, so that is our real ceiling.",
      "I am putting together the capacity section for the {quarter} planning doc. The short version: compute is fine, storage is tight, and we should plan a second Kafka cluster rather than keep scaling the existing one vertically.",
    ],
    asks: [
      "Could you sign off on the extra node pool by {weekday} so we can get it provisioned before the launch freeze?",
      "Can you confirm whether {project} is still on track for the current launch window? That changes how aggressive we need to be.",
      "Would you be OK with us raising the autoscaler ceiling in {region} from 60 to 90 nodes?",
      "Do you want this in the {quarter} planning review, or should I just handle it inside the existing budget?",
      "Could you take a look at the model before {weekday} and tell me if the growth assumptions look right to you?",
      "Should we renew the reservation at the same level, or do you want to hold off until the cost review lands?",
    ],
    replies: [
      "I double-checked the growth rate against the last two quarters and it lines up. If anything the model is a bit conservative.",
      "One thing to factor in: the {team} team is planning a batch backfill on {service} that will run for about a week. That is not in the baseline numbers.",
      "From the database side we can absorb maybe 30% more write load before we need to shard. Beyond that we need a plan, not just bigger instances.",
      "I can have the new node pool up in {env} today and in prod within 48 hours of approval. Terraform changes are already drafted in PLAT-{num}.",
      "We could buy ourselves a few weeks by tightening the retention on event payloads from 30 days to 14. Nobody has queried anything older than ten days in the last quarter.",
      "Finance will want to see this as a line item rather than absorbed. Happy to pull the cost estimate together, it is roughly {amount} per month at list price.",
      "I reran the load test with the pool size bumped and we got to about 4.1x before latency degraded. That seems like enough margin through {quarter}.",
      "The autoscaler change is low risk on its own, but we should make sure the cluster IP range can actually fit 90 nodes. I will confirm with Tariq.",
      "Added the forecast chart to the planning doc. The inflection point is pretty clear once you plot the weekly peaks instead of the averages.",
    ],
    myReplies: [
      "Approved. Go ahead with the extra node pool and send me the final monthly cost once it is running.",
      "Let's do the retention change first. If that buys us at least a month, we push the hardware ask into {quarter} planning where it belongs.",
      "Thanks, this is a clear write-up. Please add it to the planning doc and flag the {region} risk at the top.",
      "I would rather not raise the ceiling without the IP range check. Confirm that and then go ahead.",
      "Renew at the current level. We can revisit once the cost review is done.",
      "Good catch on the backfill. Please coordinate with {team} so it does not overlap with the launch week.",
      "I agree with the second Kafka cluster. Can you and Diego write up a one-pager so I can take it to Marcus?",
    ],
    closers: [
      "Thanks, I will get the change request filed today.",
      "Sounds good. I will report back once the new pool is live.",
      "Great, added to the planning doc and flagged the risk.",
      "Perfect, that unblocks us. Will share the final numbers by {weekday}.",
      "Thanks Alex, I will loop in Finance on the cost side.",
    ],
  },
  {
    key: "cloud-cost",
    subjects: [
      "Cloud bill anomaly: {service} egress up sharply",
      "Cost review: {team} spend this month",
      "Unexpected {amount} charge in {region}",
      "Savings opportunities for {quarter}",
      "Untagged resources in the {env} account",
      "Idle instances flagged by {tool}",
      "Storage costs on {project} buckets",
    ],
    starter: "colleague",
    people: ["malik", "helen", "priya", "felix", "lena", "diego", "owen"],
    openers: [
      "The cost dashboard flagged a spike on {service} last week: egress in {region} is up about {amount} versus the trailing average. It looks like it started after the last deploy, but I have not confirmed the cause yet.",
      "I went through this month's bill by team. {team} is running about 22% over forecast, almost entirely from GPU instances in {env} that have been up continuously for three weeks.",
      "The idle-resource report from {tool} flagged 34 instances in the {env} account with under 5% CPU over the last 14 days. Together they cost roughly {amount} per month. Most are tagged to the {project} effort, which I believe wrapped up.",
      "We have about 11% of spend in the {env} account with no owner tag. I can chase individual teams, but it would be faster if we enforced tagging at provision time.",
      "Snapshot storage on the {project} buckets has crept up to {amount} a month. The lifecycle policy was never applied after the migration, so we are keeping every snapshot indefinitely.",
      "I put together a list of savings opportunities for {quarter}. The three biggest are rightsizing the {service} database, moving cold logs to archive storage, and committing to another year of reserved capacity in {region}.",
      "Cross-region data transfer between {region} and our primary region doubled after the {service} rollout. If that traffic is expected we should budget for it; if not, something is chattier than it should be.",
    ],
    asks: [
      "Can you confirm whether the {project} instances can be shut down, or is someone still using them?",
      "Would you be OK with us enforcing owner tags in Terraform starting {weekday}?",
      "Could you approve the reserved capacity commitment by {weekday}? The pricing quote expires end of week.",
      "Do you want me to raise this with the {team} manager directly, or would you rather handle it?",
      "Can you confirm the egress increase on {service} is expected before I mark the anomaly as resolved?",
      "Should we take the rightsizing work into {quarter} planning, or is this something the team can absorb now?",
    ],
    replies: [
      "Found it. The new version of {service} disabled response compression by accident, so payloads are about four times larger. Fix is in review as PLAT-{num}.",
      "The GPU instances were for a model evaluation that finished. I have already scaled them down and confirmed with the team.",
      "Tag enforcement is easy to add in the base module, but it will break a few older stacks. I would suggest a warning period of two weeks first.",
      "I ran the rightsizing analysis on {service}. We can drop two instance sizes on the replicas without touching the primary, saving about {amount} per month.",
      "Archive storage would cut log costs by roughly 70%, but retrieval takes hours. We should check with Security that this still meets the audit retention requirements.",
      "Most of the cross-region traffic is replication for the read replicas. We could move the replica into the same region and save most of it.",
      "Finance would like a monthly summary of anomalies and what we did about them. I can generate that from {tool} if you think it is useful.",
      "The snapshot cleanup is scheduled for {weekday} night. I will keep the last 30 days and anything tagged as legal hold.",
      "For context, the reserved commitment pays back in about five months at current usage. After that it is pure savings.",
    ],
    myReplies: [
      "Shut them down. If anyone complains, point them at me.",
      "Approve the reservation. Please send the final quote to Malik so it lands in the right cost center.",
      "Two-week warning period on tags is fine, then enforce. Announce it in the platform channel.",
      "Good find on the compression bug. Let's add a cost check to the deploy pipeline so we catch this kind of thing before the bill does.",
      "Let's take the rightsizing now. It is a few hours of work for a meaningful monthly saving.",
      "Please check retention with Rachel's team before moving anything to archive.",
      "Yes, send me the monthly summary. Keep it short: top five anomalies, owner, and status.",
    ],
    closers: [
      "Thanks, I will close out the anomaly once the fix is deployed.",
      "Done. The idle instances are stopped and will be deleted after a week.",
      "Great, I have sent the quote to Finance.",
      "Sounds good, I will post the tagging announcement today.",
      "Thanks Alex, I will track the savings in next month's review.",
    ],
  },
  {
    key: "oncall-load",
    subjects: [
      "Pager load for {team} is getting unsustainable",
      "On-call rotation changes for {quarter}",
      "Weekly on-call handoff: {service} noise",
      "Proposal: follow-the-sun coverage with {region}",
      "Noisy alerts in {tool}",
      "On-call compensation question",
      "Swapping my on-call shift next {weekday}",
    ],
    starter: "staff",
    people: ["jonah", "sam", "paul", "felix", "priya", "mei", "lena"],
    openers: [
      "Last week's primary on-call got paged 41 times, and 29 of those were the same disk-pressure alert on {service}. Nobody slept through a night. I think we need to fix the alert threshold before we do anything else.",
      "I pulled the pager data for the last quarter. {team} averages 3.2 out-of-hours pages per shift, which is well above the target of one. Most of it comes from three alerts that are not actionable.",
      "With two people leaving the rotation, we are down to five engineers on primary. That means everyone is on call every five weeks, which is more than we agreed when we set the rotation up.",
      "I would like to propose moving to follow-the-sun coverage with the {region} team taking the overnight window. They have offered, and it would remove most of our night pages.",
      "Handoff summary: quiet week overall, but {service} paged four times for connection resets in {env}. I opened PLAT-{num} with what I found; it looks like a keepalive mismatch on the load balancer.",
      "I went through every alert in {tool} that fired in the last 30 days. About a third have no runbook link and a quarter were acknowledged and closed without any action. I have a proposal for which ones to delete.",
    ],
    asks: [
      "Would you be OK with us deleting the alerts on the attached list without a further review?",
      "Can you confirm whether we can bring two engineers from {team} into the rotation for {quarter}?",
      "Could you raise the on-call stipend question with HR before the next planning cycle?",
      "Can you approve the follow-the-sun pilot starting {weekday} so I can update the schedule?",
      "Do you want to review the new escalation policy before it goes live, or should I just ship it?",
    ],
    replies: [
      "I support the alert cleanup. Half of those were set up for a system we decommissioned months ago.",
      "The {region} team is keen on the overnight window, but they will need a proper handover doc and access to the {env} consoles first.",
      "I raised the disk alert threshold from 80% to 90% and added a rate-of-change condition. It has not fired since.",
      "We could also make the secondary on-call responsible for triaging low-severity pages during the day. That would take load off primary.",
      "Swapped my shift with Sam for next week. Pagerline is updated.",
      "I checked with HR informally and the stipend has not been reviewed in two years. They suggested we bring a proposal with market data.",
      "The keepalive fix for {service} is deployed to {env}. I will watch it for a few days before promoting.",
      "For what it is worth, the page count last week dropped to 9 after the cleanup, and only two were outside working hours.",
    ],
    myReplies: [
      "Delete them. If an alert has no runbook and no one acted on it in a month, it is not an alert.",
      "Approved for the follow-the-sun pilot. Let's run it for six weeks and review pager data before making it permanent.",
      "I will take the stipend question to Sofia this week. Please send me the market data you have.",
      "Five weeks is too frequent. I will ask Mei whether two people from {team} can join for {quarter}.",
      "Thanks for the clear handoff. Good find on the keepalive issue.",
      "Ship the escalation policy. Send me a link once it is live so I can sanity-check it.",
      "This is a big improvement. Please share the before and after numbers in the next platform review.",
    ],
    closers: [
      "Thanks, alerts are deleted and the runbooks are updated.",
      "Great, I will update the rotation in Pagerline today.",
      "Sounds good, will report back after six weeks.",
      "Thanks Alex, I sent the market data over.",
      "Perfect, that should make next quarter a lot calmer.",
    ],
  },
  {
    key: "access-requests",
    subjects: [
      "Access request: {env} database read access",
      "Approval needed: admin role on {service}",
      "Break-glass access used on {service}",
      "Quarterly access review for {team}",
      "Request for production console access in {region}",
      "Removing stale permissions from {tool}",
    ],
    starter: "colleague",
    people: ["liam", "kofi", "noah", "owen", "ethan", "ravi", "hana", "rachel"],
    openers: [
      "I need read access to the {service} replica in {env} to debug a reporting discrepancy. The request is in the access portal as ticket ACC-{num} and needs director approval because it touches customer data.",
      "The quarterly access review for {team} is ready. There are 63 grants to review, and 9 belong to people who have changed teams or left. I have pre-marked those for removal.",
      "Someone used break-glass access on {service} in prod last night. The session was 14 minutes and the reason given was a stuck migration. I am following up per policy and need the approving manager to confirm it was legitimate.",
      "We are onboarding a contractor for the {project} work who needs deploy permissions in {env} only. I set up a scoped role that expires in 90 days, but it needs your sign-off.",
      "I am requesting temporary admin on the {service} cluster for the duration of the {project} migration, roughly two weeks. I will drop back to my normal role once the cutover is done.",
      "The latest export from {tool} shows 140 accounts that have not logged in for more than 90 days. Policy says we disable them, but a few look like service accounts that might still be in use.",
    ],
    asks: [
      "Could you approve ACC-{num} in the access portal by end of day?",
      "Can you confirm whether the break-glass use last night was expected?",
      "Would you be OK with the contractor role being scoped to {env} only, with no prod access at all?",
      "Can you complete your section of the access review by {weekday}? Audit needs it before the end of the quarter.",
      "Should we disable the inactive service accounts now, or give owners a week to object?",
      "Can you confirm who should own the {service} admin group going forward?",
    ],
    replies: [
      "Approved in the portal. The grant is time-boxed to 30 days.",
      "The break-glass session was me, sorry for not posting in the channel first. The migration lock on {service} was stuck and blocking a deploy.",
      "Removed the nine stale grants. Two others are borderline, so I left a comment asking their managers.",
      "We should really move {service} to just-in-time access. Standing admin grants are the main finding in every audit.",
      "I checked the service accounts. Six are still used by nightly jobs; the rest can go.",
      "The scoped role is live. I tested it and the contractor can deploy to {env} but gets denied on prod, which is what we want.",
      "For the review, I am happy to keep my admin role but would like it converted to an on-demand grant.",
      "Audit asked whether we have evidence of the review being completed. Screenshots from the portal should be enough.",
    ],
    myReplies: [
      "Approved. Please make sure it expires automatically rather than relying on someone to remove it.",
      "Thanks for flagging. Next time post in the incident channel before using break-glass so there is a record.",
      "I have finished my section of the review. Removed four grants that no longer make sense.",
      "Give owners a week to object, then disable. Announce it in the engineering channel today.",
      "Agree on just-in-time access. Let's put it on the {quarter} roadmap for {service} and the main databases.",
      "Scoping it to {env} only is right for the contractor. No prod access without a separate request.",
    ],
    closers: [
      "Thanks, access granted and logged.",
      "Great, I have marked the review complete.",
      "Understood, will post in the channel first next time.",
      "Done, the announcement is out and the disable job is scheduled.",
      "Thanks Alex, closing the ticket.",
    ],
  },
  {
    key: "soc2-evidence",
    subjects: [
      "SOC 2 evidence request: change management samples",
      "Audit fieldwork: {num} evidence items outstanding",
      "SOC 2 control owner check-in for {quarter}",
      "Evidence needed: backup restore test for {service}",
      "Auditor follow-up on access reviews",
      "Updated control narrative for deploy approvals",
    ],
    starter: "colleague",
    people: ["rachel", "kofi", "tess", "hugo", "grace", "ines", "chris"],
    openers: [
      "The auditors sent the sample list for change management. They picked 25 production changes from the period, and for each one we need the ticket, the approval, and the deploy log. Most of it should be in {tool}.",
      "We have 17 evidence items still open for the SOC 2 fieldwork, and 6 of them are assigned to Platform. The auditors want everything uploaded before {weekday} so they can finish testing on schedule.",
      "As control owner for infrastructure changes, you are on the hook for the deploy approval narrative. The current version still describes the old pipeline, so it needs a refresh before the auditors read it.",
      "The auditors asked for evidence that we tested a backup restore for {service} during the period. I know we did one, but I cannot find the write-up anywhere.",
      "Quick check-in ahead of {quarter} fieldwork. The controls that tripped us up last year were access reviews and vulnerability remediation timelines, so I would like to make sure both are clean this time.",
      "The auditors flagged two changes in the sample that were deployed before approval. Both look like hotfixes during incidents, which our policy allows, but we need to show the after-the-fact approval.",
    ],
    asks: [
      "Can you confirm who on your team owns the backup restore evidence?",
      "Could you review the updated deploy approval narrative by {weekday}?",
      "Would you be OK with Priya being the primary contact for the auditors on infrastructure questions?",
      "Can you sign the management assertion letter once Legal has reviewed it?",
      "Could you confirm the two hotfixes were approved retroactively, and point me at where that is recorded?",
    ],
    replies: [
      "I exported the deploy logs for all 25 samples from {tool}. They are in the shared evidence folder, numbered to match the auditor's list.",
      "The restore test was done in {env} by Nora's team. The write-up is in the runbook repo rather than the wiki, which is why nobody could find it.",
      "Both hotfixes have incident tickets with post-hoc approval comments. I will screenshot them with timestamps.",
      "I updated the narrative to describe the current pipeline, including the two-person review on prod deploys. Tracked changes are on so you can see what moved.",
      "Last year's finding on vulnerability timelines is now covered by the weekly report from the scanner. We have been within SLA for the whole period.",
      "The auditors asked a follow-up on how we handle emergency access. I pointed them at the break-glass procedure and the logs.",
      "I have uploaded four of our six items. The remaining two depend on the access review export, which should be ready tomorrow.",
      "Legal reviewed the assertion letter and had no changes.",
    ],
    myReplies: [
      "Priya is a good primary contact. I will stay in the loop for anything that needs a management answer.",
      "Reviewed the narrative. Two small comments, otherwise it is ready to go.",
      "Nora's team owns the restore evidence. Please move the write-up into the evidence folder and link it from the wiki too.",
      "Signed and returned. Let me know if the auditors need anything else from me.",
      "Thanks for staying on top of this. Let's make sure we close the open items before {weekday}.",
      "Yes, both hotfixes were approved after the fact. The approvals are in the incident tickets.",
    ],
    closers: [
      "Thanks, all six items are uploaded now.",
      "Great, I will let the auditors know.",
      "Perfect, that closes out our part of fieldwork.",
      "Thanks Alex, the narrative is submitted.",
      "Appreciate the quick turnaround on this.",
    ],
  },
  {
    key: "vendor-questionnaire",
    subjects: [
      "Security questionnaire for Fabrikam renewal",
      "Vendor risk review: Adatum data processing addendum",
      "Questionnaire responses due {weekday}",
      "Follow-up questions on the Contoso security review",
      "Third-party risk assessment for {project}",
      "Pen test summary request from Litware",
    ],
    starter: "colleague",
    people: ["kofi", "rachel", "olivia", "chris", "noah", "tess", "hugo"],
    openers: [
      "Fabrikam's renewal is blocked on our vendor risk review. Their questionnaire responses came back with gaps around encryption key management and subprocessor lists, so I need someone from Platform to look at the technical answers.",
      "Procurement sent over the third-party risk assessment for the {project} vendor. It is 180 questions, but only about 30 touch infrastructure. I have highlighted those in the shared copy.",
      "Adatum asked for an updated data processing addendum before they will sign. Their security team also wants to know which regions our data is stored in and whether {region} is in scope.",
      "Contoso replied to our follow-up questions. Their answers on incident notification timelines are vague, and they still have not sent the pen test summary we asked for two weeks ago.",
      "We received a questionnaire from a customer that asks detailed questions about our hosting setup, backups, and disaster recovery. Most of the answers are in the trust portal, but some need fresh numbers.",
      "The Litware team finished their review of our vendor inventory. They flagged three vendors with expired security attestations and one with no attestation on file at all.",
    ],
    asks: [
      "Could you review the infrastructure answers by {weekday} so we can send the questionnaire back?",
      "Can you confirm whether {region} data is in scope for the Adatum addendum?",
      "Would you be OK with us accepting Fabrikam's answers with a follow-up item rather than blocking the renewal?",
      "Can you confirm our current RTO and RPO numbers for {service} so I can quote them accurately?",
      "Should we escalate the missing pen test summary with Contoso's account team, or give them another week?",
    ],
    replies: [
      "I filled in the infrastructure section. A few answers changed since last year because we moved backups to a separate account.",
      "The encryption answers from Fabrikam are fine on closer reading. They use per-tenant keys; the questionnaire just asked it in a confusing way.",
      "Legal is comfortable with the addendum as long as we list our subprocessors explicitly. I have a draft ready.",
      "Contoso's account team says the pen test summary is with their legal team and should be released by {weekday}.",
      "I would treat the vendor with no attestation as high risk until they produce something. They have access to production logs.",
      "Our RTO for {service} is four hours and RPO is fifteen minutes, based on the last DR test.",
      "I added the questionnaire to the tracker so we can reuse the answers next time. We get roughly the same questions every quarter.",
      "Procurement would like a decision on Fabrikam this week if possible, since the current contract lapses soon.",
    ],
    myReplies: [
      "Accept Fabrikam's answers with a follow-up item. Blocking the renewal over wording is not worth it.",
      "Escalate with Contoso. Two weeks is long enough for a document they should already have.",
      "Reviewed the infrastructure answers. One correction on backup retention, otherwise good to send.",
      "Yes, {region} is in scope. Please make sure the addendum says so explicitly.",
      "Agree on treating the unattested vendor as high risk. Let's restrict their log access until they send something.",
      "Good idea on the answer library. Please share it with Rachel's team so they can use it too.",
    ],
    closers: [
      "Thanks, questionnaire is sent back.",
      "Great, I will let Procurement know we are unblocked.",
      "Done, escalation sent to their account team.",
      "Thanks Alex, I updated the tracker.",
      "Appreciate it. I will close the review once the follow-ups land.",
    ],
    labels: ["Vendors"],
  },
  {
    key: "travel-approval",
    subjects: [
      "Travel approval: InfraSummit speaker trip",
      "Conference budget request for {quarter}",
      "Approval needed: team trip to the {region} office",
      "Training course request for {team}",
      "Expense report pending your approval",
      "Talk submission and travel for the platform conference",
    ],
    starter: "staff",
    people: ["priya", "lena", "owen", "sam", "mei", "amelia", "malik", "omar"],
    openers: [
      "My talk on progressive delivery was accepted at InfraSummit. The organizers cover the ticket, so the cost is flights and three nights of hotel, roughly {amount} in total. The request is in the travel tool as TRV-{num}.",
      "I would like to send three people from {team} to the platform engineering conference this quarter. With early-bird tickets and shared hotel rooms, the total comes to about {amount}.",
      "The {region} team asked if a couple of us could visit for a week to help them get up to speed on the {project} runbooks. I think it would pay for itself in reduced handoff friction.",
      "There is a three-day Kubernetes security course that would be useful for the on-call rotation. It is {amount} per seat and runs remotely, so no travel costs.",
      "My expense report from the last trip is waiting on your approval in the expense system. It is mostly hotel and a couple of team dinners.",
      "I have been asked to give a talk at a regional meetup about our Terraform module setup. It is a short train ride, so the cost is minimal, but I wanted to check you are OK with the content being public.",
    ],
    asks: [
      "Could you approve TRV-{num} by {weekday}? Fares go up after that.",
      "Would you be OK with all three attending, or should we limit it to two?",
      "Can you confirm whether there is still conference budget left for {quarter}?",
      "Could you approve the expense report when you have a moment?",
      "Can you confirm it is fine to share the module architecture publicly, minus anything sensitive?",
      "Would you be OK with two seats on the security course this quarter?",
    ],
    replies: [
      "I checked with Malik and we have about {amount} of conference budget left for the quarter.",
      "Happy to share the slides internally first so Security can review them before the talk.",
      "If we can only send two, I would prioritize the people who are new to the rotation.",
      "The hotel block from the organizers is already cheaper than our travel policy limit.",
      "We could combine the {region} visit with the offsite to save one set of flights.",
      "I booked through the travel tool so it should show up with the right cost center.",
      "The course provider offers a group discount for three or more seats, which brings it down quite a bit.",
      "One of the expense items was a team dinner over the per-person limit. I added a note explaining it was for the launch.",
    ],
    myReplies: [
      "Approved. Congratulations on the talk, that is great visibility for the team.",
      "All three can go. Please write up the key takeaways for the rest of the team afterwards.",
      "Approved the expense report. The dinner note is fine.",
      "Fine to share publicly. Run the slides past Kofi first.",
      "Let's do the {region} visit, and combine it with the offsite if the timing works.",
      "Book three seats on the course and use the group discount.",
    ],
    closers: [
      "Thanks, booking now.",
      "Great, I will send the takeaways when we are back.",
      "Thanks Alex, approval received.",
      "Perfect, I will send the slides to Kofi this week.",
      "Appreciate it, the team is excited.",
    ],
  },
  {
    key: "meeting-reschedule",
    subjects: [
      "Moving our 1:1 this week",
      "Reschedule: {project} architecture review",
      "Can we push the {team} sync to {weekday}?",
      "Conflict with the platform review",
      "Room change for {weekday}: {room}",
      "Skip-level meetings for {quarter}",
      "Calendar hold for the {project} kickoff",
    ],
    starter: "colleague",
    people: ["maya", "mei", "diego", "amelia", "grace", "priya", "victor", "marcus"],
    openers: [
      "Something came up on my side and I need to move our 1:1 this week. Would {weekday} afternoon work instead? I have a few things on hiring and the {project} timeline I would like to cover.",
      "The {project} architecture review clashes with the quarterly business review, which half the attendees also need to be at. I would like to move it to {weekday} and keep the same agenda.",
      "We lost {room} for the {team} sync because of facilities work. I have booked {room} instead, same time, and updated the invite.",
      "Renata would like to set up skip-level meetings with your team during {quarter}. I can schedule them if you send me a list of who should be included.",
      "I am putting a hold on calendars for the {project} kickoff. It will be a 90-minute session with {team} and Platform, ideally early next week.",
      "Several people have asked whether the weekly platform review could move to a slot that works better for the {region} folks. The current time is late evening for them.",
    ],
    asks: [
      "Does {weekday} at 2pm work for you instead?",
      "Can you confirm whether you need to attend the full architecture review or just the first half?",
      "Could you send me the list of people for skip-levels by {weekday}?",
      "Would you be OK with moving the platform review an hour earlier permanently?",
      "Can you confirm you are still OK to present at the kickoff?",
    ],
    replies: [
      "Updated the invite. The new time is on everyone's calendar.",
      "That slot works for me. I will move my other meeting.",
      "The earlier slot works for {region} and only conflicts with one recurring meeting, which can move.",
      "I am out that afternoon, but Victor can cover the architecture discussion.",
      "Booked {room} for the kickoff with video set up for the remote folks.",
      "I sent the skip-level invites. They are 30 minutes each, spread across two weeks.",
      "Let me know if we should push it again. I would rather reschedule than rush it.",
      "Agenda is in the invite, along with the pre-read.",
    ],
    myReplies: [
      "{weekday} works. Let's keep the same agenda.",
      "I will join the first half of the review. Please send me the decisions from the second half.",
      "Earlier slot is fine by me. Please make the change and announce it.",
      "Here is the skip-level list. Please include the two new hires.",
      "Yes, I am presenting. I will send slides the day before.",
      "Thanks for sorting out the room. See you there.",
    ],
    closers: [
      "Great, invite updated.",
      "Thanks, see you then.",
      "Perfect, all set.",
      "Sounds good, I have moved it.",
      "Thanks Alex, I will send the agenda shortly.",
    ],
  },
  {
    key: "okr-planning",
    subjects: [
      "{quarter} OKR draft for Platform",
      "OKR planning: input needed from {team}",
      "Reviewing {quarter} key results before the exec readout",
      "Platform OKR scoring for last quarter",
      "Alignment on reliability goals for {quarter}",
      "Proposed objective: reduce deploy lead time",
    ],
    starter: "exec",
    people: ["renata", "marcus", "grace", "mei", "diego", "amelia", "victor"],
    openers: [
      "The exec team wants draft {quarter} OKRs from every org by next week. For Platform I would like to see no more than three objectives, each with measurable key results tied to the company goals.",
      "I put together a first draft of the Platform OKRs for {quarter}. The objectives are reliability, developer velocity, and cost efficiency. Key results are in the doc, but some of the targets are placeholders.",
      "Scoring for last quarter is due. From what I can tell we landed the {project} migration and the availability target, but fell short on the cost reduction key result.",
      "{team} has a dependency on Platform for one of their {quarter} key results: they need the new queueing service in production by mid-quarter. I want to make sure that is reflected in your plan.",
      "The draft reliability objective says 99.95% availability for {service}. I am not sure that is achievable without the multi-region work, which is not funded yet.",
      "I would like to propose an objective around deploy lead time. Today the median is about two days from merge to prod; I think we can get it under four hours with the pipeline changes we already have in flight.",
    ],
    asks: [
      "Could you send me the Platform draft by {weekday} so I can roll it into the engineering doc?",
      "Can you confirm whether the queueing service commitment to {team} is realistic for {quarter}?",
      "Would you be OK with dropping the cost objective and folding it into the efficiency work?",
      "Can you score last quarter's key results before the exec readout on {weekday}?",
      "Do you want to present the Platform OKRs yourself, or should I cover them in the summary?",
      "Could you pick one key result that best represents developer velocity for the readout?",
    ],
    replies: [
      "I scored our key results. Two hit, one at 70%, and the cost one at 40%. Notes are in the doc.",
      "The queueing service is doable by mid-quarter if we do not take on the {project} work at the same time.",
      "For the availability target, 99.9% is realistic with what we have. 99.95% needs the second region.",
      "I would keep the cost objective but make it concrete: reduce cost per request on {service} by 15%.",
      "Lead time is a good metric because it is easy to measure from {tool} and everyone understands it.",
      "Marcus asked that each key result have a single owner, not a team. I updated the doc accordingly.",
      "I left comments on the draft. Mostly wording, plus one key result that I think is really a task.",
      "The exec readout is 20 minutes, so we should pick one highlight and one risk for Platform.",
    ],
    myReplies: [
      "Draft is in the doc. Three objectives, nine key results, each with an owner.",
      "Let's commit to 99.9% for {quarter} and make multi-region the stretch.",
      "The queueing service commitment is realistic. We will defer {project} by a few weeks to make room.",
      "I will present the Platform section myself. Highlight is the lead time work, risk is the second region.",
      "Agree with making the cost key result concrete. Cost per request is the right framing.",
      "Scored. We should be honest about the cost miss and explain what changed.",
    ],
    closers: [
      "Thanks, rolled into the engineering doc.",
      "Great, that works for the readout.",
      "Perfect, I will update the dependency tracker.",
      "Thanks Alex, looks good.",
      "Appreciate it. See you at the readout.",
    ],
  },
  {
    key: "k8s-upgrade",
    subjects: [
      "Kubernetes upgrade plan for {region} clusters",
      "Cluster upgrade: {env} done, prod next",
      "Deprecated APIs blocking the Kubernetes upgrade",
      "Node image rollout for {quarter}",
      "Upgrade window for the {service} cluster",
      "Kubernetes version support ending soon",
    ],
    starter: "staff",
    people: ["lena", "owen", "priya", "felix", "mei", "jonah", "ravi"],
    openers: [
      "The managed Kubernetes version we run in {region} goes out of support at the end of the quarter. I have a plan to upgrade {env} first, soak for a week, then roll prod one cluster at a time.",
      "The {env} cluster upgrade went through this morning with no issues. Control plane took about 20 minutes and the node pools rolled over two hours. I would like to schedule prod for next {weekday}.",
      "Running the deprecation scanner turned up 14 manifests still using removed API versions. Most belong to {team}, and a couple are in the {service} Helm chart. The upgrade is blocked until they are fixed.",
      "New node images are available with the kernel patches from last month. I would like to roll them out alongside the upgrade so we only drain nodes once.",
      "The {service} cluster is the last one on the old version. It is tricky because the workload is stateful and drains take a long time, so I would like a dedicated window with the owning team on hand.",
      "Heads up that the ingress controller we run needs a version bump before the cluster upgrade. That part is riskier than the upgrade itself, so I want to do it as a separate change.",
    ],
    asks: [
      "Can you approve the prod upgrade window on {weekday} evening?",
      "Could you nudge the {team} manager about the deprecated manifests? We have asked twice.",
      "Would you be OK with combining the node image rollout with the upgrade?",
      "Can you confirm we are fine to freeze deploys to {env} during the upgrade?",
      "Do you want a go/no-go call before prod, or is the written checklist enough?",
    ],
    replies: [
      "I fixed the {service} chart myself. It was just an API version bump plus a field rename.",
      "{team} says their manifests will be updated by {weekday}. They had a release going out and could not touch it sooner.",
      "Ingress controller upgrade is done in {env}. No changes in latency or error rates.",
      "PodDisruptionBudgets were too strict on two workloads, which stalled the drain. I relaxed them temporarily.",
      "Prod cluster one is done. Two to go, both scheduled for this week.",
      "We should add the deprecation scanner to CI so we do not end up in this spot next time.",
      "The upgrade runbook is in Runbook Hub as UPG-{num}, including rollback steps.",
      "Monitoring looks clean after the upgrade. A couple of noisy pod restarts during the drain but nothing user-facing.",
    ],
    myReplies: [
      "Approved for {weekday} evening. Post status updates in the platform channel as you go.",
      "I will talk to the {team} manager today. We cannot let this slip past the support deadline.",
      "Combine them. One drain is better than two.",
      "Written checklist is enough for this one. Ping me if anything looks off.",
      "Good call on doing ingress separately. Let me know once it is in prod.",
      "Yes, add the scanner to CI. Make it a warning first, then a failure next quarter.",
    ],
    closers: [
      "All clusters upgraded. Closing the ticket.",
      "Thanks, I will post updates in the channel.",
      "Great, the deploy freeze is announced.",
      "Done, scanner is running in CI as a warning.",
      "Thanks Alex, prod upgrade went smoothly.",
    ],
  },
  {
    key: "terraform-modules",
    subjects: [
      "Breaking change in the network Terraform module",
      "RFC: versioning policy for shared Terraform modules",
      "Module update for {service} database",
      "Terraform state migration for {project}",
      "Drift detected in {env} by the nightly plan",
      "New base module for {team} services",
    ],
    starter: "staff",
    people: ["lena", "owen", "tariq", "ravi", "priya", "noah", "felix"],
    openers: [
      "I need to make a breaking change to the network module: subnets move from a list to a map so that adding one does not force a replacement of the others. Every consumer will need a one-line change and a state move.",
      "The nightly plan flagged drift in the {env} account: someone changed security group rules for {service} by hand. I can revert, but I want to check it was not an emergency fix first.",
      "I have drafted an RFC on versioning for shared modules. The proposal is semantic versioning with tagged releases, and consumers pin to a minor version instead of tracking main.",
      "The {project} infrastructure is still in a single huge state file, and plans take eleven minutes. I would like to split it into four states by component, which means a few hours of careful state moves.",
      "{team} asked for a base module that bundles the service, its database, alerts, and dashboards. It would cut their new-service setup from days to an hour, and other teams would probably use it too.",
      "The database module now supports automated minor version upgrades and maintenance windows. I would like to roll it out to {service} first since it has the most predictable traffic.",
    ],
    asks: [
      "Would you be OK with the breaking change going out next {weekday}, with a migration guide?",
      "Can you review the versioning RFC by {weekday}?",
      "Could you approve the state split for {project}? It needs a short change freeze.",
      "Can you confirm whether we want to own the base module, or should {team} maintain it?",
      "Do you know who made the manual change in {env}, or should I go through the audit log?",
    ],
    replies: [
      "The manual change was mine during an incident last week. I forgot to back-port it. PR is up as PLAT-{num}.",
      "Migration guide is written, including the exact state move commands for each consumer.",
      "I did the state split in {env} as a dry run. It went fine, so I am confident about prod.",
      "I like the RFC. One concern is that pinning means teams will fall behind on security fixes unless we nudge them.",
      "We could add a bot that opens upgrade PRs when a new module version is released.",
      "Plans for {project} are down to under two minutes per state after the split.",
      "The base module is ready for a pilot. {team} will try it on their next service.",
      "The nightly drift check now posts to the platform channel instead of email, so it gets seen.",
    ],
    myReplies: [
      "Go ahead with the breaking change. Give consumers two weeks and offer to pair on the migration.",
      "Approved the RFC with one change: security fixes get backported to the last two minor versions.",
      "Approve the state split. Schedule the freeze for a quiet afternoon.",
      "We own the base module. It is platform work and we should treat it as a product.",
      "Thanks for owning up to the manual change. Let's make sure incident follow-ups include Terraform back-ports.",
      "Yes to the upgrade bot. That is the only way pinning works long term.",
    ],
    closers: [
      "Thanks, merging now.",
      "Great, migration guide is published.",
      "Done, drift is resolved.",
      "Thanks Alex, I will announce the RFC outcome.",
      "Sounds good, state split is scheduled.",
    ],
  },
  {
    key: "db-maintenance",
    subjects: [
      "Maintenance window: Postgres upgrade for {service}",
      "Planned failover test on the {service} primary",
      "Vacuum and reindex on {service} this {weekday}",
      "Database maintenance calendar for {quarter}",
      "Storage expansion for the {region} replica",
      "Customer notice for {service} maintenance",
    ],
    starter: "colleague",
    people: ["nora", "diego", "ethan", "priya", "ines", "zoe", "daniel"],
    openers: [
      "We need a maintenance window to upgrade Postgres on {service} to the next major version. Expected downtime is under ten minutes with the logical replication approach, and we have rehearsed it twice in {env}.",
      "I would like to run a planned failover on the {service} primary next {weekday}. We have not tested failover in prod since the last DR exercise and the replica topology has changed since then.",
      "Table bloat on {service} is up to about 40% on the largest tables, and query latency is creeping up. I want to run a vacuum and reindex during the low-traffic window.",
      "Here is the database maintenance calendar for {quarter}. Four windows, all on weekday evenings, with the Postgres upgrades bundled together where possible.",
      "The {region} replica for {service} is at 82% disk. Expanding storage is online for this database engine, but there is a brief I/O pause, so I would rather do it in a window.",
      "Support asked for notice before any customer-facing maintenance on {service}. I have drafted the status page announcement for the upcoming window.",
    ],
    asks: [
      "Could you approve the maintenance window for {weekday} evening?",
      "Can you confirm whether {team} needs to be on standby during the upgrade?",
      "Would you be OK with the status page notice going out 72 hours in advance?",
      "Can you confirm the failover test should go ahead even with the {project} launch the same week?",
      "Should we bundle the storage expansion with the upgrade, or keep them separate?",
    ],
    replies: [
      "The rehearsal in {env} took seven minutes of write unavailability. Reads stayed up the whole time.",
      "I checked with Support and 72 hours is what they prefer for anything customer-visible.",
      "Failover completed in 34 seconds. The application reconnected without manual intervention.",
      "Reindex is done. P95 latency on the main queries dropped from 180ms to 60ms.",
      "Keeping them separate is safer. If the upgrade goes wrong I do not want to debug storage at the same time.",
      "I will be online for the window and have the rollback scripts ready.",
      "The status page notice is scheduled. Support has the FAQ for customer questions.",
      "{team} will have someone on standby, but they do not expect issues since the driver already supports the new version.",
    ],
    myReplies: [
      "Approved for {weekday} evening. Please send a summary afterwards with actual downtime.",
      "Keep them separate. Upgrade first, storage the following week.",
      "Go ahead with the failover test. Better to find problems now than during a real incident.",
      "72 hours notice is right. Thanks for coordinating with Support.",
      "Great result on the reindex. Can we schedule it regularly so we do not get here again?",
      "Thanks Nora. Let me know if you need anyone else on the call.",
    ],
    closers: [
      "Maintenance complete. Total write downtime was six minutes.",
      "Thanks, notice is out.",
      "Great, added to the calendar.",
      "Done, everything is healthy after the window.",
      "Thanks Alex, I will send the summary tomorrow.",
    ],
  },
  {
    key: "ci-flakiness",
    subjects: [
      "Flaky tests in the {service} pipeline",
      "CI queue times are up again",
      "Proposal: quarantine for flaky tests",
      "Runner capacity in Forge CI",
      "Build failures after the base image update",
      "Weekly CI health report",
    ],
    starter: "staff",
    people: ["amelia", "julia", "owen", "hana", "ravi", "ines", "aisha"],
    openers: [
      "The {service} pipeline failed 23% of runs last week, and almost all of those passed on retry. Engineers are just hitting rerun, which hides real failures and wastes runner time.",
      "Median CI queue time hit 14 minutes yesterday afternoon, with peaks over 30. Runner capacity has not grown with the number of repos, and the {team} monorepo alone uses about half of it.",
      "I would like to introduce a quarantine for flaky tests: any test that fails and then passes on retry three times in a week gets moved to a non-blocking suite automatically, and an issue is filed for the owning team.",
      "Builds started failing across a dozen repos after the base image update in {tool}. A system library changed versions and broke native extensions. I have pinned the old image as a stopgap.",
      "This week's CI health report: success rate 88%, median duration 19 minutes, and the top five flaky tests account for over half of retries. Full breakdown is in the dashboard.",
      "Integration tests for {service} spin up a real database in every job, which takes about four minutes before any test runs. Switching to a shared pre-warmed instance would cut most of that.",
    ],
    asks: [
      "Would you be OK with the automatic quarantine policy going live next {weekday}?",
      "Could you approve another {amount} a month for CI runners?",
      "Can you confirm whether we should hold the base image update until all teams have fixed their builds?",
      "Can you raise the flaky test numbers with the engineering managers at the next staff meeting?",
      "Should we set a target success rate for {quarter} and track it like any other reliability metric?",
    ],
    replies: [
      "Most of the flaky {service} tests share one cause: they depend on wall-clock time. Fixing the helper should knock out about a dozen.",
      "Quarantine sounds good, but we need a deadline for fixing quarantined tests or they will sit there forever.",
      "I added autoscaling to the runner pool. Queue times dropped to under three minutes at peak.",
      "The base image issue is fixed in the new version. Teams just need to bump their pin.",
      "The pre-warmed database cut the {service} pipeline from 22 minutes to 15.",
      "We should stop retries from counting as green in the dashboard. Right now they make the numbers look better than they are.",
      "QA is happy to help triage the quarantined tests. We have a rotation that can take this on.",
      "I opened tickets for the top five flaky tests and assigned them to their owners.",
    ],
    myReplies: [
      "Quarantine policy approved. Add a 30-day fix deadline, after which the test is deleted.",
      "Approve the runner spend. Queue time is developer time, and developer time is more expensive.",
      "Yes, I will bring the numbers to staff. Please give me a one-slide summary per team.",
      "Let's set 95% as the {quarter} target and report it in the platform review.",
      "Good work on the pre-warmed database. Can we roll that pattern out to the other services?",
      "Agree that retries should not count as green. Change the dashboard.",
    ],
    closers: [
      "Thanks, quarantine is live.",
      "Great, runner pool is scaled up.",
      "Done, dashboard updated.",
      "Thanks Alex, slides are in your inbox.",
      "Sounds good, I will track the target weekly.",
    ],
  },
  {
    key: "devex-survey",
    subjects: [
      "Developer experience survey results",
      "DevEx survey: top complaints from {team}",
      "Follow-up actions from the {quarter} survey",
      "Draft questions for the next developer survey",
      "Survey comments about local development setup",
      "Sharing survey results with the engineering org",
    ],
    starter: "colleague",
    people: ["amelia", "hana", "ravi", "grace", "julia", "owen", "victor"],
    openers: [
      "The developer experience survey closed with a 71% response rate, our best yet. Overall satisfaction is up six points, but build times and documentation are still the two biggest complaints.",
      "I broke down the survey by team. {team} is noticeably less happy than everyone else, mostly about flaky environments and slow code review. Their comments are worth reading in full.",
      "Based on the survey, I would like to commit to three follow-up actions for {quarter}: faster CI, a single docs portal, and a one-command local setup for the top ten services.",
      "Here is a draft of the questions for the next survey. I kept the core questions identical so we can track trends, and added a section on on-call experience.",
      "A lot of comments mention that getting {service} running locally takes most of a day. Several people said they just develop against {env} instead, which causes its own problems.",
      "I would like to share the survey results with the whole engineering org, including the raw comments with names removed. Transparency helped a lot last time.",
    ],
    asks: [
      "Can you review the follow-up actions by {weekday} so I can announce them?",
      "Would you be OK with sharing the raw anonymized comments with the whole org?",
      "Could you talk to the {team} manager about their results before they are shared widely?",
      "Can you confirm we have capacity for the local setup work in {quarter}?",
      "Would you like to present the results at the engineering all-hands yourself?",
    ],
    replies: [
      "The docs complaint is consistent with what we hear in support channels. People cannot find the right page.",
      "I tried the local setup for {service} from scratch and it took me four hours. The comments are fair.",
      "Sharing the raw comments worked well last year. People appreciated seeing their feedback reflected honestly.",
      "We should close the loop with a short update halfway through the quarter so people see progress.",
      "I already spoke with the {team} manager. They are aware and have a plan for the environment issues.",
      "The on-call questions are a great addition. We have no data on that today.",
      "Build time satisfaction moved up after the runner changes, which is encouraging.",
      "One theme I did not expect: a lot of people want better test data in {env}.",
    ],
    myReplies: [
      "The three actions look right. Announce them, with an owner and a target date for each.",
      "Share the comments. Just make sure nothing can identify an individual.",
      "Happy to present at the all-hands. Send me the slides a day ahead.",
      "We have capacity for local setup. I would start with {service} since it is the worst.",
      "Good idea on the mid-quarter update. Put it on the calendar now.",
      "Thanks for running this. The response rate alone says people trust the process.",
    ],
    closers: [
      "Thanks, I will announce the actions this week.",
      "Great, results are shared.",
      "Perfect, slides are on the way.",
      "Thanks Alex, mid-quarter update is scheduled.",
      "Appreciate the support on this.",
    ],
  },
  {
    key: "offsite",
    subjects: [
      "Platform offsite: venue options",
      "Offsite agenda draft for {quarter}",
      "Travel and hotel for the team offsite",
      "Offsite dietary and accessibility needs",
      "Offsite budget check",
      "Activity ideas for the offsite",
    ],
    starter: "colleague",
    people: ["grace", "maya", "mei", "diego", "amelia", "malik", "sofia"],
    openers: [
      "I have three venue options for the Platform offsite: a converted warehouse downtown, a retreat center about an hour out, and the large room at our own office. Prices range from free to about {amount} for two days.",
      "Here is a draft agenda for the offsite. Day one is strategy and roadmap, day two is team-building and a hack session. I left a slot for you to open with the year in review.",
      "We have 34 people confirmed, including six travelling from the {region} office. I am booking the hotel block this week, so please send any changes soon.",
      "I am collecting dietary and accessibility needs for the offsite. A few people have not replied yet, so I will send one more reminder.",
      "The offsite is currently estimated at {amount} including travel, venue, and meals. That is a bit over what Finance set aside, mostly because of the flights.",
      "For the team-building part, the most popular options from the poll were a cooking class, an escape room, and a guided hike. The hike is the cheapest and easiest to accommodate everyone.",
    ],
    asks: [
      "Could you choose a venue by {weekday} so I can put down the deposit?",
      "Would you be OK with opening day one with a 30-minute year in review?",
      "Can you confirm whether we can go over the budget by about {amount}, or should I cut something?",
      "Can you confirm the remote folks should travel in rather than join by video?",
      "Do you have a preference between the cooking class and the hike?",
    ],
    replies: [
      "I talked to Malik and we can move some unused training budget to cover the difference.",
      "The retreat center includes meals, which makes it cheaper than it first looks.",
      "Hotel block is booked. People can extend at the same rate if they want to stay the weekend.",
      "All dietary needs are in. Two vegan, one gluten-free, one nut allergy.",
      "The venue has a step-free entrance and an accessible bathroom, which was a requirement for one attendee.",
      "The hack session ideas are already rolling in. People are excited about it.",
      "Shuttle from the office to the venue is booked for both mornings.",
      "I will send a packing list and the final schedule a week before.",
    ],
    myReplies: [
      "Let's go with the retreat center. Getting people out of the office is the point.",
      "Yes, I will open day one. Keep it to 30 minutes so there is time for discussion.",
      "Use the training budget to cover the difference. Do not cut the travel for the {region} team.",
      "Hike it is. It is the most inclusive option and people can go at their own pace.",
      "Thanks for organizing all of this. It is a lot of logistics.",
      "Remote folks should travel in. The in-person time is the whole reason for doing this.",
    ],
    closers: [
      "Great, deposit paid.",
      "Thanks, agenda is final.",
      "Perfect, I will send the schedule out.",
      "Thanks Alex, booking the hike.",
      "Sounds good, everything is confirmed.",
    ],
  },
  {
    key: "onboarding",
    subjects: [
      "Onboarding plan for the new platform engineer",
      "Intern project proposals for {quarter}",
      "Laptop and access for new hire starting {weekday}",
      "Buddy assignment for {team} new joiner",
      "First-week schedule for incoming SREs",
      "Onboarding feedback from recent hires",
    ],
    starter: "colleague",
    people: ["mei", "sofia", "liam", "amelia", "elena", "lena", "priya"],
    openers: [
      "We have a new platform engineer starting on {weekday}. I drafted a 30-60-90 plan: first month is shadowing and small tickets, second month is owning a module, third month joins the on-call rotation as secondary.",
      "Intern project proposals for {quarter} are due. I have two ideas: a cost dashboard for {team}, and automating the access review export. Both are scoped to fit in twelve weeks.",
      "IT needs to know the hardware and access requirements for the new hire by end of week. Standard engineering laptop, plus access to {tool}, the {env} cluster, and the platform repos.",
      "The {team} new joiner needs a buddy for their first month. Ideally someone who knows the {service} codebase and has some time in their schedule.",
      "Two SREs start next week. I put together a first-week schedule with intro sessions on our architecture, the incident process, and the on-call tooling.",
      "I surveyed the last five hires about their onboarding. The consistent feedback is that access requests took too long and the architecture docs were out of date.",
    ],
    asks: [
      "Could you do a 30-minute welcome chat with the new hire on their first day?",
      "Can you confirm which intern project you would like us to submit?",
      "Would you be OK with Owen being the buddy, given he is fairly new himself?",
      "Can you approve the access bundle so IT can set it up before {weekday}?",
      "Could you review the 30-60-90 plan by {weekday}?",
    ],
    replies: [
      "Laptop is shipped and access is set up. They should be able to log in on day one.",
      "I would be happy to be the buddy. I remember how confusing the first few weeks were.",
      "The access portal now has a new-hire bundle, so it is one request instead of eight.",
      "I updated the architecture overview doc. It had not been touched since before the {project} migration.",
      "The intern host for the cost dashboard project would be Diego's team, since they own the data.",
      "First-week calendar invites are sent. Each session has a named presenter.",
      "Feedback from the last hire was that pairing on real tickets in week one helped the most.",
      "I added a starter ticket list to the onboarding page so new folks can pick something small.",
    ],
    myReplies: [
      "Happy to do the welcome chat. Put it on my calendar for the first afternoon.",
      "Submit the cost dashboard project. It is more visible and the intern will learn more.",
      "Owen is a good choice as buddy. Recent hires remember the pain points best.",
      "Approved the access bundle.",
      "The 30-60-90 plan looks good. I would move on-call shadowing earlier, into the first month.",
      "Thanks for fixing the docs. Let's make onboarding feedback a standing item each quarter.",
    ],
    closers: [
      "Great, all set for day one.",
      "Thanks, intern proposal submitted.",
      "Perfect, calendar invite sent.",
      "Thanks Alex, I updated the plan.",
      "Sounds good, welcome chat is booked.",
    ],
  },
  {
    key: "hiring-pipeline",
    subjects: [
      "Staff SRE pipeline update",
      "Interview loop for the {team} senior engineer role",
      "Debrief scheduled for {weekday}",
      "Offer approval: platform engineer candidate",
      "Agency candidates for the infrastructure roles",
      "Interviewer calibration for {quarter}",
      "Job description review: Senior Platform Engineer",
    ],
    starter: "colleague",
    people: ["harper", "elena", "jess", "marco", "mei", "diego", "victor", "sofia"],
    openers: [
      "Quick pipeline update on the Staff SRE role: 42 applicants, 9 phone screens done, 3 moving to the onsite loop. The strongest candidate has a competing offer, so timing matters.",
      "I have scheduled the debrief for {weekday} afternoon. All five interviewers have submitted feedback; it is mostly positive, with one mixed signal on system design.",
      "We have a verbal yes from the platform engineer candidate, pending an offer. The compensation is at the top of the band, so it needs director approval before I can send it.",
      "The agency sent four more profiles for the infrastructure roles. Two look promising on paper, especially one with a lot of Kubernetes and Terraform experience at a similar scale.",
      "Interviewer calibration is overdue. Our pass rates vary a lot between interviewers on the system design round, from 20% to 70%, which suggests we are not using the same bar.",
      "I refreshed the job description for the Senior Platform Engineer role. It was very heavy on specific tools; the new version focuses more on outcomes and the problems the team actually works on.",
      "The {team} senior engineer loop is ready to go. We are short one interviewer for the architecture round, though, and would love someone from Platform.",
    ],
    asks: [
      "Could you approve the offer by {weekday}? The candidate's other deadline is early next week.",
      "Can you join the debrief on {weekday}, or should we proceed without you?",
      "Would you be OK with fast-tracking the candidate with the competing offer?",
      "Can you confirm whether we should keep both infrastructure roles open, or pause one?",
      "Could you nominate someone for the architecture round in the {team} loop?",
      "Can you review the new job description before it goes live?",
    ],
    replies: [
      "The debrief went well. Four strong hires and one lean hire, so the recommendation is to extend an offer.",
      "I spoke with the candidate and they are excited. The main thing they asked about was on-call expectations.",
      "Of the agency profiles, I would phone-screen two. The others do not have enough production experience.",
      "Compensation approval is in the HR system now. Once you approve, I can send the offer the same day.",
      "Victor is willing to do the architecture round. He has done it for us before.",
      "Calibration session is booked for next {weekday}. I will bring anonymized examples from recent loops.",
      "The new job description already had three applicants in the first day, which is more than last week combined.",
      "Reference checks came back positive. Both referees mentioned how calm the candidate is during incidents.",
      "The candidate accepted. Start date is in about four weeks.",
    ],
    myReplies: [
      "Approved. Please send the offer today.",
      "Fast-track is fine. Let's do the onsite this week if the panel can make it.",
      "I will join the debrief. Please send me the written feedback beforehand.",
      "Keep both roles open. We are behind on hiring for the year and the work is not going away.",
      "Victor is a good fit for the architecture round. Thank him for me.",
      "The new job description is much better. Publish it.",
      "Great news. Please make sure the onboarding plan is ready before they start.",
    ],
    closers: [
      "Offer sent. Will let you know as soon as I hear back.",
      "Thanks, debrief is confirmed.",
      "Great, I will schedule the onsite.",
      "Thanks Alex, job description is live.",
      "Perfect, the panel is complete now.",
    ],
    labels: ["Hiring"],
  },
  {
    key: "headcount-budget",
    subjects: [
      "Platform headcount request for {quarter}",
      "Budget reforecast: engineering infrastructure",
      "Backfill approval for the open SRE role",
      "Contractor extension for {project}",
      "{quarter} budget submission deadline",
      "Converting a contractor role to full-time",
    ],
    starter: "colleague",
    people: ["helen", "malik", "marcus", "renata", "sofia", "mei", "diego"],
    openers: [
      "Budget submissions for {quarter} are due soon. For Platform I have last quarter's actuals plus the run-rate, but I need your headcount plan and any new tooling you want to add.",
      "The reforecast shows infrastructure spend landing about {amount} over plan for the year, mainly from cloud growth that was not in the original model. Finance would like an explanation and a mitigation plan.",
      "We have a backfill request for the SRE who left last month. The role is already in the budget, so it just needs your approval to open the requisition.",
      "The contractor working on {project} is scheduled to finish at the end of the month, but the work is not done. Extending for another quarter would cost about {amount}.",
      "I would like to make the case for two additional platform engineers in {quarter}. We are supporting twice as many services as two years ago with the same team size, and on-call load is showing it.",
      "We have been using a contractor in the {team} role for over a year now. Converting it to a full-time position would actually be cheaper and better for continuity.",
    ],
    asks: [
      "Could you send me the Platform headcount plan by {weekday}?",
      "Can you approve the backfill requisition this week?",
      "Would you be OK with extending the {project} contractor for one more quarter?",
      "Can you join the reforecast review on {weekday} to explain the cloud variance?",
      "Can you confirm whether the two new roles are must-haves or nice-to-haves for {quarter}?",
    ],
    replies: [
      "I modelled the two new roles fully loaded. Together they come to roughly {amount} for the year.",
      "Marcus is supportive in principle but wants to see the pager and service-count data in the request.",
      "The conversion makes sense financially. HR needs a job description and a level before we can proceed.",
      "The cloud variance is mostly explained by the {project} launch, which brought forward capacity we had planned for next year.",
      "Backfill requisition is open. Recruiting will start sourcing this week.",
      "If we cut the contractor extension to two months instead of three, it fits in the existing budget.",
      "Finance will need the plan in the template, not as a doc. I have pre-filled what I could.",
      "The exec team is reviewing all headcount requests together, so the earlier we submit, the better.",
    ],
    myReplies: [
      "Backfill approved. Please prioritize it, the rotation is stretched.",
      "Headcount plan is in the template. Two new roles, both must-haves, with the reasoning attached.",
      "Extend the contractor for two months. That should be enough to finish the work.",
      "I will join the reforecast review. The variance is real, but most of it is pulled-forward spend, not waste.",
      "Let's go ahead with the conversion. I will write the job description this week.",
      "Thanks Helen. I will add the pager data Marcus asked for.",
    ],
    closers: [
      "Thanks, submission received.",
      "Great, requisition is open.",
      "Perfect, I will update the forecast.",
      "Thanks Alex, see you at the review.",
      "Sounds good. Contractor extension is processed.",
    ],
    labels: ["Finance"],
  },
  {
    key: "invoice-po",
    subjects: [
      "Invoice {num} needs PO approval",
      "Purchase order for {tool} renewal",
      "Question about the monitoring invoice",
      "PO {num} is close to its limit",
      "Duplicate invoice received from a vendor",
      "Cost center for the new tooling purchase",
    ],
    starter: "colleague",
    people: ["olivia", "malik", "helen", "laura", "rebecca", "megan"],
    openers: [
      "We received invoice {num} for {amount}, but it does not match any open purchase order. It appears to be for the observability tooling, which you own. Can you help me figure out which PO it should go against?",
      "The purchase order for the {tool} renewal is ready for approval. The renewal amount is {amount}, which is about 8% higher than last year due to additional seats.",
      "PO {num} for the consulting engagement is at 92% of its limit, and we still expect two more invoices this quarter. We will need either a change order or a new PO.",
      "It looks like we received the same invoice twice from a vendor, under two different invoice numbers. I have put both on hold until we confirm which one is valid.",
      "I am setting up the purchase for the new tooling and need to know which cost center to use. The request lists Platform, but some of the usage will be from {team}.",
      "Our monthly monitoring invoice came in at {amount}, about 30% higher than usual. The line items suggest higher log ingestion volume than in previous months.",
    ],
    asks: [
      "Could you approve the PO by {weekday} so the renewal does not lapse?",
      "Can you confirm which cost center to use for the tooling purchase?",
      "Would you be OK with a change order to extend PO {num}?",
      "Can you confirm whether the higher monitoring invoice is expected?",
      "Could you confirm which of the two invoices we should pay?",
    ],
    replies: [
      "I checked with the vendor and the second invoice was sent by mistake. They have voided it.",
      "The higher monitoring bill is from verbose logging that was left on after an incident. It has been turned off.",
      "Change order is drafted. It adds {amount} and extends the end date by one quarter.",
      "For the cost center, we can split it 70/30 between Platform and {team} based on expected usage.",
      "The invoice matches the old PO, which expired. I can raise a new one and match it retroactively.",
      "The additional seats were requested by two teams during the year. I have the approvals on file.",
      "Accounts payable needs approval by Thursday to make the next payment run.",
      "The vendor offered a small discount for a two-year commitment if that is interesting.",
    ],
    myReplies: [
      "Approved the PO.",
      "Use the Platform cost center for now. We can charge back to {team} later if needed.",
      "Approve the change order. The engagement is going well and we want them to finish.",
      "The monitoring overage was a one-off. Please pay it, and I will make sure we have an alert on log volume.",
      "Pay the original invoice and confirm the vendor voided the duplicate in writing.",
      "Let's stay on a one-year term for now. I want to re-evaluate options next year.",
    ],
    closers: [
      "Thanks, PO approved and sent to the vendor.",
      "Great, invoice is processed.",
      "Perfect, change order submitted.",
      "Thanks Alex, I have updated the cost center.",
      "Done, duplicate is voided.",
    ],
    labels: ["Finance"],
  },
  {
    key: "incident-followup",
    subjects: [
      "Postmortem: {service} outage in {region}",
      "Action items from INC-{num}",
      "Incident review scheduled for {weekday}",
      "Follow-up on the {env} degradation",
      "Overdue postmortem actions for {team}",
      "Customer impact summary for INC-{num}",
    ],
    starter: "staff",
    people: ["priya", "jonah", "felix", "sam", "paul", "zoe", "ben", "aisha"],
    openers: [
      "The postmortem draft for the {service} outage is ready for review. Root cause was a configuration push that removed a connection limit, which let a retry storm exhaust the database. Total customer impact was 47 minutes.",
      "We have seven action items from INC-{num}. Four are assigned and in progress, but three have no owner yet and are mostly in Platform's area.",
      "I scheduled the incident review for {weekday}. It is blameless as usual, and the timeline is in the doc. Please add anything I missed before the meeting.",
      "The {env} degradation yesterday turned out to be a noisy neighbour on shared nodes. The {service} pods were starved of CPU for about 20 minutes. No customer impact, but it was close.",
      "There are 12 postmortem action items older than 60 days across {team} and Platform. A couple are significant, including the missing alert that would have caught the last {service} outage.",
      "Support asked for a customer-facing summary of INC-{num}. I drafted one that covers what happened, impact, and what we are changing, without internal detail.",
    ],
    asks: [
      "Could you review the postmortem draft by {weekday}?",
      "Can you assign owners for the three unowned action items?",
      "Can you confirm the customer-facing summary is OK to send?",
      "Would you be OK with making the overdue action items a standing agenda item at the platform review?",
      "Can you join the incident review on {weekday}?",
    ],
    replies: [
      "I added the missing part of the timeline, from when the first alert fired until we declared the incident. That gap was about eight minutes.",
      "The connection limit is now enforced in the config schema, so a push without it will be rejected.",
      "I took ownership of the alerting action item. Should be done by {weekday}.",
      "Customer-facing summary looks good to me. I would drop the sentence about the retry storm, it reads as too technical.",
      "The noisy neighbour issue is fixed by moving {service} to a dedicated node pool.",
      "We should look at why the runbook did not cover this failure mode. It took us 15 minutes to find the right dashboard.",
      "Support sent the summary to the affected customers. A couple replied thanking us for the transparency.",
      "Of the 12 overdue items, five are actually done but never closed. I updated them.",
    ],
    myReplies: [
      "Reviewed. Clear timeline and a good root cause analysis. One comment on the detection section.",
      "I will take the database action item myself and assign the other two to Priya and Felix.",
      "The summary is fine to send. Drop the retry storm sentence as suggested.",
      "Yes, overdue action items go on the platform review agenda from now on.",
      "I will be at the review. Thanks for running it.",
      "The runbook gap is the most important finding here. Let's make sure that action gets done first.",
    ],
    closers: [
      "Thanks, postmortem is published.",
      "Great, action items are assigned.",
      "Summary sent to Support.",
      "Thanks Alex, I will add it to the agenda.",
      "Sounds good, see you at the review.",
    ],
    labels: ["Incidents"],
  },
  {
    key: "customer-escalation",
    subjects: [
      "Escalation: enterprise customer reporting slow exports",
      "Customer escalation on {service} timeouts",
      "Support ticket {num} needs engineering input",
      "Repeated 502s for a customer in {region}",
      "Data residency question from a strategic account",
      "Follow-up for the account team on the {service} issue",
    ],
    starter: "colleague",
    people: ["zoe", "tom", "ben", "aisha", "claire", "priya", "ravi"],
    openers: [
      "One of our largest enterprise customers is reporting that report exports take over 20 minutes, up from about two. They are escalating through their account manager, and ticket {num} has been open for four days.",
      "A customer in {region} is seeing intermittent 502s from {service}, roughly 1% of requests over the last week. Our dashboards look clean at the aggregate level, so it may be specific to their traffic pattern.",
      "Support ticket {num} needs someone from engineering. The customer is asking whether their data is ever processed outside {region}, and the answer depends on which services touch it.",
      "The account team would like an update they can share with the customer about the {service} timeouts. They have a renewal conversation coming up and want to show we are taking it seriously.",
      "We have had three escalations this week that trace back to {service}. Each one was handled individually, but I think there is a common cause we have not found yet.",
      "The customer is asking for a call with an engineering lead. They are frustrated that the issue has been open for a week without a clear explanation.",
    ],
    asks: [
      "Could you assign someone from Platform to ticket {num} today?",
      "Would you be OK joining a call with the customer on {weekday}?",
      "Can you confirm whether any of our processing happens outside {region}?",
      "Can you give me an update I can share with the account team by {weekday}?",
      "Can you confirm whether this is a known issue we are already working on?",
    ],
    replies: [
      "I found it. The customer's exports hit a code path that does not use the read replica, so they queue behind write traffic.",
      "The 502s correlate with their batch uploads. Their requests exceed the load balancer's idle timeout.",
      "All processing for that customer happens in {region}, but backups are replicated to a second region in the same jurisdiction.",
      "The fix is deployed to {env}. If it holds, we will promote to prod on {weekday}.",
      "The customer confirmed export times are back to normal after the fix.",
      "Account team appreciated the update. They said it helped a lot in the renewal conversation.",
      "I set up a dashboard filtered to their tenant so we can watch it more closely.",
      "We raised the idle timeout for their endpoint and the 502s stopped.",
    ],
    myReplies: [
      "Ravi will take ticket {num}. Please keep Support updated daily until it is resolved.",
      "I am happy to join the call. Please send me the ticket history beforehand.",
      "Good find. Please make sure the fix also covers the other report types.",
      "Let's write up the data residency answer properly so Support can reuse it.",
      "Thanks for the quick turnaround. Please close the ticket once the customer confirms.",
      "Three escalations from the same service is a pattern. Let's do a proper review of {service} next week.",
    ],
    closers: [
      "Thanks, ticket is resolved.",
      "Great, the customer is happy.",
      "Update shared with the account team.",
      "Thanks Alex, call is booked.",
      "Perfect, closing the escalation.",
    ],
  },
  {
    key: "architecture-question",
    subjects: [
      "Question: should {team} run its own Kafka cluster?",
      "Architecture review request for {project}",
      "Advice on caching strategy for {service}",
      "Multi-region approach for {service}",
      "Picking a queue for the {project} workers",
      "Design doc feedback: {project} event pipeline",
    ],
    starter: "colleague",
    people: ["victor", "ravi", "aisha", "ben", "hana", "noah", "diego", "ethan"],
    openers: [
      "{team} is designing the {project} event pipeline and wants to know whether to run its own Kafka cluster or use the shared platform one. Their throughput is expected to be about 50,000 messages per second at peak.",
      "We would like an architecture review for {project} before we start building. The design doc covers the data model, the API, and a rough capacity estimate.",
      "We are trying to decide on a caching strategy for {service}. Read traffic is about 20x writes, and most reads are for a small set of hot keys. Options are a sidecar cache, a shared cache cluster, or both.",
      "Several customers have asked about multi-region support for {service}. Before we promise anything, we want to understand what Platform can offer today versus what would need to be built.",
      "The {project} workers need a queue with at-least-once delivery and delayed retries. We are considering the shared queue service versus a simple Postgres-backed queue.",
      "I left some comments on the {project} design doc. The main concern is that the proposed synchronous calls between three services will make latency and availability compound.",
    ],
    asks: [
      "Could you or someone from your team review the design doc by {weekday}?",
      "Can you confirm whether the shared Kafka cluster can handle the extra load?",
      "Would you be OK with {team} running its own cluster if they take on the on-call?",
      "Can you confirm what multi-region support Platform can offer in {quarter}?",
      "Do you have a recommendation between the shared queue and a Postgres-backed queue?",
    ],
    replies: [
      "The shared cluster has plenty of headroom. 50,000 messages per second would take it to about 60% utilization.",
      "Running their own cluster sounds good until the first 3am page. I would strongly recommend the shared one.",
      "A Postgres-backed queue is fine at that volume and avoids another dependency. We have used the pattern for years.",
      "For caching, start with the sidecar. Add the shared cluster only if hit rates are poor.",
      "Multi-region today means active-passive with manual failover. Active-active would need significant work on the data layer.",
      "I reviewed the doc. The data model is solid. The main gap is what happens when {service} is unavailable.",
      "We could make the calls asynchronous with an outbox pattern, which removes the availability dependency.",
      "I would be happy to pair with the team on the queue design if that helps.",
    ],
    myReplies: [
      "Use the shared Kafka cluster. We will onboard you, and you get our on-call coverage for free.",
      "Victor will review the design doc. Please send him the latest version.",
      "Go with the Postgres-backed queue. It is the boring choice, which is the right one here.",
      "We can offer active-passive in {quarter}. Active-active is a much bigger conversation.",
      "Agree with Victor's comments on synchronous calls. Please address them before starting implementation.",
      "Start with the sidecar cache and measure. Do not build the shared cluster until the data says you need it.",
    ],
    closers: [
      "Thanks, that is really helpful.",
      "Great, we will go with the shared cluster.",
      "Design doc updated with your feedback.",
      "Thanks Alex, we will start with the sidecar.",
      "Perfect, review is booked.",
    ],
  },
  {
    key: "api-deprecation",
    subjects: [
      "Deprecation notice: v1 endpoints on {service}",
      "Migration status for the old config API",
      "Teams still calling the legacy {service} API",
      "Extending the deprecation deadline for {team}",
      "Sunset plan for the internal service registry",
      "Migration guide feedback for {service} v2",
    ],
    starter: "staff",
    people: ["ravi", "noah", "victor", "hana", "aisha", "ethan", "owen"],
    openers: [
      "We are ready to announce the deprecation of the v1 endpoints on {service}. The plan is 90 days notice, weekly reminders to callers, and a brownout in {env} two weeks before the cutoff.",
      "Migration to the new config API is at 78% of traffic. The remaining callers are mostly batch jobs owned by {team} and a couple of services that have not been deployed in months.",
      "Usage logs show 11 services still calling the legacy {service} API. Six have owners who are aware and planning to migrate; five have no clear owner at all.",
      "{team} asked for a four-week extension on the {service} v1 deprecation. They have a release freeze for {project} and cannot take the migration until it lifts.",
      "The internal service registry has been replaced by the new discovery system for over a year, but we still run it because three services depend on it. I would like to set a hard sunset date.",
      "We collected feedback on the {service} v2 migration guide. The most common issue is that pagination works differently and the guide does not explain it well.",
    ],
    asks: [
      "Could you approve the deprecation announcement so it can go out on {weekday}?",
      "Would you be OK with granting {team} a four-week extension?",
      "Can you help find owners for the five orphaned services?",
      "Can you confirm we are comfortable with a brownout in {env} before the cutoff?",
      "Would you be OK with a hard sunset date for the service registry at the end of {quarter}?",
    ],
    replies: [
      "I updated the guide with a section on pagination and a code sample in each of our main languages.",
      "Two of the orphaned services turned out to be dead. They have not received traffic in months, so we can delete them.",
      "The brownout in {env} caught one caller we did not know about. Good thing we did it.",
      "We added a deprecation header to every v1 response so callers see it in their logs.",
      "Migration is now at 94% of traffic. The last few are scheduled for next sprint.",
      "{team} committed to migrating in the first week after the freeze lifts.",
      "I can write a shim that translates v1 calls to v2 for the long tail, but I would rather not maintain it.",
      "The registry has only one remaining dependency now. The owners have a ticket to remove it.",
    ],
    myReplies: [
      "Approved. Send the announcement and post it in the engineering channel too.",
      "Give {team} the extension, but make it clear there will not be a second one.",
      "I will raise the orphaned services in the staff meeting. If no one claims them, we turn them off.",
      "Brownout is fine. Announce it a week in advance.",
      "Hard sunset at the end of {quarter} is approved. No shim.",
      "Good work on the guide. Pagination was always going to trip people up.",
    ],
    closers: [
      "Thanks, announcement is out.",
      "Great, extension is noted.",
      "Done, the dead services are removed.",
      "Thanks Alex, sunset date is published.",
      "Sounds good, brownout is scheduled.",
    ],
  },
  {
    key: "secrets-rotation",
    subjects: [
      "Quarterly secrets rotation for {service}",
      "Rotating database credentials in {env}",
      "Expiring TLS certificates in {region}",
      "Hardcoded credential found in a repo",
      "Moving {team} services to dynamic secrets",
      "Signing key rotation schedule",
    ],
    starter: "colleague",
    people: ["kofi", "noah", "rachel", "lena", "priya", "owen", "felix"],
    openers: [
      "Quarterly rotation for {service} is due. This covers the database password, two API keys for downstream services, and the webhook signing secret. The runbook is up to date and we have done it twice before without issues.",
      "Database credentials in {env} have not been rotated in over a year, which is outside policy. Rotation itself is easy, but several services read the password from a config file instead of the secrets store.",
      "The certificate monitor shows 14 TLS certificates in {region} expiring in the next 30 days. Eleven are auto-renewed; three are manually managed and need someone to act.",
      "The secret scanner found a hardcoded credential in a {team} repository. It is an API key for a staging integration, committed about six weeks ago. I have revoked it already.",
      "I would like to move {team}'s services to dynamic database credentials that expire after a few hours. It removes the rotation problem entirely, but each service needs a small code change.",
      "Our signing keys for internal tokens are rotated annually, but the new policy calls for every six months. I have a proposal for overlapping key windows so services can roll over without downtime.",
    ],
    asks: [
      "Can you approve the rotation window for {weekday} morning?",
      "Can you confirm who should own the three manually managed certificates?",
      "Would you be OK with requiring dynamic credentials for all new services from {quarter}?",
      "Could you follow up with the {team} manager about the hardcoded credential?",
      "Can you confirm the six-month signing key rotation is something we can commit to?",
    ],
    replies: [
      "Rotation for {service} is done. No errors, and every consumer picked up the new secret within five minutes.",
      "The manually managed certificates are for legacy endpoints that should be behind the main load balancer anyway. Moving them would solve this for good.",
      "I added a pre-commit hook to the {team} repo template so this is caught before it is pushed.",
      "Dynamic credentials are working in {env} for two services. Connection pool behaviour needed a small tweak but nothing major.",
      "Two services failed to pick up the new password because they cache it at startup. A rolling restart fixed it.",
      "Overlapping windows work well. We publish the new key a week before it becomes active.",
      "The audit log confirms the leaked key was never used from an unknown IP.",
      "I put calendar reminders for the next rotations on the platform shared calendar.",
    ],
    myReplies: [
      "Approved for {weekday} morning. Please post in the channel when it starts and finishes.",
      "Platform owns the certificates for now. Let's move those endpoints behind the main load balancer this quarter.",
      "Yes, require dynamic credentials for new services from {quarter}. Existing services migrate as they are touched.",
      "I will talk to the {team} manager. Good that you revoked it immediately.",
      "Six-month rotation is fine with the overlapping windows. Let's commit to it.",
      "Thanks for catching the startup caching problem. Please add it to the runbook.",
    ],
    closers: [
      "Thanks, rotation complete.",
      "Great, certificates are renewed.",
      "Done, runbook updated.",
      "Thanks Alex, I will schedule the next one.",
      "Sounds good, closing the ticket.",
    ],
  },
  {
    key: "dr-test",
    subjects: [
      "DR test results: {region} failover",
      "Disaster recovery exercise planned for {weekday}",
      "Backup restore drill for {service}",
      "Gaps found in the DR runbook",
      "RTO and RPO measurements from the last exercise",
      "Tabletop exercise: losing {region}",
    ],
    starter: "staff",
    people: ["priya", "nora", "felix", "jonah", "tariq", "grace", "rachel"],
    openers: [
      "We completed the {region} failover exercise. Traffic moved to the secondary region in 38 minutes, against a target of 30. Most of the overrun came from waiting on DNS TTLs and one manual step in the runbook.",
      "The next disaster recovery exercise is planned for {weekday}. We will simulate losing the primary database for {service} and measure how long it takes to promote the replica and restore service.",
      "The backup restore drill for {service} succeeded, but it took four hours to restore a full copy. That is within RTO, but only just, and data volume is growing.",
      "During the last exercise we found three gaps in the DR runbook: an expired credential for the backup account, a missing step for re-enabling replication, and a dashboard link that no longer works.",
      "Here are the measured RTO and RPO numbers from the exercise. RPO was under a minute for every service. RTO varied from 12 minutes for stateless services to almost two hours for {service}.",
      "I would like to run a tabletop exercise on losing {region} entirely for a day. No systems would be touched; it is a walkthrough of decisions, communications, and dependencies.",
    ],
    asks: [
      "Can you approve the DR exercise window on {weekday}?",
      "Could you join the tabletop exercise as the incident commander?",
      "Can you confirm whether a 30-minute RTO is still the right target for {quarter}?",
      "Would you be OK with lowering DNS TTLs on the main domains to five minutes?",
      "Can you share the DR results with the exec team, or should I send them?",
    ],
    replies: [
      "I fixed the three runbook gaps and added a check that alerts if the backup account credential is close to expiry.",
      "Lowering the TTLs should cut about eight minutes from the failover. The extra DNS queries are negligible.",
      "Restore time for {service} drops to under two hours if we use incremental snapshots.",
      "The tabletop invite is out. I have included Comms and Support since they are usually forgotten.",
      "Promotion of the replica took four minutes. The rest was application reconnect and cache warm-up.",
      "Security would like to observe the exercise to check the access controls during failover.",
      "I wrote up the results with a summary at the top for the execs.",
      "Next exercise should include a partial failure, not just a clean regional loss. Those are harder.",
    ],
    myReplies: [
      "Approved for {weekday}. Please send a short summary to the platform leads afterwards.",
      "Happy to play incident commander. Make it realistic and do not go easy on us.",
      "30 minutes is still the right target. Lower the TTLs and run it again next quarter.",
      "I will share the results with the exec team. Send me the summary when it is ready.",
      "Good idea on the partial failure scenario. Let's plan that for next time.",
      "Switch {service} to incremental snapshots. Two hours of margin is not enough.",
    ],
    closers: [
      "Thanks, summary sent.",
      "Great, exercise is confirmed.",
      "Done, TTLs are lowered.",
      "Thanks Alex, see you at the tabletop.",
      "Perfect, runbook is updated.",
    ],
  },
  {
    key: "tooling-feedback",
    subjects: [
      "Feedback on {tool}",
      "Feature request for the deploy bot",
      "Slow load times in {tool} for large services",
      "Proposal to retire an internal tool",
      "Usability issues in the access portal",
      "Roadmap for internal tooling in {quarter}",
    ],
    starter: "colleague",
    people: ["hana", "aisha", "ravi", "julia", "amelia", "owen", "ines"],
    openers: [
      "Some feedback on {tool} from the {team} team: it works well for simple services, but for anything with more than a couple of environments the UI gets confusing and people deploy to the wrong one.",
      "Could the deploy bot support scheduled deploys? We often want to ship outside busy hours, and right now someone has to stay online to press the button.",
      "The overview page in {tool} takes over a minute to load for {service}, which has about 400 deployments in history. It seems to load everything at once instead of paginating.",
      "We maintain three internal tools that do overlapping things for release notes. I would like to retire the oldest one, which only a handful of people use, and point them at the newer option.",
      "The access portal has some rough edges. Approvers do not get reminders, requests cannot be filtered by team, and the error messages are confusing when a request is denied.",
      "I put together a draft roadmap for internal tooling in {quarter}, based on the developer survey and support requests. The top three items are deploy scheduling, faster pipeline logs, and better access portal notifications.",
    ],
    asks: [
      "Could you help prioritize these requests against the rest of the {quarter} roadmap?",
      "Would you be OK with retiring the old release notes tool at the end of the quarter?",
      "Can you confirm whether scheduled deploys are on the roadmap?",
      "Can you review the tooling roadmap by {weekday}?",
      "Would you be OK with us adding an environment confirmation step in {tool}?",
    ],
    replies: [
      "Pagination for the overview page is a small fix. I can have it done by {weekday}.",
      "Scheduled deploys are already half-built. We paused them for the pipeline work but could pick them up again.",
      "I talked to the people still using the old tool. They are fine moving if we help migrate their templates.",
      "Approver reminders are the most requested feature in the access portal by far.",
      "An environment confirmation step for prod sounds good, but I would not add it for {env}, it will just annoy people.",
      "The overview page now loads in under two seconds.",
      "We could color-code environments in the UI. Red for prod would make mistakes much less likely.",
      "I would love to see better search in the pipeline logs. Finding the failing step takes too long.",
    ],
    myReplies: [
      "Retire the old tool at the end of the quarter. Help the remaining users move.",
      "Scheduled deploys go on the {quarter} roadmap. That is a clear win for on-call.",
      "Add the confirmation step for prod only, and add the color coding too.",
      "Reviewed the roadmap. The priorities look right; I would move log search above notifications.",
      "Thanks for the detailed feedback. This is exactly what we need to hear.",
      "Good fix on pagination. Please let the {team} team know.",
    ],
    closers: [
      "Thanks, added to the roadmap.",
      "Great, I will let the team know.",
      "Done, the fix is live.",
      "Thanks Alex, retirement is announced.",
      "Sounds good, the roadmap is updated.",
    ],
  },
  {
    key: "vendor-qbr",
    subjects: [
      "Scheduling our {quarter} business review",
      "QBR agenda and usage report",
      "Quarterly review: roadmap preview and renewal",
      "Follow-up from our quarterly business review",
      "Executive sponsor check-in for {quarter}",
      "Proposed dates for the next QBR",
    ],
    starter: "vendor",
    people: ["kevin", "laura", "anika", "megan", "yuki", "rebecca", "ingrid", "carlos", "monica"],
    openers: [
      "It is that time again, and we would love to schedule the {quarter} business review with you and your team. We usually cover usage, support trends, our roadmap, and anything you would like to see from us.",
      "Ahead of our quarterly review, I have attached the usage report for the last quarter. Usage grew about 24%, mostly from the {team} team, and support tickets were down compared to last quarter.",
      "As we approach your renewal, we would like to use the QBR to walk through the roadmap and discuss options for the next term. We have a couple of new capabilities that fit what your team asked about last time.",
      "Thank you for the time at our quarterly review. As promised, I am following up with the action items we captured and the answers to the questions we could not cover in the meeting.",
      "Our executive sponsor would like to join this quarter's review to hear directly how the partnership is going and where we can do better.",
      "I would like to propose a few times for our next QBR. We can do it remotely or in person at your office, whichever is more convenient for your team.",
    ],
    asks: [
      "Would {weekday} afternoon work for a 60-minute review?",
      "Could you let us know which topics you would most like covered?",
      "Can you confirm who from your side should attend?",
      "Would you be open to an in-person session at your office this time?",
      "Could you share any feedback on support responsiveness before the review?",
    ],
    replies: [
      "I have sent a calendar invite for the proposed slot. Let me know if anything changes.",
      "We will bring our solutions architect to cover the roadmap items your team asked about.",
      "The usage report is attached again for convenience, including a breakdown by team.",
      "Thanks for the feedback on support. We have already adjusted our escalation path based on it.",
      "Our team is happy to come on site. We can book {room} if that is easiest.",
      "Regarding the renewal, we can offer pricing protection for a multi-year term.",
      "The two open support cases from last quarter are now resolved. Details are in the follow-up notes.",
      "We will send the slides 48 hours ahead so your team has time to review.",
    ],
    myReplies: [
      "{weekday} works. Please keep it to 45 minutes and focus on the roadmap and support trends.",
      "From our side it will be me, Priya, and someone from Procurement.",
      "Remote is easier for us this quarter. Please send the slides in advance.",
      "The main topic for us is reliability. We had two incidents last quarter that involved your service and I would like to discuss them.",
      "Thanks for the follow-up notes. I will share them with the team.",
      "Let's leave the renewal discussion for a separate call with Procurement.",
    ],
    closers: [
      "Great, invite sent. Looking forward to it.",
      "Thank you, we will prepare the agenda accordingly.",
      "Perfect, slides will follow shortly.",
      "Thanks Alex, see you then.",
      "Appreciate it. We will be in touch about the renewal separately.",
    ],
    labels: ["Vendors"],
  },
];

// ===========================================================================
// bulk
// ===========================================================================


// ---------------------------------------------------------------------------
// Newsletters
// ---------------------------------------------------------------------------

export const NEWSLETTERS: NewsletterDef[] = [
  {
    key: "infraweekly",
    fromName: "Infra Weekly",
    fromEmail: "newsletter@infraweekly.example",
    listId: "Infra Weekly <weekly.infraweekly.example>",
    unsubMailto: "mailto:unsubscribe@infraweekly.example?subject=unsubscribe",
    unsubUrl: "https://infraweekly.example/unsubscribe",
    category: "updates",
    everyDays: 7,
    subjects: [
      "Infra Weekly #{n}: {headline}",
      "Infra Weekly #{n} — {headline}",
      "#{n}: {headline} (and 11 more links)",
      "Infra Weekly #{n}",
      "{headline} | Infra Weekly #{n}",
      "This week in infrastructure: {headline}",
      "Infra Weekly #{n}: the one where we talk about DNS again",
      "Infra Weekly #{n}: {headline}, plus a postmortem worth reading",
    ],
    intros: [
      "Hi there — welcome back. This week was heavy on storage and light on drama, which is exactly how we like it. Grab a coffee; the postmortem in slot three is a good one.",
      "Another week, another control plane upgrade. We read about forty incident reviews so you don't have to, and picked the handful that actually teach something.",
      "Quick housekeeping: thanks to everyone who answered last week's reader survey. The top request was more hands-on material, so you'll see a few more walkthroughs below.",
      "If you only click one link this week, make it the piece on retry budgets. It reframes a problem most of us have been solving the wrong way.",
      "Short issue this time — a lot of the community was heads-down on conference talks. The quality more than makes up for it.",
      "We've been noticing a theme lately: teams quietly moving workloads off the shiny thing and back onto boring, well-understood infrastructure. Several links below touch on why.",
      "Welcome to the new subscribers who joined after Tuesday's meetup. Every week we send a dozen links on running production systems — no vendor pitches, no fluff.",
    ],
    items: [
      { title: "Postgres 17 logical replication slots survive failover — what changes for your runbooks", blurb: "Failover-safe slots remove one of the nastiest manual steps in a primary promotion. The author walks through which checks you can delete and which ones you still need.", tag: "Postgres" },
      { title: "Why your p99 lies: coordinated omission explained", blurb: "A clear, diagram-heavy explanation of how most load generators under-report tail latency, and two ways to fix your benchmarks.", tag: "Performance" },
      { title: "Retry budgets beat exponential backoff (most of the time)", blurb: "Backoff protects one client; a retry budget protects the whole fleet. A practical guide to capping retries at ten percent of traffic.", tag: "Reliability" },
      { title: "Postmortem: the cron job that deleted half a cluster's PVCs", blurb: "A cleanup script matched on a label that a new team had also started using. Excellent writing on how ownership boundaries blur over time.", tag: "Incidents" },
      { title: "Kubernetes pod disruption budgets you can actually reason about", blurb: "Most PDBs in the wild are either useless or block every node drain. Here's a decision table for picking minAvailable versus maxUnavailable.", tag: "Kubernetes" },
      { title: "Kafka consumer lag is a symptom, not a metric", blurb: "Lag tells you something is wrong but rarely what. The author proposes tracking time-to-process instead and shows the dashboards.", tag: "Kafka" },
      { title: "Terraform state surgery without tears", blurb: "Moving resources between workspaces is still scary. A step-by-step approach using moved blocks and a dry-run plan diff.", tag: "Terraform" },
      { title: "eBPF for the rest of us: tracing slow DNS lookups in production", blurb: "No kernel hacking required. A ten-line bpftrace script finds the pods that are hammering the resolver.", tag: "eBPF" },
      { title: "The hidden cost of sidecars", blurb: "Memory overhead is the obvious part. Startup ordering, resource accounting and noisy upgrades are the less obvious parts.", tag: "Service Mesh" },
      { title: "OpenTelemetry tail sampling at scale: lessons from 2M spans per second", blurb: "Collector topology matters more than sampler configuration. Load-balancing exporters by trace ID were the turning point.", tag: "Observability" },
      { title: "Introducing driftwatch: a tiny daemon that alerts on config drift", blurb: "A new open-source project that compares live cluster objects against your Git repository and posts a diff to chat.", tag: "Open Source" },
      { title: "Your health checks are lying to your load balancer", blurb: "A liveness probe that checks the database will take your whole fleet out when the database blips. Separate the concerns.", tag: "Reliability" },
      { title: "Capacity planning with nothing but a spreadsheet", blurb: "Forget fancy forecasting tools. Three columns and a growth assumption will get you ninety percent of the way.", tag: "Capacity" },
      { title: "What we learned running Postgres on local NVMe", blurb: "Performance was spectacular. Recovery after node loss was not. A frank write-up of the trade-offs.", tag: "Postgres" },
      { title: "Graceful shutdown is a feature, so test it like one", blurb: "SIGTERM handling, connection draining and preStop hooks, with a test harness you can drop into CI.", tag: "Kubernetes" },
      { title: "The case for fewer, bigger clusters", blurb: "Cluster sprawl creates more toil than it removes. One team's journey consolidating from forty clusters to six.", tag: "Kubernetes" },
      { title: "DNS TTLs: the knob nobody remembers until an outage", blurb: "Low TTLs aren't free, high TTLs aren't safe. A sensible default and how to change it before a migration.", tag: "Networking" },
      { title: "Inside a multi-region Kafka migration", blurb: "Mirroring, offset translation and the cutover weekend, told by the people who were on call for it.", tag: "Kafka" },
      { title: "Alert fatigue is a design problem", blurb: "If a page doesn't need a human within fifteen minutes, it isn't a page. A framework for auditing your alert catalogue.", tag: "On-call" },
      { title: "Writing runbooks that people read at 3 a.m.", blurb: "Short sentences, copy-pasteable commands and a clear 'stop and escalate' line. Templates included.", tag: "On-call" },
      { title: "ARM nodes in production: the good, the bad, the multi-arch images", blurb: "Cost savings were real, but the build pipeline needed a serious rethink. Practical tips for buildx and manifest lists.", tag: "Compute" },
      { title: "Benchmarking object storage gateways honestly", blurb: "Small-object workloads behave nothing like large-object ones. The author shares a reproducible methodology.", tag: "Storage" },
      { title: "Service mesh vs. no mesh: a year later", blurb: "One platform team removed their mesh entirely and replaced it with mTLS at the library layer. Their reasons are worth hearing.", tag: "Service Mesh" },
      { title: "Connection pooling is still the number one Postgres outage cause", blurb: "A survey of incident reports finds that exhausted connections beat every other root cause combined.", tag: "Postgres" },
      { title: "How to run a game day without breaking trust", blurb: "Announce it, scope it, and have an abort button. A facilitator's checklist from a team that has run fifty of them.", tag: "Chaos Engineering" },
      { title: "The quiet rise of cell-based architecture", blurb: "Blast-radius reduction is moving from hyperscaler blog posts into mid-size companies. What a cell actually looks like on the ground.", tag: "Architecture" },
      { title: "Release notes: kubeflare 0.9 adds per-namespace rate limits", blurb: "The lightweight ingress controller finally gets the feature its users asked for most, along with a cleaner CRD.", tag: "Open Source" },
      { title: "Secrets rotation without downtime", blurb: "Dual-credential windows, versioned secrets and a rollout order that keeps every service happy.", tag: "Security" },
      { title: "Understanding cgroup v2 memory pressure signals", blurb: "PSI metrics give you early warning before the OOM killer arrives. Here's how to wire them into autoscaling.", tag: "Linux" },
      { title: "Reading a flame graph in five minutes", blurb: "A beginner-friendly guide that finally explains why the widest box isn't always the problem.", tag: "Performance" },
      { title: "GitOps rollbacks are harder than you think", blurb: "Reverting a commit doesn't revert a migration. A pattern for pairing schema changes with app deploys safely.", tag: "GitOps" },
      { title: "Talk recap: 'Boring Technology, Ten Years On'", blurb: "The original argument holds up remarkably well, with a few updates for a world of managed services.", tag: "Culture" },
      { title: "Cost-aware autoscaling with spot capacity", blurb: "Interruption handling, fallback node pools and the scheduler tweaks that made spot safe for stateless tiers.", tag: "Cost" },
      { title: "When to shard Postgres (and when to just buy a bigger box)", blurb: "A refreshingly honest look at vertical scaling limits in an era of very large instances.", tag: "Postgres" },
    ],
    ctas: ["Read the full story", "Read more", "View the postmortem", "See all links", "Open on the web"],
    accent: "#1f6feb",
    layout: "digest",
  },
  {
    key: "srebrief",
    fromName: "The SRE Brief",
    fromEmail: "brief@srebrief.example",
    listId: "The SRE Brief <brief.srebrief.example>",
    unsubMailto: "mailto:leave@srebrief.example?subject=unsubscribe",
    unsubUrl: "https://srebrief.example/unsubscribe",
    category: "updates",
    everyDays: 7,
    subjects: [
      "The SRE Brief #{n}: {headline}",
      "SRE Brief #{n} — {headline}",
      "{headline}",
      "The SRE Brief, issue {n}",
      "Issue {n}: {headline} + three incident reviews",
      "The SRE Brief #{n}: SLOs, toil and one very long outage",
      "This week's brief: {headline}",
    ],
    intros: [
      "Good morning, reliability folks. Three incident reviews this week, all of them involving certificates in some way. We're starting to think certificates are the final boss.",
      "This issue leans into the human side of SRE — on-call health, handoffs and how to say no to a launch without becoming the villain.",
      "A reader asked us last week how to sell SLOs to a skeptical product org. We collected the best answers from the community and put them up top.",
      "Fewer links than usual this week, but each one is meaty. Block out an hour for the error-budget policy piece.",
      "Welcome aboard if you're new here: one email a week, curated by working SREs, no sponsored content in the main section.",
      "It was a busy week for public outage reports. We picked the two with the most transferable lessons and skipped the ones that boiled down to 'someone fat-fingered a config'.",
    ],
    items: [
      { title: "Error budgets only work if someone is allowed to spend them", blurb: "An error-budget policy that never pauses a launch is just a dashboard. How one team wrote a policy leadership actually honoured.", tag: "SLOs" },
      { title: "The expired intermediate certificate that took down checkout", blurb: "The leaf was fine. The chain was not. A tight write-up with a monitoring query you can steal.", tag: "Incidents" },
      { title: "Toil budgets: capping repetitive work at a third of the week", blurb: "How to measure toil without timesheets, and what to do when the number is embarrassing.", tag: "Toil" },
      { title: "Multi-window, multi-burn-rate alerts in plain English", blurb: "The math behind modern SLO alerting, explained without a single Greek letter.", tag: "Alerting" },
      { title: "On-call compensation: what the community told us", blurb: "Results from a reader survey of four hundred engineers on stipends, time off in lieu and follow-the-sun rotations.", tag: "On-call" },
      { title: "Incident commander is a role, not a rank", blurb: "Why your most senior engineer is often the worst choice to run the bridge, and how to train new ICs.", tag: "Incident Response" },
      { title: "Writing blameless postmortems that still assign action items", blurb: "Blameless doesn't mean ownerless. A template that keeps the tone humane and the follow-ups concrete.", tag: "Postmortems" },
      { title: "SLIs for batch pipelines", blurb: "Availability and latency don't map neatly to nightly jobs. Freshness and correctness SLIs fill the gap.", tag: "SLOs" },
      { title: "The rise of the 'reliability review' in launch checklists", blurb: "Lightweight production-readiness reviews are replacing heavyweight gates. Here's a twelve-question version.", tag: "Process" },
      { title: "A field guide to cascading failures", blurb: "Retry storms, thundering herds and metastable states, each illustrated with a real (anonymised) incident.", tag: "Reliability" },
      { title: "Status pages: how much to say, and when", blurb: "Communication during an outage is a skill. Example updates from good, bad and painfully vague status pages.", tag: "Communication" },
      { title: "Shadow on-call: onboarding without the panic", blurb: "Two weeks of shadowing, one week of reverse-shadowing, then the pager. A rotation design that new hires love.", tag: "On-call" },
      { title: "Your SLO target is probably too high", blurb: "Four nines sounds great until you price it. A worksheet for picking a target your users will actually notice.", tag: "SLOs" },
      { title: "Load shedding at the edge with priority queues", blurb: "Drop the background sync before you drop the checkout request. Implementation notes from a payments team.", tag: "Reliability" },
      { title: "Postmortem: a leap-second-style bug in a homegrown scheduler", blurb: "Clock assumptions bite again. The fix was three lines; the investigation took two days.", tag: "Incidents" },
      { title: "Measuring MTTR is mostly measuring your detection", blurb: "Time-to-detect dominates time-to-resolve. Investing in better signals beats faster runbooks.", tag: "Metrics" },
      { title: "Chaos experiments for teams that aren't ready for chaos", blurb: "Start with read-only experiments: kill a pod in staging, watch the dashboards, write down what surprised you.", tag: "Chaos Engineering" },
      { title: "Tracing a latency regression through six services", blurb: "A detective story told entirely through trace waterfalls. The culprit was a logging library.", tag: "Observability" },
      { title: "Pager hygiene: the quarterly alert review", blurb: "Delete, demote or document. A ninety-minute ritual that cut one team's pages by sixty percent.", tag: "Alerting" },
      { title: "When the dependency is the outage", blurb: "Strategies for living with third-party APIs you can't control: timeouts, circuit breakers and graceful degradation.", tag: "Reliability" },
      { title: "SRE without a dedicated SRE team", blurb: "Embedding reliability practices in product teams when headcount says no.", tag: "Org Design" },
      { title: "Introducing slobot: SLO reports straight to your team channel", blurb: "A small open-source tool that posts weekly budget burn summaries. Configuration is a single YAML file.", tag: "Open Source" },
      { title: "The handoff document that saved our follow-the-sun rotation", blurb: "A five-field template for passing context between regions without losing the thread.", tag: "On-call" },
      { title: "Dependency maps that stay up to date", blurb: "Generate them from traces, not from wikis. A walkthrough using OpenTelemetry service graphs.", tag: "Observability" },
      { title: "Burnout is an operational risk", blurb: "Treat on-call fatigue like any other reliability signal: measure it, alert on it, and fix the root cause.", tag: "Culture" },
      { title: "Canary analysis that doesn't cry wolf", blurb: "Statistical tests for canary verdicts, and why comparing against a fresh baseline matters.", tag: "Deployments" },
      { title: "The anatomy of a good incident timeline", blurb: "Timestamps, actors and decisions. Why 'what we knew at the time' is the most important column.", tag: "Postmortems" },
      { title: "Reliability roadmaps: getting toil work onto the plan", blurb: "Framing reliability investments in terms product managers understand: risk, revenue and customer trust.", tag: "Process" },
      { title: "Lessons from a forty-hour regional outage", blurb: "A remarkably candid public review covering failover that didn't, and the decision to stop trying.", tag: "Incidents" },
      { title: "Synthetic monitoring: what to probe and what to skip", blurb: "Probes for every endpoint generate noise. Probe the user journeys that make money.", tag: "Monitoring" },
      { title: "Why we stopped measuring uptime", blurb: "Uptime hid partial failures. Request-based SLIs exposed them, and changed priorities overnight.", tag: "SLOs" },
      { title: "The SRE interview loop, rebuilt", blurb: "Replacing trivia with a realistic troubleshooting exercise. Candidates and interviewers both preferred it.", tag: "Career" },
    ],
    ctas: ["Read the full story", "Read the review", "Continue reading", "Share this issue"],
    accent: "#d9480f",
    layout: "digest",
  },
  {
    key: "pedigest",
    fromName: "Platform Engineering Digest",
    fromEmail: "digest@platformcommunity.example",
    listId: "Platform Engineering Community Digest <digest.platformcommunity.example>",
    unsubMailto: "mailto:digest-unsubscribe@platformcommunity.example?subject=unsubscribe",
    unsubUrl: "https://platformcommunity.example/settings/digest",
    category: "forums",
    everyDays: 14,
    subjects: [
      "Platform Engineering Digest #{n}: {headline}",
      "Top threads this fortnight: {headline}",
      "Community Digest #{n} — {headline}",
      "Your fortnightly digest: {headline}",
      "Digest #{n}: hot threads, new members and a meetup near you",
      "{headline} (and 24 other discussions)",
    ],
    intros: [
      "Here's what the community was talking about over the last two weeks. The golden-paths thread blew past two hundred replies, so we've summarised the highlights.",
      "Welcome to the digest. Over three hundred new members joined since last time — say hello in the introductions channel.",
      "A lively fortnight: two heated debates about internal developer portals, one surprisingly wholesome thread about first on-call shifts, and a lot of Terraform questions.",
      "Reminder: the community runs on volunteers. If a thread below helped you, consider answering one question this week in return.",
      "The most-bookmarked post this round was a member's platform team charter, shared in full. It's linked first below.",
      "We've tweaked the digest format based on your feedback — threads are now grouped by tag, and solved questions are marked.",
    ],
    items: [
      { title: "Thread: What does your platform team charter actually say?", blurb: "Members share their charters, from one-paragraph mission statements to full RACI matrices. 214 replies.", tag: "Org Design" },
      { title: "Ask: How do you measure developer experience without surveys?", blurb: "Suggestions range from lead time for changes to counting 'how do I' messages in support channels.", tag: "DevEx" },
      { title: "Show and tell: our golden path for new services in under ten minutes", blurb: "A member demos their template repository, CI wiring and one-click staging environment.", tag: "Golden Paths" },
      { title: "Debate: Should the platform team own the internal developer portal?", blurb: "Strong opinions on both sides. The consensus: someone has to own the catalogue data, or the portal rots.", tag: "IDP" },
      { title: "Solved: Terraform module versioning across 60 repositories", blurb: "A tidy answer involving a private registry, semantic versioning and a bot that opens upgrade PRs.", tag: "Terraform" },
      { title: "Ask: Platform as a product — who is your product manager?", blurb: "Most teams don't have one. The few that do explain what changed.", tag: "Product Thinking" },
      { title: "Thread: Your first platform hire should be…", blurb: "A friendly argument between 'a generalist SRE' and 'someone who loves writing docs'.", tag: "Hiring" },
      { title: "Meetup recap: Platform Night, East Bay chapter", blurb: "Slides and recordings from three lightning talks on self-service databases, cost dashboards and paved roads.", tag: "Events" },
      { title: "Solved: Multi-tenant Kubernetes namespaces with sane quotas", blurb: "A member shares their LimitRange and ResourceQuota defaults, plus how they handle exceptions.", tag: "Kubernetes" },
      { title: "Ask: How do you deprecate a paved road?", blurb: "Advice on sunset timelines, migration tooling and the art of the gentle nag.", tag: "Golden Paths" },
      { title: "Thread: Scorecards — motivating or demoralising?", blurb: "Service maturity scorecards get a mixed review. Framing them as help rather than grades seems to matter.", tag: "DevEx" },
      { title: "Show and tell: ephemeral preview environments on every pull request", blurb: "Namespace-per-PR with automatic teardown after merge. Costs and pitfalls discussed openly.", tag: "Environments" },
      { title: "Ask: Build vs. buy for internal developer portals", blurb: "Members compare open-source frameworks with hosted options and a few brave homegrown builds.", tag: "IDP" },
      { title: "Solved: Getting secrets into CI without long-lived tokens", blurb: "Workload identity federation and short-lived credentials. A step-by-step answer marked as accepted.", tag: "Security" },
      { title: "Thread: What's in your platform team's on-call rotation?", blurb: "Some teams page for CI outages, some don't. A useful breakdown of what counts as platform-critical.", tag: "On-call" },
      { title: "Ask: How do you handle the 'just give me a VM' crowd?", blurb: "Empathy, an escape hatch and clear support boundaries were the top suggestions.", tag: "Culture" },
      { title: "Show and tell: a CLI that wraps every platform workflow", blurb: "One binary for creating services, requesting databases and tailing logs. Built in a hackathon, now used by 400 engineers.", tag: "Tooling" },
      { title: "Thread: Platform team size relative to engineering org", blurb: "Ratios reported by members range from 1:8 to 1:30. Context matters more than the number.", tag: "Org Design" },
      { title: "Solved: Helm vs. Kustomize for a mid-size platform", blurb: "The accepted answer: Helm for third-party charts, Kustomize for your own services. Reasoning included.", tag: "Kubernetes" },
      { title: "Ask: Documentation that developers actually read", blurb: "Docs-as-code, search that works and tutorials over reference material.", tag: "Documentation" },
      { title: "Thread: The hardest conversation you've had as a platform lead", blurb: "Stories about saying no to a VP, retiring a beloved tool and inheriting a mess.", tag: "Leadership" },
      { title: "Show and tell: cost showback dashboards per team", blurb: "Tagging strategy, allocation rules and the surprising behaviour change once teams could see their own bill.", tag: "Cost" },
      { title: "Ask: Running a platform team survey — what questions work?", blurb: "Members share their favourite questions, including the deceptively simple 'what slowed you down last week?'.", tag: "DevEx" },
      { title: "Solved: Rolling out OpenTelemetry auto-instrumentation org-wide", blurb: "Start with one language, ship a default collector config and make the opt-out explicit.", tag: "Observability" },
      { title: "Thread: Are internal platforms becoming too opinionated?", blurb: "A thoughtful discussion about flexibility versus consistency, and where to draw the line.", tag: "Product Thinking" },
      { title: "Ask: Migrating 200 services to a new CI system", blurb: "Strategies for incremental migration, dual-running pipelines and keeping teams on side.", tag: "CI/CD" },
      { title: "Show and tell: self-service Postgres with guardrails", blurb: "A request form that provisions a database with backups, monitoring and sensible connection limits by default.", tag: "Databases" },
      { title: "Thread: Introduce yourself — new members this fortnight", blurb: "Welcome to everyone who joined. Lots of folks moving from SRE into platform roles this time.", tag: "Community" },
      { title: "Ask: How do you get budget for platform work?", blurb: "Tie it to lead time, incident reduction and onboarding speed. Several members share their pitch decks.", tag: "Leadership" },
      { title: "Solved: Policy-as-code without blocking every deploy", blurb: "Run policies in warn mode first, publish the results and only enforce once violations are near zero.", tag: "Governance" },
      { title: "Event: Virtual office hours with the community moderators", blurb: "Bring your platform questions to an informal video call next Thursday. No slides, no recording.", tag: "Events" },
      { title: "Thread: Metrics you show your exec team", blurb: "Deployment frequency, change failure rate and one bespoke 'developer happiness' number came up most.", tag: "Metrics" },
    ],
    ctas: ["Join the discussion", "View thread", "See all threads", "Reply in the forum", "RSVP"],
    accent: "#7048e8",
    layout: "digest",
  },
  {
    key: "cloudcost",
    fromName: "CloudCost Insider",
    fromEmail: "insider@cloudcostinsider.example",
    listId: "CloudCost Insider <insider.cloudcostinsider.example>",
    unsubMailto: "mailto:unsubscribe@cloudcostinsider.example?subject=unsubscribe",
    unsubUrl: "https://cloudcostinsider.example/preferences/unsubscribe",
    category: "updates",
    everyDays: 7,
    subjects: [
      "CloudCost Insider #{n}: {headline}",
      "{headline}",
      "Insider #{n} — {headline}",
      "Your weekly FinOps briefing: {headline}",
      "CloudCost Insider #{n}: where the money went this week",
      "Issue {n}: {headline}",
      "#{n}: committed-use math, egress surprises and more",
    ],
    intros: [
      "Hello, cost-conscious friends. This week's theme is egress — the line item that everyone forgets until finance asks about it.",
      "We spent the week digging into reserved-capacity strategies, and the short version is: commit to less than you think, more often.",
      "A reader sent us a bill with a five-figure line item for idle load balancers. We've anonymised it and turned it into this week's lead story.",
      "Welcome to the newsletter for engineers who've been asked 'why did the cloud bill go up?' and didn't love the experience.",
      "Lots of practical material this week, including a tagging policy you can adapt in an afternoon.",
      "Budget season is coming for many of you. We've front-loaded the forecasting pieces so you're ready for the spreadsheet conversations.",
    ],
    items: [
      { title: "The five-figure idle load balancer bill, explained", blurb: "Forgotten test environments, orphaned listeners and a missing teardown step. A cautionary tale with a cleanup script.", tag: "Waste" },
      { title: "Egress costs: the line item you didn't plan for", blurb: "Cross-zone traffic, NAT gateways and chatty replication streams add up fast. How to find the worst offenders.", tag: "Networking" },
      { title: "Commit to less, more often: a smarter reservation ladder", blurb: "Staggering smaller commitments across the year reduces regret without giving up much discount.", tag: "Commitments" },
      { title: "Tagging policies that survive contact with engineers", blurb: "Three required tags, enforced at creation time, with a friendly bot for the stragglers.", tag: "Governance" },
      { title: "Unit economics: cost per request is the only number execs remember", blurb: "Translating a cloud bill into cost per customer, order or API call makes trade-offs obvious.", tag: "Unit Economics" },
      { title: "Kubernetes cost allocation without a vendor tool", blurb: "Request-based allocation, idle cost distribution and a Prometheus query that does most of the work.", tag: "Kubernetes" },
      { title: "Storage tiering: moving cold data before it becomes expensive", blurb: "Lifecycle rules for object storage, and the retrieval costs that catch teams out.", tag: "Storage" },
      { title: "Why your dev environments cost more than production", blurb: "Always-on staging, oversized instances and a dozen forgotten preview stacks. Schedules fix most of it.", tag: "Waste" },
      { title: "Rightsizing databases without risking an outage", blurb: "Look at p95 CPU and memory over a month, not a week. Then downsize one step at a time.", tag: "Databases" },
      { title: "The FinOps maturity model, minus the jargon", blurb: "Crawl, walk, run reduced to concrete practices you can adopt this quarter.", tag: "FinOps" },
      { title: "Spot instances for CI runners: a worked example", blurb: "A team cut build costs by two thirds with interruption-tolerant runners and a small on-demand fallback pool.", tag: "Compute" },
      { title: "Forecasting cloud spend with a simple growth model", blurb: "Baseline, growth rate and known events. Good enough for budgeting, honest about uncertainty.", tag: "Forecasting" },
      { title: "Logging bills are out of control — here's a triage plan", blurb: "Drop debug logs at the edge, sample high-volume info logs and shorten retention for noisy services.", tag: "Observability" },
      { title: "Showback vs. chargeback: which one changes behaviour?", blurb: "Showback builds awareness; chargeback builds resentment. Most orgs should start with the former.", tag: "FinOps" },
      { title: "Anatomy of a surprise bill: the runaway autoscaler", blurb: "A misconfigured metric scaled a service to four hundred nodes overnight. Guardrails that would have caught it.", tag: "Incidents" },
      { title: "Managed services: hidden premium or hidden savings?", blurb: "Factor in on-call time and upgrade toil and the math changes. A calculator template included.", tag: "Architecture" },
      { title: "Budgets and anomaly alerts that don't spam you", blurb: "Daily anomaly detection on service-level spend, with thresholds tuned to your normal variance.", tag: "Alerting" },
      { title: "Data transfer between regions: designing it out", blurb: "Read replicas, caching and regional affinity keep traffic local and bills low.", tag: "Networking" },
      { title: "GPU costs for the uninitiated", blurb: "Utilisation is everything. Notes on sharing, scheduling and the true cost of an idle accelerator.", tag: "Compute" },
      { title: "The quarterly cost review meeting that engineers don't dread", blurb: "Thirty minutes, top five movers, one owner per item. A facilitation guide.", tag: "Process" },
      { title: "Snapshots: the silent storage creep", blurb: "Automated snapshots without retention policies accumulate for years. Find and prune them.", tag: "Storage" },
      { title: "Container image bloat costs more than you'd think", blurb: "Bigger images mean slower scaling and higher registry and transfer costs. Multi-stage builds to the rescue.", tag: "Containers" },
      { title: "Negotiating with your cloud account team", blurb: "What's negotiable, what isn't and how to prepare. Advice from a former procurement lead.", tag: "Procurement" },
      { title: "Serverless cost cliffs", blurb: "Pay-per-request is cheap until it isn't. Where the break-even point sits for common workloads.", tag: "Serverless" },
      { title: "Engineering cost awareness: put the price in the pull request", blurb: "A CI step that estimates the monthly cost of infrastructure changes. Developers love it more than expected.", tag: "Tooling" },
      { title: "Reader question: how do we allocate shared platform costs?", blurb: "Proportional to usage where measurable, evenly split where not, and documented either way.", tag: "FinOps" },
      { title: "Idle IP addresses and other tiny charges that add up", blurb: "A checklist of small line items worth a quarterly sweep.", tag: "Waste" },
      { title: "Sustainability and cost: the same lever", blurb: "Efficient workloads use less energy and less money. How some teams report both together.", tag: "Sustainability" },
      { title: "Case study: halving the observability bill in one quarter", blurb: "Cardinality limits, metric relabelling and a frank conversation with the vendor.", tag: "Observability" },
      { title: "Cost ownership in a platform model", blurb: "The platform owns the efficiency of shared services; product teams own their consumption. Making that split explicit.", tag: "Org Design" },
      { title: "Tool roundup: open-source cost explorers compared", blurb: "We tried three community projects for visualising spend. Notes on setup time, accuracy and gaps.", tag: "Tooling" },
    ],
    ctas: ["Read the full story", "Get the template", "Read the case study", "Download the calculator"],
    accent: "#2b8a3e",
    layout: "digest",
  },
  {
    key: "northwindnow",
    fromName: "Northwind Now",
    fromEmail: "internal-comms@northwind.example",
    listId: "Northwind Now <now.northwind.example>",
    unsubMailto: "mailto:internal-comms@northwind.example?subject=unsubscribe%20Northwind%20Now",
    unsubUrl: "https://intranet.northwind.example/comms/preferences",
    category: "updates",
    everyDays: 7,
    subjects: [
      "Northwind Now: {headline}",
      "Northwind Now #{n} — {headline}",
      "This week at Northwind: {headline}",
      "Northwind Now | Issue {n}",
      "Northwind Now: all-hands recap, Bayview update and more",
      "Your weekly Northwind update: {headline}",
      "Northwind Now #{n}: {headline}",
    ],
    intros: [
      "Hi team — here's your weekly roundup of what's happening across Northwind. Big thanks to everyone who joined Thursday's all-hands in person and online.",
      "Happy Friday, Northwind! This week we've got an update on the Bayview campus move, a reminder about benefits enrollment and some well-deserved shout-outs.",
      "Welcome to Northwind Now, your one-stop update on company news. As always, reply to this email if you have a story you'd like us to feature.",
      "It's been a big week. We welcomed forty-two new colleagues, shipped two major releases and raised a record amount for our community partners.",
      "A quick note from the Internal Comms team: we're trying a shorter format. Let us know what you think via the feedback link at the bottom.",
      "Hello everyone! The hackathon results are in, and the quality of projects this time was genuinely impressive. Details below.",
    ],
    items: [
      { title: "Benefits enrollment closes next Friday", blurb: "Review your medical, dental and vision elections in the People Portal before the window closes. New this year: an expanded mental health stipend.", tag: "Benefits" },
      { title: "Bayview campus move: phase one dates confirmed", blurb: "Engineering, Product and Design move to Building B over two weekends. Pack your desk by Thursday evening; crates arrive Monday.", tag: "Workplace" },
      { title: "Please welcome our new VP of Customer Success", blurb: "Danielle Osei joins us after leading support operations at a large logistics company. She'll be hosting coffee chats with every team over her first month.", tag: "People" },
      { title: "Hackathon winners announced", blurb: "First place went to 'Ghostwriter', a tool that drafts release notes from merged PRs. Runners-up included a carbon dashboard and an office-plant watering bot.", tag: "Hackathon" },
      { title: "All-hands recap: strategy, numbers and your questions", blurb: "Renata walked through the platform roadmap, Helen shared the quarterly results and the Q&A ran twenty minutes over. Recording is on the intranet.", tag: "All-Hands" },
      { title: "New parking and shuttle options at Bayview", blurb: "The campus shuttle runs every fifteen minutes from the transit station. EV chargers are available on level two of the garage.", tag: "Workplace" },
      { title: "Learning week: sign up for workshops", blurb: "Sessions on public speaking, negotiation, SQL for non-engineers and more. Spots are limited, so register early.", tag: "Learning" },
      { title: "Giving campaign hits a record total", blurb: "Thanks to your generosity and the company match, we've raised more than ever for our local food bank and coding-education partners.", tag: "Community" },
      { title: "Security reminder: report suspicious emails", blurb: "Phishing attempts are up. Use the 'Report phish' button in your mail client, and never share codes sent to your phone.", tag: "Security" },
      { title: "Meet the team: Platform Engineering", blurb: "This week's spotlight goes to Alex Morgan's group, the folks behind our deployment pipeline and the shiny new developer portal.", tag: "Spotlight" },
      { title: "Open enrollment office hours", blurb: "Benefits specialists will be in the Bayview atrium on Tuesday and Wednesday afternoons to answer questions in person.", tag: "Benefits" },
      { title: "Quarterly performance check-ins start soon", blurb: "Managers, look out for the updated template in the People Portal. The new format is shorter and focuses on growth goals.", tag: "People" },
      { title: "Cafeteria update: new vendors at Bayview", blurb: "A rotating lineup of local food trucks joins the main café, plus a dedicated allergy-friendly station.", tag: "Workplace" },
      { title: "Kudos corner", blurb: "Shout-out to the Data Platform team for a smooth warehouse migration, and to Inês Duarte for keeping the release train on schedule.", tag: "Recognition" },
      { title: "Employee resource groups: open house next Wednesday", blurb: "Learn about our ERGs, meet the leads and find out how to get involved. Snacks provided.", tag: "Community" },
      { title: "Updated travel policy now live", blurb: "Booking through the travel portal is now required for flights. Rail is preferred for trips under four hours.", tag: "Policy" },
      { title: "Northwind wins a regional workplace award", blurb: "We've been recognised for flexible working and parental leave policies. Thank you to everyone who took part in the survey.", tag: "Company" },
      { title: "Customer story: how a regional retailer cut fulfilment time by a third", blurb: "Our Sales and Solutions teams share how a long-time customer rolled out our platform across forty stores.", tag: "Customers" },
      { title: "IT notice: laptop refresh program", blurb: "If your laptop is more than three years old, you're eligible for a replacement. Request one through the IT service desk.", tag: "IT" },
      { title: "Volunteer day sign-ups are open", blurb: "Choose from a beach cleanup, a park restoration project or tutoring at a local school. Everyone gets one paid volunteer day per quarter.", tag: "Community" },
      { title: "New hire orientation moves to Bayview", blurb: "Starting next week, all orientation sessions will run in the Building A training rooms.", tag: "People" },
      { title: "Wellness challenge: steps, stretches and sleep", blurb: "Join a team and track healthy habits for four weeks. Prizes for the most consistent teams, not just the most steps.", tag: "Wellness" },
      { title: "Engineering blog: three new posts", blurb: "Read about our move to OpenTelemetry, a deep dive on database failover and a reflection on our first year of platform-as-a-product.", tag: "Engineering" },
      { title: "Reminder: expense reports due by the fifth working day", blurb: "Submit receipts through the finance portal. Late submissions roll into the following cycle.", tag: "Finance" },
      { title: "Lunch and learn: product roadmap preview", blurb: "Product leadership will walk through upcoming features. Bring your lunch and your questions to the Bayview auditorium.", tag: "Learning" },
      { title: "Mentorship program: applications open", blurb: "Pair up with a mentor from another department for a six-month program. Mentors are needed too!", tag: "Learning" },
      { title: "Bayview campus: accessibility features", blurb: "Quiet rooms, height-adjustable desks throughout and a wellness room on every floor. Request accommodations through Workplace Services.", tag: "Workplace" },
      { title: "Leadership change in Sales Operations", blurb: "After eight years, Tomás Herrera is moving into a new strategic partnerships role. An interim lead will be announced shortly.", tag: "People" },
      { title: "Holiday party save-the-date", blurb: "Mark your calendars for an evening at the Bayview atrium. Details and RSVP link to follow.", tag: "Events" },
      { title: "Survey results: what you told us about hybrid work", blurb: "Most of you prefer two to three office days. We're piloting team anchor days starting next month.", tag: "Workplace" },
      { title: "Referral bonus increased for engineering roles", blurb: "Know someone great? Referral bonuses for hard-to-fill engineering roles have doubled for the rest of the quarter.", tag: "Hiring" },
      { title: "Sustainability update: Bayview runs on renewable energy", blurb: "The new campus is powered entirely by renewable sources, and we've removed single-use plastics from all kitchens.", tag: "Sustainability" },
    ],
    ctas: ["Read more on the intranet", "Watch the recording", "Sign up", "RSVP now", "Update your benefits"],
    accent: "#0b7285",
    layout: "digest",
  },
  {
    key: "techleaders",
    fromName: "TechLeaders Weekly",
    fromEmail: "editors@techleadersweekly.example",
    listId: "TechLeaders Weekly <weekly.techleadersweekly.example>",
    unsubMailto: "mailto:unsubscribe@techleadersweekly.example?subject=unsubscribe",
    unsubUrl: "https://techleadersweekly.example/account/unsubscribe",
    category: "updates",
    everyDays: 7,
    subjects: [
      "TechLeaders Weekly #{n}: {headline}",
      "{headline}",
      "TechLeaders #{n} — {headline}",
      "For engineering leaders: {headline}",
      "TechLeaders Weekly #{n}: hiring, 1:1s and saying no",
      "Issue {n}: {headline}",
      "TechLeaders Weekly — {headline}",
    ],
    intros: [
      "Hello, leaders. This week's issue is about the unglamorous parts of the job: calibration, hard feedback and the meeting you keep postponing.",
      "Managing managers is a different sport. Several pieces this week tackle the jump from team lead to director, and what nobody tells you about it.",
      "A theme emerged while we were curating: clarity beats charisma. The best leaders in these stories are the ones who wrote things down.",
      "Welcome to the new readers who found us through last week's podcast mention. Every issue is a handful of essays on leading engineering teams, chosen by working leaders.",
      "Planning season is upon many of you. We've gathered the best advice on roadmaps, headcount asks and saying no gracefully.",
      "Short and sharp this week. Five essays, two tools and one question to sit with: what would your team stop doing if you asked them?",
      "Thanks for the replies to last week's issue on layoffs and morale. We've included a few reader perspectives at the end, shared with permission.",
    ],
    items: [
      { title: "The director's first ninety days: listen, map, then move", blurb: "A practical plan for new directors that resists the urge to reorganise in week two.", tag: "Leadership" },
      { title: "Calibration meetings that are fair (and don't take all day)", blurb: "Pre-reads, evidence-based ratings and a facilitator who keeps the room honest.", tag: "Performance" },
      { title: "How to give feedback your report won't forget for the wrong reasons", blurb: "Specific, timely, private and kind. With example phrasings for common situations.", tag: "Feedback" },
      { title: "Headcount asks that finance teams say yes to", blurb: "Frame hires in terms of risk reduced and revenue enabled, not tickets closed.", tag: "Planning" },
      { title: "Skip-level 1:1s without undermining your managers", blurb: "Set expectations up front, share themes rather than quotes and close the loop.", tag: "1:1s" },
      { title: "Writing a technical strategy people will actually follow", blurb: "Diagnosis, guiding policy and coherent actions. A template and two anonymised examples.", tag: "Strategy" },
      { title: "The staff engineer and the engineering manager: a partnership guide", blurb: "Who owns technical direction, who owns people, and how to avoid stepping on each other.", tag: "Org Design" },
      { title: "When to reorganise (and when it's just restlessness)", blurb: "A short checklist for testing whether the org chart is really the problem.", tag: "Org Design" },
      { title: "Hiring loops that predict on-the-job performance", blurb: "Work-sample exercises, structured interviews and rubrics written before the first candidate.", tag: "Hiring" },
      { title: "Managing a team through a layoff", blurb: "Honesty about what you know, room for grief and a clear plan for the work that remains.", tag: "People" },
      { title: "Saying no to your boss, respectfully", blurb: "Offer trade-offs instead of refusals. A script for the most common version of this conversation.", tag: "Managing Up" },
      { title: "Roadmaps are communication tools, not contracts", blurb: "Now, next, later. Why confidence bands beat date commitments for anything beyond a quarter.", tag: "Planning" },
      { title: "The hidden cost of context switching for managers", blurb: "Maker time isn't just for engineers. Protect blocks for thinking and writing.", tag: "Productivity" },
      { title: "Running effective incident reviews as a leader", blurb: "Your job is to make it safe to tell the truth. What to say in the first five minutes.", tag: "Culture" },
      { title: "Promotions: sponsorship versus mentorship", blurb: "Mentors give advice; sponsors spend political capital. Underrepresented engineers often get the former but not the latter.", tag: "Career" },
      { title: "Delegation is a skill, not a personality trait", blurb: "The five levels of delegation, and how to tell which one a task needs.", tag: "Leadership" },
      { title: "Building a team operating manual", blurb: "How we work, how we decide, how we disagree. A living document that saves weeks of onboarding.", tag: "Team Health" },
      { title: "Metrics for engineering leaders that don't backfire", blurb: "Use delivery metrics to start conversations, never to rank individuals.", tag: "Metrics" },
      { title: "The quiet underperformer", blurb: "Not every performance problem is loud. Spotting disengagement early and responding with curiosity.", tag: "Performance" },
      { title: "How senior leaders spend their week", blurb: "A survey of sixty directors and VPs on meetings, writing, hiring and recovery time.", tag: "Productivity" },
      { title: "Platform teams and the internal customer", blurb: "Treating developers as customers changes everything, from prioritisation to how you say no.", tag: "Platform" },
      { title: "Remote leadership: making the invisible visible", blurb: "Written updates, recorded demos and deliberate recognition for work that happens off-camera.", tag: "Remote Work" },
      { title: "Budget conversations for engineers who hate budgets", blurb: "Learn three numbers: run rate, cost per unit and growth. Everything else follows.", tag: "Finance" },
      { title: "Career ladders that reward impact, not tenure", blurb: "How to write level expectations that are concrete enough to be useful and flexible enough to be fair.", tag: "Career" },
      { title: "Leading through ambiguity", blurb: "When the strategy isn't clear yet, give your team a clear next step anyway.", tag: "Leadership" },
      { title: "Book notes: an essential read on decision-making under uncertainty", blurb: "Our editor's summary of a new book on making reversible decisions quickly and irreversible ones slowly.", tag: "Books" },
      { title: "Your calendar is your strategy", blurb: "If it's important but not on the calendar, it isn't happening. An audit exercise.", tag: "Productivity" },
      { title: "Building trust with a new peer group", blurb: "Peer directors are your real team. Investing in those relationships early pays off in every planning cycle.", tag: "Managing Up" },
      { title: "Onboarding new managers on your team", blurb: "A thirty-day plan covering expectations, tools, rituals and their first difficult conversation.", tag: "Onboarding" },
      { title: "Reader question: how do I stay technical as a director?", blurb: "Code reviews, architecture reviews and the occasional on-call shadow shift. Pick one and protect it.", tag: "Career" },
      { title: "The art of the weekly update", blurb: "Three sections: what happened, what's next, where I need help. Your stakeholders will thank you.", tag: "Communication" },
      { title: "Handling attrition without panic", blurb: "Exit interviews, stay interviews and spotting patterns before they become a wave.", tag: "People" },
      { title: "Tool spotlight: a lightweight decision log template", blurb: "Capture the context, the options considered and the reasoning. Future you will be grateful.", tag: "Tools" },
    ],
    ctas: ["Read the essay", "Read the full story", "Get the template", "Listen to the episode", "Continue reading"],
    accent: "#5c3d99",
    layout: "digest",
  },
  {
    key: "devtoolsdaily",
    fromName: "DevTools Daily",
    fromEmail: "daily@devtoolsdaily.example",
    listId: "DevTools Daily <daily.devtoolsdaily.example>",
    unsubMailto: "mailto:unsubscribe@devtoolsdaily.example?subject=unsubscribe",
    unsubUrl: "https://devtoolsdaily.example/u",
    category: "updates",
    everyDays: 1,
    subjects: [
      "DevTools Daily #{n}: {headline}",
      "{headline}",
      "Today: {headline}",
      "DevTools Daily — {headline}",
      "#{n} · {headline}",
      "DevTools Daily #{n}",
      "Daily #{n}: five tools, two minutes",
      "{headline} + 4 more",
    ],
    intros: [
      "Five tools, two minutes. Here's today's batch.",
      "Morning. A terminal-heavy one today.",
      "Today's picks lean towards testing and debugging. Enjoy.",
      "Short list, all killer. Reply with your own finds — we read everything.",
      "Happy Friday. One of today's tools is pure fun; we'll let you guess which.",
      "New here? Every weekday we send five developer tools worth a look. That's it.",
    ],
    items: [
      { title: "logsift — grep for structured logs", blurb: "Query JSON log lines with a tiny expression language. Streams from stdin, colours the matches.", tag: "CLI" },
      { title: "tapedeck — record terminal sessions as text", blurb: "Lightweight recordings you can paste into docs or replay in a browser. No video files.", tag: "CLI" },
      { title: "pgwhy — explain plans for humans", blurb: "Paste an EXPLAIN ANALYZE output and get a plain-English summary of where the time went.", tag: "Postgres" },
      { title: "mockline — a local HTTP mock server driven by YAML", blurb: "Define routes, latency and failure rates in one file. Great for testing timeouts.", tag: "Testing" },
      { title: "gitlean — find the files nobody touches", blurb: "Highlights stale code by last-modified date and author, so you know what to delete.", tag: "Git" },
      { title: "kubepeek — a read-only Kubernetes TUI", blurb: "Browse pods, logs and events without any risk of accidentally deleting something.", tag: "Kubernetes" },
      { title: "envcheck — validate your .env against a schema", blurb: "Catches missing and malformed variables before your app boots. Works in CI.", tag: "Config" },
      { title: "diffbeam — side-by-side diffs in the terminal", blurb: "Syntax-aware, word-level highlights, and it handles very long lines gracefully.", tag: "CLI" },
      { title: "flakefinder — rerun tests until they fail", blurb: "Runs a suite repeatedly in parallel and reports which tests are nondeterministic.", tag: "Testing" },
      { title: "tfgraphy — Terraform plans as diagrams", blurb: "Turns a plan into a dependency diagram with changed resources highlighted.", tag: "Terraform" },
      { title: "portwho — what's listening on that port?", blurb: "Cross-platform, one command, shows the process, user and container if there is one.", tag: "CLI" },
      { title: "schemadrift — compare database schemas across environments", blurb: "Spot the column that exists in staging but not production before it bites you.", tag: "Databases" },
      { title: "otelpipe — send OpenTelemetry traces from shell scripts", blurb: "Wrap any command in a span. Surprisingly handy for debugging slow CI steps.", tag: "Observability" },
      { title: "regexplain — regular expressions, annotated", blurb: "Paste a pattern and get a colour-coded breakdown with example matches.", tag: "Utilities" },
      { title: "benchdiff — compare benchmark runs with statistics", blurb: "Tells you whether a change is real or noise, with confidence intervals.", tag: "Performance" },
      { title: "certpeek — inspect TLS certificates from the command line", blurb: "Shows expiry, chain and SANs in one readable view. Warns about upcoming expirations.", tag: "Security" },
      { title: "notebox — a scratchpad that lives in your terminal", blurb: "Quick notes with fuzzy search and Git-backed history. Zero configuration.", tag: "Productivity" },
      { title: "jqplay-local — an offline playground for jq", blurb: "Live-preview your filters against a file. Perfect for wrangling API responses.", tag: "Utilities" },
      { title: "sshcfg — tidy your SSH config", blurb: "Lints, deduplicates and organises hosts. Suggests jump-host shortcuts.", tag: "CLI" },
      { title: "dockslim — find the fat in container images", blurb: "Layer-by-layer size analysis with suggestions for multi-stage builds.", tag: "Containers" },
      { title: "httptrace — timing breakdown for any URL", blurb: "DNS, connect, TLS, first byte, transfer. One line per phase.", tag: "Networking" },
      { title: "commitlint-lite — tiny commit message checker", blurb: "Enforces your format with a single binary and no Node dependency.", tag: "Git" },
      { title: "yamlfmt-strict — opinionated YAML formatter", blurb: "Consistent indentation, sorted keys optional, and it preserves comments.", tag: "Config" },
      { title: "sqlsnap — snapshot test your SQL queries", blurb: "Captures query results and fails the build when they change unexpectedly.", tag: "Testing" },
      { title: "waitfor — block until a port, file or URL is ready", blurb: "A tidy replacement for the sleep loops in your startup scripts.", tag: "Utilities" },
      { title: "branchboard — see all your open branches across repos", blurb: "A terminal dashboard showing stale branches, open PRs and CI status.", tag: "Git" },
      { title: "fakegen — realistic test data from a schema", blurb: "Names, addresses, timestamps and foreign keys that actually line up.", tag: "Testing" },
      { title: "promlens-cli — explore Prometheus queries interactively", blurb: "Autocompletes metric names and shows a sparkline preview as you type.", tag: "Observability" },
      { title: "keyring-env — load secrets from your OS keychain", blurb: "Stop pasting tokens into shell history. Injects secrets into a subprocess only.", tag: "Security" },
      { title: "ducktape — glue CSV, JSON and Parquet with SQL", blurb: "Query local data files as tables. Fast, single binary, delightfully simple.", tag: "Data" },
      { title: "pomoterm — a pomodoro timer for the terminal", blurb: "The fun one. Plays a tiny chime and logs your focus sessions.", tag: "Productivity" },
      { title: "lintstaged-go — run linters only on changed files", blurb: "Fast pre-commit checks without a JavaScript toolchain.", tag: "Git" },
    ],
    ctas: ["View on the web", "Try it", "See today's list", "Browse the archive"],
    accent: "#343a40",
    layout: "minimal",
  },
  {
    key: "fabrikam",
    fromName: "Fabrikam",
    fromEmail: "news@fabrikam.example",
    listId: "Fabrikam Product Updates <product-updates.fabrikam.example>",
    unsubMailto: "mailto:unsubscribe@fabrikam.example?subject=unsubscribe",
    unsubUrl: "https://fabrikam.example/email-preferences",
    category: "promotions",
    everyDays: 14,
    subjects: [
      "What's new in Fabrikam: {headline}",
      "Fabrikam Product Updates: {headline}",
      "New in Fabrikam Observe — {headline}",
      "{headline} is here",
      "Your Fabrikam update: {headline}",
      "Fabrikam: five new features you asked for",
      "Introducing {headline}",
    ],
    intros: [
      "Hi Alex, we've been busy. Here's everything new in Fabrikam over the past two weeks, from smarter alerting to a faster query engine.",
      "Our customers asked, and we listened. This release focuses on the features you voted for most on our feedback board.",
      "Big news this cycle: Fabrikam Observe now supports OpenTelemetry natively, with no agents to install.",
      "Hello from the Fabrikam product team! Grab a coffee — this is one of our biggest releases yet.",
      "Your platform team works hard. We want Fabrikam to make that work a little easier. Here's what's new.",
      "We're excited to share a round of performance improvements, plus a sneak peek at what's coming next.",
    ],
    items: [
      { title: "Native OpenTelemetry ingestion", blurb: "Send traces, metrics and logs straight to Fabrikam Observe using standard OTLP. No proprietary agent required.", tag: "New Feature" },
      { title: "Smart alert grouping", blurb: "Related alerts now collapse into a single incident automatically, cutting notification noise by up to 70%.", tag: "Alerting" },
      { title: "A query engine that's 4x faster", blurb: "Our rebuilt storage layer returns results across billions of events in seconds.", tag: "Performance" },
      { title: "Service maps, now with dependency health", blurb: "See upstream and downstream health at a glance and click through to the traces behind every edge.", tag: "Visualization" },
      { title: "SLO tracking, built in", blurb: "Define objectives, track error budgets and get burn-rate alerts without spreadsheets or plugins.", tag: "New Feature" },
      { title: "Cost controls for high-cardinality metrics", blurb: "Set limits per team and see exactly which labels drive your bill.", tag: "Cost" },
      { title: "Fabrikam for Kubernetes: one-command install", blurb: "Deploy collectors, dashboards and alerts for your clusters with a single Helm chart.", tag: "Kubernetes" },
      { title: "Dark mode is here", blurb: "Easier on the eyes during those late-night incident calls. Toggle it in your profile settings.", tag: "Experience" },
      { title: "Incident timelines you can share", blurb: "Generate a clean, read-only timeline link for stakeholders and postmortem reviews.", tag: "Incident Response" },
      { title: "Role-based access, now with fine-grained scopes", blurb: "Restrict dashboards, data sources and alert rules by team.", tag: "Security" },
      { title: "Terraform provider 2.0", blurb: "Manage dashboards, monitors and SLOs as code with our fully rewritten provider.", tag: "Integrations" },
      { title: "Log patterns: find the needle automatically", blurb: "Fabrikam clusters similar log lines so you can spot new error patterns instantly.", tag: "Logs" },
      { title: "Postgres query insights", blurb: "Identify slow queries, missing indexes and lock contention right from your database dashboard.", tag: "Databases" },
      { title: "Mobile app refresh", blurb: "Acknowledge pages, view dashboards and join incident channels from your phone.", tag: "Mobile" },
      { title: "Anomaly detection for business metrics", blurb: "Spot unusual dips in signups or orders alongside your technical telemetry.", tag: "New Feature" },
      { title: "Kafka monitoring pack", blurb: "Prebuilt dashboards for consumer lag, broker health and partition skew.", tag: "Integrations" },
      { title: "Customer story: how a fintech team cut MTTR in half", blurb: "Learn how one platform team consolidated four tools into Fabrikam and reclaimed their on-call weekends.", tag: "Customer Story" },
      { title: "Webinar: getting the most from Fabrikam SLOs", blurb: "Join our solutions engineers for a live walkthrough and Q&A next Wednesday.", tag: "Events" },
      { title: "On-call schedules and escalation policies", blurb: "Manage rotations directly in Fabrikam, with overrides and holiday swaps.", tag: "New Feature" },
      { title: "Faster dashboards with query caching", blurb: "Frequently viewed panels now load instantly, even for large teams.", tag: "Performance" },
      { title: "eBPF-powered network insights (beta)", blurb: "See service-to-service traffic and latency without code changes. Join the beta from your settings page.", tag: "Beta" },
      { title: "Audit logs export", blurb: "Stream every configuration change to your SIEM for compliance.", tag: "Security" },
      { title: "AI-assisted root cause suggestions (preview)", blurb: "Fabrikam highlights the deploys, config changes and anomalies most likely related to an incident.", tag: "Preview" },
      { title: "New pricing tier for growing teams", blurb: "Predictable per-host pricing with generous data allowances. Upgrade any time.", tag: "Pricing" },
      { title: "Synthetic checks from 20 locations", blurb: "Monitor your public endpoints from around the world, with screenshots on failure.", tag: "Monitoring" },
      { title: "Fabrikam Academy: free certification", blurb: "Earn a badge for your profile with our self-paced observability course.", tag: "Learning" },
      { title: "Status page integration", blurb: "Automatically update your public status page when an incident is declared.", tag: "Integrations" },
      { title: "Improved trace search", blurb: "Filter by any attribute, duration range or error status, and save searches as views.", tag: "Traces" },
      { title: "Data retention controls", blurb: "Choose retention per data type and per team to balance cost and compliance.", tag: "Cost" },
      { title: "Coming soon: continuous profiling", blurb: "See CPU and memory hotspots in production alongside your traces. Join the waitlist.", tag: "Coming Soon" },
    ],
    ctas: ["See what's new", "Try it now", "Read the release notes", "Register now", "Book a demo", "Upgrade today"],
    accent: "#e8590c",
    layout: "promo",
  },
  {
    key: "securitysignals",
    fromName: "Security Signals",
    fromEmail: "signals@securitysignals.example",
    listId: "Security Signals <signals.securitysignals.example>",
    unsubMailto: "mailto:unsubscribe@securitysignals.example?subject=unsubscribe",
    unsubUrl: "https://securitysignals.example/unsubscribe",
    category: "updates",
    everyDays: 7,
    subjects: [
      "Security Signals #{n}: {headline}",
      "{headline}",
      "Signals #{n} — {headline}",
      "This week in security: {headline}",
      "Security Signals #{n}: supply chain, secrets and a patch you should prioritise",
      "Issue {n}: {headline}",
      "Security Signals — {headline}",
    ],
    intros: [
      "Hello, defenders. Supply-chain attacks dominated the week again, so we've put the practical mitigations at the top.",
      "A calmer week on the vulnerability front, which gave us room to include some longer reads on threat modelling and detection engineering.",
      "Weekly advisory roundups are useful, but context is better. We've annotated this week's advisories with who should actually care.",
      "Welcome to Security Signals: a weekly, vendor-neutral briefing for engineers who have security in their job description whether they wanted it or not.",
      "If you run Kubernetes, read item two before anything else. If you don't, item four is a great primer on secrets hygiene.",
      "This week's issue is a little longer than usual. There was a lot to cover, and we didn't want to cut the incident write-up.",
    ],
    items: [
      { title: "A poisoned build plugin and what it means for your CI", blurb: "A popular community build plugin shipped a malicious minor release for six hours. How to pin, verify and detect.", tag: "Supply Chain" },
      { title: "Kubernetes RBAC misconfigurations that keep showing up in audits", blurb: "Wildcard verbs, cluster-admin bindings for CI and service accounts that can read every secret.", tag: "Kubernetes" },
      { title: "SBOMs: from compliance checkbox to useful tool", blurb: "Generating them is easy; using them to answer 'are we affected?' in minutes is the real win.", tag: "Supply Chain" },
      { title: "Secrets in Git history: finding and rotating them", blurb: "Scanning is step one. Rotation, revocation and preventing the next leak are the hard parts.", tag: "Secrets" },
      { title: "Threat modelling in an hour", blurb: "A lightweight format for product teams: what are we building, what can go wrong, what are we doing about it.", tag: "Threat Modelling" },
      { title: "Detection engineering for platform teams", blurb: "Your audit logs are a goldmine. Five detections every Kubernetes platform should have.", tag: "Detection" },
      { title: "Incident write-up: the leaked CI token that wasn't revoked", blurb: "A long-lived token in a forked repository led to a quiet compromise. Lessons on token scoping and lifetimes.", tag: "Incidents" },
      { title: "Short-lived credentials everywhere", blurb: "Workload identity, OIDC federation and why static access keys should be a code smell.", tag: "Identity" },
      { title: "Container image signing, explained simply", blurb: "Sign at build, verify at admission. The minimum viable setup for a mid-size platform.", tag: "Containers" },
      { title: "Phishing-resistant MFA rollout: lessons from the field", blurb: "Hardware keys for admins first, then everyone. Help-desk prep is the make-or-break step.", tag: "Identity" },
      { title: "Advisory roundup: what to patch first this week", blurb: "A critical deserialisation bug in a widely used Java library tops the list. Two others can wait.", tag: "Vulnerabilities" },
      { title: "eBPF-based runtime security: hype check", blurb: "Powerful visibility, real overhead and a steep tuning curve. Who should adopt it now.", tag: "Runtime Security" },
      { title: "Least privilege for Terraform pipelines", blurb: "Split plan and apply roles, scope by workspace and require approval for destructive changes.", tag: "Terraform" },
      { title: "The security champion program that actually worked", blurb: "Time allocation, recognition and a monthly guild meeting with real content.", tag: "Culture" },
      { title: "Network policies: default deny without breaking everything", blurb: "Observe traffic first, generate policies from flows, then enforce namespace by namespace.", tag: "Kubernetes" },
      { title: "Postgres security hardening checklist", blurb: "Authentication methods, role hygiene, row-level security and encrypted connections.", tag: "Postgres" },
      { title: "Dependency confusion attacks are still working", blurb: "Internal package names published to public registries continue to catch organisations out.", tag: "Supply Chain" },
      { title: "Logging for forensics, not just debugging", blurb: "What to retain, for how long and where, so an investigation isn't dead on arrival.", tag: "Detection" },
      { title: "Security reviews without becoming a bottleneck", blurb: "Self-service checklists for low-risk changes, deep reviews for the rest.", tag: "Process" },
      { title: "Tabletop exercise template: ransomware on a Friday evening", blurb: "A ready-to-run scenario with injects, roles and discussion prompts.", tag: "Incident Response" },
      { title: "Open-source spotlight: keyrotor", blurb: "A small controller that rotates database credentials on a schedule and updates Kubernetes secrets.", tag: "Open Source" },
      { title: "Browser extension risk in engineering teams", blurb: "Extensions with broad permissions are an overlooked data-exfiltration path. Policy options.", tag: "Endpoint" },
      { title: "Zero trust, minus the marketing", blurb: "Strong identity, device posture and per-request authorisation. Everything else is packaging.", tag: "Architecture" },
      { title: "Admission controllers: policy you can explain", blurb: "Start with five rules everyone agrees on and publish them with clear rationale.", tag: "Kubernetes" },
      { title: "Responding to a vulnerability disclosure gracefully", blurb: "Acknowledge fast, communicate often and credit the reporter. A response template.", tag: "Process" },
      { title: "Cloud audit trails you're probably not reading", blurb: "Five event types that should page someone, and three that should at least land in a weekly report.", tag: "Cloud" },
      { title: "Career: moving from SRE into security engineering", blurb: "The overlap is bigger than you'd think. Skills to build and how to make the jump.", tag: "Career" },
      { title: "Hardening CI runners", blurb: "Ephemeral runners, network egress controls and no shared caches across trust boundaries.", tag: "CI/CD" },
      { title: "The anatomy of a credential-stuffing attack", blurb: "Rate limits, breached-password checks and the telemetry that spots it early.", tag: "Application Security" },
      { title: "Data classification that engineers don't ignore", blurb: "Three levels, clear examples and defaults baked into the platform.", tag: "Governance" },
      { title: "Book review: a practical guide to security for small teams", blurb: "Our editor recommends a new handbook for teams without a dedicated security function.", tag: "Books" },
    ],
    ctas: ["Read the full story", "Read the advisory", "Get the checklist", "Download the template"],
    accent: "#c92a2a",
    layout: "digest",
  },
];

// ---------------------------------------------------------------------------
// Vendor marketing
// ---------------------------------------------------------------------------

export const MARKETING: SimpleMailDef[] = [
  {
    fromName: "InfraSummit",
    fromEmail: "hello@infrasummit.example",
    subject: "Early-bird pricing ends Friday — InfraSummit passes 40% off",
    body: "Hi Alex,\n\nInfraSummit is back, and early-bird pricing ends this Friday at midnight. Join 3,000 platform engineers, SREs and infrastructure leaders for two days of talks, hands-on labs and the hallway conversations you can't get on a video call.\n\nThis year's tracks include Platform as a Product, Reliability at Scale, Cost Engineering and a brand-new Leadership track for directors and VPs.\n\nTeams of five or more get an additional 15% off.\n\nGrab your pass: https://infrasummit.example/register\n\nSee you there,\nThe InfraSummit Team",
  },
  {
    fromName: "Contoso Cloud",
    fromEmail: "events@contosocloud.example",
    subject: "Webinar: Cutting Kubernetes costs by 35% without touching your apps",
    body: "Hi Alex,\n\nKubernetes bills have a way of creeping up quietly. Overprovisioned requests, idle nodes and forgotten namespaces add up fast.\n\nJoin our live webinar next Wednesday at 10am PT, where Contoso's principal engineers will show how teams like yours are trimming a third of their cluster spend using automated rightsizing and smarter bin-packing — no application changes required.\n\nYou'll leave with a free cost-audit checklist and a 30-day trial of Contoso Optimize.\n\nSave your seat: https://contosocloud.example/webinars/k8s-costs\n\nCan't make it live? Register anyway and we'll send the recording.\n\nThe Contoso Cloud Team",
  },
  {
    fromName: "Jordan at Fabrikam",
    fromEmail: "jordan.lee@fabrikam.example",
    subject: "Quick question about Northwind's observability stack",
    body: "Hi Alex,\n\nI noticed Northwind has been hiring platform engineers with OpenTelemetry experience, so I'm guessing observability is on your roadmap this quarter.\n\nTeams of your size usually tell us the same three things: too many tools, too much alert noise and a bill that grows faster than traffic. Fabrikam Observe consolidates metrics, logs and traces in one place, and our customers typically cut incident resolution time in half.\n\nWould you be open to a 20-minute call next week? Happy to tailor it to your setup.\n\nBook a demo: https://fabrikam.example/demo\n\nBest,\nJordan Lee\nAccount Executive, Fabrikam",
  },
  {
    fromName: "Jordan at Fabrikam",
    fromEmail: "jordan.lee@fabrikam.example",
    subject: "Re: Quick question about Northwind's observability stack",
    body: "Hi Alex,\n\nJust bumping this to the top of your inbox in case it got buried — I know how hectic things get for platform leaders.\n\nIf observability isn't a priority right now, no worries at all. Just let me know and I'll stop following up. If it is, I'd love to show you how teams similar to Northwind consolidated their tooling and saved six figures annually.\n\nBook a demo: https://fabrikam.example/demo\n\nThanks,\nJordan",
  },
  {
    fromName: "Tailspin Security",
    fromEmail: "marketing@tailspinsecurity.example",
    subject: "Free ebook: The Platform Engineer's Guide to Supply-Chain Security",
    body: "Hi Alex,\n\nSoftware supply-chain attacks have tripled, and platform teams are increasingly on the hook for preventing them.\n\nOur new 48-page ebook covers everything you need to build a secure pipeline: SBOM generation, artifact signing, provenance attestations, dependency pinning and admission policies for Kubernetes.\n\nIt's written by practitioners, for practitioners. No fluff, just checklists, diagrams and real-world examples.\n\nDownload your free copy: https://tailspinsecurity.example/ebook/supply-chain\n\nStay secure,\nThe Tailspin Security Team",
  },
  {
    fromName: "Adatum Data",
    fromEmail: "news@adatum.example",
    subject: "Introducing Adatum Streams: managed Kafka, without the pager",
    body: "Hi Alex,\n\nToday we're launching Adatum Streams, a fully managed event-streaming service that's wire-compatible with Kafka.\n\nNo brokers to patch. No partition rebalancing at 2am. No surprise disk-full incidents. Just reliable streams with a 99.99% SLA, automatic scaling and transparent per-GB pricing.\n\nMigrating is simple: point your existing clients at a new bootstrap address and you're done.\n\nStart free with 100 GB of throughput this month: https://adatum.example/streams\n\nWelcome to stress-free streaming,\nThe Adatum Team",
  },
  {
    fromName: "Litware",
    fromEmail: "offers@litware.example",
    subject: "Your exclusive invite: Litware Platform Leaders Dinner",
    body: "Hi Alex,\n\nWe're hosting an intimate dinner for 20 platform engineering leaders in San Francisco next Thursday evening, and we'd love for you to join us.\n\nOver a three-course meal, we'll discuss what's working (and what isn't) in internal developer platforms, with a short fireside chat from a platform director who scaled their team from four to forty.\n\nThere's no sales pitch, just good food and good conversation with peers.\n\nSeats are limited. RSVP here: https://litware.example/events/leaders-dinner\n\nWarm regards,\nThe Litware Events Team",
  },
  {
    fromName: "Proseware CI",
    fromEmail: "team@proseware.example",
    subject: "Your Proseware trial ends in 3 days",
    body: "Hi Alex,\n\nYour 14-day Proseware CI trial ends in three days. So far your team has run 412 builds with an average time of 3m 48s — 41% faster than your previous pipeline.\n\nUpgrade now to keep your build history, caches and parallel runners. Annual plans include two months free.\n\nHave questions about pricing for larger teams? Reply to this email and our solutions team will get back to you within a business day.\n\nUpgrade your plan: https://proseware.example/billing/upgrade\n\nHappy building,\nThe Proseware Team",
  },
  {
    fromName: "Contoso Cloud",
    fromEmail: "sales@contosocloud.example",
    subject: "End-of-quarter offer: 25% off annual commitments",
    body: "Hi Alex,\n\nOur quarter closes soon, and we're offering 25% off any new annual commitment signed before then.\n\nWhether you're expanding compute, adding managed Postgres or finally consolidating those three monitoring tools, this is the best pricing we'll offer all year.\n\nYour account manager can put together a custom quote in under 24 hours.\n\nBook a demo: https://contosocloud.example/contact-sales\n\nThis offer can't be combined with existing discounts and applies to new commitments only.\n\nThe Contoso Cloud Sales Team",
  },
  {
    fromName: "Wingtip Swag",
    fromEmail: "hi@wingtipdev.example",
    subject: "Free hoodie for your team (seriously)",
    body: "Hey Alex,\n\nWe make Wingtip, the open-source-friendly feature flag platform loved by over 8,000 engineering teams.\n\nTo celebrate our latest release, we're sending a free Wingtip hoodie to every engineering leader who takes a 15-minute product tour. Choose your size and colour after the call.\n\nIn the tour you'll see percentage rollouts, kill switches and our new flag-cleanup reminders that keep tech debt in check.\n\nClaim your hoodie: https://wingtipdev.example/hoodie\n\nCheers,\nThe Wingtip Crew",
  },
  {
    fromName: "Graphic Ops Research",
    fromEmail: "research@graphicops.example",
    subject: "Whitepaper: State of Platform Engineering report",
    body: "Hi Alex,\n\nWe surveyed over 1,200 platform engineers and engineering leaders about team structure, tooling, budgets and the metrics they report to executives.\n\nSome highlights:\n- 68% of platform teams now have a dedicated product manager or plan to hire one\n- Developer portals are the fastest-growing investment area\n- Teams that measure developer experience ship twice as often\n\nDownload the full report, with benchmarks by company size: https://graphicops.example/reports/platform-engineering\n\nThe Graphic Ops Research Team",
  },
  {
    fromName: "InfraSummit",
    fromEmail: "hello@infrasummit.example",
    subject: "The InfraSummit agenda is live 🎤",
    body: "Hi Alex,\n\nThe full InfraSummit agenda is now live, and it's our strongest lineup yet.\n\nHighlights include a keynote on the economics of reliability, a deep dive into multi-region Postgres, and a panel of platform leaders on building teams that developers actually like.\n\nNew this year: hands-on workshops on Terraform testing, eBPF observability and incident command. Workshop seats are limited and fill fast.\n\nExplore the agenda and register: https://infrasummit.example/agenda\n\nSee you soon,\nThe InfraSummit Team",
  },
  {
    fromName: "Brightwell Analytics",
    fromEmail: "growth@brightwell-analytics.example",
    subject: "Alex, are you still the right person for this?",
    body: "Hi Alex,\n\nI've reached out a couple of times about Brightwell's query acceleration platform and haven't heard back, which usually means one of three things:\n\n1. You're slammed and it's on your list\n2. It's not a priority right now\n3. I've got the wrong person\n\nIf it's number three, could you point me to whoever owns your data warehouse costs? A quick reply would mean a lot.\n\nBook a demo: https://brightwell-analytics.example/demo\n\nThanks,\nCasey Morton\nBrightwell Analytics",
  },
  {
    fromName: "Relecloud",
    fromEmail: "product@relecloud.example",
    subject: "New: Relecloud Edge now in 12 additional regions",
    body: "Hi Alex,\n\nWe've just expanded Relecloud Edge to 12 new regions, bringing our global footprint to 48 locations.\n\nThat means lower latency for your users, built-in DDoS protection and smarter routing that automatically avoids congested paths.\n\nExisting customers get the new regions at no additional cost. New customers can start with a free tier that includes 1 TB of transfer per month.\n\nSee the full region map: https://relecloud.example/edge/regions\n\nFaster everywhere,\nThe Relecloud Team",
  },
  {
    fromName: "Tailspin Security",
    fromEmail: "events@tailspinsecurity.example",
    subject: "Live demo: Stop secrets leaking into your repos",
    body: "Hi Alex,\n\nOne leaked credential is all it takes. In this 30-minute live demo, we'll show how Tailspin Guard catches secrets before they're committed, alerts the right owner in real time and automates rotation when something slips through.\n\nWe'll also share anonymised data on the most commonly leaked secret types — the results surprised even us.\n\nJoin us next Tuesday at 11am PT: https://tailspinsecurity.example/live-demo\n\nAll attendees receive a free repository scan report.\n\nThe Tailspin Security Team",
  },
  {
    fromName: "Proseware CI",
    fromEmail: "team@proseware.example",
    subject: "We miss you! Here's 3 months free",
    body: "Hi Alex,\n\nWe noticed your team hasn't run a build on Proseware in a while. We'd love to have you back.\n\nSince your trial, we've shipped remote caching, ARM runners and a brand-new test-splitting engine that cuts large test suites to a fraction of their original runtime.\n\nCome back today and get three months of the Team plan free — no credit card required.\n\nReactivate your account: https://proseware.example/welcome-back\n\nHappy building,\nThe Proseware Team",
  },
  {
    fromName: "Litware",
    fromEmail: "webinars@litware.example",
    subject: "On-demand: How a retailer built a developer portal in 6 weeks",
    body: "Hi Alex,\n\nMissed last week's session? The recording is now available on demand.\n\nWatch the platform team at a fast-growing retailer walk through how they launched a developer portal with a service catalogue, scorecards and self-service templates in just six weeks — and how adoption reached 90% in the first quarter.\n\nThe session includes a live demo and a candid Q&A about what they'd do differently.\n\nWatch now: https://litware.example/on-demand/portal-in-six-weeks\n\nThe Litware Team",
  },
  {
    fromName: "Adatum Data",
    fromEmail: "events@adatum.example",
    subject: "You're invited: Adatum Data Day (virtual)",
    body: "Hi Alex,\n\nJoin us for Adatum Data Day, a free half-day virtual event for data and platform engineers.\n\nSessions include real-time pipelines without the pain, change data capture from Postgres done right, and a customer panel on migrating off self-managed Kafka.\n\nEvery attendee gets a $500 Adatum credit, and we'll be raffling off noise-cancelling headphones during the closing session.\n\nRegister now: https://adatum.example/data-day\n\nSee you online,\nThe Adatum Events Team",
  },
  {
    fromName: "Bellows Hardware",
    fromEmail: "deals@bellowshw.example",
    subject: "Upgrade your home office: 30% off ergonomic gear for engineering teams",
    body: "Hi Alex,\n\nSupporting a hybrid team? Bellows offers bulk pricing on standing desks, monitor arms and ergonomic chairs, shipped directly to your employees' homes.\n\nFor a limited time, engineering teams of 10 or more get 30% off plus free white-glove delivery and setup.\n\nWe handle the logistics, invoicing and returns, so your team gets comfortable and you get your afternoon back.\n\nGet a team quote: https://bellowshw.example/teams\n\nThe Bellows Team",
  },
  {
    fromName: "Contoso Cloud",
    fromEmail: "newsletter@contosocloud.example",
    subject: "Announcing managed Postgres with zero-downtime upgrades",
    body: "Hi Alex,\n\nMajor version upgrades are one of the riskiest things a database team does. Today, Contoso Managed Postgres makes them boring.\n\nOur new blue-green upgrade workflow replicates your data to a new version, validates it and switches over in seconds, with an instant rollback if anything looks off.\n\nAlso new: point-in-time restore to any second within 35 days and automatic connection pooling.\n\nLearn more: https://contosocloud.example/postgres\n\nThe Contoso Cloud Team",
  },
  {
    fromName: "Graphic Ops Research",
    fromEmail: "research@graphicops.example",
    subject: "Last chance: share your on-call experience (and get a $25 gift card)",
    body: "Hi Alex,\n\nWe're closing our annual on-call and incident response survey this week, and we'd love your perspective as an engineering leader.\n\nThe survey takes about 10 minutes. Every completed response gets a $25 gift card, and you'll receive the full results before they're published.\n\nAll responses are anonymous and reported only in aggregate.\n\nTake the survey: https://graphicops.example/survey/on-call\n\nThank you,\nThe Graphic Ops Research Team",
  },
  {
    fromName: "Woodgrove Identity",
    fromEmail: "hello@woodgroveid.example",
    subject: "Passwordless for your engineers, in an afternoon",
    body: "Hi Alex,\n\nPhishing-resistant authentication shouldn't take a six-month project.\n\nWoodgrove Identity plugs into your existing directory and gives every engineer passkey-based sign-in for SSH, Kubernetes, cloud consoles and internal tools. Short-lived certificates replace static keys, and every access is logged for audit.\n\nTeams typically roll out to their first group of engineers in a single afternoon.\n\nBook a demo: https://woodgroveid.example/demo\n\nThe Woodgrove Team",
  },
  {
    fromName: "InfraSummit",
    fromEmail: "hello@infrasummit.example",
    subject: "Want to speak at InfraSummit? CFP closes in one week",
    body: "Hi Alex,\n\nOur call for proposals closes in one week, and we'd love to hear from platform leaders like you.\n\nWe're especially looking for talks on lessons from real incidents, platform team design, cost engineering and developer experience. First-time speakers are warmly welcome — we offer free speaker coaching and rehearsal sessions.\n\nAccepted speakers receive a free conference pass, travel support and a seat at the speakers' dinner.\n\nSubmit your talk: https://infrasummit.example/cfp\n\nThe InfraSummit Program Committee",
  },
  {
    fromName: "Wingtip",
    fromEmail: "product@wingtipdev.example",
    subject: "Feature flags are tech debt. Here's how to fix that.",
    body: "Hi Alex,\n\nThe average codebase has hundreds of stale feature flags, each one a little landmine for the next engineer.\n\nWingtip's new Flag Hygiene dashboard spots flags that have been fully rolled out for more than 30 days, opens a pull request to remove them and notifies the owning team.\n\nCustomers have removed over 40,000 stale flags since our beta began.\n\nStart a free trial: https://wingtipdev.example/trial\n\nCheers,\nThe Wingtip Crew",
  },
  {
    fromName: "Relecloud",
    fromEmail: "partners@relecloud.example",
    subject: "Alex, your complimentary architecture review is waiting",
    body: "Hi Alex,\n\nAs part of our Platform Partners program, Northwind qualifies for a complimentary architecture review with one of our senior solutions architects.\n\nIn a 60-minute session, we'll review your current edge, caching and traffic management setup and deliver a written report with specific recommendations for performance, resilience and cost.\n\nThere's no obligation, and the report is yours to keep.\n\nSchedule your review: https://relecloud.example/architecture-review\n\nBest regards,\nThe Relecloud Partners Team",
  },
  {
    fromName: "Proseware CI",
    fromEmail: "events@proseware.example",
    subject: "Workshop: Faster builds with remote caching (hands-on)",
    body: "Hi Alex,\n\nJoin our free 90-minute hands-on workshop and leave with a build pipeline that's measurably faster.\n\nWe'll cover remote caching strategies, test splitting, dependency layer caching for containers and how to find the slowest steps in any pipeline.\n\nBring a laptop and a real repository — our engineers will help you apply each technique live.\n\nReserve your spot: https://proseware.example/workshops/remote-caching\n\nSpaces are capped at 50 to keep it interactive.\n\nThe Proseware Team",
  },
  {
    fromName: "Brightwell Analytics",
    fromEmail: "events@brightwell-analytics.example",
    subject: "Your exclusive invite: private product preview",
    body: "Hi Alex,\n\nWe're inviting a small group of engineering leaders to an exclusive preview of Brightwell's next-generation query engine before its public launch.\n\nYou'll get hands-on access, a direct line to our product team and the chance to shape the roadmap. Preview participants also lock in founding-customer pricing for two years.\n\nThe session is virtual and takes about 45 minutes.\n\nRequest your invite: https://brightwell-analytics.example/preview\n\nBest,\nThe Brightwell Product Team",
  },
  {
    fromName: "Tailspin Security",
    fromEmail: "sales@tailspinsecurity.example",
    subject: "Security for platform teams: bundle pricing ends soon",
    body: "Hi Alex,\n\nFor a limited time, get Tailspin Guard, Tailspin Scan and Tailspin Admission together at 30% off list price.\n\nThat's secrets detection, dependency scanning and Kubernetes policy enforcement in a single platform with a single dashboard and a single bill.\n\nThis bundle offer ends at the close of the quarter.\n\nBook a demo: https://tailspinsecurity.example/bundle\n\nStay secure,\nThe Tailspin Sales Team",
  },
];

// ---------------------------------------------------------------------------
// Social notifications
// ---------------------------------------------------------------------------

export const SOCIAL: SimpleMailDef[] = [
  {
    fromName: "ProNet",
    fromEmail: "notifications@pronet.example",
    subject: "Priya Raman shared a post",
    body: "Priya Raman shared a post:\n\n\"Wrote up our team's journey from noisy alerts to SLO-based paging. TL;DR: we deleted 70% of our alerts and on-call got a lot quieter. Link in the comments.\"\n\n48 reactions · 12 comments\n\nView post: https://pronet.example/feed/post/priya-raman-slo-paging\n\nYou're receiving this because you're connected with Priya Raman.",
  },
  {
    fromName: "ProNet",
    fromEmail: "notifications@pronet.example",
    subject: "You appeared in 14 searches this week",
    body: "Hi Alex,\n\nYou appeared in 14 searches this week.\n\nYour profile was found by people with titles including Engineering Manager, Technical Recruiter and Head of Infrastructure.\n\nSee who's looking at your profile and what keywords they used: https://pronet.example/me/search-appearances\n\nTip: profiles with a recent post get up to three times more views.",
  },
  {
    fromName: "ProNet",
    fromEmail: "invitations@pronet.example",
    subject: "Marcus Bell has endorsed you for Kubernetes",
    body: "Hi Alex,\n\nMarcus Bell, VP Engineering at Northwind, endorsed you for Kubernetes.\n\nYou now have 37 endorsements for Kubernetes, and endorsements for Site Reliability Engineering and Technical Leadership too.\n\nWant to return the favour? Endorse Marcus for a skill he's known for: https://pronet.example/in/marcus-bell/skills\n\nThe ProNet Team",
  },
  {
    fromName: "ProNet",
    fromEmail: "invitations@pronet.example",
    subject: "Jamie Castellanos wants to connect",
    body: "Hi Alex,\n\nJamie Castellanos, Senior Technical Recruiter at Trey Research, would like to join your professional network.\n\n\"Hi Alex — I'm working on a Head of Platform search for a well-funded infrastructure startup and your background stood out. Would love to connect.\"\n\nAccept: https://pronet.example/invitations/accept\nIgnore: https://pronet.example/invitations/ignore\n\nYou have 6 other pending invitations.",
  },
  {
    fromName: "ProNet",
    fromEmail: "messages@pronet.example",
    subject: "You have 3 unread messages",
    body: "Hi Alex,\n\nYou have 3 unread messages:\n\nSofia Brandt: \"Thanks again for the intro last week! Would you be up for a quick coffee chat about…\"\n\nKenji Watanabe: \"Saw your talk on golden paths — any chance you'd share the slides?\"\n\nRiley Chen: \"Hi Alex, I'm reaching out about an exciting opportunity…\"\n\nRead your messages: https://pronet.example/messaging",
  },
  {
    fromName: "ProNet",
    fromEmail: "notifications@pronet.example",
    subject: "Congratulate Nora Lindqvist on 5 years at Northwind",
    body: "Hi Alex,\n\nNora Lindqvist is celebrating a work anniversary — 5 years at Northwind as Database Engineering Lead.\n\nSay congrats: https://pronet.example/in/nora-lindqvist\n\nOther updates from your network:\n• Owen Price started a new position as Platform Engineer at Northwind\n• Mei Tanaka is celebrating 2 years at Northwind\n\nThe ProNet Team",
  },
  {
    fromName: "ProNet",
    fromEmail: "notifications@pronet.example",
    subject: "Your post is getting attention",
    body: "Hi Alex,\n\nYour post \"Five things I wish I'd known before starting a platform team\" is getting noticed.\n\n1,284 impressions · 96 reactions · 23 comments · 11 reposts\n\nPeople from Trey Research, Contoso and Adatum are engaging with your post.\n\nSee all activity: https://pronet.example/me/activity\n\nKeep the conversation going by replying to comments.",
  },
  {
    fromName: "ProNet Jobs",
    fromEmail: "jobs-noreply@pronet.example",
    subject: "8 new jobs for \"Director of Platform Engineering\"",
    body: "Hi Alex,\n\nBased on your job alert, here are new roles that match your search:\n\n• Director, Platform Engineering — Trey Research (Remote)\n• Head of Infrastructure — Lucerne Logistics (Hybrid)\n• VP, Developer Platform — Coho Health (On-site)\n• Senior Director, Reliability — Alpine Ski House (Remote)\n\nSee all 8 jobs: https://pronet.example/jobs/alerts\n\nManage your job alerts in settings.",
  },
  {
    fromName: "ProNet",
    fromEmail: "notifications@pronet.example",
    subject: "Diego Alvarez commented on your post",
    body: "Diego Alvarez commented on your post:\n\n\"Number three hits home. We spent our first six months building things nobody asked for. Talking to users first would have saved us a lot of pain.\"\n\nReply to Diego: https://pronet.example/feed/post/alex-morgan-platform-lessons\n\nYour post now has 27 comments.",
  },
  {
    fromName: "ProNet",
    fromEmail: "groups@pronet.example",
    subject: "New in Platform Engineering Leaders: 12 posts you missed",
    body: "Hi Alex,\n\nHere's what's happening in Platform Engineering Leaders (18,400 members):\n\n• \"How do you structure a platform team at 300 engineers?\" — 64 comments\n• \"Our internal developer portal adoption stalled at 40%. Ideas?\" — 41 comments\n• \"Hiring market check: what are platform director salaries looking like?\" — 89 comments\n\nJoin the conversation: https://pronet.example/groups/platform-engineering-leaders",
  },
  {
    fromName: "Huddle",
    fromEmail: "digest@huddle.example",
    subject: "Your Huddle digest: 23 unread messages in Northwind",
    body: "Hi Alex,\n\nHere's what you missed in the Northwind workspace:\n\n#platform-eng — 11 new messages\nPriya Raman: \"Heads-up: rolling restart of the ingress tier at 4pm, should be invisible to users.\"\n\n#incidents — 7 new messages\nJonah Feld: \"Resolved. Root cause was a stale DNS record. Postmortem doc incoming.\"\n\nDirect messages — 5 unread\n\nOpen Huddle: https://northwind.huddle.example",
  },
  {
    fromName: "Huddle",
    fromEmail: "digest@huddle.example",
    subject: "Mei Tanaka mentioned you in #runtime-team",
    body: "Hi Alex,\n\nMei Tanaka mentioned you in #runtime-team:\n\n\"@Alex can you weigh in on whether we pin the node image for the upgrade window or let it float? Lena and I have opposite instincts here 😅\"\n\n3 replies in thread\n\nReply in Huddle: https://northwind.huddle.example/runtime-team\n\nYou can change notification preferences in Huddle settings.",
  },
  {
    fromName: "Huddle",
    fromEmail: "digest@huddle.example",
    subject: "Weekly recap: your Huddle activity",
    body: "Hi Alex,\n\nHere's your week in Huddle:\n\n• 142 messages sent\n• 31 threads you participated in\n• Most active channel: #platform-eng\n• 4 huddles joined (2h 15m total)\n\nTop reaction you received: 🙏\n\nChannels you haven't visited in a while: #bayview-move, #random-pets\n\nOpen Huddle: https://northwind.huddle.example",
  },
  {
    fromName: "Huddle",
    fromEmail: "digest@huddle.example",
    subject: "You have unread direct messages from Sam Okoye and 2 others",
    body: "Hi Alex,\n\nYou have unread direct messages:\n\nSam Okoye: \"Got a minute today? Want to run the on-call rotation proposal past you before I share it.\"\n\nInês Duarte: \"Release freeze starts Thursday, just confirming the platform changes are all merged?\"\n\nKofi Mensah: \"Sent you the access review spreadsheet.\"\n\nReply in Huddle: https://northwind.huddle.example/messages",
  },
  {
    fromName: "ProNet",
    fromEmail: "notifications@pronet.example",
    subject: "Rachel Stein and 4 others viewed your profile",
    body: "Hi Alex,\n\nYour profile has been getting attention. Rachel Stein, Head of Security at Northwind, and 4 others viewed your profile this week.\n\nSee all viewers with ProNet Premium — try it free for one month: https://pronet.example/premium\n\nOr update your profile headline to make a stronger first impression: https://pronet.example/me/edit",
  },
];

// ---------------------------------------------------------------------------
// Spam
// ---------------------------------------------------------------------------

export const SPAM_MAIL: SimpleMailDef[] = [
  {
    fromName: "Accounts Payable",
    fromEmail: "billing@secure-acct-verify.example",
    subject: "INVOICE #INV-88213 OVERDUE - Immediate action required",
    body: "Dear Customer,\n\nOur records show that invoice #INV-88213 for $4,870.00 remains unpaid and is now 30 days overdue.\n\nTo avoid late fees and suspension of service, please review the attached invoice and remit payment today.\n\nView invoice: https://secure-acct-verify.example/inv/88213\n\nIf you have already paid, please disregard this notice.\n\nRegards,\nAccounts Receivable Department",
  },
  {
    fromName: "Mail Administrator",
    fromEmail: "admin@mailbox-quota-alert.example",
    subject: "Your mailbox is almost full (98%)",
    body: "Dear User,\n\nYour mailbox has reached 98% of its storage limit. You will not be able to send or receive new messages once the limit is reached.\n\nTo avoid losing incoming mail, please verify your account and upgrade your storage now:\n\nhttps://mailbox-quota-alert.example/verify\n\nFailure to verify within 24 hours will result in account deactivation.\n\nIT Help Desk",
  },
  {
    fromName: "Renata Okafor",
    fromEmail: "renata.okafor.ceo@northwind-exec.example",
    subject: "Urgent request - are you available?",
    body: "Alex,\n\nI'm in back-to-back meetings with the board and can't take calls. I need you to handle an urgent wire transfer for a confidential acquisition today. Please keep this between us for now.\n\nReply with your direct number and I'll send the details. Time-sensitive.\n\nRenata\n\nSent from my mobile",
  },
  {
    fromName: "CryptoWealth Pro",
    fromEmail: "invest@cryptowealth-pro.example",
    subject: "Turn $250 into $12,000 in 30 days?",
    body: "Hello,\n\nOur AI trading algorithm has delivered consistent daily returns for thousands of members, and now we're opening 50 new spots.\n\nNo experience required. Start with as little as $250 and watch your portfolio grow automatically while you sleep.\n\nSpots are going fast. Claim yours now:\nhttps://cryptowealth-pro.example/join\n\nPast performance is not indicative of future results.",
  },
  {
    fromName: "Rewards Center",
    fromEmail: "winner@rewards-claim-center.example",
    subject: "Congratulations! You've been selected for a $500 gift card",
    body: "Congratulations!\n\nYou have been randomly selected to receive a $500 gift card as a thank-you for being a loyal customer.\n\nTo claim your reward, simply complete a short survey and confirm your shipping details within the next 48 hours.\n\nClaim now: https://rewards-claim-center.example/claim\n\nThis offer is valid for one person per household.",
  },
  {
    fromName: "SEO Rankings Team",
    fromEmail: "growth@top-rank-seo.example",
    subject: "northwind.example — page 1 of search results guaranteed",
    body: "Hi there,\n\nI was looking at your website northwind.example and noticed several issues that are hurting your search ranking, including slow page speed, missing meta tags and low-quality backlinks.\n\nOur team can get you onto the first page of search results within 60 days, guaranteed, or your money back.\n\nCan I send you a free website audit? Just reply \"YES\".\n\nBest regards,\nDaniel\nSenior SEO Consultant",
  },
  {
    fromName: "Docu-Share Notification",
    fromEmail: "no-reply@docshare-secure-files.example",
    subject: "Helen Varga has shared \"Q-Bonus-Payout-Final.pdf\" with you",
    body: "Helen Varga has shared a document with you.\n\nQ-Bonus-Payout-Final.pdf\n\nYou need to sign in with your corporate email credentials to view this document.\n\nOpen document: https://docshare-secure-files.example/view?id=a8f3e2\n\nThis link will expire in 12 hours.",
  },
  {
    fromName: "Parcel Delivery Service",
    fromEmail: "tracking@parcel-redelivery.example",
    subject: "Delivery attempt failed - reschedule your package",
    body: "Dear Customer,\n\nWe attempted to deliver your package today but no one was available to sign for it.\n\nYour parcel is being held at our depot. A small redelivery fee of $1.99 is required to schedule a new delivery.\n\nReschedule here: https://parcel-redelivery.example/track\n\nIf no action is taken within 3 days, the package will be returned to the sender.",
  },
  {
    fromName: "IT Security Team",
    fromEmail: "security-alert@account-protect-center.example",
    subject: "Unusual sign-in activity detected on your account",
    body: "We detected a sign-in attempt from an unrecognised device.\n\nLocation: Unknown\nDevice: Windows PC\nStatus: Blocked\n\nIf this wasn't you, your account could be compromised. Please secure your account immediately by confirming your password:\n\nhttps://account-protect-center.example/secure\n\nThank you,\nAccount Security Team",
  },
  {
    fromName: "Global Business Directory",
    fromEmail: "listings@global-biz-directory.example",
    subject: "Final notice: Northwind business listing renewal",
    body: "Dear Business Owner,\n\nThis is your final notice that the Northwind listing in the Global Business Directory is due for renewal.\n\nTo keep your company visible to thousands of potential customers, please confirm your listing details and submit the annual fee of $995.\n\nRenew now: https://global-biz-directory.example/renew\n\nUnrenewed listings will be removed at the end of the week.",
  },
  {
    fromName: "Ergonomic Chair Clearance",
    fromEmail: "sales@office-deals-outlet.example",
    subject: "LAST DAY!!! Premium office chairs 85% OFF",
    body: "WAREHOUSE CLEARANCE!!!\n\nPremium ergonomic office chairs, normally $1,299, now just $189 while stocks last!\n\nFree shipping. No questions asked returns. Limited quantities available.\n\nSHOP NOW: https://office-deals-outlet.example/chairs\n\nThis offer ends at midnight tonight. Don't miss out!",
  },
  {
    fromName: "HR Department",
    fromEmail: "hr-payroll@northwind-benefits-portal.example",
    subject: "Action required: confirm your direct deposit details",
    body: "Dear Employee,\n\nAs part of our payroll system upgrade, all employees must reconfirm their direct deposit information before the next pay cycle.\n\nPlease log in with your company credentials and verify your bank details here:\n\nhttps://northwind-benefits-portal.example/payroll\n\nEmployees who do not confirm their details could experience a delay in payment.\n\nHuman Resources",
  },
];

// ===========================================================================
// notify
// ===========================================================================

// Content banks for automated mail in the demo mailbox: ticket updates, CI,
// code review, calendar invites, alerts, system notices, receipts and
// internal mailing lists. Everything here is fictional.


// ---------------------------------------------------------------------------
// Issue tracker
// ---------------------------------------------------------------------------

export interface JiraIssue { key: string; title: string; type: "Bug" | "Story" | "Task" | "Epic" | "Incident"; priority: "Low" | "Medium" | "High" | "Highest"; component: string; reporter: string; assignee: string; comments: string[] }

export const JIRA_ISSUES: JiraIssue[] = [
  {
    key: "PLAT-2291", title: "Cut over payments-api egress to cloud NAT gateways", type: "Story", priority: "High", component: "Networking", reporter: "me", assignee: "tariq",
    comments: [
      "NAT gateway pair is up in the landing zone. Waiting on Adatum to allowlist the two new elastic IPs before we can flip traffic.",
      "Adatum confirmed the allowlist change is live in their sandbox; production goes in during their Thursday change window.",
      "Dry run against sandbox passed, 0 handshake failures over 40k requests. Proposing we cut prod during the next migration window.",
    ],
  },
  {
    key: "PLAT-2304", title: "Migrate auth-gateway session store from DAL1 Redis to managed cache", type: "Story", priority: "High", component: "Identity", reporter: "noah", assignee: "lena",
    comments: [
      "Dual-write is enabled behind the session_store_dualwrite flag. Read path still points at DAL1.",
      "Key count is within 0.2% between the two stores after 48h. The gap is TTL skew, not lost writes.",
      "Flipping reads to the managed cache for 5% of traffic tomorrow morning. Rollback is just the flag.",
    ],
  },
  {
    key: "PLAT-2310", title: "Epic: DAL1 exit for payments-api, ledger-pg and auth-gateway", type: "Epic", priority: "Highest", component: "Migration", reporter: "me", assignee: "grace",
    comments: [
      "Added the revised cutover sequence from the steering committee: auth-gateway first, then payments-api, ledger-pg last.",
      "Contoso has raised the runbook review as a blocker for ledger-pg. Grace is scheduling a walkthrough with Nora and Daniel.",
      "Burn-down updated. 38 of 61 child issues closed; the remaining risk is concentrated in ledger replication and egress.",
    ],
  },
  {
    key: "PLAT-2316", title: "Terraform module for landing zone VPC peering is not idempotent", type: "Bug", priority: "Medium", component: "Infrastructure as Code", reporter: "owen", assignee: "owen",
    comments: [
      "Every plan shows a diff on the route table association even when nothing changed. Looks like we're sorting the CIDR list differently than the provider does.",
      "Fixed by normalizing the CIDR list before it hits the resource. PR is up in platform-terraform.",
    ],
  },
  {
    key: "PLAT-2322", title: "Decommission DAL1 bastion hosts after cutover", type: "Task", priority: "Low", component: "Infrastructure", reporter: "tariq", assignee: "paul",
    comments: [
      "Blocked until ledger-pg is out of DAL1; the DBAs still use bastion-03 for break-glass access.",
      "Added a checklist for revoking the host keys and removing the jump host entries from the SSH config template.",
    ],
  },
  {
    key: "PLAT-2329", title: "Service mesh mTLS rollout for payments namespace", type: "Story", priority: "Medium", component: "Runtime", reporter: "mei", assignee: "ravi",
    comments: [
      "Permissive mode is on for payments-api and payments-worker. No handshake errors in the last 24h.",
      "ledger-sync still talks plaintext to the old Kafka brokers, so it has to stay permissive until the broker move.",
      "Strict mode enabled for payments-api. Dashboards look clean, and p99 went up about 0.4ms, which is within budget.",
    ],
  },
  {
    key: "PLAT-2335", title: "Right-size node pools in cloud staging cluster", type: "Task", priority: "Low", component: "Cost", reporter: "malik", assignee: "owen",
    comments: [
      "Staging is running at 18% average CPU. Proposing we drop from 12 to 7 nodes and turn on cluster autoscaler.",
      "Autoscaler enabled with min 5 / max 14. Expected savings is roughly a third of the staging compute line.",
    ],
  },
  {
    key: "PLAT-2341", title: "Document rollback procedure for auth-gateway DNS cutover", type: "Task", priority: "High", component: "Migration", reporter: "grace", assignee: "lena",
    comments: [
      "Draft is in the runbook repo. Need someone from Network to confirm the TTL lowering is done 48h ahead.",
      "Tariq confirmed TTLs are already at 60s. Added the exact commands and expected outputs for each rollback step.",
      "Reviewed with Contoso. Bruno asked that we add a step to drain the old health checks so the load balancer stops flapping.",
    ],
  },
  {
    key: "SRE-1182", title: "PgBouncer pool exhaustion on ledger-pg during peak settlement", type: "Bug", priority: "Highest", component: "Databases", reporter: "priya", assignee: "nora",
    comments: [
      "Pool hit max_client_conn at 14:02 and every request after that queued. This is the root cause of INC-4821.",
      "Raised default_pool_size from 40 to 80 and set reserve_pool_size to 10. Postgres max_connections has headroom for this.",
      "Added an alert on cl_waiting > 20 for 2 minutes. Leaving open until we load test at 2x settlement peak.",
    ],
  },
  {
    key: "SRE-1187", title: "Retry storm from payments-worker amplifies upstream latency", type: "Bug", priority: "High", component: "Resilience", reporter: "jonah", assignee: "aisha",
    comments: [
      "Workers retry immediately with no jitter, three times per hop. During INC-4821 that turned one slow query into roughly 27 calls.",
      "Switched to exponential backoff with full jitter and a retry budget of 10% per client. PR is in review.",
      "Deployed to staging. Under the chaos test, peak QPS to ledger-pg during the injected slowdown fell by 70%.",
    ],
  },
  {
    key: "SRE-1190", title: "Postmortem action items for INC-4821", type: "Task", priority: "High", component: "Incident Management", reporter: "me", assignee: "priya",
    comments: [
      "Seven action items captured. Owners assigned in the doc, child tickets linked here.",
      "Four of seven done. The remaining ones are the load test, the circuit breaker in payments-api, and the customer comms template.",
      "Ben asked to also track the status-page lag as an action item. Added SRE-1203.",
    ],
  },
  {
    key: "SRE-1194", title: "Alert fatigue: consolidate duplicate disk usage alerts", type: "Task", priority: "Medium", component: "Observability", reporter: "felix", assignee: "felix",
    comments: [
      "We page on 80%, 85% and 90% for the same volume, which works out to three pages per incident. Replacing them with one predictive alert based on time-to-full.",
      "New rule is live in the Fabrikam workspace in shadow mode. It would have fired 4 times last week vs. 31 pages.",
    ],
  },
  {
    key: "SRE-1198", title: "On-call handoff checklist missing migration freeze info", type: "Task", priority: "Low", component: "On-call", reporter: "sam", assignee: "sam",
    comments: [
      "Added a section listing active change freezes and the migration window calendar.",
      "Paul suggested we link the cutover runbook directly from the paging escalation notes. Done.",
    ],
  },
  {
    key: "SRE-1203", title: "Status page update lagged incident declaration by 22 minutes", type: "Bug", priority: "Medium", component: "Incident Management", reporter: "ben", assignee: "zoe",
    comments: [
      "Support didn't see the incident channel until a customer escalated. We need the status page draft to be part of the IC checklist.",
      "Added a status page step to the incident bot. It now posts a draft for the comms lead to approve within 5 minutes of a SEV declaration.",
    ],
  },
  {
    key: "SRE-1207", title: "ledger-pg replica in landing zone falls behind during vacuum", type: "Incident", priority: "High", component: "Databases", reporter: "daniel", assignee: "nora",
    comments: [
      "Replication lag peaked at 94s during autovacuum on the settlements table. The cross-site link was saturated.",
      "Throttled autovacuum_vacuum_cost_limit on the primary and scheduled a manual vacuum for the low-traffic window.",
      "Lag stayed under 5s during last night's vacuum. Keeping this open until we've seen a full week.",
    ],
  },
  {
    key: "SRE-1211", title: "Load test ledger-pg at 2x settlement peak", type: "Task", priority: "High", component: "Performance", reporter: "priya", assignee: "jonah",
    comments: [
      "Test plan drafted, replaying a captured settlement window at 2x through the cloud PgBouncer tier.",
      "First run: p99 held at 41ms up to 1.7x, then connection waits climbed fast. Looks like the PgBouncer pods are CPU-throttled.",
      "Raised the CPU limit on PgBouncer pods. Second run passed at 2.1x with p99 under 60ms.",
    ],
  },
  {
    key: "SRE-1215", title: "Synthetic checks for auth-gateway login flow from three regions", type: "Story", priority: "Medium", component: "Observability", reporter: "felix", assignee: "paul",
    comments: [
      "Checks are running every minute from us-east, us-west and eu-central.",
      "eu-central shows 300ms more TTFB than the others. Expected for now; it'll improve once the edge PoP is configured.",
    ],
  },
  {
    key: "SRE-1219", title: "Kafka consumer lag on settlement-events after broker restart", type: "Incident", priority: "Medium", component: "Streaming", reporter: "ethan", assignee: "diego",
    comments: [
      "Consumer group ledger-sync fell 1.2M messages behind after the rolling restart. Rebalance took 11 minutes.",
      "Switched the group to cooperative sticky assignment. The next restart rebalanced in under 40 seconds.",
    ],
  },
  {
    key: "PAY-3307", title: "Reconciliation job reports drift rows after cutover rehearsal", type: "Bug", priority: "Highest", component: "Ledger", reporter: "aisha", assignee: "aisha",
    comments: [
      "Three drift rows after rehearsal 2, all of them refunds that were in flight during the write freeze.",
      "Root cause: the freeze flag is checked before the refund is enqueued but not before it's committed. Fix is to check inside the transaction.",
      "Fix deployed to staging. Rehearsal 3 finished with 0 drift rows.",
    ],
  },
  {
    key: "PAY-3312", title: "Adatum webhook signature verification fails for retried events", type: "Bug", priority: "High", component: "Processor Integration", reporter: "carlos", assignee: "ben",
    comments: [
      "Adatum re-signs retried webhooks with a new timestamp, but we cache the first signature by event ID.",
      "Amara confirmed the behavior is documented on their side. We'll verify per delivery instead of per event.",
      "Patched. No signature failures in the last 36h of webhook traffic.",
    ],
  },
  {
    key: "PAY-3318", title: "Idempotency keys expire before client retry window closes", type: "Bug", priority: "Medium", component: "payments-api", reporter: "tom", assignee: "aisha",
    comments: [
      "Keys expire after 1h but mobile clients can retry for up to 24h when offline.",
      "Extended TTL to 26h. Storage impact is around 4GB, which is fine.",
    ],
  },
  {
    key: "PAY-3321", title: "Add circuit breaker around ledger writes in payments-api", type: "Story", priority: "High", component: "payments-api", reporter: "me", assignee: "ben",
    comments: [
      "This is the remaining big action item from INC-4821. We want to shed load to the async queue instead of piling onto ledger-pg.",
      "Design doc linked. Breaker opens at 50% error rate or p99 > 800ms over 30s; half-open probes every 10s.",
      "Implementation merged behind ledger_breaker_enabled. Will enable in staging after the load test.",
    ],
  },
  {
    key: "PAY-3326", title: "Settlement report CSV has wrong timezone for EU merchants", type: "Bug", priority: "Medium", component: "Reporting", reporter: "zoe", assignee: "ethan",
    comments: [
      "Two merchants flagged that their daily report cut off at 5pm local time instead of midnight.",
      "The report job was using the server timezone. It now uses the merchant's configured timezone, and backfilled reports have been regenerated.",
    ],
  },
  {
    key: "PAY-3330", title: "Move payments-worker queue from DAL1 RabbitMQ to cloud Kafka", type: "Story", priority: "High", component: "Migration", reporter: "ben", assignee: "bruno",
    comments: [
      "Contoso proposes a bridge consumer that reads from RabbitMQ and republishes to Kafka during the transition.",
      "Bridge is running in staging. Ordering is preserved per merchant ID because that's our partition key.",
      "Need sign-off from Aisha on the at-least-once semantics before prod.",
    ],
  },
  {
    key: "PAY-3334", title: "Refund API returns 500 when merchant account is suspended", type: "Bug", priority: "Low", component: "payments-api", reporter: "julia", assignee: "aisha",
    comments: [
      "Should be a 409 with a clear error code. Found during regression testing.",
      "Fixed. It now returns 409 merchant_suspended, and there's a contract test for it.",
    ],
  },
  {
    key: "SEC-418", title: "Rotate database credentials stored in legacy DAL1 config files", type: "Task", priority: "High", component: "Secrets Management", reporter: "kofi", assignee: "nora",
    comments: [
      "Found 6 service accounts with passwords in plaintext config on the DAL1 app hosts.",
      "4 of 6 now come from the secrets manager with automatic rotation. The other two are the reporting replicas.",
      "All six rotated. The old credentials are revoked and the config files are scrubbed.",
    ],
  },
  {
    key: "SEC-421", title: "Pen test scoping: provide Litware with asset inventory and test accounts", type: "Task", priority: "High", component: "Security Assessment", reporter: "rachel", assignee: "kofi",
    comments: [
      "Litware needs the in-scope hostnames, IP ranges and two test merchant accounts by Friday.",
      "Inventory shared in the secure folder. Auth-gateway staging and payments-api staging are in scope; production is out.",
      "Hugo asked for a contact on the network team for the egress testing. Added Tariq.",
    ],
  },
  {
    key: "SEC-424", title: "SOC 2 evidence: quarterly access review for production clusters", type: "Task", priority: "High", component: "Compliance", reporter: "tess", assignee: "me",
    comments: [
      "Need a signed export of everyone with cluster-admin on prod, plus manager attestation.",
      "Export attached. 23 users, 3 of whom left their teams last quarter and still have access.",
      "Access removed for the three stale accounts. Re-exported and attested.",
    ],
  },
  {
    key: "SEC-427", title: "Enforce IMDSv2 on all landing zone compute", type: "Story", priority: "Medium", component: "Cloud Security", reporter: "kofi", assignee: "owen",
    comments: [
      "Policy is in audit mode. 14 instances still allow v1, all from the old CI runner image.",
      "Rebuilt the runner image. Policy switched to deny mode with zero violations.",
    ],
  },
  {
    key: "SEC-430", title: "SOC 2 evidence: change management samples for migration changes", type: "Task", priority: "Medium", component: "Compliance", reporter: "tess", assignee: "ines",
    comments: [
      "Auditors picked 25 sample changes. Each needs a linked ticket, approved PR and deploy record.",
      "22 of 25 are complete. The other three were emergency changes during INC-4821; adding the retro approvals.",
      "All 25 uploaded to the evidence portal.",
    ],
  },
  {
    key: "SEC-433", title: "Expired TLS certificate on internal admin dashboard", type: "Incident", priority: "Medium", component: "PKI", reporter: "liam", assignee: "kofi",
    comments: [
      "admin.int.northwind.example cert expired overnight and browsers are blocking it.",
      "Re-issued and moved it to automated renewal. Also found two more certs expiring within 30 days and queued them.",
    ],
  },
  {
    key: "SEC-436", title: "Remove wildcard IAM permissions from CI deploy role", type: "Task", priority: "High", component: "Cloud Security", reporter: "rachel", assignee: "lena",
    comments: [
      "The deploy role has a wildcard on the storage and compute APIs. Litware will flag this immediately.",
      "Scoped down using 30 days of access logs. Ran every deploy pipeline against the new policy in staging and nothing broke.",
    ],
  },
  {
    key: "DX-77", title: "CI build times regressed to 18 minutes on payments-api", type: "Bug", priority: "Medium", component: "CI", reporter: "aisha", assignee: "amelia",
    comments: [
      "Go module cache isn't being restored since the runner migration. Every build downloads everything.",
      "Cache key was based on the runner hostname. Fixed, and builds are back to about 6 minutes.",
    ],
  },
  {
    key: "DX-81", title: "Preview environments for every PR in platform-api", type: "Epic", priority: "Medium", component: "Developer Experience", reporter: "amelia", assignee: "amelia",
    comments: [
      "Phase 1 covers ephemeral namespaces with seeded test data, torn down 24h after the last push.",
      "Pilot with the Platform API team went well. Ravi's team caught two config bugs before merge.",
      "Cost is roughly what we spend on two always-on staging envs. Asking Malik to confirm the budget line.",
    ],
  },
  {
    key: "DX-84", title: "Flaky test: TestSessionRefreshConcurrent in auth-gateway", type: "Bug", priority: "Low", component: "Testing", reporter: "julia", assignee: "noah",
    comments: [
      "Fails roughly 1 in 30 runs. Race between token refresh and the revocation check.",
      "Real bug, not a test bug. Two concurrent refreshes could both succeed. Fixed with a compare-and-swap on the refresh token family.",
    ],
  },
  {
    key: "DX-88", title: "Golden path template for new Go services", type: "Story", priority: "Medium", component: "Developer Experience", reporter: "victor", assignee: "hana",
    comments: [
      "Template should include structured logging, OpenTelemetry tracing, health endpoints and the standard Helm chart.",
      "First version is published. Three teams have scaffolded services from it this sprint.",
    ],
  },
  {
    key: "DX-92", title: "Release notes generator misses commits from squash merges", type: "Bug", priority: "Low", component: "Release Tooling", reporter: "ines", assignee: "amelia",
    comments: [
      "Squash merges lose the conventional commit prefix if the PR title doesn't have one.",
      "Added a PR title lint check. The generator also falls back to the PR labels now.",
    ],
  },
  {
    key: "PLAT-2348", title: "ledger-pg logical replication slot cleanup after cutover rehearsal", type: "Task", priority: "Medium", component: "Databases", reporter: "nora", assignee: "daniel",
    comments: [
      "Rehearsal 2 left an inactive slot on the DAL1 primary that's retaining 60GB of WAL.",
      "Dropped the slot. Added a post-rehearsal checklist item and an alert on inactive slots older than 1h.",
    ],
  },
  {
    key: "PLAT-2352", title: "Observability agent rollout to landing zone clusters", type: "Story", priority: "Medium", component: "Observability", reporter: "felix", assignee: "sam",
    comments: [
      "Fabrikam agent DaemonSet deployed to staging. Log volume is 40% higher than estimated because of debug-level sidecar logs.",
      "Dropped sidecar logs below info at the agent. Volume is now within the contract tier.",
      "Steve from Fabrikam reviewed the config and suggested enabling tail sampling for traces. Ticket created.",
    ],
  },
  {
    key: "PLAT-2357", title: "Capacity plan for ledger-pg in landing zone (next 12 months)", type: "Task", priority: "Medium", component: "Capacity", reporter: "me", assignee: "nora",
    comments: [
      "Storage is growing about 3.5% per month. The current volume class gets us 14 months.",
      "Recommend going with the larger instance class now and avoiding a resize during peak season. Cost delta is in the doc for Helen.",
    ],
  },
  {
    key: "PLAT-2361", title: "Backup restore drill for ledger-pg in landing zone", type: "Task", priority: "High", component: "Databases", reporter: "tess", assignee: "nora",
    comments: [
      "SOC 2 needs evidence of a successful restore from the new backup system before cutover.",
      "Restored last night's snapshot to an isolated instance in 47 minutes. Checksums match.",
      "Evidence package uploaded and linked in SEC-430.",
    ],
  },
  {
    key: "SRE-1224", title: "Error budget policy breach: payments-api availability", type: "Task", priority: "High", component: "SLOs", reporter: "priya", assignee: "me",
    comments: [
      "INC-4821 consumed 78% of the 30-day error budget for payments-api. Per policy, feature launches need SRE sign-off until it recovers.",
      "Tom has two launches queued. Recommending we hold the merchant dashboard redesign and let the refund API change through, since it's low risk.",
    ],
  },
  {
    key: "SRE-1228", title: "Runbook: what to do when PgBouncer cl_waiting alert fires", type: "Task", priority: "Medium", component: "On-call", reporter: "priya", assignee: "paul",
    comments: [
      "Draft covers checking pool stats, identifying long-running transactions and the safe way to raise pool size live.",
      "Walked Sam and Felix through it in the on-call review. Added a section for when the cause is upstream retries.",
    ],
  },
  {
    key: "PLAT-2366", title: "Auth-gateway: drop support for legacy HMAC API tokens", type: "Story", priority: "Low", component: "Identity", reporter: "noah", assignee: "noah",
    comments: [
      "12 merchants still use HMAC tokens. Tom is coordinating outreach.",
      "Down to 3 merchants. Sunset date is set for two releases from now.",
    ],
  },
  {
    key: "PLAT-2370", title: "Landing zone DNS: split-horizon resolution for internal services", type: "Bug", priority: "High", component: "Networking", reporter: "anika", assignee: "tariq",
    comments: [
      "Pods in the landing zone resolve ledger-pg.int to the DAL1 address because the forwarder is querying the old resolvers first.",
      "Reordered the forwarders and added a conditional forwarding rule for the int zone. Verified from three namespaces.",
    ],
  },
  {
    key: "PAY-3339", title: "Adatum sandbox rate limits block cutover rehearsal traffic", type: "Task", priority: "Medium", component: "Processor Integration", reporter: "ben", assignee: "tom",
    comments: [
      "Rehearsal replay hits Adatum sandbox at 400 rps. Their sandbox limit is 100.",
      "Ingrid got us a temporary raise to 500 rps for the next two rehearsal windows.",
    ],
  },
  {
    key: "SRE-1232", title: "Hiring: Staff SRE take-home exercise refresh", type: "Task", priority: "Low", component: "Hiring", reporter: "harper", assignee: "priya",
    comments: [
      "Candidates are saying the take-home runs well over the 3h estimate.",
      "Replaced it with a 90-minute live incident simulation. Rubric is in the hiring folder.",
      "Ran it with two internal volunteers to calibrate. Both finished in about 75 minutes.",
    ],
  },
  {
    key: "PLAT-2374", title: "Contoso access: provision break-glass accounts for cutover weekend", type: "Task", priority: "High", component: "Access Management", reporter: "kevin", assignee: "kofi",
    comments: [
      "Bruno and Daniel need time-boxed admin access to the landing zone during the cutover window.",
      "Accounts created with a 72h expiry, hardware key MFA required, and all sessions recorded.",
      "Rachel approved. Access activates automatically at the start of the window.",
    ],
  },
  {
    key: "SEC-439", title: "Phishing simulation follow-up for Platform org", type: "Task", priority: "Low", component: "Security Awareness", reporter: "rachel", assignee: "me",
    comments: [
      "Platform click rate was 6%, down from 11% last time. Two people entered credentials on the fake page.",
      "Both have finished the refresher module. Thanks for nudging them.",
    ],
  },
];

// ---------------------------------------------------------------------------
// CI
// ---------------------------------------------------------------------------

export interface CiRepo { repo: string; workflows: string[]; branches: string[] }

export const CI_REPOS: CiRepo[] = [
  { repo: "northwind/payments-api", workflows: ["build-and-test", "deploy-staging", "contract-tests", "nightly-e2e"], branches: ["main", "feat/ledger-circuit-breaker", "fix/idempotency-ttl", "fix/refund-409-suspended"] },
  { repo: "northwind/payments-worker", workflows: ["build-and-test", "deploy-staging", "chaos-retry-budget"], branches: ["main", "feat/jittered-backoff", "feat/kafka-bridge-consumer"] },
  { repo: "northwind/ledger", workflows: ["build-and-test", "reconcile-integration", "migration-rehearsal"], branches: ["main", "fix/freeze-flag-in-txn", "feat/drift-report-v2"] },
  { repo: "northwind/platform-terraform", workflows: ["terraform-plan", "terraform-apply", "tflint-and-checkov"], branches: ["main", "feat/egress-nat-cutover", "fix/vpc-peering-idempotent", "feat/imdsv2-enforce"] },
  { repo: "northwind/auth-gateway", workflows: ["build-and-test", "deploy-staging", "synthetic-login-checks"], branches: ["main", "feat/managed-session-store", "fix/refresh-token-cas", "chore/drop-hmac-tokens"] },
  { repo: "northwind/platform-helm-charts", workflows: ["lint-and-template", "publish-charts"], branches: ["main", "fix/pgbouncer-pool-size", "feat/mesh-strict-mtls"] },
  { repo: "northwind/platform-api", workflows: ["build-and-test", "preview-env", "deploy-staging"], branches: ["main", "feat/preview-envs", "fix/pagination-cursor"] },
  { repo: "northwind/observability-config", workflows: ["validate-rules", "deploy-rules"], branches: ["main", "feat/time-to-full-disk-alert", "feat/tail-sampling"] },
  { repo: "northwind/runbooks", workflows: ["markdown-lint", "publish-site"], branches: ["main", "docs/auth-gateway-dns-rollback", "docs/pgbouncer-cl-waiting"] },
  { repo: "northwind/go-service-template", workflows: ["build-and-test", "scaffold-smoke-test"], branches: ["main", "feat/otel-defaults"] },
  { repo: "northwind/settlement-reports", workflows: ["build-and-test", "nightly-backfill-check"], branches: ["main", "fix/merchant-timezone"] },
];

export const CI_FAILURES: string[] = [
  "FAIL ledger/reconcile_test.go:212: expected 0 drift rows, got 3",
  "Error: terraform plan exited with code 1: Error acquiring the state lock (lock ID 7f3c2a91, held by ci-runner-14)",
  "--- FAIL: TestSessionRefreshConcurrent (0.43s) session_test.go:188: refresh succeeded twice for token family tf_9a1e",
  "Error: context deadline exceeded while waiting for deployment/payments-api rollout (3/6 replicas available)",
  "contract-tests: POST /v2/refunds expected status 409, got 500 (merchant_suspended fixture)",
  "panic: runtime error: invalid memory address or nil pointer dereference [signal SIGSEGV] in breaker.(*Breaker).Allow",
  "helm template failed: values.yaml: pgbouncer.defaultPoolSize: invalid type. Expected integer, given string",
  "checkov: CKV_CLOUD_79 FAILED for resource compute_instance.ci_runner: Instance metadata service v1 is enabled",
  "Error: Cycle: module.landing_zone.cloud_route_table_association.private, module.landing_zone.cloud_vpc_peering_connection.dal1",
  "nightly-e2e: checkout flow timed out after 120s at step 'await settlement webhook' (staging)",
  "go: downloading modules failed: dial tcp: lookup proxy.int.northwind.example: i/o timeout",
  "FAIL payments-worker/retry: TestRetryBudgetExhausted expected <= 10 retries, observed 27",
  "promtool check rules: observability/rules/disk.yaml: 14:9: group \"disk\", rule 2: could not parse expression: unexpected identifier",
  "ERROR: relation \"settlement_batches_v2\" does not exist (migration 0147 not applied in rehearsal database)",
  "Docker build failed: COPY failed: file not found in build context: config/ledger.local.yaml",
  "markdown-lint: runbooks/auth-gateway/dns-rollback.md:42 MD040 Fenced code blocks should have a language specified",
  "e2e: expected login redirect to /dashboard, got /mfa/challenge (synthetic user missing MFA bypass in staging)",
  "OOMKilled: container reconcile-integration exceeded memory limit 2Gi during fixture load",
  "terraform apply: Error creating NAT Gateway: LimitExceeded: elastic IP address limit reached for this account",
  "golangci-lint: ledger/writer.go:88:2: Error return value of tx.Rollback is not checked (errcheck)",
  "chaos-retry-budget: p99 latency to ledger-pg 2.8s exceeded threshold 1.0s under injected 300ms slowdown",
  "TypeError: Cannot read properties of undefined (reading 'merchantTimezone') at buildReportHeader (report.ts:57)",
  "kubectl apply failed: admission webhook denied the request: PeerAuthentication mode STRICT conflicts with existing DestinationRule",
  "Test suite exceeded 30m timeout; 412 of 538 tests completed (job cancelled)",
  "pg_dump: error: connection to server at \"ledger-pg-replica-2.int\" failed: FATAL: remaining connection slots are reserved for non-replication superuser connections",
  "flaky: TestKafkaBridgeOrdering passed on retry 2/3 (ordering violation for merchant m_44821 on first attempt)",
];

// ---------------------------------------------------------------------------
// Code review
// ---------------------------------------------------------------------------

export interface PullRequestDef { repo: string; number: number; title: string; author: string; description: string; reviewComments: string[] }

export const PULL_REQUESTS: PullRequestDef[] = [
  {
    repo: "northwind/payments-api", number: 1842, title: "Add circuit breaker around ledger writes", author: "ben",
    description: "Wraps all ledger writes in a breaker so payments-api sheds load to the async queue instead of piling onto ledger-pg. Follow-up to INC-4821.\n- Opens at 50% errors or p99 > 800ms over a 30s window\n- Half-open probe every 10s\n- Gated behind ledger_breaker_enabled (off by default)",
    reviewComments: [
      "Can we emit a metric on every state transition? On-call will want to see when it flips without digging through logs.",
      "The 30s window seems long for a payment path. Worth trying 10s in the load test before we lock this in.",
    ],
  },
  {
    repo: "northwind/payments-worker", number: 611, title: "Exponential backoff with full jitter and retry budget", author: "aisha",
    description: "Replaces the immediate triple retry with exponential backoff, full jitter, and a per-client retry budget of 10%. This is the fix for the amplification we saw in INC-4821.\n- Base delay 50ms, cap 5s\n- Budget tracked in a sliding 60s window",
    reviewComments: [
      "Nice. Can the budget be configurable per downstream? The Adatum client probably wants a different number than ledger.",
      "Tested in staging with the chaos job, and peak QPS during the slowdown dropped from 4.1k to 1.2k. LGTM.",
    ],
  },
  {
    repo: "northwind/ledger", number: 903, title: "Check write freeze flag inside the commit transaction", author: "aisha",
    description: "The freeze flag was only checked before enqueueing a refund, so refunds in flight at freeze time could still commit. This moves the check inside the transaction with a row lock on the freeze record. Fixes PAY-3307.",
    reviewComments: [
      "SELECT ... FOR SHARE on the freeze row should be enough here, no need for FOR UPDATE. Otherwise refunds will serialize behind each other.",
      "Please add a test that toggles the freeze mid-transaction.",
    ],
  },
  {
    repo: "northwind/platform-terraform", number: 2217, title: "NAT gateway pair and egress routes for payments subnets", author: "tariq",
    description: "Provisions two NAT gateways across AZs and routes payments subnets through them. The elastic IPs are output so we can send them to Adatum for allowlisting.\n- No traffic shifts until the route table association is applied in the cutover window\n- Plan shows 9 to add, 0 to change, 0 to destroy",
    reviewComments: [
      "Can we tag the EIPs with the Adatum allowlist ticket number so nobody releases them by accident?",
      "Plan output looks right to me. Approving, but let's apply the route association only during the window.",
    ],
  },
  {
    repo: "northwind/platform-terraform", number: 2224, title: "Normalize CIDR ordering in VPC peering module", author: "owen",
    description: "Sorts CIDR lists before passing them to the route resources so plans stop showing a perpetual diff. Fixes PLAT-2316.",
    reviewComments: [
      "Confirmed a no-op plan against staging and prod after this change.",
    ],
  },
  {
    repo: "northwind/platform-terraform", number: 2231, title: "Enforce IMDSv2 across landing zone compute", author: "owen",
    description: "Sets http_tokens = required on every launch template and adds an org policy to deny instances that allow v1. The CI runner image was rebuilt last week, so there should be zero violations.",
    reviewComments: [
      "Can we ship the policy in audit mode for a day first, just to be safe?",
      "Kofi says the audit run was clean all week, so I'm fine going straight to deny.",
    ],
  },
  {
    repo: "northwind/auth-gateway", number: 1288, title: "Dual-write sessions to managed cache", author: "lena",
    description: "Writes sessions to both the DAL1 Redis and the managed cache. Reads stay on DAL1 for now. Controlled by session_store_dualwrite.\n- Writes to the managed cache are best-effort, so a failure logs and continues\n- Adds a key-count comparison job that runs hourly",
    reviewComments: [
      "Best-effort writes mean we could drift silently. Can the comparison job alert above some threshold?",
      "Make sure the TTL is set from the same clock on both writes. We got bitten by that in the last migration.",
      "Approved with the alert added.",
    ],
  },
  {
    repo: "northwind/auth-gateway", number: 1294, title: "Compare-and-swap on refresh token family", author: "noah",
    description: "Fixes a race where two concurrent refreshes with the same token could both succeed. The refresh now does an atomic CAS on the token family generation. Fixes the flaky TestSessionRefreshConcurrent too.",
    reviewComments: [
      "This is a real security fix, not just test hygiene. Let's call it out in release notes.",
      "What happens to the losing request? It should get a 401 with a retry hint, not a 500.",
    ],
  },
  {
    repo: "northwind/auth-gateway", number: 1301, title: "Remove legacy HMAC token verification path", author: "noah",
    description: "Drops the HMAC API token verifier. Only three merchants still used it, and Tom has confirmed they've migrated to OAuth client credentials. Removes about 900 lines.",
    reviewComments: [
      "Can we keep the verifier behind a kill switch for one release, in case a merchant we missed shows up?",
    ],
  },
  {
    repo: "northwind/platform-helm-charts", number: 455, title: "Raise PgBouncer default_pool_size and add reserve pool", author: "nora",
    description: "Raises default_pool_size from 40 to 80 and sets reserve_pool_size to 10 with a 3s reserve timeout. Postgres max_connections is 400, so we still have headroom across all four PgBouncer replicas.",
    reviewComments: [
      "4 replicas x 90 = 360, plus the admin and replication connections. That's tight. Can we confirm the replication slot count?",
      "Also bump the CPU limit on these pods. The load test showed throttling at 1.7x.",
    ],
  },
  {
    repo: "northwind/platform-helm-charts", number: 461, title: "Strict mTLS for payments namespace", author: "ravi",
    description: "Switches PeerAuthentication to STRICT for payments-api and payments-worker. ledger-sync stays PERMISSIVE until the Kafka broker move.\n- Adds a port-level exception for the metrics endpoint",
    reviewComments: [
      "Fine with this. Let's roll it out on a Tuesday morning, not right before the weekend.",
      "Double-check the DestinationRule for ledger-sync. Otherwise the admission webhook will reject this.",
    ],
  },
  {
    repo: "northwind/observability-config", number: 318, title: "Replace threshold disk alerts with time-to-full prediction", author: "felix",
    description: "Removes the 80/85/90% disk alerts and adds one alert that fires when predicted time-to-full is under 4 hours, based on a 6-hour linear fit. Shadow mode ran for a week: 4 fires vs. 31 pages.",
    reviewComments: [
      "Keep a 95% hard threshold as a backstop. Linear fits miss sudden spikes like log floods.",
      "Love this. Please add the runbook link to the annotation.",
    ],
  },
  {
    repo: "northwind/observability-config", number: 322, title: "PgBouncer cl_waiting alert", author: "priya",
    description: "Pages when cl_waiting > 20 for 2 minutes on any ledger PgBouncer. During INC-4821 this would have fired 9 minutes before the first customer-facing error.",
    reviewComments: [
      "Should this be a P2 instead of a P1? It's a leading indicator, not an outage.",
      "Agree with P2 during business hours. But if it's still firing after 10 minutes, escalate to P1.",
    ],
  },
  {
    repo: "northwind/observability-config", number: 327, title: "Enable tail sampling for payments traces", author: "sam",
    description: "Configures the Fabrikam collector to keep 100% of traces with errors or latency > 1s, and 5% of the rest. Steve from Fabrikam reviewed the policy.",
    reviewComments: [
      "This should cut trace ingest by about 70%. Let's tell Malik so he can adjust the forecast.",
    ],
  },
  {
    repo: "northwind/platform-api", number: 2054, title: "Ephemeral preview environments per PR", author: "amelia",
    description: "Each PR gets its own namespace with seeded test data and a unique URL. Environments are torn down 24h after the last push.\n- Uses the existing staging cluster with a resource quota per namespace\n- Seed data comes from the anonymized fixture set",
    reviewComments: [
      "What stops a long-lived PR from holding a namespace forever? Is there a hard cap?",
      "Resource quota looks generous. Can we start at half and raise it if teams complain?",
    ],
  },
  {
    repo: "northwind/platform-api", number: 2061, title: "Fix cursor pagination skipping records with equal timestamps", author: "ravi",
    description: "The cursor was created_at only, so records sharing a timestamp could be skipped across pages. The cursor is now (created_at, id). Existing cursors still decode.",
    reviewComments: [
      "Make sure the composite index exists in prod. I only see it in the staging migration.",
      "LGTM once the index migration lands first.",
    ],
  },
  {
    repo: "northwind/payments-api", number: 1849, title: "Extend idempotency key TTL to 26 hours", author: "aisha",
    description: "Mobile clients can retry for up to 24 hours when offline. Extends the TTL to 26h to cover that plus clock skew. Estimated storage increase is about 4GB.",
    reviewComments: [
      "Approved. Can we add a metric for idempotency hits so we can see how often late retries actually happen?",
    ],
  },
  {
    repo: "northwind/payments-api", number: 1853, title: "Return 409 merchant_suspended from refund endpoint", author: "julia",
    description: "Refund requests for suspended merchants used to bubble up as a 500. They now return 409 with error code merchant_suspended. Adds a contract test.",
    reviewComments: [
      "Please update the public API docs. Support gets asked about this.",
      "Small nit: use the shared error constructor so the error body shape is consistent.",
    ],
  },
  {
    repo: "northwind/payments-api", number: 1858, title: "Verify Adatum webhook signatures per delivery", author: "ben",
    description: "Adatum re-signs retried webhooks with a new timestamp. We were caching the first signature by event ID, so retries failed verification. Signatures are now checked per delivery, and the event ID is used only for dedupe.",
    reviewComments: [
      "Confirmed with Amara that the signing key itself doesn't rotate on retry. LGTM.",
      "Please keep the 5-minute timestamp tolerance. Don't widen it.",
    ],
  },
  {
    repo: "northwind/payments-worker", number: 618, title: "RabbitMQ to Kafka bridge consumer", author: "bruno",
    description: "Reads from the DAL1 RabbitMQ payments queue and republishes to the cloud Kafka topic, partitioned by merchant ID. Runs during the transition only.\n- At-least-once delivery; downstream consumers already dedupe by payment ID\n- Bridge lag exported as a metric",
    reviewComments: [
      "What happens if Kafka is unavailable? We should nack and requeue, not drop.",
      "Ordering per merchant only holds if there's a single bridge instance or we shard by merchant. Which is it?",
      "Answered in thread: one instance per shard, 8 shards. Approving.",
    ],
  },
  {
    repo: "northwind/ledger", number: 911, title: "Drift report v2 with per-merchant breakdown", author: "ethan",
    description: "The reconciliation drift report now groups drift rows by merchant and transaction type, with links to the source events. Makes rehearsal review much faster.",
    reviewComments: [
      "Can you include the event timestamps relative to the freeze start? That's the first thing we look for.",
    ],
  },
  {
    repo: "northwind/ledger", number: 915, title: "Alert on inactive logical replication slots", author: "daniel",
    description: "Adds a check that flags any replication slot that's been inactive for over an hour. Rehearsal 2 left one behind that held 60GB of WAL.",
    reviewComments: [
      "Good catch. Make it page during migration windows and ticket the rest of the time.",
      "Please exclude the slot used by the reporting replica. It's intentionally paused overnight.",
    ],
  },
  {
    repo: "northwind/settlement-reports", number: 204, title: "Use merchant timezone for daily report cut-off", author: "ethan",
    description: "The daily report job used the server timezone, so EU merchants' reports were cut off at 5pm local time. It now reads the merchant's configured timezone. Includes a backfill script.",
    reviewComments: [
      "What about merchants without a configured timezone? Default to UTC explicitly, not the server zone.",
      "Backfill script should be idempotent. Can you confirm it overwrites rather than appends?",
    ],
  },
  {
    repo: "northwind/runbooks", number: 142, title: "Auth-gateway DNS cutover rollback procedure", author: "lena",
    description: "Step-by-step rollback for the auth-gateway DNS cutover, with exact commands and expected outputs. Reviewed with Contoso.\n- Includes the step to drain old health checks\n- TTLs confirmed at 60s by Network",
    reviewComments: [
      "Step 4 needs the actual record name, not a placeholder.",
      "Add an explicit decision point: if login error rate is above 2% for 5 minutes, roll back without waiting for the IC.",
    ],
  },
  {
    repo: "northwind/runbooks", number: 145, title: "PgBouncer cl_waiting alert runbook", author: "paul",
    description: "Covers how to read pool stats, find long-running transactions and safely raise pool size live. Adds a section for when upstream retries are the cause.",
    reviewComments: [
      "Can you add the SHOW POOLS output from INC-4821 as a worked example?",
    ],
  },
  {
    repo: "northwind/go-service-template", number: 37, title: "OpenTelemetry defaults and structured logging", author: "hana",
    description: "New services get tracing, metrics and JSON logging out of the box. Trace context is propagated in logs so they correlate in Fabrikam.",
    reviewComments: [
      "Default sampling rate should be low; let the collector's tail sampling do the work.",
      "Add a health check that actually checks dependencies, not just returns 200.",
    ],
  },
  {
    repo: "northwind/platform-terraform", number: 2238, title: "Scope down CI deploy role permissions", author: "lena",
    description: "Replaces the wildcard storage and compute permissions on the CI deploy role with an explicit list generated from 30 days of access logs. Every deploy pipeline was run against the new policy in staging.",
    reviewComments: [
      "The nightly backup job uses this role too. Did that run against the new policy?",
      "Good to land before the Litware pen test starts.",
    ],
  },
  {
    repo: "northwind/platform-terraform", number: 2242, title: "Time-boxed break-glass accounts for Contoso cutover team", author: "kofi",
    description: "Creates two admin accounts for the cutover window with a 72-hour expiry and required hardware key MFA. Session recording is on, and access activates automatically at the window start.",
    reviewComments: [
      "Can the expiry be enforced by the identity provider rather than a scheduled job? I'd rather not rely on cron for this.",
      "Approved by Rachel in the access ticket. LGTM.",
    ],
  },
  {
    repo: "northwind/platform-terraform", number: 2247, title: "Conditional forwarding for int zone in landing zone DNS", author: "tariq",
    description: "Pods in the landing zone were resolving ledger-pg.int to the DAL1 address. This reorders the forwarders and adds a conditional rule for the int zone.",
    reviewComments: [
      "Verified from payments, auth and ledger namespaces. All resolve to the landing zone endpoints now.",
    ],
  },
  {
    repo: "northwind/platform-helm-charts", number: 468, title: "Cluster autoscaler for staging node pools", author: "owen",
    description: "Enables the cluster autoscaler on staging with min 5 / max 14 nodes. Staging has been averaging 18% CPU on 12 nodes.",
    reviewComments: [
      "The nightly-e2e run spikes to about 10 nodes' worth of pods. Make sure scale-up is fast enough that it doesn't time out.",
    ],
  },
  {
    repo: "northwind/auth-gateway", number: 1307, title: "Synthetic login checks from three regions", author: "paul",
    description: "Adds synthetic checks for the full login flow (password plus MFA bypass for the synthetic user) every minute from us-east, us-west and eu-central.",
    reviewComments: [
      "Make sure the synthetic user can't be used outside the check runners. IP allowlist at minimum.",
      "Tag these checks so they don't count against the login SLO.",
    ],
  },
  {
    repo: "northwind/payments-api", number: 1861, title: "Load shedding for merchant dashboard read endpoints", author: "ravi",
    description: "Adds a priority-based load shedder so dashboard reads are dropped before payment writes when the service is saturated. Reads return 503 with Retry-After.",
    reviewComments: [
      "Coordinate with Hana. The frontend needs to handle the 503 gracefully instead of showing a blank page.",
      "Priority classes look right. Approving.",
    ],
  },
  {
    repo: "northwind/ledger", number: 920, title: "Throttle autovacuum on settlements table during replication", author: "nora",
    description: "Lowers autovacuum_vacuum_cost_limit on the settlements table to stop replication lag spikes on the cross-site link. A manual vacuum runs in the low-traffic window instead.",
    reviewComments: [
      "Watch bloat on that table. If dead tuples climb past 20% we'll need to revisit.",
      "Lag graph from last night looks great. LGTM.",
    ],
  },
  {
    repo: "northwind/observability-config", number: 331, title: "Drop sidecar debug logs at the agent", author: "felix",
    description: "Filters sidecar logs below info level at the Fabrikam agent. Log volume was running 40% over the contract tier estimate.",
    reviewComments: [
      "Make sure the filter doesn't catch application logs that happen to come through the same pipeline.",
    ],
  },
  {
    repo: "northwind/platform-api", number: 2068, title: "Rate limit headers on all public endpoints", author: "victor",
    description: "Every public response now includes X-RateLimit-Limit, X-RateLimit-Remaining and X-RateLimit-Reset. Merchants have asked for this so they can back off instead of guessing.",
    reviewComments: [
      "Can we document the reset semantics clearly (epoch seconds vs. seconds remaining)? People always get this wrong.",
      "LGTM. Tom will want to mention this in the merchant changelog.",
    ],
  },
];

// ---------------------------------------------------------------------------
// Calendar
// ---------------------------------------------------------------------------

export interface MeetingDef { title: string; organizer: string; minutes: number; recurring: boolean; description: string; attendees: string[] }

export const MEETINGS: MeetingDef[] = [
  {
    title: "Platform Engineering Staff Meeting", organizer: "maya", minutes: 60, recurring: true,
    description: "Weekly staff meeting for Platform leads. Agenda: migration status, hiring pipeline, on-call health, and open topics from the doc.\nJoin: https://meet.northwind.example/plt-staf-wkl",
    attendees: ["me", "mei", "diego", "nora", "priya", "amelia", "grace"],
  },
  {
    title: "Alex / Renata 1:1", organizer: "maya", minutes: 30, recurring: true,
    description: "Weekly 1:1. Renata has asked to cover the steering committee readout and Q4 headcount this week.\nJoin: https://meet.northwind.example/ren-alx-one",
    attendees: ["renata", "me"],
  },
  {
    title: "Alex / Mei 1:1", organizer: "mei", minutes: 30, recurring: true,
    description: "Weekly 1:1. Runtime team updates, mesh rollout, and Mei's promo packet for Lena.",
    attendees: ["mei", "me"],
  },
  {
    title: "Alex / Nora 1:1", organizer: "nora", minutes: 30, recurring: true,
    description: "Weekly 1:1. ledger-pg cutover readiness, capacity plan, and DBA on-call coverage over the cutover weekend.",
    attendees: ["nora", "me"],
  },
  {
    title: "Alex / Priya 1:1", organizer: "priya", minutes: 30, recurring: true,
    description: "Biweekly 1:1. INC-4821 action items, error budget policy, and Staff SRE interview loop feedback.",
    attendees: ["priya", "me"],
  },
  {
    title: "Alex / Diego 1:1", organizer: "diego", minutes: 30, recurring: true,
    description: "Weekly 1:1. Kafka broker migration plan, settlement-events consumer lag, and Data Platform roadmap.",
    attendees: ["diego", "me"],
  },
  {
    title: "Auth-gateway Cutover Go/No-Go", organizer: "grace", minutes: 45, recurring: false,
    description: "Go/no-go decision for the auth-gateway DNS cutover. We'll walk the readiness checklist, rollback plan and staffing, then each owner gives a go or no-go.\nJoin: https://meet.northwind.example/agw-gong-cut",
    attendees: ["me", "grace", "lena", "noah", "tariq", "kofi", "kevin", "bruno", "ines", "priya"],
  },
  {
    title: "ledger-pg Cutover Rehearsal 3 Review", organizer: "grace", minutes: 60, recurring: false,
    description: "Review results from rehearsal 3: drift report, replication lag, timing of each step versus the plan. We need to decide whether rehearsal 4 is required.\nJoin: https://meet.northwind.example/ldg-reh-thr",
    attendees: ["me", "grace", "nora", "daniel", "aisha", "ben", "anika", "jonah"],
  },
  {
    title: "DAL1 Exit Steering Committee", organizer: "grace", minutes: 60, recurring: true,
    description: "Biweekly steering committee. Agenda: milestone status, budget burn against the Contoso SOW, risks and decisions needed. Pre-read is linked in the invite.\nJoin: https://meet.northwind.example/dal-exit-stc",
    attendees: ["renata", "marcus", "helen", "me", "grace", "kevin", "laura", "ben"],
  },
  {
    title: "Fabrikam Quarterly Business Review", organizer: "yuki", minutes: 60, recurring: false,
    description: "Quarterly review with Fabrikam: usage against contract tier, the support ticket summary, roadmap preview, and renewal timeline. Rebecca will join for the last 15 minutes to discuss the renewal.",
    attendees: ["yuki", "megan", "steve", "rebecca", "me", "felix", "malik", "olivia"],
  },
  {
    title: "Contoso Weekly Migration Sync", organizer: "fiona", minutes: 45, recurring: true,
    description: "Weekly sync with Contoso: progress against plan, blockers, staffing for upcoming cutover windows. RAID log will be reviewed live.",
    attendees: ["fiona", "kevin", "anika", "bruno", "daniel", "me", "grace", "nora"],
  },
  {
    title: "Adatum Partner Sync: Egress IP Allowlist", organizer: "ingrid", minutes: 30, recurring: false,
    description: "Confirm the production allowlist change for Northwind's new NAT gateway IPs and agree on the cutover window and rollback contact path.",
    attendees: ["ingrid", "carlos", "amara", "me", "tariq", "ben"],
  },
  {
    title: "Interview Panel: Staff SRE (Ryan Holt)", organizer: "elena", minutes: 60, recurring: false,
    description: "Panel for Staff SRE candidate Ryan Holt. Alex covers leadership and influence; the scorecard is in the hiring system. Please submit feedback within 24 hours.\nJoin: https://meet.northwind.example/int-srx-rht",
    attendees: ["elena", "me", "priya"],
  },
  {
    title: "Interview Panel: Staff SRE (Dev Kapoor)", organizer: "elena", minutes: 60, recurring: false,
    description: "Panel for Staff SRE candidate Dev Kapoor. Alex covers leadership and influence. Dev's live incident simulation is earlier the same day with Jonah and Felix.\nJoin: https://meet.northwind.example/int-srx-dkp",
    attendees: ["elena", "me", "victor"],
  },
  {
    title: "Staff SRE Hiring Debrief", organizer: "harper", minutes: 45, recurring: false,
    description: "Debrief for both Staff SRE finalists. Everyone please have feedback submitted before the meeting. We'll aim to make a decision on the call.",
    attendees: ["harper", "me", "priya", "jonah", "felix", "victor", "elena"],
  },
  {
    title: "Architecture Review: Ledger Circuit Breaker", organizer: "victor", minutes: 60, recurring: false,
    description: "Review of the circuit breaker design for ledger writes in payments-api. Ben will present for 20 minutes, then we'll discuss failure modes and the async queue fallback.\nJoin: https://meet.northwind.example/arc-rev-lcb",
    attendees: ["victor", "ben", "aisha", "me", "priya", "nora"],
  },
  {
    title: "INC-4821 Postmortem Review", organizer: "priya", minutes: 60, recurring: false,
    description: "Blameless review of INC-4821 (payments latency, PgBouncer pool exhaustion and retry storm). We'll go through the timeline, contributing factors and action item owners.\nJoin: https://meet.northwind.example/inc-four-pm",
    attendees: ["priya", "me", "ben", "aisha", "nora", "jonah", "zoe", "tom", "marcus"],
  },
  {
    title: "Litware Pen Test Kickoff", organizer: "monica", minutes: 45, recurring: false,
    description: "Kickoff for the external penetration test. Agenda: confirm scope and rules of engagement, test accounts, emergency contacts, and daily status cadence.",
    attendees: ["monica", "hugo", "rachel", "kofi", "me", "tariq"],
  },
  {
    title: "SOC 2 Evidence Check-in", organizer: "tess", minutes: 30, recurring: true,
    description: "Weekly check-in on outstanding SOC 2 evidence requests. Open items: access review attestation, change management samples, backup restore drill.",
    attendees: ["tess", "rachel", "me", "ines", "nora"],
  },
  {
    title: "Q4 Engineering All-Hands", organizer: "marcus", minutes: 60, recurring: false,
    description: "Quarterly engineering all-hands. Topics: DAL1 exit progress, reliability review, developer experience wins, and open Q&A. Submit questions in the form linked in the invite.\nJoin: https://meet.northwind.example/eng-all-hnd",
    attendees: ["marcus", "renata", "me", "mei", "diego", "nora", "priya", "amelia", "ben", "hana"],
  },
  {
    title: "Platform Offsite Planning", organizer: "grace", minutes: 45, recurring: false,
    description: "Plan the Platform org offsite: dates, venue shortlist, agenda themes (post-migration operating model, on-call redesign) and budget. Malik will confirm what's left in the T&E budget.",
    attendees: ["grace", "me", "mei", "diego", "nora", "amelia", "malik"],
  },
  {
    title: "Budget Review: Platform Infrastructure", organizer: "helen", minutes: 45, recurring: false,
    description: "Review infrastructure spend versus forecast: dual-running costs during migration, Fabrikam overage risk, and the ledger-pg instance class decision.",
    attendees: ["helen", "malik", "me", "renata"],
  },
  {
    title: "On-call Review", organizer: "priya", minutes: 30, recurring: true,
    description: "Weekly on-call review: pages last week, noisy alerts, runbook gaps and handoff notes. Incoming on-call please attend.",
    attendees: ["priya", "jonah", "sam", "felix", "paul", "me"],
  },
  {
    title: "Change Advisory Board", organizer: "ines", minutes: 30, recurring: true,
    description: "Weekly CAB. High-risk changes this week: auth-gateway DNS cutover, payments egress route change, strict mTLS for payments namespace.",
    attendees: ["ines", "me", "grace", "mei", "nora", "rachel"],
  },
  {
    title: "Error Budget Policy: Launch Hold Discussion", organizer: "tom", minutes: 30, recurring: false,
    description: "Payments-api is over its error budget after INC-4821. Discuss which queued launches can proceed and what the recovery plan looks like.",
    attendees: ["tom", "me", "priya", "ben", "marcus"],
  },
  {
    title: "Developer Experience Roadmap Review", organizer: "amelia", minutes: 45, recurring: false,
    description: "Review the DX roadmap for next quarter: preview environments GA, golden path templates, CI build time targets. Looking for prioritization input.",
    attendees: ["amelia", "me", "hana", "ravi", "victor"],
  },
  {
    title: "Procurement: Fabrikam Renewal Strategy", organizer: "olivia", minutes: 30, recurring: false,
    description: "Prep ahead of the Fabrikam renewal conversation. We'll go over usage data, our alternatives, and the target discount and term length.",
    attendees: ["olivia", "me", "malik", "felix"],
  },
  {
    title: "Mid-cycle Performance Calibration: Platform", organizer: "sofia", minutes: 90, recurring: false,
    description: "Calibration session for Platform Engineering. Managers, please have draft ratings and summaries entered before the session. Confidential.",
    attendees: ["sofia", "me", "mei", "diego", "nora", "amelia", "marcus"],
  },
  {
    title: "Cutover Weekend Staffing Huddle", organizer: "grace", minutes: 30, recurring: false,
    description: "Confirm who is on site, who's remote and who's on standby for each phase of the ledger-pg cutover. We also need to sort out food, the bridge line, and the escalation tree.\nJoin: https://meet.northwind.example/cut-wkd-stf",
    attendees: ["grace", "me", "nora", "daniel", "bruno", "priya", "jonah", "ines", "kevin"],
  },
  {
    title: "InfraSummit Talk Prep", organizer: "omar", minutes: 30, recurring: false,
    description: "Speaker prep for your InfraSummit talk on migrating a payments ledger without downtime. We'll check the AV setup, timing and Q&A format.",
    attendees: ["omar", "me"],
  },
  {
    title: "Wingtip / Northwind Infrastructure Peer Chat", organizer: "sarah", minutes: 45, recurring: false,
    description: "Informal peer exchange on migration lessons learned and on-call models. No slides, just conversation.",
    attendees: ["sarah", "me"],
  },
];

// ---------------------------------------------------------------------------
// Monitoring alerts
// ---------------------------------------------------------------------------

export interface AlertDef { name: string; service: string; severity: "P1" | "P2" | "P3" | "P4"; summary: string }

export const ALERTS: AlertDef[] = [
  { name: "HighErrorRate", service: "payments-api", severity: "P1", summary: "5xx error rate 7.4% over the last 5m (threshold 2%) on POST /v2/payments" },
  { name: "PgBouncerClientsWaiting", service: "ledger-pgbouncer", severity: "P2", summary: "cl_waiting = 37 on pgbouncer-ledger-2 for 3m (threshold 20 for 2m)" },
  { name: "ledger-pg replication lag > 30s", service: "ledger-pg", severity: "P2", summary: "Replica ledger-pg-lz-1 is 46s behind primary; cross-site link utilization at 92%" },
  { name: "CertificateExpiringSoon", service: "auth-gateway", severity: "P3", summary: "TLS certificate for login.northwind.example expires in 9 days; auto-renewal last failed" },
  { name: "LatencySLOBurnRate", service: "payments-api", severity: "P2", summary: "p99 latency SLO burning at 14x over 1h window; 2% of monthly budget consumed" },
  { name: "KafkaConsumerLagHigh", service: "ledger-sync", severity: "P3", summary: "Consumer group ledger-sync lag 840k messages on settlement-events (threshold 100k)" },
  { name: "DiskPredictedFull", service: "ledger-pg", severity: "P2", summary: "Volume /var/lib/postgresql on ledger-pg-dal1-02 predicted full in 3h12m" },
  { name: "PodCrashLooping", service: "payments-worker", severity: "P3", summary: "payments-worker-7d9f4b-x2kq restarted 6 times in 10m (OOMKilled)" },
  { name: "LoginSuccessRateLow", service: "auth-gateway", severity: "P1", summary: "Login success rate 81% over 5m (baseline 97%); MFA challenge errors elevated" },
  { name: "NATGatewayPortAllocationErrors", service: "landing-zone-network", severity: "P3", summary: "ErrorPortAllocation count 212 in 5m on nat-payments-a" },
  { name: "WebhookDeliveryFailures", service: "adatum-webhooks", severity: "P2", summary: "Adatum webhook signature verification failures 3.1% over 15m" },
  { name: "ReplicationSlotInactive", service: "ledger-pg", severity: "P3", summary: "Logical replication slot lz_rehearsal_sync inactive for 74m; retaining 22GB WAL" },
  { name: "SyntheticCheckFailed", service: "auth-gateway", severity: "P3", summary: "Synthetic login check failing from eu-central (3 of last 5 runs): timeout at MFA step" },
  { name: "NodeNotReady", service: "k8s-prod-lz", severity: "P3", summary: "Node ip-10-42-7-118 NotReady for 6m; 14 pods pending reschedule" },
  { name: "BackupJobFailed", service: "ledger-pg", severity: "P2", summary: "Nightly base backup for ledger-pg-lz failed: snapshot quota exceeded" },
  { name: "CircuitBreakerOpen", service: "payments-api", severity: "P2", summary: "ledger write breaker OPEN for 45s; 1,820 writes diverted to async queue" },
  { name: "DNSResolutionErrors", service: "landing-zone-network", severity: "P3", summary: "SERVFAIL rate 4% for *.int.northwind.example from payments namespace" },
  { name: "ObservabilityIngestOverQuota", service: "fabrikam-agent", severity: "P4", summary: "Log ingest at 112% of daily contract tier; projected overage this billing period" },
  { name: "BridgeConsumerLag", service: "payments-kafka-bridge", severity: "P3", summary: "RabbitMQ-to-Kafka bridge lag 4m on shard 5 (threshold 60s)" },
  { name: "CronJobMissed", service: "settlement-reports", severity: "P4", summary: "daily-settlement-report did not start within its scheduled window" },
  { name: "ErrorBudgetExhausted", service: "payments-api", severity: "P3", summary: "Availability error budget at 22% remaining for the 30-day window" },
  { name: "HighCPUThrottling", service: "ledger-pgbouncer", severity: "P4", summary: "CPU throttling 38% on pgbouncer-ledger pods over 15m" },
];

// ---------------------------------------------------------------------------
// Security notifications
// ---------------------------------------------------------------------------

const SEC_FROM = { fromName: "Northwind Security", fromEmail: "security-noreply@northwind.example" };

export const SECURITY_ALERTS: SimpleMailDef[] = [
  {
    ...SEC_FROM,
    subject: "New sign-in to your Northwind account",
    body: "Hi Alex,\n\nYour Northwind account was just used to sign in on a new device.\n\nDevice: Laptop (company-managed)\nBrowser: Desktop app\nLocation: San Francisco, CA (approximate)\nIP address: 203.0.113.48\n\nIf this was you, you don't need to do anything.\n\nIf you don't recognize this activity, open the account security page now to sign out all sessions and reset your password, then report it in #security-help.\n\nNorthwind Security",
  },
  {
    ...SEC_FROM,
    subject: "A new MFA method was added to your account",
    body: "Hi Alex,\n\nA new multi-factor authentication method was added to your account: Security key (\"Hardware key 2\").\n\nIf you added this key, no action is needed. We recommend keeping at least two hardware keys registered so you're not locked out if one is lost.\n\nIf you did not add this method, contact the Service Desk immediately at servicedesk@northwind.example or extension 4357.\n\nNorthwind Security",
  },
  {
    ...SEC_FROM,
    subject: "You granted an app access to your Northwind account",
    body: "Hi Alex,\n\nYou granted \"Runbook Sync (internal)\" access to your Northwind account with the following permissions:\n\n- Read your calendar\n- Read and write documents in shared drives\n\nThis app is on the approved internal apps list. You can review or revoke access at any time from the connected apps page in your account settings.\n\nNorthwind Security",
  },
  {
    ...SEC_FROM,
    subject: "Your password expires in 7 days",
    body: "Hi Alex,\n\nYour Northwind password will expire in 7 days. To avoid being locked out, change it before then from the account portal.\n\nReminder: passwords must be at least 16 characters and cannot match any of your last 12 passwords. Consider using a passphrase managed by the company password manager.\n\nNorthwind Security",
  },
  {
    ...SEC_FROM,
    subject: "Suspicious sign-in attempt blocked",
    body: "Hi Alex,\n\nWe blocked a sign-in attempt to your account because it looked unusual.\n\nLocation: outside your usual regions\nIP address: 198.51.100.212\nReason: impossible travel, failed MFA challenge\n\nYour password was entered correctly, so as a precaution we recommend changing it today. Your account remains protected by multi-factor authentication.\n\nIf you were travelling and this was you, reply to this message so we can update your profile.\n\nNorthwind Security",
  },
  {
    ...SEC_FROM,
    subject: "Phishing simulation results: Platform Engineering",
    body: "Hi Alex,\n\nHere are the results of last month's phishing simulation for your organization (Platform Engineering, 46 people):\n\n- Opened: 31 (67%)\n- Clicked link: 3 (6%)\n- Entered credentials: 2 (4%)\n- Reported to Security: 24 (52%)\n\nThat's a strong improvement on the previous simulation (11% click rate). The two people who entered credentials have been enrolled in the refresher module. Individual results are only shared with Security.\n\nThanks for reinforcing the \"report, don't click\" habit with your teams.\n\nNorthwind Security",
  },
  {
    ...SEC_FROM,
    subject: "Action required: complete your quarterly access review",
    body: "Hi Alex,\n\nAs a resource owner, you have 4 access reviews waiting for you:\n\n- prod-k8s-cluster-admin (23 members)\n- ledger-pg-superuser (6 members)\n- landing-zone-break-glass (4 members)\n- fabrikam-workspace-admin (9 members)\n\nReviews are due by end of day {weekday}. Unreviewed access will be revoked automatically, and this review is part of SOC 2 evidence.\n\nNorthwind Security",
  },
  {
    ...SEC_FROM,
    subject: "Security key registered from a new location",
    body: "Hi Alex,\n\nA security key was used to approve a sign-in from a device we haven't seen before (Linux workstation, desktop browser).\n\nIf this was you setting up a new workstation, you're all set. Otherwise, remove the device from your account and contact Security right away.\n\nNorthwind Security",
  },
  {
    ...SEC_FROM,
    subject: "Your personal access token expires soon",
    body: "Hi Alex,\n\nThe personal access token \"terraform-local-alex\" for the internal code host will expire in 5 days.\n\nIf you still need it, generate a new token with the minimum scopes required. Tokens with admin scope now require Security approval.\n\nNorthwind Security",
  },
];

// ---------------------------------------------------------------------------
// HR / IT / Finance system notices
// ---------------------------------------------------------------------------

const PEOPLE_FROM = { fromName: "Northwind People", fromEmail: "people-noreply@northwind.example" };
const LEDGERLY_FROM = { fromName: "Ledgerly Expenses", fromEmail: "noreply@ledgerly.example" };
const DESK_FROM = { fromName: "Northwind IT Service Desk", fromEmail: "servicedesk@northwind.example" };
const FACILITIES_FROM = { fromName: "Northwind Workplace", fromEmail: "workplace@northwind.example" };

export const HR_IT_NOTICES: SimpleMailDef[] = [
  // ---- Northwind People ----
  {
    ...PEOPLE_FROM,
    subject: "Open enrollment is now open",
    body: "Hi Alex,\n\nOpen enrollment for next year's benefits is now open and runs for three weeks.\n\nWhat's new this year:\n- A second high-deductible plan option with a larger HSA employer contribution\n- Expanded mental health coverage, now with 20 sessions per year\n- Dependent care FSA limit increase\n\nIf you don't make any changes, your current medical, dental and vision elections will roll over, but FSA elections will not.\n\nReview your options in the People portal.\n\nNorthwind People Team",
  },
  {
    ...PEOPLE_FROM,
    subject: "Reminder: open enrollment closes {weekday}",
    body: "Hi Alex,\n\nThis is a reminder that open enrollment closes at 5pm Pacific on {weekday}. You haven't submitted your elections yet.\n\nIf you want to keep your current coverage, you still need to re-elect your FSA contribution.\n\nNorthwind People Team",
  },
  {
    ...PEOPLE_FROM,
    subject: "Mid-cycle performance reviews: manager tasks are open",
    body: "Hi Alex,\n\nThe mid-cycle review period has started. As a manager, you have the following tasks:\n\n- Review self-assessments from 5 direct reports\n- Write manager summaries and draft ratings\n- Submit before your org's calibration session\n\nSelf-assessments are due from employees by end of next week. You'll get a notification as each one is submitted.\n\nNorthwind People Team",
  },
  {
    ...PEOPLE_FROM,
    subject: "{person} submitted their self-assessment",
    body: "Hi Alex,\n\n{person} has submitted their mid-cycle self-assessment. You can now read it and start your manager summary in the People portal.\n\nYou have 3 self-assessments left to receive.\n\nNorthwind People Team",
  },
  {
    ...PEOPLE_FROM,
    subject: "Time off request from {person} needs your approval",
    body: "Hi Alex,\n\n{person} has requested time off:\n\nType: Vacation\nDuration: 3 days, starting next {weekday}\nNote: Family trip. Handoff doc is linked in the request.\n\nApprove or decline in the People portal. Requests that aren't acted on within 5 business days will be escalated to your manager.\n\nNorthwind People Team",
  },
  {
    ...PEOPLE_FROM,
    subject: "Your time off request was approved",
    body: "Hi Alex,\n\nYour time off request for 2 days starting {weekday} has been approved by Renata Okafor.\n\nYour calendar has been updated and an out-of-office block was added. Don't forget to set your email auto-reply and update the on-call escalation contact.\n\nNorthwind People Team",
  },
  {
    ...PEOPLE_FROM,
    subject: "Required training due: Secure Code and Data Handling",
    body: "Hi Alex,\n\nYour annual Secure Code and Data Handling training is due in 10 days. It takes about 40 minutes.\n\nCompletion is required for SOC 2 compliance. Managers can see completion status for their teams on the People dashboard. Currently 7 of your 46 people are outstanding.\n\nNorthwind People Team",
  },
  {
    ...PEOPLE_FROM,
    subject: "Overdue: Anti-Harassment Training for Managers",
    body: "Hi Alex,\n\nYour Anti-Harassment Training for Managers is now overdue. Please complete it as soon as possible; it takes about 2 hours and can be completed in sessions.\n\nIf you've already completed it, it can take up to 24 hours to show here.\n\nNorthwind People Team",
  },
  {
    ...PEOPLE_FROM,
    subject: "Work anniversary: {person} celebrates 3 years at Northwind",
    body: "Hi Alex,\n\n{person} reaches their 3-year anniversary at Northwind this {weekday}. A quick note of thanks goes a long way!\n\nNorthwind People Team",
  },
  {
    ...PEOPLE_FROM,
    subject: "New hire starting on your team: onboarding checklist",
    body: "Hi Alex,\n\nA new Platform Engineer joins your org next {weekday}. To make their first week smooth:\n\n- Confirm their onboarding buddy\n- Make sure the laptop request is approved (it's pending with IT)\n- Add them to team calendars and on-call shadow rotation\n- Schedule a 1:1 for their first day\n\nThe full checklist is in the People portal.\n\nNorthwind People Team",
  },
  {
    ...PEOPLE_FROM,
    subject: "Offer approved: Staff Site Reliability Engineer",
    body: "Hi Alex,\n\nThe offer for the Staff Site Reliability Engineer requisition (REQ-{num}) has been approved by Finance and the VP of Engineering. Harper Quinn will extend the offer to the candidate.\n\nNorthwind People Team",
  },

  // ---- Ledgerly Expenses ----
  {
    ...LEDGERLY_FROM,
    subject: "Expense report ER-{num} submitted",
    body: "Hi Alex,\n\nYour expense report ER-{num} (\"Contoso onsite: Chicago\") for {amount} has been submitted and is waiting for approval from Renata Okafor.\n\nYou'll get an email when it's approved or if the approver has questions.\n\nLedgerly Expenses",
  },
  {
    ...LEDGERLY_FROM,
    subject: "Expense report ER-{num} approved",
    body: "Hi Alex,\n\nGood news: your expense report ER-{num} for {amount} was approved. Reimbursement will be included in the next payroll run.\n\nLedgerly Expenses",
  },
  {
    ...LEDGERLY_FROM,
    subject: "Action needed: ER-{num} is missing receipts",
    body: "Hi Alex,\n\nYour expense report ER-{num} was returned because 2 line items are missing receipts:\n\n- Rideshare, {amount}\n- Team dinner, over the itemized receipt threshold\n\nForward the receipts to receipts@ledgerly.example from your work email and they'll be matched automatically, or upload them in the app.\n\nLedgerly Expenses",
  },
  {
    ...LEDGERLY_FROM,
    subject: "{person} submitted an expense report for your approval",
    body: "Hi Alex,\n\n{person} submitted expense report ER-{num} for {amount}.\n\nPurpose: Cutover weekend on-site support (meals and parking)\nPolicy check: all items within policy\n\nApprove or return it in Ledgerly.\n\nLedgerly Expenses",
  },
  {
    ...LEDGERLY_FROM,
    subject: "You have 4 expense reports waiting for approval",
    body: "Hi Alex,\n\nYou have 4 expense reports waiting for your approval, totalling {amount}. The oldest has been waiting 6 days.\n\nReports that aren't approved within 10 days are escalated to your manager.\n\nLedgerly Expenses",
  },
  {
    ...LEDGERLY_FROM,
    subject: "Policy flag on ER-{num} from {person}",
    body: "Hi Alex,\n\nExpense report ER-{num} from {person} includes an item that exceeds policy:\n\n- Hotel nightly rate above city cap by {amount}\n\nThe employee added a note: \"Conference block was sold out; this was the closest available.\" You can approve with the exception or return it.\n\nLedgerly Expenses",
  },
  {
    ...LEDGERLY_FROM,
    subject: "Corporate card: 3 transactions need a report",
    body: "Hi Alex,\n\nYou have 3 corporate card transactions older than 14 days that aren't on an expense report yet. Total: {amount}.\n\nPlease add them to a report by {weekday} to stay compliant with the card program.\n\nLedgerly Expenses",
  },

  // ---- IT Service Desk ----
  {
    ...DESK_FROM,
    subject: "[INC{num}] Your ticket has been updated",
    body: "Hello Alex,\n\nYour ticket INC{num} \"Second monitor flickering on dock\" has been updated.\n\nLiam O'Connor wrote:\n\"A replacement dock is on its way to your desk. Please swap it in and let us know if the flicker continues; we'll pick up the old one on {weekday}.\"\n\nReply to this email to add a comment.\n\nNorthwind IT Service Desk",
  },
  {
    ...DESK_FROM,
    subject: "[INC{num}] Resolved: VPN disconnects on hotel Wi-Fi",
    body: "Hello Alex,\n\nYour ticket INC{num} has been marked resolved.\n\nResolution: Updated the VPN client profile to fall back to TCP 443 when UDP is blocked. Hotel and conference networks should now connect reliably.\n\nIf the issue isn't fixed, reply within 5 days to reopen.\n\nNorthwind IT Service Desk",
  },
  {
    ...DESK_FROM,
    subject: "Your laptop is due for refresh",
    body: "Hello Alex,\n\nYour laptop is eligible for its scheduled refresh. Choose your new device and a pickup slot in the IT portal.\n\nPlease back up any local files that aren't synced. Your old laptop must be returned within 10 days of receiving the new one so it can be securely wiped.\n\nNorthwind IT Service Desk",
  },
  {
    ...DESK_FROM,
    subject: "Scheduled maintenance: VPN gateways this {weekday} night",
    body: "Hello,\n\nThe corporate VPN gateways will be upgraded this {weekday} from 10pm to 1am Pacific. Expect brief disconnects of up to 5 minutes while each gateway restarts.\n\nOn-call engineers: the break-glass access path is unaffected.\n\nNorthwind IT Service Desk",
  },
  {
    ...DESK_FROM,
    subject: "[REQ{num}] Approval needed: software request from {person}",
    body: "Hello Alex,\n\n{person} has requested a license for \"Diagramming Suite (Team)\" ({amount}/year).\n\nBusiness justification: \"Architecture diagrams for the DAL1 exit runbooks and steering committee decks.\"\n\nAs their manager, please approve or reject in the IT portal.\n\nNorthwind IT Service Desk",
  },
  {
    ...DESK_FROM,
    subject: "Action required: OS security update must be installed by {weekday}",
    body: "Hello Alex,\n\nA security update for your laptop is required. It will be installed automatically at 6pm on {weekday} if you haven't done so by then.\n\nThe update takes about 20 minutes and requires a restart.\n\nNorthwind IT Service Desk",
  },
  {
    ...DESK_FROM,
    subject: "[REQ{num}] Access granted: landing-zone-readonly",
    body: "Hello Alex,\n\nYour request for access to landing-zone-readonly has been approved by Rachel Stein and provisioned. It can take up to 15 minutes to take effect.\n\nThis access will be reviewed in the next quarterly access review.\n\nNorthwind IT Service Desk",
  },

  // ---- Workplace / facilities ----
  {
    ...FACILITIES_FROM,
    subject: "Floor 4 conference rooms unavailable {weekday}",
    body: "Hi all,\n\nFloor 4 conference rooms (Harbor, Lighthouse and Pier) will be unavailable on {weekday} for AV upgrades. Existing bookings have been moved to Floor 6 where possible. Check your calendar for updated locations.\n\nNorthwind Workplace",
  },
  {
    ...FACILITIES_FROM,
    subject: "Your desk booking is confirmed",
    body: "Hi Alex,\n\nYour desk booking is confirmed for {weekday}: Floor 5, Neighborhood C, desk 5C-14.\n\nIf your plans change, release the desk by 10am so someone else can use it.\n\nNorthwind Workplace",
  },
  {
    ...FACILITIES_FROM,
    subject: "Package waiting for you at reception",
    body: "Hi Alex,\n\nA package is waiting for you at the Floor 1 reception desk. Pick it up within 5 business days.\n\nNorthwind Workplace",
  },
];

// ---------------------------------------------------------------------------
// Receipts
// ---------------------------------------------------------------------------

export interface ReceiptDef { fromName: string; fromEmail: string; subject: string; lines: { item: string; amount: number }[]; note: string }

export const RECEIPTS: ReceiptDef[] = [
  {
    fromName: "Skyline Air", fromEmail: "receipts@skylineair.example", subject: "Your Skyline Air receipt: confirmation SK{num}",
    lines: [{ item: "Base fare: SFO to ORD round trip, Economy Plus", amount: 486.0 }, { item: "Taxes and carrier fees", amount: 71.4 }, { item: "Seat selection 14C", amount: 39.0 }],
    note: "Thanks for flying Skyline Air. Your boarding passes will be available in the app 24 hours before departure.",
  },
  {
    fromName: "Skyline Air", fromEmail: "receipts@skylineair.example", subject: "Change confirmation SK{num}: new flight time",
    lines: [{ item: "Same-day change fee", amount: 75.0 }, { item: "Fare difference", amount: 0.0 }],
    note: "Your return flight has been moved to the 6:45pm departure. Your seat assignment was kept.",
  },
  {
    fromName: "Harborview Suites", fromEmail: "folio@harborviewsuites.example", subject: "Your folio from Harborview Suites Chicago",
    lines: [{ item: "Room, 3 nights at corporate rate", amount: 687.0 }, { item: "Occupancy tax", amount: 120.23 }, { item: "Breakfast", amount: 54.0 }, { item: "Wi-Fi (complimentary)", amount: 0.0 }],
    note: "Thank you for staying with us. Folio number HV-{num}.",
  },
  {
    fromName: "GoRide", fromEmail: "receipts@goride.example", subject: "Your Tuesday evening trip with GoRide",
    lines: [{ item: "Trip fare: O'Hare to downtown", amount: 48.6 }, { item: "Airport surcharge", amount: 5.0 }, { item: "Tip", amount: 9.0 }],
    note: "Business profile: Northwind. This receipt has been forwarded to Ledgerly Expenses.",
  },
  {
    fromName: "GoRide", fromEmail: "receipts@goride.example", subject: "Your morning trip with GoRide",
    lines: [{ item: "Trip fare: Home to Northwind HQ", amount: 23.15 }, { item: "Tip", amount: 4.0 }],
    note: "Business profile: Northwind. Rate your driver in the app.",
  },
  {
    fromName: "Pagewise", fromEmail: "billing@pagewise.example", subject: "Pagewise invoice #{num}: Team plan",
    lines: [{ item: "Team plan, 12 seats (monthly)", amount: 144.0 }, { item: "Additional storage 50GB", amount: 10.0 }],
    note: "Charged to the card ending 4417. Manage your subscription in workspace settings.",
  },
  {
    fromName: "Diagramly", fromEmail: "invoices@diagramly.example", subject: "Receipt for your Diagramly subscription",
    lines: [{ item: "Diagramly Pro, annual (1 seat)", amount: 96.0 }, { item: "Sales tax", amount: 8.28 }],
    note: "Invoice number DG-{num}. Thanks for diagramming with us.",
  },
  {
    fromName: "InfraSummit", fromEmail: "registration@infrasummit.example", subject: "Registration confirmed: InfraSummit speaker pass",
    lines: [{ item: "Speaker pass (full conference)", amount: 0.0 }, { item: "Workshop add-on: Chaos Engineering in Practice", amount: 295.0 }, { item: "Speaker dinner guest", amount: 85.0 }],
    note: "Confirmation IS-{num}. Pick up your badge at the speaker desk. Bring a photo ID.",
  },
  {
    fromName: "Common Desk", fromEmail: "hello@commondesk.example", subject: "Your day pass receipt: Common Desk River North",
    lines: [{ item: "Day pass", amount: 35.0 }, { item: "Meeting room, 2 hours", amount: 60.0 }, { item: "Coffee bar credit", amount: 0.0 }],
    note: "Wi-Fi network: CommonDesk-Members. Thanks for working with us today.",
  },
  {
    fromName: "Fresh Plate Catering", fromEmail: "orders@freshplate.example", subject: "Order #{num} confirmed: team lunch for 14",
    lines: [{ item: "Mediterranean bowls x14", amount: 238.0 }, { item: "Vegan and gluten-free options x3", amount: 0.0 }, { item: "Delivery and setup", amount: 25.0 }, { item: "Service charge 15%", amount: 39.45 }],
    note: "Delivery to Northwind HQ, Floor 5, Harbor room, at 11:45am. Contact the driver through the order link.",
  },
  {
    fromName: "Fresh Plate Catering", fromEmail: "orders@freshplate.example", subject: "Order #{num} confirmed: cutover weekend dinner",
    lines: [{ item: "Pizza assortment x8", amount: 176.0 }, { item: "Salads x4", amount: 52.0 }, { item: "Sparkling water case", amount: 18.0 }, { item: "Late-night delivery fee", amount: 15.0 }],
    note: "Delivery to Northwind HQ war room at 7:30pm. Thanks for the order, and good luck with the cutover!",
  },
  {
    fromName: "Cloudvault Backup", fromEmail: "billing@cloudvault.example", subject: "Your Cloudvault invoice is ready (#{num})",
    lines: [{ item: "Business plan: 2TB", amount: 120.0 }, { item: "Retention add-on, 1 year", amount: 30.0 }],
    note: "Payment processed successfully. Download PDF invoices from the billing dashboard.",
  },
  {
    fromName: "Trackly", fromEmail: "billing@trackly.example", subject: "Trackly receipt: Engineering workspace",
    lines: [{ item: "Standard plan, 40 users", amount: 400.0 }, { item: "Guest seats x5", amount: 0.0 }],
    note: "Receipt TR-{num}. Your next renewal is in one month.",
  },
  {
    fromName: "Lakeside Parking", fromEmail: "receipts@lakesideparking.example", subject: "Parking receipt: Garage B",
    lines: [{ item: "Daily max", amount: 32.0 }],
    note: "Entry 7:52am, exit 9:14pm. Thank you for parking with Lakeside.",
  },
  {
    fromName: "Bookfold", fromEmail: "orders@bookfold.example", subject: "Your Bookfold order #{num} has shipped",
    lines: [{ item: "Site Reliability Patterns (paperback)", amount: 42.99 }, { item: "Postgres Operations Field Guide (paperback)", amount: 38.5 }, { item: "Shipping", amount: 0.0 }],
    note: "Expected delivery {weekday}. Track your package from your Bookfold account.",
  },
  {
    fromName: "Railway Express", fromEmail: "tickets@railwayexpress.example", subject: "Your e-ticket: Union Station to Airport Link",
    lines: [{ item: "One-way adult fare", amount: 12.5 }],
    note: "Show the QR code in the app at the gate. Ticket valid for 2 hours from activation.",
  },
];

// ---------------------------------------------------------------------------
// Internal mailing lists
// ---------------------------------------------------------------------------

export interface ForumListDef { name: string; address: string; listId: string; topics: { subject: string; posts: { from: string; text: string }[] }[] }

export const FORUM_LISTS: ForumListDef[] = [
  {
    name: "sre-discuss",
    address: "sre-discuss@lists.northwind.example",
    listId: "sre-discuss.lists.northwind.example",
    topics: [
      {
        subject: "PgBouncer transaction vs. session pooling for ledger",
        posts: [
          { from: "jonah", text: "Now that we've raised the pool size, should we also revisit pooling mode? We're on session pooling for ledger because of prepared statements, but the Go driver supports protocol-level prepared statements in transaction mode now." },
          { from: "nora", text: "I'm open to it, but not before the cutover. There are two reporting jobs that use advisory locks across statements and would break in transaction mode. Let's put it on the post-migration list." },
          { from: "priya", text: "Agree on timing. Jonah, can you inventory what would break? If it's just those two jobs, we could give them a separate session-mode pool." },
          { from: "jonah", text: "Will do. I'll start a doc and link it here." },
        ],
      },
      {
        subject: "Proposal: retire the 80/85/90 disk alerts",
        posts: [
          { from: "felix", text: "PR is up to replace the threshold disk alerts with a single time-to-full alert. Shadow mode has been running for a week: 4 fires vs. 31 pages. Feedback welcome before I merge." },
          { from: "paul", text: "Big +1. Last rotation I got paged at 3am for a volume at 85% that would have taken two weeks to fill." },
          { from: "sam", text: "Can we keep a hard threshold at 95% as a backstop? Linear prediction won't catch a log flood." },
          { from: "felix", text: "Good call, adding it. 95% at P2 with no time component." },
        ],
      },
      {
        subject: "On-call compensation during cutover weekends",
        posts: [
          { from: "sam", text: "Quick question: does the cutover weekend count as an on-call shift for comp purposes, or is it separate? A few of us are scheduled for both." },
          { from: "priya", text: "It's separate. Cutover participation is paid as an extended shift, plus a day off in lieu. If you're also on primary that weekend, tell me and we'll swap you out. Nobody should do both." },
          { from: "paul", text: "Thanks, that's a relief. I was on both. Sending you a DM." },
        ],
      },
      {
        subject: "Fabrikam dashboards: who owns the payments overview?",
        posts: [
          { from: "felix", text: "The payments overview dashboard has 40 panels, half of them broken since the metric rename. Is anyone attached to it? If not, I'd like to rebuild it with just the golden signals." },
          { from: "aisha", text: "Payments team uses it during incidents, but honestly we only look at the top row. Rebuild away, just keep the ledger write latency panel." },
          { from: "ben", text: "Please also add the circuit breaker state once that's enabled. That'll be the first thing we check." },
        ],
      },
      {
        subject: "Chaos test results: injected ledger slowdown",
        posts: [
          { from: "jonah", text: "Ran the chaos job against staging with the new jittered retries: 300ms injected latency on ledger-pg for 10 minutes. Peak QPS to the DB went from 4.1k to 1.2k compared with the old retry logic, and p99 for payments-api topped out at 940ms." },
          { from: "aisha", text: "That's the result we were hoping for. Did the retry budget kick in?" },
          { from: "jonah", text: "Yes, about 8% of calls were rejected by the budget at the worst point. All of them failed fast with a retryable error to the client, which is what we want." },
          { from: "priya", text: "Great work. Let's repeat it with the circuit breaker enabled once Ben's PR lands, then write it up for the postmortem." },
        ],
      },
      {
        subject: "Runbook format: do we standardize?",
        posts: [
          { from: "paul", text: "Our runbooks are all over the place. Some are wikis, some are in the repo, a couple are only in someone's head. Can we agree on a template?" },
          { from: "felix", text: "I'd vote for repo-based Markdown with a fixed set of sections: symptoms, impact, diagnosis, mitigation, escalation. And every alert annotation must link to one." },
          { from: "victor", text: "Add a 'last verified' field. A runbook nobody has tested in a year is worse than none." },
        ],
      },
      {
        subject: "Landing zone node pool keeps getting preempted",
        posts: [
          { from: "sam", text: "Anyone else seeing pods on the lz-batch pool get evicted a lot? I think it's on spot capacity." },
          { from: "owen", text: "Yep, that pool is spot by design, so it's only for batch and CI. If you've got something stateful there, it's in the wrong place. Which workload?" },
          { from: "sam", text: "The settlement report backfill. I'll add a tolerance and node affinity for the on-demand pool. Thanks." },
        ],
      },
      {
        subject: "Staff SRE interview simulation: volunteers needed",
        posts: [
          { from: "priya", text: "We've swapped the take-home for a 90-minute live incident simulation. I need two more interviewers trained on it. It's a couple of hours of shadowing plus one reverse-shadow." },
          { from: "felix", text: "Happy to help. I sat in on the calibration run already." },
          { from: "jonah", text: "Count me in too. Can we make sure the scenario isn't too close to INC-4821? Candidates who read our status page would have an edge." },
          { from: "priya", text: "Fair point. Swapping the database scenario for a DNS one." },
        ],
      },
    ],
  },
  {
    name: "eng-announce",
    address: "eng-announce@lists.northwind.example",
    listId: "eng-announce.lists.northwind.example",
    topics: [
      {
        subject: "Change freeze for the ledger-pg cutover weekend",
        posts: [
          { from: "ines", text: "Heads up: there will be a production change freeze from Friday 6pm through Monday 9am for the ledger-pg cutover. Only changes approved by the cutover IC go out. Staging deploys are unaffected." },
          { from: "grace", text: "Adding to Inês's note: the cutover bridge will be open the whole weekend. If you aren't on the staffing sheet, please don't join unless you're paged in." },
        ],
      },
      {
        subject: "INC-4821 postmortem published",
        posts: [
          { from: "priya", text: "The postmortem for INC-4821 (payments latency from PgBouncer pool exhaustion and a retry storm) is published. Key takeaways: we need jittered retries with budgets, a circuit breaker on ledger writes, and an earlier signal on pool saturation. All seven action items have owners, and four are done." },
          { from: "marcus", text: "Thanks Priya and everyone who contributed. This is a really clear writeup, and I'd encourage every team to read the contributing factors section. Most of our services have the same retry pattern." },
        ],
      },
      {
        subject: "New golden path template for Go services",
        posts: [
          { from: "amelia", text: "The Go service template is now live. New services get structured logging, OpenTelemetry tracing, health endpoints, a Helm chart and CI out of the box. Scaffold one with the platform CLI." },
          { from: "hana", text: "We've used it for two services already, and it saved about a day of setup each time. Feedback and PRs welcome." },
        ],
      },
      {
        subject: "Litware penetration test starts next week",
        posts: [
          { from: "rachel", text: "Litware Security will run an external penetration test against staging environments for auth-gateway and payments-api starting next {weekday}. You may see unusual traffic or login attempts in staging. Don't block their IPs. If you see something that looks like it's hitting production, page Security immediately." },
          { from: "kofi", text: "Test accounts are prefixed with lw-test-. Please don't delete or modify them during the engagement." },
        ],
      },
      {
        subject: "CI build times back to normal",
        posts: [
          { from: "amelia", text: "The regression in CI build times after the runner migration is fixed. Module caches weren't being restored because the cache key included the runner hostname. Payments-api is back to about 6 minutes." },
        ],
      },
      {
        subject: "Auth-gateway DNS cutover complete",
        posts: [
          { from: "lena", text: "The auth-gateway DNS cutover to the landing zone finished at 7:42am with no rollback needed. Login success rate stayed above 98% throughout. DAL1 instances stay warm for 7 days before decommissioning." },
          { from: "grace", text: "Great execution from Lena, Noah, Tariq and the Contoso team. That's the first of the three big moves done." },
          { from: "renata", text: "Excellent work, everyone. Thank you for the careful prep." },
        ],
      },
      {
        subject: "Error budget policy: payments-api launch hold",
        posts: [
          { from: "priya", text: "Payments-api has used 78% of its 30-day availability budget, so per policy, launches touching payments-api need SRE sign-off until the budget recovers. Bug fixes and reliability work are exempt." },
          { from: "tom", text: "For payments PMs: the refund API change is cleared to ship. The merchant dashboard redesign moves out about two weeks." },
        ],
      },
      {
        subject: "Q4 engineering all-hands: submit your questions",
        posts: [
          { from: "marcus", text: "The Q4 engineering all-hands is coming up. Topics: DAL1 exit progress, reliability review, developer experience and open Q&A. Submit questions (anonymous is fine) through the form in the calendar invite." },
        ],
      },
    ],
  },
  {
    name: "platform-guild",
    address: "platform-guild@lists.northwind.example",
    listId: "platform-guild.lists.northwind.example",
    topics: [
      {
        subject: "Terraform module versioning: pin or float?",
        posts: [
          { from: "owen", text: "We have a mix of pinned and floating module references in platform-terraform. Floating bit us last week when the networking module changed a default. Proposal: pin everything to tags and use a bot to open upgrade PRs." },
          { from: "lena", text: "+1 to pinning. The bot PRs need to include the plan diff though, otherwise people will just rubber-stamp them." },
          { from: "tariq", text: "Agree. Networking modules especially should never float. One surprise route change is enough." },
        ],
      },
      {
        subject: "Mesh strict mTLS: what we learned in payments",
        posts: [
          { from: "ravi", text: "Strict mTLS is live for payments-api. The main gotchas were the metrics port (needed a port-level exception) and an old DestinationRule that the admission webhook rejected. p99 overhead was about 0.4ms." },
          { from: "mei", text: "Thanks for writing this up. Could you turn it into a short checklist so other teams can self-serve their rollout?" },
          { from: "ravi", text: "Yep, I'll put it in the runbooks repo this week." },
        ],
      },
      {
        subject: "Preview environments: early feedback",
        posts: [
          { from: "amelia", text: "Preview envs have been on for platform-api for two weeks. We'd love feedback before we open it to other repos. What's working, what's annoying?" },
          { from: "ravi", text: "Working: catching config bugs before merge, and PMs can click around without asking us. Annoying: seed data takes 4 minutes to load." },
          { from: "hana", text: "Would love a stable URL per branch rather than per commit, so I don't have to keep re-sharing links with design." },
          { from: "amelia", text: "Both are good asks. Per-branch URLs are easy. For seed data we can snapshot it, so it should drop to under a minute." },
        ],
      },
      {
        subject: "Kafka client defaults for new services",
        posts: [
          { from: "diego", text: "We keep seeing new services ship with eager rebalancing and auto-commit on. After SRE-1219 I'd like the platform library to default to cooperative sticky assignment and manual commits." },
          { from: "ethan", text: "Strong +1. The ledger-sync rebalance went from 11 minutes to under 40 seconds with that change alone." },
          { from: "victor", text: "Make it the default in the Go template too, and document why. Otherwise someone will flip it back." },
        ],
      },
      {
        subject: "Cost visibility for landing zone namespaces",
        posts: [
          { from: "malik", text: "Finance would like a per-team cost breakdown for the landing zone. Do we have consistent namespace labels for team and cost center?" },
          { from: "owen", text: "Mostly. About 80% of namespaces have the team label, but the cost center label is spotty. I can add an admission policy that requires both on new namespaces." },
          { from: "mei", text: "Please do. And let's backfill the existing ones before the next budget review." },
        ],
      },
      {
        subject: "Guild demo day: sign up for a slot",
        posts: [
          { from: "grace", text: "Platform guild demo day is two weeks out. 10-minute slots, any topic. So far we have preview environments and the new disk alerting. Reply here to grab a slot." },
          { from: "nora", text: "I'll demo the ledger-pg restore drill: going from snapshot to a verified instance in under an hour." },
          { from: "noah", text: "Can I do the refresh token race fix? It's a fun one to explain." },
        ],
      },
      {
        subject: "Secrets in legacy config: final sweep",
        posts: [
          { from: "kofi", text: "We've rotated the six service accounts that had plaintext credentials in DAL1 config. Before the pen test, could each team grep their legacy hosts for anything else that looks like a credential? Here's the pattern list I used." },
          { from: "lena", text: "Auth-gateway hosts are clean. Only the old Redis password turned up, and it was already rotated." },
          { from: "diego", text: "Found one in an old Kafka Connect properties file on a DAL1 host we thought was decommissioned. Rotating now and shutting the host down." },
        ],
      },
      {
        subject: "Should we adopt a standard SLO library?",
        posts: [
          { from: "victor", text: "Every team writes their own SLO burn-rate rules, and they're subtly different. I'd like to generate them from a single spec file per service." },
          { from: "priya", text: "Yes please. Multi-window burn rates are easy to get wrong. We found two services that only alert on the 1h window." },
          { from: "felix", text: "I can prototype a generator on top of observability-config. Spec in YAML, rules out." },
          { from: "mei", text: "Let's make that a guild project for next quarter. Felix, can you bring a proposal to demo day?" },
        ],
      },
    ],
  },
];
