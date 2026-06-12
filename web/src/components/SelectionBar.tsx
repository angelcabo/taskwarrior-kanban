import { motion } from 'motion/react'
import { useState, type ReactNode } from 'react'
import { Bot, Flag, Folder, ListChecks, Tag, Trash2, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api, type TaskPatch } from '../lib/api'
import type { Task } from '../lib/types'
import { agentColor, priorityMeta, projectColor, stateAccent, STATE_GLYPH } from '../lib/theme'
import { ConfirmButton, Menu, type MenuItem, cx, hexA, useDismiss } from './ui'

/**
 * Floating batch-action bar shown whenever one or more cards are selected.
 * Each control applies one patch across the whole selection in a single
 * `task <uuids> modify` command, with optimistic updates mirroring the detail
 * drawer. Non-destructive actions keep the selection so edits can be chained.
 */
export function SelectionBar() {
  const selection = useStore((s) => s.selection)
  const schema = useStore((s) => s.schema)
  const byUuid = useStore((s) => s.byUuid)
  const clearSelection = useStore((s) => s.clearSelection)
  const noteSelfOp = useStore((s) => s.noteSelfOp)
  const optimistic = useStore((s) => s.optimistic)
  const notify = useStore((s) => s.notify)

  const uuids = [...selection]
  const count = uuids.length
  if (!schema || count === 0) return null

  async function apply(fields: TaskPatch, opt: Partial<Task>, to?: string) {
    for (const u of uuids) {
      noteSelfOp(u, to)
      optimistic(u, opt)
    }
    try {
      await api.batchPatch(uuids, fields)
    } catch (e) {
      notify((e as Error).message)
    }
  }

  function applyTag(raw: string) {
    const t = raw.trim().replace(/^[+#]/, '')
    if (!t) return
    for (const u of uuids) {
      noteSelfOp(u)
      const cur = byUuid[u]
      if (cur && !cur.tags.includes(t)) optimistic(u, { tags: [...cur.tags, t] })
    }
    api.batchPatch(uuids, { addTags: [t] }).catch((e) => notify((e as Error).message))
  }

  function del() {
    for (const u of uuids) noteSelfOp(u)
    api.batchDelete(uuids).catch((e) => notify((e as Error).message))
    clearSelection()
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 24, x: '-50%' }}
      animate={{ opacity: 1, y: 0, x: '-50%' }}
      exit={{ opacity: 0, y: 24, x: '-50%' }}
      transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      className="fixed bottom-4 left-1/2 z-40 flex max-w-[min(94vw,940px)] flex-wrap items-center gap-2 rounded-[8px] border border-phosphor/30 bg-ink/95 px-3 py-2 backdrop-blur-sm"
      style={{
        boxShadow: `0 24px 60px -18px rgba(0,0,0,0.9), 0 0 0 1px ${hexA('var(--color-phosphor)', 0.12)}, 0 0 28px -10px ${hexA('var(--color-phosphor)', 0.45)}`,
      }}
    >
      <div className="flex items-center gap-2 pl-1 pr-1">
        <ListChecks size={15} strokeWidth={1.7} className="text-phosphor glow-soft" />
        <span className="text-[12px] font-bold tabular-nums text-fg">{count}</span>
        <span className="hidden text-[11px] text-fg-dim sm:inline">selected</span>
      </div>

      <span className="h-5 w-px bg-line" />

      <BatchMenu
        icon={<span className="text-fg-faint">◆</span>}
        label="state"
        width={170}
        items={schema.states.map((s) => ({
          value: s,
          label: s,
          accent: stateAccent(s),
          glyph: <span>{STATE_GLYPH[s] ?? '○'}</span>,
        }))}
        onPick={(v) => v && apply({ state: v }, { state: v }, v)}
      />
      <BatchMenu
        icon={<Folder size={12} strokeWidth={1.6} className="text-fg-faint" />}
        label="project"
        width={220}
        searchable
        allowClear
        items={(schema.projects ?? []).map((p) => ({
          value: p,
          label: p,
          glyph: <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: projectColor(p) }} />,
        }))}
        onPick={(v) => apply({ project: v ?? '' }, { project: v ?? undefined })}
      />
      <BatchMenu
        icon={<Bot size={12} strokeWidth={1.6} className="text-fg-faint" />}
        label="agent"
        width={180}
        allowClear
        items={schema.agents.map((a) => ({
          value: a,
          label: a,
          accent: agentColor(a),
          glyph: <span className="h-1.5 w-1.5 rounded-full" style={{ background: agentColor(a) }} />,
        }))}
        onPick={(v) => apply({ agent: v ?? '' }, { agent: v ?? undefined })}
      />
      <BatchMenu
        icon={<Flag size={12} strokeWidth={1.6} className="text-fg-faint" />}
        label="priority"
        width={150}
        allowClear
        items={schema.priorities.map((p) => {
          const m = priorityMeta(p)!
          return { value: p, label: m.label, accent: m.color }
        })}
        onPick={(v) => apply({ priority: v ?? '' }, { priority: v ?? undefined })}
      />
      <TagAdder tags={schema.tags} onAdd={applyTag} />

      <span className="h-5 w-px bg-line" />

      <ConfirmButton onConfirm={del} confirmLabel={`delete ${count}?`}>
        <Trash2 size={13} strokeWidth={1.6} />
      </ConfirmButton>

      <button
        onClick={clearSelection}
        title="clear selection (esc)"
        className="flex h-7 w-7 items-center justify-center rounded-[4px] text-fg-faint transition hover:bg-panel-hi hover:text-fg"
      >
        <X size={15} strokeWidth={1.6} />
      </button>
    </motion.div>
  )
}

/** A compact menu whose trigger always shows its label (batch is heterogeneous). */
function BatchMenu({
  icon,
  label,
  items,
  onPick,
  width,
  searchable,
  allowClear,
}: {
  icon: ReactNode
  label: string
  items: MenuItem[]
  onPick: (v: string | null) => void
  width?: number
  searchable?: boolean
  allowClear?: boolean
}) {
  return (
    <Menu
      width={width}
      align="left"
      placement="top"
      searchable={searchable}
      allowClear={allowClear}
      value={null}
      items={items}
      onChange={onPick}
      trigger={() => (
        <span className="flex items-center gap-1.5 whitespace-nowrap text-fg-dim">
          {icon}
          {label}
        </span>
      )}
    />
  )
}

/** A small upward popover to add one tag (existing or new) to all selected. */
function TagAdder({ tags, onAdd }: { tags: string[]; onAdd: (t: string) => void }) {
  const [open, setOpen] = useState(false)
  const [val, setVal] = useState('')
  const ref = useDismiss(open, () => setOpen(false))
  const submit = () => {
    if (!val.trim()) return
    onAdd(val)
    setVal('')
    setOpen(false)
  }
  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={cx(
          'flex h-7 items-center gap-1.5 rounded-[4px] border px-2 text-[11.5px] transition-colors',
          open
            ? 'border-phosphor/45 bg-panel text-fg'
            : 'border-line bg-surface/70 text-fg-dim hover:border-line-strong hover:text-fg',
        )}
      >
        <Tag size={12} strokeWidth={1.6} className="text-fg-faint" />
        tag
      </button>
      {open && (
        <motion.div
          initial={{ opacity: 0, y: 6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ duration: 0.12, ease: 'easeOut' }}
          className="absolute bottom-9 left-0 z-50 w-[210px] rounded-[5px] border border-line-strong bg-panel p-2 shadow-[0_12px_40px_-8px_rgba(0,0,0,0.8)]"
        >
          <input
            autoFocus
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                submit()
              }
            }}
            list="batch-tags-list"
            placeholder="add tag to all…"
            className="h-7 w-full rounded-[4px] border border-line bg-surface px-2 text-[11.5px] text-fg outline-none placeholder:text-fg-faint focus:border-phosphor/45"
          />
          <datalist id="batch-tags-list">
            {tags.map((t) => (
              <option key={t} value={t} />
            ))}
          </datalist>
        </motion.div>
      )}
    </div>
  )
}
