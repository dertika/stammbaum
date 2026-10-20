import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { formatDate } from '../src/gramps/dates.ts'
import { buildModel } from '../src/gramps/model.ts'
import type { RawDatabase } from '../src/gramps/raw.ts'
import { DEFAULT_DETAILS } from '../../shared/types.ts'
import { project } from '../src/view/project.ts'

const raw = JSON.parse(readFileSync(new URL('../fixtures/familie-muster.json', import.meta.url), 'utf8')) as RawDatabase
const model = buildModel(raw, new Date('2026-01-01'))

describe('formatDate', () => {
  const d = (dateval: number[], modifier = 0, quality = 0) => ({ dateval, modifier, quality, sortval: 1 })
  it('formatiert deutsch', () => {
    expect(formatDate(d([3, 4, 1872, 0]))).toBe('3. April 1872')
    expect(formatDate(d([0, 3, 1900, 0]))).toBe('März 1900')
    expect(formatDate(d([0, 0, 1850, 0], 3))).toBe('um 1850')
    expect(formatDate(d([0, 0, 1850, 0, 0, 0, 1860, 0], 4))).toBe('zwischen 1850 und 1860')
    expect(formatDate(d([0, 0, 1850, 0], 0, 1))).toBe('geschätzt 1850')
    expect(formatDate(d([0, 0, 0, 0]))).toBeUndefined()
  })
})

describe('buildModel', () => {
  it('verknüpft Eltern, Partner und Kinder', () => {
    const georg = model.people.get('pi0003')!
    expect(georg.parents.sort()).toEqual(['pi0001', 'pi0002'])
    expect(georg.spouses).toEqual(['pi0005'])
    expect(georg.children.sort()).toEqual(['pi0008', 'pi0009'])
    expect(georg.birth?.date).toBe('21. Juni 1899')
    expect(georg.birth?.place).toBe('Oberdorf, Landkreis Talheim')
    expect(georg.events.map(e => e.type)).toEqual(['Birth', 'Marriage', 'Death'])
    expect(georg.events[1].partner).toBe('pi0005')
  })
})

describe('project (alles sichtbar)', () => {
  const { tree } = project(model, { living: 'show', details: DEFAULT_DETAILS, livingYears: 100 })
  it('nimmt die Gramps-Hauptperson als Start', () => {
    expect(tree.rootId).toBe('pi0011')
  })
  it('lässt private Personen und Verweise auf sie weg', () => {
    expect(tree.people.find(p => p.id === 'pi0015')).toBeUndefined()
    expect(JSON.stringify(tree)).not.toContain('pi0015')
  })
  it('gibt keine Gramps-Rohfelder heraus', () => {
    const json = JSON.stringify(tree)
    for (const key of ['gramps_id', 'primary_name', 'event_ref_list', 'grampsId', 'noteIds']) expect(json).not.toContain(key)
  })
})
