import { motion } from 'motion/react'
import { useEffect, useRef, useState } from 'react'
import { CornerDownLeft } from 'lucide-react'
import { useStore } from '../lib/store'
import { api, type TaskInput } from '../lib/api'
import { agentColor, priorityMeta, stateAccent, STATE_GLYPH } from '../lib/theme'
import { Field, Kbd, Menu, TextInput, cx } from './ui'

export function Composer() {
  const schema = useStore((s) => s.schema)
  const close = useStore((s) => s.closeComposer)
  const preState = useStore((s) => s.composerState)
  const noteSelfOp = useStore((s) => s.noteSelfOp)
  const notify = useStore((s) => s.notify)

  const firstState = preState ?? schema?.states[0] ?? 'triage'
  const [description, setDescription] = useState('')
  const [state, setState] = useState<string | null>(firstState)
  const [agent, setAgent] = useState<string | null>(null)
  const [priority, setPriority] = useState<string | null>(null)
  const [project, setProject] = useState('')
  const [branch, setBranch] = useState('')
  const [due, setDue] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagDraft, setTagDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const descRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    descRef.current?.focus()
  }, [])

  if (!schema) return null

  const addTag = (raw: string) => {
    const t = raw.trim().replace(/^[+#]/, '')
    if (t && !tags.includes(t)) setTags((prev) => [...prev, t])
    setTagDraft('')
  }

  async function submit(keepOpen: boolean) {
    if (!description.trim() || busy) return
    setBusy(true)
    const input: TaskInput = {
      description: description.trim(),
      state: state ?? undefined,
      agent: agent ?? undefined,
      priority: priority ?? undefined,
      project: project.trim() || undefined,
      branch: branch.trim() || undefined,
      due: due.trim() || undefined,
      tags: tags.length ? tags : undefined,
    }
    try {
      const { task } = await api.create(input)
      noteSelfOp(task.uuid)
      if (keepOpen) {
        setDescription('')
        setTags([])
        setBranch('')
        descRef.current?.focus()
      } else {
        close()
      }
    } catch (e) {
      notify((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <motion.div
        className="fixed inset-0 z-40 bg-abyss/55 backdrop-blur-[2px]"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        onClick={close}
      />
      <motion.div
        className="fixed left-1/2 top-[14vh] z-40 w-[min(560px,92vw)] -translate-x-1/2"
        initial={{ opacity: 0, y: -14, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: -10, scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 420, damping: 34 }}
      >
        <div className="overflow-hidden rounded-[7px] border border-line-strong bg-ink/95 shadow-[0_30px_80px_-20px_rgba(0,0,0,0.9)]">
          <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
            <span className="text-phosphor glow-soft">›</span>
            <span className="text-[11px] uppercase tracking-[0.2em] text-fg-dim">new task</span>
            <span className="ml-auto text-[10px] text-fg-faint">
              <Kbd>esc</Kbd> to close
            </span>
          </div>

          <div className="space-y-4 p-4">
            <input
              ref={descRef}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  submit(e.metaKey || e.ctrlKey)
                }
              }}
              placeholder="describe the task…"
              className="w-full rounded-[5px] border border-line bg-surface px-3 py-2.5 text-[15px] text-fg outline-none transition placeholder:text-fg-faint focus:border-phosphor/45 focus:bg-panel"
            />

            <div className="grid grid-cols-3 gap-3">
              <Field label="state">
                <Menu
                  value={state}
                  items={schema.states.map((s) => ({
                    value: s,
                    label: s,
                    accent: stateAccent(s),
                    glyph: <span>{STATE_GLYPH[s] ?? '○'}</span>,
                  }))}
                  onChange={setState}
                />
              </Field>
              <Field label="agent">
                <Menu
                  allowClear
                  placeholder="unassigned"
                  value={agent}
                  items={schema.agents.map((a) => ({
                    value: a,
                    label: a,
                    accent: agentColor(a),
                    glyph: <span className="h-1.5 w-1.5 rounded-full" style={{ background: agentColor(a) }} />,
                  }))}
                  onChange={setAgent}
                />
              </Field>
              <Field label="priority">
                <Menu
                  allowClear
                  placeholder="none"
                  value={priority}
                  items={schema.priorities.map((p) => {
                    const m = priorityMeta(p)!
                    return { value: p, label: m.label, accent: m.color }
                  })}
                  onChange={setPriority}
                />
              </Field>
              <Field label="project">
                <TextInput
                  list="composer-projects"
                  value={project}
                  onChange={(e) => setProject(e.target.value)}
                  placeholder="none"
                />
                <datalist id="composer-projects">
                  {schema.projects.map((p) => (
                    <option key={p} value={p} />
                  ))}
                </datalist>
              </Field>
              <Field label="branch">
                <TextInput value={branch} onChange={(e) => setBranch(e.target.value)} placeholder="none" />
              </Field>
              <Field label="due" hint="eod">
                <TextInput value={due} onChange={(e) => setDue(e.target.value)} placeholder="none" />
              </Field>
            </div>

            <Field label="tags">
              <div className="flex flex-wrap items-center gap-1.5 rounded-[4px] border border-line bg-surface px-2 py-1.5">
                {tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-[3px] bg-panel-hi px-1.5 py-[2px] text-[11px] text-fg-dim"
                  >
                    #{t}
                    <button onClick={() => setTags(tags.filter((x) => x !== t))} className="hover:text-coral">
                      ✕
                    </button>
                  </span>
                ))}
                <input
                  value={tagDraft}
                  onChange={(e) => setTagDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ' || e.key === ',') {
                      e.preventDefault()
                      addTag(tagDraft)
                    }
                  }}
                  placeholder={tags.length ? '' : 'add tags…'}
                  className="h-6 flex-1 bg-transparent text-[12px] text-fg outline-none placeholder:text-fg-faint"
                />
              </div>
            </Field>
          </div>

          <div className="flex items-center justify-between border-t border-line px-4 py-2.5">
            <span className="text-[10px] text-fg-faint">
              <Kbd>⌘</Kbd> <Kbd>↵</Kbd> create &amp; add another
            </span>
            <button
              onClick={() => submit(false)}
              disabled={!description.trim() || busy}
              className={cx(
                'inline-flex h-8 items-center gap-2 rounded-[5px] border px-3 text-[12px] font-medium transition',
                description.trim()
                  ? 'border-phosphor/45 bg-phosphor/12 text-phosphor hover:bg-phosphor/20'
                  : 'cursor-not-allowed border-line text-fg-faint',
              )}
            >
              create
              <CornerDownLeft size={13} strokeWidth={1.8} />
            </button>
          </div>
        </div>
      </motion.div>
    </>
  )
}
