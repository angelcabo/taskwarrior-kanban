// Phosphor palette mappings used by components for dynamic accents.
// Kept in TS (not just CSS) so JS can pick colors per state/agent/priority.
// Values are CSS custom-property references, so the whole board re-themes
// (dark ⇄ light) purely through the cascade — see index.css `[data-theme]`.

export const FG_FAINT = 'var(--color-fg-faint)'

/** Per-state accent. Falls back to dim for unknown/custom states. */
export const STATE_ACCENT: Record<string, string> = {
  triage: 'var(--st-triage)',
  todo: 'var(--st-todo)',
  active: 'var(--st-active)',
  review: 'var(--st-review)',
  done: 'var(--st-done)',
  canceled: 'var(--st-canceled)',
}

/** A terminal glyph that prefixes each column header. */
export const STATE_GLYPH: Record<string, string> = {
  triage: '◇',
  todo: '○',
  active: '◆',
  review: '◈',
  done: '●',
  canceled: '⊘',
}

export function stateAccent(state?: string): string {
  if (!state) return STATE_ACCENT.triage
  return STATE_ACCENT[state] ?? 'var(--color-fg-dim)'
}

/** `active` is the "live" column that glows. */
export function isLiveState(state?: string): boolean {
  return state === 'active'
}

export interface PriorityMeta {
  label: string
  color: string
}
export const PRIORITY: Record<string, PriorityMeta> = {
  H: { label: 'HIGH', color: 'var(--color-coral)' },
  M: { label: 'MED', color: 'var(--color-amber)' },
  L: { label: 'LOW', color: 'var(--color-phosphor-soft)' },
}
export function priorityMeta(p?: string): PriorityMeta | null {
  if (!p) return null
  return PRIORITY[p] ?? { label: p.toUpperCase(), color: 'var(--color-fg-dim)' }
}

/** Agents get distinct hues drawn from the same accent family. */
const AGENT_COLOR: Record<string, string> = {
  claude: 'var(--color-phosphor)',
  codex: 'var(--color-amber)',
  mock: 'var(--ag-muted)',
}
const AGENT_FALLBACK = ['#62d0ff', '#c79bff', '#ff8fb0', '#9be36b']
export function agentColor(agent?: string): string {
  if (!agent) return FG_FAINT
  if (AGENT_COLOR[agent]) return AGENT_COLOR[agent]
  // stable hash → fallback hue
  let h = 0
  for (let i = 0; i < agent.length; i++) h = (h * 31 + agent.charCodeAt(i)) >>> 0
  return AGENT_FALLBACK[h % AGENT_FALLBACK.length]
}

/**
 * Projects get a stable hue from a theme-aware palette. Unlike the agent
 * fallback hexes, every entry is a CSS var tuned for both themes, so project
 * lane labels stay legible in light mode and re-theme through the cascade.
 */
const PROJECT_PALETTE = [
  'var(--color-phosphor)',
  'var(--color-amber)',
  'var(--color-rose)',
  'var(--color-phosphor-soft)',
  'var(--st-review)',
  'var(--st-todo)',
  'var(--color-coral)',
]
export function projectColor(project?: string): string {
  if (!project) return FG_FAINT
  let h = 0
  for (let i = 0; i < project.length; i++) h = (h * 31 + project.charCodeAt(i)) >>> 0
  return PROJECT_PALETTE[h % PROJECT_PALETTE.length]
}

/** Accent for a swimlane in the active grouping dimension. */
export function groupColor(field: 'agent' | 'project', value?: string | null): string {
  return field === 'project' ? projectColor(value ?? undefined) : agentColor(value ?? undefined)
}

export const URGENCY_COLOR: Record<string, string> = {
  low: 'var(--urg-low)',
  mid: 'var(--color-phosphor-soft)',
  high: 'var(--color-amber)',
  critical: 'var(--color-coral)',
}
