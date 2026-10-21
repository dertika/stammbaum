<script lang="ts">
  import { onMount } from 'svelte'
  import { DEPTH_MAX, DEPTH_MIN, type AdminPerson, type DisplaySettings } from '../../../shared/types.ts'
  import { admin } from './api.ts'
  import PersonPicker from './PersonPicker.svelte'

  const OPTIONS: { key: keyof DisplaySettings['details'], label: string, hint: string }[] = [
    { key: 'photo', label: 'Fotos', hint: 'Profilbilder im Baum und Bildergalerie in den Details' },
    { key: 'dates', label: 'Lebensdaten', hint: 'Geburts-, Sterbe- und Ereignisdaten' },
    { key: 'events', label: 'Ereignisse', hint: 'Lebenslauf mit Taufe, Hochzeit, Beruf, Umzügen …' },
    { key: 'places', label: 'Orte', hint: 'Orte von Geburt, Tod und Ereignissen' },
    { key: 'notes', label: 'Notizen', hint: 'Notizen zu Personen aus Gramps' },
  ]
  const DEPTHS = Array.from({ length: DEPTH_MAX - DEPTH_MIN + 1 }, (_, i) => DEPTH_MIN + i)

  let settings = $state<DisplaySettings | null>(null)
  let people = $state<AdminPerson[]>([])
  let message = $state('')
  let error = $state('')
  let lastStart: string | null | undefined

  onMount(() => {
    Promise.all([admin.settings(), admin.people()])
      .then(([s, p]) => {
        settings = s
        people = p
      })
      .catch(e => (error = e.message))
  })

  async function save() {
    if (!settings) return
    try {
      settings = await admin.saveSettings(settings)
      message = 'Gespeichert – gilt sofort für alle Links.'
      error = ''
      setTimeout(() => (message = ''), 3000)
    } catch (e) {
      error = (e as Error).message
    }
  }

  // Startperson wird über den Picker gesetzt – danach automatisch speichern
  $effect(() => {
    if (!settings) return
    const start = settings.startPersonId ?? null
    if (lastStart === undefined) lastStart = start
    if (start === lastStart) return
    lastStart = start
    save()
  })
</script>

<h1>Anzeige</h1>

{#if error}<p class="notice error" role="alert">{error}</p>{/if}

{#if settings}
  <section>
    <h2>Startansicht</h2>
    <p class="muted">Womit der Baum beim ersten Öffnen beginnt. Einzelne Links können eine eigene Startperson haben.</p>
    <div class="admin-card start">
      <PersonPicker {people} label="Startperson" bind:value={settings.startPersonId} emptyText="Hauptperson aus Gramps" />
      <p class="muted small">Ist die Startperson für einen Link als lebend anonymisiert, beginnt die Ansicht beim nächsten sichtbaren Vorfahren.</p>
      <div class="depths">
        <label class="field">
          <span>Generationen Vorfahren</span>
          <select bind:value={settings.ancestryDepth} onchange={save}>
            {#each DEPTHS as n (n)}<option value={n}>{n}</option>{/each}
          </select>
        </label>
        <label class="field">
          <span>Generationen Nachkommen</span>
          <select bind:value={settings.progenyDepth} onchange={save}>
            {#each DEPTHS as n (n)}<option value={n}>{n}</option>{/each}
          </select>
        </label>
      </div>
      <p class="muted small">Besucher können die Tiefe selbst mit +/− ändern; ihr Browser merkt sich das.</p>
    </div>
  </section>

  <section>
    <h2>Personendetails</h2>
    <p class="muted">Welche Angaben die Familie beim Klick auf eine Person sieht. Ausgeschaltete Angaben werden gar nicht erst an den Browser geschickt.</p>
    <div class="admin-card options">
      {#each OPTIONS as o (o.key)}
        <label>
          <input type="checkbox" bind:checked={settings.details[o.key]} onchange={save} />
          <span><strong>{o.label}</strong><small>{o.hint}</small></span>
        </label>
      {/each}
    </div>
    <p class="muted small">Lebende Personen werden zusätzlich je nach Link anonymisiert. Als privat markierte Personen, Ereignisse, Notizen und Bilder aus Gramps werden nie angezeigt.</p>
  </section>
  <p class="status" class:show={!!message} aria-live="polite">{message}</p>
{/if}

<style>
  h1 { margin: 0 0 16px; font-size: 24px; }
  h2 { margin: 0 0 4px; font-size: 18px; }
  section { margin-bottom: 28px; }
  .muted { color: var(--muted); margin: 0 0 12px; max-width: 40em; }
  .small { font-size: 13px; margin: 0; }
  .start { display: grid; gap: 14px; max-width: 560px; }
  .depths { display: flex; gap: 16px; flex-wrap: wrap; }
  .options { display: grid; gap: 4px; max-width: 560px; margin-bottom: 12px; }
  .options label { display: flex; gap: 12px; align-items: flex-start; padding: 10px 4px; cursor: pointer; }
  .options input { width: 20px; height: 20px; margin-top: 2px; accent-color: var(--accent); }
  .options span { display: grid; gap: 2px; }
  .options small { color: var(--muted); }
  .status {
    position: fixed;
    right: 16px;
    bottom: 16px;
    margin: 0;
    padding: 10px 14px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
    color: var(--accent);
    box-shadow: 0 6px 20px rgb(0 0 0 / 0.15);
    opacity: 0;
    transition: opacity 0.2s;
    pointer-events: none;
  }
  .status.show { opacity: 1; }
</style>
