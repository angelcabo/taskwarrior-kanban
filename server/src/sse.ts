// Server-Sent Events endpoint. Each connection carries its own Taskwarrior
// filter; on connect we push an initial snapshot, then push a fresh snapshot
// whenever the change bus fires. A heartbeat comment keeps proxies from
// closing an idle stream.
import type { FastifyReply, FastifyRequest } from 'fastify'
import { exportTasks } from './task.js'
import { onChange } from './watcher.js'
import type { Snapshot } from './types.js'

const HEARTBEAT_MS = 25_000
const DEFAULT_FILTER = 'status:pending'

/** Write a single SSE event frame. */
function writeEvent(reply: FastifyReply, event: string, data: unknown): void {
  reply.raw.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
}

/** Build a snapshot payload for a filter. */
async function snapshot(filter: string): Promise<Snapshot> {
  const tasks = await exportTasks(filter)
  return { tasks, generatedAt: Date.now() }
}

/**
 * Handle `GET /api/stream?filter=`. Hijacks the raw socket and streams
 * `snapshot` events for this connection's filter until the client disconnects.
 */
export async function handleStream(req: FastifyRequest, reply: FastifyReply): Promise<void> {
  const query = req.query as { filter?: string }
  const filter = query.filter?.trim() || DEFAULT_FILTER

  reply.raw.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  })
  reply.hijack()

  let closed = false

  // Push a snapshot for this connection's filter. Swallows errors (e.g. a
  // transient export failure) so one bad refresh doesn't kill the stream.
  const push = async (): Promise<void> => {
    if (closed) return
    try {
      const snap = await snapshot(filter)
      if (!closed) writeEvent(reply, 'snapshot', snap)
    } catch (err) {
      if (!closed) writeEvent(reply, 'error', { message: (err as Error).message })
    }
  }

  // Initial snapshot.
  await push()

  // Refresh on any change. The bus is already debounced.
  const unsubscribe = onChange(() => {
    void push()
  })

  // Heartbeat comment line to keep the connection alive through proxies.
  const heartbeat = setInterval(() => {
    if (!closed) reply.raw.write(':\n\n')
  }, HEARTBEAT_MS)

  const cleanup = (): void => {
    if (closed) return
    closed = true
    clearInterval(heartbeat)
    unsubscribe()
  }

  req.raw.on('close', cleanup)
  req.raw.on('error', cleanup)
}
