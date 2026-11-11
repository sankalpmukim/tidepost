# Tidepost on Cloudflare — architecture notes

Tidepost runs as a single Cloudflare Worker deployment. Nothing about the
user-facing product changed in the move off Node/Vercel/Convex; only the
plumbing underneath did.

```
                Cloudflare (one Worker deployment)
  ┌───────────────────────────────────────────────────────────────┐
  │ Worker (worker/index.ts, Hono)                                │
  │  · /api/* routes (same surface as before)                     │
  │  · static assets: dist/ (landing at /, app at /app)           │
  │  · OAuth + PKCE, cookie sessions, CSRF header check           │
  │  · assistant (Anthropic API), attachment streaming            │
  │  · Cron Trigger: purge expired sessions (every 6h)            │
  └───────┬──────────────────────────────┬────────────────────────┘
          │ D1 binding                   │ Durable Object bindings
  ┌───────▼──────────┐        ┌───────────▼──────────┐
  │ D1 "tidepost"    │        │ HubDO (per user)     │
  │  users           │        │  SSE fan-out, run    │
  │  sessions        │        │  snapshot registry   │
  │  accounts        │        └───────────▲──────────┘
  │  (tokens AES-    │                    │ events
  │   256-GCM, sync  │                    │
  │   cursor/state)  │                    │
  └───────▲──────────┘                    │
  ┌───────┴───────────────────────────────┴──────────┐
  │ MailboxDO (one per account, SQLite storage)      │
  │  messages · threads · thread_states · bodies ·   │
  │  send_queue · sync engine · snooze/remind        │
  │  scheduler · sweeps/bulk runs                    │
  │  ONE alarm multiplexes: poll (45s), due sends,   │
  │  due snoozes/reminders, run continuation, purge  │
  └──────────────────────────────────────────────────┘
```

## Why this shape

- **The data is already account-partitioned.** Every table in the old Convex
  schema was keyed by `accountId`, which is exactly the Durable Object
  ownership model. One MailboxDO per account gets single-writer serialised
  writes (the old `updateQueue(expectedStatus)` CAS races disappear),
  co-located compute+storage for the sync engine, and per-object alarms.
- **Timers must be durable.** Polling (45s), the snooze/remind scheduler
  (20s) and the undo-send queue (1s tick) used to be `setInterval`s in a
  Node process — on Vercel they died whenever the function froze. DO alarms
  survive anything short of a region loss. The undo-send timer is now exact:
  the alarm fires at the message's `send_at`, not on a 1s sweep.
- **Convex live queries had no Cloudflare equivalent**, so the five client
  hooks (`useMe`, `useCounts`, `useThreads`, `useLocalSearch`, `useSends`)
  became react-query + SSE-driven invalidation. The client already had an
  optimistic-projection layer and an SSE channel; live behaviour is
  unchanged (immediate push on change, 30s re-evaluation for pure time
  transitions like the 30-day Waiting window).
- **D1 holds the small global tables** (users/sessions/accounts) because
  they are looked up cross-account (sign-in by provider+email, session
  cookies). OAuth tokens stay encrypted at rest with AES-256-GCM, key
  derived from `TIDEPOST_SECRET`, exactly as before.

## Request flow

1. Browser hits `/api/*` on the Worker. Session cookie → D1 `sessions`
   lookup → `userId` in Hona context (unchanged middleware, incl. the
   `x-tidepost: 1` CSRF header check on mutations).
2. Account-scoped routes verify ownership against D1, then RPC into
   `MailboxDO.idFromName(accountId)`. Results cross the RPC boundary in an
   `{ok, value} | {ok:false, name, message}` envelope so `AuthExpiredError`
   and friends survive as their proper classes in the Worker error handler.
3. `/api/events` proxies the request to `HubDO.idFromName(userId)`, which
   owns the SSE stream. The MailboxDO emits `threads`/`sync`/`send`/`run`
   events to the hub; the hub fans out to that user's open streams.
4. The sync engine, send queue, scheduler and bulk/sweep runs all live
   inside the MailboxDO. Its single `alarm()` runs whatever is due and then
   schedules the next wake from `min(next send, next due state, next poll,
   next run chunk, next purge)`.

## Things that are intentionally different (invisible to users)

- The demo mailbox is now durable (deterministic seed 42, anchored to the
  account's creation time) instead of being rebuilt per process.
- `node:dns.promises.lookup` is not implemented in Workers; the
  unsubscribe SSRF check uses `resolve4`/`resolve6` (DNS over HTTPS).
- Convex JWTs (`/api/auth/convex-token`) and the shared-secret server RPC
  are gone entirely — DO/D1 bindings are private to the Worker.
- Background work is crash-resilient: alarms re-arm themselves, and
  `sending` queue rows are requeued on wake.

## Ops

- `npm run dev` — wrangler dev (API + local D1/DO on :8787) + vite on :5173
  (proxies `/api`). Apply D1 migrations with `npm run db:migrate`.
- `npm run deploy` — builds the client and deploys the Worker + assets.
- Secrets: `npx wrangler secret put TIDEPOST_SECRET` (required), plus
  `GOOGLE_CLIENT_ID/SECRET`, `MICROSOFT_CLIENT_ID/SECRET`, optional
  `ANTHROPIC_API_KEY`. See `.env.example`.
- Scale notes: each MailboxDO holds ≤ ~5 MB (capped index), far under the
  10 GB per-object SQLite limit. A 45s poll wakes an object for well under
  a second; at Workers Paid ($5/mo) the included DO/D1/Worker allowances
  cover hundreds of accounts.
