<script lang="ts">
  import type { PersonSummary } from '../../../shared/types.ts'
  import { fullName, lifespan } from './format.ts'

  interface Props {
    people: PersonSummary[]
    onSelect: (id: string) => void
  }

  let { people, onSelect }: Props = $props()

  let query = $state('')
  let open = $state(false)
  let active = $state(0)

  const normalize = (s: string) => s.toLocaleLowerCase('de').normalize('NFD').replace(/\p{Diacritic}/gu, '')

  const index = $derived(people
    .filter(p => !p.anonymized)
    .map(p => ({ person: p, key: normalize(`${p.firstName} ${p.lastName} ${p.lastName} ${p.firstName}`) })))

  const results = $derived.by(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean)
    if (!words.length) return []
    return index.filter(e => words.every(w => e.key.includes(w))).slice(0, 12).map(e => e.person)
  })

  function choose(p: PersonSummary) {
    onSelect(p.id)
    query = ''
    open = false
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'ArrowDown') { active = Math.min(active + 1, results.length - 1); e.preventDefault() }
    else if (e.key === 'ArrowUp') { active = Math.max(active - 1, 0); e.preventDefault() }
    else if (e.key === 'Enter' && results[active]) choose(results[active])
    else if (e.key === 'Escape') { open = false; (e.target as HTMLInputElement).blur() }
  }
</script>

<div class="search">
  <input
    type="search"
    placeholder="Person suchen …"
    aria-label="Person suchen"
    autocomplete="off"
    bind:value={query}
    oninput={() => { open = true; active = 0 }}
    onfocus={() => (open = true)}
    onblur={() => setTimeout(() => (open = false), 150)}
    onkeydown={onKeydown}
  />
  {#if open && results.length}
    <ul role="listbox">
      {#each results as p, i (p.id)}
        <li role="option" aria-selected={i === active}>
          <button type="button" class:active={i === active} onmousedown={() => choose(p)}>
            <span>{fullName(p)}</span>
            <small>{lifespan(p)}</small>
          </button>
        </li>
      {/each}
    </ul>
  {:else if open && query.trim()}
    <ul><li class="empty">Keine Treffer</li></ul>
  {/if}
</div>

<style>
  .search { position: relative; flex: 1; min-width: 0; max-width: 360px; }
  input {
    width: 100%;
    padding: 8px 12px;
    border-radius: var(--radius);
    border: 1px solid var(--border);
    background: var(--bg);
  }
  ul {
    position: absolute;
    top: calc(100% + 4px);
    left: 0;
    right: 0;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.2);
    max-height: 60vh;
    overflow: auto;
    z-index: 20;
  }
  button {
    display: flex;
    width: 100%;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border: 0;
    border-radius: 6px;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  button.active, button:hover { background: var(--bg); }
  small { color: var(--muted); white-space: nowrap; }
  .empty { padding: 8px 10px; color: var(--muted); }
</style>
