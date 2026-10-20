<script lang="ts">
  import type { MediaDetail, PersonDetails, PersonSummary } from '../../../shared/types.ts'
  import { fetchPerson } from './api.ts'
  import { fullName, initials, lifespan } from './format.ts'

  interface Props {
    id: string
    people: Map<string, PersonSummary>
    onSelect: (id: string) => void
    onClose: () => void
  }

  let { id, people, onSelect, onClose }: Props = $props()

  let details = $state<PersonDetails | null>(null)
  let failed = $state(false)
  let lightbox = $state<MediaDetail | null>(null)

  $effect(() => {
    const ctrl = new AbortController()
    failed = false
    fetchPerson(id, ctrl.signal)
      .then(d => (details = d))
      .catch(e => { if (e.name !== 'AbortError') failed = true })
    return () => ctrl.abort()
  })

  // Solange die Details laden, zeigen wir schon die Daten aus dem Baum
  const person = $derived(details?.person.id === id ? details.person : people.get(id))
  const current = $derived(details?.person.id === id ? details : null)

  const relatives = $derived(person ? [
    { label: 'Eltern', ids: person.parents },
    { label: person.spouses.length === 1 ? 'Partner/in' : 'Partner', ids: person.spouses },
    { label: 'Kinder', ids: person.children },
  ].filter(g => g.ids.length) : [])

  function onKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return
    if (lightbox) lightbox = null
    else onClose()
  }
</script>

<svelte:window onkeydown={onKeydown} />

{#if person}
  <aside class="panel" aria-label="Details zu {fullName(person)}">
    <button type="button" class="close" aria-label="Schließen" onclick={onClose}>×</button>
    <div class="head">
      <div class="avatar">
        {#if person.photo}<img src={person.photo} alt="" />{:else}<span>{initials(person)}</span>{/if}
      </div>
      <div>
        <h2>{fullName(person)}</h2>
        {#if lifespan(person)}<p class="muted">{lifespan(person)}</p>{/if}
      </div>
    </div>

    {#if person.anonymized}
      <p class="muted">Zu lebenden Personen werden hier keine Angaben gezeigt.</p>
    {:else}
      {#if person.birth || person.death}
        <dl class="facts">
          {#if person.birth}<dt>Geboren</dt><dd>{[person.birth.date, person.birth.place && `in ${person.birth.place}`].filter(Boolean).join(' ')}</dd>{/if}
          {#if person.death}<dt>Gestorben</dt><dd>{[person.death.date, person.death.place && `in ${person.death.place}`].filter(Boolean).join(' ')}</dd>{/if}
        </dl>
      {/if}

      {#if current?.events.length}
        <section>
          <h3>Lebenslauf</h3>
          <ol class="events">
            {#each current.events as e, i (i)}
              <li>
                <span class="when">{e.date ?? ''}</span>
                <span><strong>{e.label}</strong>{#if e.description}: {e.description}{/if}{#if e.place}<br /><span class="muted">{e.place}</span>{/if}</span>
              </li>
            {/each}
          </ol>
        </section>
      {/if}

      {#if current?.notes.length}
        <section>
          <h3>Notizen</h3>
          {#each current.notes as note, i (i)}<p class="note">{note}</p>{/each}
        </section>
      {/if}

      {#if current?.media.length}
        <section>
          <h3>Bilder</h3>
          <div class="gallery">
            {#each current.media as m (m.url)}
              <button type="button" onclick={() => (lightbox = m)} aria-label={m.description ?? 'Bild vergrößern'}>
                <img src={m.thumb} alt={m.description ?? ''} loading="lazy" />
              </button>
            {/each}
          </div>
        </section>
      {/if}
      {#if failed}<p class="muted">Weitere Angaben konnten nicht geladen werden.</p>{/if}
    {/if}

    {#each relatives as group (group.label)}
      <section>
        <h3>{group.label}</h3>
        <ul class="relatives">
          {#each group.ids as rid (rid)}
            {@const r = people.get(rid)}
            {#if r}
              <li><button type="button" onclick={() => onSelect(rid)}>{fullName(r)} <small>{lifespan(r)}</small></button></li>
            {/if}
          {/each}
        </ul>
      </section>
    {/each}
  </aside>
{/if}

{#if lightbox}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="lightbox" onclick={() => (lightbox = null)}>
    <figure>
      <img src={lightbox.url} alt={lightbox.description ?? ''} />
      {#if lightbox.description}<figcaption>{lightbox.description}</figcaption>{/if}
    </figure>
  </div>
{/if}

<style>
  .panel {
    position: absolute;
    top: 0;
    right: 0;
    bottom: 0;
    width: min(380px, 100%);
    overflow-y: auto;
    padding: 20px;
    background: var(--surface);
    border-left: 1px solid var(--border);
    box-shadow: -8px 0 24px rgb(0 0 0 / 0.12);
    z-index: 15;
  }
  .close {
    position: absolute;
    top: 10px;
    right: 10px;
    width: 36px;
    height: 36px;
    border: 0;
    border-radius: 50%;
    background: var(--bg);
    font-size: 22px;
    line-height: 1;
    cursor: pointer;
  }
  .head { display: flex; align-items: center; gap: 14px; margin: 4px 40px 12px 0; }
  .avatar {
    flex: none;
    width: 88px;
    height: 88px;
    border-radius: 50%;
    overflow: hidden;
    display: grid;
    place-items: center;
    background: var(--bg);
    color: var(--muted);
    font-size: 28px;
    font-weight: 600;
  }
  .avatar img { width: 100%; height: 100%; object-fit: cover; }
  h2 { margin: 0; font-size: 21px; line-height: 1.25; }
  h3 { margin: 20px 0 8px; font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); }
  p { margin: 4px 0; line-height: 1.5; }
  .muted { color: var(--muted); }
  .facts { display: grid; grid-template-columns: auto 1fr; gap: 6px 12px; margin: 12px 0 0; }
  .facts dt { color: var(--muted); }
  .facts dd { margin: 0; }
  .events { list-style: none; margin: 0; padding: 0; display: grid; gap: 10px; }
  .events li { display: grid; grid-template-columns: 7.5em 1fr; gap: 10px; line-height: 1.4; }
  .when { color: var(--muted); font-variant-numeric: tabular-nums; }
  .note { white-space: pre-line; }
  .gallery { display: grid; grid-template-columns: repeat(3, 1fr); gap: 6px; }
  .gallery button { padding: 0; border: 0; border-radius: 6px; overflow: hidden; aspect-ratio: 1; cursor: zoom-in; background: var(--bg); }
  .gallery img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .relatives { list-style: none; margin: 0; padding: 0; display: grid; gap: 2px; }
  .relatives button {
    width: 100%;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    padding: 8px 10px;
    border: 0;
    border-radius: 8px;
    background: none;
    text-align: left;
    cursor: pointer;
  }
  .relatives button:hover { background: var(--bg); }
  .relatives small { color: var(--muted); white-space: nowrap; }
  .lightbox {
    position: fixed;
    inset: 0;
    z-index: 50;
    display: grid;
    place-items: center;
    padding: 16px;
    background: rgb(0 0 0 / 0.85);
    cursor: zoom-out;
  }
  .lightbox figure { margin: 0; text-align: center; color: #eee; }
  .lightbox img { max-width: 100%; max-height: 85vh; border-radius: 6px; }

  @media (max-width: 640px) {
    .panel {
      top: auto;
      width: 100%;
      max-height: 60%;
      border-left: 0;
      border-top: 1px solid var(--border);
      border-radius: 16px 16px 0 0;
      box-shadow: 0 -8px 24px rgb(0 0 0 / 0.18);
      padding-bottom: max(20px, env(safe-area-inset-bottom));
    }
    .avatar { width: 64px; height: 64px; font-size: 22px; }
  }
</style>
