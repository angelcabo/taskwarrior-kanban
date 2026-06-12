import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { Check, Copy, Play, Square, Trash2, X } from 'lucide-react'
import { useStore } from '../lib/store'
import { api, type TaskPatch } from '../lib/api'
import type { Task } from '../lib/types'
import { agentColor, priorityMeta, stateAccent, STATE_GLYPH } from '../lib/theme'
import { fullTime, relTime } from '../lib/format'
import { ConfirmButton, Field, Menu, TextArea, TextInput, cx, hexA } from './ui'

export function TaskDetail() {
  const uuid = useStore((s) => s.selectedUuid)
  const task = useStore((s) => (uuid ? s.byUuid[uuid] : undefined))
  const select = useStore((s) => s.select)
  const schema = useStore((s) => s.schema)
  const noteSelfOp = useStore((s) => s.noteSelfOp)
  const optimistic = useStore((s) => s.optimistic)
  const notify = useStore((s) => s.notify)

  // close if the task left the board (completed / deleted)
  useEffect(() => {
    if (uuid && !task) select(null)
  }, [uuid, task, select])

  const [desc, setDesc] = useState('')
  const [project, setProject] = useState('')
  const [branch, setBranch] = useState('')
  const [due, setDue] = useState('')
  const [newTag, setNewTag] = useState('')
  const [newAnn, setNewAnn] = useState('')

  useEffect(() => {
    if (!task) return
    setDesc(task.description)
    setProject(task.project ?? '')
    setBranch(task.branch ?? '')
    setDue(task.due ? task.due : '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uuid])

  if (!task || !schema || !uuid) return null
  const accent = stateAccent(task.state)
  const agentC = agentColor(task.agent)

  async function run<T>(p: Promise<T>, opt?: Partial<Task>) {
    noteSelfOp(uuid!)
    if (opt) optimistic(uuid!, opt)
    try {
      await p
    } catch (e) {
      notify((e as Error).message)
    }
  }
  const patch = (p: TaskPatch, opt?: Partial<Task>) => run(api.patch(uuid, p), opt)

  const commit = (field: 'project' | 'branch' | 'due', value: string) => {
    const cur = (task[field] as string | undefined) ?? ''
    if (value === cur) return
    patch({ [field]: value } as TaskPatch, { [field]: value || undefined } as Partial<Task>)
  }

  const addTag = (raw: string) => {
    const tag = raw.trim().replace(/^[+#]/, '')
    if (!tag || task.tags.includes(tag)) return
    patch({ addTags: [tag] }, { tags: [...task.tags, tag] })
    setNewTag('')
  }
  const removeTag = (tag: string) =>
    patch({ removeTags: [tag] }, { tags: task.tags.filter((t) => t !== tag) })

  const addAnnotation = (text: string) => {
    if (!text.trim()) return
    run(api.annotate(uuid, text.trim()))
    setNewAnn('')
  }

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-abyss/55 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={() => select(null)}
      />
      <motion.aside
        className="fixed right-0 top-0 z-40 flex h-full w-full max-w-[440px] flex-col border-l border-line-strong bg-ink/95 shadow-[-24px_0_60px_-20px_rgba(0,0,0,0.9)]"
        initial={{ x: '100%' }}
        animate={{ x: 0 }}
        exit={{ x: '100%' }}
        transition={{ type: 'spring', stiffness: 380, damping: 38 }}
        style={{ borderColor: hexA(accent, 0.25) }}
      >
        {/* header */}
        <div className="flex items-center gap-2 border-b border-line px-4 py-3">
          <div className="w-[150px]">
            <Menu
              width={180}
              value={task.state ?? null}
              items={schema.states.map((s) => ({
                value: s,
                label: s,
                accent: stateAccent(s),
                glyph: <span>{STATE_GLYPH[s] ?? '○'}</span>,
              }))}
              onChange={(v) => {
                if (v) run(api.move(uuid, v), { state: v })
              }}
            />
          </div>
          <span className="font-mono text-[11px] text-fg-faint">#{task.id}</span>
          <div className="ml-auto flex items-center gap-1.5">
            <button
              onClick={() => run(task.active ? api.stop(uuid) : api.start(uuid), { active: !task.active })}
              className={cx(
                'inline-flex h-7 items-center gap-1.5 rounded-[4px] border px-2 text-[11px] transition',
                task.active
                  ? 'border-phosphor/40 bg-phosphor/10 text-phosphor'
                  : 'border-line bg-surface/60 text-fg-dim hover:text-fg',
              )}
              title={task.active ? 'stop (taskwarrior stop)' : 'start (taskwarrior start)'}
            >
              {task.active ? <Square size={12} strokeWidth={1.8} /> : <Play size={12} strokeWidth={1.8} />}
              {task.active ? 'stop' : 'start'}
            </button>
            <button
              onClick={() => run(api.done(uuid)).then(() => select(null))}
              className="inline-flex h-7 items-center gap-1.5 rounded-[4px] border border-line bg-surface/60 px-2 text-[11px] text-fg-dim transition hover:border-phosphor/40 hover:text-phosphor"
              title="complete (taskwarrior done — sets status:completed)"
            >
              <Check size={13} strokeWidth={2} />
              done
            </button>
            <ConfirmButton onConfirm={() => run(api.remove(uuid)).then(() => select(null))} confirmLabel="delete?">
              <Trash2 size={13} strokeWidth={1.6} />
            </ConfirmButton>
            <button
              onClick={() => select(null)}
              className="flex h-7 w-7 items-center justify-center rounded-[4px] text-fg-faint hover:bg-panel-hi hover:text-fg"
            >
              <X size={15} strokeWidth={1.6} />
            </button>
          </div>
        </div>

        {/* body */}
        <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <TextArea
            value={desc}
            rows={Math.min(6, Math.max(2, Math.ceil(desc.length / 46)))}
            onChange={(e) => setDesc(e.target.value)}
            onBlur={() => desc.trim() && desc !== task.description && patch({ description: desc }, { description: desc })}
            className="!text-[14px] !leading-relaxed"
          />

          <div className="grid grid-cols-2 gap-3">
            <Field label="agent">
              <Menu
                width={180}
                allowClear
                placeholder="unassigned"
                value={task.agent ?? null}
                items={schema.agents.map((a) => ({
                  value: a,
                  label: a,
                  accent: agentColor(a),
                  glyph: <span className="h-1.5 w-1.5 rounded-full" style={{ background: agentColor(a) }} />,
                }))}
                onChange={(v) => patch({ agent: v ?? '' }, { agent: v ?? undefined })}
              />
            </Field>
            <Field label="priority">
              <Menu
                width={150}
                allowClear
                placeholder="none"
                value={task.priority ?? null}
                items={schema.priorities.map((p) => {
                  const m = priorityMeta(p)!
                  return { value: p, label: m.label, accent: m.color }
                })}
                onChange={(v) => patch({ priority: v ?? '' }, { priority: v ?? undefined })}
              />
            </Field>
            <Field label="project">
              <TextInput
                list="projects-list"
                value={project}
                onChange={(e) => setProject(e.target.value)}
                onBlur={() => commit('project', project)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                placeholder="none"
              />
              <datalist id="projects-list">
                {schema.projects.map((p) => (
                  <option key={p} value={p} />
                ))}
              </datalist>
            </Field>
            <Field label="branch">
              <TextInput
                value={branch}
                onChange={(e) => setBranch(e.target.value)}
                onBlur={() => commit('branch', branch)}
                onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
                placeholder="none"
              />
            </Field>
          </div>

          <Field label="due" hint="eod · tomorrow · 2026-06-20">
            <TextInput
              value={due}
              onChange={(e) => setDue(e.target.value)}
              onBlur={() => commit('due', due)}
              onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
              placeholder="none"
            />
          </Field>

          {/* tags */}
          <div>
            <div className="mb-1.5 text-[10px] uppercase tracking-[0.14em] text-fg-faint">tags</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {task.tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 rounded-[3px] border border-line bg-surface px-1.5 py-[3px] text-[11px] text-fg-dim"
                >
                  #{t}
                  <button onClick={() => removeTag(t)} className="text-fg-faint hover:text-coral">
                    ✕
                  </button>
                </span>
              ))}
              <input
                value={newTag}
                onChange={(e) => setNewTag(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ' || e.key === ',') {
                    e.preventDefault()
                    addTag(newTag)
                  }
                }}
                list="tags-list"
                placeholder="+ add"
                className="h-[26px] w-20 rounded-[3px] border border-dashed border-line bg-transparent px-1.5 text-[11px] text-fg outline-none placeholder:text-fg-faint focus:border-phosphor/40"
              />
              <datalist id="tags-list">
                {schema.tags.map((t) => (
                  <option key={t} value={t} />
                ))}
              </datalist>
            </div>
          </div>

          {/* annotations */}
          <div>
            <div className="mb-1.5 text-[10px] uppercase tracking-[0.14em] text-fg-faint">
              annotations
            </div>
            <div className="space-y-1.5">
              {(task.annotations ?? []).map((a, i) => (
                <div
                  key={i}
                  className="group flex items-start gap-2 rounded-[4px] border border-line bg-surface/50 px-2.5 py-1.5"
                >
                  <span className="mt-[2px] text-phosphor/60">›</span>
                  <p className="min-w-0 flex-1 text-[12px] leading-snug text-fg-dim">{a.description}</p>
                  <span className="shrink-0 text-[9.5px] text-fg-faint">{relTime(a.entry)}</span>
                  <button
                    onClick={() => run(api.denotate(uuid, a.description))}
                    className="shrink-0 text-fg-faint opacity-0 transition group-hover:opacity-100 hover:text-coral"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <input
                value={newAnn}
                onChange={(e) => setNewAnn(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addAnnotation(newAnn)}
                placeholder="+ annotate…"
                className="h-[30px] w-full rounded-[4px] border border-dashed border-line bg-transparent px-2.5 text-[12px] text-fg outline-none placeholder:text-fg-faint focus:border-phosphor/40"
              />
            </div>
          </div>

          <MetaFooter task={task} />
        </div>
      </motion.aside>
    </>
  )
}

function MetaFooter({ task }: { task: Task }) {
  const notify = useStore((s) => s.notify)
  const copyUuid = () => {
    navigator.clipboard?.writeText(task.uuid).then(
      () => notify('uuid copied', 'var(--color-phosphor)'),
      () => {},
    )
  }
  const rows: [string, string][] = [
    ['urgency', task.urgency.toFixed(2)],
    ['status', task.status],
    ['entry', fullTime(task.entry)],
    ['modified', fullTime(task.modified)],
  ]
  if (task.depends?.length) rows.push(['depends', `${task.depends.length} task(s)`])
  return (
    <div className="mt-2 space-y-1 border-t border-line pt-3 text-[11px]">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-4">
          <span className="text-fg-faint">{k}</span>
          <span className="truncate text-fg-dim" title={v}>
            {v}
          </span>
        </div>
      ))}
      <button
        onClick={copyUuid}
        className="flex w-full items-center justify-between gap-4 text-left text-fg-faint hover:text-fg-dim"
        title="copy uuid"
      >
        <span>uuid</span>
        <span className="inline-flex items-center gap-1 truncate font-mono">
          {task.uuid.slice(0, 8)}… <Copy size={11} strokeWidth={1.5} />
        </span>
      </button>
    </div>
  )
}
