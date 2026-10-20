import { readFile } from 'node:fs/promises'
import { buildModel, type Model } from './model.ts'
import type { RawDatabase } from './raw.ts'

export type Loader = () => Promise<RawDatabase>

export function fixtureLoader(file: string): Loader {
  return async () => JSON.parse(await readFile(file, 'utf8')) as RawDatabase
}

/**
 * Hält den zuletzt geladenen Stammbaum im Speicher.
 * Nach Ablauf der TTL wird im Hintergrund neu geladen; bis dahin
 * bekommen Anfragen weiter den alten Stand (stale-while-revalidate).
 */
export class ModelCache {
  private model: Model | null = null
  private loading: Promise<Model> | null = null
  lastError: Error | null = null

  private readonly load: Loader
  private readonly ttlSeconds: number
  private readonly log: (msg: string, err?: unknown) => void

  constructor(load: Loader, ttlSeconds: number, log: (msg: string, err?: unknown) => void = () => {}) {
    this.load = load
    this.ttlSeconds = ttlSeconds
    this.log = log
  }

  /** Lädt neu; gleichzeitige Aufrufe teilen sich denselben Ladevorgang. */
  refresh(): Promise<Model> {
    if (!this.loading) {
      const started = Date.now()
      this.loading = this.load()
        .then(raw => {
          this.model = buildModel(raw)
          this.lastError = null
          this.log(`Stammbaum geladen: ${this.model.people.size} Personen in ${Date.now() - started} ms`)
          return this.model
        })
        .catch(err => {
          this.lastError = err
          this.log('Laden des Stammbaums fehlgeschlagen', err)
          throw err
        })
        .finally(() => (this.loading = null))
    }
    return this.loading
  }

  async get(): Promise<Model> {
    if (!this.model) return this.refresh()
    const age = (Date.now() - this.model.loadedAt.getTime()) / 1000
    if (age > this.ttlSeconds) this.refresh().catch(() => {})
    return this.model
  }
}
