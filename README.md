# Tidepost

An experiment: what if an email client worked like an agent workbench?

Tidepost is a single-page prototype of an email client whose interaction model is borrowed from open-source agent development environments such as [Orca](https://www.onorca.dev) and [T3 Code](https://github.com/pingdotgg/t3code). Threads behave like agent sessions: each one has a live status, an assistant proposes plans you approve step by step, drafts arrive as diffs against your rough notes, and bulk work runs in the background until you review it.

> **Status: experiment / prototype.** There is no real email here. No backend, no mail server, no accounts, no network calls. Every person, thread, company and amount is made-up example data, the "assistant" is scripted, and sending is simulated: a confirmed send only appends your message to the thread on the page.

## Why

Ryan Dahl [observed](https://x.com/rough__sea/status/2119288646671155217) that talking to a coding agent is more like email than IRC: interactions are few and far between, you quote the agent's latest text, answer several questions at once and address different topics in one reply.

[My take](https://x.com/sankalpgotbaned/status/2119760277550112809) is the reverse: what is more likely to happen is that email clients become more agent-like. Agent tools have spent the last year or two working out how a person supervises asynchronous work they did not do themselves: status at a glance, plan before act, review as a diff, checkpoints, background runs. That is most of what triaging an inbox is. Tidepost is a quick sketch of that idea.

## Patterns borrowed

| Pattern | Source | In Tidepost |
| --- | --- | --- |
| Status glyphs and a "Needs you" count | [Orca: agents and sessions](https://www.onorca.dev/docs/model/agents-sessions) | Each thread shows needs you (`?`), working (spinner), done (`●`) or idle (`○`); the top bar filters by state. |
| Projects holding threads; pinned, snoozed, settled shelves | [T3 Code: thread sidebar](https://github.com/pingdotgg/t3code/blob/main/docs/user/thread-sidebar.md) | Spaces (Home renovation, Hiring, Money, ...) hold threads; Settle means done for now. |
| Parallel agents in their own worktrees | [Orca: worktrees](https://www.onorca.dev/docs/model/worktrees) | Bulk jobs (newsletter triage, follow-up sweep) run in the background with progress, then wait for review. |
| Race agents on one task, pick the winner | [Orca: parallel agents](https://www.onorca.dev/docs/recipes/parallel-agents) | Every draft comes in three variants (Brief, Warm, Firm); you pick one. |
| Plan before act | [Cline: Plan & Act](https://docs.cline.bot/core-workflows/plan-and-act) | `/plan` proposes steps; each needs Approve before it runs. |
| Permission modes in the composer | [T3 Code: permission modes](https://github.com/pingdotgg/t3code/blob/main/docs/user/permission-modes.md) | Ask (read-only), Plan, Draft; sending is locked to always-confirm. |
| Review changes, keep or reject hunks | [Zed: agent panel](https://zed.dev/docs/ai/agent-panel) | The assistant's edits to your rough reply show as a diff; keep or reject each edit. |
| Checkpoints and `/undo` | [Cline: checkpoints](https://docs.cline.bot/core-workflows/checkpoints), [OpenCode TUI](https://opencode.ai/docs/tui/) | Every draft decision is a checkpoint you can restore; `/undo` steps back one. |
| Slash commands and `@` references | [OpenCode TUI](https://opencode.ai/docs/tui/) | `/summarize /plan /draft /schedule /followup /triage /undo`; `@` adds people, files, calendar as context. |
| Cite in composer | [T3 Code: composer](https://github.com/pingdotgg/t3code/blob/main/docs/user/composer.md) | Cite any paragraph of an email, then answer several asks in one instruction. |
| Collapsed activity log | [T3 Code: activity log](https://github.com/pingdotgg/t3code/blob/main/docs/user/activity-log.md) | Each assistant turn folds its tool work into one line you can expand. |
| Queue or steer follow-ups | [T3 Code: keybindings](https://github.com/pingdotgg/t3code/blob/main/docs/user/keybindings.md) | Messages sent while the assistant is working queue up; "Steer now" pushes one in. |
| Keyboard-first navigation | [OpenCode](https://opencode.ai/docs/tui/), [T3 Code](https://github.com/pingdotgg/t3code/blob/main/docs/user/keybindings.md) keybindings | `j` / `k` between threads, `/` for commands, `e` to settle, `Tab` to complete. |

## Tour

The layout is three columns: a sidebar of threads grouped by space, the open thread with its assistant conversation and composer, and a right rail with the thread's open asks and background runs.

1. **Answer several asks at once.** Open Priya's kitchen-quote thread (selected on load). Click **Cite** on two or three paragraphs, type your answers, press Enter. The assistant turn notes how many quoted points it is answering.
2. **Plan, then approve.** Type `/plan` (or press `/` anywhere outside the composer). The assistant streams its activity, then proposes steps: draft a reply, hold a calendar slot, file the attachment. Approve or reject each one, or use **Approve all**. Nothing runs until you approve it.
3. **Review the draft as a diff.** Approving a draft step produces a reply built from your rough notes. Switch between the Brief, Warm and Firm variants. Lines prefixed `−` are your words, `+` the assistant's edits; keep or reject each hunk. Every decision is a checkpoint you can click back to, and `/undo` restores the previous one.
4. **Send behind an explicit confirm.** **Approve & send…** is disabled until every edit is decided, then shows the final text and asks again. **Confirm send** appends the message to the thread and marks the asks answered. Nothing leaves the page.
5. **Watch background work.** A `/triage 40 newsletters` run starts on load. When it reaches review, **Apply** adds a new "Needs you" thread with the three newsletters that actually need a decision. **Start /followup sweep on Hiring** runs a second job the same way.
6. **Queue and steer.** Send a message while a thread is working and it queues under the composer; **Steer now** injects it, **Remove** drops it.
7. **Shelves.** Pin, Snooze or Settle the open thread from its header. Snoozed and settled threads collapse at the bottom of the sidebar.

### Composer modes

| Mode | What plain text does |
| --- | --- |
| Ask | Read-only. The assistant summarizes; nothing changes. |
| Plan | Proposes a plan you approve step by step (default). |
| Draft | Turns your rough reply into a draft you review as a diff. |

Sending is not a mode. It always asks you.

### Slash commands

| Command | What it does |
| --- | --- |
| `/summarize` | Summarize the thread and list its open asks. |
| `/plan` | Propose next steps; nothing runs until you approve. |
| `/draft` | Edit your rough reply into a draft you review as a diff. |
| `/schedule` | Find a slot and hold it (tentative, local only). |
| `/followup` | Draft a nudge and set a reminder. |
| `/triage` | Label, file attachments, pin until answered. |
| `/undo` | Restore the previous draft checkpoint. |

Typing `@` suggests people, files, the calendar or a space to add as context (`@Priya Nair`, `@quote_v2.pdf`, `@calendar`, ...).

### Keyboard shortcuts

Click inside the client first so it has focus.

| Key | Action |
| --- | --- |
| `j` / `k` | Next / previous thread |
| `/` | Open the command list in the composer |
| `e` | Settle the current thread |
| `Tab` | Complete the highlighted `/` command or `@` reference |
| `Enter` | Run (or queue, while the assistant is working) |
| `Shift+Enter` | New line |
| `Esc` | Leave the composer |

## Running it

Requires Node.js 20.19+ or 22.12+ (Vite 8).

```sh
npm install
npm run dev      # http://localhost:5173
npm run build    # type-check and build to dist/
npm run preview  # serve the production build
```

## Project layout

```
index.html
src/
  main.tsx    entry point
  App.tsx     the whole prototype: example data, scripted assistant, UI
  kit.tsx     small page components (Page, Section, Table, Segmented, Button, ...) and theme tokens
  index.css   light/dark color variables
```

The prototype began as an interactive page and was ported to a plain Vite + React + TypeScript app. `kit.tsx` contains minimal local versions of the components that page used; the look follows the system light/dark setting.

## Not in scope

- Real mail (IMAP, JMAP, Gmail or any other API).
- A real model. The assistant's replies, plans and drafts are scripted per thread.
- Persistence. Reloading the page resets everything.
- Accessibility and mobile layout beyond the basics.

## License

[MIT](LICENSE) © 2026 Sankalp Mukim
