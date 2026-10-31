<script lang="ts">
  import { onMount } from 'svelte'
  import { DEFAULT_DEPTH, DEPTH_MAX, DEPTH_MIN, type KnownLink, type Presentation as PresentationData, type TreeResponse, type ViewInfo } from '../../shared/types.ts'
  import { ApiError, endPreview, fetchInfo, fetchKnownLinks, fetchPresentation, fetchTree, forgetKnownLink, openKnownLink } from './lib/api.ts'
  import KnownLinks from './lib/KnownLinks.svelte'
  import PersonPanel from './lib/PersonPanel.svelte'
  import Presentation from './lib/Presentation.svelte'
  import PersonSearch from './lib/PersonSearch.svelte'
  import TreeView from './lib/TreeView.svelte'

  let tree = $state<TreeResponse | null>(null)
  let error = $state<{ status: number, message: string } | null>(null)
  let mainId = $state('')
  let ancestryDepth = $state(DEFAULT_DEPTH)
  let progenyDepth = $state(DEFAULT_DEPTH)
  /** true, wenn der Besucher die Tiefe selbst geändert hat (im Browser gespeichert) */
  let customDepth = $state(false)
  const DEPTH_KEY = 'stammbaum.depth'
  let view: TreeView | undefined = $state()
  let panelOpen = $state(false)
  let info = $state<ViewInfo | null>(null)
  let presenting = $state<{ data: PresentationData | null, index: number } | null>(null)
  let menuOpen = $state(false)
  const linkHint = new URLSearchParams(location.search).get('link')
  let knownLinks = $state<KnownLink[]>([])
  let linksMenuOpen = $state(false)
  const validKnown = $derived(knownLinks.filter(k => k.status === 'active'))

  /** Anderen bekannten Link aktivieren – neu laden, weil sich Daten und Personen ändern */
  async function switchLink(id: string) {
    try {
      await openKnownLink(id)
      location.href = '/'
    } catch {
      knownLinks = await fetchKnownLinks().catch(() => knownLinks)
    }
  }

  async function forgetLink(id: string) {
    await forgetKnownLink(id).catch(() => {})
    knownLinks = knownLinks.filter(k => k.id !== id)
  }

  async function stopPreview() {
    await endPreview().catch(() => {})
    location.href = '/'
  }

  const byId = $derived(new Map(tree?.people.map(p => [p.id, p]) ?? []))
  const known = $derived(new Set(byId.keys()))

  function idFromHash(): string | undefined {
    return location.hash.match(/^#\/p\/([^/?]+)/)?.[1]
  }

  /** #/praesentation (frei) bzw. #/praesentation/<id>/<folie> */
  function presentationFromHash(): { id: string | null, index: number } | null {
    const m = location.hash.match(/^#\/praesentation(?:\/([^/]+)(?:\/(\d+))?)?/)
    return m ? { id: m[1] ?? null, index: m[2] ? Number(m[2]) - 1 : 0 } : null
  }

  async function startPresentation(id: string | null, index = 0, push = true) {
    menuOpen = false
    panelOpen = false
    try {
      presenting = { data: id ? await fetchPresentation(id) : null, index }
      if (push) history.pushState(null, '', id ? `#/praesentation/${id}/${index + 1}` : '#/praesentation')
    } catch {
      presenting = null
    }
  }

  function onPosition(personId: string, index: number) {
    mainId = personId
    const id = presenting?.data?.id
    history.replaceState(null, '', id ? `#/praesentation/${id}/${index + 1}` : '#/praesentation')
  }

  function exitPresentation() {
    presenting = null
    history.pushState(null, '', `#/p/${mainId}`)
  }

  function applyHash() {
    const pres = presentationFromHash()
    if (pres) {
      if (!presenting || (presenting.data?.id ?? null) !== pres.id) startPresentation(pres.id, pres.index, false)
      return
    }
    presenting = null
    const id = idFromHash()
    if (id && known.has(id)) mainId = id
  }

  function select(id: string, openPanel = true) {
    if (!known.has(id)) return
    mainId = id
    if (openPanel) panelOpen = true
    if (idFromHash() !== id) history.pushState(null, '', `#/p/${id}`)
  }

  onMount(() => {
    window.addEventListener('popstate', applyHash)

    fetchKnownLinks().then(k => (knownLinks = k)).catch(() => {})
    Promise.all([fetchTree(), fetchInfo()])
      .then(([t, i]) => {
        tree = t
        info = i
        const stored = storedDepth()
        ancestryDepth = stored?.a ?? clamp(i.ancestryDepth)
        progenyDepth = stored?.p ?? clamp(i.progenyDepth)
        customDepth = !!stored
        const fromHash = idFromHash()
        mainId = fromHash && t.people.some(p => p.id === fromHash) ? fromHash : t.rootId ?? t.people[0]?.id ?? ''
        applyHash()
      })
      .catch(e => {
        error = e instanceof ApiError ? { status: e.status, message: e.message } : { status: 0, message: String(e) }
      })
      .finally(() => {
        // Hinweis aus /s/<token> nur einmal auswerten
        if (location.search) history.replaceState(null, '', location.pathname + location.hash)
      })

    return () => window.removeEventListener('popstate', applyHash)
  })

  const clamp = (n: number) => Math.max(DEPTH_MIN, Math.min(DEPTH_MAX, n))

  function storedDepth(): { a: number, p: number } | null {
    try {
      const v = JSON.parse(localStorage.getItem(DEPTH_KEY) ?? 'null')
      return typeof v?.a === 'number' && typeof v?.p === 'number' ? { a: clamp(v.a), p: clamp(v.p) } : null
    } catch {
      return null
    }
  }

  function changeDepth(a: number, p: number) {
    ancestryDepth = clamp(a)
    progenyDepth = clamp(p)
    customDepth = true
    try {
      localStorage.setItem(DEPTH_KEY, JSON.stringify({ a: ancestryDepth, p: progenyDepth }))
    } catch { /* z. B. privates Fenster – dann eben nur für diese Sitzung */ }
  }

  function resetDepth() {
    ancestryDepth = info?.ancestryDepth ?? DEFAULT_DEPTH
    progenyDepth = info?.progenyDepth ?? DEFAULT_DEPTH
    customDepth = false
    try {
      localStorage.removeItem(DEPTH_KEY)
    } catch { /* ignorieren */ }
  }
</script>

{#if tree && mainId}
  <div class="layout">
    {#if info?.preview}
      <div class="banner" role="status">
        <span>Vorschau: so sieht <strong>{info.label}</strong> den Stammbaum</span>
        <button type="button" onclick={stopPreview}>Vorschau beenden</button>
      </div>
    {:else if linkHint === 'ungueltig' || linkHint === 'abgelaufen'}
      <div class="banner" role="status">
        <span>Der geöffnete Link ist {linkHint === 'ungueltig' ? 'ungültig' : 'nicht mehr gültig'} – angezeigt wird {info?.label ? `„${info.label}“` : 'der zuletzt genutzte Stammbaum'}.</span>
      </div>
    {/if}
    <header>
      <h1>Stammbaum</h1>
      <PersonSearch people={tree.people} onSelect={select} />
      <div class="controls" role="group" aria-label="Generationen">
        <div class="stepper" title="Generationen Vorfahren">
          <span class="long">Vorfahren</span><span class="short" aria-hidden="true">↑</span>
          <button type="button" aria-label="Weniger Vorfahren" onclick={() => changeDepth(ancestryDepth - 1, progenyDepth)} disabled={ancestryDepth <= DEPTH_MIN}>−</button>
          <output>{ancestryDepth}</output>
          <button type="button" aria-label="Mehr Vorfahren" onclick={() => changeDepth(ancestryDepth + 1, progenyDepth)} disabled={ancestryDepth >= DEPTH_MAX}>+</button>
        </div>
        <div class="stepper" title="Generationen Nachkommen">
          <span class="long">Nachkommen</span><span class="short" aria-hidden="true">↓</span>
          <button type="button" aria-label="Weniger Nachkommen" onclick={() => changeDepth(ancestryDepth, progenyDepth - 1)} disabled={progenyDepth <= DEPTH_MIN}>−</button>
          <output>{progenyDepth}</output>
          <button type="button" aria-label="Mehr Nachkommen" onclick={() => changeDepth(ancestryDepth, progenyDepth + 1)} disabled={progenyDepth >= DEPTH_MAX}>+</button>
        </div>
        {#if customDepth && (ancestryDepth !== info?.ancestryDepth || progenyDepth !== info?.progenyDepth)}
          <button type="button" class="plain" aria-label="Standard-Tiefe wiederherstellen" title="Standard-Tiefe wiederherstellen" onclick={resetDepth}><span aria-hidden="true">↺</span><span class="long">Standard</span></button>
        {/if}
        <button type="button" class="plain fit" aria-label="Ganzen Ausschnitt einpassen" onclick={() => view?.fit()}><span aria-hidden="true">⤢</span><span class="long">Einpassen</span></button>
        <div class="menu">
          {#if info?.presentations.length}
            <button type="button" class="plain present" aria-haspopup="menu" aria-expanded={menuOpen} onclick={() => (menuOpen = !menuOpen)}><span aria-hidden="true">▶</span><span class="long">Präsentation</span></button>
            {#if menuOpen}
              <ul role="menu">
                <li><button type="button" role="menuitem" onclick={() => startPresentation(null)}>Freie Navigation<small>mit Pfeiltasten durch den Baum</small></button></li>
                {#each info.presentations as p (p.id)}
                  <li><button type="button" role="menuitem" onclick={() => startPresentation(p.id)}>{p.title}<small>{p.stationCount} Stationen</small></button></li>
                {/each}
              </ul>
            {/if}
          {:else}
            <button type="button" class="plain present" onclick={() => startPresentation(null)}><span aria-hidden="true">▶</span><span class="long">Präsentation</span></button>
          {/if}
        </div>
        {#if validKnown.length > 1 && !info?.preview}
          <div class="menu">
            <button type="button" class="plain" aria-haspopup="menu" aria-expanded={linksMenuOpen} title="Stammbaum wechseln" aria-label="Stammbaum wechseln" onclick={() => (linksMenuOpen = !linksMenuOpen)}>
              <span aria-hidden="true">⇄</span><span class="long">{validKnown.find(k => k.current)?.label ?? 'Wechseln'}</span>
            </button>
            {#if linksMenuOpen}
              <ul role="menu">
                {#each validKnown as k (k.id)}
                  <li><button type="button" role="menuitemradio" aria-checked={k.current} disabled={k.current} onclick={() => switchLink(k.id)}>{k.label}{#if k.current}<small>aktuell</small>{/if}</button></li>
                {/each}
              </ul>
            {/if}
          </div>
        {/if}
        {#if tree.rootId && tree.rootId !== mainId}
          <button type="button" class="plain" aria-label="Zur Startperson" onclick={() => select(tree!.rootId!, false)}><span aria-hidden="true">⌂</span><span class="long">Zum Anfang</span></button>
        {/if}
      </div>
    </header>
    <main>
      <TreeView bind:this={view} people={tree.people} {mainId} {ancestryDepth} {progenyDepth} onSelect={select} />
      {#if presenting}
        {#key presenting}
        <Presentation
          people={tree.people}
          {byId}
          presentation={presenting.data}
          startId={mainId}
          startIndex={presenting.index}
          {onPosition}
          onExit={exitPresentation}
        />
        {/key}
      {/if}
      {#if panelOpen}
        <PersonPanel id={mainId} people={byId} onSelect={select} onClose={() => (panelOpen = false)} />
      {/if}
    </main>
  </div>
{:else if error}
  <div class="message">
    {#if (error.status === 401 || error.status === 403) && linkHint === 'ungueltig'}
      <h1>Link ungültig</h1>
      <p>Dieser Einladungslink ist nicht bekannt. Bitte prüf, ob er vollständig kopiert wurde.</p>
    {:else if error.status === 401 || error.status === 403}
      <h1>Kein Zugang</h1>
      <p>Der Stammbaum ist nur über einen persönlichen Einladungslink erreichbar.</p>
    {:else if error.status === 410 || linkHint === 'abgelaufen'}
      <h1>Link nicht mehr gültig</h1>
      <p>Dieser Einladungslink ist abgelaufen oder wurde zurückgezogen. Bitte frag nach einem neuen Link.</p>
    {:else}
      <h1>Der Stammbaum konnte nicht geladen werden</h1>
      <p>Bitte versuch es später noch einmal.</p>
    {/if}
    {#if knownLinks.length && (error.status === 401 || error.status === 403 || error.status === 410)}
      <KnownLinks links={knownLinks} onOpen={switchLink} onForget={forgetLink} />
    {/if}
  </div>
{:else}
  <div class="message" aria-busy="true"><p>Stammbaum wird geladen …</p></div>
{/if}

<style>
  .layout { display: flex; flex-direction: column; height: 100%; }
  header {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 8px 16px;
    padding: 8px 16px;
    padding-top: max(8px, env(safe-area-inset-top));
    background: var(--surface);
    border-bottom: 1px solid var(--border);
    z-index: 10;
  }
  h1 { font-size: 18px; margin: 0; color: var(--accent); }
  .controls { display: flex; flex-wrap: wrap; align-items: center; gap: 8px; }
  .stepper {
    display: flex;
    align-items: center;
    gap: 4px;
    font-size: 14px;
    color: var(--muted);
  }
  .stepper span { margin-right: 2px; }
  .stepper .short { display: none; }
  .stepper output { min-width: 1.2em; text-align: center; color: var(--text); font-variant-numeric: tabular-nums; }
  button {
    border: 1px solid var(--border);
    background: var(--bg);
    border-radius: 8px;
    min-width: 32px;
    height: 32px;
    cursor: pointer;
  }
  button.plain { padding: 0 12px; display: inline-flex; align-items: center; gap: 6px; }
  button:hover:not(:disabled) { border-color: var(--accent); }
  button:disabled { opacity: 0.4; cursor: default; }
  .banner {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: center;
    gap: 6px 12px;
    padding: 8px 16px;
    background: var(--accent);
    color: var(--surface);
    font-size: 14px;
    text-align: center;
  }
  .banner button { height: 28px; padding: 0 12px; border-color: transparent; background: var(--surface); color: var(--text); }
  .menu { position: relative; }
  .menu ul {
    position: absolute;
    top: calc(100% + 6px);
    right: 0;
    min-width: 240px;
    margin: 0;
    padding: 4px;
    list-style: none;
    background: var(--surface);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    box-shadow: 0 8px 24px rgb(0 0 0 / 0.2);
    z-index: 30;
  }
  .menu li button {
    display: grid;
    width: 100%;
    height: auto;
    padding: 8px 10px;
    border: 0;
    background: none;
    text-align: left;
  }
  .menu li button:hover { background: var(--bg); }
  .menu small { color: var(--muted); }
  main { flex: 1; min-height: 0; position: relative; overflow: hidden; }
  .message { display: grid; place-content: center; justify-items: center; height: 100%; padding: 24px; text-align: center; }
  .message h1 { font-size: 24px; margin-bottom: 8px; }
  .message p { color: var(--muted); max-width: 32em; }

  @media (max-width: 640px) {
    header { padding: 8px 12px; }
    h1 { display: none; }
    .long { display: none; }
    .stepper .short { display: inline; }
    .controls { width: 100%; gap: 6px 4px; }
    .controls button { min-width: 30px; height: 30px; }
    .stepper { gap: 2px; }
    .stepper + .stepper { margin-left: 4px; }
    button.plain { padding: 0 10px; }
    button.fit { margin-left: auto; }
    :global(.search) { flex-basis: 100%; max-width: none; }
  }
</style>
