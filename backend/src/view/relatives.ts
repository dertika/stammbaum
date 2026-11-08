import type { LayoutPerson } from './fullLayout.ts'

/**
 * Ausschnitt für die Baumansicht rund um eine Person:
 * - Vorfahren bis `up` Generationen
 * - Geschwister der Vorfahren (Onkel/Tanten, Großonkel/-tanten …) samt Partnern –
 *   außer auf der obersten gezeigten Ebene, deren Eltern fehlen
 * - Cousins und Cousinen (Kinder der Geschwister der Eltern)
 * - eigene Geschwister mit Partnern, Nichten und Neffen
 * - Nachkommen bis `down` Generationen samt Partnern
 * Beziehungen werden auf den Ausschnitt beschränkt. `Infinity` steht für „alle“.
 */
export function relativesSubset(people: LayoutPerson[], focus: string, up: number, down: number): LayoutPerson[] {
  const byId = new Map(people.map(p => [p.id, p]))
  if (!byId.has(focus)) return []
  const keep = new Set<string>()
  const get = (id: string) => byId.get(id)
  const add = (id: string) => { if (byId.has(id)) keep.add(id) }
  const addWithSpouses = (id: string) => {
    add(id)
    get(id)?.spouses.forEach(add)
  }
  /** Kinder der Eltern einer Person, ohne sie selbst (auch Halbgeschwister) */
  const siblings = (id: string) => {
    const p = get(id)
    if (!p) return []
    return [...new Set(p.parents.flatMap(par => get(par)?.children ?? []))].filter(s => s !== id && byId.has(s))
  }

  addWithSpouses(focus)

  // Vorfahren Ebene für Ebene; Ebene 0 ist die Fokusperson
  let level = [focus]
  for (let depth = 1; depth <= up && level.length; depth++) {
    const parents = [...new Set(level.flatMap(id => get(id)?.parents ?? []))].filter(id => byId.has(id))
    parents.forEach(add)
    // Geschwister dieser Vorfahren nur, wenn deren Eltern noch gezeigt werden
    if (depth < up) {
      for (const ancestor of parents) {
        for (const s of siblings(ancestor)) {
          addWithSpouses(s)
          // Cousins und Cousinen: Kinder der Geschwister der Eltern
          if (depth === 1) get(s)?.children.forEach(add)
        }
      }
    }
    level = parents
  }

  // Eigene Geschwister mit Partnern und deren Kinder (Nichten und Neffen)
  if (up >= 1) {
    for (const s of siblings(focus)) {
      addWithSpouses(s)
      get(s)?.children.forEach(add)
    }
  }

  // Nachkommen mit Partnern
  level = [focus]
  for (let depth = 1; depth <= down && level.length; depth++) {
    const children = [...new Set(level.flatMap(id => get(id)?.children ?? []))].filter(id => byId.has(id))
    children.forEach(addWithSpouses)
    level = children
  }

  const only = (ids: string[]) => ids.filter(id => keep.has(id))
  return people
    .filter(p => keep.has(p.id))
    .map(p => ({ id: p.id, parents: only(p.parents), spouses: only(p.spouses), children: only(p.children) }))
}
