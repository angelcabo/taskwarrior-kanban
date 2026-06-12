// Thin, typed wrapper around the Taskwarrior CLI. Everything goes through
// execa with the inherited environment (so TASKRC/TASKDATA and the user's
// hooks apply) and never through a shell. After every mutation we call the
// watcher bus's `markDirty()` so SSE clients refresh immediately rather than
// waiting on the filesystem event.
import { execa } from 'execa'
import { expandHome } from './config.js'
import { markDirty } from './watcher.js'
import type { ContextDef, Schema, Task, UdaDef } from './types.js'

// ---------------------------------------------------------------------------
// Low-level execa helpers
// ---------------------------------------------------------------------------

interface TaskResult {
  stdout: string
  stderr: string
  failed: boolean
}

/**
 * Run `task` with the given args. Never uses a shell; inherits process.env so
 * the user's TASKRC/TASKDATA/hooks are respected. `reject: false` so we can
 * surface stderr in a useful error message ourselves.
 */
async function run(args: string[]): Promise<TaskResult> {
  const result = await execa('task', args, { env: process.env, reject: false })
  return {
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    failed: Boolean(result.failed) || (typeof result.exitCode === 'number' && result.exitCode !== 0),
  }
}

/**
 * Strip Taskwarrior's boilerplate stderr preamble (env-override and
 * "Configuration override" notices) so error messages surface only the real
 * problem. These appear because TASKRC/TASKDATA are set in the environment.
 */
function cleanStderr(stderr: string): string {
  return stderr
    .split('\n')
    .filter((line) => {
      const t = line.trim()
      return !(
        t.startsWith('TASKRC override:') ||
        t.startsWith('TASKDATA override:') ||
        t.startsWith('Configuration override ')
      )
    })
    .join('\n')
    .trim()
}

/** Run `task` and throw with cleaned stderr on failure. Returns stdout. */
async function runOrThrow(args: string[]): Promise<string> {
  const result = await run(args)
  if (result.failed) {
    const msg = cleanStderr(result.stderr) || `task ${args.join(' ')} failed`
    throw new Error(msg)
  }
  return result.stdout
}

/**
 * Run a `task ... _get <key>` query, returning the trimmed value or '' if the
 * key is unset. `_get` exits non-zero for an unset key, which we treat as ''.
 */
async function get(key: string): Promise<string> {
  const result = await run(['rc.confirmation=no', 'rc.color=off', '_get', key])
  if (result.failed) return ''
  return result.stdout.trim()
}

/** Split a comma-separated config value, trimming and dropping empties. */
function splitCsv(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/** Split a newline-separated CLI list, trimming and dropping empties. */
function splitLines(value: string): string[] {
  return value
    .split('\n')
    .map((s) => s.trim())
    .filter((s) => s.length > 0)
}

/**
 * Tokenize a board filter string by whitespace. Board filters are simple
 * (e.g. `status:pending project:acme`); advanced quoting is out of scope.
 */
export function tokenizeFilter(filter: string | undefined): string[] {
  if (!filter) return []
  return filter
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0)
}

// ---------------------------------------------------------------------------
// Export + normalization
// ---------------------------------------------------------------------------

/** Raw task shape as emitted by `task export`. Only fields we read are typed. */
interface RawTask {
  uuid: string
  id?: number
  description?: string
  status?: string
  project?: string
  priority?: string
  state?: string
  agent?: string
  branch?: string
  tags?: string[]
  urgency?: number
  entry?: string
  modified?: string
  due?: string
  scheduled?: string
  wait?: string
  start?: string
  end?: string
  annotations?: { entry: string; description: string }[]
  depends?: string[] | string | null
  [key: string]: unknown
}

function bucketFor(urgency: number): Task['urgencyBucket'] {
  return urgency < 4 ? 'low' : urgency < 8 ? 'mid' : urgency < 13 ? 'high' : 'critical'
}

function normalizeDepends(depends: RawTask['depends']): string[] {
  if (Array.isArray(depends)) return depends.filter((d) => typeof d === 'string' && d.length > 0)
  if (typeof depends === 'string' && depends.trim().length > 0) {
    return depends
      .split(',')
      .map((d) => d.trim())
      .filter((d) => d.length > 0)
  }
  return []
}

/** Normalize a raw exported task into the shared `Task` type. */
function normalize(raw: RawTask): Task {
  const urgency = typeof raw.urgency === 'number' ? raw.urgency : 0
  const depends = normalizeDepends(raw.depends)
  return {
    uuid: raw.uuid,
    id: typeof raw.id === 'number' ? raw.id : 0,
    description: raw.description ?? '',
    status: raw.status ?? 'pending',
    project: raw.project,
    priority: raw.priority,
    state: raw.state,
    agent: raw.agent,
    branch: raw.branch,
    tags: Array.isArray(raw.tags) ? raw.tags : [],
    urgency,
    entry: raw.entry ?? '',
    modified: raw.modified,
    due: raw.due,
    scheduled: raw.scheduled,
    wait: raw.wait,
    start: raw.start,
    end: raw.end,
    annotations: raw.annotations,
    depends,
    active: Boolean(raw.start),
    blocked: depends.length > 0,
    urgencyBucket: bucketFor(urgency),
  }
}

/**
 * Export tasks matching `filter` and normalize them.
 *
 * NOTE: with Taskwarrior 3.4 the filter must precede the `export` command —
 * placing it after (`export status:pending`) is parsed as a report name and
 * fails with "Unable to find report". We therefore build args as
 * `[...rcFlags, ...filterTokens, 'export']`.
 */
export async function exportTasks(filter?: string): Promise<Task[]> {
  const args = [
    'rc.json.array=on',
    'rc.confirmation=no',
    'rc.color=off',
    'rc.verbose=nothing',
    ...tokenizeFilter(filter),
    'export',
  ]
  const result = await run(args)
  if (result.failed) {
    const msg = cleanStderr(result.stderr) || `task export ${filter ?? ''} failed`
    throw new Error(msg)
  }
  const text = result.stdout.trim()
  if (!text) return []
  let parsed: RawTask[]
  try {
    parsed = JSON.parse(text) as RawTask[]
  } catch {
    throw new Error(`Failed to parse task export JSON: ${text.slice(0, 200)}`)
  }
  return parsed.map(normalize)
}

/** Export a single task by uuid, or null if it no longer exists. */
export async function getTask(uuid: string): Promise<Task | null> {
  const tasks = await exportTasks(uuid)
  return tasks[0] ?? null
}

// ---------------------------------------------------------------------------
// Mutations — each targets by UUID as the leading filter and marks the bus
// dirty on completion.
// ---------------------------------------------------------------------------

const MUTATE_FLAGS = ['rc.confirmation=no', 'rc.recurrence.confirmation=no']

/** Build attribute-modification tokens shared by add/patch. */
export interface TaskFields {
  description?: string
  project?: string
  priority?: string
  state?: string
  agent?: string
  branch?: string
  due?: string
  addTags?: string[]
  removeTags?: string[]
}

/**
 * Build the attribute tokens (excluding the leading `description`) for an
 * add/modify command. Empty string clears an attribute (e.g. `priority:`).
 */
function attrTokens(fields: TaskFields): string[] {
  const tokens: string[] = []
  const scalar: [keyof TaskFields, string][] = [
    ['project', 'project'],
    ['priority', 'priority'],
    ['state', 'state'],
    ['agent', 'agent'],
    ['branch', 'branch'],
    ['due', 'due'],
  ]
  for (const [key, attr] of scalar) {
    const value = fields[key]
    if (typeof value === 'string') tokens.push(`${attr}:${value}`)
  }
  for (const tag of fields.addTags ?? []) {
    const t = tag.trim()
    if (t) tokens.push(`+${t}`)
  }
  for (const tag of fields.removeTags ?? []) {
    const t = tag.trim()
    if (t) tokens.push(`-${t}`)
  }
  return tokens
}

/** Add a task. Description is the first positional arg (may contain spaces). */
export async function add(fields: TaskFields & { description: string }): Promise<Task> {
  const args = ['rc.confirmation=no', 'add', fields.description, ...attrTokens(fields)]
  await runOrThrow(args)
  markDirty()
  // The freshly added task is tagged +LATEST.
  const tasks = await exportTasks('+LATEST')
  const created = tasks[0]
  if (!created) throw new Error('Task was added but could not be re-read via +LATEST')
  return created
}

/**
 * Patch arbitrary fields on a task. `description` is passed as a single arg so
 * it may contain spaces. Empty strings clear scalar attributes.
 */
export async function patch(uuid: string, fields: TaskFields): Promise<Task> {
  const mods: string[] = []
  if (typeof fields.description === 'string') mods.push(`description:${fields.description}`)
  mods.push(...attrTokens({ ...fields, description: undefined }))
  if (mods.length > 0) {
    await runOrThrow([...MUTATE_FLAGS, uuid, 'modify', ...mods])
    markDirty()
  }
  const task = await getTask(uuid)
  if (!task) throw new Error(`Task ${uuid} not found after patch`)
  return task
}

/**
 * Patch the same fields across many tasks in a single `task <uuids> modify`
 * invocation. `rc.bulk=0` disables the "Modify N tasks?" batch prompt so the
 * one command applies to every uuid without interaction. Returns the count of
 * tasks actually addressed.
 */
export async function patchMany(uuids: string[], fields: TaskFields): Promise<number> {
  if (uuids.length === 0) return 0
  const mods: string[] = []
  if (typeof fields.description === 'string') mods.push(`description:${fields.description}`)
  mods.push(...attrTokens({ ...fields, description: undefined }))
  if (mods.length === 0) return 0
  await runOrThrow([...MUTATE_FLAGS, 'rc.bulk=0', ...uuids, 'modify', ...mods])
  markDirty()
  return uuids.length
}

/** Delete many tasks in a single command (bulk prompt suppressed). */
export async function removeMany(uuids: string[]): Promise<number> {
  if (uuids.length === 0) return 0
  await runOrThrow([...MUTATE_FLAGS, 'rc.bulk=0', ...uuids, 'delete'])
  markDirty()
  return uuids.length
}

/** Move a task to a new state. Empty value clears the state UDA. */
export async function move(uuid: string, state: string): Promise<Task> {
  await runOrThrow([...MUTATE_FLAGS, uuid, 'modify', `state:${state}`])
  markDirty()
  const task = await getTask(uuid)
  if (!task) throw new Error(`Task ${uuid} not found after move`)
  return task
}

type SimpleVerb = 'start' | 'stop' | 'done' | 'delete'

/** Run a simple verb (start/stop/done/delete) against a task. */
async function verb(uuid: string, action: SimpleVerb): Promise<void> {
  await runOrThrow(['rc.confirmation=no', 'rc.recurrence.confirmation=no', uuid, action])
  markDirty()
}

export async function start(uuid: string): Promise<Task> {
  await verb(uuid, 'start')
  const task = await getTask(uuid)
  if (!task) throw new Error(`Task ${uuid} not found after start`)
  return task
}

export async function stop(uuid: string): Promise<Task> {
  await verb(uuid, 'stop')
  const task = await getTask(uuid)
  if (!task) throw new Error(`Task ${uuid} not found after stop`)
  return task
}

export async function done(uuid: string): Promise<Task> {
  await verb(uuid, 'done')
  // A completed task drops out of the pending working set; re-read explicitly.
  const task = await getTask(uuid)
  if (!task) throw new Error(`Task ${uuid} not found after done`)
  return task
}

export async function remove(uuid: string): Promise<void> {
  await verb(uuid, 'delete')
}

export async function annotate(uuid: string, text: string): Promise<Task> {
  await runOrThrow(['rc.confirmation=no', 'rc.recurrence.confirmation=no', uuid, 'annotate', text])
  markDirty()
  const task = await getTask(uuid)
  if (!task) throw new Error(`Task ${uuid} not found after annotate`)
  return task
}

export async function denotate(uuid: string, text: string): Promise<Task> {
  await runOrThrow(['rc.confirmation=no', 'rc.recurrence.confirmation=no', uuid, 'denotate', text])
  markDirty()
  const task = await getTask(uuid)
  if (!task) throw new Error(`Task ${uuid} not found after denotate`)
  return task
}

// ---------------------------------------------------------------------------
// Context operations
// ---------------------------------------------------------------------------

/** Define (or redefine) a context with the given filter tokens. */
export async function defineContext(name: string, filter: string): Promise<void> {
  await runOrThrow(['rc.confirmation=no', 'context', 'define', name, ...tokenizeFilter(filter)])
}

/** Activate a context, or clear it when name is null/empty (`context none`). */
export async function activateContext(name: string | null | undefined): Promise<string | null> {
  const trimmed = name?.trim() ?? ''
  if (!trimmed) {
    await runOrThrow(['rc.confirmation=no', 'context', 'none'])
    return null
  }
  await runOrThrow(['rc.confirmation=no', 'context', trimmed])
  return trimmed
}

/** Delete a context by name. */
export async function deleteContext(name: string): Promise<void> {
  await runOrThrow(['rc.confirmation=no', 'context', 'delete', name])
}

/** Read the active context and the full set of defined contexts. */
export async function getContext(): Promise<{ active: string | null; defined: ContextDef[] }> {
  const activeRaw = (await get('rc.context')).trim()
  const active = !activeRaw || activeRaw.toLowerCase() === 'none' ? null : activeRaw

  // Prefer the machine-readable `_context` list; fall back to parsing
  // `context list` if that command is unavailable on this build.
  let names = splitLines((await run(['rc.confirmation=no', 'rc.color=off', '_context'])).stdout)
  if (names.length === 0) {
    const listed = await run(['rc.confirmation=no', 'rc.color=off', 'rc.verbose=nothing', 'context', 'list'])
    if (!listed.failed) {
      // Rows look like: "<name>  read  <filter>  ...". Take the first column,
      // skipping a possible header row that starts with "Name".
      names = splitLines(listed.stdout)
        .map((line) => line.split(/\s{2,}|\t|\s+/)[0])
        .filter((n) => n && n.toLowerCase() !== 'name' && n.length > 0)
    }
  }

  const defined: ContextDef[] = []
  for (const name of names) {
    let filter = await get(`rc.context.${name}.read`)
    if (!filter) filter = await get(`rc.context.${name}`)
    defined.push({ name, filter })
  }
  return { active, defined }
}

// ---------------------------------------------------------------------------
// Schema
// ---------------------------------------------------------------------------

const DEFAULT_STATES = ['triage', 'todo', 'active', 'review', 'done', 'canceled']
const DEFAULT_PRIORITIES = ['H', 'M', 'L']

/** Build a UDA definition entry from its config, if defined. */
async function udaDef(name: string, fallbackLabel: string): Promise<UdaDef | null> {
  const type = await get(`rc.uda.${name}.type`)
  const label = (await get(`rc.uda.${name}.label`)) || fallbackLabel
  const valuesRaw = await get(`rc.uda.${name}.values`)
  const values = splitCsv(valuesRaw)
  if (!type && values.length === 0) return null
  return {
    name,
    label,
    type: type || 'string',
    ...(values.length > 0 ? { values } : {}),
  }
}

/** Introspect the live Taskwarrior configuration into a `Schema`. */
export async function getSchema(): Promise<Schema> {
  const [
    statesRaw,
    stateLabelRaw,
    agentsRaw,
    prioritiesRaw,
    projectsRaw,
    tagsRaw,
    dataLocationRaw,
    versionRaw,
  ] = await Promise.all([
    get('rc.uda.state.values'),
    get('rc.uda.state.label'),
    get('rc.uda.agent.values'),
    get('rc.uda.priority.values'),
    runOrThrow(['rc.confirmation=no', 'rc.color=off', '_projects']),
    runOrThrow(['rc.confirmation=no', 'rc.color=off', '_tags']),
    get('rc.data.location'),
    runOrThrow(['--version']),
  ])

  const states = splitCsv(statesRaw)
  const priorities = splitCsv(prioritiesRaw)

  // Drop ALL-UPPERCASE entries — those are Taskwarrior virtual tags
  // (PENDING/ACTIVE/BLOCKED/...), not user tags.
  const tags = splitLines(tagsRaw).filter((t) => t !== t.toUpperCase())

  const udaCandidates = await Promise.all([
    udaDef('state', 'State'),
    udaDef('agent', 'Agent'),
    udaDef('branch', 'Branch'),
    udaDef('priority', 'Priority'),
  ])
  const udas = udaCandidates.filter((u): u is UdaDef => u !== null)

  const dataLocation = expandHome(process.env.TASKDATA?.trim() || dataLocationRaw.trim())

  const context = await getContext()

  return {
    states: states.length > 0 ? states : DEFAULT_STATES,
    stateLabel: stateLabelRaw || 'State',
    agents: splitCsv(agentsRaw),
    priorities: priorities.length > 0 ? priorities : DEFAULT_PRIORITIES,
    projects: splitLines(projectsRaw),
    tags,
    udas,
    dataLocation,
    taskVersion: versionRaw.trim(),
    context,
  }
}

/** Resolve just the data location (used to start the file watcher at boot). */
export async function resolveDataLocation(): Promise<string> {
  const fromEnv = process.env.TASKDATA?.trim()
  if (fromEnv) return expandHome(fromEnv)
  const fromConfig = (await get('rc.data.location')).trim()
  return expandHome(fromConfig)
}
