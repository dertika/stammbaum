<script lang="ts">
  import type { PersonSummary } from '../../../shared/types.ts'
  import { fullName, initials, lifespan, normalize, yearOf } from './format.ts'

  interface Props {
    people: PersonSummary[]
    onOpen: (id: string) => void
  }

  let { people, onOpen }: Props = $props()

  type Sort = 'surname' | 'firstname' | 'born' | 'bornDesc'
  const SORTS: { value: Sort, label: string }[] = [
    { value: 'surname', label: 'Nachname' },
    { value: 'firstname', label: 'Vorname' },
    { value: 'born', label: 'Geburtsjahr (älteste zuerst)' },
    { value: 'bornDesc', label: 'Geburtsjahr (jüngste zuerst)' },
  ]

  let query = $state('')
  let sort = $state<Sort>('surname')

  const collator = new Intl.Collator('de', { sensitivity: 'base' })
  const visible = $derived(people.filter(p => !p.anonymized))
  const hidden = $derived(people.length - visible.length)

  const entries = $derived(visible.map(p => ({
    person: p,
    born: yearOf(p.birth?.date),
    key: normalize(`${p.firstName} ${p.lastName} ${p.birth?.place ?? ''} ${p.death?.place ?? ''}`),
  })))

  const filtered = $derived.by(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean)
    const list = words.length ? entries.filter(e => words.every(w => e.key.includes(w))) : [...entries]
    const byName = (a: PersonSummary, b: PersonSummary) =>
      collator.compare(a.lastName, b.lastName) || collator.compare(a.firstName, b.firstName)
    const byYear = (a: number | undefined, b: number | undefined, dir: 1 | -1) =>
      // ohne Geburtsjahr ans Ende
      a === undefined ? (b === undefined ? 0 : 1) : b === undefined ? -1 : (a - b) * dir
    switch (sort) {
      case 'firstname': return list.sort((a, b) => collator.compare(a.person.firstName, b.person.firstName) || byName(a.person, b.person))
      case 'born': return list.sort((a, b) => byYear(a.born, b.born, 1) || byName(a.person, b.person))
      case 'bornDesc': return list.sort((a, b) => byYear(a.born, b.born, -1) || byName(a.person, b.person))
      default: return list.sort((a, b) => byName(a.person, b.person))
    }
  })

  /** Überschriften: Nachname, Anfangsbuchstabe des Vornamens oder Jahrhundert */
  const groups = $derived.by(() => {
    const label = (e: (typeof filtered)[number]) => {
      if (sort === 'surname') return e.person.lastName || 'Ohne Nachnamen'
      if (sort === 'firstname') return (e.person.firstName[0] ?? '?').toUpperCase()
      return e.born === undefined ? 'Geburtsjahr unbekannt' : `${Math.floor(e.born / 100) * 100}–${Math.floor(e.born / 100) * 100 + 99}`
    }
    const out: { label: string, items: typeof filtered }[] = []
    for (const e of filtered) {
      const l = label(e)
      if (out.at(-1)?.label === l) out.at(-1)!.items.push(e)
      else out.push({ label: l, items: [e] })
    }
    return out
  })
</script>

<div class="list-view">
  <div class="toolbar">
    <input type="search" bind:value={query} placeholder="Name oder Ort filtern …" aria-label="Personen filtern" autocomplete="off" />
    <label>
      <span>Sortieren</span>
      <select bind:value={sort}>
        {#each SORTS as s (s.value)}<option value={s.value}>{s.label}</option>{/each}
      </select>
    </label>
    <p class="count" aria-live="polite">
      {filtered.length} {filtered.length === 1 ? 'Person' : 'Personen'}{#if hidden} · {hidden} lebende nicht aufgeführt{/if}
    </p>
  </div>

  {#each groups as g (g.label)}
    <section>
      <h2>{g.label} <small>{g.items.length}</small></h2>
      <ul>
        {#each g.items as { person: p } (p.id)}
          <li>
            <button type="button" class="card card-{p.gender}" onclick={() => onOpen(p.id)}>
              <span class="avatar">
                {#if p.photo}<img src={p.photo} alt="" loading="lazy" />{:else}{initials(p)}{/if}
              </span>
              <span class="text">
                <strong>{fullName(p)}</strong>
                {#if lifespan(p)}<span class="dates">{lifespan(p)}</span>{/if}
                {#if p.birth?.place}<span class="place">{p.birth.place}</span>{/if}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    </section>
  {:else}
    <p class="empty">Keine Personen gefunden.</p>
  {/each}
</div>

<style>
  .list-view { height: 100%; overflow-y: auto; padding: 0 16px 32px; }
  .toolbar {
    position: sticky;
    top: 0;
    z-index: 2;
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    margin: 0 -16px;
    padding: 12px 16px;
    background: var(--bg);
    border-bottom: 1px solid var(--border);
  }
  input, select {
    padding: 8px 12px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  input { flex: 1; min-width: 200px; max-width: 360px; }
  label { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--muted); }
  .count { margin: 0 0 0 auto; font-size: 14px; color: var(--muted); }
  section { content-visibility: auto; contain-intrinsic-size: auto 300px; }
  h2 { margin: 20px 0 8px; font-size: 15px; color: var(--accent); }
  h2 small { color: var(--muted); font-weight: normal; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 8px; }
  .card {
    display: flex;
    align-items: center;
    gap: 12px;
    width: 100%;
    padding: 8px 12px 8px 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--unknown);
    text-align: left;
    cursor: pointer;
  }
  .card-M { background: var(--male); }
  .card-F { background: var(--female); }
  .card:hover { outline: 2px solid var(--accent); }
  .avatar {
    flex: none;
    width: 48px;
    height: 48px;
    border-radius: 50%;
    overflow: hidden;
    display: grid;
    place-items: center;
    background: var(--surface);
    color: var(--muted);
    font-weight: 600;
  }
  .avatar img { width: 100%; height: 100%; object-fit: cover; }
  .text { display: grid; gap: 1px; min-width: 0; }
  strong { overflow-wrap: anywhere; }
  .dates { font-size: 13px; color: var(--muted); }
  .place { font-size: 12px; color: var(--muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .empty { padding: 24px 0; color: var(--muted); }
  @media (max-width: 640px) {
    .count { margin-left: 0; width: 100%; }
    input { flex-basis: 100%; min-width: 0; max-width: none; }
  }
</style>
