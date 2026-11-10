// Pre-send checks. Nothing is blocked; the first Send shows these and the
// second Send confirms (inspired by Exchange MailTips and "send always asks").
import type { Person, SendCheck } from "../../shared/types";
import { domainOf, isPublicDomain } from "./format";

export const LARGE_AUDIENCE = 15;

const ATTACH_RE = /\b(attached|attaching|attachment|enclosed|see the (file|doc|deck|sheet)|i've included the (file|doc)|find (it )?attached|pfa)\b/i;

export function sendChecks(opts: {
  me: string;
  to: Person[];
  cc: Person[];
  bcc: Person[];
  subject: string;
  text: string;
  attachmentCount: number;
  unreviewedDraft: boolean;
}): SendCheck[] {
  const checks: SendCheck[] = [];
  const myDomain = domainOf(opts.me);
  const visible = [...opts.to, ...opts.cc];
  const all = [...visible, ...opts.bcc];
  if (myDomain && !isPublicDomain(myDomain)) {
    const ext = all.filter((p) => domainOf(p.email) !== myDomain);
    const domains = [...new Set(ext.map((p) => domainOf(p.email)))];
    if (ext.length) {
      checks.push({
        level: "warn",
        code: "external",
        message: `${ext.length} recipient${ext.length === 1 ? " is" : "s are"} outside ${myDomain} (${domains.slice(0, 3).join(", ")}${domains.length > 3 ? `, +${domains.length - 3}` : ""}).`,
      });
    }
  }
  if (visible.length >= LARGE_AUDIENCE) {
    checks.push({ level: "warn", code: "large-audience", message: `This goes to ${visible.length} people. Everyone will see every reply.` });
  }
  const typed = opts.text.split(/\n>|\nOn .*wrote:/)[0];
  if (opts.attachmentCount === 0 && ATTACH_RE.test(typed)) {
    const m = typed.match(ATTACH_RE);
    checks.push({ level: "warn", code: "missing-attachment", message: `You wrote “${m?.[0]}” but nothing is attached.` });
  }
  if (!opts.subject.trim()) checks.push({ level: "warn", code: "no-subject", message: "There's no subject." });
  if (opts.unreviewedDraft) checks.push({ level: "warn", code: "unreviewed-draft", message: "Some assistant edits haven't been reviewed." });
  return checks;
}
