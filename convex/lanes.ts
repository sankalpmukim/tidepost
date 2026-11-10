import type { Lane, Person, ThreadSummary } from "../shared/types";

const WAITING_WINDOW_MS = 30 * 24 * 3600 * 1000;

export type LiveThread = {
  accountId: string;
  threadId: string;
  subject: string;
  snippet: string;
  participants: string;
  lastFromName: string;
  lastFromEmail: string;
  lastFromMe: boolean;
  lastDateMs: number;
  firstDateMs: number;
  messageCount: number;
  unreadCount: number;
  starred: boolean;
  hasAtt: boolean;
  folders: string;
  inInbox: boolean;
  toMeDirect: boolean;
  isBulk: boolean;
  audience: number;
  pinned: number;
  snoozedUntil: number | null;
  remindAt: number | null;
  nudged: number;
  waitingDismissedAt: number | null;
};

export function foldersFromStr(s: string): string[] {
  return s.split(",").filter(Boolean);
}

export function laneOf(r: LiveThread, now: number): Lane {
  const notTrash = !r.folders.includes(",TRASH,") && !r.folders.includes(",SPAM,");
  if (r.nudged) return "needs";
  if (r.lastFromMe && !r.isBulk && r.audience > 1 && r.lastDateMs > now - WAITING_WINDOW_MS && notTrash && !(r.waitingDismissedAt && r.waitingDismissedAt >= r.lastDateMs)) return "waiting";
  if (!r.inInbox) return "done";
  if (r.isBulk) return "updates";
  if (r.lastFromMe) return "done";
  return r.toMeDirect ? "needs" : "fyi";
}

export function matchesView(r: LiveThread, view: string, now: number): boolean {
  const notTrash = !r.folders.includes(",TRASH,") && !r.folders.includes(",SPAM,");
  const notSnoozed = !(r.snoozedUntil && r.snoozedUntil > now);
  const inbox = r.inInbox && notTrash && notSnoozed;
  const waiting = r.lastFromMe && !r.isBulk && r.audience > 1 && r.lastDateMs > now - WAITING_WINDOW_MS && !(r.waitingDismissedAt && r.waitingDismissedAt >= r.lastDateMs) && notTrash;
  switch (view) {
    case "inbox": return inbox;
    case "needs": return inbox && ((!r.lastFromMe && !r.isBulk && r.toMeDirect) || !!r.nudged);
    case "fyi": return inbox && !r.lastFromMe && !r.isBulk && !r.toMeDirect && !r.nudged;
    case "updates": return inbox && !r.lastFromMe && r.isBulk && !r.nudged;
    case "waiting": return waiting && !r.nudged && notSnoozed;
    case "snoozed": return !!(r.snoozedUntil && r.snoozedUntil > now);
    case "starred": return r.starred && notTrash;
    case "sent": return r.folders.includes(",SENT,") && notTrash;
    case "all": return notTrash;
    case "archive": return !r.inInbox && notTrash;
    case "trash": return r.folders.includes(",TRASH,");
    case "spam": return r.folders.includes(",SPAM,");
    default:
      if (view.startsWith("folder:")) {
        const id = view.slice(7).replace(/[%,_']/g, "");
        return r.folders.includes(`,${id},`);
      }
      return inbox;
  }
}

export function sortThreads(view: string, a: LiveThread, b: LiveThread): number {
  if (view === "snoozed") return (a.snoozedUntil ?? 0) - (b.snoozedUntil ?? 0);
  if (view === "waiting") return a.lastDateMs - b.lastDateMs;
  const pin = b.pinned - a.pinned;
  if (pin) return pin;
  return b.lastDateMs - a.lastDateMs;
}

export function toSummary(r: LiveThread, now: number): ThreadSummary {
  return {
    id: r.threadId,
    accountId: r.accountId,
    subject: r.subject,
    snippet: r.snippet,
    participants: JSON.parse(r.participants) as Person[],
    lastFrom: { name: r.lastFromName, email: r.lastFromEmail },
    lastFromMe: r.lastFromMe,
    lastDate: new Date(r.lastDateMs).toISOString(),
    firstDate: new Date(r.firstDateMs).toISOString(),
    messageCount: r.messageCount,
    unreadCount: r.unreadCount,
    starred: r.starred,
    hasAttachments: r.hasAtt,
    folders: foldersFromStr(r.folders),
    inInbox: r.inInbox,
    lane: laneOf(r, now),
    toMeDirect: r.toMeDirect,
    isBulk: r.isBulk,
    pinned: !!r.pinned,
    snoozedUntil: r.snoozedUntil && r.snoozedUntil > now ? new Date(r.snoozedUntil).toISOString() : null,
    remindAt: r.remindAt ? new Date(r.remindAt).toISOString() : null,
    nudged: !!r.nudged,
    audienceSize: r.audience,
  };
}
