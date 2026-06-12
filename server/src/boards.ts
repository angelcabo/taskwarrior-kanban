// Board persistence. Boards are a UI concept (column layout over a Taskwarrior
// filter), not stored in Taskwarrior itself, so we keep them in a small JSON
// file under the XDG config dir. On first read we synthesize a sensible default
// board from the live schema.
import { randomUUID } from 'node:crypto'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { boardsFile, configDir } from './config.js'
import { getSchema } from './task.js'
import type { Board, BoardColumn, Schema } from './types.js'

interface BoardStore {
  boards: Board[]
  activeBoardId: string | null
}

const EMPTY_STORE: BoardStore = { boards: [], activeBoardId: null }

async function readStore(): Promise<BoardStore> {
  try {
    const text = await readFile(boardsFile(), 'utf8')
    const parsed = JSON.parse(text) as Partial<BoardStore>
    return {
      boards: Array.isArray(parsed.boards) ? parsed.boards : [],
      activeBoardId: typeof parsed.activeBoardId === 'string' ? parsed.activeBoardId : null,
    }
  } catch (err: unknown) {
    if ((err as NodeJS.ErrnoException)?.code === 'ENOENT') return { ...EMPTY_STORE }
    // Corrupt file: treat as empty rather than crashing the API.
    console.error('[boards] failed to read store, starting empty:', err)
    return { ...EMPTY_STORE }
  }
}

async function writeStore(store: BoardStore): Promise<void> {
  await mkdir(configDir(), { recursive: true })
  await writeFile(boardsFile(), `${JSON.stringify(store, null, 2)}\n`, 'utf8')
}

/** Build the default single board from the current schema. */
function defaultBoard(schema: Schema): Board {
  const columns: BoardColumn[] = schema.states.map((state) => ({
    id: state,
    label: state.toUpperCase(),
    match: state,
  }))

  // If there is no `triage` state, prepend a synthetic column to hold
  // state-less tasks. When `triage` exists (the normal case) those tasks are
  // bucketed client-side and no extra column is needed.
  if (!schema.states.includes('triage')) {
    columns.unshift({ id: 'inbox', label: 'TRIAGE', match: '' })
  }

  return {
    id: 'state-board',
    name: 'Board',
    filter: 'status:pending',
    columnField: 'state',
    columns,
    sort: 'urgency',
    groupBy: null,
  }
}

/**
 * Read the store, synthesizing and persisting a default board if empty.
 */
async function ensureStore(): Promise<BoardStore> {
  const store = await readStore()
  if (store.boards.length === 0) {
    const schema = await getSchema()
    const board = defaultBoard(schema)
    const seeded: BoardStore = { boards: [board], activeBoardId: board.id }
    await writeStore(seeded)
    return seeded
  }
  return store
}

/** List all boards plus the active board id. */
export async function listBoards(): Promise<BoardStore> {
  return ensureStore()
}

/** Get a single board by id, or null. */
export async function getBoard(id: string): Promise<Board | null> {
  const { boards } = await ensureStore()
  return boards.find((b) => b.id === id) ?? null
}

type BoardInput = Omit<Board, 'id'> & { id?: string }

function coerceBoard(input: BoardInput, id: string): Board {
  return {
    id,
    name: input.name,
    filter: input.filter,
    columnField: input.columnField,
    columns: input.columns,
    sort: input.sort,
    groupBy: input.groupBy ?? null,
  }
}

/** Create a new board. Generates an id when one is not supplied. */
export async function createBoard(input: BoardInput): Promise<Board> {
  const store = await ensureStore()
  const id = input.id?.trim() || randomUUID()
  const board = coerceBoard(input, id)
  store.boards.push(board)
  if (store.activeBoardId === null) store.activeBoardId = board.id
  await writeStore(store)
  return board
}

/** Update an existing board by id. Throws if not found. */
export async function updateBoard(id: string, input: BoardInput): Promise<Board> {
  const store = await ensureStore()
  const idx = store.boards.findIndex((b) => b.id === id)
  if (idx === -1) throw new Error(`Board ${id} not found`)
  const board = coerceBoard({ ...input, id }, id)
  store.boards[idx] = board
  await writeStore(store)
  return board
}

/** Delete a board by id. Clears the active id if it pointed at this board. */
export async function deleteBoard(id: string): Promise<void> {
  const store = await ensureStore()
  store.boards = store.boards.filter((b) => b.id !== id)
  if (store.activeBoardId === id) {
    store.activeBoardId = store.boards[0]?.id ?? null
  }
  await writeStore(store)
}

/** Set the active board id (may be null). */
export async function setActiveBoard(id: string | null): Promise<void> {
  const store = await ensureStore()
  store.activeBoardId = id
  await writeStore(store)
}
