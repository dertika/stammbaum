import { existsSync } from 'node:fs'
import Fastify from 'fastify'
import fastifyStatic from '@fastify/static'
import type { Config } from './config.ts'
import type { ModelCache } from './gramps/cache.ts'
import { projectTree } from './view/project.ts'

export function buildServer(config: Config, cache: ModelCache) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, trustProxy: true })

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('Referrer-Policy', 'no-referrer')
    reply.header('X-Robots-Tag', 'noindex, nofollow')
  })

  app.get('/healthz', async () => ({ ok: true }))

  app.get('/api/view/tree', async (_req, reply) => {
    // Ohne Freigabelink gibt es (außer in der lokalen Entwicklung) keine Daten.
    if (!config.devOpenAccess) return reply.code(401).send({ error: 'Kein gültiger Freigabelink' })
    const model = await cache.get()
    reply.header('Cache-Control', 'private, no-store')
    return projectTree(model, config.rootPerson)
  })

  if (existsSync(config.staticDir)) {
    app.register(fastifyStatic, { root: config.staticDir })
    // SPA: unbekannte Pfade außerhalb von /api liefern die index.html
    app.setNotFoundHandler((req, reply) => {
      const path = req.url.split('?')[0]
      if (req.method !== 'GET' || path.startsWith('/api/') || /\.\w+$/.test(path)) return reply.code(404).send({ error: 'Nicht gefunden' })
      return reply.sendFile('index.html')
    })
  }

  return app
}
