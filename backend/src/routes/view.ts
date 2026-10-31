import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify'
import type { KnownLink, Presentation, PresentationSummary, ViewInfo } from '../../../shared/types.ts'
import { getSession } from '../auth/session.ts'
import type { Services } from '../server.ts'
import { mediaKey, personDetails, type Projection, type RootCandidate, type ViewOptions } from '../view/project.ts'
import { ProjectionCache } from '../view/views.ts'

/** Alle Links, die dieser Browser geöffnet hat – zuletzt genutzter zuerst, Tokens mit „.“ getrennt */
export const LINKS_COOKIE = 'sb_links'
/** Frühere Variante mit nur einem Link; wird beim nächsten Schreiben übernommen */
export const LEGACY_LINK_COOKIE = 'sb_link'
/** Admin-Vorschau eines Links; überdeckt die eigenen Links für eine Stunde */
export const PREVIEW_COOKIE = 'sb_preview'

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/
const MAX_KNOWN = 10
const YEAR = 60 * 60 * 24 * 365

/** Bekannte Tokens aus den Cookies – nur gültig geformte, ohne Doppelte, höchstens 10 */
export function readKnown(req: FastifyRequest): string[] {
  const tokens = [...(req.cookies[LINKS_COOKIE] ?? '').split('.'), req.cookies[LEGACY_LINK_COOKIE] ?? '']
  return [...new Set(tokens.filter(t => TOKEN_RE.test(t)))].slice(0, MAX_KNOWN)
}

export interface Access {
  label?: string
  /** Link, über den angesehen wird */
  linkId?: string
  preview?: boolean
  options: ViewOptions
  /** Freigegebene Präsentationen; null = alle (nur Entwicklung) */
  presentationIds: string[] | null
}

type Resolved = { access: Access } | { denied: 401 | 410 }
type ActiveLink = Extract<ReturnType<Services['links']['check']>, { status: 'active' }>['link']

/** Routen für die Ansicht der Familie: alles nur über einen gültigen Freigabelink. */
export function viewRoutes({ config, cache, images, links, settings, presentations }: Services) {
  const projections = new ProjectionCache()
  const secure = config.publicUrl.startsWith('https://')

  /** Ermittelt bei jeder Anfrage neu, was gesehen werden darf – Widerruf und Ablauf wirken sofort. */
  function resolveAccess(req: FastifyRequest): Resolved {
    // Startperson: Link → Admin-Einstellung → ROOT_PERSON → (Gramps-Hauptperson in project())
    const globalRoots: RootCandidate[] = [
      ...(settings.startPerson() ? [{ id: settings.startPerson()! }] : []),
      ...(config.rootPerson ? [{ grampsId: config.rootPerson }] : []),
    ]
    const base = { livingYears: config.livingYears, rootCandidates: globalRoots, details: settings.details() }
    const fromLink = (link: ActiveLink, preview = false): Resolved => ({
      access: {
        label: link.label,
        linkId: link.id,
        preview,
        options: {
          ...base,
          living: link.living,
          rootCandidates: link.start_person ? [{ id: link.start_person }, ...globalRoots] : globalRoots,
        },
        presentationIds: JSON.parse(link.presentation_ids) as string[],
      },
    })

    const preview = req.cookies[PREVIEW_COOKIE]
    if (preview) {
      const check = links.check(preview)
      if (check.status === 'active') return fromLink(check.link, true)
    }
    // Der zuletzt genutzte gültige Link gilt – fällt einer weg, rückt der nächste nach
    let invalidKnown = false
    for (const token of readKnown(req)) {
      const check = links.check(token)
      if (check.status === 'active') return fromLink(check.link)
      if (check.status !== 'unknown') invalidKnown = true
    }
    // Angemeldete Admins sehen alles – praktisch zum Prüfen von Präsentationen
    if (getSession(req)) {
      return { access: { label: 'Verwaltung', options: { ...base, living: 'show' }, presentationIds: null } }
    }
    if (invalidKnown && !config.devOpenAccess) return { denied: 410 }
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
    const linkCookie = { path: '/', httpOnly: true, secure, sameSite: 'lax' as const }

    /** Schreibt die Liste der bekannten Links (und räumt das frühere Einzel-Cookie ab) */
    function writeKnown(req: FastifyRequest, reply: FastifyReply, tokens: string[]) {
      const list = [...new Set(tokens)].slice(0, MAX_KNOWN)
      if (list.length) reply.setCookie(LINKS_COOKIE, list.join('.'), { ...linkCookie, maxAge: YEAR })
      else reply.clearCookie(LINKS_COOKIE, { path: '/' })
      if (req.cookies[LEGACY_LINK_COOKIE] !== undefined) reply.clearCookie(LEGACY_LINK_COOKIE, { path: '/' })
    }

    /** Ändernde Anfragen nur als JSON – fremde Seiten können das nicht ohne CORS schicken */
    function requireJson(req: FastifyRequest, reply: FastifyReply): boolean {
      if (req.headers['content-type']?.startsWith('application/json')) return true
      reply.code(415).send({ error: 'JSON erwartet' })
      return false
    }

    // Einstieg über den geheimen Link: Token in die Liste, dann ohne Token in der URL weiter
    app.get<{ Params: { token: string } }>('/s/:token', async (req, reply) => {
      reply.header('Cache-Control', 'no-store')
      const token = req.params.token
      const check = links.check(token)
      if (check.status !== 'active') {
        return reply.redirect(`/?link=${check.status === 'unknown' ? 'ungueltig' : 'abgelaufen'}`)
      }
      links.touch(check.link.id)
      writeKnown(req, reply, [token, ...readKnown(req)])
      return reply.redirect('/')
    })

    // Links, die dieser Browser kennt – nur Bezeichnung und Status, nie die Tokens
    app.get('/api/view/links', async (req, reply) => {
      reply.header('Cache-Control', 'private, no-store')
      const known = readKnown(req)
      const found = known.map(token => ({ token, info: links.lookup(token) }))
      const valid = found.filter((f): f is { token: string, info: NonNullable<typeof f.info> } => !!f.info)
      // Unbekannte (z. B. gelöschte) Links und das alte Einzel-Cookie aufräumen
      if (valid.length !== known.length || req.cookies[LEGACY_LINK_COOKIE] !== undefined) {
        writeKnown(req, reply, valid.map(v => v.token))
      }
      // Aktuell ist der erste gültige – genau der, den resolveAccess (ohne Vorschau) nimmt
      const current = valid.find(v => v.info.status === 'active')?.info.id
      const result: KnownLink[] = valid.map(({ info }) => ({ ...info, current: info.id === current }))
      return result
    })

    app.post<{ Params: { id: string } }>('/api/view/links/:id/open', async (req, reply) => {
      if (!requireJson(req, reply)) return reply
      const known = readKnown(req)
      const token = known.find(t => links.lookup(t)?.id === req.params.id)
      if (!token) return reply.code(404).send({ error: 'Link nicht bekannt' })
      if (links.check(token).status !== 'active') return reply.code(410).send({ error: 'Der Link ist nicht mehr gültig' })
      writeKnown(req, reply, [token, ...known])
      return reply.code(204).send()
    })

    app.delete<{ Params: { id: string } }>('/api/view/links/:id', async (req, reply) => {
      if (!requireJson(req, reply)) return reply
      const known = readKnown(req)
      writeKnown(req, reply, known.filter(t => links.lookup(t)?.id !== req.params.id))
      return reply.code(204).send()
    })

    app.delete('/api/view/preview', async (req, reply) => {
      if (!requireJson(req, reply)) return reply
      reply.clearCookie(PREVIEW_COOKIE, { path: '/' })
      return reply.code(204).send()
    })

    app.get('/api/view/info', async (req, reply) => {
      const v = await view(req, reply)
      if (!v) return reply
      const list: PresentationSummary[] = allowedPresentations(v.access).map(p => ({
        id: p.id,
        title: p.title,
        stationCount: visibleStations(p, v.projection).length,
      }))
      const info: ViewInfo = {
        label: v.access.label,
        details: v.access.options.details,
        presentations: list,
        ...settings.depth(),
        preview: !!v.access.preview,
        linkId: v.access.linkId ?? null,
      }
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
