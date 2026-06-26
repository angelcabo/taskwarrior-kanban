# ▌ taskwarrior · board

A live, terminal-homage Kanban board for [Taskwarrior](https://taskwarrior.org/) 3.x.
It reads and writes your real task database through the `task` CLI — so anything the
board does, your terminal sees, and vice-versa. The headline feature is **realtime**:
when an agent (or you) picks up, moves, or finishes a task, the card slides across the
board within a couple hundred milliseconds, no refresh.

> Aesthetic: *phosphor* — true-ink background, JetBrains Mono, phosphor-green + amber
> accents, subtle scanlines and glow. Utilitarian, but alive.

This board is the **window**; the optional companion **[Taskwarrior Symphony](#pairing-with-symphony-the-agent-engine)**
daemon is the **engine** — pair them and the board becomes a live view of autonomous coding
agents working through your backlog.

---

## What it does

- **Live board.** A Server-Sent-Events stream pushes a fresh snapshot whenever the
  Taskwarrior database changes on disk. Cards animate to their new column, briefly glow,
  and a toast names the change (e.g. `codex ▸ active`).
- **Drag to move.** Drag a card to another column to change its `state`. The move is
  optimistic (instant) and confirmed by the next snapshot.
- **Edit everything.** Click a card to open the detail drawer: description, project,
  branch, due date, agent, priority, tags, annotations, and lifecycle actions
  (start / stop / done / delete). Plus a metadata footer with urgency, timestamps, and a
  copyable UUID — and, when paired with Symphony, a **live agent-activity log** that
  streams what the agent is doing on that task in real time.
- **Quick-add.** Press `c` for a centered composer to create a task with state, agent,
  priority, project, branch, due, and tags.
- **Boards & filters.** Define multiple boards (each is a Taskwarrior filter + a set of
  columns mapped to any UDA/attribute), reorder/recolor columns, set swimlanes, and
  manage Taskwarrior **contexts** — all from the UI (`b`).
- **Agent views.** Filter the board by agent (claude / codex / mock / …) and optionally
  break every column into per-agent swimlanes (`s`).

## Data model

The board is driven entirely by your existing Taskwarrior schema — nothing is invented.
The defaults map your UDAs like so:

| UDA / field | Role on the board |
|-------------|-------------------|
| `state` (triage → todo → active → review → done → canceled) | Kanban **columns** |
| `agent` (claude / codex / mock) | Card **owner** + realtime highlight + filter |
| `branch` | Shown on the card / editable |
| `priority` (H / M / L) | Priority dot |
| `project`, `tags`, `due`, annotations, `depends` | Card meta |

`done` and `canceled` are **states** (the tasks stay `status:pending` with a terminal
`state` value) — the board does not run `task done` for those, so your workflow's
semantics are preserved. Boards and column definitions you create in the UI are stored
in `~/.config/taskwarrior-kanban/boards.json`. Contexts are managed via the official
`task context …` commands.

## Architecture

```
 task CLI  ──reads──>  Fastify server (execa, no shell)  ──SSE──>  React board
   ▲                        │  watches taskchampion.sqlite3 (chokidar, 200ms debounce)
   └────────writes──────────┘  re-exports + pushes a snapshot per connection's filter
```

- **server/** — Node + Fastify v5, `tsx` (no build step). Wraps the `task` binary with
  argument arrays (never a shell). One SSE endpoint per board filter; a file watcher
  triggers re-export → snapshot push. Reads use `task <filter> export` (the filter must
  precede `export` on TW 3.4.x).
- **web/** — Vite + React + TypeScript, Tailwind v4 (CSS-first `@theme`), @dnd-kit for
  drag, Motion for animation, Zustand for state. Urgency is bucketed **relative to the
  board** (your `state` urgency coefficients make absolute urgency meaningless across
  columns).

## Requirements

- **Taskwarrior ≥ 3.4** on your `PATH` (`brew install task`) — reads run `task <filter> export`, and 3.4 requires the filter to come *before* `export`
- **Node ≥ 18** and **`pnpm`** (`corepack enable` provides pnpm)
- *(optional — only for the autonomous agent loop)* the companion **Taskwarrior Symphony** daemon (needs **Node ≥ 20**) plus an agent CLI (`claude` / `codex`) on your `PATH`. See [Pairing with Symphony](#pairing-with-symphony-the-agent-engine).

## Run it

```bash
pnpm install

# ── Against your REAL Taskwarrior data ──────────────────────────────
pnpm dev          # server :8787 + web :5173 (open http://localhost:5173)

# ── Against a throwaway demo DB (your real ~/.task is never touched) ─
pnpm seed:demo    # seeds 15 sample tasks into ./.devtask/data
pnpm dev:demo     # same, but TASKDATA/TASKRC point at ./.devtask
pnpm reset:demo   # re-seed a pristine board (+3 agent:mock todos) to re-show the demo

# ── Production (server serves the built SPA + API on one port) ──────
pnpm build        # → web/dist
pnpm start        # open http://localhost:8787
```

`pnpm typecheck` runs both packages.

### A note on safety

- Normal mode (`pnpm dev` / `pnpm start`) operates on your real database through the
  `task` CLI, honoring your `~/.taskrc`. The board never edits `~/.taskrc` itself.
- Demo mode (`pnpm *:demo`) sets `TASKRC`/`TASKDATA` to the local `./.devtask` sandbox —
  use it to explore without any risk to real data.
- The Vite dev server binds to all interfaces (`host: true`) so you can open the board
  from another device on your LAN; drop that from `web/vite.config.ts` if you'd rather
  keep it loopback-only.

## Pairing with Symphony (the agent engine)

This board doesn't run agents — it **renders** them. The autonomous loop is driven by a
companion daemon, **[Taskwarrior Symphony](https://github.com/angelcabo/taskwarrior-symphony)**
(a local implementation of the [OpenAI Symphony spec](https://github.com/openai/symphony)): it
polls Taskwarrior, clones your repo into an
isolated workspace **per task**, runs a coding agent (Claude / Codex) there, and moves each
card across states. Your working copy is never touched — the board just shows it happening, live.

```
   Symphony daemon                Taskwarrior                  this board
   ───────────────                ───────────                  ──────────
   poll → clone repo   ──writes──▶  one store  ◀──reads/SSE──   cards move live,
   → run agent → move state         (source of truth)          drag to re-state
```

**The one rule: the daemon and the board must point at the same Taskwarrior store.** Then the
board reflects whatever the daemon does.

### Watch the full loop (mock agent — safe, no real work)

The `mock` driver simulates an agent: **no agent CLI, no repo, and no real edits required.**
Clone both repos side by side, then:

```bash
# Prereqs: Node ≥ 20, pnpm, Taskwarrior ≥ 3.4.

# ── Terminal A — the engine (Symphony), pointed at THIS board's sandbox store ──
cd /path/to/taskwarrior-symphony
npm install && npm run build
export TASKRC=/path/to/taskwarrior-kanban/.devtask/taskrc
export TASKDATA=/path/to/taskwarrior-kanban/.devtask/data
./scripts/setup-taskwarrior.sh        # add state/agent/branch UDAs to the shared store
./scripts/seed-demo.sh                # 3 agent:mock tasks (simulated, safe)
# mock pacing (≈9s of "work" per task) makes the march watchable, not a 0.8s blip
SYMPHONY_LOG_PRETTY=1 SYMPHONY_MOCK_STEPS=6 SYMPHONY_MOCK_STEP_MS=1500 node dist/index.js start

# ── Terminal B — the window (this board), on that SAME store ──
cd /path/to/taskwarrior-kanban
pnpm install
pnpm dev:demo                         # → http://localhost:5173  (dev:demo points at ./.devtask)
```

Open http://localhost:5173 and watch the cards march **todo → active → review** as the mock
agent processes each one in its own clone. Click any in-flight card to see its **live agent
log** streaming in the detail drawer — the board reads it from Symphony's HTTP API
(`SYMPHONY_TARGET`, default `127.0.0.1:4517`) — or tail a single task from a terminal with
`symphony watch <id>`. To re-run from a clean slate, `pnpm reset:demo` re-seeds a pristine board
plus three fresh `agent:mock` todos.

### Going real

Swap `agent:mock` → `agent:claude` and `export SYMPHONY_REPO_URL=/path/to/your/repo` (the clone
source — read-only, never pushed back). To run against your **real** backlog instead of the
sandbox, drop the `TASKRC`/`TASKDATA` overrides on both sides and scope the daemon with its
`tracker.filter`. **One daemon serves one repo;** run several daemons (each its own
`WORKFLOW.md`, filter, and HTTP port) for several repos. Full engine docs live in Symphony's
`README.md` / `GETTING_STARTED.md`.

> **Do you even need the `.devtask` sandbox?** Only for *writes you want to throw away*. To
> just *view* tasks, a board on your real store with a `project:` filter (or a `task context`)
> is enough — one instance, done. But `seed:demo`, and especially a Symphony daemon, **mutate**
> tasks (`add` / `modify state:` / annotate), and a filter is only a *view*, not a *fence*. A
> separate `TASKDATA` store is a hard wall that structurally can't see or touch your real
> backlog. Use the sandbox when **agents are driving**; use a `project:` filter on your real
> store when you just want to **look**.

## Keyboard

| Key | Action |
|-----|--------|
| `c` / `n` | New task (composer) |
| `/` | Focus search |
| `b` | Boards & filters manager |
| `s` | Toggle agent swimlanes |
| `?` | Shortcut help |
| `Esc` | Close the topmost overlay |

## License

MIT — see [LICENSE](./LICENSE).
