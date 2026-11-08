<script lang="ts">
  import type { FullLayout, PersonSummary } from '../../../shared/types.ts'
  import { fetchFocusLayout } from './api.ts'
  import GraphView from './GraphView.svelte'

  interface Props {
    people: PersonSummary[]
    mainId: string
    ancestryDepth: number
    progenyDepth: number
    /** Alle Generationen der Hauptperson */
    expandAll?: boolean
    onSelect: (id: string) => void
    /** Präsentation: kontrastreich, Ausschnitt immer eingepasst */
    variant?: 'normal' | 'present'
  }

  let { people, mainId, ancestryDepth, progenyDepth, expandAll = false, onSelect, variant = 'normal' }: Props = $props()

  let layout = $state<FullLayout | null>(null)
  let failed = $state('')
  let graph: GraphView | undefined = $state()
  let lastExpand = false

  const present = $derived(variant === 'present')
  // Präsentation und „Alle“: einpassen; sonst Hauptperson mittig wie gewohnt
  let nextCamera = $state<'fit' | 'focus'>('focus')

  export function fit() {
    graph?.fitAll()
  }

  export function exportData() {
    return graph?.exportData() ?? null
  }

  // Bei Fokus- oder Tiefenwechsel neu laden; ältere Anfragen verwerfen
  $effect(() => {
    const id = mainId
    const up = expandAll ? Infinity : ancestryDepth
    const down = expandAll ? Infinity : progenyDepth
    const ctrl = new AbortController()
    nextCamera = present || (expandAll && !lastExpand) ? 'fit' : 'focus'
    lastExpand = expandAll
    fetchFocusLayout(id, up, down, ctrl.signal)
      .then(l => {
        layout = l
        failed = ''
      })
      .catch(err => {
        if (err?.name !== 'AbortError') failed = err instanceof Error ? err.message : String(err)
      })
    return () => ctrl.abort()
  })
</script>

<div class="focus-tree">
  <GraphView
    bind:this={graph}
    {layout}
    {people}
    focusId={mainId}
    onOpen={onSelect}
    {variant}
    initialCamera={present ? 'fit' : 'focus'}
    {nextCamera}
    tools={false}
  />
  {#if failed && !layout}
    <p class="overlay">Der Baum konnte nicht geladen werden ({failed}).</p>
  {:else if !layout}
    <p class="overlay" aria-busy="true">Baum wird geladen …</p>
  {/if}
</div>

<style>
  .focus-tree { position: relative; width: 100%; height: 100%; }
  .overlay {
    position: absolute;
    inset: 0;
    display: grid;
    place-items: center;
    margin: 0;
    color: var(--muted);
    pointer-events: none;
  }
</style>
