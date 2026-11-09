// Line diff between your rough notes and an assistant draft, with
// per-hunk keep/reject decisions (Tidepost's "review the draft as a diff").

export interface Line { text: string; sep: string }
export type Seg = { kind: "same"; lines: Line[] } | { kind: "change"; id: number; del: Line[]; add: Line[] };
export type Decision = "accept" | "reject";

export function toLines(text: string): Line[] {
  const out: Line[] = [];
  const parts = text.replace(/\r/g, "").split(/(\n+)/);
  for (let i = 0; i < parts.length; i += 2) {
    const t = parts[i].trim();
    const sep = parts[i + 1] ?? "";
    if (t) out.push({ text: t, sep: sep.length > 1 ? "\n\n" : "\n" });
    else if (out.length && sep.length > 0) out[out.length - 1].sep = "\n\n";
  }
  return out;
}

const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();

export function diff(a: Line[], b: Line[]): Seg[] {
  const n = a.length;
  const m = b.length;
  const dp: number[][] = Array.from({ length: n + 1 }, () => new Array<number>(m + 1).fill(0));
  for (let i = n - 1; i >= 0; i--) for (let j = m - 1; j >= 0; j--) dp[i][j] = norm(a[i].text) === norm(b[j].text) ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const segs: Seg[] = [];
  let i = 0;
  let j = 0;
  let del: Line[] = [];
  let add: Line[] = [];
  let hid = 0;
  const flush = () => {
    if (del.length || add.length) {
      segs.push({ kind: "change", id: hid++, del, add });
      del = [];
      add = [];
    }
  };
  while (i < n || j < m) {
    if (i < n && j < m && norm(a[i].text) === norm(b[j].text)) {
      flush();
      const last = segs[segs.length - 1];
      if (last && last.kind === "same") last.lines.push(b[j]);
      else segs.push({ kind: "same", lines: [b[j]] });
      i++;
      j++;
    } else if (j < m && (i >= n || dp[i][j + 1] >= dp[i + 1][j])) {
      add.push(b[j]);
      j++;
    } else {
      del.push(a[i]);
      i++;
    }
  }
  flush();
  return segs;
}

export function hunkCount(segs: Seg[]): number {
  return segs.filter((s) => s.kind === "change").length;
}

/** Compose the final text from decisions. Undecided hunks take the assistant's edit. */
export function finalText(segs: Seg[], decisions: Record<number, Decision>): string {
  const lines: Line[] = [];
  for (const s of segs) {
    if (s.kind === "same") lines.push(...s.lines);
    else lines.push(...(decisions[s.id] === "reject" ? s.del : s.add));
  }
  return lines.map((l, i) => l.text + (i < lines.length - 1 ? l.sep : "")).join("");
}
