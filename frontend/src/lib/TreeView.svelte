<script lang="ts">
  import { onMount } from 'svelte'
  import { createChart } from 'family-chart'
  import 'family-chart/styles/family-chart.css'
  import type { PersonSummary } from '../../../shared/types.ts'
  import { escapeHtml, fullName, initials, lifespan } from './format.ts'

  type Chart = ReturnType<typeof createChart>

  interface Props {
    people: PersonSummary[]
    mainId: string
    ancestryDepth: number
    progenyDepth: number
    onSelect: (id: string) => void
    /** Präsentation: große Karten, hoher Kontrast, Ausschnitt immer eingepasst */
    variant?: 'normal' | 'present'
  }

  let { people, mainId, ancestryDepth, progenyDepth, onSelect, variant = 'normal' }: Props = $props()
  const present = $derived(variant === 'present')

  let container: HTMLDivElement
  let chart: Chart | undefined
  let shownMain: string | undefined

  function toChartData(list: PersonSummary[]) {
    return list.map(p => ({
      id: p.id,
      // family-chart kennt nur M/F; „U“ landet als genderless-Karte
      data: { gender: p.gender as 'M' | 'F', person: p },
      rels: { parents: p.parents, spouses: p.spouses, children: p.children },
    }))
  }

  function cardHtml(d: { data: { data: { person: PersonSummary } } }): string {
    const p = d.data.data.person
    const avatar = p.photo
      ? `<img src="${escapeHtml(p.photo)}" alt="" loading="lazy" />`
      : `<span>${escapeHtml(initials(p))}</span>`
    return `
      <div class="card-inner sb-card${p.anonymized ? ' sb-anon' : ''}">
        <div class="sb-avatar">${avatar}</div>
        <div class="sb-text">
          <div class="sb-name">${escapeHtml(fullName(p))}</div>
          <div class="sb-dates">${escapeHtml(lifespan(p))}</div>
        </div>
      </div>`
  }

  /** Zoom-Steuerung von außen: Baum einpassen bzw. Hauptperson mittig. */
  export function fit() {
    chart?.updateTree({ tree_position: 'fit' })
  }

  onMount(() => {
    chart = createChart(container, toChartData(people))
      .setTransitionTime(700)
      .setCardXSpacing(present ? 400 : 250)
      .setCardYSpacing(present ? 210 : 130)
      .setSingleParentEmptyCard(false)
      .setShowSiblingsOfMain(true)
      .setAncestryDepth(ancestryDepth)
      .setProgenyDepth(progenyDepth)
    chart.setCardHtml()
      .setStyle('rect')
      .setCardInnerHtmlCreator(cardHtml as never)
      .setOnCardClick((_e: MouseEvent, d: { data: { id: string } }) => onSelect(d.data.id))
    chart.updateMainId(mainId)
    // Auf schmalen Bildschirmen wäre der eingepasste Baum winzig – dort die Hauptperson mittig zeigen
    if (present) chart.updateTree({ initial: false, tree_position: 'fit', transition_time: 0 })
    else if (container.clientWidth < 700) chart.updateTree({ initial: false, tree_position: 'main_to_middle', transition_time: 0 })
    else chart.updateTree({ initial: true })
    shownMain = mainId
    return () => container.replaceChildren()
  })

  // Fokuswechsel und Tiefe von außen (Klick, Suche, URL)
  $effect(() => {
    const id = mainId
    const up = ancestryDepth
    const down = progenyDepth
    if (!chart) return
    chart.setAncestryDepth(up).setProgenyDepth(down)
    const changed = id !== shownMain
    if (changed) chart.updateMainId(id)
    // Präsentation: immer passend einrahmen; sonst Hauptperson mittig, Zoom bei Tiefenänderung behalten
    chart.updateTree({ initial: false, tree_position: present ? 'fit' : changed ? 'main_to_middle' : 'inherit' })
    shownMain = id
  })
</script>

<div class="f3 tree" class:present bind:this={container}></div>

<style>
  .tree {
    width: 100%;
    height: 100%;
    background: var(--bg);
    --background-color: var(--bg);
    --text-color: var(--text);
    --male-color: var(--male);
    --female-color: var(--female);
    --genderless-color: var(--unknown);
    touch-action: none;
  }
  .tree :global(.link) { stroke: var(--link); stroke-width: 1.5px; }
  .tree :global(.sb-card) {
    display: flex;
    align-items: center;
    gap: 10px;
    width: 220px;
    min-height: 72px;
    padding: 8px 12px 8px 8px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--unknown);
    color: var(--text);
    text-align: left;
  }
  .tree :global(.card-male .sb-card) { background: var(--male); }
  .tree :global(.card-female .sb-card) { background: var(--female); }
  .tree :global(.card-main .sb-card) { outline: 3px solid var(--accent); outline-offset: 2px; }
  .tree :global(.sb-anon) { opacity: 0.75; font-style: italic; }
  .tree :global(.sb-avatar) {
    flex: none;
    width: 52px;
    height: 52px;
    border-radius: 50%;
    overflow: hidden;
    display: grid;
    place-items: center;
    background: var(--surface);
    color: var(--muted);
    font-weight: 600;
    font-size: 18px;
  }
  .tree :global(.sb-avatar img) { width: 100%; height: 100%; object-fit: cover; }
  .tree :global(.sb-text) { min-width: 0; }
  .tree :global(.sb-name) { font-weight: 600; font-size: 15px; line-height: 1.25; overflow-wrap: anywhere; }
  .tree :global(.sb-dates) { font-size: 13px; color: var(--muted); margin-top: 2px; }

  /* Präsentation: helle Karten auf Schwarz, große Schrift */
  .present {
    --bg: #000;
    --link: #8a8a8a;
    background: #000;
  }
  .present :global(.link) { stroke-width: 3px; }
  .present :global(.sb-card) {
    width: 350px;
    min-height: 116px;
    gap: 16px;
    padding: 12px 18px 12px 12px;
    border: 0;
    border-left: 10px solid #9e9e9e;
    border-radius: 14px;
    background: #fff;
    color: #000;
  }
  .present :global(.card-male .sb-card) { background: #fff; border-left-color: #3d8fd1; }
  .present :global(.card-female .sb-card) { background: #fff; border-left-color: #d14d72; }
  .present :global(.card-main .sb-card) { outline: 6px solid #ffd400; outline-offset: 4px; }
  .present :global(.sb-anon) { opacity: 1; background: #d9d9d9 !important; }
  .present :global(.sb-avatar) { width: 88px; height: 88px; font-size: 30px; background: #e6e6e6; color: #333; }
  .present :global(.sb-name) { font-size: 25px; line-height: 1.15; }
  .present :global(.sb-dates) { font-size: 21px; color: #333; margin-top: 4px; }
</style>
