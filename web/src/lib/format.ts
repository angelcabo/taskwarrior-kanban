// Date / urgency / project formatting helpers.

/** Parse a Taskwarrior timestamp ("20260605T175330Z") or ISO string to a Date. */
export function parseTwDate(s?: string): Date | null {
  if (!s) return null
  const m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})Z$/.exec(s)
  if (m) {
    const [, Y, Mo, D, H, Mi, S] = m
    return new Date(Date.UTC(+Y, +Mo - 1, +D, +H, +Mi, +S))
  }
  const d = new Date(s)
  return isNaN(d.getTime()) ? null : d
}

const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

/** Compact relative time, terminal-style: "now", "4m", "3h", "2d", "5w". */
export function relTime(s?: string): string {
  const d = parseTwDate(s)
  if (!d) return ''
  const diff = Date.now() - d.getTime()
  const abs = Math.abs(diff)
  const suffix = diff < 0 ? '' : ''
  if (abs < 45 * 1000) return 'now'
  if (abs < HOUR) return `${Math.round(abs / MIN)}m${suffix}`
  if (abs < DAY) return `${Math.round(abs / HOUR)}h${suffix}`
  if (abs < 7 * DAY) return `${Math.round(abs / DAY)}d${suffix}`
  if (abs < 60 * DAY) return `${Math.round(abs / (7 * DAY))}w${suffix}`
  return `${Math.round(abs / (30 * DAY))}mo${suffix}`
}

export interface DueInfo {
  text: string
  iso: string
  overdue: boolean
  soon: boolean // within 24h
}

export function dueInfo(s?: string): DueInfo | null {
  const d = parseTwDate(s)
  if (!d) return null
  const diff = d.getTime() - Date.now()
  const overdue = diff < 0
  const soon = diff >= 0 && diff < DAY
  let text: string
  const abs = Math.abs(diff)
  if (abs < HOUR) text = `${Math.max(1, Math.round(abs / MIN))}m`
  else if (abs < DAY) text = `${Math.round(abs / HOUR)}h`
  else if (abs < 14 * DAY) text = `${Math.round(abs / DAY)}d`
  else text = `${Math.round(abs / (7 * DAY))}w`
  return {
    text: overdue ? `${text} over` : text,
    iso: d.toISOString(),
    overdue,
    soon,
  }
}

/** Full human timestamp for tooltips/detail. */
export function fullTime(s?: string): string {
  const d = parseTwDate(s)
  if (!d) return '—'
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

export function fmtUrgency(u: number): string {
  return u.toFixed(1)
}

/** Split a dotted Taskwarrior project ("acme.billing") into parts. */
export function projectParts(p?: string): string[] {
  if (!p) return []
  return p.split('.')
}

/** Last segment of a project path, for compact display. */
export function projectLeaf(p?: string): string {
  const parts = projectParts(p)
  return parts.length ? parts[parts.length - 1] : ''
}

export function clamp(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + '…' : s
}
