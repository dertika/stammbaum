import { coordGreedy, coordSimplex, decrossTwoLayer, graph, sugiyama, type Graph, type GraphNode, type MutGraphNode } from 'd3-dag'
import { FULL_CARD_H, FULL_CARD_W, type FullLayout } from '../../../shared/types.ts'

const FAMILY_SIZE = 12
const FAMILY_H = 2
/** Senkrechter Abstand zwischen Ebenen – Platz für Partner- und Geschwisterleisten */
const GAP_Y = 28
/** Abstand zwischen Karten nebeneinander (auch innerhalb eines Paares) */
const GAP_X = 24

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

  // Paare, die beide nur diese eine Ehe haben, werden eine Einheit und stehen so
  // immer nebeneinander. Mehrfach Verheiratete bleiben einzeln.
  const byId = new Map(people.map(p => [p.id, p]))
  const spousesOf = (id: string) => byId.get(id)!.spouses.filter(s => known.has(s))
  const unitOf = new Map<string, string[]>()
  for (const p of people) {
    if (unitOf.has(p.id)) continue
    const sp = spousesOf(p.id)
    const partner = sp.length === 1 ? sp[0] : undefined
    if (partner && !unitOf.has(partner) && spousesOf(partner).length === 1 && layer.get(partner) === layer.get(p.id)) {
      const members = [p.id, partner].sort()
      for (const m of members) unitOf.set(m, members)
    } else {
      unitOf.set(p.id, [p.id])
    }
  }

  const g = graph<Datum, LinkDatum>()
  const unitNodes = new Map<string[], MutGraphNode<Datum, LinkDatum>>()
  for (const members of new Set(unitOf.values())) unitNodes.set(members, g.node({ kind: 'unit', members }))
  const nodeOf = (person: string) => unitNodes.get(unitOf.get(person)!)!
  for (const [key, f] of fams) {
    const inUnit = unitOf.get(f.parents[0])!
    // Kinderloses Paar in einer Einheit: steht ohnehin nebeneinander, kein Familienknoten nötig
    if (!f.children.length && f.parents.every(id => inUnit.includes(id))) continue
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

  const unitWidth = (members: string[]) => members.length * FULL_CARD_W + (members.length - 1) * GAP_X
  const nodeSize = (n: GraphNode<Datum, LinkDatum>): readonly [number, number] =>
    n.data.kind === 'unit' ? [unitWidth(n.data.members), FULL_CARD_H] : [FAMILY_SIZE, FAMILY_H]
  const { width } = sugiyama()
    .nodeSize(nodeSize)
    .layering(layering)
    .decross(decrossTwoLayer())
    .coord(coord === 'simplex' ? coordSimplex() : coordGreedy())
    .gap([GAP_X, GAP_Y])(g)

  // Wo die Eltern jeder Person stehen (x des Familienknotens darüber)
  const parentX = new Map<string, number>()
  for (const l of g.links()) if (l.source.data.kind === 'family') parentX.set(l.data.persons[0], l.source.x)

  // Personen innerhalb ihrer Einheit von links nach rechts – jeder Partner auf der
  // Seite seiner eigenen Eltern, damit sich deren Linien nicht kreuzen
  const personX = new Map<string, number>()
  for (const node of g.nodes()) {
    if (node.data.kind !== 'unit') continue
    const members = [...node.data.members]
    const side = (m: string) => parentX.get(m) ?? node.x
    if (members.length === 2 && side(members[0]) > side(members[1])) members.reverse()
    const left = node.x - unitWidth(members) / 2 + FULL_CARD_W / 2
    members.forEach((m, i) => personX.set(m, left + i * (FULL_CARD_W + GAP_X)))
  }
  return routeOrthogonal(g, width, personX)
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
function routeOrthogonal(g: Graph<Datum, LinkDatum>, width: number, personX: Map<string, number>): FullLayout {
  const half = (d: Datum) => (d.kind === 'unit' ? FULL_CARD_H / 2 : FAMILY_H / 2)
  const famKey = (l: { source: GraphNode<Datum, LinkDatum>, target: GraphNode<Datum, LinkDatum> }) =>
    l.target.data.kind === 'family' ? l.target.data.id : l.source.data.kind === 'family' ? l.source.data.id : ''

  // Jede Elternlinie beginnt an der eigenen Karte, jede Kindlinie endet an der eigenen Karte
  const lines = [...g.links()].flatMap(l => {
    const pts = l.points.map(p => [p[0], p[1]] as [number, number])
    if (l.source.data.kind === 'unit') {
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
  lines.forEach(({ link, pts }, li) => {
    const out: [number, number][] = [[pts[0][0], y(pts[0][1]) + half(link.source.data)]]
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
    if (node.data.kind === 'unit') for (const m of node.data.members) result.people.push({ id: m, x: round(personX.get(m)!), y: ny })
    else result.families.push({ x: round(node.x), y: ny })
  }
  result.height = round(newY.at(-1)! + layerHalf.at(-1)! + FULL_CARD_H / 2)
  return result
}
