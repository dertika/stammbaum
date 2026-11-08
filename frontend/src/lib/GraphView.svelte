<script lang="ts">
  import { onMount } from 'svelte'
  import { select } from 'd3-selection'
  import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
  import 'd3-transition'
  import { FULL_CARD_H as CARD_H, FULL_CARD_W as CARD_W, type FullLayout, type PersonSummary } from '../../../shared/types.ts'
  import { fullName, initials, lifespan } from './format.ts'

  /** Kamera nach einem neuen Layout: einpassen, Fokusperson mittig oder so lassen */
  export type Camera = 'fit' | 'focus' | 'keep'

  interface Props {
    /** Vom Server berechnete Anordnung (nur Positionen und Linien) */
    layout: FullLayout | null
    people: PersonSummary[]
    focusId: string | null
    onOpen: (id: string) => void
    /** Präsentation: kontrastreich, große Schrift */
    variant?: 'normal' | 'present'
    /** Kamera beim ersten Layout bzw. bei jedem weiteren */
    initialCamera?: Camera
    nextCamera?: Camera
    /** Kurzer Hinweis unten links (z. B. Anzahl Personen) */
    hint?: string
    /** Werkzeugleiste oben rechts (Alles zeigen, +, −) */
    tools?: boolean
  }

  let { layout, people, focusId, onOpen, variant = 'normal', initialCamera = 'fit', nextCamera = 'focus', hint, tools = true }: Props = $props()

  let svg: SVGSVGElement
  let width = $state(0)
  let height = $state(0)
  let transform = $state<ZoomTransform>(zoomIdentity)
  let zoomer: ZoomBehavior<SVGSVGElement, unknown> | undefined
  /** Linien während der Bewegung ausblenden, damit sie nicht „hinterherhängen“ */
  let linksShown = $state(true)
  let shownLayout: FullLayout | null = null

  const byId = $derived(new Map(people.map(p => [p.id, p])))

  /** Rechtwinkliger Linienzug (vom Server so verlegt) als SVG-Pfad */
  const path = (points: [number, number][]) => `M${points.map(p => p.join(',')).join('L')}`

  const placed = $derived(layout?.people.flatMap(p => (byId.has(p.id) ? [{ ...p, person: byId.get(p.id)! }] : [])) ?? [])
  const lines = $derived(layout?.links.map(l => {
    const xs = l.points.map(p => p[0])
    const ys = l.points.map(p => p[1])
    return { d: path(l.points), minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
  }) ?? [])

  /** Sichtbarer Ausschnitt in Layout-Koordinaten, mit etwas Rand */
  const view = $derived.by(() => {
    const k = transform.k
    const margin = CARD_W
    return {
      x0: -transform.x / k - margin,
      x1: (width - transform.x) / k + margin,
      y0: -transform.y / k - margin,
      y1: (height - transform.y) / k + margin,
    }
  })
  // Nur zeichnen, was zu sehen ist – sonst wird es bei tausenden Personen zäh
  const visiblePeople = $derived(placed.filter(p => p.x >= view.x0 && p.x <= view.x1 && p.y >= view.y0 && p.y <= view.y1))
  const visibleLinks = $derived(lines.filter(l => l.maxX >= view.x0 && l.minX <= view.x1 && l.maxY >= view.y0 && l.minY <= view.y1))
  /** Detailstufe nach Zoom: weit draußen nur Kästchen, nah dran mit Fotos */
  const detail = $derived(transform.k < 0.22 ? 'blocks' : transform.k < 0.45 ? 'text' : 'full')

  function moveTo(t: ZoomTransform, animate = true) {
    if (!zoomer) return
    const sel = select(svg)
    if (animate) sel.transition().duration(600).call(zoomer.transform, t)
    else sel.call(zoomer.transform, t)
  }

  /** Ganzen Baum einpassen */
  export function fitAll(animate = true) {
    if (!layout || !width || !height) return
    const k = Math.min(variant === 'present' ? 2 : 1, 0.95 * Math.min(width / layout.width, height / layout.height))
    moveTo(zoomIdentity.translate((width - layout.width * k) / 2, (height - layout.height * k) / 2).scale(k), animate)
  }

  /** Auf eine Person zoomen (Zoomstufe bleibt, mindestens gut lesbar) */
  export function focus(id: string, animate = true) {
    const p = layout?.people.find(n => n.id === id)
    if (!p) return
    const k = Math.max(transform.k, 0.8)
    moveTo(zoomIdentity.translate(width / 2 - p.x * k, height / 2 - p.y * k).scale(k), animate)
  }

  export function zoomBy(factor: number) {
    moveTo(transform.scale(factor))
  }

  /** Für den PDF-Export: alle Personen und Linien */
  export function exportData() {
    if (!layout) return null
    return {
      cards: placed.map(p => ({ person: p.person, x: p.x, y: p.y })),
      links: lines.map(l => l.d),
      linePoints: lines.flatMap(l => [[l.minX, l.minY], [l.maxX, l.maxY]] as [number, number][]),
    }
  }

  // Neues Layout: Karten gleiten (CSS), Linien kurz ausblenden, Kamera nachführen
  $effect(() => {
    const l = layout
    if (!l || l === shownLayout || !width || !height) return
    const first = shownLayout === null
    shownLayout = l
    const camera = first ? initialCamera : nextCamera
    if (!first) {
      linksShown = false
      setTimeout(() => (linksShown = true), 620)
    }
    requestAnimationFrame(() => {
      if (camera === 'fit') fitAll(!first)
      else if (camera === 'focus' && focusId) focus(focusId, !first)
    })
  })

  onMount(() => {
    zoomer = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.02, 3])
      .on('zoom', e => (transform = e.transform))
    select(svg).call(zoomer).on('dblclick.zoom', null)
  })

  const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

  function onKey(e: KeyboardEvent, id: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(id)
    }
  }
</script>

<div class="graph" class:present={variant === 'present'} bind:clientWidth={width} bind:clientHeight={height}>
  <svg bind:this={svg} role="img" aria-label="Stammbaum">
    <g transform="translate({transform.x},{transform.y}) scale({transform.k})">
      <g class="links" class:hidden={!linksShown}>
        {#each visibleLinks as l, i (i)}
          <path class="link" d={l.d} />
        {/each}
      </g>
      {#each visiblePeople as n (n.id)}
        {@const p = n.person}
        <g
          class="card card-{p.gender}"
          class:anon={p.anonymized}
          class:focus={n.id === focusId}
          style="transform: translate({n.x - CARD_W / 2}px, {n.y - CARD_H / 2}px)"
          role="button"
          tabindex="0"
          aria-label={fullName(p)}
          onclick={() => onOpen(n.id)}
          onkeydown={e => onKey(e, n.id)}
        >
          <rect width={CARD_W} height={CARD_H} rx="10" />
          {#if detail !== 'blocks'}
            {#if detail === 'full'}
              <clipPath id="c-{n.id}"><circle cx="32" cy={CARD_H / 2} r="22" /></clipPath>
              <circle class="avatar" cx="32" cy={CARD_H / 2} r="22" />
              {#if p.photo}
                <image href={p.photo} x="10" y={CARD_H / 2 - 22} width="44" height="44" clip-path="url(#c-{n.id})" preserveAspectRatio="xMidYMid slice" />
              {:else}
                <text class="initials" x="32" y={CARD_H / 2 + 5} text-anchor="middle">{initials(p)}</text>
              {/if}
            {/if}
            <text class="name" x={detail === 'full' ? 64 : 12} y="27">{short(fullName(p), detail === 'full' ? 17 : 22)}</text>
            <text class="dates" x={detail === 'full' ? 64 : 12} y="47">{lifespan(p)}</text>
          {/if}
        </g>
      {/each}
    </g>
  </svg>

  {#if layout && tools}
    <div class="tools">
      <button type="button" onclick={() => fitAll()}>Alles zeigen</button>
      <button type="button" aria-label="Vergrößern" onclick={() => zoomBy(1.5)}>+</button>
      <button type="button" aria-label="Verkleinern" onclick={() => zoomBy(1 / 1.5)}>−</button>
    </div>
  {/if}
  {#if layout && hint}
    <p class="hint">{hint}</p>
  {/if}
</div>

<style>
  .graph { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--bg); }
  svg { display: block; width: 100%; height: 100%; cursor: grab; touch-action: none; }
  svg:active { cursor: grabbing; }
  .links { transition: opacity 0.25s; }
  .links.hidden { opacity: 0; transition: none; }
  .link { fill: none; stroke: var(--muted); stroke-width: 1.5px; stroke-linejoin: miter; stroke-linecap: square; }
  .card { cursor: pointer; transition: transform 0.6s ease-in-out; animation: appear 0.4s ease-out; }
  @keyframes appear { from { opacity: 0; } }
  .card rect { fill: var(--unknown); stroke: var(--border); }
  .card-M rect { fill: var(--male); }
  .card-F rect { fill: var(--female); }
  .card.anon { opacity: 0.75; }
  .card.focus rect { stroke: var(--accent); stroke-width: 3px; }
  .card:hover rect, .card:focus-visible rect { stroke: var(--accent); stroke-width: 2px; }
  .card:focus { outline: none; }
  .avatar { fill: var(--surface); }
  .initials { fill: var(--muted); font-size: 15px; font-weight: 600; }
  .name { fill: var(--text); font-size: 14px; font-weight: 600; }
  .dates { fill: var(--muted); font-size: 12px; }

  /* Präsentation: helle Karten auf Schwarz, kräftige Linien */
  .present { background: #000; }
  .present .link { stroke: #9a9a9a; stroke-width: 2.5px; }
  .present .card rect { fill: #fff; stroke: #9e9e9e; stroke-width: 1px; }
  .present .card-M rect { fill: #e3f0fb; }
  .present .card-F rect { fill: #fbe6ec; }
  .present .card.anon rect { fill: #d9d9d9; }
  .present .card.anon { opacity: 1; }
  .present .card.focus rect { stroke: #ffd400; stroke-width: 5px; }
  .present .avatar { fill: #e6e6e6; }
  .present .initials { fill: #333; }
  .present .name { fill: #000; font-size: 15px; font-weight: 700; }
  .present .dates { fill: #333; font-size: 13px; }

  .tools { position: absolute; top: 12px; right: 12px; display: flex; gap: 6px; }
  .tools button {
    min-width: 36px;
    height: 36px;
    padding: 0 12px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--surface);
    cursor: pointer;
  }
  .tools button:hover { border-color: var(--accent); }
  .hint {
    position: absolute;
    left: 12px;
    bottom: 12px;
    margin: 0;
    padding: 6px 10px;
    border-radius: 8px;
    background: var(--surface);
    color: var(--muted);
    font-size: 13px;
    pointer-events: none;
  }
</style>
