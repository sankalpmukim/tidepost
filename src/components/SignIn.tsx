import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "../api";
import { useConfig } from "../hooks";
import { BrandMark, StatusGlyph } from "./bits";

function GoogleLogo() {
  return (
    <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.8 1.2 7.9 3.1l5.7-5.7C34 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

function MicrosoftLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden="true">
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
}

export function SignIn() {
  const cfg = useConfig();
  const qc = useQueryClient();
  const [busy, setBusy] = useState(false);
  const params = new URLSearchParams(window.location.search);
  const [error, setError] = useState<string | null>(params.get("auth_error"));
  const p = cfg.data?.providers;
  const nothingConfigured = p && !p.gmail && !p.outlook;

  const demo = async () => {
    setBusy(true);
    try {
      await api.demo();
      await qc.invalidateQueries({ queryKey: ["me"] });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't open the demo mailbox.");
      setBusy(false);
    }
  };

  return (
    <main className="signin">
      <section className="signin-left">
        <div className="brand" style={{ padding: 0 }}>
          <BrandMark size={28} />
          <span className="brand-name" style={{ fontSize: 18 }}>Tidepost</span>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <h1>Get through the inbox before it gets through you.</h1>
          <p className="lede">Tidepost sorts what needs your answer from what can wait, keeps 100-message threads readable, and checks every send before it leaves.</p>
        </div>
        {error ? <div className="signin-error" role="alert">{error}</div> : null}
        <div className="signin-buttons">
          <a className="btn provider-btn" href={p?.gmail ? "/api/auth/google/start" : undefined} aria-disabled={!p?.gmail} onClick={(e) => { if (!p?.gmail) { e.preventDefault(); setError("Gmail sign-in isn't set up on this server yet. Add GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (see README)."); } }} style={!p?.gmail ? { opacity: 0.6 } : undefined}>
            <GoogleLogo /> Continue with Google
            {!p?.gmail ? <span className="pb-note">Not set up</span> : null}
          </a>
          <a className="btn provider-btn" href={p?.outlook ? "/api/auth/microsoft/start" : undefined} aria-disabled={!p?.outlook} onClick={(e) => { if (!p?.outlook) { e.preventDefault(); setError("Outlook sign-in isn't set up on this server yet. Add MICROSOFT_CLIENT_ID and MICROSOFT_CLIENT_SECRET (see README)."); } }} style={!p?.outlook ? { opacity: 0.6 } : undefined}>
            <MicrosoftLogo /> Continue with Microsoft
            {!p?.outlook ? <span className="pb-note">Not set up</span> : <span className="pb-note">Work, school or Outlook.com</span>}
          </a>
          {p?.demo ? (
            <button className="btn btn-ghost provider-btn" onClick={demo} disabled={busy} style={{ fontWeight: 600 }}>
              {busy ? <span className="spinner" /> : <span style={{ width: 18 }} />} Try a demo mailbox
              <span className="pb-note">2,500 sample messages</span>
            </button>
          ) : null}
        </div>
        {nothingConfigured ? (
          <ol className="setup-steps">
            <li>Create OAuth credentials in Google Cloud and/or Microsoft Entra.</li>
            <li>Put them in <code>.env</code> (see <code>.env.example</code>) and restart the server.</li>
            <li>Redirect URIs: <code>{window.location.origin}/api/auth/google/callback</code> and <code>…/microsoft/callback</code>.</li>
          </ol>
        ) : (
          <p className="signin-note">Tidepost reads and sends mail through Google's and Microsoft's official APIs. Your sign-in tokens are encrypted on this server and never shared.</p>
        )}
      </section>
      <section className="signin-right" aria-hidden="true">
        <div className="preview-list">
          {[
            { lane: "needs" as const, t: "Cutover plan & rollback criteria", s: "Priya asked you to sign off on the rollback window by Thursday", d: "138 messages" },
            { lane: "needs" as const, t: "Renewal: observability contract FY26", s: "Two open asks for you: approve the tier, confirm the term", d: "10:42" },
            { lane: "waiting" as const, t: "Staff SRE candidate – panel feedback", s: "You wrote 3 days ago. No reply yet", d: "Mon" },
            { lane: "fyi" as const, t: "INC-4821 postmortem: payments latency", s: "You're on Cc. 4 new since you looked", d: "Mon" },
            { lane: "updates" as const, t: "41 newsletters and notifications", s: "Review the sweep, then archive in one step", d: "" },
          ].map((r) => (
            <div className="preview-row" key={r.t}>
              <StatusGlyph lane={r.lane} />
              <div style={{ minWidth: 0 }}>
                <div className="pr-title">{r.t}</div>
                <div className="pr-sub">{r.s}</div>
              </div>
              <span className="pr-sub">{r.d}</span>
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
