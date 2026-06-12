// Centralized runtime configuration derived from the environment.
import os from 'node:os'
import path from 'node:path'

/** Expand a leading `~` in a path to the user's home directory. */
export function expandHome(p: string): string {
  if (p === '~') return os.homedir()
  if (p.startsWith('~/')) return path.join(os.homedir(), p.slice(2))
  return p
}

/** Base directory for app config, following the XDG spec. */
export function configDir(): string {
  const base = process.env.XDG_CONFIG_HOME?.trim() || path.join(os.homedir(), '.config')
  return path.join(base, 'taskwarrior-kanban')
}

/** Path to the persisted boards file. */
export function boardsFile(): string {
  return path.join(configDir(), 'boards.json')
}

/** TCP port for the HTTP server. */
export function serverPort(): number {
  return Number(process.env.PORT) || 8787
}

/** Bind host for the HTTP server. */
export const HOST = '127.0.0.1'

/** Whether we are running in production (serve the built web bundle). */
export function isProduction(): boolean {
  return process.env.NODE_ENV === 'production'
}
