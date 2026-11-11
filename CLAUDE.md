<!-- tidepost-cloudflare-start -->

This project runs on **Cloudflare Workers** (see `docs/CLOUDFLARE.md`).

- The API is a Worker (`worker/index.ts`, Hono in `server/app.ts`).
- Durable data: **D1** holds users/sessions/accounts (`server/authstore.ts`);
  each account's mail index lives in its own **Mailbox Durable Object** with
  SQLite storage (`server/mailbox/`). SSE fan-out runs in a per-user **Hub
  Durable Object** (`server/hub.ts`).
- All timers (polling, snooze/reminder scheduler, undo-send queue, bulk runs)
  are DO alarms — never `setInterval`. Never add module-level mutable request
  state to the Worker: it is request-scoped and multi-isolate.
- Storage seams: `AuthPersist` (D1) and `MailboxPersist` (DO SQLite), both in
  `server/persist.ts`; in-memory implementations back the tests.
- Client live updates are react-query + SSE invalidation (`src/hooks.ts`);
  there is no realtime database, so push changes through the hub's events.

<!-- tidepost-cloudflare-end -->
