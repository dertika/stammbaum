import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { buildModel } from '../src/gramps/model.ts'
import type { RawDatabase } from '../src/gramps/raw.ts'
import type { LayoutPerson } from '../src/view/fullLayout.ts'
import { layoutInput } from '../src/view/layouts.ts'
import { relativesSubset } from '../src/view/relatives.ts'
import { openLink, testApp } from './helpers.ts'

const raw = JSON.parse(readFileSync(new URL('../fixtures/familie-muster.json', import.meta.url), 'utf8')) as RawDatabase
const input = layoutInput(buildModel(raw))
const ids = (people: LayoutPerson[]) => people.map(p => p.id).sort()

describe('relativesSubset (Musterdaten)', () => {
  it('zeigt um Peter Vorfahren, Tante, Großtante, Schwester mit Familie und Nachkommen', () => {
    const s = ids(relativesSubset(input, 'pi0011', 3, 2))
    expect(s).toEqual(expect.arrayContaining([
      'pi0011', 'pi0013', // Peter und Claudia
      'pi0008', 'pi0010', // Eltern
      'pi0003', 'pi0005', // Großeltern väterlicherseits
      'pi0001', 'pi0002', 'pi0006', 'pi0007', // Urgroßeltern
      'pi0009', // Tante Margarete (Schwester des Vaters)
      'pi0004', // Großtante Anna (Schwester des Großvaters)
      'pi0012', 'pi0019', 'pi0020', // Schwester Sabine, Schwager Martin, Nichte Sophie
      'pi0014', 'pi0016', // Sohn Thomas, Enkelin Lena
    ]))
    // Ururgroßeltern (Ebene 4) gehören nicht dazu, private Julia nie
    for (const id of ['pi0021', 'pi0017', 'pi0018', 'pi0015']) expect(s).not.toContain(id)
  })

  it('zeigt keine Geschwister der obersten gezeigten Ebene', () => {
    // bei up=2 sind die Großeltern oben – Großtante Anna fehlt, Tante Margarete nicht
    const s = ids(relativesSubset(input, 'pi0011', 2, 0))
    expect(s).toContain('pi0009')
    expect(s).not.toContain('pi0004')
  })

  it('beschränkt die Beziehungen auf den Ausschnitt', () => {
    const subset = relativesSubset(input, 'pi0011', 1, 0)
    const inSet = new Set(subset.map(p => p.id))
    for (const p of subset) for (const r of [...p.parents, ...p.spouses, ...p.children]) expect(inSet.has(r)).toBe(true)
  })

  it('liefert für unbekannte Personen nichts', () => {
    expect(relativesSubset(input, 'gibtsnicht', 3, 3)).toEqual([])
  })
})

describe('relativesSubset (Cousins)', () => {
  // Großeltern g1+g2 → Vater v und Onkel o; o + Tante t → Cousine c → deren Kind ck
  const people: LayoutPerson[] = [
    { id: 'g1', parents: [], spouses: ['g2'], children: ['v', 'o'] },
    { id: 'g2', parents: [], spouses: ['g1'], children: ['v', 'o'] },
    { id: 'v', parents: ['g1', 'g2'], spouses: ['m'], children: ['ich'] },
    { id: 'm', parents: [], spouses: ['v'], children: ['ich'] },
    { id: 'o', parents: ['g1', 'g2'], spouses: ['t'], children: ['c'] },
    { id: 't', parents: [], spouses: ['o'], children: ['c'] },
    { id: 'c', parents: ['o', 't'], spouses: [], children: ['ck'] },
    { id: 'ck', parents: ['c'], spouses: [], children: [] },
    { id: 'ich', parents: ['v', 'm'], spouses: [], children: [] },
  ]
  it('nimmt Onkel mit Partnerin und Cousine auf, aber nicht deren Kinder', () => {
    expect(ids(relativesSubset(people, 'ich', 2, 2))).toEqual(['c', 'g1', 'g2', 'ich', 'm', 'o', 't', 'v'])
  })
  it('versteht „alle“ Generationen', () => {
    expect(ids(relativesSubset(people, 'ich', Infinity, Infinity))).toContain('c')
    expect(ids(relativesSubset(people, 'g1', Infinity, Infinity))).toEqual(['c', 'ck', 'g1', 'g2', 'ich', 'm', 'o', 't', 'v'])
  })
})

describe('GET /api/view/layout/focus/:id', () => {
  it('nur mit Zugang, prüft Person und Tiefe, liefert keine Namen', async () => {
    const { app, links } = testApp()
    expect((await app.inject('/api/view/layout/focus/pi0011')).statusCode).toBe(401)
    const { cookies } = await openLink(app, links.create({ label: 'A', living: 'anonymize', expiresAt: null, presentationIds: [], startPersonId: null }).url)
    expect((await app.inject({ url: '/api/view/layout/focus/gibtsnicht', cookies })).statusCode).toBe(404)
    expect((await app.inject({ url: '/api/view/layout/focus/pi0015', cookies })).statusCode).toBe(404) // privat
    expect((await app.inject({ url: '/api/view/layout/focus/pi0011?up=-1', cookies })).statusCode).toBe(400)
    const res = await app.inject({ url: '/api/view/layout/focus/pi0011?up=3&down=2', cookies })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.people.map((p: { id: string }) => p.id)).toEqual(expect.arrayContaining(['pi0009', 'pi0004', 'pi0020']))
    expect(res.body).not.toMatch(/Muster|Margarete|pi0015/)
    const all = await app.inject({ url: '/api/view/layout/focus/pi0011?up=all&down=all', cookies })
    expect(all.json().people.length).toBeGreaterThan(body.people.length)
  })

  it('merkt sich berechnete Layouts', async () => {
    let calls = 0
    const { FocusLayoutCache } = await import('../src/view/layouts.ts')
    const { layoutAll } = await import('../src/view/fullLayout.ts')
    const cache = new FocusLayoutCache(async (p, c) => { calls++; return layoutAll(p, c) })
    const model = buildModel(raw)
    const subset = (people: LayoutPerson[]) => relativesSubset(people, 'pi0011', 3, 3)
    await cache.get(model, 'pi0011', 3, 3, subset)
    await cache.get(buildModel(raw), 'pi0011', 3, 3, subset) // neu geladen, gleiche Struktur
    expect(calls).toBe(1)
    await cache.get(model, 'pi0011', 2, 3, people => relativesSubset(people, 'pi0011', 2, 3))
    expect(calls).toBe(2)
  })
})
