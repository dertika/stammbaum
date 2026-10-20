import { randomUUID } from 'node:crypto'
import type { Presentation, Station } from '../../../shared/types.ts'
import type { Db } from './db.ts'

interface Row {
  id: string
  title: string
  stations: string
}

const depth = (v: unknown, fallback: number) => {
  const n = Number(v)
  return Number.isInteger(n) && n >= 0 && n <= 8 ? n : fallback
}

const text = (v: unknown, max: number) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : undefined

export function validatePresentation(input: unknown): Omit<Presentation, 'id'> {
  const i = input as Partial<Presentation> | null
  const title = text(i?.title, 120)
  if (!title) throw new Error('Bitte einen Titel angeben')
  if (!Array.isArray(i?.stations)) throw new Error('Stationen fehlen')
  if (i.stations.length > 200) throw new Error('Höchstens 200 Stationen')
  const stations: Station[] = i.stations.map((s, n) => {
    if (typeof s?.personId !== 'string' || !s.personId) throw new Error(`Station ${n + 1}: Person fehlt`)
    return {
      personId: s.personId,
      title: text(s.title, 160),
      text: text(s.text, 2000),
      ancestry: depth(s.ancestry, 1),
      progeny: depth(s.progeny, 1),
    }
  })
  return { title, stations }
}

export class PresentationStore {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  private toDto(row: Row): Presentation {
    return { id: row.id, title: row.title, stations: JSON.parse(row.stations) as Station[] }
  }

  list(): Presentation[] {
    return (this.db.prepare('SELECT * FROM presentations ORDER BY title COLLATE NOCASE').all() as unknown as Row[]).map(r => this.toDto(r))
  }

  get(id: string): Presentation | null {
    const row = this.db.prepare('SELECT * FROM presentations WHERE id = ?').get(id) as unknown as Row | undefined
    return row ? this.toDto(row) : null
  }

  create(input: Omit<Presentation, 'id'>): Presentation {
    const id = randomUUID()
    const now = new Date().toISOString()
    this.db.prepare('INSERT INTO presentations (id, title, stations, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(id, input.title, JSON.stringify(input.stations), now, now)
    return this.get(id)!
  }

  update(id: string, input: Omit<Presentation, 'id'>): Presentation | null {
    this.db.prepare('UPDATE presentations SET title = ?, stations = ?, updated_at = ? WHERE id = ?')
      .run(input.title, JSON.stringify(input.stations), new Date().toISOString(), id)
    return this.get(id)
  }

  delete(id: string): boolean {
    return Number(this.db.prepare('DELETE FROM presentations WHERE id = ?').run(id).changes) > 0
  }
}
