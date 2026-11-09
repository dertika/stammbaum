import { coordGreedy, coordSimplex, decrossTwoLayer, graph, sugiyama, type Graph, type GraphNode, type MutGraphNode } from 'd3-dag'
import { FULL_CARD_H, FULL_CARD_W, type FullLayout } from '../../../shared/types.ts'

const FAMILY_SIZE = 12
const FAMILY_H = 2
/** Senkrechter Abstand zwischen Ebenen – Platz für Partner- und Geschwisterleisten */
const GAP_Y = 28
/** Abstand zwischen Karten nebeneinander */
const GAP_X = 24
/** Abstand zwischen Partnern – Platz für die Ehelinie */
const GAP_PARTNER = 32
/** Größte Gruppe von Partnern, die zusammen angeordnet wird */
const MAX_UNIT = 6

/** Was das Layout von einer Person braucht – nur die Beziehungen */
export interface LayoutPerson {
  id: string
  parents: string[]
  spouses: string[]
  children: string[]
}

/** Knoten im Layout: eine Person oder ein Paar nebeneinander, bzw. ein Familienknoten */
type Datum = { kind: 'unit', members: string[] } | { kind: 'family', id: string }
/** Kante Einheit→Familie (Eltern aus der Einheit) bzw. Familie→Einheit (Kind) */
type LinkDatum = { persons: string[] }

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
 * Reihenfolge einer Gruppe von Partnern, sodass Ehepaare möglichst nebeneinander stehen.
 * Kette (jeder höchstens zwei Partner): entlang der Kette. Eine Person mit mehreren
 * Partnern, die sonst niemanden haben: diese Person in der Mitte. Sonst null.
 */
export function arrangePartners(group: string[], partnersOf: (id: string) => string[]): string[] | null {
  if (group.length === 1) return group
  const inGroup = (id: string) => group.includes(id)
  const deg = new Map(group.map(id => [id, partnersOf(id).filter(inGroup).length]))
  const edges = [...deg.values()].reduce((a, b) => a + b, 0) / 2
  // Kette: alle höchstens zwei Partner, keine Ringe
  if ([...deg.values()].every(d => d <= 2) && edges === group.length - 1) {
    const start = [...group].sort().find(id => deg.get(id) === 1)!
    const order = [start]
    while (order.length < group.length) {
      const next = partnersOf(order.at(-1)!).find(s => inGroup(s) && !order.includes(s))
      if (!next) return null
      order.push(next)
    }
    return order
  }
  // Stern: eine Person in der Mitte, alle anderen nur mit ihr verbunden
  const center = [...group].sort((a, b) => deg.get(b)! - deg.get(a)! || (a < b ? -1 : 1))[0]
  const others = group.filter(id => id !== center).sort()
  if (others.every(id => deg.get(id) === 1 && partnersOf(id).includes(center))) {
    const half = Math.floor(others.length / 2)
    return [...others.slice(0, half), center, ...others.slice(half)]
  }
  return null
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

  // Partner auf derselben Ebene bilden eine Einheit und stehen nebeneinander:
  // ein Paar, eine Kette (frühere Partnerin – Vater – aktuelle Frau) oder eine
  // Person mit mehreren Partnern in der Mitte. Größere Geflechte bleiben einzeln.
  const byId = new Map(people.map(p => [p.id, p]))
  const spousesOf = (id: string) => byId.get(id)!.spouses.filter(s => known.has(s))
  const sameLayer = (id: string) => spousesOf(id).filter(s => layer.get(s) === layer.get(id))
  const unitOf = new Map<string, string[]>()
  for (const p of people) {
    if (unitOf.has(p.id)) continue
    const group = [p.id]
    for (let i = 0; i < group.length && group.length <= MAX_UNIT; i++) {
      for (const s of sameLayer(group[i])) if (!group.includes(s)) group.push(s)
    }
    const members = group.length <= MAX_UNIT ? arrangePartners(group, sameLayer) : null
    if (members) for (const m of members) unitOf.set(m, members)
    else unitOf.set(p.id, [p.id])
  }
  /** Partner, die in ihrer Einheit direkt nebeneinander stehen (Schlüssel „a|b“, sortiert) */
  const adjacent = new Set<string>()
  for (const members of new Set(unitOf.values())) {
    for (let i = 1; i < members.length; i++) {
      if (sameLayer(members[i - 1]).includes(members[i])) adjacent.add([members[i - 1], members[i]].sort().join('|'))
    }
  }
  const isAdjacent = (a: string, b: string) => adjacent.has([a, b].sort().join('|'))

  const g = graph<Datum, LinkDatum>()
  const unitNodes = new Map<string[], MutGraphNode<Datum, LinkDatum>>()
  for (const members of new Set(unitOf.values())) unitNodes.set(members, g.node({ kind: 'unit', members }))
  const nodeOf = (person: string) => unitNodes.get(unitOf.get(person)!)!
  for (const [key, f] of fams) {
    // Kinderloses Paar nebeneinander: die Ehelinie verbindet sie, kein Familienknoten nötig
    if (!f.children.length && f.parents.length === 2 && isAdjacent(f.parents[0], f.parents[1])) continue
    const n = g.node({ kind: 'family', id: key })
    const byUnit = new Map<MutGraphNode<Datum, LinkDatum>, string[]>()
    for (const parent of f.parents) byUnit.set(nodeOf(parent), [...(byUnit.get(nodeOf(parent)) ?? []), parent])
    for (const [unit, persons] of byUnit) g.link(unit, n, { persons })
    for (const child of f.children) g.link(n, nodeOf(child), { persons: [child] })
  }

  // d3-dag verlangt lückenlose Ebenen: belegte Ebenen fortlaufend neu nummerieren
  const rawLayer = (d: Datum) => (d.kind === 'unit' ? layer.get(d.members[0])! : famLayer.get(d.id)!)
  const layering = (dag: Graph<Datum, LinkDatum>) => {
    const used = [...new Set([...dag.nodes()].map(n => rawLayer(n.data)))].sort((a, b) => a - b)
    const index = new Map(used.map((l, i) => [l, i]))
    for (const node of dag.nodes()) node.y = index.get(rawLayer(node.data))!
    // d3-dag erwartet den höchsten Index, nicht die Anzahl
    return used.length - 1
  }

  const unitWidth = (members: string[]) => members.length * FULL_CARD_W + (members.length - 1) * GAP_PARTNER
  const nodeSize = (n: GraphNode<Datum, LinkDatum>): readonly [number, number] =>
    n.data.kind === 'unit' ? [unitWidth(n.data.members), FULL_CARD_H] : [FAMILY_SIZE, FAMILY_H]
  const { width } = sugiyama()
    .nodeSize(nodeSize)
    .layering(layering)
    .decross(decrossTwoLayer())
    .coord(coord === 'simplex' ? coordSimplex() : coordGreedy())
    .gap([GAP_X, GAP_Y])(g)

  // Wo die Eltern jeder Person stehen (x des Familienknotens darüber) und wo die
  // Kinder eines Paares hängen (x des Familienknotens darunter)
  const parentX = new Map<string, number>()
  const childFamilies = new Map<GraphNode<Datum, LinkDatum>, { persons: string[], x: number }[]>()
  for (const l of g.links()) {
    if (l.source.data.kind === 'family') parentX.set(l.data.persons[0], l.source.x)
    else childFamilies.set(l.source, [...(childFamilies.get(l.source) ?? []), { persons: l.data.persons, x: l.target.x }])
  }

  // Personen innerhalb ihrer Einheit von links nach rechts – jeder Partner auf der
  // Seite seiner eigenen Eltern, damit sich deren Linien nicht kreuzen
  const personX = new Map<string, number>()
  for (const node of g.nodes()) {
    if (node.data.kind !== 'unit') continue
    // Richtung der Reihe so wählen, dass jede Person nah unter ihren Eltern und jedes Paar
    // nah über seinen Kindern steht – sonst kreuzen sich die Linien
    const left = node.x - unitWidth(node.data.members) / 2 + FULL_CARD_W / 2
    const place = (order: string[]) => new Map(order.map((m, i) => [m, left + i * (FULL_CARD_W + GAP_PARTNER)]))
    const cost = (xs: Map<string, number>) => {
      let c = 0
      for (const [m, x] of xs) if (parentX.has(m)) c += Math.abs(x - parentX.get(m)!)
      for (const f of childFamilies.get(node) ?? []) {
        const mid = f.persons.reduce((sum, m) => sum + xs.get(m)!, 0) / f.persons.length
        c += Math.abs(mid - f.x)
      }
      return c
    }
    const forward = place(node.data.members)
    const backward = place([...node.data.members].reverse())
    for (const [m, x] of cost(backward) < cost(forward) ? backward : forward) personX.set(m, x)
  }
  return routeOrthogonal(g, width, personX, isAdjacent)
}

/** Waagerechter Abstand zwischen Spuren, unter dem der Zwischenraum vergrößert wird */
const MIN_TRACK_GAP = 7
/** Abstand, den Leisten verschiedener Familien auf derselben Spur mindestens halten */
const TRACK_MARGIN = 14

interface Hop {
  /** Index des Zwischenraums (zwischen Ebene i und i+1) */
  channel: number
  /** Leisten mit gleichem Schlüssel teilen sich eine Spur (Partner- bzw. Geschwisterleiste) */
  group: string
  x1: number
  x2: number
}

/**
 * Verlegt alle Linien rechtwinklig wie in einem gezeichneten Stammbaum:
 * waagerechte Stücke nur in den Zwischenräumen zwischen den Ebenen, senkrechte
 * nur an der eigenen Karte, am Familienknoten oder in den Lücken, die d3-dag für
 * lange Kanten freihält. So läuft keine Linie hinter einer Karte durch.
 */
function routeOrthogonal(
  g: Graph<Datum, LinkDatum>,
  width: number,
  personX: Map<string, number>,
  isAdjacent: (a: string, b: string) => boolean,
): FullLayout {
  const half = (d: Datum) => (d.kind === 'unit' ? FULL_CARD_H / 2 : FAMILY_H / 2)
  const famKey = (l: { source: GraphNode<Datum, LinkDatum>, target: GraphNode<Datum, LinkDatum> }) =>
    l.target.data.kind === 'family' ? l.target.data.id : l.source.data.kind === 'family' ? l.source.data.id : ''

  // Elternlinien: bei nebeneinanderstehenden Partnern eine Linie ab der Mitte der Ehelinie
  // (auf halber Kartenhöhe), sonst je Elternteil ab der Kartenunterkante.
  // Kindlinien enden an der eigenen Karte.
  type Line = { link: (typeof links)[number], pts: [number, number][], fromMiddle?: boolean }
  const links = [...g.links()]
  const lines: Line[] = links.flatMap(l => {
    const pts = l.points.map(p => [p[0], p[1]] as [number, number])
    if (l.source.data.kind === 'unit') {
      const [a, b] = l.data.persons
      if (b && l.data.persons.length === 2 && isAdjacent(a, b)) {
        const mx = (personX.get(a)! + personX.get(b)!) / 2
        return [{ link: l, pts: [[mx, pts[0][1]] as [number, number], ...pts.slice(1)], fromMiddle: true }]
      }
      return l.data.persons.map(person => ({ link: l, pts: [[personX.get(person)!, pts[0][1]] as [number, number], ...pts.slice(1)] }))
    }
    pts[pts.length - 1] = [personX.get(l.data.persons[0])!, pts[pts.length - 1][1]]
    return [{ link: l, pts }]
  })

  // Ebenen mit ihrer halben Höhe (größte Karte der Ebene)
  const ys = [...new Set([...[...g.nodes()].map(n => n.y), ...lines.flatMap(l => l.pts.map(p => p[1]))])].sort((a, b) => a - b)
  const layerOf = new Map(ys.map((y, i) => [y, i]))
  const layerHalf = ys.map(() => 0)
  for (const n of g.nodes()) layerHalf[layerOf.get(n.y)!] = Math.max(layerHalf[layerOf.get(n.y)!], half(n.data))

  // 1. Jede Linie in Abschnitte je Zwischenraum zerlegen
  const hopsByLine = lines.map(({ link, pts }, li) => {
    const fam = famKey(link)
    return pts.slice(1).map((p, k): Hop => {
      const channel = layerOf.get(pts[k][1])!
      // Abschnitt direkt am Familienknoten: gemeinsame Leiste der Familie
      const atFamily = (link.target.data.kind === 'family' && k === pts.length - 2) || (link.source.data.kind === 'family' && k === 0)
      return { channel, group: atFamily ? `${fam}@${channel}` : `line${li}:${k}`, x1: pts[k][0], x2: p[0] }
    })
  })

  // 2. Je Zwischenraum Spuren verteilen (Intervall-Färbung)
  const groups = new Map<string, { channel: number, min: number, max: number }>()
  for (const h of hopsByLine.flat()) {
    const v = groups.get(h.group) ?? { channel: h.channel, min: Infinity, max: -Infinity }
    v.min = Math.min(v.min, h.x1, h.x2)
    v.max = Math.max(v.max, h.x1, h.x2)
    groups.set(h.group, v)
  }
  const trackOf = new Map<string, number>()
  const tracksIn = ys.map(() => 0)
  const byChannel = new Map<number, [string, { min: number, max: number }][]>()
  for (const [key, v] of groups) byChannel.set(v.channel, [...(byChannel.get(v.channel) ?? []), [key, v]])
  for (const [channel, list] of byChannel) {
    list.sort((a, b) => a[1].min - b[1].min || a[1].max - b[1].max)
    const ends: number[] = []
    for (const [key, v] of list) {
      // Rein senkrechte Stücke brauchen keine eigene Spur
      if (v.max - v.min < 0.5) {
        trackOf.set(key, -1)
        continue
      }
      let t = ends.findIndex(end => end + TRACK_MARGIN <= v.min)
      if (t < 0) t = ends.push(v.max) - 1
      else ends[t] = v.max
      trackOf.set(key, t)
    }
    tracksIn[channel] = ends.length
  }

  // 3. Zwischenräume bei Bedarf vergrößern und Ebenen nach unten verschieben
  const newY: number[] = []
  let shift = 0
  for (let i = 0; i < ys.length; i++) {
    if (i > 0) {
      const space = ys[i] - layerHalf[i] - (ys[i - 1] + layerHalf[i - 1])
      const needed = (tracksIn[i - 1] + 1) * MIN_TRACK_GAP
      if (needed > space) shift += needed - space
    }
    newY.push(ys[i] + shift)
  }
  const top = (c: number) => newY[c] + layerHalf[c]
  const trackY = (h: Hop) => {
    const c = h.channel
    const space = newY[c + 1] - layerHalf[c + 1] - top(c)
    const t = trackOf.get(h.group)!
    return t < 0 ? top(c) + space / 2 : top(c) + ((t + 1) * space) / (tracksIn[c] + 1)
  }
  const y = (oldY: number) => newY[layerOf.get(oldY)!]

  // 4. Linienzüge: senkrecht zur Spur, waagerecht, senkrecht weiter
  const round = (v: number) => Math.round(v * 10) / 10
  const result: FullLayout = { width: round(width), height: 0, people: [], families: [], links: [] }
  lines.forEach(({ link, pts, fromMiddle }, li) => {
    const out: [number, number][] = [[pts[0][0], y(pts[0][1]) + (fromMiddle ? 0 : half(link.source.data))]]
    hopsByLine[li].forEach((h, k) => {
      const ty = trackY(h)
      const [nx, ny] = pts[k + 1]
      const last = k === pts.length - 2
      out.push([h.x1, ty], [nx, ty], [nx, y(ny) - (last ? half(link.target.data) : 0)])
    })
    // doppelte Punkte (bei rein senkrechten Stücken) entfernen
    const clean = out.filter((p, i) => i === 0 || p[0] !== out[i - 1][0] || p[1] !== out[i - 1][1])
    result.links.push({ points: clean.map(([px, py]) => [round(px), round(py)] as [number, number]) })
  })
  for (const node of g.nodes()) {
    const ny = round(y(node.y))
    if (node.data.kind !== 'unit') {
      result.families.push({ x: round(node.x), y: ny })
      continue
    }
    const m = node.data.members
    m.forEach(id => result.people.push({ id, x: round(personX.get(id)!), y: ny }))
    // Ehelinien zwischen nebeneinanderstehenden Partnern, von Kartenrand zu Kartenrand
    const ordered = [...m].sort((a, b) => personX.get(a)! - personX.get(b)!)
    for (let i = 1; i < ordered.length; i++) {
      if (!isAdjacent(ordered[i - 1], ordered[i])) continue
      const x1 = personX.get(ordered[i - 1])! + FULL_CARD_W / 2
      const x2 = personX.get(ordered[i])! - FULL_CARD_W / 2
      result.links.push({ points: [[round(x1), ny], [round(x2), ny]] })
    }
  }
  result.height = round(newY.at(-1)! + layerHalf.at(-1)! + FULL_CARD_H / 2)
  return result
}
