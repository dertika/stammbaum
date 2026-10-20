<script lang="ts">
  import { onMount } from 'svelte'
  import type { TreeResponse } from '../../shared/types.ts'
  import { ApiError, fetchTree } from './lib/api.ts'
  import PersonPanel from './lib/PersonPanel.svelte'
  import PersonSearch from './lib/PersonSearch.svelte'
  import TreeView from './lib/TreeView.svelte'

  let tree = $state<TreeResponse | null>(null)
  let error = $state<{ status: number, message: string } | null>(null)
  let mainId = $state('')
  let ancestryDepth = $state(2)
  let progenyDepth = $state(2)
  let view: TreeView | undefined = $state()
  let panelOpen = $state(false)
  const linkHint = new URLSearchParams(location.search).get('link')

  const byId = $derived(new Map(tree?.people.map(p => [p.id, p]) ?? []))
  const known = $derived(new Set(byId.keys()))

  function idFromHash(): string | undefined {
    return location.hash.match(/^#\/p\/([^/?]+)/)?.[1]
  }

  function select(id: string, openPanel = true) {
    if (!known.has(id)) return
    mainId = id
    if (openPanel) panelOpen = true
    if (idFromHash() !== id) history.pushState(null, '', `#/p/${id}`)
  }

  onMount(() => {
    const onHash = () => {
      const id = idFromHash()
      if (id && known.has(id)) mainId = id
    }
    window.addEventListener('popstate', onHash)

    fetchTree()
      .then(t => {
        tree = t
        const fromHash = idFromHash()
        mainId = fromHash && t.people.some(p => p.id === fromHash) ? fromHash : t.rootId ?? t.people[0]?.id ?? ''
      })
      .catch(e => {
        error = e instanceof ApiError ? { status: e.status, message: e.message } : { status: 0, message: String(e) }
      })
      .finally(() => {
        // Hinweis aus /s/<token> nur einmal auswerten
        if (location.search) history.replaceState(null, '', location.pathname + location.hash)
      })

    return () => window.removeEventListener('popstate', onHash)
  })

  const clamp = (n: number) => Math.max(1, Math.min(8, n))
</script>

{#if tree && mainId}
  <div class="layout">
    <header>
      <h1>Stammbaum</h1>
      <PersonSearch people={tree.people} onSelect={select} />
      <div class="controls" role="group" aria-label="Generationen">
        <div class="stepper" title="Generationen Vorfahren">
          <span class="long">Vorfahren</span><span class="short" aria-hidden="true">↑</span>
          <button type="button" aria-label="Weniger Vorfahren" onclick={() => (ancestryDepth = clamp(ancestryDepth - 1))}>−</button>
          <output>{ancestryDepth}</output>
          <button type="button" aria-label="Mehr Vorfahren" onclick={() => (ancestryDepth = clamp(ancestryDepth + 1))}>+</button>
        </div>
        <div class="stepper" title="Generationen Nachkommen">
          <span class="long">Nachkommen</span><span class="short" aria-hidden="true">↓</span>
          <button type="button" aria-label="Weniger Nachkommen" onclick={() => (progenyDepth = clamp(progenyDepth - 1))}>−</button>
          <output>{progenyDepth}</output>
          <button type="button" aria-label="Mehr Nachkommen" onclick={() => (progenyDepth = clamp(progenyDepth + 1))}>+</button>
        </div>
        <button type="button" class="plain" aria-label="Ganzen Ausschnitt einpassen" onclick={() => view?.fit()}><span aria-hidden="true">⤢</span><span class="long">Einpassen</span></button>
        {#if tree.rootId && tree.rootId !== mainId}
          <button type="button" class="plain" aria-label="Zur Startperson" onclick={() => select(tree!.rootId!, false)}><span aria-hidden="true">⌂</span><span class="long">Zum Anfang</span></button>
        {/if}
      </div>
    </header>
    <main>
      <TreeView bind:this={view} people={tree.people} {mainId} {ancestryDepth} {progenyDepth} onSelect={select} />
      {#if panelOpen}
        <PersonPanel id={mainId} people={byId} onSelect={select} onClose={() => (panelOpen = false)} />
      {/if}
    </main>
  </div>
{:else if error}
  <div class="message">
    {#if (error.status === 401 || error.status === 403) && linkHint === 'ungueltig'}
      <h1>Link ungültig</h1>
      <p>Dieser Einladungslink ist nicht bekannt. Bitte prüf, ob er vollständig kopiert wurde.</p>
    {:else if error.status === 401 || error.status === 403}
      <h1>Kein Zugang</h1>
      <p>Der Stammbaum ist nur über einen persönlichen Einladungslink erreichbar.</p>
    {:else if error.status === 410 || linkHint === 'abgelaufen'}
      <h1>Link abgelaufen</h1>
      <p>Dieser Einladungslink ist nicht mehr gültig. Bitte frag nach einem neuen Link.</p>
    {:else}
      <h1>Der Stammbaum konnte nicht geladen werden</h1>
      <p>Bitte versuch es später noch einmal.</p>
    {/if}
  </div>
{:else}
  <div class="message" aria-busy="true"><p>Stammbaum wird geladen …</p></div>
{/if}

<style>
  .layout { display: flex; flex-direction: column; height: 100%; }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    padding: 8px 16px;
    padding-top: max(8px, env(safe-area-inset-top));
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    z-index: 10;
  }
  h1 { font-size: 18px; margin: 0; color: var(--accent); }
  .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .stepper {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 14px;
    color: var(--muted);
  }
  .stepper span { margin-right: 2px; }
  .stepper .short { display: none; }
  .stepper output { min-width: 1.2em; text-align: center; color: var(--text); font-variant-numeric: tabular-nums; }
  button {
    border: 1px solid var(--border);
    background: var(--bg);
    border-radius: 8px;
    min-width: 32px;
    height: 32px;
    cursor: pointer;
  }
  button.plain { padding: 0 12px; display: inline-flex; align-items: center; gap: 6px; }
  button:hover { border-color: var(--accent); }
  main { flex: 1; min-height: 0; position: relative; overflow: hidden; }
  .message { display: grid; place-content: center; height: 100%; padding: 24px; text-align: center; }
  .message h1 { font-size: 24px; margin-bottom: 8px; }
  .message p { color: var(--muted); max-width: 32em; }

  @media (max-width: 640px) {
    header { padding: 8px 12px; }
    h1 { display: none; }
    .long { display: none; }
    .stepper .short { display: inline; }
    .controls { width: 100%; flex-wrap: nowrap; gap: 6px; }
    .stepper + .stepper { margin-left: 4px; }
    button.plain { padding: 0 10px; margin-left: auto; }
    button.plain + button.plain { margin-left: 0; }
    :global(.search) { flex-basis: 100%; max-width: none; }
  }
</style>
