import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { FULL_CARD_H } from '../../shared/types.ts'
import { buildModel } from '../src/gramps/model.ts'
import type { RawDatabase } from '../src/gramps/raw.ts'
import { generations, layoutAll, type LayoutPerson } from '../src/view/fullLayout.ts'
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
    expect(body.people).toHaveLength(20)
    expect(res.body).not.toMatch(/Muster|Peter|pi0015/)
  })
})
