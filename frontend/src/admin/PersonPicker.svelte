<script lang="ts">
  import type { AdminPerson } from '../../../shared/types.ts'

  interface Props {
    people: AdminPerson[]
    label: string
    /** Auswahl-Modus: gewählte Person (bindable); null = keine */
    value?: string | null
    /** Text, wenn nichts gewählt ist */
    emptyText?: string
    /** Hinzufügen-Modus: wird bei jeder Auswahl aufgerufen, das Feld leert sich danach */
    onPick?: (person: AdminPerson) => void
  }

  let { people, label, value = $bindable(null), emptyText = 'Keine Auswahl', onPick }: Props = $props()

  let query = $state('')
  let searching = $state(false)

  const normalize = (s: string) => s.toLocaleLowerCase('de').normalize('NFD').replace(/\p{Diacritic}/gu, '')
  const selected = $derived(value ? people.find(p => p.id === value) : undefined)
  const matches = $derived.by(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean)
    if (!words.length) return []
    return people.filter(p => words.every(w => normalize(p.name).includes(w))).slice(0, 8)
  })

  function pick(p: AdminPerson) {
    if (onPick) onPick(p)
    else value = p.id
    query = ''
    searching = false
  }
</script>

<div class="picker">
  <span class="label">{label}</span>
  {#if !onPick && !searching}
    <div class="current">
      {#if selected}
        <span><strong>{selected.name}</strong> <small>{selected.lifespan}{selected.private ? ' · privat' : ''}</small></span>
      {:else if value}
        <span class="muted">Person nicht mehr vorhanden</span>
      {:else}
        <span class="muted">{emptyText}</span>
      {/if}
      <button type="button" class="btn" onclick={() => (searching = true)}>Ändern</button>
      {#if value}<button type="button" class="btn" onclick={() => (value = null)}>Zurücksetzen</button>{/if}
    </div>
  {:else}
    <div class="current">
      <!-- svelte-ignore a11y_autofocus -->
      <input type="search" bind:value={query} placeholder="Person suchen …" autocomplete="off" aria-label={label} autofocus={!onPick} />
      {#if !onPick}<button type="button" class="btn" onclick={() => { searching = false; query = '' }}>Abbrechen</button>{/if}
    </div>
    {#if matches.length}
      <ul class="matches">
        {#each matches as m (m.id)}
          <li><button type="button" onclick={() => pick(m)}>{m.name} <small>{m.lifespan}{m.private ? ' · privat' : ''}</small></button></li>
        {/each}
      </ul>
    {:else if query.trim()}
      <p class="muted">Keine Treffer</p>
    {/if}
  {/if}
</div>

<style>
  .picker { display: grid; gap: 6px; max-width: 480px; }
  .label { font-size: 13px; color: var(--muted); }
  .current { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .current > span { flex: 1; min-width: 0; }
  input {
    flex: 1;
    min-width: 0;
    padding: 8px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
  }
  small, .muted { color: var(--muted); }
  p { margin: 0; }
  .matches {
    list-style: none;
    margin: 0;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .matches button { width: 100%; text-align: left; padding: 8px 10px; border: 0; background: none; border-radius: 6px; cursor: pointer; }
  .matches button:hover { background: var(--bg); }
</style>
