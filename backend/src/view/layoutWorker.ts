// Berechnet den Gesamtbaum in einem eigenen Thread, damit der Server währenddessen antwortet.
import { parentPort, workerData } from 'node:worker_threads'
import { layoutAll, type LayoutPerson } from './fullLayout.ts'

const { people, coord } = workerData as { people: LayoutPerson[], coord: 'greedy' | 'simplex' }
try {
  parentPort!.postMessage({ ok: true, layout: layoutAll(people, coord) })
} catch (err) {
  parentPort!.postMessage({ ok: false, error: err instanceof Error ? err.message : String(err) })
}
