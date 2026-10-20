import { DEFAULT_DETAILS, type DetailSettings } from '../../../shared/types.ts'
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
}
