// Small local stand-ins for the components and theme the original canvas used.
// Colors are CSS variables (see index.css) so light and dark mode both work.
import type { CSSProperties, ReactNode } from "react";

const v = (name: string) => `var(--tp-${name})`;

const FAMILY = 'Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';
const MONO = 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace';

const theme = {
  text: {
    primary: v("text-primary"), secondary: v("text-secondary"), tertiary: v("text-tertiary"),
    accent: v("accent"), success: v("success"), warning: v("warning"), danger: v("danger"),
  },
  bg: { base: v("bg-base"), subtle: v("bg-subtle") },
  border: { default: v("border-default"), strong: v("border-strong"), subtle: v("border-subtle") },
  fill: { secondary: v("fill-secondary"), dangerSubtle: v("fill-danger"), successSubtle: v("fill-success") },
  radius: { sm: 4, md: 6, lg: 8, xl: 12, full: 999 },
  weight: { regular: 400, medium: 500, semibold: 600 },
  dataviz: { categorical: [v("accent"), "#e07a3f", "#3fa37a", "#a35fd0"] },
  font: {
    family: FAMILY,
    mono: MONO,
    heading1: { fontSize: 26, lineHeight: "32px", fontWeight: 600 } as CSSProperties,
    heading2: { fontSize: 19, lineHeight: "26px", fontWeight: 600 } as CSSProperties,
    heading3: { fontSize: 16, lineHeight: "22px", fontWeight: 600 } as CSSProperties,
    body1: { fontSize: 15, lineHeight: "22px" } as CSSProperties,
    body2: { fontSize: 14, lineHeight: "20px" } as CSSProperties,
    caption: { fontSize: 12, lineHeight: "16px" } as CSSProperties,
    label: { fontSize: 11, lineHeight: "14px", fontWeight: 600 } as CSSProperties,
    code: { fontSize: 13, lineHeight: "18px" } as CSSProperties,
  },
};

export type Theme = typeof theme;
export function useGrokTheme(): Theme { return theme; }

export function Page({ title, summary, children }: { title: string; summary?: string; width?: "full" | "default"; children: ReactNode }) {
  return (
    <main style={{ maxWidth: 1440, margin: "0 auto", padding: "28px 20px 64px", display: "flex", flexDirection: "column", gap: 24, fontFamily: FAMILY, color: theme.text.primary }}>
      <header style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <h1 style={{ ...theme.font.heading1, margin: 0 }}>{title}</h1>
        {summary ? <p style={{ ...theme.font.body1, margin: 0, color: theme.text.secondary, maxWidth: 860 }}>{summary}</p> : null}
      </header>
      {children}
    </main>
  );
}

export function Section({ heading, collapsible, defaultOpen = true, children }: { heading: string; collapsible?: boolean; defaultOpen?: boolean; children: ReactNode }) {
  const h = <span style={{ ...theme.font.heading2 }}>{heading}</span>;
  if (collapsible) {
    return (
      <details open={defaultOpen} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
        <summary style={{ cursor: "pointer", marginBottom: 10 }}>{h}</summary>
        {children}
      </details>
    );
  }
  return <section style={{ display: "flex", flexDirection: "column", gap: 10 }}>{h}{children}</section>;
}

export function Callout({ tone = "info", children }: { tone?: "info" | "warning"; children: ReactNode }) {
  const c = tone === "warning" ? theme.text.warning : theme.text.accent;
  return <div style={{ ...theme.font.body2, borderLeft: `3px solid ${c}`, background: theme.bg.subtle, padding: "10px 14px", borderRadius: theme.radius.md }}>{children}</div>;
}

// Turns bare URLs inside a cell into links.
function linkify(s: string): ReactNode[] {
  return s.split(/(https?:\/\/\S+)/g).map((part, i) =>
    /^https?:\/\//.test(part) ? <a key={i} href={part} target="_blank" rel="noreferrer" style={{ color: theme.text.accent, wordBreak: "break-all" }}>{part}</a> : part,
  );
}

export function Table({ columns, rows }: { columns: string[]; rows: string[][] }) {
  const cell: CSSProperties = { ...theme.font.body2, textAlign: "left", verticalAlign: "top", padding: "8px 10px", borderBottom: `1px solid ${theme.border.subtle}` };
  return (
    <div style={{ overflowX: "auto", border: `1px solid ${theme.border.default}`, borderRadius: theme.radius.lg }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead><tr>{columns.map((c) => <th key={c} style={{ ...cell, ...theme.font.label, color: theme.text.tertiary, textTransform: "uppercase", background: theme.bg.subtle }}>{c}</th>)}</tr></thead>
        <tbody>{rows.map((r, i) => <tr key={i}>{r.map((c, j) => <td key={j} style={cell}>{linkify(c)}</td>)}</tr>)}</tbody>
      </table>
    </div>
  );
}

export function Steps({ steps }: { steps: { title: string; detail?: string }[] }) {
  return (
    <ol style={{ margin: 0, paddingLeft: 22, display: "flex", flexDirection: "column", gap: 8 }}>
      {steps.map((s) => (
        <li key={s.title} style={theme.font.body2}>
          <strong style={{ fontWeight: 600 }}>{s.title}</strong>
          {s.detail ? <div style={{ color: theme.text.secondary }}>{s.detail}</div> : null}
        </li>
      ))}
    </ol>
  );
}

export function LinkCards({ links }: { links: { title: string; site?: string; href: string }[] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(220px, 1fr))", gap: 10 }}>
      {links.map((l) => (
        <a key={l.href} href={l.href} target="_blank" rel="noreferrer" style={{ textDecoration: "none", color: theme.text.primary, border: `1px solid ${theme.border.default}`, borderRadius: theme.radius.lg, padding: 12, display: "flex", flexDirection: "column", gap: 4, background: theme.bg.base }}>
          <span style={{ ...theme.font.body2, fontWeight: 500 }}>{l.title}</span>
          {l.site ? <span style={{ ...theme.font.caption, color: theme.text.tertiary }}>{l.site}</span> : null}
        </a>
      ))}
    </div>
  );
}

export function Button({ label, onClick, variant = "secondary", disabled }: { label: string; onClick?: () => void; variant?: "primary" | "secondary"; disabled?: boolean }) {
  const primary = variant === "primary";
  return (
    <button type="button" onClick={onClick} disabled={disabled} style={{
      ...theme.font.caption, fontWeight: 500, padding: "5px 12px", borderRadius: theme.radius.md, cursor: disabled ? "not-allowed" : "pointer", opacity: disabled ? 0.5 : 1,
      border: `1px solid ${primary ? "transparent" : theme.border.default}`,
      background: primary ? theme.text.primary : theme.bg.base,
      color: primary ? theme.bg.base : theme.text.primary,
    }}>{label}</button>
  );
}

type Opt<T extends string> = T | { value: T; label: string; count?: number };

export function Segmented<T extends string>({ value, options, onChange }: { value: T; options: Opt<T>[]; onChange: (v: T) => void }) {
  return (
    <div role="radiogroup" style={{ display: "inline-flex", gap: 2, padding: 2, borderRadius: theme.radius.md, background: theme.fill.secondary }}>
      {options.map((o) => {
        const val = (typeof o === "string" ? o : o.value) as T;
        const lab = typeof o === "string" ? o : o.label;
        const count = typeof o === "string" ? undefined : o.count;
        const on = val === value;
        return (
          <button key={val} type="button" role="radio" aria-checked={on} onClick={() => onChange(val)} style={{
            ...theme.font.caption, fontWeight: 500, padding: "3px 10px", borderRadius: theme.radius.sm, border: "none", cursor: "pointer",
            background: on ? theme.bg.base : "transparent", color: on ? theme.text.primary : theme.text.secondary,
            boxShadow: on ? "0 1px 2px rgba(0,0,0,0.12)" : "none",
          }}>
            {lab}{count !== undefined ? <span style={{ marginLeft: 6, color: theme.text.tertiary }}>{count}</span> : null}
          </button>
        );
      })}
    </div>
  );
}
