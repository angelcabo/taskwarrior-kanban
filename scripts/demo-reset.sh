#!/usr/bin/env bash
# Reset the demo to its pristine starting state, ready to re-show to someone.
# Reseeds the 15 "acme" tasks across every column, then adds 3 fresh
# `agent:mock` tasks in `todo` for the Symphony daemon to pick up and march.
#
# Safe: only touches the ./.devtask sandbox — never your real ~/.task.
# You do NOT need to restart the board: its file-watcher stat-polls, so realtime
# survives this reset (the seed recreates the data dir wholesale).
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export TASKRC="$ROOT/.devtask/taskrc"
export TASKDATA="$ROOT/.devtask/data"

# 1) Pristine board: the 15 acme tasks (this wipes + reseeds the sandbox).
bash "$ROOT/scripts/seed-demo.sh"

# 2) Three fresh mock tasks in `todo` for the daemon to work through. New UUIDs
#    each run, so the daemon treats them as new work and marches them.
add() { task rc.confirmation=no rc.hooks=off add "$@" >/dev/null; }
add "Add a /health endpoint that returns 200 OK"     state:todo agent:mock priority:H +backend
add "Document the configuration layer in the README" state:todo agent:mock priority:L +docs
add "Investigate flaky integration test"             state:todo agent:mock priority:M +ci

mock_todo=$(task rc.verbose=nothing agent:mock state:todo count)
pending=$(task rc.verbose=nothing status:pending count)
echo "Demo reset: $pending pending tasks ($mock_todo mock in todo). Board stays live — no restart needed."
