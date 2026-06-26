import { useEffect, useRef, useState } from 'react'
import { RotateCw } from 'lucide-react'
import type { Task } from '../lib/types'
import { openTaskStream, type StreamEvent, type TaskStreamStatus } from '../lib/symphony'

const MAX_LINES = 300

/** Phosphor-palette accent per event kind. */
function kindColor(kind: string): string {
  switch (kind) {
    case 'turn_failed':
    case 'terminating':
    case 'retry_scheduled':
      return 'var(--color-coral)'
    case 'dispatched':
    case 'session_started':
    case 'turn_completed':
    case 'finalized':
      return 'var(--color-phosphor)'
    case 'tool_call':
      return 'var(--color-amber)'
    case 'end':
      return 'var(--color-fg-faint)'
    default:
      return 'var(--color-fg-dim)'
  }
}

const STATUS_META: Record<TaskStreamStatus, { color: string; label: string }> = {
  connecting: { color: 'var(--color-amber)', label: 'connecting…' },
  open: { color: 'var(--color-phosphor)', label: 'live' },
  ended: { color: 'var(--color-fg-faint)', label: 'ended' },
  error: { color: 'var(--color-coral)', label: 'unavailable' },
}

const hhmmss = (ts: number): string => new Date(ts).toTimeString().slice(0, 8)

/**
 * Live per-task agent log, streamed from the Symphony daemon. Mounted with
 * `key={task.uuid}` so each task gets a fresh connection/state. Auto-connects
 * for tasks an agent is actively working; otherwise it's a one-click opt-in.
 */
export function AgentLog({ task }: { task: Task }) {
  const [events, setEvents] = useState<StreamEvent[]>([])
  const [status, setStatus] = useState<TaskStreamStatus>('connecting')
  const [connect, setConnect] = useState(task.active)
  const [gen, setGen] = useState(0)
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!connect) return
    setEvents([])
    setStatus('connecting')
    return openTaskStream(task.uuid, {
      event: (e) => setEvents((prev) => (prev.length >= MAX_LINES ? [...prev.slice(1), e] : [...prev, e])),
      status: setStatus,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [connect, gen])

  useEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [events])

  const meta = connect ? STATUS_META[status] : { color: 'var(--color-fg-faint)', label: 'not connected' }
  const showConnect = !connect || status === 'ended' || status === 'error'

  return (
    <div>
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-[10px] uppercase tracking-[0.14em] text-fg-faint">agent activity</span>
        <span className="inline-flex items-center gap-1 text-[10px]" style={{ color: meta.color }}>
          <span
            className="h-1.5 w-1.5 rounded-full"
            style={{ background: meta.color, boxShadow: connect && status === 'open' ? `0 0 6px ${meta.color}` : undefined }}
          />
          {meta.label}
        </span>
        {showConnect && (
          <button
            onClick={() => {
              setConnect(true)
              setGen((g) => g + 1)
            }}
            className="ml-auto inline-flex items-center gap-1 text-[10px] text-fg-faint transition hover:text-phosphor"
            title="connect to the live agent stream"
          >
            <RotateCw size={11} strokeWidth={1.6} />
            {connect ? 'reconnect' : 'watch'}
          </button>
        )}
      </div>

      <div
        ref={scrollRef}
        className="max-h-[200px] overflow-y-auto rounded-[4px] border border-line bg-abyss/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed"
      >
        {events.length === 0 ? (
          <div className="py-3 text-center text-[11px] text-fg-faint">
            {!connect
              ? 'not connected'
              : status === 'error'
                ? 'no live stream — is the Symphony daemon running?'
                : status === 'connecting'
                  ? 'connecting…'
                  : 'waiting for events…'}
          </div>
        ) : (
          events.map((e) => (
            <div key={e.seq} className="flex gap-2">
              <span className="shrink-0 text-fg-faint/70">{hhmmss(e.ts)}</span>
              <span
                className="inline-block shrink-0 truncate"
                style={{ width: 116, color: kindColor(e.kind) }}
                title={e.kind}
              >
                {e.kind}
              </span>
              <span className="min-w-0 flex-1 break-words text-fg-dim">{e.message}</span>
            </div>
          ))
        )}
      </div>
    </div>
  )
}
