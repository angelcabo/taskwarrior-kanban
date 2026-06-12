import { motion } from 'motion/react'
import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { ArrowDown, ArrowUp, Check, Plus, Trash2, X } from 'lucide-react'
import { activeBoard, useStore } from '../lib/store'
import { api } from '../lib/api'
import type { Board, BoardColumn, SortKey } from '../lib/types'
import { stateAccent } from '../lib/theme'
import { ConfirmButton, Field, Menu, TextInput, cx, hexA, useDismiss } from './ui'

const slug = (s: string) =>
  s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'col'

const SORTS: { value: SortKey; label: string }[] = [
  { value: 'urgency', label: 'urgency ↓' },
  { value: 'due', label: 'due date ↑' },
  { value: 'priority', label: 'priority ↓' },
  { value: 'modified', label: 'modified ↓' },
  { value: 'entry', label: 'created ↓' },
]

export function BoardManager() {
  const close = () => useStore.getState().setBoardManagerOpen(false)
  const [tab, setTab] = useState<'boards' | 'filters'>('boards')
  const ref = useDismiss(true, close)

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-abyss/60 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
      />
      <motion.div
        className="fixed left-1/2 top-1/2 z-40 w-[min(760px,94vw)] -translate-x-1/2 -translate-y-1/2"
        initial={{ opacity: 0, y: -12, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 380, damping: 34 }}
      >
        <div
          ref={ref}
          className="flex h-[72vh] max-h-[640px] flex-col overflow-hidden rounded-[8px] border border-line-strong bg-ink/97 shadow-[0_30px_90px_-24px_rgba(0,0,0,0.92)]"
        >
          <div className="flex items-center gap-1 border-b border-line px-3 py-2">
            <Tab active={tab === 'boards'} onClick={() => setTab('boards')}>
              boards
            </Tab>
            <Tab active={tab === 'filters'} onClick={() => setTab('filters')}>
              filters &amp; contexts
            </Tab>
            <button
              onClick={close}
              className="ml-auto flex h-7 w-7 items-center justify-center rounded-[4px] text-fg-faint hover:bg-panel-hi hover:text-fg"
            >
              <X size={15} strokeWidth={1.6} />
            </button>
          </div>
          {tab === 'boards' ? <BoardsTab /> : <FiltersTab />}
        </div>
      </motion.div>
    </>
  )
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={cx(
        'h-7 rounded-[4px] px-3 text-[11px] uppercase tracking-[0.14em] transition',
        active ? 'bg-panel-hi text-phosphor' : 'text-fg-dim hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

function BoardsTab() {
  const boards = useStore((s) => s.boards)
  const activeId = useStore((s) => s.activeBoardId)
  const schema = useStore((s) => s.schema)
  const setBoards = useStore((s) => s.setBoards)
  const setActiveBoard = useStore((s) => s.setActiveBoard)
  const notify = useStore((s) => s.notify)

  const [selectedId, setSelectedId] = useState<string | null>(activeId)
  const [draft, setDraft] = useState<Board | null>(null)

  const selected = useMemo(() => boards.find((b) => b.id === selectedId) ?? boards[0] ?? null, [boards, selectedId])
  useEffect(() => {
    setDraft(selected ? structuredClone(selected) : null)
  }, [selected])

  const isNew = draft ? !boards.some((b) => b.id === draft.id) : false
  const dirty = draft && selected ? JSON.stringify(draft) !== JSON.stringify(selected) : !!draft

  async function refresh(selectId?: string) {
    const res = await api.boards()
    setBoards(res.boards, res.activeBoardId)
    if (selectId) setSelectedId(selectId)
  }

  function newBoard() {
    if (!schema) return
    const id = `board-${Date.now().toString(36)}`
    const b: Board = {
      id,
      name: 'New board',
      filter: 'status:pending',
      columnField: 'state',
      sort: 'urgency',
      groupBy: null,
      columns: schema.states.map((s) => ({ id: s, label: s.toUpperCase(), match: s })),
    }
    setSelectedId(id)
    setDraft(b)
  }

  async function save() {
    if (!draft) return
    try {
      if (isNew) await api.createBoard(draft)
      else await api.updateBoard(draft)
      await refresh(draft.id)
      notify('board saved', 'var(--color-phosphor)')
    } catch (e) {
      notify((e as Error).message)
    }
  }

  async function del() {
    if (!draft || isNew) return
    try {
      await api.deleteBoard(draft.id)
      await refresh()
      setSelectedId(null)
    } catch (e) {
      notify((e as Error).message)
    }
  }

  function patchCol(i: number, p: Partial<BoardColumn>) {
    if (!draft) return
    const cols = draft.columns.slice()
    cols[i] = { ...cols[i], ...p }
    setDraft({ ...draft, columns: cols })
  }
  function moveCol(i: number, dir: -1 | 1) {
    if (!draft) return
    const j = i + dir
    if (j < 0 || j >= draft.columns.length) return
    const cols = draft.columns.slice()
    ;[cols[i], cols[j]] = [cols[j], cols[i]]
    setDraft({ ...draft, columns: cols })
  }

  return (
    <div className="flex min-h-0 flex-1">
      {/* board list */}
      <div className="w-[180px] shrink-0 overflow-y-auto border-r border-line p-2">
        {boards.map((b) => (
          <button
            key={b.id}
            onClick={() => setSelectedId(b.id)}
            className={cx(
              'mb-1 flex w-full items-center justify-between rounded-[4px] px-2 py-1.5 text-left text-[12px] transition',
              draft?.id === b.id ? 'bg-panel-hi text-fg' : 'text-fg-dim hover:bg-panel hover:text-fg',
            )}
          >
            <span className="truncate">{b.name}</span>
            {activeId === b.id && <span className="h-1.5 w-1.5 rounded-full bg-phosphor" title="active" />}
          </button>
        ))}
        <button
          onClick={newBoard}
          className="mt-1 flex w-full items-center gap-1.5 rounded-[4px] border border-dashed border-line px-2 py-1.5 text-[11px] text-fg-faint hover:border-phosphor/40 hover:text-phosphor"
        >
          <Plus size={12} /> new board
        </button>
      </div>

      {/* editor */}
      <div className="flex min-w-0 flex-1 flex-col">
        {!draft ? (
          <div className="flex flex-1 items-center justify-center text-[12px] text-fg-faint">
            select or create a board
          </div>
        ) : (
          <>
            <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="name">
                  <TextInput value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} />
                </Field>
                <Field label="sort within column">
                  <Menu
                    value={draft.sort}
                    items={SORTS}
                    onChange={(v) => v && setDraft({ ...draft, sort: v as SortKey })}
                  />
                </Field>
              </div>

              <Field label="base filter" hint="taskwarrior filter — applied to every column">
                <TextInput
                  value={draft.filter}
                  onChange={(e) => setDraft({ ...draft, filter: e.target.value })}
                  placeholder="status:pending"
                  className="font-mono"
                />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="column field" hint="UDA / attribute">
                  <TextInput
                    value={draft.columnField}
                    onChange={(e) => setDraft({ ...draft, columnField: e.target.value })}
                    placeholder="state"
                    className="font-mono"
                  />
                </Field>
                <Field label="swimlanes by">
                  <Menu
                    allowClear
                    placeholder="none"
                    value={draft.groupBy}
                    items={[
                      { value: 'agent', label: 'agent' },
                      { value: 'project', label: 'project' },
                    ]}
                    onChange={(v) => setDraft({ ...draft, groupBy: (v as 'agent' | 'project' | null) })}
                  />
                </Field>
              </div>

              {/* columns */}
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[10px] uppercase tracking-[0.14em] text-fg-faint">
                    columns — value of <span className="text-fg-dim">{draft.columnField}</span>
                  </span>
                </div>
                <div className="space-y-1.5">
                  {draft.columns.map((c, i) => (
                    <div key={i} className="flex items-center gap-1.5">
                      <span
                        className="h-2.5 w-2.5 shrink-0 rounded-full"
                        style={{ background: c.accent ?? stateAccent(c.match) }}
                      />
                      <TextInput
                        value={c.label}
                        onChange={(e) => patchCol(i, { label: e.target.value })}
                        className="!h-7 flex-1"
                        placeholder="label"
                      />
                      <TextInput
                        value={c.match}
                        onChange={(e) => patchCol(i, { match: e.target.value, id: slug(e.target.value) || c.id })}
                        className="!h-7 w-28 font-mono"
                        placeholder="match value"
                      />
                      <div className="flex">
                        <IcoBtn onClick={() => moveCol(i, -1)} disabled={i === 0}>
                          <ArrowUp size={12} />
                        </IcoBtn>
                        <IcoBtn onClick={() => moveCol(i, 1)} disabled={i === draft.columns.length - 1}>
                          <ArrowDown size={12} />
                        </IcoBtn>
                        <IcoBtn
                          onClick={() => setDraft({ ...draft, columns: draft.columns.filter((_, j) => j !== i) })}
                          danger
                        >
                          <Trash2 size={12} />
                        </IcoBtn>
                      </div>
                    </div>
                  ))}
                </div>
                <button
                  onClick={() =>
                    setDraft({
                      ...draft,
                      columns: [...draft.columns, { id: `col-${draft.columns.length}`, label: 'NEW', match: '' }],
                    })
                  }
                  className="mt-2 flex items-center gap-1.5 rounded-[4px] border border-dashed border-line px-2 py-1 text-[11px] text-fg-faint hover:border-phosphor/40 hover:text-phosphor"
                >
                  <Plus size={12} /> column
                </button>
              </div>
            </div>

            {/* footer */}
            <div className="flex items-center gap-2 border-t border-line px-4 py-2.5">
              {!isNew && (
                <button
                  onClick={() => {
                    setActiveBoard(draft.id)
                    api.setActiveBoard(draft.id).catch(() => {})
                    notify(`activated ${draft.name}`, 'var(--color-phosphor)')
                  }}
                  className="inline-flex h-7 items-center gap-1.5 rounded-[4px] border border-line bg-surface/60 px-2.5 text-[11px] text-fg-dim hover:border-phosphor/40 hover:text-phosphor"
                >
                  <Check size={12} /> set active
                </button>
              )}
              {!isNew && (
                <ConfirmButton onConfirm={del} confirmLabel="delete board?">
                  <Trash2 size={12} /> delete
                </ConfirmButton>
              )}
              <button
                onClick={save}
                disabled={!dirty && !isNew}
                className={cx(
                  'ml-auto inline-flex h-7 items-center gap-1.5 rounded-[4px] border px-3 text-[11px] font-medium transition',
                  dirty || isNew
                    ? 'border-phosphor/45 bg-phosphor/12 text-phosphor hover:bg-phosphor/20'
                    : 'cursor-not-allowed border-line text-fg-faint',
                )}
              >
                {isNew ? 'create board' : 'save changes'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function IcoBtn({
  children,
  onClick,
  disabled,
  danger,
}: {
  children: ReactNode
  onClick: () => void
  disabled?: boolean
  danger?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={cx(
        'flex h-7 w-7 items-center justify-center text-fg-faint transition',
        disabled ? 'opacity-25' : danger ? 'hover:text-coral' : 'hover:text-fg',
      )}
    >
      {children}
    </button>
  )
}

function FiltersTab() {
  const schema = useStore((s) => s.schema)
  const board = useStore(activeBoard)
  const setSchema = useStore((s) => s.setSchema)
  const ingest = useStore((s) => s.ingest)
  const markReload = useStore((s) => s.markReload)
  const notify = useStore((s) => s.notify)

  const [name, setName] = useState('')
  const [filter, setFilter] = useState('')
  const [busy, setBusy] = useState(false)

  const active = schema?.context.active ?? null
  const defined = schema?.context.defined ?? []

  async function refreshAfterContext() {
    const s = await api.schema()
    setSchema(s)
    markReload()
    const snap = await api.tasks(board?.filter ?? 'status:pending')
    ingest(snap)
  }

  async function activate(n: string | null) {
    setBusy(true)
    try {
      await api.activateContext(n)
      await refreshAfterContext()
      notify(n ? `context · ${n}` : 'context cleared', 'var(--color-amber)')
    } catch (e) {
      notify((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function define() {
    if (!name.trim() || !filter.trim()) return
    setBusy(true)
    try {
      await api.defineContext(name.trim(), filter.trim())
      setName('')
      setFilter('')
      await refreshAfterContext()
      notify('context defined', 'var(--color-phosphor)')
    } catch (e) {
      notify((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  async function remove(n: string) {
    setBusy(true)
    try {
      await api.deleteContext(n)
      await refreshAfterContext()
    } catch (e) {
      notify((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-[0.14em] text-fg-faint">
          taskwarrior contexts
        </div>
        <p className="mb-3 text-[11px] leading-relaxed text-fg-faint">
          contexts are global Taskwarrior filters (written to your <code>.taskrc</code> via{' '}
          <code className="text-fg-dim">task context</code>). activating one filters this board —
          and your terminal — to matching tasks.
        </p>

        <div className="mb-3 flex flex-wrap gap-1.5">
          <ContextChip label="none" active={active === null} onClick={() => activate(null)} disabled={busy} />
          {defined.map((c) => (
            <ContextChip
              key={c.name}
              label={c.name}
              active={active === c.name}
              onClick={() => activate(c.name)}
              disabled={busy}
            />
          ))}
        </div>

        <div className="space-y-1.5">
          {defined.map((c) => (
            <div
              key={c.name}
              className="flex items-center gap-3 rounded-[4px] border border-line bg-surface/50 px-3 py-2"
            >
              <span className={cx('text-[12px]', active === c.name ? 'text-phosphor' : 'text-fg')}>
                {c.name}
              </span>
              <code className="min-w-0 flex-1 truncate text-[11px] text-fg-dim" title={c.filter}>
                {c.filter || '—'}
              </code>
              <ConfirmButton onConfirm={() => remove(c.name)} confirmLabel="remove?" className="!h-6">
                <Trash2 size={11} />
              </ConfirmButton>
            </div>
          ))}
          {defined.length === 0 && (
            <div className="rounded-[4px] border border-dashed border-line px-3 py-2 text-[11px] text-fg-faint">
              no contexts defined
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-line pt-4">
        <div className="mb-2 text-[10px] uppercase tracking-[0.14em] text-fg-faint">define context</div>
        <div className="flex items-end gap-2">
          <div className="w-[160px]">
            <Field label="name">
              <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="claude" />
            </Field>
          </div>
          <div className="flex-1">
            <Field label="read filter">
              <TextInput
                value={filter}
                onChange={(e) => setFilter(e.target.value)}
                placeholder="agent:claude"
                className="font-mono"
                onKeyDown={(e) => e.key === 'Enter' && define()}
              />
            </Field>
          </div>
          <button
            onClick={define}
            disabled={busy || !name.trim() || !filter.trim()}
            className={cx(
              'inline-flex h-8 items-center gap-1.5 rounded-[4px] border px-3 text-[11px] transition',
              name.trim() && filter.trim()
                ? 'border-phosphor/45 bg-phosphor/12 text-phosphor hover:bg-phosphor/20'
                : 'cursor-not-allowed border-line text-fg-faint',
            )}
          >
            <Plus size={12} /> define
          </button>
        </div>
      </div>
    </div>
  )
}

function ContextChip({
  label,
  active,
  onClick,
  disabled,
}: {
  label: string
  active: boolean
  onClick: () => void
  disabled?: boolean
}) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className="inline-flex h-7 items-center gap-1.5 rounded-[4px] border px-2.5 text-[11px] transition disabled:opacity-50"
      style={{
        borderColor: active ? hexA('var(--color-amber)', 0.45) : 'var(--color-line)',
        background: active ? hexA('var(--color-amber)', 0.1) : 'transparent',
        color: active ? 'var(--color-amber)' : 'var(--color-fg-dim)',
      }}
    >
      {active && <span className="h-1.5 w-1.5 rounded-full bg-amber" style={{ boxShadow: '0 0 6px var(--color-amber)' }} />}
      {label}
    </button>
  )
}
