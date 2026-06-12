import { create } from 'zustand'
import type { Board, Schema, Snapshot, Task } from './types'

export type ChangeKind = 'new' | 'state' | 'agent' | 'modified' | 'gone'

export interface ChangeMark {
  ts: number
  kind: ChangeKind
  from?: string
  to?: string
}

export interface Toast {
  id: number
  title: string // task description (clamped)
  detail: string // e.g. "claude ▸ active"
  accent: string
  uuid?: string
  ts: number
}

interface SelfOp {
  ts: number
  to?: string
}

let toastSeq = 1
const SELF_WINDOW = 6000 // ms during which a change is attributed to the local user
const CHANGE_TTL = 2600 // ms a card keeps its "just changed" glow

function recentSelf(self: Record<string, SelfOp>, uuid: string, now: number, to?: string) {
  const op = self[uuid]
  if (!op) return false
  if (now - op.ts > SELF_WINDOW) return false
  if (to !== undefined && op.to !== undefined) return op.to === to
  return true
}

interface State {
  schema: Schema | null
  boards: Board[]
  activeBoardId: string | null

  tasks: Task[]
  byUuid: Record<string, Task>
  /** urgency bucket computed relative to the current board (per-user urgency scales vary wildly). */
  urgencyRank: Record<string, 'low' | 'mid' | 'high' | 'critical'>
  generatedAt: number | null
  loaded: boolean

  connected: boolean
  bootError: string | null

  search: string
  projectFilter: string | null
  swimlanes: boolean
  selectedUuid: string | null
  /** uuids picked for batch operations (independent of the detail drawer). */
  selection: Set<string>
  composerOpen: boolean
  composerState: string | null // preselected column when adding
  boardManagerOpen: boolean
  helpOpen: boolean
  theme: 'dark' | 'light' // resolved/effective theme (drives the [data-theme] cascade)
  themePref: ThemePref // user choice: dark · light · follow-system

  changed: Record<string, ChangeMark>
  selfOps: Record<string, SelfOp>
  toasts: Toast[]

  setSchema: (s: Schema) => void
  setBoards: (boards: Board[], activeBoardId: string | null) => void
  setActiveBoard: (id: string) => void
  ingest: (snap: Snapshot) => void
  setConnected: (c: boolean) => void
  setBootError: (e: string | null) => void
  /** Treat the next snapshot as a fresh load (no glow/toasts) — used on board switch. */
  markReload: () => void

  setSearch: (s: string) => void
  setProjectFilter: (p: string | null) => void
  toggleSwimlanes: () => void
  select: (uuid: string | null) => void
  /** Toggle a single uuid's membership in the batch selection. */
  toggleSelect: (uuid: string) => void
  /** Add (or with `on:false` remove) many uuids from the batch selection. */
  selectMany: (uuids: string[], on?: boolean) => void
  clearSelection: () => void
  openComposer: (state?: string | null) => void
  closeComposer: () => void
  setBoardManagerOpen: (o: boolean) => void
  setHelpOpen: (o: boolean) => void
  /** Cycle the theme preference dark → light → system. */
  cycleTheme: () => void
  /** Re-resolve the effective theme from the OS — a no-op unless pref is 'system'. */
  syncSystemTheme: () => void

  noteSelfOp: (uuid: string, to?: string) => void
  /** Optimistically patch a task locally for instant feedback before the snapshot lands. */
  optimistic: (uuid: string, patch: Partial<Task>) => void
  dismissToast: (id: number) => void
  /** Push an app-level toast (e.g. an error or confirmation). */
  notify: (detail: string, accent?: string, title?: string) => void
}

export type ThemePref = 'dark' | 'light' | 'system'
const THEME_KEY = 'twk-theme'
const THEME_ORDER: ThemePref[] = ['dark', 'light', 'system']

function readThemePref(): ThemePref {
  if (typeof localStorage === 'undefined') return 'dark'
  const v = localStorage.getItem(THEME_KEY)
  // Default to dark (the phosphor identity) when nothing — or a legacy value — is stored.
  return v === 'light' || v === 'system' ? v : 'dark'
}
function systemTheme(): 'dark' | 'light' {
  if (typeof window === 'undefined' || !window.matchMedia) return 'dark'
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}
function resolveTheme(pref: ThemePref): 'dark' | 'light' {
  return pref === 'system' ? systemTheme() : pref
}
function applyTheme(theme: 'dark' | 'light') {
  if (typeof document !== 'undefined') document.documentElement.dataset.theme = theme
}
// Resolve + apply at module load (before first paint) so a stored theme doesn't flash.
const initialPref = readThemePref()
const initialTheme = resolveTheme(initialPref)
applyTheme(initialTheme)

export const activeBoard = (s: State): Board | null =>
  s.boards.find((b) => b.id === s.activeBoardId) ?? s.boards[0] ?? null

export const useStore = create<State>((set) => ({
  schema: null,
  boards: [],
  activeBoardId: null,

  tasks: [],
  byUuid: {},
  urgencyRank: {},
  generatedAt: null,
  loaded: false,

  connected: false,
  bootError: null,

  search: '',
  projectFilter: null,
  swimlanes: false,
  selectedUuid: null,
  selection: new Set<string>(),
  composerOpen: false,
  composerState: null,
  boardManagerOpen: false,
  helpOpen: false,
  theme: initialTheme,
  themePref: initialPref,

  changed: {},
  selfOps: {},
  toasts: [],

  setSchema: (schema) => set({ schema }),
  setBoards: (boards, activeBoardId) =>
    set((st) => ({ boards, activeBoardId: activeBoardId ?? st.activeBoardId ?? boards[0]?.id ?? null })),
  setActiveBoard: (id) => set({ activeBoardId: id }),
  setConnected: (connected) => set({ connected }),
  setBootError: (bootError) => set({ bootError }),
  markReload: () => set({ loaded: false, changed: {} }),

  setSearch: (search) => set({ search }),
  setProjectFilter: (projectFilter) => set({ projectFilter }),
  toggleSwimlanes: () => set((s) => ({ swimlanes: !s.swimlanes })),
  select: (selectedUuid) => set({ selectedUuid }),
  toggleSelect: (uuid) =>
    set((st) => {
      const selection = new Set(st.selection)
      if (selection.has(uuid)) selection.delete(uuid)
      else selection.add(uuid)
      return { selection }
    }),
  selectMany: (uuids, on = true) =>
    set((st) => {
      const selection = new Set(st.selection)
      for (const u of uuids) on ? selection.add(u) : selection.delete(u)
      return { selection }
    }),
  clearSelection: () => set((st) => (st.selection.size ? { selection: new Set<string>() } : {})),
  openComposer: (composerState = null) => set({ composerOpen: true, composerState }),
  closeComposer: () => set({ composerOpen: false, composerState: null }),
  setBoardManagerOpen: (boardManagerOpen) => set({ boardManagerOpen }),
  setHelpOpen: (helpOpen) => set({ helpOpen }),
  cycleTheme: () =>
    set((st) => {
      const themePref = THEME_ORDER[(THEME_ORDER.indexOf(st.themePref) + 1) % THEME_ORDER.length]
      if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_KEY, themePref)
      const theme = resolveTheme(themePref)
      applyTheme(theme)
      return { themePref, theme }
    }),
  syncSystemTheme: () =>
    set((st) => {
      if (st.themePref !== 'system') return {}
      const theme = systemTheme()
      if (theme === st.theme) return {}
      applyTheme(theme)
      return { theme }
    }),

  noteSelfOp: (uuid, to) =>
    set((st) => ({ selfOps: { ...st.selfOps, [uuid]: { ts: Date.now(), to } } })),

  optimistic: (uuid, patch) =>
    set((st) => {
      const cur = st.byUuid[uuid]
      if (!cur) return {}
      const updated = { ...cur, ...patch }
      return {
        byUuid: { ...st.byUuid, [uuid]: updated },
        tasks: st.tasks.map((t) => (t.uuid === uuid ? updated : t)),
      }
    }),

  dismissToast: (id) => set((st) => ({ toasts: st.toasts.filter((t) => t.id !== id) })),

  notify: (detail, accent = 'var(--color-coral)', title = '') =>
    set((st) => ({
      toasts: [...st.toasts, { id: toastSeq++, title, detail, accent, ts: Date.now() }].slice(-5),
    })),

  ingest: (snap) =>
    set((st) => {
      const now = Date.now()
      const prev = st.byUuid
      const next: Record<string, Task> = {}
      const changed: Record<string, ChangeMark> = { ...st.changed }
      const newToasts: Toast[] = []
      const firstLoad = !st.loaded

      const arrow = '▸' // ▸

      for (const t of snap.tasks) {
        next[t.uuid] = t
        if (firstLoad) continue
        const old = prev[t.uuid]
        if (!old) {
          changed[t.uuid] = { ts: now, kind: 'new' }
          if (!recentSelf(st.selfOps, t.uuid, now)) {
            newToasts.push({
              id: toastSeq++,
              title: t.description,
              detail: `created${t.agent ? ` · ${t.agent}` : ''}`,
              accent: 'var(--color-phosphor)',
              uuid: t.uuid,
              ts: now,
            })
          }
          continue
        }
        if (old.state !== t.state) {
          changed[t.uuid] = { ts: now, kind: 'state', from: old.state, to: t.state }
          if (!recentSelf(st.selfOps, t.uuid, now, t.state)) {
            newToasts.push({
              id: toastSeq++,
              title: t.description,
              detail: `${t.agent ? `${t.agent} ` : ''}${arrow} ${t.state ?? 'triage'}`,
              accent: 'var(--color-phosphor)',
              uuid: t.uuid,
              ts: now,
            })
          }
        } else if (old.agent !== t.agent) {
          changed[t.uuid] = { ts: now, kind: 'agent', from: old.agent, to: t.agent }
          if (!recentSelf(st.selfOps, t.uuid, now)) {
            newToasts.push({
              id: toastSeq++,
              title: t.description,
              detail: t.agent ? `assigned ${arrow} ${t.agent}` : 'unassigned',
              accent: 'var(--color-amber)',
              uuid: t.uuid,
              ts: now,
            })
          }
        } else if (old.modified !== t.modified) {
          changed[t.uuid] = { ts: now, kind: 'modified' }
        }
      }

      // Tasks that left the filtered set (completed/deleted/filtered out).
      if (!firstLoad) {
        for (const uuid in prev) {
          if (next[uuid]) continue
          if (!recentSelf(st.selfOps, uuid, now)) {
            const o = prev[uuid]
            newToasts.push({
              id: toastSeq++,
              title: o.description,
              detail: 'cleared from board',
              accent: 'var(--color-fg-dim)',
              uuid,
              ts: now,
            })
          }
        }
      }

      // prune stale glow marks
      for (const k in changed) {
        if (now - changed[k].ts > CHANGE_TTL && !next[k]) delete changed[k]
        else if (now - changed[k].ts > CHANGE_TTL) delete changed[k]
      }

      const toasts = [...st.toasts, ...newToasts].slice(-5)

      // Drop any selected uuids that left the board (completed / deleted / filtered out)
      // so the batch count stays honest and the action bar dismisses when empty.
      let selection = st.selection
      if (selection.size) {
        const kept = [...selection].filter((u) => next[u])
        if (kept.length !== selection.size) selection = new Set(kept)
      }

      // relative urgency buckets across the whole board
      const urgencyRank: Record<string, 'low' | 'mid' | 'high' | 'critical'> = {}
      const ranked = [...snap.tasks].sort((a, b) => a.urgency - b.urgency)
      const n = ranked.length
      ranked.forEach((t, i) => {
        const p = n <= 1 ? 1 : i / (n - 1)
        urgencyRank[t.uuid] = p > 0.85 ? 'critical' : p > 0.6 ? 'high' : p > 0.3 ? 'mid' : 'low'
      })

      return {
        tasks: snap.tasks,
        byUuid: next,
        urgencyRank,
        generatedAt: snap.generatedAt,
        loaded: true,
        connected: true,
        changed,
        toasts,
        selection,
      }
    }),
}))
