import type { PersonSummary, TreeResponse } from '../../../shared/types.ts'
import type { Model, Person } from '../gramps/model.ts'

function summary(p: Person): PersonSummary {
  return {
    id: p.id,
    gender: p.gender,
    firstName: p.firstName,
    lastName: p.lastName,
    birth: p.birth && (p.birth.date || p.birth.place) ? { date: p.birth.date, place: p.birth.place } : undefined,
    death: p.death && (p.death.date || p.death.place) ? { date: p.death.date, place: p.death.place } : undefined,
    parents: p.parents,
    spouses: p.spouses,
    children: p.children,
  }
}

/** Erzeugt die Baumdaten, die an den Browser gehen. */
export function projectTree(model: Model, rootGrampsId?: string): TreeResponse {
  const people = [...model.people.values()].filter(p => !p.private)
  const visible = new Set(people.map(p => p.id))
  const configuredRoot = rootGrampsId ? people.find(p => p.grampsId === rootGrampsId)?.id : undefined
  const rootId = configuredRoot
    ?? (model.defaultPerson && visible.has(model.defaultPerson) ? model.defaultPerson : people[0]?.id ?? null)

  return {
    generatedAt: model.loadedAt.toISOString(),
    rootId,
    people: people.map(p => {
      const s = summary(p)
      // Verweise auf nicht sichtbare Personen dürfen nicht nach außen gelangen
      s.parents = s.parents.filter(id => visible.has(id))
      s.spouses = s.spouses.filter(id => visible.has(id))
      s.children = s.children.filter(id => visible.has(id))
      return s
    }),
  }
}
