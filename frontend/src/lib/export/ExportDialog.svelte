<script lang="ts">
  import { onMount } from 'svelte'
  import {
    chooseOrientation, contentBounds, NAME_SIZE, PAPER_FORMATS, printedFontPt, recommendFormat, type PaperFormat,
  } from './layout.ts'
  import type { ListExport, TreeExport } from './pdf.ts'

  export type ExportPayload = { kind: 'tree', data: TreeExport } | { kind: 'list', data: ListExport }

  interface Props {
    /** Liefert die Daten der aktuellen Ansicht */
    prepare: () => ExportPayload | null
    onClose: () => void
  }

  let { prepare, onClose }: Props = $props()

  let payload = $state<ExportPayload | null>(null)
  let format = $state<PaperFormat>('a4')
  let busy = $state(false)
  let status = $state('')
  let error = $state('')
  let dialog: HTMLDialogElement

  const bounds = $derived(payload?.kind === 'tree'
    ? contentBounds(payload.data.cards, payload.data.cardW, payload.data.cardH, payload.data.linePoints ?? [])
    : null)
  const orientation = $derived(bounds ? chooseOrientation(bounds.width, bounds.height) : 'portrait')
  const pt = $derived(bounds ? printedFontPt(bounds, format, NAME_SIZE) : null)
  const recommended = $derived(bounds ? recommendFormat(bounds, NAME_SIZE) : 'a4')
  const count = $derived(payload?.kind === 'tree' ? payload.data.cards.length : payload ? payload.data.groups.reduce((n, g) => n + g.people.length, 0) : 0)

  onMount(() => {
    payload = prepare()
    if (bounds) format = recommended === 'a0' || recommended === 'a1' ? 'a4' : recommended
    dialog.showModal()
  })

  async function run() {
    if (!payload) return
    busy = true
    error = ''
    try {
      const pdf = await import('./pdf.ts')
      const onProgress = (m: string) => (status = m)
      if (payload.kind === 'tree') await pdf.exportTreePdf(payload.data, format, onProgress)
      else await pdf.exportListPdf(payload.data, format, onProgress)
      onClose()
    } catch (e) {
      error = `Das PDF konnte nicht erstellt werden: ${e instanceof Error ? e.message : String(e)}`
    } finally {
      busy = false
      status = ''
    }
  }
</script>

<dialog bind:this={dialog} onclose={onClose} aria-labelledby="export-title">
  <h2 id="export-title">Als PDF speichern</h2>
  {#if !payload}
    <p>Diese Ansicht ist noch nicht fertig geladen.</p>
  {:else}
    <p class="muted">{payload.data.title} · {count} {count === 1 ? 'Person' : 'Personen'}</p>
    <label class="field">
      <span>Papierformat</span>
      <select bind:value={format} disabled={busy}>
        {#each PAPER_FORMATS as f (f.value)}<option value={f.value}>{f.label}</option>{/each}
      </select>
    </label>
    {#if payload.kind === 'tree'}
      <p>Ausrichtung: <strong>{orientation === 'landscape' ? 'Querformat' : 'Hochformat'}</strong> – der Baum ist {orientation === 'landscape' ? 'breiter als hoch' : 'höher als breit'}.</p>
      {#if pt !== null}
        <p class:warn={pt < 5}>
          Namen werden etwa {pt < 1 ? pt.toFixed(1).replace('.', ',') : Math.round(pt)} pt groß gedruckt.
          {#if pt < 5 && printedFontPt(bounds!, 'a0', NAME_SIZE) >= 5}
            Gut lesbar wird es ab {PAPER_FORMATS.find(f => f.value === recommended)?.label.split(' ')[0]}.
          {:else if pt < 5}
            Der Baum ist für eine Seite sehr groß – selbst auf A0 bleibt die Schrift klein. Tipp: in der Baumansicht weniger Generationen zeigen und diese exportieren.
          {/if}
        </p>
      {/if}
    {:else}
      <p>Ausrichtung: <strong>Hochformat</strong>, Tabelle über mehrere Seiten.</p>
    {/if}
    <p class="muted small">Gedruckt werden Portrait, Name, Geburts- und Sterbedatum – so, wie dieser Link sie zeigen darf.</p>
    {#if error}<p class="error" role="alert">{error}</p>{/if}
    {#if status}<p class="status" aria-live="polite">{status}</p>{/if}
  {/if}
  <div class="buttons">
    <button type="button" onclick={() => dialog.close()} disabled={busy}>Abbrechen</button>
    <button type="button" class="primary" onclick={run} disabled={busy || !payload}>{busy ? 'Wird erstellt …' : 'PDF erstellen'}</button>
  </div>
</dialog>

<style>
  dialog {
    width: min(440px, calc(100% - 32px));
    padding: 20px 22px;
    border: 1px solid var(--border);
    border-radius: 14px;
    background: var(--surface);
    color: var(--text);
    box-shadow: 0 20px 50px rgb(0 0 0 / 0.3);
  }
  dialog::backdrop { background: rgb(0 0 0 / 0.4); }
  h2 { margin: 0 0 6px; font-size: 19px; }
  p { margin: 10px 0; line-height: 1.45; }
  .muted { color: var(--muted); margin-top: 0; }
  .small { font-size: 13px; }
  .field { display: grid; gap: 4px; margin: 14px 0; }
  .field span { font-size: 13px; color: var(--muted); }
  select { padding: 8px 10px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); }
  .warn { color: #a15c00; }
  .error { color: #b3261e; }
  .status { color: var(--accent); }
  .buttons { display: flex; justify-content: flex-end; gap: 8px; margin-top: 16px; }
  .buttons button { height: 36px; padding: 0 16px; border: 1px solid var(--border); border-radius: 8px; background: var(--bg); cursor: pointer; }
  .buttons .primary { background: var(--accent); border-color: var(--accent); color: var(--surface); font-weight: 600; }
  .buttons button:disabled { opacity: 0.5; cursor: default; }
</style>
