import { existsSync } from 'node:fs'
import Fastify, { type FastifyReply, type FastifyRequest } from 'fastify'
import fastifyStatic from '@fastify/static'
import { DEFAULT_DETAILS, type ViewInfo } from '../../shared/types.ts'
import type { Config } from './config.ts'
import type { ModelCache } from './gramps/cache.ts'
import type { ImageCache } from './gramps/images.ts'
import { mediaKey, personDetails, type ViewOptions } from './view/project.ts'
import { ProjectionCache } from './view/views.ts'

export interface Access {
  label?: string
  options: ViewOptions
}

export interface Services {
  config: Config
  cache: ModelCache
  images: ImageCache
}

export function buildServer({ config, cache, images }: Services) {
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, trustProxy: true })
  const projections = new ProjectionCache()

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('Referrer-Policy', 'no-referrer')
    reply.header('X-Robots-Tag', 'noindex, nofollow')
  })

  /** Ermittelt, was die Anfrage sehen darf – null heißt: gar nichts. */
  function resolveAccess(_req: FastifyRequest): Access | null {
    if (config.devOpenAccess) {
      return {
        label: 'Entwicklung',
        options: {
          living: process.env.DEV_LIVING === 'show' ? 'show' : 'anonymize',
          details: DEFAULT_DETAILS,
          livingYears: config.livingYears,
          rootGrampsId: config.rootPerson,
        },
      }
    }
    return null
  }

  async function view(req: FastifyRequest, reply: FastifyReply) {
    const access = resolveAccess(req)
    if (!access) {
      reply.code(401).send({ error: 'Kein gültiger Freigabelink' })
      return null
    }
    const model = await cache.get()
    reply.header('Cache-Control', 'private, no-store')
    return { access, model, projection: projections.get(model, access.options) }
  }

  app.get('/healthz', async () => ({ ok: true }))

  app.get('/api/view/info', async (req, reply) => {
    const access = resolveAccess(req)
    if (!access) return reply.code(401).send({ error: 'Kein gültiger Freigabelink' })
    const info: ViewInfo = { label: access.label, details: access.options.details }
    return info
  })

  app.get('/api/view/tree', async (req, reply) => {
    const v = await view(req, reply)
    return v ? v.projection.tree : reply
  })

  app.get<{ Params: { id: string } }>('/api/view/person/:id', async (req, reply) => {
    const v = await view(req, reply)
    if (!v) return reply
    const details = personDetails(v.model, v.projection, req.params.id, v.access.options.details)
    return details ?? reply.code(404).send({ error: 'Person nicht gefunden' })
  })

  app.get<{ Params: { id: string, kind: string } }>('/api/view/media/:id/:kind', async (req, reply) => {
    const v = await view(req, reply)
    if (!v) return reply
    const { id, kind } = req.params
    const allowed = kind === 'portrait' || kind === 'image' ? v.projection.media.get(mediaKey(id, kind)) : undefined
    // Nur Bilder, die zu einer für diesen Zugang sichtbaren Person gehören
    if (!allowed) return reply.code(404).send({ error: 'Bild nicht gefunden' })
    try {
      const image = await images.get(id, allowed)
      reply.header('Cache-Control', 'private, max-age=604800, immutable')
      reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
      return reply.type(image.type).send(image.body)
    } catch (err) {
      req.log.error({ err }, 'Bild konnte nicht geladen werden')
      return reply.code(502).send({ error: 'Bild konnte nicht geladen werden' })
    }
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
