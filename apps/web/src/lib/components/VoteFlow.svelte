<script lang="ts">
  import type { PublicState } from '$lib/types';

  /**
   * Two taps. Ballots are public on the TV, so nothing here needs shuffling — but the tap
   * guard and the fade stay, so the rhythm of the app never changes between phases.
   */
  let {
    gameState,
    selfId,
    onsubmit,
    tapGuardMs = 700,
  }: {
    gameState: PublicState;
    selfId: string;
    onsubmit: (choice: string) => void;
    tapGuardMs?: number;
  } = $props();

  let step = $state<'ballot' | 'lock'>('ballot');
  let choice = $state<string | null>(null);
  let fading = $state(false);
  let guardUntil = $state(0);

  const vote = $derived(gameState.vote);

  // Candidates in seating order, so the tiles sit in the same place every round.
  const tiles = $derived.by(() => {
    if (!vote) return [];
    return gameState.players
      .filter((p) => vote.candidates.includes(p.id))
      .map((p) => ({
        id: p.id,
        name: p.name,
        // In a runoff a candidate's own tile is present but disabled, so the layout has the
        // same number of tiles for everyone at the table.
        disabled: p.id === selfId && (vote.stage === 'RUNOFF' || !gameState.config.allowSelfVote),
      }));
  });

  function begin(next: 'ballot' | 'lock') {
    fading = true;
    setTimeout(
      () => {
        step = next;
        fading = false;
        guardUntil = Date.now() + tapGuardMs;
      },
      300 + Math.random() * 600,
    );
  }

  const armed = () => !fading && Date.now() >= guardUntil;

  function pick(id: string) {
    if (!armed()) return;
    choice = id;
    begin('lock');
  }
</script>

<div class="flow" class:fading>
  {#if step === 'ballot'}
    <p class="prompt">{vote?.stage === 'RUNOFF' ? 'Runoff' : 'Who gets scanned?'}</p>
    <div class="grid" class:two={tiles.length > 6}>
      {#each tiles as t (t.id)}
        <button class="tile" disabled={t.disabled} onclick={() => pick(t.id)}>{t.name}</button>
      {/each}
      {#if vote?.allowSkip}
        <button class="tile" onclick={() => pick('SKIP')}>SKIP</button>
      {/if}
    </div>
  {:else}
    <p class="prompt">Ready</p>
    <div class="grid">
      <button class="tile" onclick={() => armed() && choice && onsubmit(choice)}>LOCK IN</button>
    </div>
    <button class="back" onclick={() => armed() && begin('ballot')}>BACK</button>
  {/if}
</div>

<style>
  .flow {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 0.9rem;
    height: 100%;
    padding-bottom: 0.5rem;
    transition: opacity 220ms ease;
  }

  .flow.fading {
    opacity: 0;
  }

  .prompt {
    margin: 0;
    text-align: center;
    font-size: 0.78rem;
    letter-spacing: 0.24em;
    text-transform: uppercase;
    color: var(--ink-faint);
  }

  .grid {
    display: grid;
    grid-template-columns: 1fr;
    gap: 0.5rem;
  }

  .grid.two {
    grid-template-columns: 1fr 1fr;
  }

  .tile {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 3rem;
    background: var(--hull);
    border: 1px solid var(--line-2);
    border-radius: 12px;
    color: var(--ink);
    font-size: 1rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    -webkit-tap-highlight-color: transparent;
  }

  .tile:disabled {
    opacity: 0.35;
  }

  .tile:active:not(:disabled) {
    outline: 1px solid var(--ink-dim);
  }

  .back {
    align-self: center;
    background: none;
    border: 0;
    padding: 0.5rem 1rem;
    color: var(--ink-faint);
    font-size: 0.8rem;
    letter-spacing: 0.2em;
  }
</style>
