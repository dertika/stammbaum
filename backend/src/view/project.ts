import type { DetailSettings, EventDetail, LifeEvent, PersonDetails, PersonSummary, TreeResponse } from '../../../shared/types.ts'
import type { EventInfo, Model, Person } from '../gramps/model.ts'
import { eventLabel } from './labels.ts'
import { livingPeople } from './living.ts'

export interface ViewOptions {
  /** Lebende Personen zeigen oder anonymisieren */
  living: 'show' | 'anonymize'
  details: DetailSettings
  livingYears: number
  rootGrampsId?: string
  now?: Date
}

/** Ein Bild, das für diesen Zugang ausgeliefert werden darf. */
export interface AllowedMedia {
  kind: 'portrait' | 'image'
  checksum: string
  rect?: [number, number, number, number]
}

/**
 * Ergebnis der Filterung für einen Zugang. Alles, was ein Browser zu sehen
 * bekommt, wird ausschließlich hieraus erzeugt.
 */
export interface Projection {
  tree: TreeResponse
  /** Sichtbare, nicht anonymisierte Personen */
  open: Map<string, Person>
  /** Erlaubte Bilder: Schlüssel `${mediaId}/${kind}` */
  media: Map<string, AllowedMedia>
}

export const mediaKey = (id: string, kind: AllowedMedia['kind']) => `${id}/${kind}`
const mediaUrl = (id: string, kind: AllowedMedia['kind'], checksum: string) =>
  // Prüfsumme als Cache-Buster, damit geänderte Bilder sofort sichtbar werden
  `/api/view/media/${encodeURIComponent(id)}/${kind}?v=${encodeURIComponent(checksum.slice(0, 12))}`

function lifeEvent(e: EventInfo | undefined, d: DetailSettings): LifeEvent | undefined {
  if (!e || e.private) return undefined
  const date = d.dates ? e.date : undefined
  const place = d.places ? e.place : undefined
  return date || place ? { date, place } : undefined
}

function isImage(model: Model, id: string) {
  const m = model.media.get(id)
  return m && !m.private && m.mime.startsWith('image/') ? m : undefined
}

export function project(model: Model, options: ViewOptions): Projection {
  const d = options.details
  const visible = [...model.people.values()].filter(p => !p.private)
  const visibleIds = new Set(visible.map(p => p.id))
  const living = options.living === 'anonymize' ? livingPeople(model, options.livingYears, options.now) : new Set<string>()
  const open = new Map<string, Person>()
  const media = new Map<string, AllowedMedia>()
  const onlyVisible = (ids: string[]) => ids.filter(id => visibleIds.has(id))

  const people: PersonSummary[] = visible.map(p => {
    const rels = { parents: onlyVisible(p.parents), spouses: onlyVisible(p.spouses), children: onlyVisible(p.children) }
    if (living.has(p.id)) {
      // Nur die Position im Baum bleibt erhalten – keine Namen, Daten oder Bilder
      return { id: p.id, gender: 'U', anonymized: true, firstName: '', lastName: '', ...rels }
    }
    open.set(p.id, p)
    const s: PersonSummary = {
      id: p.id,
      gender: p.gender,
      firstName: p.firstName,
      lastName: p.lastName,
      birth: lifeEvent(p.birth, d),
      death: lifeEvent(p.death, d),
      ...rels,
    }
    if (d.photo && p.photo) {
      const m = isImage(model, p.photo.mediaId)
      if (m) {
        media.set(mediaKey(m.id, 'portrait'), { kind: 'portrait', checksum: m.checksum, rect: p.photo.rect })
        s.photo = mediaUrl(m.id, 'portrait', m.checksum)
      }
    }
    if (d.photo) {
      for (const id of p.mediaIds) {
        const m = isImage(model, id)
        if (m) media.set(mediaKey(id, 'image'), { kind: 'image', checksum: m.checksum })
      }
    }
    return s
  })

  const configuredRoot = options.rootGrampsId ? visible.find(p => p.grampsId === options.rootGrampsId)?.id : undefined
  const rootId = configuredRoot
    ?? (model.defaultPerson && visibleIds.has(model.defaultPerson) ? model.defaultPerson : visible[0]?.id ?? null)

  return { tree: { generatedAt: model.loadedAt.toISOString(), rootId, people }, open, media }
}

/** Details einer Person für den Klick im Baum; null, wenn nicht sichtbar. */
export function personDetails(model: Model, projection: Projection, id: string, d: DetailSettings): PersonDetails | null {
  const anonymized = new Set(projection.tree.people.filter(p => p.anonymized).map(p => p.id))
  const summary = projection.tree.people.find(p => p.id === id)
  if (!summary) return null
  const p = projection.open.get(id)
  if (!p) return { person: summary, events: [], notes: [], media: [] }

  const events: EventDetail[] = !d.events ? [] : p.events
    // Familienereignisse mit einem anonymisierten Partner (z. B. Hochzeit) verraten auch dessen Daten
    .filter(e => !e.private && !(e.partner && anonymized.has(e.partner)))
    .map(e => ({
      label: eventLabel(e.type),
      date: d.dates ? e.date : undefined,
      place: d.places ? e.place : undefined,
      description: e.description || undefined,
    }))
    .filter(e => e.date || e.place || e.description)

  const notes = !d.notes ? [] : p.noteIds
    .map(n => model.notes.get(n))
    .filter(n => n && !n.private && n.text.trim())
    .map(n => n!.text.trim())

  const media = !d.photo ? [] : p.mediaIds
    .filter(m => projection.media.has(mediaKey(m, 'image')))
    .map(m => {
      const info = model.media.get(m)!
      const url = mediaUrl(m, 'image', info.checksum)
      return { url, thumb: url, description: info.description || undefined }
    })

  return { person: summary, events, notes, media }
}
