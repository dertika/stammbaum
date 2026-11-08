import { coordGreedy, coordSimplex, decrossTwoLayer, graph, sugiyama, type Graph, type GraphNode, type MutGraphNode } from 'd3-dag'
import { FULL_CARD_H, FULL_CARD_W, type FullLayout } from '../../../shared/types.ts'

const FAMILY_SIZE = 12

/** Was das Layout von einer Person braucht – nur die Beziehungen */
export interface LayoutPerson {
  id: string
  parents: string[]
  spouses: string[]
  children: string[]
}

type Datum = { kind: 'person', id: string } | { kind: 'family', id: string }

/**
 * Generation jeder Person: Eltern eine darüber, Kinder eine darunter,
 * Partner gleichauf. Jede zusammenhängende Gruppe wird für sich nummeriert.
 */
export function generations(people: LayoutPerson[]): Map<string, number> {
  const byId = new Map(people.map(p => [p.id, p]))
  const gen = new Map<string, number>()
  // Mit Stammeltern (ohne Eltern im Baum) beginnen, damit die erste Zuordnung möglichst stimmt
  const starts = [...people].sort((a, b) => a.parents.length - b.parents.length)
  for (const start of starts) {
    if (gen.has(start.id)) continue
    gen.set(start.id, 0)
    const queue = [start.id]
    while (queue.length) {
      const id = queue.shift()!
      const p = byId.get(id)!
      const g = gen.get(id)!
      const visit = (other: string, value: number) => {
        if (!byId.has(other) || gen.has(other)) return
        gen.set(other, value)
        queue.push(other)
      }
      p.spouses.forEach(s => visit(s, g))
      p.parents.forEach(s => visit(s, g - 1))
      p.children.forEach(s => visit(s, g + 1))
    }
  }
  return gen
}

/** Familien: je Elternpaar (bzw. Elternteil) ein Knoten, dazu kinderlose Paare */
function families(people: LayoutPerson[], known: Set<string>) {
  const fams = new Map<string, { parents: string[], children: string[] }>()
  const fam = (parents: string[]) => {
    const sorted = [...parents].sort()
    const key = sorted.join('+')
    let f = fams.get(key)
    if (!f) fams.set(key, (f = { parents: sorted, children: [] }))
    return f
  }
  for (const p of people) {
    const parents = p.parents.filter(id => known.has(id))
    if (parents.length) fam(parents).children.push(p.id)
    for (const s of p.spouses) if (known.has(s)) fam([p.id, s])
  }
  return fams
}

/**
 * Ordnet alle Personen in Generationen an (Sugiyama-Verfahren).
 * `simplex` liefert deutlich ruhigere Linien, ist aber bei großen Bäumen langsam –
 * deshalb läuft es im Backend in einem Worker und wird zwischengespeichert.
 */
export function layoutAll(people: LayoutPerson[], coord: 'greedy' | 'simplex' = 'simplex'): FullLayout {
  if (!people.length) return { width: 0, height: 0, people: [], families: [], links: [] }
  const known = new Set(people.map(p => p.id))
  const gen = generations(people)
  const fams = families(people, known)

  // Ebenen: Personen auf geraden, Familien auf ungeraden Ebenen.
  // Danach so lange nachschieben, bis jede Kante nach unten zeigt
  // (nötig z. B. bei Ehen zwischen Generationen).
  const minGen = Math.min(0, ...gen.values())
  const layer = new Map<string, number>()
  for (const [id, g] of gen) layer.set(id, 2 * (g - minGen))
  const famLayer = new Map<string, number>()
  for (let changed = true, round = 0; changed && round <= people.length; round++) {
    changed = false
    for (const [key, f] of fams) {
      const fl = Math.max(...f.parents.map(id => layer.get(id)!)) + 1
      famLayer.set(key, fl)
      for (const c of f.children) {
        if (layer.get(c)! <= fl) {
          layer.set(c, fl % 2 ? fl + 1 : fl + 2)
          changed = true
        }
      }
    }
  }

  const g = graph<Datum, undefined>()
  const nodes = new Map<string, MutGraphNode<Datum, undefined>>()
  for (const p of people) nodes.set(p.id, g.node({ kind: 'person', id: p.id }))
  for (const [key, f] of fams) {
    const n = g.node({ kind: 'family', id: key })
    for (const parent of f.parents) g.link(nodes.get(parent)!, n)
    for (const child of f.children) g.link(n, nodes.get(child)!)
  }

  // d3-dag verlangt lückenlose Ebenen: belegte Ebenen fortlaufend neu nummerieren
  const rawLayer = (d: Datum) => (d.kind === 'person' ? layer.get(d.id)! : famLayer.get(d.id)!)
  const layering = (dag: Graph<Datum, undefined>) => {
    const used = [...new Set([...dag.nodes()].map(n => rawLayer(n.data)))].sort((a, b) => a - b)
    const index = new Map(used.map((l, i) => [l, i]))
    for (const node of dag.nodes()) node.y = index.get(rawLayer(node.data))!
    // d3-dag erwartet den höchsten Index, nicht die Anzahl
    return used.length - 1
  }

  const nodeSize = (n: GraphNode<Datum, undefined>): readonly [number, number] =>
    n.data.kind === 'person' ? [FULL_CARD_W, FULL_CARD_H] : [FAMILY_SIZE, FAMILY_SIZE]
  const { width, height } = sugiyama()
    .nodeSize(nodeSize)
    .layering(layering)
    .decross(decrossTwoLayer())
    .coord(coord === 'simplex' ? coordSimplex() : coordGreedy())
    .gap([24, 36])(g)

  const round = (v: number) => Math.round(v * 10) / 10
  const result: FullLayout = { width: round(width), height: round(height), people: [], families: [], links: [] }
  for (const node of g.nodes()) {
    if (node.data.kind === 'person') result.people.push({ id: node.data.id, x: round(node.x), y: round(node.y) })
    else result.families.push({ x: round(node.x), y: round(node.y) })
  }
  for (const link of g.links()) {
    result.links.push({ points: link.points.map(([x, y]) => [round(x), round(y)] as [number, number]) })
  }
  return result
}
