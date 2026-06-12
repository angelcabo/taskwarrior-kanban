#!/usr/bin/env bash
# Seed the scratch Taskwarrior DB (.devtask/data) with demo tasks for a fictional
# "acme" product, so the board shows realistic-looking work across every column.
# Safe: writes only to the local sandbox, never touches your real ~/.task.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
export TASKRC="$ROOT/.devtask/taskrc"
export TASKDATA="$ROOT/.devtask/data"

rm -rf "$TASKDATA"
mkdir -p "$TASKDATA"

add() {
  local desc="$1"; shift
  task rc.confirmation=no rc.hooks=off add "$desc" "$@" >/dev/null
}

add "Import legacy customer records from the old CSV export"  project:acme.billing priority:H state:triage +blocked
add "Triage flaky checkout errors reported overnight"         project:acme.web     priority:M state:triage
add "Decide cache eviction policy for the product catalog"    project:acme.search  priority:L state:triage +followup

add "Fix OAuth redirect loop on login"                        project:acme.web     priority:M state:todo branch:fix/oauth-redirect
add "Document the public REST API v2"                         project:acme.docs    priority:L state:todo
add "Migrate the job queue to the new message broker"         project:acme.infra   priority:M state:todo +next
add "Add coupon-code handling to the cart"                    project:acme.api     priority:M state:todo +coordination

add "Paginate the search results endpoint"                    project:acme.search  priority:H state:active agent:claude branch:feat/search-pagination
add "Add retry/backoff to the payment webhook handler"        project:acme.billing priority:M state:active agent:codex  branch:feat/webhook-retry
add "Rebuild the product index after the schema change"       project:acme.search  priority:H state:active agent:claude branch:fix/reindex-catalog

add "Write integration tests for the cart service"            project:acme.api     priority:L state:review agent:claude branch:test/cart-service +verify
add "Wire live order count on the dashboard"                  project:acme.web     priority:H state:review agent:codex  branch:feat/live-order-count

add "Clean up unused build scripts"                           project:acme.infra   priority:L state:done   agent:mock
add "Ship invoice PDF export v1"                              project:acme.billing priority:M state:done   agent:claude

add "Cancel deprecated v1 checkout endpoints"                 project:acme.web     priority:L state:canceled

# A couple of annotations + a due date to exercise metadata rendering.
OAUTH=$(task rc.hooks=off status:pending /OAuth/ export | jq -r '.[0].uuid')
task rc.confirmation=no rc.hooks=off "$OAUTH" annotate "Repro: clear cookies, sign in, observe redirect loop" >/dev/null
task rc.confirmation=no rc.hooks=off "$OAUTH" modify due:eod >/dev/null

PAGINATION=$(task rc.hooks=off status:pending /Paginate/ export | jq -r '.[0].uuid' 2>/dev/null || true)
[ -n "${PAGINATION:-}" ] && task rc.confirmation=no rc.hooks=off "$PAGINATION" annotate "Design notes: docs/search-pagination.md" >/dev/null || true

echo "Seeded $(task rc.hooks=off status:pending count) pending tasks into $TASKDATA"
