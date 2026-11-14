<script lang="ts">
  import type { ThemeMode } from './theme.svelte.ts'
  let { mode }: { mode: ThemeMode } = $props()
</script>

<!-- Eigene Symbole statt Schriftzeichen: ◐/☾ fehlen in vielen Systemschriften -->
<svg viewBox="0 0 16 16" width="1em" height="1em" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
  {#if mode === 'auto'}
    <circle cx="8" cy="8" r="6" />
    <path d="M8 2a6 6 0 0 1 0 12z" fill="currentColor" stroke="none" />
  {:else if mode === 'light'}
    <circle cx="8" cy="8" r="3" />
    <path d="M8 1v1.5M8 13.5V15M1 8h1.5M13.5 8H15M3 3l1.1 1.1M11.9 11.9 13 13M3 13l1.1-1.1M11.9 4.1 13 3" />
  {:else}
    <path d="M13.5 9.5A6 6 0 1 1 6.5 2.5a4.8 4.8 0 0 0 7 7z" />
  {/if}
</svg>
