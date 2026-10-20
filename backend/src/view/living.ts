import type { Model } from '../gramps/model.ts'

const DEATH_TYPES = new Set(['Death', 'Burial', 'Cremation', 'Probate'])
/** Mindestalter von Eltern bei der Geburt eines Kindes bzw. bei eigenen Ereignissen wie Heirat */
const MIN_PARENT_AGE = 12

/**
 * Ermittelt, wer als lebend gilt. Bewusst vorsichtig: Im Zweifel gilt eine
 * Person als lebend und wird damit gegebenenfalls anonymisiert.
 *
 * Verstorben ist, wer ein Todes-, Begräbnis- o. ä. Ereignis hat oder
 * nachweislich älter als `livingYears` wäre. Fehlt das eigene Geburtsjahr,
 * wird eine obere Schranke dafür aus eigenen Ereignissen und – über mehrere
 * Generationen – aus den Geburtsjahren der Kinder abgeleitet.
 */
export function livingPeople(model: Model, livingYears: number, now = new Date()): Set<string> {
  const currentYear = now.getFullYear()
  /** spätestmögliches Geburtsjahr */
  const latestBirth = new Map<string, number>()
  const dead = new Set<string>()

  for (const p of model.people.values()) {
    if (p.death || p.events.some(e => DEATH_TYPES.has(e.type))) dead.add(p.id)
    if (p.birth?.year) {
      latestBirth.set(p.id, p.birth.year)
      continue
    }
    const years = p.events.map(e => e.year).filter((y): y is number => !!y)
    if (years.length) latestBirth.set(p.id, Math.min(...years) - MIN_PARENT_AGE)
  }

  // Über Kinder nach oben propagieren, bis sich nichts mehr ändert
  for (let changed = true, rounds = 0; changed && rounds < 50; rounds++) {
    changed = false
    for (const p of model.people.values()) {
      if (p.birth?.year) continue
      const fromChildren = p.children
        .map(c => latestBirth.get(c))
        .filter((y): y is number => y !== undefined)
        .map(y => y - MIN_PARENT_AGE)
      if (!fromChildren.length) continue
      const candidate = Math.min(...fromChildren)
      const known = latestBirth.get(p.id)
      if (known === undefined || candidate < known) {
        latestBirth.set(p.id, candidate)
        changed = true
      }
    }
  }

  const living = new Set<string>()
  for (const p of model.people.values()) {
    if (dead.has(p.id)) continue
    const year = latestBirth.get(p.id)
    if (year === undefined || currentYear - year < livingYears) living.add(p.id)
  }
  return living
}
