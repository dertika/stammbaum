import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { AdminInfo, AdminStatus, DetailSettings } from '../../../shared/types.ts'
import { getSession } from '../auth/session.ts'
import type { Services } from '../server.ts'
import { validateInput } from '../store/links.ts'
import { LINK_COOKIE } from './view.ts'

/** Admin-API – jede Route verlangt eine gültige OIDC-Sitzung. */
export function adminRoutes({ config, cache, links, settings }: Services) {
  const secure = config.publicUrl.startsWith('https://')
  const publicOrigin = new URL(config.publicUrl).origin

  return async function (app: FastifyInstance) {
    app.addHook('onRequest', async (req: FastifyRequest, reply: FastifyReply) => {
      reply.header('Cache-Control', 'no-store')
      if (!getSession(req)) return reply.code(401).send({ error: 'Bitte anmelden' })
      if (req.method !== 'GET') {
        // Zusätzlich zum SameSite=Strict-Cookie: nur JSON von der eigenen Seite
        const origin = req.headers.origin
        if (origin && origin !== publicOrigin && !config.devOpenAccess) return reply.code(403).send({ error: 'Ungültige Herkunft' })
        if (!req.headers['content-type']?.startsWith('application/json')) return reply.code(415).send({ error: 'JSON erwartet' })
      }
    })

    const badRequest = (reply: FastifyReply, err: unknown) =>
      reply.code(400).send({ error: err instanceof Error ? err.message : 'Ungültige Eingabe' })

    app.get('/api/admin/me', async req => {
      const info: AdminInfo = { name: getSession(req)!.name, grampsEditUrl: config.grampsEditUrl, publicUrl: config.publicUrl }
      return info
    })

    app.get('/api/admin/status', async () => {
      const model = await cache.get().catch(() => null)
      const status: AdminStatus = {
        loadedAt: model?.loadedAt.toISOString() ?? null,
        people: model?.people.size ?? 0,
        error: cache.lastError?.message ?? null,
      }
      return status
    })

    app.post('/api/admin/refresh', async (_req, reply) => {
      try {
        const model = await cache.refresh()
        return { loadedAt: model.loadedAt.toISOString(), people: model.people.size, error: null } satisfies AdminStatus
      } catch (err) {
        return reply.code(502).send({ error: `Gramps Web nicht erreichbar: ${(err as Error).message}` })
      }
    })

    app.get('/api/admin/settings', async () => ({ details: settings.details() }))

    app.put<{ Body: { details?: DetailSettings } }>('/api/admin/settings', async (req, reply) => {
      if (!req.body?.details || typeof req.body.details !== 'object') return badRequest(reply, new Error('details fehlt'))
      settings.setDetails(req.body.details)
      return { details: settings.details() }
    })

    app.get('/api/admin/links', async () => links.list())

    app.post('/api/admin/links', async (req, reply) => {
      try {
        return reply.code(201).send(links.create(validateInput(req.body)))
      } catch (err) {
        return badRequest(reply, err)
      }
    })

    app.put<{ Params: { id: string } }>('/api/admin/links/:id', async (req, reply) => {
      try {
        return links.update(req.params.id, validateInput(req.body)) ?? reply.code(404).send({ error: 'Link nicht gefunden' })
      } catch (err) {
        return badRequest(reply, err)
      }
    })

    app.post<{ Params: { id: string }, Body: { revoked?: boolean } }>('/api/admin/links/:id/revoke', async (req, reply) => {
      return links.setRevoked(req.params.id, req.body?.revoked !== false) ?? reply.code(404).send({ error: 'Link nicht gefunden' })
    })

    app.delete<{ Params: { id: string } }>('/api/admin/links/:id', async (req, reply) => {
      return links.delete(req.params.id) ? { ok: true } : reply.code(404).send({ error: 'Link nicht gefunden' })
    })

    // Vorschau: Ansicht genau so, wie sie die Empfänger dieses Links sehen
    app.get<{ Params: { id: string } }>('/api/admin/links/:id/preview', async (req, reply) => {
      const link = links.get(req.params.id)
      if (!link?.url) return reply.code(404).send({ error: 'Link nicht gefunden' })
      const token = new URL(link.url).pathname.split('/').pop()!
      reply.setCookie(LINK_COOKIE, token, { path: '/', httpOnly: true, secure, sameSite: 'lax', maxAge: 3600 })
      return reply.redirect('/')
    })
  }
}
