import { useDroppable } from '@dnd-kit/core'
import { AnimatePresence } from 'motion/react'
import { CheckSquare, Plus } from 'lucide-react'
import type { BoardColumn, Task } from '../lib/types'
import { DraggableCard } from './Card'
import { isLiveState, STATE_GLYPH, stateAccent } from '../lib/theme'
import { cx, hexA } from './ui'
import { useStore } from '../lib/store'

export function Column({
  column,
  tasks,
  laneKey,
}: {
  column: BoardColumn
  tasks: Task[]
  laneKey?: string | null
}) {
  // unique drop target per (column × lane) so dnd-kit can tell lanes apart
  const inLane = laneKey !== undefined
  const dropId = inLane ? `${column.id}::${laneKey ?? '∅'}` : column.id
  const { setNodeRef, isOver, active } = useDroppable({
    id: dropId,
    data: { match: column.match },
  })
  const openComposer = useStore((s) => s.openComposer)
  const selectMany = useStore((s) => s.selectMany)
  const selection = useStore((s) => s.selection)
  const accent = column.accent ?? stateAccent(column.match)
  const live = isLiveState(column.match)
  const glyph = STATE_GLYPH[column.match] ?? '○'
  const isDraggingSomething = !!active

  const ids = tasks.map((t) => t.uuid)
  const allChecked = ids.length > 0 && ids.every((id) => selection.has(id))
  const someChecked = !allChecked && ids.some((id) => selection.has(id))
  const selectionMode = selection.size > 0

  return (
    <div
      className={cx(
        'flex w-[300px] shrink-0 flex-col',
        // column mode: fill the viewport-height board so the card list scrolls internally.
        // lane mode: stretch to the lane's tallest column instead, so empty columns
        // match the row height rather than collapsing to their own content.
        inLane ? 'self-stretch' : 'h-full',
      )}
    >
      <header
        className="flex items-center justify-between gap-2 px-1.5 pb-2"
        style={{ borderColor: hexA(accent, 0.25) }}
      >
        <div className="flex items-center gap-2 truncate">
          <span
            className={cx('text-[12px]', live && 'glow-soft')}
            style={{ color: accent }}
          >
            {glyph}
          </span>
          <span
            className={cx(
              'text-[11px] font-bold uppercase tracking-[0.18em]',
              live ? 'text-phosphor' : 'text-fg',
            )}
            style={!live ? { color: hexA('var(--color-fg)', 0.9) } : undefined}
          >
            {column.label}
          </span>
          <span className="rounded-[3px] px-1 text-[10px] tabular-nums text-fg-faint">
            {tasks.length}
          </span>
          {live && tasks.length > 0 && (
            <span className="inline-flex items-center gap-1 text-[9.5px] uppercase tracking-wider text-phosphor/80">
              <span className="pulse-ring h-1 w-1 rounded-full bg-phosphor" />
              live
            </span>
          )}
        </div>
        <div className="flex items-center gap-0.5">
          {tasks.length > 0 && (
            <button
              type="button"
              onClick={() => selectMany(ids, !allChecked)}
              title={allChecked ? `deselect all in ${column.label}` : `select all in ${column.label}`}
              className={cx(
                'flex h-5 w-5 items-center justify-center rounded-[3px] transition hover:bg-panel-hi',
                allChecked ? 'text-phosphor' : someChecked ? 'text-phosphor/60' : 'text-fg-faint hover:text-phosphor',
                selectionMode ? 'opacity-100' : 'opacity-0 group-hover/board:opacity-100',
              )}
            >
              <CheckSquare size={13} strokeWidth={1.8} />
            </button>
          )}
          <button
            type="button"
            onClick={() => openComposer(column.match)}
            title={`add to ${column.label}`}
            className="flex h-5 w-5 items-center justify-center rounded-[3px] text-fg-faint opacity-0 transition hover:bg-panel-hi hover:text-phosphor group-hover/board:opacity-100"
          >
            <Plus size={13} strokeWidth={1.6} />
          </button>
        </div>
      </header>

      <div
        ref={setNodeRef}
        className={cx(
          'relative flex-1 overflow-y-auto rounded-[6px] border p-2 transition-colors',
          isOver ? 'border-phosphor/45' : 'border-line',
        )}
        style={{
          background: isOver
            ? hexA('var(--color-phosphor)', 0.04)
            : live
              ? hexA('var(--color-phosphor)', 0.012)
              : hexA('var(--color-surface)', 0.55),
          boxShadow: isOver ? `inset 0 0 0 1px ${hexA('var(--color-phosphor)', 0.25)}` : undefined,
        }}
      >
        <div className="flex flex-col gap-2">
          <AnimatePresence initial={false}>
            {tasks.map((t) => (
              <DraggableCard key={t.uuid} task={t} />
            ))}
          </AnimatePresence>
        </div>

        {tasks.length === 0 && (
          <div
            className={cx(
              'pointer-events-none absolute inset-2 flex items-center justify-center rounded-[5px] border border-dashed text-[10.5px] uppercase tracking-[0.2em] transition-colors',
              isOver ? 'border-phosphor/40 text-phosphor/70' : 'border-line text-fg-faint/60',
            )}
          >
            {isDraggingSomething ? 'drop here' : 'empty'}
          </div>
        )}
      </div>
    </div>
  )
}
