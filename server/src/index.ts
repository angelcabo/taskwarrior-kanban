// HTTP entrypoint. Wires Fastify routes over the Taskwarrior wrapper, the SSE
// stream, and board persistence; starts the filesystem watcher; and (in
// production) serves the built web bundle with an SPA fallback.
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import cors from '@fastify/cors'
import fastifyStatic from '@fastify/static'
import Fastify, { type FastifyReply, type FastifyRequest, type RouteHandlerMethod } from 'fastify'
import { HOST, isProduction, serverPort } from './config.js'
import {
  createBoard,
  deleteBoard,
  listBoards,
  setActiveBoard,
  updateBoard,
} from './boards.js'
import { handleStream } from './sse.js'
import {
  activateContext,
  add,
  annotate,
  defineContext,
  deleteContext,
  denotate,
  done,
  exportTasks,
  getContext,
  getSchema,
  getTask,
  move,
  patch,
  patchMany,
  remove,
  removeMany,
  resolveDataLocation,
  start,
  stop,
} from './task.js'
import { markDirty, startWatching } from './watcher.js'
import type { Board } from './types.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

/**
 * Wrap a handler so any thrown error becomes a 500 `{ error }` response with a
 * useful message (typically the captured Taskwarrior stderr).
 */
function wrap(handler: (req: FastifyRequest, reply: FastifyReply) => Promise<unknown>): RouteHandlerMethod {
  return async (req, reply) => {
    try {
      return await handler(req, reply)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      req.log.error({ err }, 'request failed')
      reply.code(500)
      return { error: message }
    }
  }
}

function filterOf(req: FastifyRequest): string | undefined {
  return (req.query as { filter?: string }).filter
}

function uuidOf(req: FastifyRequest): string {
  return (req.params as { uuid: string }).uuid
}

async function build() {
  const app = Fastify({ logger: true })
  await app.register(cors, { origin: true })

  // -- Health -------------------------------------------------------------
  app.get('/api/health', async () => ({ ok: true }))

  // -- Schema -------------------------------------------------------------
  app.get(
    '/api/schema',
    wrap(async () => getSchema()),
  )

  // -- Tasks: read --------------------------------------------------------
  app.get(
    '/api/tasks',
    wrap(async (req) => {
      const tasks = await exportTasks(filterOf(req))
      return { tasks, generatedAt: Date.now() }
    }),
  )

  // -- Tasks: SSE stream --------------------------------------------------
  app.get('/api/stream', async (req, reply) => {
    await handleStream(req, reply)
  })

  // -- Tasks: create ------------------------------------------------------
  app.post(
    '/api/tasks',
    wrap(async (req) => {
      const body = req.body as {
        description?: string
        project?: string
        priority?: string
        state?: string
        agent?: string
        branch?: string
        tags?: string[]
        due?: string
      }
      if (!body.description || !body.description.trim()) {
        throw new Error('description is required')
      }
      const task = await add({
        description: body.description,
        project: body.project,
        priority: body.priority,
        state: body.state,
        agent: body.agent,
        branch: body.branch,
        due: body.due,
        addTags: body.tags,
      })
      markDirty()
      return { task }
    }),
  )

  // -- Tasks: patch -------------------------------------------------------
  app.patch(
    '/api/tasks/:uuid',
    wrap(async (req) => {
      const body = req.body as {
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
      const task = await patch(uuidOf(req), body)
      markDirty()
      return { task }
    }),
  )

  // -- Tasks: batch (multi-select) ---------------------------------------
  app.post(
    '/api/tasks/batch',
    wrap(async (req) => {
      const body = req.body as {
        uuids?: string[]
        op?: 'patch' | 'delete'
        fields?: {
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
      }
      const uuids = (body.uuids ?? []).filter((u) => typeof u === 'string' && u.length > 0)
      if (uuids.length === 0) throw new Error('no tasks selected')
      const count =
        body.op === 'delete'
          ? await removeMany(uuids)
          : await patchMany(uuids, body.fields ?? {})
      markDirty()
      return { ok: true, count }
    }),
  )

  // -- Tasks: move --------------------------------------------------------
  app.post(
    '/api/tasks/:uuid/move',
    wrap(async (req) => {
      const body = req.body as { state?: string }
      const task = await move(uuidOf(req), body.state ?? '')
      markDirty()
      return { task }
    }),
  )

  // -- Tasks: lifecycle verbs --------------------------------------------
  app.post(
    '/api/tasks/:uuid/start',
    wrap(async (req) => {
      const task = await start(uuidOf(req))
      markDirty()
      return { task }
    }),
  )
  app.post(
    '/api/tasks/:uuid/stop',
    wrap(async (req) => {
      const task = await stop(uuidOf(req))
      markDirty()
      return { task }
    }),
  )
  app.post(
    '/api/tasks/:uuid/done',
    wrap(async (req) => {
      const task = await done(uuidOf(req))
      markDirty()
      return { task }
    }),
  )
  app.post(
    '/api/tasks/:uuid/delete',
    wrap(async (req) => {
      const uuid = uuidOf(req)
      await remove(uuid)
      markDirty()
      return { ok: true, uuid }
    }),
  )

  // -- Tasks: annotations -------------------------------------------------
  app.post(
    '/api/tasks/:uuid/annotations',
    wrap(async (req) => {
      const body = req.body as { text?: string }
      if (!body.text || !body.text.trim()) throw new Error('text is required')
      const task = await annotate(uuidOf(req), body.text)
      markDirty()
      return { task }
    }),
  )
  app.delete(
    '/api/tasks/:uuid/annotations',
    wrap(async (req) => {
      const body = req.body as { text?: string }
      if (!body.text || !body.text.trim()) throw new Error('text is required')
      const task = await denotate(uuidOf(req), body.text)
      markDirty()
      return { task }
    }),
  )

  // -- Contexts -----------------------------------------------------------
  app.get(
    '/api/contexts',
    wrap(async () => getContext()),
  )
  app.post(
    '/api/contexts',
    wrap(async (req) => {
      const body = req.body as { name?: string; filter?: string }
      if (!body.name || !body.name.trim()) throw new Error('name is required')
      await defineContext(body.name, body.filter ?? '')
      markDirty()
      return { ok: true }
    }),
  )
  app.post(
    '/api/contexts/activate',
    wrap(async (req) => {
      const body = req.body as { name?: string | null }
      const active = await activateContext(body.name)
      markDirty()
      return { ok: true, active }
    }),
  )
  app.delete(
    '/api/contexts/:name',
    wrap(async (req) => {
      const name = (req.params as { name: string }).name
      await deleteContext(name)
      markDirty()
      return { ok: true }
    }),
  )

  // -- Boards -------------------------------------------------------------
  app.get(
    '/api/boards',
    wrap(async () => listBoards()),
  )
  app.post(
    '/api/boards',
    wrap(async (req) => {
      const board = await createBoard(req.body as Omit<Board, 'id'> & { id?: string })
      return { board }
    }),
  )
  app.put(
    '/api/boards/:id',
    wrap(async (req) => {
      const id = (req.params as { id: string }).id
      const board = await updateBoard(id, req.body as Omit<Board, 'id'> & { id?: string })
      return { board }
    }),
  )
  app.delete(
    '/api/boards/:id',
    wrap(async (req) => {
      const id = (req.params as { id: string }).id
      await deleteBoard(id)
      return { ok: true }
    }),
  )
  app.post(
    '/api/boards/active',
    wrap(async (req) => {
      const body = req.body as { id?: string | null }
      await setActiveBoard(body.id ?? null)
      return { ok: true }
    }),
  )

  // -- Static (production only) ------------------------------------------
  if (isProduction()) {
    const root = path.resolve(__dirname, '../../web/dist')
    await app.register(fastifyStatic, { root, wildcard: false })
    // SPA fallback: any non-API GET that isn't a real file serves index.html.
    app.setNotFoundHandler((req, reply) => {
      if (req.method === 'GET' && !req.url.startsWith('/api')) {
        return reply.sendFile('index.html')
      }
      reply.code(404).send({ error: 'Not found' })
    })
  }

  return app
}

async function main() {
  const app = await build()

  // Resolve data location, log boot info, and start watching the sqlite files.
  const [dataLocation, schema] = await Promise.all([resolveDataLocation(), getSchema().catch(() => null)])
  await startWatching(dataLocation)

  const port = serverPort()
  await app.listen({ host: HOST, port })
  app.log.info(
    { dataLocation, taskVersion: schema?.taskVersion ?? 'unknown' },
    `Taskwarrior Kanban server listening on http://${HOST}:${port}`,
  )
}

main().catch((err) => {
  console.error('Fatal startup error:', err)
  process.exit(1)
})
