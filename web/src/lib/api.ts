// REST + SSE client. Same-origin in dev thanks to the Vite /api proxy.
import type { Board, ContextDef, Schema, Snapshot, Task } from './types'

const BASE = '/api'

async function req<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(BASE + path, {
    headers: { 'content-type': 'application/json' },
    ...init,
  })
  const text = await res.text()
  const body = text ? JSON.parse(text) : {}
  if (!res.ok) {
    throw new Error(body?.error || `${res.status} ${res.statusText}`)
  }
  return body as T
}

export interface TaskInput {
  description: string
  project?: string
  priority?: string
  state?: string
  agent?: string
  branch?: string
  due?: string
  tags?: string[]
}

export interface TaskPatch {
  description?: string
  project?: string
  priority?: string
  state?: string
  agent?: string
  branch?: string
  due?: string
  addTags?: string[]
  removeTags?: string[]
}

export const api = {
  health: () => req<{ ok: boolean }>('/health'),
  schema: () => req<Schema>('/schema'),

  tasks: (filter = 'status:pending') =>
    req<{ tasks: Task[]; generatedAt: number }>(
      `/tasks?filter=${encodeURIComponent(filter)}`,
    ),

  create: (input: TaskInput) =>
    req<{ task: Task }>('/tasks', {
      method: 'POST',
      body: JSON.stringify(input),
    }),

  patch: (uuid: string, patch: TaskPatch) =>
    req<{ task: Task }>(`/tasks/${uuid}`, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    }),

  move: (uuid: string, state: string) =>
    req<{ task: Task }>(`/tasks/${uuid}/move`, {
      method: 'POST',
      body: JSON.stringify({ state }),
    }),

  start: (uuid: string) => req<{ task: Task }>(`/tasks/${uuid}/start`, { method: 'POST' }),
  stop: (uuid: string) => req<{ task: Task }>(`/tasks/${uuid}/stop`, { method: 'POST' }),
  done: (uuid: string) => req<{ task: Task }>(`/tasks/${uuid}/done`, { method: 'POST' }),
  remove: (uuid: string) =>
    req<{ ok: boolean; uuid: string }>(`/tasks/${uuid}/delete`, { method: 'POST' }),

  /** Apply one patch to many tasks (or delete them) in a single command. */
  batchPatch: (uuids: string[], fields: TaskPatch) =>
    req<{ ok: boolean; count: number }>('/tasks/batch', {
      method: 'POST',
      body: JSON.stringify({ uuids, op: 'patch', fields }),
    }),
  batchDelete: (uuids: string[]) =>
    req<{ ok: boolean; count: number }>('/tasks/batch', {
      method: 'POST',
      body: JSON.stringify({ uuids, op: 'delete' }),
    }),

  annotate: (uuid: string, text: string) =>
    req<{ task: Task }>(`/tasks/${uuid}/annotations`, {
      method: 'POST',
      body: JSON.stringify({ text }),
    }),
  denotate: (uuid: string, text: string) =>
    req<{ task: Task }>(`/tasks/${uuid}/annotations`, {
      method: 'DELETE',
      body: JSON.stringify({ text }),
    }),

  contexts: () => req<{ active: string | null; defined: ContextDef[] }>('/contexts'),
  defineContext: (name: string, filter: string) =>
    req<{ ok: boolean }>('/contexts', {
      method: 'POST',
      body: JSON.stringify({ name, filter }),
    }),
  activateContext: (name: string | null) =>
    req<{ ok: boolean; active: string | null }>('/contexts/activate', {
      method: 'POST',
      body: JSON.stringify({ name }),
    }),
  deleteContext: (name: string) =>
    req<{ ok: boolean }>(`/contexts/${encodeURIComponent(name)}`, { method: 'DELETE' }),

  boards: () => req<{ boards: Board[]; activeBoardId: string | null }>('/boards'),
  createBoard: (board: Board) =>
    req<{ board: Board }>('/boards', { method: 'POST', body: JSON.stringify(board) }),
  updateBoard: (board: Board) =>
    req<{ board: Board }>(`/boards/${board.id}`, {
      method: 'PUT',
      body: JSON.stringify(board),
    }),
  deleteBoard: (id: string) =>
    req<{ ok: boolean }>(`/boards/${id}`, { method: 'DELETE' }),
  setActiveBoard: (id: string) =>
    req<{ ok: boolean }>('/boards/active', {
      method: 'POST',
      body: JSON.stringify({ id }),
    }),
}

export type StreamStatus = 'connecting' | 'open' | 'closed'

/**
 * Subscribe to the live snapshot stream for a given filter.
 * Returns a disposer. Auto-reconnects with backoff via EventSource semantics.
 */
export function openStream(
  filter: string,
  onSnapshot: (snap: Snapshot) => void,
  onStatus: (s: StreamStatus) => void,
): () => void {
  let es: EventSource | null = null
  let closed = false

  const connect = () => {
    if (closed) return
    onStatus('connecting')
    es = new EventSource(`${BASE}/stream?filter=${encodeURIComponent(filter)}`)
    es.addEventListener('open', () => onStatus('open'))
    es.addEventListener('snapshot', (ev) => {
      try {
        onSnapshot(JSON.parse((ev as MessageEvent).data))
      } catch {
        /* ignore malformed frame */
      }
    })
    es.addEventListener('error', () => {
      onStatus('connecting')
      // EventSource reconnects automatically; nothing else to do.
    })
  }

  connect()

  return () => {
    closed = true
    onStatus('closed')
    es?.close()
  }
}
