<script lang="ts">
  import type { PublicState } from '$lib/types';

  let { gameState }: { gameState: PublicState } = $props();

  const target = $derived(gameState.config.repairTarget);
  const segments = $derived(Array.from({ length: target }, (_, i) => i < gameState.repairProgress));
  const canScan = $derived(gameState.xrayOnline && gameState.powerCells >= gameState.config.scanCostCells);
</script>

<div class="strip">
  <div class="block repair" class:online={gameState.xrayOnline}>
    <span class="eyebrow">X-ray repair</span>
    <div class="track">
      {#each segments as filled, i (i)}
        <span class="seg" class:filled></span>
      {/each}
    </div>
    <span class="note mono">
      {#if gameState.xrayOnline}ONLINE{:else}{gameState.repairProgress} / {target}{/if}
    </span>
  </div>

  <div class="block">
    <span class="eyebrow">Scrap</span>
    <span class="big mono">{gameState.scrap}</span>
    <span class="note">for repairs</span>
  </div>

  <div class="block" class:ready={canScan}>
    <span class="eyebrow">Power cells</span>
    <span class="big mono">{gameState.powerCells}</span>
    <span class="note">
      {#if gameState.xrayOnline}
        scan costs {gameState.config.scanCostCells}
      {:else}
        cap {gameState.config.reactorCapCells} / round
      {/if}
    </span>
  </div>

  <div class="block wide">
    <span class="eyebrow">Crew</span>
    <div class="roster">
      {#each gameState.players as p (p.id)}
        <span
          class="pill"
          class:verified={p.verified}
          class:dead={!p.alive}
          class:offline={!p.connected}
        >
          {p.name}{#if p.verified}<i class="tick">✓</i>{/if}{#if !p.alive}<i class="tick">MIMIC</i>{/if}
        </span>
      {/each}
    </div>
  </div>
</div>

<style>
  .strip {
    display: flex;
    align-items: stretch;
    gap: 1px;
    background: var(--line);
    border: 1px solid var(--line);
    border-radius: 14px;
    overflow: hidden;
  }

  .block {
    flex: 0 0 auto;
    min-width: 9.5rem;
    padding: 0.65rem 1.1rem 0.7rem;
    background: var(--hull);
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    justify-content: center;
  }

  .block.wide {
    flex: 1;
    min-width: 0;
  }

  .big {
    font-size: 2.4rem;
    line-height: 1;
    font-weight: 700;
  }

  .note {
    font-size: 0.75rem;
    color: var(--ink-faint);
  }

  .ready .big {
    color: var(--teal);
  }

  .repair {
    min-width: 16rem;
  }

  .track {
    display: flex;
    gap: 0.3rem;
    margin: 0.25rem 0 0.15rem;
  }

  .seg {
    flex: 1;
    height: 1.5rem;
    border-radius: 4px;
    background: var(--hull-2);
    border: 1px solid var(--line-2);
  }

  .seg.filled {
    background: linear-gradient(180deg, #7de3d6, var(--teal));
    border-color: var(--teal);
    box-shadow: 0 0 12px rgba(95, 208, 196, 0.35);
  }

  .repair.online .note {
    color: var(--teal);
    font-weight: 700;
    letter-spacing: 0.18em;
  }

  .roster {
    display: flex;
    flex-wrap: wrap;
    gap: 0.3rem;
    align-content: center;
    max-height: 4.2rem;
    overflow: hidden;
  }

  .pill {
    display: inline-flex;
    align-items: center;
    gap: 0.3rem;
    padding: 0.2rem 0.6rem;
    border: 1px solid var(--line-2);
    border-radius: 999px;
    font-size: 0.85rem;
  }

  .pill.verified {
    border-color: var(--verified);
    color: var(--verified);
  }

  .pill.dead {
    opacity: 0.5;
    border-color: var(--danger);
    color: var(--danger);
    text-decoration: line-through;
  }

  .pill.offline {
    opacity: 0.4;
    border-style: dashed;
  }

  .tick {
    font-style: normal;
    font-size: 0.65rem;
    letter-spacing: 0.1em;
  }
</style>
