import { DEFAULT_DEPTH, DEFAULT_DETAILS, DEPTH_MAX, DEPTH_MIN, type DetailSettings } from '../../../shared/types.ts'
import type { Db } from './db.ts'

/** Globale Einstellungen als JSON in einer Schlüssel-Wert-Tabelle. */
export class SettingsStore {
  private readonly db: Db

  constructor(db: Db) {
    this.db = db
  }

  private read<T>(key: string): T | undefined {
    const row = this.db.prepare('SELECT value FROM settings WHERE key = ?').get(key) as { value: string } | undefined
    return row ? JSON.parse(row.value) as T : undefined
  }

  private write(key: string, value: unknown) {
    this.db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value')
      .run(key, JSON.stringify(value))
  }

  details(): DetailSettings {
    // Neue Kategorien sind standardmäßig an, gespeicherte Werte haben Vorrang
    return { ...DEFAULT_DETAILS, ...this.read<Partial<DetailSettings>>('details') }
  }

  setDetails(details: DetailSettings) {
    const clean = Object.fromEntries(Object.keys(DEFAULT_DETAILS).map(k => [k, !!details[k as keyof DetailSettings]]))
    this.write('details', clean)
  }

  /** Gramps-Handle der globalen Startperson; null = Gramps-Hauptperson */
  startPerson(): string | null {
    return this.read<string | null>('startPerson') ?? null
  }

  setStartPerson(id: string | null) {
    this.write('startPerson', id)
  }

  depth(): { ancestryDepth: number, progenyDepth: number } {
    return { ancestryDepth: DEFAULT_DEPTH, progenyDepth: DEFAULT_DEPTH, ...this.read('depth') }
  }

  setDepth(depth: { ancestryDepth: number, progenyDepth: number }) {
    this.write('depth', { ancestryDepth: depth.ancestryDepth, progenyDepth: depth.progenyDepth })
  }
}

export const isDepth = (v: unknown): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= DEPTH_MIN && v <= DEPTH_MAX

/** Personen-Handle aus Admin-Eingaben: String bis 64 Zeichen, leer = null */
export function personRef(v: unknown): string | null {
  if (v === null || v === undefined || v === '') return null
  if (typeof v !== 'string' || v.length > 64) throw new Error('Ungültige Startperson')
  return v
}
