import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { X } from "lucide-react";
import type { Lane, Person } from "../../shared/types";
import { avatarColors, initials } from "../lib/format";

export const LANE_WORDS: Record<Lane | "nudged", string> = {
  needs: "Needs you",
  waiting: "Waiting",
  fyi: "FYI",
  updates: "Updates",
  done: "Done",
  nudged: "No reply yet",
};

/** Status glyphs: shape carries the meaning, color reinforces it. */
export function StatusGlyph({ lane, nudged, working, title }: { lane: Lane; nudged?: boolean; working?: boolean; title?: string }) {
  const label = title ?? (working ? "Assistant working" : LANE_WORDS[nudged ? "nudged" : lane]);
  if (working) {
    return (
      <span className="glyph glyph-working" role="img" aria-label={label} title={label}>
        <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeOpacity=".25" strokeWidth="2" /><path d="M7 1.5a5.5 5.5 0 0 1 5.5 5.5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
      </span>
    );
  }
  let svg: ReactNode;
  if (nudged) {
    svg = <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="7" fill="currentColor" /><rect x="6.1" y="3" width="1.8" height="5" rx=".9" fill="#fff" /><circle cx="7" cy="10.4" r="1.05" fill="#fff" /></svg>;
    return <span className="glyph glyph-needs" role="img" aria-label={label} title={label}>{svg}</span>;
  }
  switch (lane) {
    case "needs":
      svg = <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="7" fill="currentColor" /><path d="M5.2 5.3a1.9 1.9 0 1 1 2.6 1.75c-.5.22-.8.6-.8 1.1v.35" fill="none" stroke="#fff" strokeWidth="1.6" strokeLinecap="round" /><circle cx="7" cy="10.5" r="1" fill="#fff" /></svg>;
      break;
    case "waiting":
      svg = <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="6" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M7 1a6 6 0 0 1 0 12z" fill="currentColor" /></svg>;
      break;
    case "fyi":
      svg = <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="5.2" fill="none" stroke="currentColor" strokeWidth="1.6" /></svg>;
      break;
    case "updates":
      svg = <svg width="14" height="14" viewBox="0 0 14 14"><rect x="2" y="3" width="10" height="1.6" rx=".8" fill="currentColor" /><rect x="2" y="6.2" width="10" height="1.6" rx=".8" fill="currentColor" /><rect x="2" y="9.4" width="6" height="1.6" rx=".8" fill="currentColor" /></svg>;
      break;
    default:
      svg = <svg width="14" height="14" viewBox="0 0 14 14"><circle cx="7" cy="7" r="7" fill="currentColor" /><path d="M4 7.2l2 2 4-4.4" fill="none" stroke="#fff" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></svg>;
  }
  return <span className={`glyph glyph-${lane}`} role="img" aria-label={label} title={label}>{svg}</span>;
}

export function Avatar({ person, size = "md" }: { person: Person; size?: "sm" | "md" }) {
  return (
    <span className={`avatar${size === "sm" ? " avatar-sm" : ""}`} style={avatarColors(person.email)} aria-hidden="true">
      {initials(person)}
    </span>
  );
}

export function BrandMark({ size = 22 }: { size?: number }) {
  // A post marking the waterline: the tide gauge.
  return (
    <svg className="brand-mark" width={size} height={size} viewBox="0 0 24 24" aria-hidden="true">
      <rect x="10.5" y="2" width="3" height="20" rx="1.5" fill="var(--text-primary)" />
      <rect x="13.5" y="5" width="4" height="1.6" rx=".8" fill="var(--text-primary)" />
      <rect x="13.5" y="9" width="3" height="1.6" rx=".8" fill="var(--text-primary)" />
      <path d="M2 15.5c2.2 0 2.2-1.6 4.4-1.6s2.2 1.6 4.4 1.6 2.2-1.6 4.4-1.6 2.2 1.6 4.4 1.6 2.2-1.6 2.4-1.6" fill="none" stroke="var(--action)" strokeWidth="2" strokeLinecap="round" />
      <path d="M2 19.5c2.2 0 2.2-1.6 4.4-1.6s2.2 1.6 4.4 1.6 2.2-1.6 4.4-1.6 2.2 1.6 4.4 1.6 2.2-1.6 2.4-1.6" fill="none" stroke="var(--action)" strokeOpacity=".45" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Dialog({ title, onClose, children, footer, wide }: { title: string; onClose: () => void; children: ReactNode; footer?: ReactNode; wide?: boolean }) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
      }
    };
    window.addEventListener("keydown", h, true);
    return () => window.removeEventListener("keydown", h, true);
  }, [onClose]);
  return createPortal(
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`dialog${wide ? " dialog-wide" : ""}`} role="dialog" aria-modal="true" aria-label={title}>
        <div className="dialog-head">
          <h2>{title}</h2>
          <button className="icon-btn" onClick={onClose} aria-label="Close"><X size={16} /></button>
        </div>
        <div className="dialog-body">{children}</div>
        {footer ? <div className="dialog-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body,
  );
}

export interface MenuItem {
  label: string;
  hint?: string;
  icon?: ReactNode;
  onSelect: () => void;
  disabled?: boolean;
}
export type MenuEntry = MenuItem | "sep" | { heading: string };

/** Anchored popover menu with keyboard navigation. */
export function Menu({ anchor, items, onClose, align = "left" }: { anchor: HTMLElement | null; items: MenuEntry[]; onClose: () => void; align?: "left" | "right" }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ top: number; left: number }>({ top: -9999, left: -9999 });
  const selectable = items.filter((i): i is MenuItem => typeof i === "object" && "onSelect" in i && !i.disabled);
  const [active, setActive] = useState(0);

  useLayoutEffect(() => {
    if (!anchor || !ref.current) return;
    const r = anchor.getBoundingClientRect();
    const m = ref.current.getBoundingClientRect();
    let left = align === "right" ? r.right - m.width : r.left;
    left = Math.max(8, Math.min(left, window.innerWidth - m.width - 8));
    let top = r.bottom + 4;
    if (top + m.height > window.innerHeight - 8) top = Math.max(8, r.top - m.height - 4);
    setPos({ top, left });
  }, [anchor, align]);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) && !anchor?.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); onClose(); }
      else if (e.key === "ArrowDown" || e.key === "j") { e.preventDefault(); e.stopPropagation(); setActive((a) => Math.min(selectable.length - 1, a + 1)); }
      else if (e.key === "ArrowUp" || e.key === "k") { e.preventDefault(); e.stopPropagation(); setActive((a) => Math.max(0, a - 1)); }
      else if (e.key === "Enter") { e.preventDefault(); e.stopPropagation(); const it = selectable[active]; if (it) { onClose(); it.onSelect(); } }
    };
    window.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey, true);
    };
  }, [anchor, onClose, selectable, active]);

  let idx = -1;
  return createPortal(
    <div ref={ref} className="menu" role="menu" style={pos}>
      {items.map((it, i) => {
        if (it === "sep") return <div key={i} className="menu-sep" />;
        if ("heading" in it) return <div key={i} className="menu-label">{it.heading}</div>;
        if (!it.disabled) idx++;
        const my = idx;
        return (
          <button
            key={i}
            role="menuitem"
            className="menu-item"
            disabled={it.disabled}
            aria-selected={!it.disabled && my === active}
            onMouseEnter={() => !it.disabled && setActive(my)}
            onClick={() => { onClose(); it.onSelect(); }}
            style={it.disabled ? { opacity: 0.45 } : undefined}
          >
            {it.icon}
            <span>{it.label}</span>
            {it.hint ? <span className="mi-hint">{it.hint}</span> : null}
          </button>
        );
      })}
    </div>,
    document.body,
  );
}

/** Snooze presets used by the snooze menu and the command palette. */
export function snoozeOptions(): { label: string; hint: string; at: Date }[] {
  const now = new Date();
  const at = (d: Date, h: number) => { const x = new Date(d); x.setHours(h, 0, 0, 0); return x; };
  const addDays = (n: number) => { const x = new Date(now); x.setDate(x.getDate() + n); return x; };
  const laterToday = new Date(now.getTime() + 3 * 3600_000);
  const nextMonday = addDays(((8 - now.getDay()) % 7) || 7);
  const opts = [
    { label: "Later today", at: laterToday },
    { label: "Tomorrow morning", at: at(addDays(1), 9) },
    { label: "Tomorrow afternoon", at: at(addDays(1), 14) },
    { label: "This weekend", at: at(addDays(((6 - now.getDay()) + 7) % 7 || 7), 9) },
    { label: "Next week", at: at(nextMonday, 9) },
    { label: "In two weeks", at: at(addDays(14), 9) },
  ];
  return opts.map((o) => ({ ...o, hint: o.at.toLocaleString(undefined, { weekday: "short", hour: "numeric", minute: "2-digit" }) }));
}

export function remindOptions(): { label: string; hint: string; at: Date }[] {
  const now = new Date();
  const mk = (days: number, label: string) => {
    const d = new Date(now);
    d.setDate(d.getDate() + days);
    d.setHours(9, 0, 0, 0);
    return { label, at: d, hint: d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" }) };
  };
  return [mk(1, "In 1 day"), mk(2, "In 2 days"), mk(3, "In 3 days"), mk(7, "In a week")];
}
