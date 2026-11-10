import type { Person } from "../../shared/types";

const DAY = 86400_000;

function startOfDay(d: Date): number {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x.getTime();
}

/** Compact list date: 10:42 today, "Mon" this week, "Oct 14" this year, "Oct 14, 2024" older. */
export function listDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const today = startOfDay(now);
  if (d.getTime() >= today) return d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (d.getTime() >= today - DAY) return "Yesterday";
  if (d.getTime() >= today - 6 * DAY) return d.toLocaleDateString(undefined, { weekday: "short" });
  if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

export function fullDate(iso: string): string {
  return new Date(iso).toLocaleString(undefined, { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

export function messageDate(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (d.getTime() >= startOfDay(now)) return time;
  if (d.getFullYear() === now.getFullYear()) return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })}, ${time}`;
  return `${d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}, ${time}`;
}

export function dayLabel(iso: string, now = new Date()): string {
  const d = new Date(iso);
  const diff = Math.round((startOfDay(now) - startOfDay(d)) / DAY);
  if (diff === 0) return "Today";
  if (diff === 1) return "Yesterday";
  return d.toLocaleDateString(undefined, d.getFullYear() === now.getFullYear() ? { weekday: "short", month: "short", day: "numeric" } : { month: "short", day: "numeric", year: "numeric" });
}

export function shortDay(iso: string): string {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/** "2 days ago", "5 hours ago". */
export function ago(iso: string, now = Date.now()): string {
  const ms = now - Date.parse(iso);
  const m = Math.round(ms / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} hour${h === 1 ? "" : "s"} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

export function until(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const sameDay = startOfDay(d) === startOfDay(now);
  const tomorrow = startOfDay(d) === startOfDay(now) + DAY;
  const time = d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  if (sameDay) return `today ${time}`;
  if (tomorrow) return `tomorrow ${time}`;
  return `${d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" })} ${time}`;
}

export function firstName(p: Person): string {
  const n = (p.name || p.email).trim();
  if (n.includes("@")) return n.split("@")[0];
  if (n.includes(",")) return n.split(",")[1]?.trim().split(/\s+/)[0] ?? n;
  return n.split(/\s+/)[0];
}

export function displayName(p: Person, meEmail?: string): string {
  if (meEmail && p.email === meEmail) return "me";
  return p.name && p.name !== p.email ? p.name : p.email;
}

export function initials(p: Person): string {
  const n = (p.name || p.email).replace(/[^\p{L}\p{N}\s.,@-]/gu, "").trim();
  if (n.includes("@")) return n[0]?.toUpperCase() ?? "?";
  const parts = n.includes(",") ? n.split(",").reverse().join(" ").trim().split(/\s+/) : n.split(/\s+/);
  return ((parts[0]?.[0] ?? "") + (parts.length > 1 ? parts[parts.length - 1][0] ?? "" : "")).toUpperCase() || "?";
}

/** Stable avatar colors: hand-picked tint/text pairs, chosen by hashing the address. */
const AVATARS: [string, string][] = [
  ["hsl(186, 52%, 90%)", "hsl(188, 80%, 22%)"],
  ["hsl(214, 70%, 92%)", "hsl(217, 55%, 32%)"],
  ["hsl(262, 55%, 93%)", "hsl(262, 40%, 38%)"],
  ["hsl(330, 60%, 93%)", "hsl(330, 45%, 36%)"],
  ["hsl(34, 90%, 90%)", "hsl(24, 80%, 30%)"],
  ["hsl(146, 40%, 89%)", "hsl(148, 50%, 24%)"],
  ["hsl(48, 85%, 86%)", "hsl(38, 90%, 24%)"],
  ["hsl(200, 25%, 88%)", "hsl(205, 30%, 28%)"],
];

export function avatarColors(email: string): { background: string; color: string } {
  let h = 0;
  for (let i = 0; i < email.length; i++) h = (h * 31 + email.charCodeAt(i)) | 0;
  const [bg, fg] = AVATARS[Math.abs(h) % AVATARS.length];
  return { background: bg, color: fg };
}

export function bytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

export function ext(filename: string): string {
  const m = filename.match(/\.([a-z0-9]{1,5})$/i);
  return m ? m[1].toLowerCase() : "file";
}

export function plural(n: number, word: string, pluralWord = `${word}s`): string {
  return `${n.toLocaleString()} ${n === 1 ? word : pluralWord}`;
}

export function domainOf(email: string): string {
  return email.split("@")[1]?.toLowerCase() ?? "";
}

const PUBLIC_DOMAINS = new Set(["gmail.com", "googlemail.com", "outlook.com", "hotmail.com", "live.com", "msn.com", "yahoo.com", "icloud.com", "me.com", "aol.com", "proton.me", "protonmail.com"]);
export function isPublicDomain(d: string): boolean {
  return PUBLIC_DOMAINS.has(d);
}

/** Senders summary for list rows: "Priya, Dana, me (12)". */
export function sendersLine(participants: Person[], meEmail: string, max = 3): string {
  const names = participants.map((p) => (p.email === meEmail ? "me" : firstName(p)));
  const uniq = [...new Set(names)];
  if (uniq.length <= max) return uniq.join(", ");
  return `${uniq[0]} … ${uniq.slice(-(max - 1)).join(", ")}`;
}
