<script lang="ts">
  import { onMount } from 'svelte'
  import type { FullLayout, PersonSummary } from '../../../shared/types.ts'
  import { fetchLayout } from './api.ts'
  import GraphView from './GraphView.svelte'

  interface Props {
    people: PersonSummary[]
    /** Person, auf die beim Öffnen gezoomt wird */
    focusId: string | null
    onOpen: (id: string) => void
  }

  let { people, focusId, onOpen }: Props = $props()

  let layout = $state<FullLayout | null>(null)
  /** Server rechnet noch (großer Baum, erstes Öffnen nach Datenänderung) */
  let waiting = $state(false)
  let failed = $state('')
  let graph: GraphView | undefined = $state()

  export function focus(id: string) {
    graph?.focus(id)
  }

  export function exportData() {
    return graph?.exportData() ?? null
  }

  onMount(() => {
    // Das Layout rechnet der Server einmal für alle; Namen und Fotos kommen aus dem Baum
    let timer: ReturnType<typeof setTimeout> | undefined
    let cancelled = false
    const load = async () => {
      try {
        const res = await fetchLayout()
        if (cancelled) return
        if ('status' in res) {
          waiting = true
          timer = setTimeout(load, 2000)
          return
        }
        layout = res
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

  // Großer Baum: auf die Hauptperson zoomen, kleiner: ganz einpassen
  const initialCamera = $derived(layout && layout.width > 2500 ? 'focus' : 'fit')
</script>

<div class="full">
  <GraphView
    bind:this={graph}
    {layout}
    {people}
    {focusId}
    {onOpen}
    {initialCamera}
    nextCamera="keep"
    hint={layout ? `${layout.people.length} Personen · Klick auf eine Person öffnet sie im Baum` : undefined}
  />
  {#if failed}
    <p class="overlay">Der Gesamtbaum konnte nicht berechnet werden ({failed}).</p>
  {:else if !layout}
    <p class="overlay" aria-busy="true">{waiting ? 'Der Gesamtbaum wird gerade vorbereitet – bei großen Stammbäumen kann das etwas dauern …' : 'Gesamtbaum wird geladen …'}</p>
  {/if}
</div>

<style>
  .full { position: relative; width: 100%; height: 100%; }
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
