<script lang="ts">
  import { onMount } from 'svelte'
  import type { AdminStatus } from '../../../shared/types.ts'
  import { admin, formatDateTime } from './api.ts'

  let status = $state<AdminStatus | null>(null)
  let busy = $state(false)
  let error = $state('')

  onMount(() => {
    admin.status().then(s => (status = s)).catch(e => (error = e.message))
  })

  async function refresh() {
    busy = true
    try {
      status = await admin.refresh()
      error = ''
    } catch (e) {
      error = (e as Error).message
    } finally {
      busy = false
    }
  }
</script>

<h1>Datenstand</h1>
<p class="muted">Die Daten aus Gramps Web werden zwischengespeichert und regelmäßig im Hintergrund aktualisiert.</p>

{#if error}<p class="notice error" role="alert">{error}</p>{/if}

{#if status}
  <div class="admin-card">
    <dl>
      <div><dt>Zuletzt geladen</dt><dd>{formatDateTime(status.loadedAt, true)}</dd></div>
      <div><dt>Personen</dt><dd>{status.people}</dd></div>
    </dl>
    {#if status.error}<p class="notice error">Letzter Ladeversuch fehlgeschlagen: {status.error}</p>{/if}
    {#if status.imageError}
      <p class="notice error">Letzter Bildfehler ({formatDateTime(status.imageError.at, true)}): {status.imageError.message}</p>
    {/if}
    <button type="button" class="btn primary" onclick={refresh} disabled={busy}>{busy ? 'Wird geladen …' : 'Jetzt aktualisieren'}</button>
  </div>
{/if}

<style>
  h1 { margin: 0 0 4px; font-size: 24px; }
  .muted { color: var(--muted); margin: 0 0 16px; }
  .admin-card { max-width: 560px; display: grid; gap: 12px; justify-items: start; }
  dl { display: flex; gap: 32px; margin: 0; }
  dt { font-size: 12px; color: var(--muted); }
  dd { margin: 2px 0 0; font-size: 18px; }
</style>
