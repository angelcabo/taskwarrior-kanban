import { useEffect, useRef, useState } from 'react'
import { Plus, LayoutGrid, Rows3, HelpCircle, Search, Filter, Sun, Moon, Monitor, Folder } from 'lucide-react'
import { activeBoard, useStore } from '../lib/store'
import { api } from '../lib/api'
import { projectColor, stateAccent, STATE_GLYPH } from '../lib/theme'
import { projectLeaf } from '../lib/format'
import { Menu, IconButton, cx, hexA } from './ui'

function useNow(intervalMs = 1000) {
  const [, set] = useState(0)
  useEffect(() => {
    const t = setInterval(() => set((n) => n + 1), intervalMs)
    return () => clearInterval(t)
  }, [intervalMs])
}

export function TopBar() {
  const board = useStore(activeBoard)
  const boards = useStore((s) => s.boards)
  const schema = useStore((s) => s.schema)
  const setActiveBoard = useStore((s) => s.setActiveBoard)
  const setBoardManagerOpen = useStore((s) => s.setBoardManagerOpen)
  const setHelpOpen = useStore((s) => s.setHelpOpen)
  const openComposer = useStore((s) => s.openComposer)
  const swimlanes = useStore((s) => s.swimlanes)
  const toggleSwimlanes = useStore((s) => s.toggleSwimlanes)
  const themePref = useStore((s) => s.themePref)
  const cycleTheme = useStore((s) => s.cycleTheme)

  return (
    <header className="relative z-30 shrink-0 border-b border-line bg-ink/80 backdrop-blur-sm">
      <div className="flex h-12 items-center gap-3 px-4">
        {/* brand */}
        <div className="flex items-center gap-2 pr-1">
          <span className="text-phosphor glow-phosphor text-[15px] leading-none">▌</span>
          <span className="text-[13px] font-bold tracking-tight text-fg">
            task<span className="text-phosphor">warrior</span>
          </span>
          <span className="hidden text-[10px] uppercase tracking-[0.25em] text-fg-faint sm:inline">
            board
          </span>
        </div>

        <div className="h-5 w-px bg-line" />

        {/* board switcher */}
        <Menu
          width={220}
          align="left"
          className="min-w-[150px]"
          value={board?.id ?? null}
          items={[
            ...boards.map((b) => ({ value: b.id, label: b.name, hint: `${b.columns.length} col` })),
            { value: '__manage', label: '⚙  manage boards…', accent: 'var(--color-fg-dim)' },
          ]}
          onChange={(v) => {
            if (v === '__manage') return setBoardManagerOpen(true)
            if (v) {
              setActiveBoard(v)
              api.setActiveBoard(v).catch(() => {})
            }
          }}
        />

        {/* active context */}
        {schema?.context.active && (
          <button
            onClick={() => setBoardManagerOpen(true)}
            title="active Taskwarrior context"
            className="hidden items-center gap-1.5 rounded-[4px] border border-amber/30 bg-amber/5 px-2 text-[10.5px] text-amber md:inline-flex h-7"
          >
            <Filter size={11} strokeWidth={1.6} />
            {schema.context.active}
          </button>
        )}

        <SearchBox />

        {/* project filter */}
        <ProjectFilter />

        <IconButton active={swimlanes} onClick={toggleSwimlanes} title="toggle swimlanes (s)">
          {swimlanes ? <Rows3 size={13} strokeWidth={1.6} /> : <LayoutGrid size={13} strokeWidth={1.6} />}
          <span className="hidden lg:inline">lanes</span>
        </IconButton>

        <LiveDot />

        <button
          onClick={() => openComposer()}
          title="new task (c)"
          className="inline-flex h-7 items-center gap-1.5 rounded-[4px] border border-phosphor/40 bg-phosphor/10 px-2.5 text-[11px] font-medium text-phosphor transition hover:bg-phosphor/20"
        >
          <Plus size={13} strokeWidth={2} />
          task
        </button>

        <IconButton
          onClick={cycleTheme}
          active={themePref === 'system'}
          title={`theme · ${themePref} — click to cycle (t)`}
          className="!px-1.5"
        >
          {themePref === 'system' ? (
            <Monitor size={14} strokeWidth={1.6} />
          ) : themePref === 'dark' ? (
            <Moon size={14} strokeWidth={1.6} />
          ) : (
            <Sun size={14} strokeWidth={1.6} />
          )}
        </IconButton>

        <IconButton onClick={() => setHelpOpen(true)} title="shortcuts (?)" className="!px-1.5">
          <HelpCircle size={14} strokeWidth={1.6} />
        </IconButton>
      </div>

      <StatusStrip />
    </header>
  )
}

function SearchBox() {
  const search = useStore((s) => s.search)
  const setSearch = useStore((s) => s.setSearch)
  const ref = useRef<HTMLInputElement>(null)
  useEffect(() => {
    const onFocus = () => ref.current?.focus()
    window.addEventListener('twk:focus-search', onFocus as EventListener)
    return () => window.removeEventListener('twk:focus-search', onFocus as EventListener)
  }, [])
  return (
    <div className="relative ml-auto flex max-w-[340px] flex-1 items-center">
      <Search size={13} strokeWidth={1.6} className="pointer-events-none absolute left-2.5 text-fg-faint" />
      <input
        ref={ref}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="search  /"
        className="h-7 w-full rounded-[4px] border border-line bg-surface/70 pl-8 pr-7 text-[12px] text-fg outline-none transition placeholder:text-fg-faint focus:border-phosphor/40 focus:bg-panel"
      />
      {search && (
        <button
          onClick={() => setSearch('')}
          className="absolute right-2 text-fg-faint hover:text-fg"
          title="clear"
        >
          ✕
        </button>
      )}
    </div>
  )
}

function ProjectFilter() {
  const schema = useStore((s) => s.schema)
  const projectFilter = useStore((s) => s.projectFilter)
  const setProjectFilter = useStore((s) => s.setProjectFilter)
  const projects = schema?.projects ?? []
  if (projects.length === 0) return null
  return (
    <Menu
      align="left"
      width={240}
      className="hidden w-[150px] md:block"
      searchable
      allowClear
      placeholder="all projects"
      value={projectFilter}
      items={projects.map((p) => ({
        value: p,
        label: p,
        glyph: (
          <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ background: projectColor(p) }} />
        ),
      }))}
      onChange={setProjectFilter}
      trigger={({ selected }) => (
        <span className="flex items-center gap-1.5 truncate">
          <Folder size={12} strokeWidth={1.6} className="shrink-0 text-fg-faint" />
          <span className="truncate text-fg-dim">
            {selected ? projectLeaf(selected.label) : 'all projects'}
          </span>
        </span>
      )}
    />
  )
}

function LiveDot() {
  const connected = useStore((s) => s.connected)
  const generatedAt = useStore((s) => s.generatedAt)
  useNow(1000)
  const ago = generatedAt ? Math.round((Date.now() - generatedAt) / 1000) : null
  const agoText = ago === null ? '—' : ago < 2 ? 'now' : ago < 60 ? `${ago}s` : `${Math.round(ago / 60)}m`
  return (
    <div
      className="hidden items-center gap-1.5 rounded-[4px] border px-2 text-[10px] uppercase tracking-[0.16em] md:flex h-7"
      style={{
        borderColor: connected ? hexA('var(--color-phosphor)', 0.3) : hexA('var(--color-coral)', 0.3),
        color: connected ? 'var(--color-phosphor)' : 'var(--color-coral)',
        background: connected ? hexA('var(--color-phosphor)', 0.06) : hexA('var(--color-coral)', 0.06),
      }}
      title={connected ? `live · updated ${agoText} ago` : 'reconnecting…'}
    >
      <span
        className={cx('h-1.5 w-1.5 rounded-full', connected && 'pulse-ring')}
        style={{ background: connected ? 'var(--color-phosphor)' : 'var(--color-coral)' }}
      />
      {connected ? 'live' : 'off'}
      <span className="text-fg-faint normal-case tracking-normal">{agoText}</span>
    </div>
  )
}

function StatusStrip() {
  const board = useStore(activeBoard)
  const tasks = useStore((s) => s.tasks)
  const projectFilter = useStore((s) => s.projectFilter)
  const schema = useStore((s) => s.schema)
  if (!board) return null
  const visible = projectFilter ? tasks.filter((t) => t.project === projectFilter) : tasks
  const counts = new Map<string, number>()
  for (const c of board.columns) counts.set(c.match, 0)
  for (const t of visible) {
    const v = (t[board.columnField as keyof typeof t] as string | undefined) ?? board.columns[0]?.match ?? ''
    counts.set(v, (counts.get(v) ?? 0) + 1)
  }
  return (
    <div className="flex h-7 items-center gap-3 border-t border-line/60 px-4 text-[10.5px] text-fg-faint">
      <span className="tabular-nums text-fg-dim">{visible.length} tasks</span>
      <span className="h-3 w-px bg-line" />
      <div className="flex items-center gap-3 overflow-x-auto">
        {board.columns.map((c) => {
          const n = counts.get(c.match) ?? 0
          const accent = stateAccent(c.match)
          return (
            <span key={c.id} className="inline-flex items-center gap-1 whitespace-nowrap" style={{ opacity: n ? 1 : 0.45 }}>
              <span style={{ color: accent }}>{STATE_GLYPH[c.match] ?? '○'}</span>
              <span className="text-fg-dim">{c.label.toLowerCase()}</span>
              <span className="tabular-nums" style={{ color: n ? accent : 'var(--color-fg-faint)' }}>
                {n}
              </span>
            </span>
          )
        })}
      </div>
      <span className="ml-auto hidden items-center gap-3 lg:flex">
        {schema && (
          <>
            <span className="truncate" title={schema.dataLocation}>
              {schema.dataLocation.replace(/^.*\//, '…/')}
            </span>
            <span className="text-fg-faint/70">task {schema.taskVersion}</span>
          </>
        )}
      </span>
    </div>
  )
}
