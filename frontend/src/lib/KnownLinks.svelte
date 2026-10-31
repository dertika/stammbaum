<script lang="ts">
  import type { KnownLink } from '../../../shared/types.ts'

  interface Props {
    links: KnownLink[]
    onOpen: (id: string) => void
    onForget: (id: string) => void
  }

  let { links, onOpen, onForget }: Props = $props()
</script>

<section aria-labelledby="known-title">
  <h2 id="known-title">Bisher geöffnet</h2>
  <ul>
    {#each links as link (link.id)}
      <li class:invalid={link.status !== 'active'}>
        {#if link.status === 'active'}
          <button type="button" class="open" onclick={() => onOpen(link.id)}>
            <span>{link.label}</span>
            <span aria-hidden="true">→</span>
          </button>
        {:else}
          <div class="dead">
            <span>{link.label}</span>
            <small>{link.status === 'revoked' ? 'zurückgezogen' : 'abgelaufen'} – bitte nach einem neuen Link fragen</small>
          </div>
          <button type="button" class="forget" onclick={() => onForget(link.id)}>Entfernen</button>
        {/if}
      </li>
    {/each}
  </ul>
</section>

<style>
  section { margin-top: 24px; text-align: left; width: min(420px, 100%); }
  h2 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.06em; color: var(--muted); margin: 0 0 8px; }
  ul { list-style: none; margin: 0; padding: 0; display: grid; gap: 8px; }
  li {
    display: flex;
    align-items: center;
    gap: 8px;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    background: var(--surface);
  }
  .open {
    flex: 1;
    display: flex;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border: 0;
    background: none;
    font-weight: 600;
    text-align: left;
    cursor: pointer;
  }
  .open:hover { color: var(--accent); }
  .invalid { opacity: 0.7; background: var(--bg); }
  .dead { flex: 1; display: grid; gap: 2px; padding: 10px 14px; }
  .dead small { color: var(--muted); }
  .forget {
    margin-right: 8px;
    padding: 6px 10px;
    border: 1px solid var(--border);
    border-radius: 8px;
    background: var(--bg);
    cursor: pointer;
  }
</style>
