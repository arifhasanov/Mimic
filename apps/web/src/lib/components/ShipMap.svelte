<script lang="ts">
  import HazardOverlay from './HazardOverlay.svelte';
  import XrayAssembly from './XrayAssembly.svelte';
  import { ROOM_NAMES, ROOM_ORDER, shipMap } from '$lib/shipMap.config';
  import type { PublicState, RoomId } from '$lib/types';

  let { gameState }: { gameState: PublicState } = $props();

  /**
   * `?hotspots` outlines every room box over the art. The hotspots are the one thing that
   * has to be re-measured by eye when the art is swapped, so the tool for doing it ships
   * with the app rather than living in someone's scratch file.
   */
  const debugHotspots =
    typeof location !== 'undefined' && new URLSearchParams(location.search).has('hotspots');

  /**
   * The engine flames sit left of the art. Each is as long as its nozzle is tall times the
   * frame's shape, and the map leaves room for the longest so none runs off the screen.
   */
  const thrusters = shipMap.thrusters;
  const flameWidth = (h: number) =>
    (h * thrusters.span * thrusters.frameAspect * thrusters.stretch) / shipMap.aspect;
  const plume =
    Math.max(0, ...thrusters.nozzles.map((n) => flameWidth(n.h) - n.x - thrusters.tuck)) / 100;

  const reactor = shipMap.reactor;

  const roomState = $derived(
    Object.fromEntries(gameState.rooms.map((r) => [r.id, r])) as Record<
      RoomId,
      { id: RoomId; broken: boolean; fuse: number | null }
    >,
  );

  const reportByRoom = $derived(
    Object.fromEntries((gameState.lastReport?.rooms ?? []).map((r) => [r.room, r])),
  );

  /**
   * The report is a snapshot taken at resolve time, so its `broken, fuse N` text is a round
   * out of date once the next REPORT phase ticks the fuse. The live fuse is on the badge
   * right next to it, so that segment is dropped here rather than shown twice and disagreeing.
   */
  const summaryFor = (room: RoomId): string => {
    const report = reportByRoom[room];
    if (!report) return '';
    return report.summary
      .split(' · ')
      .filter((bit) => !bit.startsWith('broken, fuse'))
      .join(' · ');
  };

  // During ACT the map must give away nothing about what anyone is choosing.
  const hideOccupants = $derived(gameState.phase === 'ACT' || gameState.phase === 'LOBBY');

  const occupants = $derived.by(() => {
    const out = {} as Record<RoomId, PublicState['players']>;
    for (const r of ROOM_ORDER) out[r] = [];
    if (hideOccupants) return out;
    for (const p of gameState.players) if (p.room) out[p.room].push(p);
    return out;
  });

  const initials = (n: string) =>
    n
      .split(/\s+/)
      .map((w) => w[0])
      .join('')
      .slice(0, 2)
      .toUpperCase();
</script>

<div class="map" style="--aspect: {shipMap.aspect}; --plume: {plume}">
  <!-- Each flame starts on a different frame, so the four never pulse together. -->
  {#each thrusters.nozzles as n, i (i)}
    <div
      class="sprite flame"
      aria-hidden="true"
      style="right: {100 - n.x - thrusters.tuck}%; top: {n.y}%; width: {flameWidth(n.h)}%; height: {n.h *
        thrusters.span}%; background-image: url({thrusters.image}); --frames: {thrusters.frames}; --loop: {thrusters.frames /
        thrusters.fps}s; animation-delay: {-((i * 5) % thrusters.frames) / thrusters.fps}s"
    ></div>
  {/each}

  <img src={shipMap.image} alt="" class="art" />
  <XrayAssembly
    progress={gameState.repairProgress}
    target={gameState.config.repairTarget}
    online={gameState.xrayOnline}
    powerCells={gameState.powerCells}
    scanCost={gameState.config.scanCostCells}
  />

  <div
    class="sprite core"
    class:broken={roomState.reactor?.broken}
    aria-hidden="true"
    style="left: {reactor.glass.x}%; top: {reactor.glass.y}%; width: {reactor.glass.w}%; height: {reactor
      .glass.h}%; background-image: url({reactor.image}); --frames: {reactor.frames}; --loop: {reactor.frames /
      reactor.fps}s"
  ></div>

  {#if shipMap.crossPipe.draw}
    <svg class="pipes" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
      <line
        x1={shipMap.crossPipe.from.x}
        y1={shipMap.crossPipe.from.y}
        x2={shipMap.crossPipe.to.x}
        y2={shipMap.crossPipe.to.y}
        stroke="var(--line-2)"
        stroke-width="1.2"
        stroke-linecap="round"
      />
    </svg>
  {/if}

  {#each ROOM_ORDER as id (id)}
    {@const box = shipMap.rooms[id]}
    {@const room = roomState[id]}
    {@const report = reportByRoom[id]}
    <div
      class="room"
      class:broken={room?.broken}
      class:debug={debugHotspots}
      style="left:{box.x}%; top:{box.y}%; width:{box.w}%; height:{box.h}%"
    >
      {#if room?.broken}
        <HazardOverlay id={id} fuse={room.fuse} />
      {/if}

      <div class="plate">
        <span class="name cond">{ROOM_NAMES[id]}</span>
        {#if report && !hideOccupants && summaryFor(id)}
          <span class="summary mono">{summaryFor(id)}</span>
        {/if}
      </div>

      <div class="crew">
        {#each occupants[id] as p (p.id)}
          <div
            class="chip"
            class:verified={p.verified}
            class:dead={!p.alive}
            title={p.name}
          >
            <span class="badge">{initials(p.name)}</span>
            <span class="who">{p.name}</span>
          </div>
        {/each}
      </div>
    </div>
  {/each}

  {#if hideOccupants && gameState.phase === 'ACT'}
    <div class="locked-banner">
      <span class="eyebrow">Locked in</span>
      <span class="count mono">{gameState.lockedIn} <i>/ {gameState.livingCount}</i></span>
    </div>
  {/if}
</div>

<style>
  /* Contain-fit: as wide as the box allows, unless that would make it taller than the box.
     Container units read the parent's size, so this holds on any screen shape — the ship
     can never spill onto the status strip below it. The parent sets container-type.
     The left margin is the engine flames' room, so they never run off the screen either. */
  .map {
    --w: min(calc(100cqw / (1 + var(--plume))), calc(100cqh * var(--aspect)));
    position: relative;
    aspect-ratio: var(--aspect);
    width: var(--w);
    margin-left: calc(var(--w) * var(--plume));
  }

  .art {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: contain;
    filter: saturate(0.92) brightness(0.92);
  }

  /* A strip of --frames frames side by side, played once every --loop. */
  .sprite {
    position: absolute;
    background-repeat: no-repeat;
    background-size: calc(var(--frames) * 100%) 100%;
    animation: play var(--loop) steps(var(--frames)) infinite;
    pointer-events: none;
  }

  /* Before the art in the markup, so the art paints over the end of each flame. */
  .flame {
    transform: translateY(-50%);
  }

  /* After the art, over the glass of the core; toned like the art so it matches. A broken
     Reactor stops on its dimmest frame and fades down, so it reads as down from the sofa. */
  .core {
    filter: saturate(0.92) brightness(0.92);
    transition: filter 0.8s ease;
  }

  .core.broken {
    animation: none;
    filter: saturate(0.5) brightness(0.4);
  }

  @keyframes play {
    to {
      background-position-x: calc(100% * var(--frames) / (var(--frames) - 1));
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .sprite {
      animation: none;
    }
  }

  .pipes {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
  }

  .room.debug {
    outline: 2px dashed rgba(95, 208, 196, 0.9);
    background: rgba(95, 208, 196, 0.08);
  }

  .room {
    position: absolute;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: flex-start;
    gap: 0.35rem;
    padding: 0.4rem;
    border-radius: 14px;
  }

  .plate {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    padding: 0.15rem 0.7rem 0.25rem;
    background: rgba(5, 7, 11, 0.72);
    border: 1px solid rgba(52, 68, 90, 0.7);
    border-radius: 999px;
    backdrop-filter: blur(3px);
    white-space: nowrap;
    z-index: 2;
  }

  .name {
    font-size: 1.4rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    line-height: 1.1;
  }

  .summary {
    font-size: 0.82rem;
    color: var(--teal);
    line-height: 1.1;
  }

  .broken .summary {
    color: var(--hazard);
  }

  .crew {
    display: flex;
    flex-wrap: wrap;
    align-content: flex-start;
    justify-content: center;
    gap: 0.3rem 0.35rem;
    z-index: 2;
    overflow: hidden;
  }

  .chip {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    padding: 0.15rem 0.6rem 0.15rem 0.15rem;
    background: rgba(5, 7, 11, 0.85);
    border: 1px solid var(--line-2);
    border-radius: 999px;
  }

  .badge {
    display: grid;
    place-items: center;
    width: 1.7rem;
    height: 1.7rem;
    border-radius: 50%;
    background: var(--hull-2);
    border: 1px solid var(--line-2);
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .who {
    font-size: 0.9rem;
    font-weight: 500;
  }

  .chip.verified {
    border-color: var(--verified);
  }

  .chip.verified .badge {
    border-color: var(--verified);
    color: var(--verified);
  }

  .chip.dead {
    opacity: 0.45;
  }

  .chip.dead .who {
    text-decoration: line-through;
  }

  .locked-banner {
    position: absolute;
    left: 50%;
    bottom: 2%;
    transform: translateX(-50%);
    display: flex;
    align-items: baseline;
    gap: 0.9rem;
    padding: 0.5rem 1.6rem;
    background: rgba(5, 7, 11, 0.85);
    border: 1px solid var(--line-2);
    border-radius: 999px;
  }

  .locked-banner .count {
    font-size: 2rem;
    font-weight: 700;
  }

  .locked-banner .count i {
    font-style: normal;
    color: var(--ink-faint);
    font-size: 1.3rem;
  }
</style>
