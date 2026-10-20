import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { DEFAULT_DETAILS, type DetailSettings } from '../../shared/types.ts'
import { buildModel } from '../src/gramps/model.ts'
import type { RawDatabase } from '../src/gramps/raw.ts'
import { livingPeople } from '../src/view/living.ts'
import { mediaKey, personDetails, project, type ViewOptions } from '../src/view/project.ts'

const raw = JSON.parse(readFileSync(new URL('../fixtures/familie-muster.json', import.meta.url), 'utf8')) as RawDatabase
const model = buildModel(raw)
const now = new Date('2026-10-20')
const opts = (o: Partial<ViewOptions> = {}): ViewOptions => ({ living: 'anonymize', details: DEFAULT_DETAILS, livingYears: 100, now, ...o })
const none: DetailSettings = { photo: false, dates: false, events: false, places: false, notes: false }

describe('livingPeople', () => {
  const living = livingPeople(model, 100, now)
  it('erkennt Lebende anhand des Geburtsjahrs', () => {
    for (const id of ['pi0011', 'pi0012', 'pi0013', 'pi0014', 'pi0016', 'pi0019', 'pi0020']) expect(living.has(id), id).toBe(true)
  })
  it('erkennt Verstorbene', () => {
    for (const id of ['pi0001', 'pi0003', 'pi0008', 'pi0010']) expect(living.has(id), id).toBe(false)
  })
  it('Geburt vor über 100 Jahren ohne Todesangabe gilt als verstorben', () => {
    expect(living.has('pi0007')).toBe(false) // Katharina, * 1874
  })
  it('leitet fehlende Geburtsjahre aus Kindern ab', () => {
    expect(living.has('pi0021')).toBe(false) // Andreas, Sohn * 1872
  })
  it('ohne jeden Anhaltspunkt gilt eine Person als lebend', () => {
    const lonely = buildModel({ ...raw, people: [{ ...raw.people[0], handle: 'x', event_ref_list: [], birth_ref_index: -1, death_ref_index: -1, family_list: [], parent_family_list: [] }], families: [] })
    expect(livingPeople(lonely, 100, now).has('x')).toBe(true)
  })
})

describe('project mit Anonymisierung', () => {
  const p = project(model, opts())
  const json = JSON.stringify(p.tree)
  const peter = p.tree.people.find(x => x.id === 'pi0011')!

  it('anonymisiert lebende Personen vollständig', () => {
    expect(peter).toEqual({ id: 'pi0011', gender: 'U', anonymized: true, firstName: '', lastName: '', parents: ['pi0008', 'pi0010'], spouses: ['pi0013'], children: ['pi0014'] })
    for (const secret of ['Peter', 'Claudia', 'Thomas', 'Lena', 'Sabine', 'Sophie', 'Vogel', 'Berger', '1958', '1987', '2018']) expect(json).not.toContain(secret)
  })
  it('gibt kein Profilbild Lebender frei', () => {
    expect(p.media.has(mediaKey('mi0011', 'portrait'))).toBe(false)
    expect(json).not.toContain('mi0011')
  })
  it('zeigt Verstorbene weiter mit Bild', () => {
    const georg = p.tree.people.find(x => x.id === 'pi0003')!
    expect(georg.firstName).toBe('Georg')
    expect(georg.photo).toMatch(/^\/api\/view\/media\/mi0003\/portrait\?v=/)
    expect(p.media.get(mediaKey('mi0003', 'portrait'))?.rect).toEqual([20, 5, 80, 65])
  })
  it('liefert für Anonymisierte keine Details', () => {
    expect(personDetails(model, p, 'pi0011', DEFAULT_DETAILS)).toEqual({ person: peter, events: [], notes: [], media: [] })
  })
  it('lässt Familienereignisse mit anonymisiertem Partner weg', () => {
    // Martin Vogel ist lebend; seine Hochzeit mit Sabine (lebend) taucht nirgends auf
    const heinrich = personDetails(model, p, 'pi0008', DEFAULT_DETAILS)!
    expect(heinrich.events.map(e => e.label)).toEqual(['Geburt', 'Auswanderung', 'Hochzeit', 'Einwanderung', 'Tod'])
    expect(heinrich.media).toHaveLength(2)
    expect(heinrich.notes[0]).toContain('Kanada')
  })
  it('liefert Details zu privaten Personen nicht', () => {
    expect(personDetails(model, p, 'pi0015', DEFAULT_DETAILS)).toBeNull()
  })
})

describe('project mit abgeschalteten Details', () => {
  const p = project(model, opts({ living: 'show', details: none }))
  const json = JSON.stringify(p.tree.people)
  it('entfernt Daten, Orte und Bilder komplett', () => {
    expect(json).not.toMatch(/"(birth|death)"|(19|20)\d\d"/)
    expect(json).not.toContain('Oberdorf')
    expect(json).not.toContain('photo')
    expect(p.media.size).toBe(0)
  })
  it('liefert keine Ereignisse, Notizen oder Medien', () => {
    expect(personDetails(model, p, 'pi0008', none)).toMatchObject({ events: [], notes: [], media: [] })
  })
  it('nur Orte abgeschaltet: Daten bleiben, Orte fehlen', () => {
    const d = { ...DEFAULT_DETAILS, places: false }
    const q = project(model, opts({ living: 'show', details: d }))
    const georg = personDetails(model, q, 'pi0003', d)!
    expect(georg.person.birth).toEqual({ date: '21. Juni 1899', place: undefined })
    expect(JSON.stringify(georg)).not.toContain('Oberdorf')
  })
})
