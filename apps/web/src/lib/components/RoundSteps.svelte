<script lang="ts">
  import type { PublicState } from '$lib/types';

  /**
   * Where the table is in the current round, drawn like the X-ray repair track: one segment
   * per step, filled as the round moves through them. The Vote segment is the only one that
   * may not happen — it is dashed until the round has resolved and the server knows, then
   * either stays in play or reads "No vote".
   */
  let { gameState }: { gameState: PublicState } = $props();

  const STEPS = [
    { key: 'REPORT', label: 'Report' },
    { key: 'TALK', label: 'Talk' },
    { key: 'ACT', label: 'Act' },
    { key: 'RESOLVE', label: 'Resolve' },
    { key: 'VOTE', label: 'Vote' },
  ] as const;

  const current = $derived(STEPS.findIndex((s) => s.key === gameState.phase));
  const noVote = $derived(gameState.voteThisRound === 'NO');
  const total = $derived(noVote ? STEPS.length - 1 : STEPS.length);

  const voteLabel = $derived(
    gameState.phase === 'VOTE' && gameState.vote?.stage === 'RUNOFF'
      ? 'Runoff'
      : noVote
        ? 'No vote'
        : 'Vote',
  );

  function stateOf(i: number): 'done' | 'current' | 'todo' | 'maybe' | 'skipped' {
    const isVote = i === STEPS.length - 1;
    if (isVote && noVote) return 'skipped';
    if (i < current) return 'done';
    if (i === current) return 'current';
    if (isVote && gameState.voteThisRound === 'UNKNOWN') return 'maybe';
    return 'todo';
  }
</script>

{#if current >= 0}
  <div class="steps" aria-label={'Step ' + (current + 1) + ' of ' + total}>
    <span class="eyebrow">Step {current + 1} <i>of {total}</i></span>
    <ol class="track">
      {#each STEPS as s, i (s.key)}
        <li class={stateOf(i)}>
          <span class="seg"></span>
          <span class="label">{i === STEPS.length - 1 ? voteLabel : s.label}</span>
        </li>
      {/each}
    </ol>
  </div>
{/if}

<style>
  .steps {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    min-width: 0;
  }

  .eyebrow i {
    font-style: normal;
    color: var(--ink-faint);
    opacity: 0.8;
  }

  .track {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    gap: 0.35rem;
  }

  li {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
  }

  /* Same segment as the X-ray repair track in the status strip, so the two read as one family. */
  .seg {
    display: block;
    width: clamp(2.4rem, 3.4vw, 4rem);
    height: 1.15rem;
    border-radius: 4px;
    background: var(--hull-2);
    border: 1px solid var(--line-2);
  }

  .label {
    font-size: 0.7rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--ink-faint);
    white-space: nowrap;
  }

  .done .seg {
    background: rgba(95, 208, 196, 0.35);
    border-color: rgba(95, 208, 196, 0.55);
  }

  .current .seg {
    background: linear-gradient(180deg, #7de3d6, var(--teal));
    border-color: var(--teal);
    box-shadow: 0 0 14px rgba(95, 208, 196, 0.55);
    animation: glow 2.2s ease-in-out infinite;
  }

  .current .label {
    color: var(--ink);
  }

  .maybe .seg {
    border-style: dashed;
  }

  .skipped .seg {
    background: repeating-linear-gradient(
      135deg,
      transparent 0 5px,
      rgba(142, 160, 178, 0.14) 5px 8px
    );
    border-style: dashed;
    opacity: 0.6;
  }

  .skipped .label {
    text-decoration: line-through;
    opacity: 0.7;
  }

  @keyframes glow {
    50% {
      box-shadow: 0 0 4px rgba(95, 208, 196, 0.25);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .current .seg {
      animation: none;
    }
  }
</style>
