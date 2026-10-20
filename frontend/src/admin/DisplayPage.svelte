<script lang="ts">
  import { onMount } from 'svelte'
  import type { DetailSettings } from '../../../shared/types.ts'
  import { admin } from './api.ts'

  const OPTIONS: { key: keyof DetailSettings, label: string, hint: string }[] = [
    { key: 'photo', label: 'Fotos', hint: 'Profilbilder im Baum und Bildergalerie in den Details' },
    { key: 'dates', label: 'Lebensdaten', hint: 'Geburts-, Sterbe- und Ereignisdaten' },
    { key: 'events', label: 'Ereignisse', hint: 'Lebenslauf mit Taufe, Hochzeit, Beruf, Umzügen …' },
    { key: 'places', label: 'Orte', hint: 'Orte von Geburt, Tod und Ereignissen' },
    { key: 'notes', label: 'Notizen', hint: 'Notizen zu Personen aus Gramps' },
  ]

  let details = $state<DetailSettings | null>(null)
  let message = $state('')
  let error = $state('')

  onMount(() => {
    admin.settings().then(s => (details = s.details)).catch(e => (error = e.message))
  })

  async function save() {
    if (!details) return
    try {
      details = (await admin.saveSettings(details)).details
      message = 'Gespeichert – gilt sofort für alle Links.'
      error = ''
      setTimeout(() => (message = ''), 3000)
    } catch (e) {
      error = (e as Error).message
    }
  }
</script>

<h1>Anzeige</h1>
<p class="muted">Welche Angaben die Familie beim Klick auf eine Person sieht. Ausgeschaltete Angaben werden gar nicht erst an den Browser geschickt.</p>

{#if error}<p class="notice error" role="alert">{error}</p>{/if}

{#if details}
  <div class="admin-card options">
    {#each OPTIONS as o (o.key)}
      <label>
        <input type="checkbox" bind:checked={details[o.key]} onchange={save} />
        <span><strong>{o.label}</strong><small>{o.hint}</small></span>
      </label>
    {/each}
  </div>
  <p class="status" aria-live="polite">{message}</p>
  <p class="muted">Lebende Personen werden zusätzlich je nach Link anonymisiert. Als privat markierte Personen, Ereignisse, Notizen und Bilder aus Gramps werden nie angezeigt.</p>
{/if}

<style>
  h1 { margin: 0 0 4px; font-size: 24px; }
  .muted { color: var(--muted); margin: 0 0 16px; max-width: 40em; }
  .options { display: grid; gap: 4px; max-width: 560px; }
  label { display: flex; gap: 12px; align-items: flex-start; padding: 10px 4px; cursor: pointer; }
  input { width: 20px; height: 20px; margin-top: 2px; accent-color: var(--accent); }
  span { display: grid; gap: 2px; }
  small { color: var(--muted); }
  .status { min-height: 1.5em; color: var(--accent); }
</style>
