<script lang="ts">
  import { onMount } from 'svelte'
  import type { AdminInfo } from '../../../shared/types.ts'
  import './admin.css'
  import { admin } from './api.ts'
  import DataPage from './DataPage.svelte'
  import DisplayPage from './DisplayPage.svelte'
  import LinksPage from './LinksPage.svelte'
  import PresentationsPage from './PresentationsPage.svelte'

  const pages = [
    { path: '/admin/links', label: 'Freigabelinks' },
    { path: '/admin/praesentationen', label: 'Präsentationen' },
    { path: '/admin/anzeige', label: 'Anzeige' },
    { path: '/admin/daten', label: 'Datenstand' },
  ]

  let me = $state<AdminInfo | null>(null)
  let path = $state(location.pathname)
  const current = $derived(pages.find(p => path.startsWith(p.path)) ?? pages[0])

  function go(e: MouseEvent, to: string) {
    e.preventDefault()
    history.pushState(null, '', to)
    path = to
  }

  async function logout() {
    await admin.logout().catch(() => {})
    location.href = '/'
  }

  onMount(() => {
    document.title = 'Stammbaum – Verwaltung'
    admin.me().then(m => (me = m)).catch(() => {})
    const onPop = () => (path = location.pathname)
    window.addEventListener('popstate', onPop)
    return () => window.removeEventListener('popstate', onPop)
  })
</script>

{#if me}
  <div class="admin">
    <header>
      <div class="title">
        <strong>Stammbaum</strong>
        <span>Verwaltung</span>
      </div>
      <nav aria-label="Bereiche">
        {#each pages as p (p.path)}
          <a href={p.path} class:active={current.path === p.path} aria-current={current.path === p.path ? 'page' : undefined} onclick={e => go(e, p.path)}>{p.label}</a>
        {/each}
      </nav>
      <div class="actions">
        <a class="btn primary" href={me.grampsEditUrl} target="_blank" rel="noopener">Stammbaum bearbeiten ↗</a>
        <a class="btn" href="/" target="_blank" rel="noopener">Ansicht öffnen</a>
        <button type="button" class="btn" onclick={logout} title="Angemeldet als {me.name}">Abmelden</button>
      </div>
    </header>
    <main>
      {#if current.path === '/admin/links'}
        <LinksPage />
      {:else if current.path === '/admin/praesentationen'}
        <PresentationsPage />
      {:else if current.path === '/admin/anzeige'}
        <DisplayPage />
      {:else}
        <DataPage />
      {/if}
    </main>
  </div>
{:else}
  <p class="loading">Anmeldung wird geprüft …</p>
{/if}

<style>
  .admin { height: 100%; overflow-y: auto; }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 12px 24px;
    padding: 12px 16px;
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    position: sticky;
    top: 0;
    z-index: 5;
  }
  .title { display: flex; flex-direction: column; line-height: 1.1; }
  .title strong { color: var(--accent); font-size: 18px; }
  .title span { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.08em; }
  nav { display: flex; gap: 4px; flex-wrap: wrap; }
  nav a {
    padding: 8px 12px;
    border-radius: 8px;
    color: var(--text);
    text-decoration: none;
  }
  nav a:hover { background: var(--bg); }
  nav a.active { background: var(--bg); font-weight: 600; box-shadow: inset 0 -2px 0 var(--accent); }
  .actions { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; }
  main { max-width: 1000px; margin: 0 auto; padding: 24px 16px 48px; }
  .loading { padding: 24px; color: var(--muted); }
  @media (max-width: 720px) {
    header { position: static; }
    .actions { margin-left: 0; width: 100%; }
    .actions .btn { flex: 1; }
  }
</style>
