# Google OAuth verification — handoff notes

Context for whoever answers the Trust & Safety email about Tidepost's
`gmail.modify` verification. Everything below was true at submission time
(Nov 10, 2026, ~22:40 IST).

## Where things are

| What | Value |
| --- | --- |
| GCP project | `hostel-bingo` (project number `886630937684`) — reused because the account hit its project quota |
| OAuth client | **Tidepost**, Web application, ID `886630937684-590i…apps.googleusercontent.com` (full ID: Auth Platform → Clients in the `hostel-bingo` project) |
| Redirect URIs | `https://tidepost.sankalpmukim.dev/api/auth/google/callback` and `http://localhost:5173/api/auth/google/callback` (dev) |
| JS origins | `https://tidepost.sankalpmukim.dev`, `http://localhost:5173` |
| Status page | https://console.cloud.google.com/auth/verification?project=hostel-bingo (sign in as sankalpmukim@gmail.com) |
| Publishing status | In production, External. Branding **verified**. Data-access verification **submitted, under review** |
| User cap | 2/100 while unverified (test users: sankalpmukim@gmail.com, sankalpmukim1@gmail.com) |

## What was submitted

- **Scopes:** `openid`, `userinfo.email`, `userinfo.profile` (non-sensitive) +
  `https://www.googleapis.com/auth/gmail.modify` (restricted — the reason for review).
- **Feature selected:** *Email client and Email productivity*.
- **Justification (939/1000 chars, verbatim):**

  > Tidepost is a personal email client at https://tidepost.sankalpmukim.dev. Users sign in with Google to read, organize, and send their own Gmail. gmail.modify is required because the app both reads mail and changes mailbox state on the user's behalf, only after they act in the UI: - Index recent messages (headers, then bodies when a thread is opened) so inbox lanes, search, and unread counts work. - Send new mail and threaded replies/forwards (create/send). - Archive, move to inbox, trash, spam, star, mark read/unread, apply/remove labels, and one-click unsubscribe. gmail.readonly cannot send or change labels/inbox. gmail.send cannot read the mailbox or archive/label. gmail.compose cannot send. gmail.modify is the least privilege that covers a real client. We do not sell mail data, use it for ads, or share it with third parties except optional Anthropic briefs when the user requests one. Tokens stay encrypted on our server.

- **Demo video:** https://youtu.be/oxT196dRIGo (Unlisted). It is a slideshow of
  the real flow: sign-in → unverified-app warning → consent → inbox → thread →
  reply composer. *Weakness to be ready for:* it is stitched screenshots, not a
  continuous screen recording. If Google pushes back, re-record a real capture
  (a Chrome profile with the Google session exists at
  `<repo>/.chrome-oauth-profile`; launch with `--remote-debugging-port=9333`).
- **Reviewer note:** how to test (homepage → "Open Tidepost" → "Continue with
  Google"), scopes list, project ID.
- **Questionnaire (if asked again):** personal use only → **No** (intended for
  general users; the 100-user cap applies while unverified). Internal use only →
  **No** (External user type, no Workspace org).

## Branding on the consent screen (already verified — keep consistent)

- Homepage: https://tidepost.sankalpmukim.dev — **public landing page** (no
  login) that explains the app. This was built specifically because Google
  rejected a login-walled homepage. Do not point this at sankalpmukim.dev (the
  apex is a personal portfolio with no Tidepost mention).
- Privacy: https://tidepost.sankalpmukim.dev/privacy.html
- Terms: https://sankalpmukim.dev/terms-of-use.pdf
- Authorized domain: `sankalpmukim.dev` (covers the subdomain)
- Support + developer email: sankalpmukim@gmail.com

## Claims made to Google — must stay true

1. No selling of mail data, no ads, no sharing except optional Anthropic
   API calls for briefs/drafts **when the user requests one**.
2. OAuth tokens encrypted at rest (AES-256-GCM via `TIDEPOST_SECRET`).
3. Actions on the mailbox happen only after the user acts in the UI.
4. `gmail.modify` is least-privilege for a real client (read + send + label/archive).

If any of these changes, update the justification before replying.

## Architecture facts (likely questions)

- Hosted on Vercel (`tidepost` project, team *Sankalp's projects*), git-connected
  to github.com/sankalpmukim/tidepost. DNS: Cloudflare CNAME
  `tidepost` → `cname.vercel-dns.com`, DNS-only (not proxied).
- Backend: Hono API in a Vercel Node function (`api/index.js`, esbuild-bundled
  from `server/vercel.ts`); data layer now Convex
  (`https://jovial-frog-536.convex.cloud`). Historically SQLite — the
  ephemeral-filesystem issue is why Convex was adopted.
- Single developer, no organization.

## Timeline & likely follow-ups

- Google said: first email within **3–5 days**, full review **4–6 weeks**.
- Expect a **CASA security assessment** request (restricted Gmail scopes
  usually require it; Tier 2 via an authorized lab is the common ask, costs
  ~$500–$540 unless waived for personal-use apps).
- Possible asks: better demo video, domain ownership proof (Search Console on
  sankalpmukim.dev — a verification TXT already exists in Cloudflare DNS),
  privacy-policy wording, or scope reduction.
- While unverified: app stays usable, new users see the "unverified app"
  warning, hard cap 100 lifetime grants.
