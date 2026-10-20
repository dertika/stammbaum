import { dateYear, formatDate } from './dates.ts'
import type { RawDatabase, RawEvent, RawPerson, RawPlace } from './raw.ts'

export interface EventInfo {
  id: string
  type: string
  date?: string
  year?: number
  sortval: number
  place?: string
  description: string
  noteIds: string[]
  private: boolean
}

export interface PhotoRef {
  mediaId: string
  /** Ausschnitt in Prozent [x1, y1, x2, y2] */
  rect?: [number, number, number, number]
}

export interface Person {
  id: string
  grampsId: string
  gender: 'M' | 'F' | 'U'
  firstName: string
  lastName: string
  birth?: EventInfo
  death?: EventInfo
  /** Ereignisse, bei denen die Person Hauptbeteiligte ist (inkl. Familienereignisse) */
  events: EventInfo[]
  parents: string[]
  spouses: string[]
  children: string[]
  photo?: PhotoRef
  mediaIds: string[]
  noteIds: string[]
  private: boolean
}

export interface Note {
  id: string
  text: string
  type: string
  private: boolean
}

export interface Media {
  id: string
  mime: string
  description: string
  private: boolean
}

/** Bereinigtes, indiziertes Abbild der Gramps-Datenbank. */
export interface Model {
  loadedAt: Date
  people: Map<string, Person>
  notes: Map<string, Note>
  media: Map<string, Media>
  defaultPerson: string | null
}

const BIRTH_FALLBACKS = ['Baptism', 'Christening']
const DEATH_FALLBACKS = ['Burial', 'Cremation']

function placeTitle(places: Map<string, RawPlace>, handle: string): string | undefined {
  const parts: string[] = []
  let current = places.get(handle)
  // Ort, Gemeinde, Kreis – mehr Ebenen machen die Anzeige nur unübersichtlich
  while (current && parts.length < 3) {
    if (!current.private && current.name.value) parts.push(current.name.value)
    current = current.placeref_list[0] ? places.get(current.placeref_list[0].ref) : undefined
  }
  return parts.length ? parts.join(', ') : undefined
}

function unique(ids: (string | null | undefined)[]): string[] {
  return [...new Set(ids.filter((id): id is string => !!id))]
}

export function buildModel(raw: RawDatabase, loadedAt = new Date()): Model {
  const places = new Map(raw.places.map(p => [p.handle, p]))
  const families = new Map(raw.families.map(f => [f.handle, f]))
  const rawPeople = new Map(raw.people.map(p => [p.handle, p]))

  const events = new Map<string, EventInfo>()
  for (const e of raw.events as RawEvent[]) {
    events.set(e.handle, {
      id: e.handle,
      type: e.type,
      date: formatDate(e.date),
      year: dateYear(e.date),
      sortval: e.date?.sortval ?? 0,
      place: e.place ? placeTitle(places, e.place) : undefined,
      description: e.description,
      noteIds: e.note_list,
      private: e.private,
    })
  }

  const primaryEvent = (p: RawPerson, index: number, fallbacks: string[]): EventInfo | undefined => {
    const direct = index >= 0 ? p.event_ref_list[index] : undefined
    if (direct) return events.get(direct.ref)
    for (const ref of p.event_ref_list) {
      const e = events.get(ref.ref)
      if (e && fallbacks.includes(e.type) && (!ref.role || ref.role === 'Primary')) return e
    }
    return undefined
  }

  const people = new Map<string, Person>()
  for (const p of raw.people) {
    const ownFamilies = p.family_list.map(h => families.get(h)).filter(f => !!f)
    const parentFamilies = p.parent_family_list.map(h => families.get(h)).filter(f => !!f)

    const personEvents = p.event_ref_list
      .filter(r => !r.role || r.role === 'Primary')
      .map(r => events.get(r.ref))
    const familyEvents = ownFamilies.flatMap(f => f.event_ref_list
      .filter(r => !r.role || r.role === 'Family')
      .map(r => events.get(r.ref)))

    const surname = p.primary_name.surname_list.find(s => s.primary) ?? p.primary_name.surname_list[0]
    const photo = p.media_list[0]
    const rect = photo?.rect
    people.set(p.handle, {
      id: p.handle,
      grampsId: p.gramps_id,
      gender: p.gender === 1 ? 'M' : p.gender === 0 ? 'F' : 'U',
      firstName: p.primary_name.call || p.primary_name.first_name,
      lastName: surname?.surname ?? '',
      birth: primaryEvent(p, p.birth_ref_index, BIRTH_FALLBACKS),
      death: primaryEvent(p, p.death_ref_index, DEATH_FALLBACKS),
      events: [...personEvents, ...familyEvents]
        .filter((e): e is EventInfo => !!e)
        .sort((a, b) => (a.sortval || Infinity) - (b.sortval || Infinity)),
      parents: unique(parentFamilies.flatMap(f => [f.father_handle, f.mother_handle]))
        .filter(h => rawPeople.has(h)),
      spouses: unique(ownFamilies.map(f => f.father_handle === p.handle ? f.mother_handle : f.father_handle))
        .filter(h => rawPeople.has(h)),
      children: unique(ownFamilies.flatMap(f => f.child_ref_list.map(c => c.ref)))
        .filter(h => rawPeople.has(h)),
      photo: photo && !photo.private
        ? { mediaId: photo.ref, rect: rect && rect.length === 4 && rect.some(v => v) ? rect as PhotoRef['rect'] : undefined }
        : undefined,
      mediaIds: p.media_list.filter(m => !m.private).map(m => m.ref),
      noteIds: p.note_list,
      private: p.private,
    })
  }

  return {
    loadedAt,
    people,
    notes: new Map(raw.notes.map(n => [n.handle, { id: n.handle, text: n.text.string, type: n.type, private: n.private }])),
    media: new Map(raw.media.map(m => [m.handle, { id: m.handle, mime: m.mime, description: m.desc, private: m.private }])),
    defaultPerson: raw.defaultPerson && rawPeople.has(raw.defaultPerson) ? raw.defaultPerson : null,
  }
}
