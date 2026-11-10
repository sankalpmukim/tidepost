import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useQueryClient } from "@tanstack/react-query";
import { liveSummaries, useMe } from "../hooks";
import { getUi, setUi, useUi } from "../store";
import { BrandMark, StatusGlyph } from "./bits";
import { saveSettings } from "./Overlays";
import type { Account, Settings } from "../../shared/types";

const LAST = 3; // index of the final card

const LANES: { lane: "needs" | "waiting" | "fyi" | "updates"; key: string; name: string; text: string }[] = [
  { lane: "needs", key: "1", name: "Needs you", text: "Someone else wrote last and it's addressed to you. This is your to-do list — start here." },
  { lane: "waiting", key: "2", name: "Waiting", text: "You wrote last. Tidepost watches for the reply and can nudge you when one doesn't come." },
  { lane: "fyi", key: "3", name: "FYI", text: "You're on Cc or it went to a group list. Read it when it suits you." },
  { lane: "updates", key: "4", name: "Updates", text: "Newsletters, receipts, automated mail. Review a sweep and clear them in one step." },
];

const KEYS: [string[], string][] = [
  [["j", "k"], "Move through threads"],
  [["e"], "Archive"],
  [["r"], "Reply"],
  [["c"], "Compose"],
  [["/"], "Search everything"],
  [["⇧", "H"], "Follow up if no reply"],
  [["⌘", "K"], "Command palette"],
  [["?"], "Every shortcut, anytime"],
];

export function Onboarding() {
  const open = useUi((s) => s.tour);
  const me = useMe().data;
  if (!open || !me) return null;
  return <Walkthrough />;
}

function Walkthrough() {
  const me = useMe().data!;
  const qc = useQueryClient();
  const [step, setStep] = useState(0);
  const cardRef = useRef<HTMLDivElement>(null);

  // Dismiss for good: persist, and put the keyboard cursor on the first thread.
  const done = useCallback(
    (focusFirst: boolean) => {
      setUi({ tour: false });
      void saveSettings(qc, { onboardedAt: Date.now() });
      if (focusFirst) {
        const first = liveSummaries()[0];
        if (first && !getUi().focusedThreadId) setUi({ focusedThreadId: first.id });
      }
    },
    [qc],
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      const onButton = !!t.closest("button");
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        done(false);
      } else if (e.key === "ArrowRight" || e.key === "j") {
        e.preventDefault();
        e.stopPropagation();
        setStep((s) => Math.min(LAST, s + 1));
      } else if (e.key === "ArrowLeft" || e.key === "k") {
        e.preventDefault();
        e.stopPropagation();
        setStep((s) => Math.max(0, s - 1));
      } else if ((e.key === "Enter" || e.key === " ") && !onButton) {
        e.preventDefault();
        e.stopPropagation();
        if (step === LAST) done(true);
        else setStep((s) => Math.min(LAST, s + 1));
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [step, done]);

  useEffect(() => {
    cardRef.current?.focus();
  }, [step]);

  return createPortal(
    <div className="scrim" onMouseDown={(e) => e.target === e.currentTarget && done(false)}>
      <div className="dialog onboarding" role="dialog" aria-modal="true" aria-label="Welcome to Tidepost" ref={cardRef} tabIndex={-1}>
        <div className="onb-body">
          {step === 0 ? <Welcome /> : null}
          {step === 1 ? <Lanes /> : null}
          {step === 2 ? <Keys /> : null}
          {step === 3 ? <Expectations settings={me.settings} /> : null}
        </div>
        <div className="onb-foot">
          <button className="btn btn-ghost" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={step === 0}>
            Back
          </button>
          <div className="onb-dots" aria-hidden="true">
            {Array.from({ length: LAST + 1 }, (_, i) => (
              <span key={i} className="onb-dot" data-on={i === step ? "true" : undefined} />
            ))}
          </div>
          <span className="sr-only" aria-live="polite">
            Step {step + 1} of {LAST + 1}
          </span>
          <button className="btn btn-ghost" onClick={() => done(false)}>
            Skip
          </button>
          {step < LAST ? (
            <button className="btn btn-primary" onClick={() => setStep((s) => Math.min(LAST, s + 1))}>
              Next
            </button>
          ) : (
            <button className="btn btn-primary" onClick={() => done(true)}>
              Start with Needs you
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Welcome() {
  const me = useMe().data!;
  const aid = useUi((s) => s.accountId);
  const account: Account = me.accounts.find((a) => a.id === aid) ?? me.accounts[0];
  const sync = account.sync;
  const indexing = sync.phase === "initial";
  const errored = sync.phase === "error";
  const pct = sync.total > 0 ? Math.min(100, Math.round((sync.done / sync.total) * 100)) : null;
  return (
    <>
      <div className="onb-brand">
        <BrandMark size={30} />
        <div>
          <h2 className="onb-title">Welcome to Tidepost</h2>
          <p className="onb-account">
            {account.provider === "gmail" ? "Gmail" : account.provider === "outlook" ? "Outlook" : "Demo mailbox"} · {account.email}
          </p>
        </div>
      </div>
      <p className="onb-lede">
        This is a triage workbench, not another river of unread. Tidepost reads what arrives, separates what needs your answer from what
        can wait, and keeps hundred-message threads readable — you stay in control of every send.
      </p>
      <div className="onb-sync" data-state={errored ? "error" : indexing ? "working" : "done"}>
        {indexing ? <span className="spinner" /> : <StatusGlyph lane={errored ? "needs" : "done"} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="onb-sync-title">
            {indexing ? "Indexing your mailbox" : errored ? "Indexing hit a snag — it will retry" : "Mailbox indexed"}
          </div>
          <div className="onb-sync-sub">
            {indexing
              ? `${sync.done.toLocaleString()} messages so far${sync.total ? ` of about ${sync.total.toLocaleString()}` : ""}. Lanes fill in as they land — look around while it works.`
              : errored
                ? (sync.error ?? "Your mail itself is untouched.")
                : `${sync.done.toLocaleString()} messages sorted into lanes. New mail arrives every few minutes.`}
          </div>
          {indexing && pct !== null ? (
            <div className="progress" style={{ marginTop: 8 }}>
              <div style={{ width: `${pct}%` }} />
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
}

function Lanes() {
  return (
    <>
      <h2 className="onb-title">How your mail is sorted</h2>
      <p className="onb-lede">
        Every thread lands in one of four lanes. Nothing is filed away or lost — this is just the order Tidepost suggests you work in.
      </p>
      <div className="onb-lanes">
        {LANES.map((l) => (
          <div className="onb-lane" key={l.lane}>
            <span className="onb-lane-glyph">
              <StatusGlyph lane={l.lane} />
            </span>
            <span className="onb-lane-name">{l.name}</span>
            <span className="onb-lane-text">{l.text}</span>
            <kbd>{l.key}</kbd>
          </div>
        ))}
      </div>
      <p className="onb-note">
        Press <kbd>1</kbd>–<kbd>4</kbd> to switch lanes at any time.
      </p>
    </>
  );
}

function Keys() {
  return (
    <>
      <h2 className="onb-title">Keyboard first</h2>
      <p className="onb-lede">
        The whole client runs from the keys — this walkthrough already does. Try <kbd>j</kbd> and <kbd>k</kbd> to move through it.
      </p>
      <div className="onb-keys">
        {KEYS.map(([keys, label]) => (
          <div className="onb-key" key={label}>
            <span>{label}</span>
            <span className="keys">
              {keys.map((k, i) => (
                <kbd key={i}>{k}</kbd>
              ))}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function Expectations({ settings }: { settings: Settings }) {
  const undo = settings.undoSendSeconds;
  return (
    <>
      <h2 className="onb-title">What to expect</h2>
      <p className="onb-lede">A few things worth knowing before you start.</p>
      <ul className="onb-list">
        <li>
          <strong>Nothing happens unless you say so.</strong> Tidepost reads and sorts; it never sends, archives, or unsubscribes on its
          own.
        </li>
        <li>
          <strong>Every send has a safety net.</strong>
          {undo > 0 ? ` It waits ${undo}s in a queue you can undo, and` : " It"} checks flag outside recipients, large audiences, and
          missing attachments before mail leaves.
        </li>
        <li>
          <strong>Your mail stays yours.</strong> Tidepost works through the official Gmail and Outlook APIs, and your sign-in tokens are
          encrypted on the server.
        </li>
        <li>
          <strong>Lost? Press <kbd>?</kbd></strong> for every shortcut — or find this tour again in Settings.
        </li>
      </ul>
    </>
  );
}
