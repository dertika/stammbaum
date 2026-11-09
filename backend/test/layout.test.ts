import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FULL_CARD_H } from '../../shared/types.ts'
import { buildModel } from '../src/gramps/model.ts'
import type { RawDatabase } from '../src/gramps/raw.ts'
import { arrangePartners, generations, layoutAll, type LayoutPerson } from '../src/view/fullLayout.ts'
import { LayoutCache, layoutInput, workerComputer } from '../src/view/layouts.ts'
import { openLink, testApp } from './helpers.ts'

const raw = JSON.parse(readFileSync(new URL('../fixtures/familie-muster.json', import.meta.url), 'utf8')) as RawDatabase
const model = buildModel(raw)
const input = layoutInput(model)

describe('Gesamtbaum-Layout', () => {
  it('ordnet Generationen richtig zu, auch für Eingeheiratete', () => {
    const gen = generations(input)
    expect(gen.get('pi0003')).toBe(gen.get('pi0005')) // Georg und Elisabeth (eingeheiratet)
    expect(gen.get('pi0008')).toBe(gen.get('pi0003')! + 1) // Heinrich ist ihr Sohn
    expect(gen.get('pi0001')).toBe(gen.get('pi0003')! - 1)
  })

  it('lässt private Personen weg', () => {
    expect(input.map(p => p.id)).not.toContain('pi0015')
    expect(JSON.stringify(input)).not.toContain('pi0015')
  })

  it('platziert jede Person genau einmal, Eltern über Kindern, Partner auf einer Höhe', () => {
    const l = layoutAll(input)
    expect(l.people).toHaveLength(input.length)
    const pos = new Map(l.people.map(p => [p.id, p]))
    for (const p of input) {
      for (const c of p.children) expect(pos.get(c)!.y, `${p.id}→${c}`).toBeGreaterThan(pos.get(p.id)!.y)
      for (const s of p.spouses) expect(pos.get(s)!.y).toBe(pos.get(p.id)!.y)
    }
    // Karten überlappen nicht
    const rows = new Map<number, number[]>()
    for (const p of l.people) rows.set(p.y, [...(rows.get(p.y) ?? []), p.x])
    for (const row of rows.values()) {
      const xs = row.sort((a, b) => a - b)
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(210)
    }
    expect(l.height).toBeGreaterThan(FULL_CARD_H)
  })

  it('verkraftet Ehen zwischen Generationen und Einzelpersonen', () => {
    const people: LayoutPerson[] = [
      { id: 'a', parents: [], spouses: [], children: ['b'] },
      { id: 'b', parents: ['a'], spouses: ['c'], children: ['d'] },
      // c ist zugleich Enkelin von a – heiratet eine Generation höher
      { id: 'c', parents: ['x'], spouses: ['b'], children: ['d'] },
      { id: 'x', parents: ['b'], spouses: [], children: ['c'] },
      { id: 'd', parents: ['b', 'c'], spouses: [], children: [] },
      { id: 'allein', parents: [], spouses: [], children: [] },
    ]
    const l = layoutAll(people, 'greedy')
    const pos = new Map(l.people.map(p => [p.id, p]))
    expect(pos.size).toBe(6)
    expect(pos.get('d')!.y).toBeGreaterThan(pos.get('c')!.y)
    expect(pos.get('c')!.y).toBeGreaterThan(pos.get('x')!.y)
  })

  it('rechnet im Worker-Thread', async () => {
    const l = await workerComputer(input, 'simplex')
    expect(l.people).toHaveLength(input.length)
  })
})

describe('LayoutCache', () => {
  it('rechnet einmal und behält das Ergebnis bei gleicher Struktur', async () => {
    let calls = 0
    const cache = new LayoutCache(async (people, coord) => { calls++; return layoutAll(people, coord) })
    expect(cache.get(model).status).toBe('pending')
    await new Promise(r => setTimeout(r, 0))
    expect(cache.get(model).status).toBe('ready')
    // neu geladene, aber unveränderte Daten
    expect(cache.get(buildModel(raw)).status).toBe('ready')
    expect(calls).toBe(1)
    // geänderte Struktur → neu rechnen
    const changed = structuredClone(raw)
    changed.families = changed.families.slice(1)
    expect(cache.get(buildModel(changed)).status).toBe('pending')
    expect(calls).toBe(2)
  })

  it('meldet Fehler', async () => {
    const cache = new LayoutCache(async () => { throw new Error('kaputt') })
    cache.get(model)
    await new Promise(r => setTimeout(r, 0))
    expect(cache.get(model)).toEqual({ status: 'failed', error: 'kaputt' })
  })
})

describe('GET /api/view/layout', () => {
  it('nur mit Zugang, liefert Positionen ohne Namen', async () => {
    const { app, links } = testApp()
    expect((await app.inject('/api/view/layout')).statusCode).toBe(401)
    const { cookies } = await openLink(app, links.create({ label: 'A', living: 'anonymize', expiresAt: null, presentationIds: [], startPersonId: null }).url)
    let res = await app.inject({ url: '/api/view/layout', cookies })
    if (res.statusCode === 202) {
      await new Promise(r => setTimeout(r, 50))
      res = await app.inject({ url: '/api/view/layout', cookies })
    }
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.people).toHaveLength(23)
    expect(res.body).not.toMatch(/Muster|Peter|pi0015/)
  })
})

/** Künstlicher Baum mit eingeheirateten Partnern und mehreren Kindern je Familie */
function synthetic(n: number): LayoutPerson[] {
  let seed = 11
  const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647
  const people = new Map<string, LayoutPerson>()
  const add = (parents: string[] = []) => {
    const p: LayoutPerson = { id: `s${people.size}`, parents, spouses: [], children: [] }
    people.set(p.id, p)
    for (const par of parents) people.get(par)!.children.push(p.id)
    return p
  }
  let gen = [add(), add()]
  gen[0].spouses.push(gen[1].id)
  gen[1].spouses.push(gen[0].id)
  gen = [gen[0]]
  while (people.size < n) {
    const next: LayoutPerson[] = []
    for (const a of gen) {
      if (people.size >= n) break
      const b = add()
      a.spouses.push(b.id)
      b.spouses.push(a.id)
      const kids = 1 + Math.floor(rnd() * 4)
      for (let k = 0; k < kids && people.size < n; k++) next.push(add([a.id, b.id]))
    }
    gen = next.filter(() => rnd() < 0.8)
    if (!gen.length) gen = next.slice(0, 1)
  }
  return [...people.values()]
}

describe('Rechtwinklige Linien', () => {
  const cases: [string, LayoutPerson[]][] = [['Musterdaten', input], ['600 Personen', synthetic(600)]]
  for (const [name, people] of cases) {
    const l = layoutAll(people)
    const pos = new Map(l.people.map(p => [p.id, p]))

    it(`${name}: jedes Stück ist waagerecht oder senkrecht`, () => {
      for (const link of l.links) {
        for (let i = 1; i < link.points.length; i++) {
          const [a, b] = [link.points[i - 1], link.points[i]]
          expect(a[0] === b[0] || a[1] === b[1], JSON.stringify(link.points)).toBe(true)
        }
      }
    })

    it(`${name}: keine Linie läuft durch eine Karte`, () => {
      const halfW = 210 / 2
      const halfH = 64 / 2
      // Karten nach Reihen gruppieren: ein Stück muss nur gegen die Reihen geprüft werden,
      // deren Höhe es überdeckt (sonst Millionen Vergleiche – auf CI zu langsam)
      const rows = new Map<number, { id: string, x: number }[]>()
      for (const p of l.people) rows.set(p.y, [...(rows.get(p.y) ?? []), { id: p.id, x: p.x }])
      const rowYs = [...rows.keys()].sort((a, b) => a - b)
      const violations: string[] = []
      for (const link of l.links) {
        for (let i = 1; i < link.points.length; i++) {
          const [a, b] = [link.points[i - 1], link.points[i]]
          const [x1, x2] = [Math.min(a[0], b[0]), Math.max(a[0], b[0])]
          const [y1, y2] = [Math.min(a[1], b[1]), Math.max(a[1], b[1])]
          for (const y of rowYs) {
            // echtes Inneres der Karte (Ränder dürfen berührt werden – dort beginnen die Linien)
            if (y2 <= y - halfH + 0.5 || y1 >= y + halfH - 0.5) continue
            for (const p of rows.get(y)!) {
              if (x2 > p.x - halfW + 0.5 && x1 < p.x + halfW - 0.5) violations.push(`${JSON.stringify([a, b])} durch ${p.id}`)
            }
          }
        }
      }
      expect(violations).toEqual([])
    })

    it(`${name}: Paare mit nur einer Ehe stehen direkt nebeneinander`, () => {
      const byId = new Map(people.map(p => [p.id, p]))
      let checked = 0
      for (const p of people) {
        if (p.spouses.length !== 1) continue
        const s = byId.get(p.spouses[0])!
        if (s.spouses.length !== 1 || p.id > s.id) continue
        expect(pos.get(s.id)!.y).toBe(pos.get(p.id)!.y)
        expect(Math.abs(pos.get(s.id)!.x - pos.get(p.id)!.x)).toBeCloseTo(210 + 32, 0)
        checked++
      }
      expect(checked).toBeGreaterThan(0)
    })

    it(`${name}: Partner stehen auf der Seite ihrer Eltern`, () => {
      const byId = new Map(people.map(p => [p.id, p]))
      const parentsX = (id: string) => {
        const ps = byId.get(id)!.parents
        return ps.length ? ps.reduce((sum, p) => sum + pos.get(p)!.x, 0) / ps.length : undefined
      }
      for (const p of people) {
        if (p.spouses.length !== 1) continue
        const s = byId.get(p.spouses[0])!
        if (s.spouses.length !== 1 || p.id > s.id) continue
        const [a, b] = [parentsX(p.id), parentsX(s.id)]
        if (a === undefined || b === undefined || a === b) continue
        expect(Math.sign(pos.get(p.id)!.x - pos.get(s.id)!.x), `${p.id}/${s.id}`).toBe(Math.sign(a - b))
      }
    })

    it(`${name}: Kinder hängen an der Mitte der Ehelinie`, () => {
      // für jedes nebeneinanderstehende Paar mit gemeinsamen Kindern beginnt eine Linie genau zwischen beiden
      const starts = new Set(l.links.map(k => String(k.points[0])))
      let checked = 0
      for (const p of people) {
        for (const s of p.spouses) {
          if (p.id > s) continue
          const [a, b] = [pos.get(p.id)!, pos.get(s)!]
          const common = p.children.some(c => people.find(q => q.id === c)?.parents.includes(s))
          if (!common || a.y !== b.y || Math.abs(a.x - b.x) > 242.5) continue
          expect(starts.has(String([(a.x + b.x) / 2, a.y])), `${p.id}+${s}`).toBe(true)
          checked++
        }
      }
      expect(checked).toBeGreaterThan(0)
    })

    it(`${name}: Ehelinie zwischen nebeneinanderstehenden Partnern`, () => {
      const segs = new Set(l.links.filter(k => k.points.length === 2 && k.points[0][1] === k.points[1][1]).map(k => String(k.points)))
      for (const p of people) {
        for (const s of p.spouses) {
          const [a, b] = [pos.get(p.id)!, pos.get(s)!]
          if (a.x >= b.x || a.y !== b.y || Math.abs(a.x - b.x) > 242.5) continue
          expect(segs.has(String([[a.x + 105, a.y], [b.x - 105, b.y]])), `${p.id}–${s}`).toBe(true)
        }
      }
    })
  }
})

describe('Mehrere Partner und kinderlose Paare', () => {
  // Vater v: frühere Partnerin e mit Kind k, aktuelle Frau w ohne Kinder; Eltern g1+g2
  const people: LayoutPerson[] = [
    { id: 'g1', parents: [], spouses: ['g2'], children: ['v'] },
    { id: 'g2', parents: [], spouses: ['g1'], children: ['v'] },
    { id: 'v', parents: ['g1', 'g2'], spouses: ['e', 'w'], children: ['k'] },
    { id: 'e', parents: [], spouses: ['v'], children: ['k'] },
    { id: 'w', parents: [], spouses: ['v'], children: [] },
    { id: 'k', parents: ['v', 'e'], spouses: [], children: [] },
  ]
  const l = layoutAll(people)
  const pos = new Map(l.people.map(p => [p.id, p]))
  const [v, e, w, k] = ['v', 'e', 'w', 'k'].map(id => pos.get(id)!)

  it('stellt den Vater zwischen beide Partnerinnen', () => {
    expect(new Set([v.y, e.y, w.y]).size).toBe(1)
    expect(Math.abs(v.x - e.x)).toBeCloseTo(242, 0)
    expect(Math.abs(v.x - w.x)).toBeCloseTo(242, 0)
    expect(Math.sign(e.x - v.x)).toBe(-Math.sign(w.x - v.x))
  })

  it('zeichnet beide Ehelinien, auch die kinderlose', () => {
    const marriage = (a: { x: number, y: number }, b: { x: number, y: number }) => {
      const [l1, r1] = a.x < b.x ? [a, b] : [b, a]
      return l.links.some(k2 => String(k2.points) === String([[l1.x + 105, l1.y], [r1.x - 105, r1.y]]))
    }
    expect(marriage(v, e)).toBe(true)
    expect(marriage(v, w)).toBe(true)
  })

  it('hängt das Kind an die Verbindung mit der Mutter', () => {
    const toChild = l.links.find(k2 => String(k2.points.at(-1)) === String([k.x, k.y - 32]))
    expect(toChild).toBeDefined()
    // Elternlinie der Familie beginnt mittig zwischen Vater und Mutter, nicht bei der aktuellen Frau
    expect(l.links.some(k2 => String(k2.points[0]) === String([(v.x + e.x) / 2, v.y]))).toBe(true)
    expect(l.links.some(k2 => k2.points[0][0] === (v.x + w.x) / 2 && k2.points.length > 2)).toBe(false)
  })

  it('stellt jede Verbindung über ihre eigenen Kinder (keine Kreuzung)', () => {
    // wie oben, aber auch die aktuelle Frau hat Kinder; mehrere Kinder je Verbindung
    const both: LayoutPerson[] = [
      { id: 'g1', parents: [], spouses: ['g2'], children: ['v'] },
      { id: 'g2', parents: [], spouses: ['g1'], children: ['v'] },
      { id: 'v', parents: ['g1', 'g2'], spouses: ['e', 'w'], children: ['k1', 'k2', 'k3', 'j1', 'j2'] },
      { id: 'e', parents: [], spouses: ['v'], children: ['k1', 'k2', 'k3'] },
      { id: 'w', parents: [], spouses: ['v'], children: ['j1', 'j2'] },
      ...['k1', 'k2', 'k3'].map(id => ({ id, parents: ['v', 'e'], spouses: [], children: [] })),
      ...['j1', 'j2'].map(id => ({ id, parents: ['v', 'w'], spouses: [], children: [] })),
    ]
    const lb = layoutAll(both)
    const x = new Map(lb.people.map(p => [p.id, p.x]))
    const eLeft = x.get('e')! < x.get('w')!
    const ks = ['k1', 'k2', 'k3'].map(id => x.get(id)!)
    const js = ['j1', 'j2'].map(id => x.get(id)!)
    // Kinder der linken Verbindung stehen links von denen der rechten
    if (eLeft) expect(Math.max(...ks)).toBeLessThan(Math.min(...js))
    else expect(Math.max(...js)).toBeLessThan(Math.min(...ks))
  })

  it('ordnet Ketten und Sterne von Partnern', () => {
    const partners = (map: Record<string, string[]>) => (id: string) => map[id] ?? []
    expect(arrangePartners(['b', 'a', 'c'], partners({ a: ['b'], b: ['a', 'c'], c: ['b'] }))).toEqual(['a', 'b', 'c'])
    expect(arrangePartners(['m', 'x', 'y', 'z'], partners({ m: ['x', 'y', 'z'], x: ['m'], y: ['m'], z: ['m'] }))).toEqual(['x', 'm', 'y', 'z'])
    // Ring aus vier Personen: keine sinnvolle Reihe
    expect(arrangePartners(['a', 'b', 'c', 'd'], partners({ a: ['b', 'd'], b: ['a', 'c'], c: ['b', 'd'], d: ['c', 'a'] }))).toBeNull()
  })
})
