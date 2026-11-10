# Tidepost

A keyboard-first email client for Gmail and Outlook, built for people who get a lot of corporate mail.

Tidepost started as [a concept prototype](prototype/) asking what an email client would look like if it worked like an agent workbench. Agent tools have spent a year or two working out how a person supervises work they didn't do themselves: status at a glance, plan before act, review as a diff, background runs you check before they apply. Triage is mostly the same job. This version is a working client built on that idea. You sign in with a real Google or Microsoft account, and it reads, sorts and sends real mail.

## What it does

**Triage lanes instead of one inbox.** Every inbox thread lands in one lane, worked out from the headers. No AI is involved, so the rules stay predictable:

| Lane | Meaning |
| --- | --- |
| **Needs you** | Someone else wrote last, and you're on *To*. A follow-up reminder that fired with no reply also lands here. |
| **Waiting** | You wrote last and nobody has answered. Oldest first, for 30 days. |
| **FYI** | You're only on *Cc*, or it went to a group. |
| **Updates** | Newsletters, notifications, automated mail (List-Id, List-Unsubscribe, Precedence, Auto-Submitted, noreply senders, Gmail categories, Outlook's Other). |

Each thread shows a status glyph whose shape carries the meaning, so it doesn't rely on color.

**Long threads stay readable**

- Older messages collapse into "*N* earlier messages from *M* people" bars. Unread messages, the first one and the last three stay visible.
- Quoted history is collapsed in every message: Gmail, Outlook, Apple Mail and plain-text styles. For Outlook it uses Exchange's own `uniqueBody`.
- A *thread chart* in the side panel puts one dot per message, grouped by day. Reply-all storms, your own replies, unread messages and messages that ask you something are visible at a glance, and each dot jumps to its message.
- Toolbar tools:
  - Jump to the first unread message.
  - Expand or collapse all (`;` and `:`).
  - Filter by person.
  - Show only messages to or from you.
  - Find in thread (`⌘F`).
- Messages note who was added to or dropped from the recipients.
- A Files list collects every attachment in the thread, newest version first.

**Brief and plan (the assistant)**

- A brief at the top of the side panel gives:
  - where the thread stands
  - what happened since your last reply
  - the open asks for you, with deadlines
  - decisions already made
  - a suggested next step
- Every statement cites its message (`[#12]`), and clicking a citation jumps there.
- *Plan next steps* proposes up to four actions: reply, archive, snooze, follow up, label, unsubscribe. Each one runs only after you approve it.
- With `ANTHROPIC_API_KEY` set, the assistant uses Claude. Without it, Tidepost falls back to a transparent heuristic summary and ask extraction.

**Writing and sending safely**

- **Draft from your notes (`⌘J`).** Jot rough notes and the assistant writes three versions (Brief, Warm, Firm). You review its edits as a diff against your notes, keep or reject each one, and can roll back to any checkpoint.
- **Checks before sending:**
  - recipients outside your domain
  - 15 or more recipients, with a one-click "Move Cc to Bcc"
  - "attached" in the text but no file attached
  - an empty subject
  - assistant edits you haven't reviewed

  The first Send shows the warnings and the second Send confirms.
- **Undo send.** Mail waits 10 seconds by default (0–30, configurable) on the server before it leaves.
- **Replies thread correctly.** Gmail replies carry `In-Reply-To` and `References`. Outlook uses `createReply`, `createReplyAll` and `createForward`.

**Heavy-inbox tools**

- **Virtualized lists** that stay fast with thousands of threads.
- **Bulk selection** with `x`, `Shift+J/K`, `*a` or Shift-click. Large selections run as a background job with progress.
- **Clean-up sweeps** propose bulk work first and apply it only after you review:
  - archive old updates
  - mark updates read
  - archive read FYI mail
  - bring back threads with no reply in 3 days
- **Snooze.** The thread leaves the inbox and comes back unread at the time you choose.
- **Follow-up reminders.** If nobody replies by then, the thread returns to Needs you.
- **Pin to top.**
- **One-click unsubscribe.** It uses RFC 8058 when the sender supports it, and otherwise falls back to the mailto or website method.
- **Search.**
  - Search runs on the provider, so it covers the whole mailbox and supports Gmail operators. Outlook uses KQL through Graph `$search`.
  - Local full-text results appear instantly while the provider search runs.
- **Command palette (`⌘K`)** for every action, lane and label.
- **Gmail-compatible keyboard map.** Press `?` to see it.
- **Several accounts** at once (Gmail and Outlook side by side).
- **Privacy and safety.**
  - Remote images are blocked by default; you can allow them per sender.
  - HTML mail is sanitized with DOMPurify and rendered in a sandboxed iframe with a strict CSP.
- **Settings.** Light/dark theme, compact or comfortable density, reading pane or full width.

## Running it

Requires Node.js 22.12 or newer (it uses the built-in `node:sqlite`).

```sh
npm install
cp .env.example .env     # add your OAuth credentials (see below)
npm run dev              # API on :8787, web app on http://localhost:5173
```

Open http://localhost:5173. Without credentials you can still choose **Try a demo mailbox**, which loads 2,500 realistic messages, including a 140-message reply-all thread.

Production:

```sh
npm run build
APP_URL=https://mail.example.com npm start   # serves the built app and the API on $PORT
```

Put it behind HTTPS. Session cookies are marked `Secure` when `APP_URL` starts with `https://`.

### Gmail setup

1. In the [Google Cloud console](https://console.cloud.google.com/), create a project and enable the **Gmail API**.
2. Configure the OAuth consent screen and add the scope `https://www.googleapis.com/auth/gmail.modify`.
   - While the app is in *Testing* mode, add your users as test users.
   - Gmail scopes are *restricted*. Making the app public requires Google's verification.
3. Create credentials: **OAuth client ID**, type **Web application**.
   - Authorized redirect URI: `http://localhost:5173/api/auth/google/callback` (or `${APP_URL}/api/auth/google/callback`).
4. Put the client ID and secret in `.env` as `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

### Outlook / Microsoft 365 setup

1. In the [Microsoft Entra admin center](https://entra.microsoft.com/), go to **App registrations → New registration**.
2. Supported account types: **Accounts in any organizational directory and personal Microsoft accounts**.
3. Redirect URI: platform **Web**, `http://localhost:5173/api/auth/microsoft/callback`.
4. Under **Certificates & secrets**, create a client secret.
5. Under **API permissions**, add these Microsoft Graph *delegated* permissions: `openid`, `profile`, `email`, `offline_access`, `User.Read`, `Mail.ReadWrite`, `Mail.Send`.
   - Some organizations require admin consent for mail scopes.
6. Put the values in `.env` as `MICROSOFT_CLIENT_ID` and `MICROSOFT_CLIENT_SECRET`. Leave `MICROSOFT_TENANT=common`, or set it to your tenant ID to restrict sign-in to one organization.

### Assistant (optional)

Set `ANTHROPIC_API_KEY` to turn on Claude-written briefs, drafts and plans. The model defaults to `claude-opus-5-5`; change it with `TIDEPOST_AI_MODEL`.

- **When briefs are made:** on demand, and automatically for threads with three or more messages. Each brief is cached until the thread changes.
- **What is sent:** thread text goes to Anthropic's API only when a brief, draft or plan is requested.

## How it works

```
browser (React, Vite)                      server (Node, Hono)                         providers
──────────────────────                     ─────────────────────────────────           ───────────────────
lists, reader, composer  ── /api ────────▶ routes, sessions, CSRF header check
live updates             ◀── SSE ──────── event bus (threads, sync, runs, sends)
                                           sync engine ── initial index + polling ───▶ Gmail API (history)
                                           SQLite: message index, threads, lanes,      Microsoft Graph (delta)
                                                   bodies cache, FTS5 search,          demo mailbox (in memory)
                                                   send queue, snoozes, reminders
                                           assistant ─────────────────────────────────▶ Anthropic API (optional)
```

- **Index first.** On sign-in the server indexes the newest 3,000 messages' headers (`TIDEPOST_SYNC_MESSAGES`). After that it polls for changes every 45 seconds, using Gmail `history` or Graph delta queries. Lists, lanes and counts are SQL queries over that local index, so they're instant even for big mailboxes.
- **Bodies on demand.** Bodies are fetched when you open a thread and cached for later.
- **Optimistic actions.** Archive, read, star and the rest update the local index right away and then call the provider. A failure triggers a resync.
- **Outlook specifics.** Outlook threads are grouped by `conversationId`. Requests use immutable IDs, so messages keep their identity when moved between folders.
- **Encryption.** OAuth tokens and queued outgoing mail are encrypted at rest with AES-256-GCM.

## Development

```sh
npm run dev         # API + web with reload
npm test            # unit tests (providers, index, lanes, MIME, diff, checks)
npm run typecheck
npm run verify      # builds, then runs 23 end-to-end checks in headless Chromium against the demo mailbox
```

```
server/
  index.ts           entry; serves dist/ in production
  app.ts             HTTP API, OAuth callbacks, SSE
  accounts.ts        users, sessions, encrypted tokens, provider registry
  sync.ts            initial sync, polling, snooze/reminder scheduler
  store.ts           message index, thread materialization, triage lanes, search
  mail.ts            thread loading, actions, undo-send queue, unsubscribe, sweeps
  assistant.ts       briefs, drafts, plans (Claude or heuristics)
  providers/         gmail.ts, outlook.ts, demo/, shared HTTP + address helpers
  auth/              Google and Microsoft OAuth (authorization code + PKCE)
  mime.ts            RFC 5322 message builder
shared/types.ts      types shared by server and client
src/                 React client (components/, lib/, hooks.ts, store.ts, styles.css)
prototype/           the original concept prototype, kept for reference
```

## License

[MIT](LICENSE)
