// Client for the Taskwarrior Symphony daemon's per-task event stream.
//
// Symphony is a SEPARATE local service (the agent engine), not the board's own
// server — so requests go through the Vite `/symphony` proxy (see vite.config.ts;
// its target is the SYMPHONY_TARGET env var, default http://127.0.0.1:4517). The
// daemon also sends permissive CORS, so a direct absolute URL works too (prod).

const BASE = '/symphony'

/** One event from a task's stream. `kind` + `data` are the stable contract; `message` is cosmetic. */
export interface StreamEvent {
  seq: number
  ts: number
  kind: string
  data?: Record<string, unknown>
  message?: string
}

export type TaskStreamStatus = 'connecting' | 'open' | 'ended' | 'error'

/**
 * Subscribe to one task's live event stream. Returns a disposer.
 *
 * Unlike the board's snapshot SSE, this does NOT auto-reconnect: a task has a
 * stream only while running (or ~5 min after), so a 404/drop closes cleanly and
 * the panel offers a manual reconnect rather than looping on a missing stream.
 */
export function openTaskStream(
  uuid: string,
  on: { event: (e: StreamEvent) => void; status: (s: TaskStreamStatus) => void },
): () => void {
  let closed = false
  on.status('connecting')
  const es = new EventSource(`${BASE}/api/v1/${encodeURIComponent(uuid)}/stream`)

  const parse = (ev: MessageEvent) => {
    try {
      on.event(JSON.parse(ev.data) as StreamEvent)
    } catch {
      /* ignore a malformed frame */
    }
  }

  es.addEventListener('open', () => on.status('open'))
  es.onmessage = parse
  es.addEventListener('end', (ev) => {
    parse(ev as MessageEvent)
    closed = true
    on.status('ended')
    es.close()
  })
  es.addEventListener('error', () => {
    if (closed) return
    closed = true
    on.status('error')
    es.close()
  })

  return () => {
    closed = true
    es.close()
  }
}
