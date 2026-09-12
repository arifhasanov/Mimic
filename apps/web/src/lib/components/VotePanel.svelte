<script lang="ts">
  import type { PublicState } from '$lib/types';

  let { gameState }: { gameState: PublicState } = $props();

  const vote = $derived(gameState.vote);
  const nameOf = (id: string) =>
    id === 'SKIP' ? 'Skip' : (gameState.players.find((p) => p.id === id)?.name ?? '?');

  /** Grouped by target, so the monitor reads "who voted for whom" at a glance. */
  const groups = $derived.by(() => {
    if (!vote || !vote.ballots.length) return [];
    const map = new Map<string, string[]>();
    for (const b of vote.ballots) {
      const list = map.get(b.choice) ?? [];
      list.push(nameOf(b.voterId));
      map.set(b.choice, list);
    }
    return [...map.entries()]
      .map(([choice, voters]) => ({ choice, voters }))
      .sort((a, b) => b.voters.length - a.voters.length);
  });

  const scanned = $derived(
    vote?.result?.kind === 'SCAN' ? gameState.players.find((p) => p.id === vote.result!.playerId) : null,
  );

  /** Who is still expected to vote. In a runoff the two candidates are not among them. */
  const voters = $derived(
    vote ? gameState.players.filter((p) => vote.voters.includes(p.id)) : [],
  );

  /** Plain words for the condition the scan is missing, so "no vote" is never a mystery. */
  const skipWhy = $derived.by(() => {
    switch (gameState.voteSkipReason) {
      case 'XRAY_OFFLINE':
        return `The X-ray is offline — ${gameState.repairProgress} of ${gameState.config.repairTarget} repairs done.`;
      case 'NOT_ENOUGH_CELLS':
        return `A scan costs ${gameState.config.scanCostCells} power cells and the pool holds ${gameState.powerCells}.`;
      case 'TOO_FEW_PLAYERS':
        return 'Not enough of the crew left to hold a vote.';
      default:
        return 'The X-ray is charged. The crew votes at the end of this round.';
    }
  });
</script>

<section class="panel">
  <header>
    <span class="eyebrow">{vote?.stage === 'RUNOFF' ? 'Runoff' : 'The vote'}</span>
    {#if vote && !vote.result}
      <span class="progress mono">{vote.voted.length} / {voters.length}</span>
    {/if}
  </header>

  {#if !vote}
    <p class="idle">{skipWhy}</p>
  {:else if !vote.result}
    <p class="idle">
      {#if vote.stage === 'RUNOFF'}
        {vote.candidates.map(nameOf).join(' or ')} — the rest of the crew decides. Neither of
        them votes.
      {:else if gameState.hiddenVotes}
        Ballots are secret and stay secret. Only the result is shown.
      {:else}
        Ballots are secret until the vote closes. Decide out loud.
      {/if}
    </p>
    <div class="dots">
      {#each voters as p (p.id)}
        <span class="dot" class:in={vote.voted.includes(p.id)}>{p.name}</span>
      {/each}
    </div>
  {:else}
    {#if gameState.hiddenVotes}
      <p class="idle">Votes are hidden in this game.</p>
    {/if}
    <div class="tally">
      {#each groups as g (g.choice)}
        <div class="row" class:winner={vote.result?.kind === 'SCAN' && vote.result.playerId === g.choice}>
          <span class="target">{nameOf(g.choice)}</span>
          <span class="count mono">{g.voters.length}</span>
          <span class="voters">{g.voters.join(', ')}</span>
        </div>
      {/each}
    </div>

    <div class="outcome" class:mimic={vote.result.kind === 'SCAN' && vote.result.revealed === 'MIMIC'}>
      {#if vote.result.kind === 'SKIP'}
        No scan. The cells stay in the pool.
      {:else if vote.result.kind === 'TIE'}
        Tied again. No scan, nothing spent.
      {:else if vote.result.kind === 'RUNOFF'}
        Tied — runoff between {vote.result.candidates.map(nameOf).join(' and ')}.
      {:else if vote.result.kind === 'SCAN'}
        <strong>{scanned?.name}</strong>
        {#if vote.result.revealed === 'MIMIC'}
          is a <b>MIMIC</b>. Eliminated.
        {:else}
          is <b>CREW</b>. Verified.
        {/if}
      {/if}
    </div>
  {/if}
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
    min-height: 0;
    padding: 0.9rem 1rem;
    background: var(--hull);
    border: 1px solid var(--line);
    border-radius: 14px;
  }

  header {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
  }

  .progress {
    font-size: 1rem;
    color: var(--ink-dim);
  }

  .idle {
    margin: 0;
    color: var(--ink-faint);
    font-size: 0.85rem;
    line-height: 1.5;
  }

  .dots {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
  }

  .dot {
    padding: 0.15rem 0.55rem;
    border: 1px dashed var(--line-2);
    border-radius: 999px;
    font-size: 0.8rem;
    color: var(--ink-faint);
  }

  .dot.in {
    border-style: solid;
    border-color: var(--teal);
    color: var(--teal);
  }

  .tally {
    display: flex;
    flex-direction: column;
    gap: 0.3rem;
    overflow: hidden;
  }

  .row {
    display: grid;
    grid-template-columns: 7rem 2rem 1fr;
    align-items: baseline;
    gap: 0.5rem;
    padding: 0.3rem 0.5rem;
    border-radius: 8px;
    background: var(--hull-2);
  }

  .row.winner {
    outline: 1px solid var(--amber);
  }

  .target {
    font-weight: 600;
  }

  .count {
    font-size: 1.15rem;
    font-weight: 700;
    text-align: right;
  }

  .voters {
    font-size: 0.78rem;
    color: var(--ink-faint);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .outcome {
    margin-top: auto;
    padding: 0.6rem 0.75rem;
    border-radius: 10px;
    background: rgba(95, 208, 196, 0.08);
    border: 1px solid rgba(95, 208, 196, 0.3);
    font-size: 1rem;
    line-height: 1.4;
  }

  .outcome.mimic {
    background: rgba(255, 107, 61, 0.1);
    border-color: rgba(255, 107, 61, 0.45);
  }

  .outcome b {
    letter-spacing: 0.1em;
  }
</style>
