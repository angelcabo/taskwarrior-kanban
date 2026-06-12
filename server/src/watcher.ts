// A tiny change bus. Combines explicit `markDirty()` calls made right after
// mutations with a chokidar watch of the TaskChampion sqlite files, so SSE
// clients refresh promptly whether the change came through this server or an
// external `task` invocation. Emits are debounced to coalesce write bursts
// (sqlite + WAL + SHM all change together).
import path from 'node:path'
import chokidar, { type FSWatcher } from 'chokidar'

type ChangeListener = () => void

const listeners = new Set<ChangeListener>()
let debounceTimer: NodeJS.Timeout | null = null
const DEBOUNCE_MS = 200

let watcher: FSWatcher | null = null

function emit(): void {
  for (const cb of listeners) {
    try {
      cb()
    } catch (err) {
      // A misbehaving listener must not take down the bus.
      console.error('[watcher] listener error:', err)
    }
  }
}

/** Subscribe to change events. Returns an unsubscribe function. */
export function onChange(cb: ChangeListener): () => void {
  listeners.add(cb)
  return () => {
    listeners.delete(cb)
  }
}

/**
 * Signal that the task data changed. Debounced (~200ms) so a burst of writes
 * results in a single refresh. Call this after every mutation.
 */
export function markDirty(): void {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(() => {
    debounceTimer = null
    emit()
  }, DEBOUNCE_MS)
}

/**
 * Watch the TaskChampion sqlite files under `dataLocation` and mark the bus
 * dirty on any add/change. Idempotent-ish: replaces any prior watcher.
 */
export async function startWatching(dataLocation: string): Promise<void> {
  if (watcher) {
    await watcher.close().catch(() => {})
    watcher = null
  }

  const base = path.join(dataLocation, 'taskchampion.sqlite3')
  const targets = [base, `${base}-wal`, `${base}-shm`]

  watcher = chokidar.watch(targets, {
    ignoreInitial: true,
    // The WAL/SHM files are written very frequently; let chokidar settle.
    awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 40 },
  })

  watcher.on('add', markDirty)
  watcher.on('change', markDirty)
  watcher.on('unlink', markDirty)
  watcher.on('error', (err) => console.error('[watcher] fs error:', err))
}

/** Stop watching (used on shutdown). */
export async function stopWatching(): Promise<void> {
  if (debounceTimer) {
    clearTimeout(debounceTimer)
    debounceTimer = null
  }
  if (watcher) {
    await watcher.close().catch(() => {})
    watcher = null
  }
}
