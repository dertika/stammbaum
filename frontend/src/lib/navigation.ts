import type { PersonSummary } from '../../../shared/types.ts'

/**
 * Tastatur-Navigation durch den Baum: ↑ Eltern, ↓ Kinder, ←/→ durch die
 * eigene Generation (Geschwister jeweils mit ihren Partnern).
 */
export class TreeNavigator {
  private readonly people: Map<string, PersonSummary>
  /** Von welchem Kind aus wir nach oben gegangen sind – ↓ führt dorthin zurück */
  private readonly cameFrom = new Map<string, string>()
  /** Reihe, in der wir uns gerade seitlich bewegen – sonst springt sie bei eingeheirateten Personen */
  private currentRow: string[] | null = null

  constructor(people: Map<string, PersonSummary>) {
    this.people = people
  }

  up(id: string): string | undefined {
    this.currentRow = null
    const parent = this.people.get(id)?.parents[0]
    if (parent) this.cameFrom.set(parent, id)
    return parent
  }

  down(id: string): string | undefined {
    this.currentRow = null
    const p = this.people.get(id)
    if (!p?.children.length) return undefined
    const back = this.cameFrom.get(id)
    return back && p.children.includes(back) ? back : p.children[0]
  }

  /** Geschwister und Partner in einer Reihe, wie sie im Baum nebeneinander stehen */
  row(id: string): string[] {
    const p = this.people.get(id)
    if (!p) return [id]
    // Eingeheiratete Person ohne Eltern im Baum: Reihe des Partners verwenden
    const anchor = p.parents.length ? p : (p.spouses.map(s => this.people.get(s)).find(s => s?.parents.length) ?? p)
    const parent = anchor.parents[0] ? this.people.get(anchor.parents[0]) : undefined
    const siblings = parent ? parent.children : [anchor.id]
    const row: string[] = []
    for (const s of siblings) {
      if (!row.includes(s)) row.push(s)
      for (const sp of this.people.get(s)?.spouses ?? []) if (!row.includes(sp)) row.push(sp)
    }
    if (!row.includes(id)) row.push(id)
    return row
  }

  side(id: string, step: -1 | 1): string | undefined {
    if (!this.currentRow?.includes(id)) this.currentRow = this.row(id)
    const row = this.currentRow
    return row[row.indexOf(id) + step]
  }
}
