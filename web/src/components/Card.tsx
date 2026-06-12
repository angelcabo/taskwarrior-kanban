import { useDraggable } from '@dnd-kit/core'
import { motion } from 'motion/react'
import { Ban, Check, Clock, GitBranch, MessageSquare, Folder } from 'lucide-react'
import { useEffect, useState } from 'react'
import type { Task } from '../lib/types'
import { useStore } from '../lib/store'
import { agentColor, priorityMeta, URGENCY_COLOR } from '../lib/theme'
import { clamp, dueInfo, projectLeaf, relTime } from '../lib/format'
import { cx, hexA } from './ui'

type Flash = null | 'phosphor' | 'amber'

export function Card({
  task,
  overlay,
  dragging,
  flash,
  selected,
  checked,
  selectionMode,
  bucket,
  onOpen,
  onToggleSelect,
}: {
  task: Task
  overlay?: boolean
  dragging?: boolean
  flash?: Flash
  selected?: boolean
  /** picked for a batch operation */
  checked?: boolean
  /** a batch selection is in progress somewhere on the board */
  selectionMode?: boolean
  bucket?: 'low' | 'mid' | 'high' | 'critical'
  onOpen?: () => void
  onToggleSelect?: () => void
}) {
  const prio = priorityMeta(task.priority)
  const due = dueInfo(task.due)
  const ub = bucket ?? task.urgencyBucket
  const heat = task.active ? 'var(--color-phosphor)' : URGENCY_COLOR[ub]
  const agentC = agentColor(task.agent)
  const annCount = task.annotations?.length ?? 0
  const isBlocked = task.blocked || task.tags.includes('blocked')

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={(e) => {
        // ⌘/Ctrl-click toggles batch selection; a plain click always opens detail.
        if (onToggleSelect && (e.metaKey || e.ctrlKey)) {
          e.preventDefault()
          onToggleSelect()
          return
        }
        onOpen?.()
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          onOpen?.()
        }
      }}
      className={cx(
        'group relative cursor-pointer overflow-hidden rounded-[var(--radius-card)] border bg-gradient-to-b from-panel to-surface text-left transition-colors',
        'pl-3 pr-2.5 py-2',
        checked
          ? 'border-phosphor/70'
          : selected
            ? 'border-phosphor/60'
            : 'border-line hover:border-line-strong',
        overlay && 'rotate-[1.2deg] scale-[1.02] shadow-[0_22px_48px_-12px_rgba(0,0,0,0.85)]',
        flash === 'phosphor' && 'flash-changed',
        flash === 'amber' && 'flash-amber',
      )}
      style={{
        boxShadow: task.active && !overlay ? `0 0 0 1px ${hexA('var(--color-phosphor)', 0.18)}, 0 0 22px -8px ${hexA('var(--color-phosphor)', 0.4)}` : undefined,
      }}
    >
      {/* urgency / live heat bar */}
      <span
        className={cx('absolute left-0 top-0 bottom-0 w-[2.5px]')}
        style={{ background: heat, boxShadow: task.active ? `0 0 10px ${hexA('var(--color-phosphor)', 0.8)}` : undefined }}
      />

      {/* batch-selection wash + checkbox */}
      {checked && <span className="pointer-events-none absolute inset-0 bg-phosphor/[0.07]" />}
      {onToggleSelect && !overlay && (
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            onToggleSelect()
          }}
          title={checked ? 'deselect' : 'select for batch edit'}
          className={cx(
            'absolute right-1.5 top-1.5 z-10 flex h-[18px] w-[18px] items-center justify-center rounded-[4px] border transition',
            checked
              ? 'border-phosphor bg-phosphor/20 text-phosphor'
              : 'border-line-strong bg-surface/90 text-transparent hover:border-phosphor/60 hover:text-phosphor/70',
            checked || selectionMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
          )}
        >
          <Check size={12} strokeWidth={2.6} />
        </button>
      )}

      {/* header: priority + description */}
      <div className="flex items-start gap-2">
        {prio && (
          <span
            title={`priority ${prio.label}`}
            className="mt-[3px] h-2 w-2 shrink-0 rounded-full"
            style={{ background: prio.color, boxShadow: `0 0 8px ${hexA(prio.color, 0.6)}` }}
          />
        )}
        <p className="min-w-0 flex-1 text-[12.5px] leading-snug text-fg">
          {clamp(task.description, 120)}
        </p>
      </div>

      {/* meta chips */}
      <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px] text-fg-dim">
        {task.project && (
          <span className="inline-flex items-center gap-1 text-fg-dim" title={task.project}>
            <Folder size={11} strokeWidth={1.5} className="text-fg-faint" />
            {projectLeaf(task.project)}
          </span>
        )}
        {task.branch && (
          <span
            className="inline-flex items-center gap-1 truncate"
            style={{ color: hexA('var(--color-fg)', 0.72) }}
            title={`branch ${task.branch}`}
          >
            <GitBranch size={11} strokeWidth={1.5} style={{ color: agentC }} />
            <span className="truncate">{clamp(task.branch, 22)}</span>
          </span>
        )}
        {task.tags
          .filter((t) => t !== 'blocked')
          .slice(0, 3)
          .map((t) => (
            <span key={t} className="text-fg-faint">
              #{t}
            </span>
          ))}
        {due && (
          <span
            className="inline-flex items-center gap-1"
            style={{ color: due.overdue ? 'var(--color-coral)' : due.soon ? 'var(--color-amber)' : 'var(--color-fg-dim)' }}
            title={`due ${due.iso}`}
          >
            <Clock size={11} strokeWidth={1.5} />
            {due.text}
          </span>
        )}
        {annCount > 0 && (
          <span className="inline-flex items-center gap-1 text-fg-faint" title={`${annCount} annotation(s)`}>
            <MessageSquare size={11} strokeWidth={1.5} />
            {annCount}
          </span>
        )}
        {isBlocked && (
          <span className="inline-flex items-center gap-1 text-coral" title="blocked">
            <Ban size={11} strokeWidth={1.6} />
            blocked
          </span>
        )}
      </div>

      {/* footer: agent + urgency */}
      <div className="mt-2 flex items-center justify-between">
        <div className="flex min-w-0 items-center gap-1.5">
          {task.agent ? (
            <span
              className="inline-flex items-center gap-1.5 rounded-[3px] border px-1.5 py-[2px] text-[10px] leading-none"
              style={{ borderColor: hexA(agentC, 0.34), color: agentC, background: hexA(agentC, 0.08) }}
            >
              <span className="h-1.5 w-1.5 rounded-full" style={{ background: agentC, boxShadow: `0 0 6px ${agentC}` }} />
              {task.agent}
            </span>
          ) : (
            <span className="text-[10px] text-fg-faint">unassigned</span>
          )}
          {task.active && (
            <span className="inline-flex items-center gap-1 text-[10px] text-phosphor glow-soft">
              <span className="pulse-ring h-1.5 w-1.5 rounded-full bg-phosphor" />
              running
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[10px] text-fg-faint">
          <span className="tabular-nums text-fg-faint/70" title="task id">#{task.id}</span>
          <span title="last modified">{relTime(task.modified)}</span>
          <span
            className="tabular-nums"
            title="urgency"
            style={{ color: ub === 'critical' ? 'var(--color-coral)' : ub === 'high' ? 'var(--color-amber)' : undefined }}
          >
            {task.urgency.toFixed(1)}
          </span>
        </div>
      </div>
    </div>
  )
}

/** Drag-enabled, animated wrapper around Card. */
export function DraggableCard({ task }: { task: Task }) {
  const select = useStore((s) => s.select)
  const selected = useStore((s) => s.selectedUuid === task.uuid)
  const checked = useStore((s) => s.selection.has(task.uuid))
  const selectionMode = useStore((s) => s.selection.size > 0)
  const toggleSelect = useStore((s) => s.toggleSelect)
  const mark = useStore((s) => s.changed[task.uuid])
  const bucket = useStore((s) => s.urgencyRank[task.uuid])
  const { setNodeRef, listeners, attributes, isDragging } = useDraggable({
    id: task.uuid,
    data: { from: task.state ?? '' },
  })

  const [flash, setFlash] = useState<Flash>(null)
  useEffect(() => {
    if (!mark) return
    setFlash(mark.kind === 'agent' ? 'amber' : 'phosphor')
    const t = setTimeout(() => setFlash(null), 2400)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mark?.ts])

  return (
    <motion.div
      ref={setNodeRef}
      layout={!isDragging}
      initial={{ opacity: 0, y: 6, scale: 0.98 }}
      animate={{ opacity: isDragging ? 0.25 : 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, scale: 0.96, transition: { duration: 0.14 } }}
      transition={{ layout: { type: 'spring', stiffness: 460, damping: 34 }, duration: 0.16 }}
      {...listeners}
      {...attributes}
      className="touch-none outline-none"
    >
      <Card
        task={task}
        flash={flash}
        selected={selected}
        checked={checked}
        selectionMode={selectionMode}
        bucket={bucket}
        dragging={isDragging}
        onOpen={() => select(task.uuid)}
        onToggleSelect={() => toggleSelect(task.uuid)}
      />
    </motion.div>
  )
}
