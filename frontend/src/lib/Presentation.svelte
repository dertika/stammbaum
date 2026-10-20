<script lang="ts">
  import { onMount } from 'svelte'
  import type { PersonSummary, Presentation } from '../../../shared/types.ts'
  import { fullName, lifespan } from './format.ts'
  import { TreeNavigator } from './navigation.ts'
  import TreeView from './TreeView.svelte'

  interface Props {
    people: PersonSummary[]
    byId: Map<string, PersonSummary>
    /** null = freie Navigation */
    presentation: Presentation | null
    startId: string
    startIndex: number
    onPosition: (personId: string, index: number) => void
    onExit: () => void
  }

  let { people, byId, presentation, startId, startIndex, onPosition, onExit }: Props = $props()

  // Startwerte bewusst nur einmal übernehmen
  // svelte-ignore state_referenced_locally
  let index = $state(Math.min(Math.max(startIndex, 0), Math.max((presentation?.stations.length ?? 1) - 1, 0)))
  // svelte-ignore state_referenced_locally
  let freeId = $state(startId)
  let blackout = $state(false)
  let help = $state(true)
  let idle = $state(false)
  let root: HTMLDivElement

  const nav = $derived(new TreeNavigator(byId))
  const station = $derived(presentation?.stations[index])
  const mainId = $derived(station?.personId ?? freeId)
  const person = $derived(byId.get(mainId))
  const ancestry = $derived(station?.ancestry ?? 1)
  const progeny = $derived(station?.progeny ?? 1)

  $effect(() => onPosition(mainId, index))

  function go(step: number) {
    if (!presentation) return
    index = Math.min(Math.max(index + step, 0), presentation.stations.length - 1)
  }

  function move(target: string | undefined) {
    if (target && byId.has(target)) freeId = target
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    else root.requestFullscreen?.().catch(() => {})
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.altKey || e.ctrlKey || e.metaKey) return
    help = false
    const key = e.key
    let handled = true
    if (key === 'b' || key === 'B' || key === '.') blackout = !blackout
    else if (key === 'f' || key === 'F' || key === 'F5') toggleFullscreen()
    else if (key === 'Escape') {
      // Erstes Esc beendet (wie im Browser üblich) das Vollbild, das zweite die Präsentation
      if (blackout) blackout = false
      else if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
      else onExit()
    } else if (key === '?' || key === 'h' || key === 'H') help = !help
    else if (blackout) handled = false
    else if (presentation) {
      // Presenter-Fernbedienungen senden meist PageUp/PageDown, manche Pfeiltasten
      if (['ArrowRight', 'ArrowDown', 'PageDown', ' ', 'Enter', 'n', 'N'].includes(key)) go(1)
      else if (['ArrowLeft', 'ArrowUp', 'PageUp', 'Backspace', 'p', 'P'].includes(key)) go(-1)
      else if (key === 'Home') index = 0
      else if (key === 'End') index = presentation.stations.length - 1
      else handled = false
    } else {
      if (key === 'ArrowUp') move(nav.up(freeId))
      else if (key === 'ArrowDown') move(nav.down(freeId))
      else if (key === 'ArrowLeft' || key === 'PageUp') move(nav.side(freeId, -1))
      else if (key === 'ArrowRight' || key === 'PageDown') move(nav.side(freeId, 1))
      else handled = false
    }
    if (handled) e.preventDefault()
  }

  // Mauszeiger ausblenden, wenn er eine Weile still steht
  let idleTimer: ReturnType<typeof setTimeout>
  function wake() {
    idle = false
    clearTimeout(idleTimer)
    idleTimer = setTimeout(() => (idle = true), 2500)
  }

  onMount(() => {
    root.requestFullscreen?.().catch(() => {})
    const hideHelp = setTimeout(() => (help = false), 6000)
    wake()
    return () => {
      clearTimeout(hideHelp)
      clearTimeout(idleTimer)
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {})
    }
  })
</script>

<svelte:window onkeydown={onKeydown} />

<div class="presentation" class:idle bind:this={root} onmousemove={wake} role="application" aria-label="Präsentation">
  <!-- Bühne endet über der Beschriftung, damit diese keine Karten verdeckt -->
  <div class="stage" style="bottom: {station?.text ? 30 : 20}vh">
    <TreeView
      {people}
      {mainId}
      ancestryDepth={ancestry}
      progenyDepth={progeny}
      variant="present"
      onSelect={id => { if (!presentation) move(id) }}
    />
  </div>

  {#if person}
    <div class="caption" aria-live="polite">
      <h2>{station?.title || fullName(person)}</h2>
      {#if station?.title && !person.anonymized}<p class="sub">{fullName(person)}{lifespan(person) ? ` · ${lifespan(person)}` : ''}</p>
      {:else if lifespan(person)}<p class="sub">{lifespan(person)}</p>{/if}
      {#if station?.text}<p class="text">{station.text}</p>{/if}
    </div>
  {/if}

  {#if presentation}
    <div class="progress">{presentation.title} · {index + 1} / {presentation.stations.length}</div>
    <div class="bar" style="width: {((index + 1) / presentation.stations.length) * 100}%"></div>
  {/if}

  <div class="controls">
    {#if presentation}
      <button type="button" onclick={() => go(-1)} disabled={index === 0} aria-label="Zurück">‹</button>
      <button type="button" onclick={() => go(1)} disabled={index === presentation.stations.length - 1} aria-label="Weiter">›</button>
    {/if}
    <button type="button" onclick={toggleFullscreen} aria-label="Vollbild">⛶</button>
    <button type="button" onclick={onExit} aria-label="Präsentation beenden">✕</button>
  </div>

  {#if help}
    <div class="help">
      {#if presentation}
        <p><kbd>→</kbd> <kbd>Bild ↓</kbd> <kbd>Leertaste</kbd> weiter · <kbd>←</kbd> <kbd>Bild ↑</kbd> zurück</p>
      {:else}
        <p><kbd>↑</kbd> Eltern · <kbd>↓</kbd> Kinder · <kbd>←</kbd> <kbd>→</kbd> Geschwister und Partner</p>
      {/if}
      <p><kbd>F</kbd> Vollbild · <kbd>B</kbd> Schwarzbild · <kbd>Esc</kbd> beenden · <kbd>?</kbd> Hilfe</p>
    </div>
  {/if}

  {#if blackout}<div class="blackout"></div>{/if}
</div>

<style>
  .presentation {
    position: fixed;
    inset: 0;
    z-index: 100;
    background: #000;
    color: #fff;
    --text: #fff;
  }
  .presentation.idle { cursor: none; }
  .stage { position: absolute; top: 64px; left: 0; right: 0; transition: bottom 0.4s; }
  .caption {
    position: absolute;
    left: 50%;
    bottom: 4vh;
    transform: translateX(-50%);
    width: min(1100px, calc(100% - 48px));
    padding: 18px 28px;
    border-radius: 18px;
    background: rgb(0 0 0 / 0.82);
    border: 2px solid #333;
    text-align: center;
    pointer-events: none;
  }
  h2 { margin: 0; font-size: clamp(28px, 4.2vw, 64px); line-height: 1.1; color: #ffd400; }
  .sub { margin: 8px 0 0; font-size: clamp(20px, 2.4vw, 36px); color: #e6e6e6; }
  .text { margin: 12px 0 0; font-size: clamp(20px, 2.2vw, 34px); line-height: 1.35; white-space: pre-line; }
  .progress {
    position: absolute;
    top: 16px;
    left: 20px;
    font-size: clamp(16px, 1.5vw, 24px);
    color: #bbb;
  }
  .bar { position: absolute; top: 0; left: 0; height: 6px; background: #ffd400; transition: width 0.4s; }
  .controls {
    position: absolute;
    top: 12px;
    right: 12px;
    display: flex;
    gap: 8px;
    transition: opacity 0.3s;
  }
  .idle .controls { opacity: 0; }
  .controls button {
    width: 52px;
    height: 52px;
    border: 2px solid #555;
    border-radius: 12px;
    background: #111;
    color: #fff;
    font-size: 26px;
    cursor: pointer;
  }
  .controls button:disabled { opacity: 0.3; }
  .help {
    position: absolute;
    top: 72px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 5;
    padding: 16px 28px;
    border-radius: 16px;
    background: rgb(20 20 20 / 0.95);
    border: 2px solid #444;
    font-size: clamp(18px, 1.8vw, 28px);
    text-align: center;
    pointer-events: none;
  }
  .help p { margin: 8px 0; }
  kbd {
    display: inline-block;
    min-width: 1.6em;
    padding: 2px 8px;
    border: 2px solid #777;
    border-radius: 6px;
    font-family: inherit;
    font-size: 0.85em;
  }
  .blackout { position: absolute; inset: 0; background: #000; z-index: 10; }
  @media (max-width: 640px) {
    .caption { bottom: 12px; padding: 12px 16px; }
  }
</style>
