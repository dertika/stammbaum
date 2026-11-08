<script lang="ts">
  import { onMount } from 'svelte'
  import { select } from 'd3-selection'
  import { zoom, zoomIdentity, type ZoomBehavior, type ZoomTransform } from 'd3-zoom'
  import 'd3-transition'
  import { FULL_CARD_H as CARD_H, FULL_CARD_W as CARD_W, type PersonSummary } from '../../../shared/types.ts'
  import { fetchLayout } from './api.ts'
  import { fullName, initials, lifespan } from './format.ts'

  interface Placed {
    id: string
    person: PersonSummary
    x: number
    y: number
  }
  interface Layout {
    width: number
    height: number
    people: Placed[]
    families: { x: number, y: number }[]
    links: { d: string, minX: number, maxX: number, minY: number, maxY: number }[]
  }

  interface Props {
    people: PersonSummary[]
    /** Person, auf die beim Öffnen gezoomt wird */
    focusId: string | null
    onOpen: (id: string) => void
  }

  let { people, focusId, onOpen }: Props = $props()

  let svg: SVGSVGElement
  let width = $state(0)
  let height = $state(0)
  let layout = $state<Layout | null>(null)
  /** Server rechnet noch (großer Baum, erstes Öffnen nach Datenänderung) */
  let waiting = $state(false)
  let failed = $state('')
  let transform = $state<ZoomTransform>(zoomIdentity)
  let zoomer: ZoomBehavior<SVGSVGElement, unknown> | undefined

  /** Rechtwinkliger Linienzug (vom Server so verlegt) als SVG-Pfad */
  const path = (points: [number, number][]) => `M${points.map(p => p.join(',')).join('L')}`

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
  const visiblePeople = $derived(layout?.people.filter(p => p.x >= view.x0 && p.x <= view.x1 && p.y >= view.y0 && p.y <= view.y1) ?? [])
  const visibleLinks = $derived((layout?.links ?? []).filter(l => l.maxX >= view.x0 && l.minX <= view.x1 && l.maxY >= view.y0 && l.minY <= view.y1))
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
    const k = Math.min(1, 0.95 * Math.min(width / layout.width, height / layout.height))
    moveTo(zoomIdentity.translate((width - layout.width * k) / 2, (height - layout.height * k) / 2).scale(k), animate)
  }

  /** Auf eine Person zoomen */
  export function focus(id: string, animate = true) {
    const p = layout?.people.find(n => n.id === id)
    if (!p) return
    const k = Math.max(transform.k, 0.8)
    moveTo(zoomIdentity.translate(width / 2 - p.x * k, height / 2 - p.y * k).scale(k), animate)
  }

  onMount(() => {
    zoomer = zoom<SVGSVGElement, unknown>()
      .scaleExtent([0.02, 2])
      .on('zoom', e => (transform = e.transform))
    select(svg).call(zoomer).on('dblclick.zoom', null)

    // Das Layout rechnet der Server einmal für alle; Namen und Fotos kommen aus dem Baum
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false
    const byId = new Map(people.map(p => [p.id, p]))
    const load = async () => {
      try {
        const res = await fetchLayout()
        if (cancelled) return
        if ('status' in res) {
          waiting = true
          timer = setTimeout(load, 2000)
          return
        }
        layout = {
          width: res.width,
          height: res.height,
          people: res.people.flatMap(p => (byId.has(p.id) ? [{ ...p, person: byId.get(p.id)! }] : [])),
          families: res.families,
          links: res.links.map(l => {
            const xs = l.points.map(p => p[0])
            const ys = l.points.map(p => p[1])
            return { d: path(l.points), minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
          }),
        }
        requestAnimationFrame(() => {
          if (focusId && layout && layout.width > width * 1.5) focus(focusId, false)
          else fitAll(false)
        })
      } catch (err) {
        if (!cancelled) failed = err instanceof Error ? err.message : String(err)
      }
    }
    load()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
  })

  const short = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

  function onKey(e: KeyboardEvent, id: string) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      onOpen(id)
    }
  }
</script>

<div class="full" bind:clientWidth={width} bind:clientHeight={height}>
  <svg bind:this={svg} role="img" aria-label="Gesamter Stammbaum">
    <g transform="translate({transform.x},{transform.y}) scale({transform.k})">
      {#each visibleLinks as l, i (i)}
        <path class="link" d={l.d} />
      {/each}
      {#each visiblePeople as n (n.id)}
        {@const p = n.person}
        <g
          class="card card-{p.gender}"
          class:anon={p.anonymized}
          class:focus={n.id === focusId}
          transform="translate({n.x - CARD_W / 2},{n.y - CARD_H / 2})"
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
            <text class="name" x={detail === 'full' ? 64 : 12} y="27">{short(fullName(p), detail === 'full' ? 18 : 24)}</text>
            <text class="dates" x={detail === 'full' ? 64 : 12} y="46">{lifespan(p)}</text>
          {/if}
        </g>
      {/each}
    </g>
  </svg>

  {#if failed}
    <p class="overlay">Der Gesamtbaum konnte nicht berechnet werden ({failed}).</p>
  {:else if !layout}
    <p class="overlay" aria-busy="true">{waiting ? 'Der Gesamtbaum wird gerade vorbereitet – bei großen Stammbäumen kann das etwas dauern …' : 'Gesamtbaum wird geladen …'}</p>
  {:else}
    <div class="tools">
      <button type="button" onclick={() => fitAll()}>Alles zeigen</button>
      <button type="button" aria-label="Vergrößern" onclick={() => moveTo(transform.scale(1.5))}>+</button>
      <button type="button" aria-label="Verkleinern" onclick={() => moveTo(transform.scale(1 / 1.5))}>−</button>
    </div>
    <p class="hint">{layout.people.length} Personen · Klick auf eine Person öffnet sie im Baum</p>
  {/if}
</div>

<style>
  .full { position: relative; width: 100%; height: 100%; overflow: hidden; background: var(--bg); }
  svg { display: block; width: 100%; height: 100%; cursor: grab; touch-action: none; }
  svg:active { cursor: grabbing; }
  .link { fill: none; stroke: var(--muted); stroke-width: 1.5px; stroke-linejoin: miter; stroke-linecap: square; }
  .card { cursor: pointer; }
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
  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    color: var(--muted);
    pointer-events: none;
  }
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
