<script lang="ts">
  import { ROOM_NAMES } from '$lib/shipMap.config';
  import type { PublicState } from '$lib/types';

  let { gameState, rounds = 3 }: { gameState: PublicState; rounds?: number } = $props();

  /** The last few rounds, newest first, in short form. */
  const entries = $derived(
    gameState.log
      .filter((e) => e.kind !== 'SETTINGS')
      .slice(-rounds * 3)
      .reverse()
      .slice(0, rounds * 2),
  );
</script>

<section class="panel">
  <span class="eyebrow">Ship log</span>
  <ol>
    {#each entries as e, i (i)}
      <li class:scan={e.kind === 'SCAN'}>
        <span class="round mono">R{e.round}</span>
        <div class="body">
          <span class="text">{e.text}</span>
          {#if e.rooms}
            <span class="detail">
              {e.rooms
                .filter((r) => r.summary !== 'empty' && r.summary !== 'nothing to do')
                .map((r) => ROOM_NAMES[r.room] + ' ' + r.summary)
                .join(' · ') || 'a quiet round'}
            </span>
          {/if}
        </div>
      </li>
    {:else}
      <li class="empty">Nothing has happened yet.</li>
    {/each}
  </ol>
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    min-height: 0;
    padding: 0.9rem 1rem;
    background: var(--hull);
    border: 1px solid var(--line);
    border-radius: 14px;
    overflow: hidden;
  }

  ol {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.45rem;
    overflow: hidden;
  }

  li {
    display: grid;
    grid-template-columns: 2.2rem 1fr;
    gap: 0.5rem;
    align-items: baseline;
  }

  .round {
    font-size: 0.8rem;
    color: var(--ink-faint);
  }

  .body {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }

  .text {
    font-size: 0.9rem;
  }

  li.scan .text {
    color: var(--amber);
    font-weight: 600;
  }

  .detail {
    font-size: 0.76rem;
    color: var(--ink-faint);
    line-height: 1.35;
  }

  .empty {
    display: block;
    color: var(--ink-faint);
    font-size: 0.85rem;
  }
</style>
