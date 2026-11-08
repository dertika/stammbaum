import { createHash } from 'node:crypto'
import { Worker } from 'node:worker_threads'
import type { FullLayout } from '../../../shared/types.ts'
import type { Model } from '../gramps/model.ts'
import type { LayoutPerson } from './fullLayout.ts'

/** Ab dieser Größe nur die schnelle Anordnung – simplex bräuchte sonst Minuten */
const SIMPLEX_LIMIT = 4000

export type LayoutComputer = (people: LayoutPerson[], coord: 'greedy' | 'simplex') => Promise<FullLayout>

/** Standard: Berechnung in einem Worker-Thread */
export const workerComputer: LayoutComputer = (people, coord) => new Promise((resolve, reject) => {
  const worker = new Worker(new URL('./layoutWorker.ts', import.meta.url), { workerData: { people, coord } })
  worker.once('message', (msg: { ok: true, layout: FullLayout } | { ok: false, error: string }) => {
    if (msg.ok) resolve(msg.layout)
    else reject(new Error(msg.error))
    void worker.terminate()
  })
  worker.once('error', reject)
})

export type LayoutState =
  | { status: 'ready', layout: FullLayout }
  | { status: 'pending' }
  | { status: 'failed', error: string }

/** Struktur, die das Layout bestimmt: sichtbare (nicht private) Personen und ihre Beziehungen */
export function layoutInput(model: Model): LayoutPerson[] {
  const visible = [...model.people.values()].filter(p => !p.private)
  const ids = new Set(visible.map(p => p.id))
  const only = (list: string[]) => list.filter(id => ids.has(id))
  return visible
    .map(p => ({ id: p.id, parents: only(p.parents), spouses: only(p.spouses), children: only(p.children) }))
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
}

/**
 * Hält das berechnete Layout. Es hängt nur von der Familienstruktur ab – Anonymisierung
 * ändert keine Positionen –, gilt also für alle Links gleich und wird nur neu
 * berechnet, wenn sich in Gramps die Struktur ändert.
 */
export class LayoutCache {
  private readonly compute: LayoutComputer
  private readonly log: (msg: string, err?: unknown) => void
  private model: Model | null = null
  private key = ''
  private state: LayoutState = { status: 'pending' }

  constructor(compute: LayoutComputer = workerComputer, log: (msg: string, err?: unknown) => void = () => {}) {
    this.compute = compute
    this.log = log
  }

  /** Aktueller Stand für diese Daten; startet die Berechnung bei Bedarf. */
  get(model: Model): LayoutState {
    if (model === this.model) return this.state
    this.model = model
    const people = layoutInput(model)
    const key = createHash('sha256').update(JSON.stringify(people)).digest('hex')
    // Unveränderte Struktur (z. B. nur Namen oder Daten geändert): Layout behalten
    if (key === this.key && this.state.status !== 'failed') return this.state
    this.key = key
    this.state = { status: 'pending' }
    const coord = people.length > SIMPLEX_LIMIT ? 'greedy' : 'simplex'
    const started = Date.now()
    this.compute(people, coord)
      .then(layout => {
        if (this.key !== key) return
        this.state = { status: 'ready', layout }
        this.log(`Gesamtbaum berechnet: ${people.length} Personen in ${Date.now() - started} ms (${coord})`)
      })
      .catch(err => {
        if (this.key !== key) return
        this.state = { status: 'failed', error: err instanceof Error ? err.message : String(err) }
        this.log('Gesamtbaum konnte nicht berechnet werden', err)
      })
    return this.state
  }
}
