import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { Presentation, PresentationSummary, ViewInfo } from '../../../shared/types.ts'
import { getSession } from '../auth/session.ts'
import type { Services } from '../server.ts'
import { mediaKey, personDetails, type Projection, type ViewOptions } from '../view/project.ts'
import { ProjectionCache } from '../view/views.ts'

export const LINK_COOKIE = 'sb_link'

export interface Access {
  label?: string
  options: ViewOptions
  /** Freigegebene Präsentationen; null = alle (nur Entwicklung) */
  presentationIds: string[] | null
}

type Resolved = { access: Access } | { denied: 401 | 410 }

/** Routen für die Ansicht der Familie: alles nur über einen gültigen Freigabelink. */
export function viewRoutes({ config, cache, images, links, settings, presentations }: Services) {
  const projections = new ProjectionCache()
  const secure = config.publicUrl.startsWith('https://')

  /** Ermittelt bei jeder Anfrage neu, was gesehen werden darf – Widerruf und Ablauf wirken sofort. */
  function resolveAccess(req: FastifyRequest): Resolved {
    const base = { livingYears: config.livingYears, rootGrampsId: config.rootPerson, details: settings.details() }
    const token = req.cookies[LINK_COOKIE]
    const check = token ? links.check(token) : null
    if (check) {
      if (check.status === 'active') {
        return {
          access: {
            label: check.link.label,
            options: { ...base, living: check.link.living },
            presentationIds: JSON.parse(check.link.presentation_ids) as string[],
          },
        }
      }
    }
    // Angemeldete Admins sehen alles – praktisch zum Prüfen von Präsentationen
    if (getSession(req)) {
      return { access: { label: 'Verwaltung', options: { ...base, living: 'show' }, presentationIds: null } }
    }
    if (check && !config.devOpenAccess) return { denied: check.status === 'unknown' ? 401 : 410 }
    if (config.devOpenAccess) {
      return {
        access: {
          label: 'Entwicklung',
          options: { ...base, living: process.env.DEV_LIVING === 'show' ? 'show' : 'anonymize' },
          presentationIds: null,
        },
      }
    }
    return { denied: 401 }
  }

  function deny(reply: FastifyReply, status: 401 | 410) {
    reply.header('Cache-Control', 'no-store')
    return reply.code(status).send({ error: status === 410 ? 'Der Freigabelink ist abgelaufen oder wurde widerrufen' : 'Kein gültiger Freigabelink' })
  }

  async function view(req: FastifyRequest, reply: FastifyReply) {
    const r = resolveAccess(req)
    if ('denied' in r) {
      deny(reply, r.denied)
      return null
    }
    const model = await cache.get()
    reply.header('Cache-Control', 'private, no-store')
    return { access: r.access, model, projection: projections.get(model, r.access.options) }
  }

  function allowedPresentations(access: Access): Presentation[] {
    const all = presentations.list()
    return access.presentationIds === null ? all : all.filter(p => access.presentationIds!.includes(p.id))
  }

  return async function (app: FastifyInstance) {
    // Einstieg über den geheimen Link: Token ins Cookie, dann ohne Token in der URL weiter
    app.get<{ Params: { token: string } }>('/s/:token', async (req, reply) => {
      reply.header('Cache-Control', 'no-store')
      const check = links.check(req.params.token)
      if (check.status !== 'active') {
        reply.clearCookie(LINK_COOKIE, { path: '/' })
        return reply.redirect(`/?link=${check.status === 'unknown' ? 'ungueltig' : 'abgelaufen'}`)
      }
      links.touch(check.link.id)
      const maxAge = check.link.expires_at
        ? Math.max(60, Math.floor((new Date(check.link.expires_at).getTime() - Date.now()) / 1000))
        : 60 * 60 * 24 * 365
      reply.setCookie(LINK_COOKIE, req.params.token, { path: '/', httpOnly: true, secure, sameSite: 'lax', maxAge })
      return reply.redirect('/')
    })

    app.get('/api/view/info', async (req, reply) => {
      const v = await view(req, reply)
      if (!v) return reply
      const list: PresentationSummary[] = allowedPresentations(v.access).map(p => ({
        id: p.id,
        title: p.title,
        stationCount: visibleStations(p, v.projection).length,
      }))
      const info: ViewInfo = { label: v.access.label, details: v.access.options.details, presentations: list }
      return info
    })

    app.get<{ Params: { id: string } }>('/api/view/presentations/:id', async (req, reply) => {
      const v = await view(req, reply)
      if (!v) return reply
      const p = allowedPresentations(v.access).find(p => p.id === req.params.id)
      if (!p) return reply.code(404).send({ error: 'Präsentation nicht gefunden' })
      const result: Presentation = { id: p.id, title: p.title, stations: visibleStations(p, v.projection) }
      return result
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
        reply.header('Cache-Control', 'private, max-age=86400')
        reply.header('Content-Security-Policy', "default-src 'none'; style-src 'unsafe-inline'; sandbox")
        return reply.type(image.type).send(image.body)
      } catch (err) {
        req.log.error({ err }, 'Bild konnte nicht geladen werden')
        return reply.code(502).send({ error: 'Bild konnte nicht geladen werden' })
      }
    })
  }
}

/** Stationen zu Personen, die für diesen Zugang nicht (oder nur anonym) sichtbar sind, fallen weg. */
function visibleStations(p: Presentation, projection: Projection) {
  return p.stations.filter(s => projection.open.has(s.personId))
}
