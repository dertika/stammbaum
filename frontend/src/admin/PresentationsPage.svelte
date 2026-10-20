<script lang="ts">
  import { onMount } from 'svelte'
  import type { AdminPerson, Presentation, Station } from '../../../shared/types.ts'
  import { admin } from './api.ts'

  let list = $state<Presentation[]>([])
  let people = $state<AdminPerson[]>([])
  let error = $state('')
  let message = $state('')

  // Bearbeitung
  let editing = $state<{ id: string | null, title: string, stations: Station[] } | null>(null)
  let query = $state('')

  const byId = $derived(new Map(people.map(p => [p.id, p])))
  const normalize = (s: string) => s.toLocaleLowerCase('de').normalize('NFD').replace(/\p{Diacritic}/gu, '')
  const matches = $derived.by(() => {
    const words = normalize(query).split(/\s+/).filter(Boolean)
    if (!words.length) return []
    return people.filter(p => words.every(w => normalize(p.name).includes(w))).slice(0, 8)
  })

  async function load() {
    try {
      ;[list, people] = await Promise.all([admin.presentations(), admin.people()])
    } catch (e) {
      error = (e as Error).message
    }
  }

  function edit(p?: Presentation) {
    editing = p
      ? { id: p.id, title: p.title, stations: p.stations.map(s => ({ ...s })) }
      : { id: null, title: '', stations: [] }
    query = ''
  }

  function add(person: AdminPerson) {
    editing!.stations.push({ personId: person.id, title: '', text: '', ancestry: 1, progeny: 1 })
    query = ''
  }

  function moveStation(i: number, step: -1 | 1) {
    const s = editing!.stations
    const j = i + step
    if (j < 0 || j >= s.length) return
    ;[s[i], s[j]] = [s[j], s[i]]
  }

  async function save(e: SubmitEvent) {
    e.preventDefault()
    if (!editing) return
    try {
      const body = { title: editing.title, stations: editing.stations }
      if (editing.id) await admin.updatePresentation(editing.id, body)
      else await admin.createPresentation(body)
      editing = null
      message = 'Gespeichert.'
      setTimeout(() => (message = ''), 3000)
      error = ''
      await load()
    } catch (err) {
      error = (err as Error).message
    }
  }

  async function remove(p: Presentation) {
    if (!confirm(`Präsentation „${p.title}“ löschen?`)) return
    await admin.deletePresentation(p.id).catch(e => (error = e.message))
    await load()
  }

  onMount(load)
</script>

<div class="head">
  <div>
    <h1>Präsentationen</h1>
    <p class="muted">Feste Abfolgen von Personen – wie Folien, für Beamer und Fernseher.</p>
  </div>
  {#if !editing}<button type="button" class="btn primary" onclick={() => edit()}>+ Neue Präsentation</button>{/if}
</div>

{#if error}<p class="notice error" role="alert">{error}</p>{/if}
{#if message}<p class="notice" aria-live="polite">{message}</p>{/if}

{#if editing}
  <form class="admin-card editor" onsubmit={save}>
    <label class="field">
      <span>Titel</span>
      <input bind:value={editing.title} required maxlength="120" placeholder="Familienfest 2026" />
    </label>

    <ol class="stations">
      {#each editing.stations as s, i (i)}
        {@const p = byId.get(s.personId)}
        <li>
          <div class="station-head">
            <span class="num">{i + 1}</span>
            <strong>{p?.name ?? 'Unbekannte Person'}</strong>
            <small>{p?.lifespan ?? ''}{p?.private ? ' · privat – wird nicht gezeigt' : ''}</small>
            <span class="tools">
              <button type="button" class="btn" onclick={() => moveStation(i, -1)} disabled={i === 0} aria-label="Nach oben">↑</button>
              <button type="button" class="btn" onclick={() => moveStation(i, 1)} disabled={i === editing!.stations.length - 1} aria-label="Nach unten">↓</button>
              <button type="button" class="btn danger" onclick={() => editing!.stations.splice(i, 1)} aria-label="Entfernen">✕</button>
            </span>
          </div>
          <div class="station-body">
            <label class="field"><span>Überschrift (leer = Name)</span><input bind:value={s.title} maxlength="160" /></label>
            <label class="field wide"><span>Text</span><textarea bind:value={s.text} rows="2" maxlength="2000"></textarea></label>
            <label class="field"><span>Generationen Vorfahren</span>
              <select bind:value={s.ancestry}>{#each [0, 1, 2, 3, 4, 5] as n (n)}<option value={n}>{n}</option>{/each}</select>
            </label>
            <label class="field"><span>Generationen Nachkommen</span>
              <select bind:value={s.progeny}>{#each [0, 1, 2, 3, 4, 5] as n (n)}<option value={n}>{n}</option>{/each}</select>
            </label>
          </div>
        </li>
      {/each}
    </ol>

    <div class="add">
      <label class="field">
        <span>Station hinzufügen</span>
        <input type="search" bind:value={query} placeholder="Person suchen …" autocomplete="off" />
      </label>
      {#if matches.length}
        <ul class="matches">
          {#each matches as m (m.id)}
            <li><button type="button" onclick={() => add(m)}>{m.name} <small>{m.lifespan}{m.private ? ' · privat' : ''}</small></button></li>
          {/each}
        </ul>
      {/if}
    </div>

    <p class="muted small">Stationen zu lebenden Personen erscheinen nur bei Links, die Lebende zeigen. Texte werden unverändert angezeigt – bitte keine Angaben zu Lebenden hineinschreiben, wenn der Link anonymisiert.</p>

    <div class="row">
      <button type="submit" class="btn primary">Speichern</button>
      <button type="button" class="btn" onclick={() => (editing = null)}>Abbrechen</button>
    </div>
  </form>
{:else}
  {#if !list.length}<p class="admin-card muted">Noch keine Präsentationen.</p>{/if}
  <ul class="list">
    {#each list as p (p.id)}
      <li class="admin-card">
        <div>
          <strong>{p.title}</strong>
          <small class="muted">{p.stations.length} Stationen</small>
        </div>
        <div class="row">
          <a class="btn" href="/#/praesentation/{p.id}/1" target="_blank" rel="noopener">Ansehen</a>
          <button type="button" class="btn" onclick={() => edit(p)}>Bearbeiten</button>
          <button type="button" class="btn danger" onclick={() => remove(p)}>Löschen</button>
        </div>
      </li>
    {/each}
  </ul>
  <p class="muted small">Welche Präsentation über welchen Link erreichbar ist, legst du bei den Freigabelinks fest.</p>
{/if}

<style>
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
  h1 { margin: 0 0 4px; font-size: 24px; }
  .muted { color: var(--muted); margin: 0; }
  .small { font-size: 13px; margin-top: 12px; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; }
  .list { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
  .list li { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
  .list li > div:first-child { display: grid; }
  .editor { display: grid; gap: 16px; }
  .stations { list-style: none; padding: 0; margin: 0; display: grid; gap: 10px; }
  .stations > li { border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px; background: var(--bg); }
  .station-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
  .station-head small { color: var(--muted); }
  .num {
    display: grid;
    place-items: center;
    width: 26px;
    height: 26px;
    border-radius: 50%;
    background: var(--accent);
    color: var(--surface);
    font-size: 13px;
    font-weight: 700;
  }
  .tools { margin-left: auto; display: flex; gap: 4px; }
  .tools .btn { min-height: 30px; padding: 0 10px; }
  .station-body { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 10px; }
  .station-body .wide { grid-column: 1 / -1; }
  .station-body textarea { resize: vertical; font: inherit; }
  .add { position: relative; max-width: 420px; }
  .matches {
    list-style: none;
    margin: 4px 0 0;
    padding: 4px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .matches button { width: 100%; text-align: left; padding: 8px 10px; border: 0; background: none; border-radius: 6px; cursor: pointer; }
  .matches button:hover { background: var(--bg); }
  .matches small { color: var(--muted); }
  @media (max-width: 640px) {
    .station-body { grid-template-columns: 1fr; }
  }
</style>
