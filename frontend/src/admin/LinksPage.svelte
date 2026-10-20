<script lang="ts">
  import { onMount } from 'svelte'
  import type { LivingMode, ShareLink } from '../../../shared/types.ts'
  import { admin, formatDateTime } from './api.ts'

  const STATUS = { active: 'Aktiv', expired: 'Abgelaufen', revoked: 'Widerrufen' }

  let links = $state<ShareLink[]>([])
  let loaded = $state(false)
  let error = $state('')
  let copied = $state('')

  // Formular für neuen bzw. bearbeiteten Link
  let editing = $state<string | null>(null)
  let formOpen = $state(false)
  let label = $state('')
  let living = $state<LivingMode>('anonymize')
  let expires = $state('')
  let saving = $state(false)

  async function load() {
    try {
      links = await admin.links()
      error = ''
    } catch (e) {
      error = (e as Error).message
    } finally {
      loaded = true
    }
  }

  function openForm(link?: ShareLink) {
    editing = link?.id ?? null
    label = link?.label ?? ''
    living = link?.living ?? 'anonymize'
    expires = link?.expiresAt ? link.expiresAt.slice(0, 10) : ''
    formOpen = true
  }

  async function save(e: SubmitEvent) {
    e.preventDefault()
    saving = true
    // Ablaufdatum gilt bis zum Ende des gewählten Tages (Ortszeit)
    const expiresAt = expires ? new Date(`${expires}T23:59:59`).toISOString() : null
    try {
      const input = { label, living, expiresAt }
      const saved = editing ? await admin.updateLink(editing, input) : await admin.createLink(input)
      formOpen = false
      await load()
      if (!editing) await copy(saved)
    } catch (err) {
      error = (err as Error).message
    } finally {
      saving = false
    }
  }

  async function copy(link: ShareLink) {
    try {
      await navigator.clipboard.writeText(link.url)
      copied = link.id
      setTimeout(() => { if (copied === link.id) copied = '' }, 2500)
    } catch {
      prompt('Link kopieren:', link.url)
    }
  }

  async function share(link: ShareLink) {
    if (navigator.share) await navigator.share({ title: 'Unser Stammbaum', url: link.url }).catch(() => {})
    else await copy(link)
  }

  async function toggleRevoke(link: ShareLink) {
    const revoke = link.status !== 'revoked'
    if (revoke && !confirm(`„${link.label}“ widerrufen? Wer den Link hat, sieht den Stammbaum dann sofort nicht mehr.`)) return
    await admin.revokeLink(link.id, revoke).catch(e => (error = e.message))
    await load()
  }

  async function remove(link: ShareLink) {
    if (!confirm(`„${link.label}“ endgültig löschen?`)) return
    await admin.deleteLink(link.id).catch(e => (error = e.message))
    await load()
  }

  onMount(load)
</script>

<div class="head">
  <div>
    <h1>Freigabelinks</h1>
    <p class="muted">Geheime Links für die Familie – nur zum Ansehen, ohne Konto.</p>
  </div>
  <button type="button" class="btn primary" onclick={() => openForm()}>+ Neuer Link</button>
</div>

{#if error}<p class="notice error" role="alert">{error}</p>{/if}

{#if formOpen}
  <form class="admin-card form" onsubmit={save}>
    <h2>{editing ? 'Link bearbeiten' : 'Neuer Link'}</h2>
    <label class="field">
      <span>Bezeichnung (z. B. für wen der Link ist)</span>
      <input bind:value={label} required maxlength="120" placeholder="Familie Huber" />
    </label>
    <fieldset>
      <legend>Lebende Personen</legend>
      <label><input type="radio" bind:group={living} value="anonymize" /> anonymisieren (empfohlen)</label>
      <label><input type="radio" bind:group={living} value="show" /> mit Namen und Daten zeigen</label>
    </fieldset>
    <label class="field">
      <span>Gültig bis (leer = unbegrenzt)</span>
      <input type="date" bind:value={expires} />
    </label>
    <div class="row">
      <button type="submit" class="btn primary" disabled={saving}>{editing ? 'Speichern' : 'Link erstellen und kopieren'}</button>
      <button type="button" class="btn" onclick={() => (formOpen = false)}>Abbrechen</button>
    </div>
  </form>
{/if}

{#if loaded && !links.length && !formOpen}
  <p class="admin-card muted">Noch keine Links angelegt.</p>
{/if}

<ul class="links">
  {#each links as link (link.id)}
    <li class="admin-card">
      <div class="top">
        <strong>{link.label}</strong>
        <span class="badge {link.status}">{STATUS[link.status]}</span>
      </div>
      <dl>
        <div><dt>Lebende Personen</dt><dd>{link.living === 'show' ? 'sichtbar' : 'anonymisiert'}</dd></div>
        <div><dt>Gültig bis</dt><dd>{link.expiresAt ? formatDateTime(link.expiresAt) : 'unbegrenzt'}</dd></div>
        <div><dt>Zuletzt geöffnet</dt><dd>{formatDateTime(link.lastUsedAt, true)} ({link.useCount}×)</dd></div>
        <div><dt>Erstellt</dt><dd>{formatDateTime(link.createdAt)}</dd></div>
      </dl>
      {#if link.url}
        <input class="url" readonly value={link.url} aria-label="Link" onfocus={e => e.currentTarget.select()} />
      {:else}
        <p class="notice error">Link kann nicht entschlüsselt werden (APP_SECRET geändert?) – bitte neu anlegen.</p>
      {/if}
      <div class="row">
        <button type="button" class="btn" onclick={() => copy(link)} disabled={!link.url}>{copied === link.id ? 'Kopiert ✓' : 'Kopieren'}</button>
        <button type="button" class="btn" onclick={() => share(link)} disabled={!link.url}>Teilen</button>
        <a class="btn" href="/api/admin/links/{link.id}/preview" target="_blank" rel="noopener">Vorschau</a>
        <button type="button" class="btn" onclick={() => openForm(link)}>Bearbeiten</button>
        <button type="button" class="btn" onclick={() => toggleRevoke(link)}>{link.status === 'revoked' ? 'Reaktivieren' : 'Widerrufen'}</button>
        <button type="button" class="btn danger" onclick={() => remove(link)}>Löschen</button>
      </div>
    </li>
  {/each}
</ul>

<style>
  .head { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; margin-bottom: 16px; flex-wrap: wrap; }
  h1 { margin: 0 0 4px; font-size: 24px; }
  h2 { margin: 0; font-size: 18px; }
  .muted { color: var(--muted); margin: 0; }
  .form { display: grid; gap: 14px; margin-bottom: 16px; max-width: 520px; }
  fieldset { border: 0; padding: 0; margin: 0; display: grid; gap: 6px; }
  legend { font-size: 13px; color: var(--muted); margin-bottom: 4px; }
  .row { display: flex; flex-wrap: wrap; gap: 8px; }
  .links { list-style: none; margin: 16px 0 0; padding: 0; display: grid; gap: 12px; }
  .top { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
  .top strong { font-size: 17px; }
  dl { display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 8px 16px; margin: 12px 0; }
  dt { font-size: 12px; color: var(--muted); }
  dd { margin: 2px 0 0; }
  .url {
    width: 100%;
    margin-bottom: 12px;
    padding: 8px 10px;
    border: 1px dashed var(--border);
    border-radius: 8px;
    background: var(--bg);
    font-family: ui-monospace, monospace;
    font-size: 13px;
  }
</style>
