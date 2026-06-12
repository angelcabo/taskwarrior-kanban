import { useEffect } from 'react'
import { AnimatePresence } from 'motion/react'
import { activeBoard, useStore } from './lib/store'
import { api, openStream } from './lib/api'
import { TopBar } from './components/TopBar'
import { Board } from './components/Board'
import { Toasts } from './components/Toasts'
import { TaskDetail } from './components/TaskDetail'
import { Composer } from './components/Composer'
import { BoardManager } from './components/BoardManager'
import { Help } from './components/Help'
import { SelectionBar } from './components/SelectionBar'

export function App() {
  const board = useStore(activeBoard)
  const loaded = useStore((s) => s.loaded)
  const bootError = useStore((s) => s.bootError)
  const selectedUuid = useStore((s) => s.selectedUuid)
  const selectionCount = useStore((s) => s.selection.size)
  const composerOpen = useStore((s) => s.composerOpen)
  const boardManagerOpen = useStore((s) => s.boardManagerOpen)
  const helpOpen = useStore((s) => s.helpOpen)

  const setSchema = useStore((s) => s.setSchema)
  const setBoards = useStore((s) => s.setBoards)
  const setBootError = useStore((s) => s.setBootError)
  const setConnected = useStore((s) => s.setConnected)
  const ingest = useStore((s) => s.ingest)
  const markReload = useStore((s) => s.markReload)

  // ── bootstrap: schema + boards ────────────────────────────────────────
  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const [schema, boards] = await Promise.all([api.schema(), api.boards()])
        if (cancelled) return
        setSchema(schema)
        setBoards(boards.boards, boards.activeBoardId)
      } catch (e) {
        if (!cancelled) setBootError((e as Error).message)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [setSchema, setBoards, setBootError])

  // ── live stream for the active board's filter ─────────────────────────
  const filter = board?.filter ?? 'status:pending'
  useEffect(() => {
    markReload()
    const dispose = openStream(
      filter,
      (snap) => ingest(snap),
      (status) => setConnected(status === 'open'),
    )
    return () => {
      dispose()
      setConnected(false)
    }
  }, [filter, ingest, setConnected, markReload])

  // ── react to OS color-scheme changes while in "system" theme ──────────
  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => useStore.getState().syncSystemTheme()
    mq.addEventListener('change', onChange)
    return () => mq.removeEventListener('change', onChange)
  }, [])

  // ── global keyboard shortcuts ─────────────────────────────────────────
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const el = document.activeElement as HTMLElement | null
      const typing =
        !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable)
      const st = useStore.getState()
      if (e.key === 'Escape') {
        if (st.helpOpen) st.setHelpOpen(false)
        else if (st.composerOpen) st.closeComposer()
        else if (st.boardManagerOpen) st.setBoardManagerOpen(false)
        else if (st.selectedUuid) st.select(null)
        else if (st.selection.size) st.clearSelection()
        return
      }
      if (typing) return
      switch (e.key) {
        case '/':
          e.preventDefault()
          window.dispatchEvent(new CustomEvent('twk:focus-search'))
          break
        case 'c':
        case 'n':
          e.preventDefault()
          st.openComposer()
          break
        case 'b':
          st.setBoardManagerOpen(true)
          break
        case 's':
          st.toggleSwimlanes()
          break
        case 't':
          st.cycleTheme()
          break
        case '?':
          st.setHelpOpen(true)
          break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  return (
    <div className="relative flex h-full flex-col">
      <TopBar />

      <main className="relative min-h-0 flex-1">
        {bootError ? (
          <BootError message={bootError} />
        ) : !loaded ? (
          <Booting />
        ) : (
          <Board />
        )}
      </main>

      <Toasts />

      <AnimatePresence>{selectedUuid && <TaskDetail key="detail" />}</AnimatePresence>
      <AnimatePresence>{composerOpen && <Composer key="composer" />}</AnimatePresence>
      <AnimatePresence>{boardManagerOpen && <BoardManager key="boards" />}</AnimatePresence>
      <AnimatePresence>{helpOpen && <Help key="help" />}</AnimatePresence>
      <AnimatePresence>{selectionCount > 0 && <SelectionBar key="selection" />}</AnimatePresence>

      {/* CRT atmosphere */}
      <div className="fx fx-vignette" />
      <div className="fx fx-scanlines" />
      <div className="fx fx-grain" />
    </div>
  )
}

function Booting() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="text-[13px] text-fg-dim">
        <span className="text-phosphor glow-soft">●</span> connecting to taskwarrior
        <span className="blink text-phosphor">_</span>
      </div>
    </div>
  )
}

function BootError({ message }: { message: string }) {
  return (
    <div className="flex h-full items-center justify-center p-6">
      <div className="max-w-md rounded-[6px] border border-coral/40 bg-coral/5 p-5">
        <div className="mb-2 text-[11px] uppercase tracking-[0.2em] text-coral">
          ✕ taskwarrior unreachable
        </div>
        <p className="mb-3 text-[12.5px] leading-relaxed text-fg-dim">{message}</p>
        <p className="mb-4 text-[11px] leading-relaxed text-fg-faint">
          Is the API server running? Check that <code className="text-fg-dim">task</code> is on PATH
          and the server started without errors.
        </p>
        <button
          onClick={() => location.reload()}
          className="h-7 rounded-[4px] border border-line-strong bg-surface px-3 text-[11px] text-fg-dim hover:border-phosphor/40 hover:text-phosphor"
        >
          retry
        </button>
      </div>
    </div>
  )
}
