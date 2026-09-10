<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import Starfield from '$lib/components/Starfield.svelte';
  import ShipMap from '$lib/components/ShipMap.svelte';
  import StatusStrip from '$lib/components/StatusStrip.svelte';
  import VotePanel from '$lib/components/VotePanel.svelte';
  import LogPanel from '$lib/components/LogPanel.svelte';
  import HostSettings from '$lib/components/HostSettings.svelte';
  import { game, mmss, noteServerNow, PHASE_WORDS, secondsLeft } from '$lib/game.svelte';
  import { emitAck, getSocket, loadHost } from '$lib/socket';

  const code = $derived((page.params.code ?? '').toUpperCase());

  let hostToken = $state('');
  let error = $state('');
  let now = $state(Date.now());
  let busy = $state(false);

  const gameState = $derived(game.state);
  const remaining = $derived.by(() => {
    now; // re-run on every tick
    return gameState ? secondsLeft(gameState.phaseEndsAt) : 0;
  });

  onMount(() => {
    hostToken = loadHost(code) ?? '';
    const socket = getSocket();
    // With a host token this screen can start the game and set the balance; without one it
    // still attaches and shows everything, so a TV never ends up stuck on a boot screen.
    const attach = () => {
      if (hostToken) socket.emit('rejoin', { code, token: hostToken }, () => {});
      else socket.emit('watch', { code }, () => {});
    };
    game.wire(attach);
    if (socket.connected) attach();

    const t = setInterval(() => (now = Date.now()), 250);
    return () => clearInterval(t);
  });

  $effect(() => {
    if (gameState) noteServerNow(gameState.serverNow);
  });

  async function start() {
    busy = true;
    const res = await emitAck<{ ok: boolean; error?: string }>('hostStart', { code, hostToken });
    busy = false;
    if (!res.ok) error = res.error ?? 'Could not start.';
  }

  async function addBot() {
    busy = true;
    await emitAck('hostAddBot', { code, hostToken });
    busy = false;
  }

  const joinUrl = $derived(typeof location !== 'undefined' ? location.origin : '');

  const winnerLine = $derived.by(() => {
    if (!gameState?.winner) return '';
    const reasons: Record<string, string> = {
      HULL_BREACH: 'A fuse burned out. The ship is gone.',
      ALL_MIMICS_FOUND: 'Every Mimic was found and scanned.',
      REACHED_THE_RELAY: 'The ship reached the relay with a Mimic still aboard.',
    };
    return reasons[gameState.winReason ?? ''] ?? '';
  });
</script>

<Starfield density={1} speed={1} />

{#if !gameState}
  <div class="boot">
    <h1 class="cond">MIMIC</h1>
    <p>{game.connected ? 'Looking for game ' + code + '…' : 'Connecting…'}</p>
    {#if !hostToken}
      <p class="warn">
        This browser is not the host of {code}. It will show the game, but cannot start it.
      </p>
    {/if}
  </div>
{:else if gameState.phase === 'LOBBY'}
  <main class="lobby">
    <section class="invite">
      <span class="eyebrow">Room code</span>
      <div class="code mono">{gameState.code}</div>
      <p class="url">Everyone joins at <b>{joinUrl}</b></p>

      <div class="roster">
        <span class="eyebrow">{gameState.players.length} aboard</span>
        <ul>
          {#each gameState.players as p (p.id)}
            <li class:bot={p.name.startsWith('Bot ')}>{p.name}</li>
          {:else}
            <li class="empty">Nobody yet.</li>
          {/each}
        </ul>
      </div>

      {#if hostToken}
        <div class="actions">
          <button class="start" onclick={start} disabled={busy || gameState.players.length < 3}>
            START
          </button>
          <button class="ghost" onclick={addBot} disabled={busy}>+ Bot <i>(dev)</i></button>
        </div>
      {:else}
        <p class="warn">Watching only — the host screen has the START button.</p>
      {/if}
      {#if error}<p class="warn">{error}</p>{/if}
      {#if gameState.players.length < 3}
        <p class="hint">Needs at least 3 to start. Six is the recommended minimum.</p>
      {/if}
      <p class="hint summary">{gameState.settingsLine}</p>
    </section>

    <section class="config">
      {#if hostToken}
        <HostSettings {gameState} {hostToken} />
      {:else}
        <p class="hint">{gameState.settingsLine}</p>
      {/if}
    </section>
  </main>
{:else if gameState.phase === 'ROLES'}
  <main class="centred">
    <span class="eyebrow">Round 1 is about to begin</span>
    <h2 class="cond huge">Look at your phone</h2>
    <p class="lead">Hold the card to see who you are. Do not let a neighbour see it.</p>
    <div class="bigclock mono">{mmss(remaining)}</div>
  </main>
{:else if gameState.phase === 'GAME_OVER'}
  <main class="centred over">
    <span class="eyebrow">Game over</span>
    <h2 class="cond huge" class:crew={gameState.winner === 'CREW'} class:mimic={gameState.winner === 'MIMIC'}>
      {gameState.winner === 'CREW' ? 'The crew survives' : 'The Mimics win'}
    </h2>
    <p class="lead">{winnerLine}</p>

    <div class="reveal">
      {#each gameState.players as p (p.id)}
        <div class="card" class:mimic={p.revealed === 'MIMIC'}>
          <span class="who">{p.name}</span>
          <span class="role mono">{p.revealed}</span>
        </div>
      {/each}
    </div>

    <p class="hint summary">{gameState.settingsLine}</p>
    <div class="replay">
      <LogPanel {gameState} rounds={12} />
    </div>
  </main>
{:else}
  <main class="game">
    <header class="bar">
      <div class="left">
        <span class="eyebrow">Round</span>
        <span class="round cond">{gameState.round} <i>of {gameState.config.rounds}</i></span>
      </div>
      <div class="middle">
        <h2 class="cond phase">{PHASE_WORDS[gameState.phase]}</h2>
        {#if gameState.phase === 'TALK'}
          <p class="sub">Phones down. Work out who is lying.</p>
        {:else if gameState.phase === 'ACT'}
          <p class="sub">Room, focus, button, lock in.</p>
        {/if}
      </div>
      <div class="right">
        <span class="clock mono" class:urgent={remaining <= 10}>{mmss(remaining)}</span>
      </div>
    </header>

    <div class="body">
      <div class="mapwrap">
        <ShipMap {gameState} />
      </div>
      <aside>
        <VotePanel {gameState} />
        <LogPanel {gameState} />
      </aside>
    </div>

    <StatusStrip {gameState} />
  </main>
{/if}

<style>
  main {
    position: relative;
    z-index: 1;
    height: 100dvh;
    padding: 1rem 1.25rem 1.1rem;
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    overflow: hidden;
  }

  .boot {
    position: relative;
    z-index: 1;
    height: 100dvh;
    display: grid;
    place-content: center;
    text-align: center;
    gap: 0.5rem;
  }

  .boot h1 {
    font-size: 5rem;
    margin: 0;
    letter-spacing: 0.16em;
  }

  .warn {
    color: var(--danger);
    font-size: 0.95rem;
  }

  /* -- lobby ------------------------------------------------------------- */

  .lobby {
    display: grid;
    grid-template-columns: minmax(24rem, 34%) 1fr;
    gap: 1.25rem;
    align-items: stretch;
  }

  .invite,
  .config {
    background: var(--hull);
    border: 1px solid var(--line);
    border-radius: 16px;
    padding: 1.5rem 1.75rem;
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    min-height: 0;
  }

  .code {
    font-size: 6.5rem;
    line-height: 1;
    font-weight: 700;
    letter-spacing: 0.16em;
    text-indent: 0.16em;
    color: var(--teal);
    text-shadow: 0 0 48px rgba(95, 208, 196, 0.35);
  }

  .url {
    margin: 0;
    color: var(--ink-dim);
    font-size: 1rem;
  }

  .url b {
    color: var(--ink);
  }

  .roster {
    flex: 1;
    min-height: 0;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .roster ul {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-wrap: wrap;
    gap: 0.4rem;
    align-content: flex-start;
    overflow: hidden;
  }

  .roster li {
    padding: 0.35rem 0.85rem;
    border: 1px solid var(--line-2);
    border-radius: 999px;
    font-size: 1.05rem;
  }

  .roster li.bot {
    border-style: dashed;
    color: var(--ink-faint);
  }

  .roster li.empty {
    border: 0;
    color: var(--ink-faint);
    padding-left: 0;
  }

  .actions {
    display: flex;
    gap: 0.75rem;
    align-items: center;
  }

  .start {
    flex: 1;
    padding: 1rem;
    font-size: 1.3rem;
    font-weight: 700;
    letter-spacing: 0.3em;
    text-indent: 0.3em;
    background: var(--hull-2);
    border: 1px solid var(--teal);
    border-radius: 12px;
    color: var(--teal);
  }

  .start:disabled {
    border-color: var(--line);
    color: var(--ink-faint);
  }

  .ghost {
    background: transparent;
    border: 1px solid var(--line);
    border-radius: 10px;
    padding: 0.65rem 1rem;
    color: var(--ink-dim);
    font-size: 0.9rem;
  }

  .ghost i {
    font-style: normal;
    color: var(--ink-faint);
    font-size: 0.75rem;
  }

  .hint {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ink-faint);
  }

  .hint.summary {
    color: var(--ink-dim);
  }

  /* -- interstitials ----------------------------------------------------- */

  .centred {
    align-items: center;
    justify-content: center;
    text-align: center;
  }

  .huge {
    margin: 0.3rem 0 0;
    font-size: 5rem;
    line-height: 1;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .huge.crew {
    color: var(--teal);
  }

  .huge.mimic {
    color: var(--danger);
  }

  .lead {
    margin: 0.75rem 0 0;
    font-size: 1.35rem;
    color: var(--ink-dim);
  }

  .bigclock {
    margin-top: 2rem;
    font-size: 7rem;
    line-height: 1;
    font-weight: 700;
    color: var(--ink-faint);
  }

  .over {
    justify-content: flex-start;
    padding-top: 2.5rem;
    gap: 0.5rem;
  }

  .reveal {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.6rem;
    margin: 1.5rem 0 0.5rem;
  }

  .reveal .card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.6rem 1.1rem;
    background: var(--hull);
    border: 1px solid var(--line-2);
    border-radius: 12px;
  }

  .reveal .card.mimic {
    border-color: var(--danger);
    background: rgba(255, 107, 61, 0.08);
  }

  .reveal .who {
    font-size: 1.15rem;
    font-weight: 600;
  }

  .reveal .role {
    font-size: 0.78rem;
    letter-spacing: 0.18em;
    color: var(--ink-faint);
  }

  .reveal .card.mimic .role {
    color: var(--danger);
  }

  .replay {
    width: min(70rem, 100%);
    margin-top: 1rem;
    min-height: 0;
    display: flex;
  }

  .replay :global(.panel) {
    flex: 1;
  }

  /* -- in-game ----------------------------------------------------------- */

  .game {
    display: grid;
    grid-template-rows: auto 1fr auto;
  }

  .bar {
    display: grid;
    grid-template-columns: 1fr auto 1fr;
    align-items: center;
    padding: 0.5rem 1.25rem;
    background: var(--hull);
    border: 1px solid var(--line);
    border-radius: 14px;
  }

  .bar .left {
    display: flex;
    flex-direction: column;
  }

  .round {
    font-size: 2.1rem;
    line-height: 1;
    font-weight: 700;
  }

  .round i {
    font-style: normal;
    font-size: 1.1rem;
    color: var(--ink-faint);
  }

  .middle {
    text-align: center;
  }

  .phase {
    margin: 0;
    font-size: 2.6rem;
    line-height: 1;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .sub {
    margin: 0.2rem 0 0;
    font-size: 0.9rem;
    color: var(--ink-faint);
  }

  .right {
    text-align: right;
  }

  .clock {
    font-size: 3.6rem;
    line-height: 1;
    font-weight: 700;
  }

  .clock.urgent {
    color: var(--amber);
  }

  .body {
    display: grid;
    grid-template-columns: 1fr minmax(20rem, 23%);
    gap: 1rem;
    min-height: 0;
  }

  .mapwrap {
    min-height: 0;
    display: grid;
    place-items: center;
  }

  .mapwrap :global(.map) {
    max-width: 100%;
    max-height: 100%;
  }

  aside {
    display: grid;
    grid-template-rows: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: 1rem;
    min-height: 0;
  }
</style>
