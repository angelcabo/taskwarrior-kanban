import {
  DndContext,
  DragOverlay,
  PointerSensor,
  pointerWithin,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent,
} from '@dnd-kit/core'
import { useState } from 'react'
import type { Board as BoardT, SortKey, Task } from '../lib/types'
import { activeBoard, useStore } from '../lib/store'
import { api } from '../lib/api'
import { parseTwDate } from '../lib/format'
import { groupColor } from '../lib/theme'
import { Column } from './Column'
import { Card } from './Card'
import { cx, hexA } from './ui'

const PRIO_RANK: Record<string, number> = { H: 3, M: 2, L: 1 }

type Lane = { key: string; field: 'agent' | 'project'; value: string | null; tasks: Task[] }

function comparator(sort: SortKey) {
  const tw = (s?: string) => parseTwDate(s)?.getTime() ?? 0
  return (a: Task, b: Task): number => {
    switch (sort) {
      case 'priority':
        return (
          (PRIO_RANK[b.priority ?? ''] ?? 0) - (PRIO_RANK[a.priority ?? ''] ?? 0) ||
          b.urgency - a.urgency
        )
      case 'due':
        return (
          (parseTwDate(a.due)?.getTime() ?? Infinity) -
          (parseTwDate(b.due)?.getTime() ?? Infinity)
        )
      case 'modified':
        return tw(b.modified) - tw(a.modified)
      case 'entry':
        return tw(b.entry) - tw(a.entry)
      case 'urgency':
      default:
        return b.urgency - a.urgency
    }
  }
}

function matchesSearch(t: Task, q: string): boolean {
  if (!q) return true
  const hay = [
    t.description,
    t.project ?? '',
    t.branch ?? '',
    t.agent ?? '',
    t.tags.join(' '),
    `#${t.id}`,
    t.state ?? '',
  ]
    .join(' ')
    .toLowerCase()
  return q
    .toLowerCase()
    .split(/\s+/)
    .every((term) => hay.includes(term))
}

function columnIdFor(board: BoardT, t: Task): string {
  const v = (t[board.columnField as keyof Task] as string | undefined) ?? ''
  const col = board.columns.find((c) => c.match === v)
  return col?.id ?? board.columns[0]?.id ?? ''
}

function ColumnsRow({
  board,
  tasks,
  laneKey,
}: {
  board: BoardT
  tasks: Task[]
  laneKey?: string | null
}) {
  const cmp = comparator(board.sort)
  const byCol = new Map<string, Task[]>()
  for (const c of board.columns) byCol.set(c.id, [])
  for (const t of tasks) {
    const id = columnIdFor(board, t)
    byCol.get(id)?.push(t)
  }
  for (const arr of byCol.values()) arr.sort(cmp)

  return (
    <div className="flex h-full min-w-max gap-3">
      {board.columns.map((c) => (
        <Column key={c.id} column={c} tasks={byCol.get(c.id) ?? []} laneKey={laneKey} />
      ))}
    </div>
  )
}

export function Board() {
  const board = useStore(activeBoard)
  const tasks = useStore((s) => s.tasks)
  const search = useStore((s) => s.search)
  const projectFilter = useStore((s) => s.projectFilter)
  const swimlanes = useStore((s) => s.swimlanes)
  const schema = useStore((s) => s.schema)
  const byUuid = useStore((s) => s.byUuid)
  const noteSelfOp = useStore((s) => s.noteSelfOp)
  const optimistic = useStore((s) => s.optimistic)
  const notify = useStore((s) => s.notify)

  const [activeId, setActiveId] = useState<string | null>(null)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }))

  if (!board) return null

  const filtered = tasks.filter(
    (t) => matchesSearch(t, search) && (!projectFilter || t.project === projectFilter),
  )

  function onDragStart(e: DragStartEvent) {
    setActiveId(String(e.active.id))
  }

  async function onDragEnd(e: DragEndEvent) {
    setActiveId(null)
    const { active, over } = e
    if (!over) return
    const toMatch = over.data.current?.match as string | undefined
    const fromMatch = (active.data.current?.from as string | undefined) ?? ''
    if (toMatch === undefined || toMatch === fromMatch) return
    const uuid = String(active.id)
    noteSelfOp(uuid, toMatch)
    optimistic(uuid, { state: toMatch || undefined })
    try {
      await api.move(uuid, toMatch)
    } catch (err) {
      notify(`move failed · ${(err as Error).message}`)
    }
  }

  const activeTask = activeId ? byUuid[activeId] : null

  // swimlane grouping by the board's groupBy dimension (project by default;
  // agent only when a board explicitly opts in via the board manager)
  const groupField: 'agent' | 'project' = board.groupBy === 'agent' ? 'agent' : 'project'
  const valueOf = (t: Task) => (groupField === 'project' ? t.project : t.agent) ?? '∅'
  let lanes: Lane[] = []
  if (swimlanes) {
    const order = groupField === 'project' ? schema?.projects ?? [] : schema?.agents ?? []
    const present = [...new Set(filtered.map(valueOf))]
    const ordered = order.filter((v) => present.includes(v))
    const extras = present.filter((v) => v !== '∅' && !ordered.includes(v)).sort()
    // empty lane ('∅') always sorts last
    const keys = [...ordered, ...extras, ...(present.includes('∅') ? ['∅'] : [])]
    if (keys.length === 0) keys.push('∅')
    lanes = keys.map((k) => ({
      key: k,
      field: groupField,
      value: k === '∅' ? null : k,
      tasks: filtered.filter((t) => valueOf(t) === k),
    }))
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={pointerWithin}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragCancel={() => setActiveId(null)}
    >
      <div
        className={cx(
          'group/board h-full px-4 pb-4 pt-3',
          // column mode: columns scroll internally, so the board only scrolls sideways.
          // swimlane mode: lanes stack vertically and grow with content, so the board
          // itself must scroll vertically to reach lanes below the fold.
          swimlanes ? 'overflow-auto' : 'overflow-x-auto overflow-y-hidden',
        )}
      >
        {!swimlanes ? (
          <ColumnsRow board={board} tasks={filtered} />
        ) : (
          <div className="flex min-w-max flex-col gap-3">
            {lanes.map((lane) => (
              <SwimLane key={lane.key} board={board} lane={lane} />
            ))}
          </div>
        )}
      </div>

      <DragOverlay dropAnimation={{ duration: 180, easing: 'cubic-bezier(0.2,0,0,1)' }}>
        {activeTask ? (
          <div className="w-[280px]">
            <Card task={activeTask} overlay />
          </div>
        ) : null}
      </DragOverlay>
    </DndContext>
  )
}

function SwimLane({ board, lane }: { board: BoardT; lane: Lane }) {
  const color = groupColor(lane.field, lane.value)
  const emptyLabel = lane.field === 'project' ? 'no project' : 'unassigned'
  return (
    <section className="flex min-h-[180px] flex-col">
      <div className="mb-1.5 flex items-center gap-2 px-1">
        <span className="h-2 w-2 rounded-full" style={{ background: color, boxShadow: `0 0 8px ${color}` }} />
        <span className="text-[11px] font-bold uppercase tracking-[0.18em]" style={{ color }}>
          {lane.value ?? emptyLabel}
        </span>
        <span className="text-[10px] tabular-nums text-fg-faint">{lane.tasks.length}</span>
        <span className="ml-1 h-px flex-1" style={{ background: hexA(color, 0.18) }} />
      </div>
      <div className={cx('min-h-[150px] flex-1')}>
        <ColumnsRow board={board} tasks={lane.tasks} laneKey={lane.key} />
      </div>
    </section>
  )
}
