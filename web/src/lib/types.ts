// Shared domain types. Mirrored in server/src/types.ts — keep them in sync.

export interface Annotation {
  entry: string
  description: string
}

/** A Taskwarrior task, normalized for the board. */
export interface Task {
  uuid: string
  id: number
  description: string
  status: string // pending | completed | deleted | waiting | recurring
  project?: string
  priority?: string // H | M | L
  state?: string // triage | todo | active | review | done | canceled (UDA)
  agent?: string // claude | codex | mock (UDA)
  branch?: string // git branch (UDA)
  tags: string[]
  urgency: number
  entry: string
  modified?: string
  due?: string
  scheduled?: string
  wait?: string
  start?: string
  end?: string
  annotations?: Annotation[]
  depends?: string[] // uuids
  // Derived, server-computed conveniences:
  active: boolean // task is started (+ACTIVE)
  blocked: boolean // has unresolved dependencies
  urgencyBucket: 'low' | 'mid' | 'high' | 'critical'
}

export interface UdaDef {
  name: string
  label: string
  type: string
  values?: string[]
}

export interface ContextDef {
  name: string
  filter: string
}

export interface Schema {
  states: string[]
  stateLabel: string
  agents: string[]
  priorities: string[]
  projects: string[]
  tags: string[]
  udas: UdaDef[]
  dataLocation: string
  taskVersion: string
  context: { active: string | null; defined: ContextDef[] }
}

export interface BoardColumn {
  id: string
  label: string
  /** value of `columnField` that lands a task in this column; "" matches state-less tasks */
  match: string
  accent?: string
}

export type SortKey = 'urgency' | 'due' | 'priority' | 'modified' | 'entry'

export interface Board {
  id: string
  name: string
  /** base Taskwarrior filter applied to every column, e.g. "status:pending" */
  filter: string
  columnField: string // "state"
  columns: BoardColumn[]
  sort: SortKey
  groupBy: null | 'agent' | 'project'
}

export interface Snapshot {
  tasks: Task[]
  generatedAt: number
}
