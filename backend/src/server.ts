import { existsSync } from 'node:fs'
import Fastify from 'fastify'
import fastifyCookie from '@fastify/cookie'
import fastifyStatic from '@fastify/static'
import type { Config } from './config.ts'
import type { ModelCache } from './gramps/cache.ts'
import type { ImageCache } from './gramps/images.ts'
import { authRoutes } from './auth/oidc.ts'
import { adminRoutes } from './routes/admin.ts'
import { viewRoutes } from './routes/view.ts'
import { deriveKey } from './store/crypto.ts'
import type { LinkStore } from './store/links.ts'
import type { SettingsStore } from './store/settings.ts'

export interface Services {
  config: Config
  cache: ModelCache
  images: ImageCache
  links: LinkStore
  settings: SettingsStore
}

export function buildServer(services: Services) {
  const { config } = services
  const app = Fastify({ logger: { level: process.env.LOG_LEVEL ?? 'info' }, trustProxy: true })

  app.register(fastifyCookie, { secret: deriveKey(config.appSecret, 'session').toString('hex') })

  app.addHook('onSend', async (_req, reply) => {
    reply.header('X-Content-Type-Options', 'nosniff')
    reply.header('Referrer-Policy', 'no-referrer')
    reply.header('X-Robots-Tag', 'noindex, nofollow')
  })

  app.get('/healthz', async () => ({ ok: true }))
  app.register(viewRoutes(services))
  app.register(authRoutes(config))
  app.register(adminRoutes(services))

  if (existsSync(config.staticDir)) {
    app.register(fastifyStatic, { root: config.staticDir })
    // SPA: unbekannte Pfade außerhalb von /api liefern die index.html
    app.setNotFoundHandler((req, reply) => {
      const path = req.url.split('?')[0]
      if (req.method !== 'GET' || path.startsWith('/api/') || /\.\w+$/.test(path)) return reply.code(404).send({ error: 'Nicht gefunden' })
      return reply.header('Cache-Control', 'no-cache').sendFile('index.html')
    })
  }

  return app
}
