<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import ConfirmDialog from '$lib/components/ConfirmDialog.svelte';
  import RoundSteps from '$lib/components/RoundSteps.svelte';
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
  /** Which game-ending action is waiting for a yes. */
  let confirmKind = $state<null | 'quit' | 'close'>(null);
  /** Set when this screen ends the game itself, so its own gameClosed echo is ignored. */
  let leaving = false;

  const gameState = $derived(game.state);
  const chat = $derived(game.chat);
  const hasBots = $derived(!!gameState?.players.some((p) => p.isBot));
  const remaining = $derived.by(() => {
    now; // re-run on every tick
    return gameState ? secondsLeft(gameState.phaseEndsAt) : 0;
  });

  /**
   * Manual steps: the server holds Next back for a moment on every new step, and until Act
   * and the ballot have everyone in. Recomputed on the same 250 ms tick as the clock, so no
   * extra broadcast is needed for the button to come alive.
   */
  const stepReady = $derived.by(() => {
    now; // re-run on every tick
    return !gameState?.stepReadyAt || secondsLeft(gameState.stepReadyAt) === 0;
  });
  const waitingFor = $derived.by(() => {
    if (!gameState || stepReady) return 0;
    if (gameState.phase === 'ACT') return Math.max(0, gameState.livingCount - gameState.lockedIn);
    const v = gameState.vote;
    if (gameState.phase === 'VOTE' && v && !v.result)
      return v.voters.filter((id) => !v.voted.includes(id)).length;
    return 0;
  });

  onMount(() => {
    hostToken = loadHost(code) ?? '';
    const socket = getSocket();
    // With a host token this screen can start the game and set the balance; without one it
    // still attaches and shows everything, so a monitor never ends up stuck on a boot screen.
    const attach = () => {
      if (hostToken) socket.emit('rejoin', { code, token: hostToken }, () => {});
      else socket.emit('watch', { code }, () => {});
    };
    game.wire(attach);
    if (socket.connected) attach();

    const t = setInterval(() => (now = Date.now()), 250);

    // Manual steps: Space or the right arrow is Next, so a host at a keyboard (or with a
    // presentation clicker) never has to find the button on the screen.
    const onKey = (e: KeyboardEvent) => {
      if (!gameState?.manualSteps || !hostToken || confirmKind) return;
      if (gameState.phase === 'LOBBY' || gameState.phase === 'GAME_OVER') return;
      // Leave typing and buttons alone. The target is not always an element (a key event
      // can target the window), so check before calling closest().
      if (e.target instanceof Element && e.target.closest('input, select, textarea, button')) return;
      if (e.code === 'Space' || e.key === 'ArrowRight' || e.key === 'PageDown') {
        e.preventDefault();
        if (!e.repeat && stepReady) nextStep();
      }
    };
    window.addEventListener('keydown', onKey);

    return () => {
      clearInterval(t);
      window.removeEventListener('keydown', onKey);
    };
  });

  // The host ended the game from another tab, or this screen is only watching.
  $effect(() => {
    if (game.closed && !leaving) {
      const notice = game.closed;
      game.reset();
      goto('/?notice=' + notice);
    }
  });

  async function nextStep() {
    if (!gameState || !hostToken) return;
    // The step travels with the press, so a double press can never skip a phase.
    await emitAck('hostNext', { code, hostToken, step: gameState.step });
  }

  async function kick(playerId: string) {
    await emitAck('hostKick', { code, hostToken, playerId });
  }

  /** End the game for everyone (if this is the host) and go back to the menu. */
  async function leave() {
    leaving = true;
    confirmKind = null;
    if (hostToken) await emitAck('hostQuit', { code, hostToken });
    game.reset();
    goto('/');
  }

  function backFromLobby() {
    if (!hostToken) return goto('/');
    if (gameState && gameState.players.length > 0) confirmKind = 'close';
    else leave();
  }

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

  /** The step after this one, in the same plain words the header uses for the current one. */
  const nextWords = $derived.by(() => {
    const up = gameState?.upcoming;
    if (!up) return '';
    switch (up.kind) {
      case 'REPORT':
        return 'Round ' + up.round + ' · Ship report';
      case 'VOTE_RESULT':
        return 'Vote result';
      case 'RUNOFF':
        return 'Runoff vote';
      case 'GAME_OVER':
        return 'Game over';
      default:
        return PHASE_WORDS[up.kind];
    }
  });

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
      <div class="invite-head">
        <span class="eyebrow">Room code</span>
        <button class="back" onclick={backFromLobby}>← Main menu</button>
      </div>
      <div class="code mono">{gameState.code}</div>
      <p class="url">Everyone joins at <b>{joinUrl}</b></p>

      <div class="roster">
        <span class="eyebrow">{gameState.players.length} aboard</span>
        <ul>
          {#each gameState.players as p (p.id)}
            <li class:bot={p.isBot} class:offline={!p.connected}>
              <span>{p.name}</span>
              {#if p.isBot}<i class="badge">bot</i>{/if}
              {#if hostToken}
                <button
                  class="kick"
                  title={'Remove ' + p.name}
                  aria-label={'Remove ' + p.name}
                  onclick={() => kick(p.id)}>×</button
                >
              {/if}
            </li>
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
          <button class="ghost" onclick={addBot} disabled={busy}>+ Bot</button>
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
    {#if gameState.manualSteps}
      {#if hostToken}
        <button class="next big" disabled={!stepReady} onclick={nextStep}>NEXT <span>▸</span></button>
        <p class="keyhint">or press Space</p>
      {:else}
        <p class="keyhint">Waiting for the host.</p>
      {/if}
    {:else}
      <div class="bigclock mono">{mmss(remaining)}</div>
    {/if}
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
    <button class="menu" onclick={leave}>← Back to main menu</button>
    <div class="replay" class:two={hasBots}>
      <LogPanel {gameState} rounds={12} mode="log" />
      {#if hasBots}
        <LogPanel {gameState} {chat} mode="chat" reveal />
      {/if}
    </div>
  </main>
{:else}
  <main class="game">
    <header class="bar">
      <div class="left">
        {#if hostToken}
          <button class="quit" title="Quit game" onclick={() => (confirmKind = 'quit')}>✕ Quit</button>
        {/if}
        <div class="roundblock">
          <span class="eyebrow">Round</span>
          <span class="round cond">{gameState.round} <i>of {gameState.config.rounds}</i></span>
        </div>
        <RoundSteps {gameState} />
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
        {#if nextWords}
          <div class="upnext">
            <span class="eyebrow">Next</span>
            <span class="what cond">{nextWords}</span>
          </div>
        {/if}
        {#if gameState.manualSteps}
          {#if hostToken}
            <div class="nextwrap">
              <button class="next" disabled={!stepReady} onclick={nextStep}>NEXT <span>▸</span></button>
              <span class="keyhint">
                {#if stepReady}or Space{:else if waitingFor > 0}waiting for {waitingFor}{:else}…{/if}
              </span>
            </div>
          {:else}
            <span class="keyhint">The host moves on</span>
          {/if}
        {:else}
          <span class="clock mono" class:urgent={remaining <= 10}>{mmss(remaining)}</span>
        {/if}
      </div>
    </header>

    <div class="body">
      <div class="mapwrap">
        <ShipMap {gameState} />
      </div>
      <aside>
        <VotePanel {gameState} />
        <LogPanel {gameState} {chat} />
      </aside>
    </div>

    <StatusStrip {gameState} />
  </main>
{/if}

<ConfirmDialog
  open={confirmKind !== null}
  title={confirmKind === 'quit' ? 'Quit this game?' : 'Close this room?'}
  body={confirmKind === 'quit'
    ? 'The game ends for everyone, nobody wins, and every screen goes back to the main menu.'
    : 'Everyone who has joined is sent back to the main menu.'}
  confirmLabel={confirmKind === 'quit' ? 'Quit game' : 'Close room'}
  onconfirm={leave}
  oncancel={() => (confirmKind = null)}
/>

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
    color: var(--ink-dim);
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .roster .badge {
    font-style: normal;
    font-size: 0.62rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
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
    gap: 1rem;
  }

  .replay.two {
    width: min(96rem, 100%);
  }

  .replay :global(.panel) {
    flex: 1;
    min-width: 0;
  }

  /* -- in-game ----------------------------------------------------------- */

  .game {
    display: grid;
    grid-template-rows: auto 1fr auto;
  }

  .bar {
    display: grid;
    grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
    gap: 1.25rem;
    align-items: center;
    padding: 0.5rem 1.25rem;
    background: var(--hull);
    border: 1px solid var(--line);
    border-radius: 14px;
  }

  .bar .left {
    display: flex;
    align-items: center;
    gap: 1.5rem;
    min-width: 0;
  }

  .roundblock {
    display: flex;
    flex-direction: column;
  }

  .quit {
    background: transparent;
    border: 1px solid var(--line-2);
    border-radius: 9px;
    padding: 0.45rem 0.85rem;
    color: var(--ink-faint);
    font-size: 0.85rem;
    letter-spacing: 0.04em;
  }

  .quit:hover {
    border-color: var(--danger);
    color: var(--danger);
  }

  .nextwrap {
    display: inline-flex;
    align-items: center;
    gap: 0.9rem;
  }

  .next {
    display: inline-flex;
    align-items: center;
    gap: 0.6rem;
    padding: 0.7rem 1.6rem;
    background: rgba(95, 208, 196, 0.1);
    border: 1px solid var(--teal);
    border-radius: 12px;
    color: var(--teal);
    font-size: 1.6rem;
    font-weight: 700;
    letter-spacing: 0.2em;
  }

  .next span {
    letter-spacing: 0;
  }

  .next:disabled {
    background: transparent;
    border-color: var(--line-2);
    color: var(--ink-faint);
  }

  .next.big {
    margin-top: 2.5rem;
    padding: 1rem 2.6rem;
    font-size: 2.4rem;
  }

  .next:focus-visible,
  .back:focus-visible,
  .menu:focus-visible,
  .quit:focus-visible {
    outline: 2px solid var(--teal);
    outline-offset: 3px;
  }

  .keyhint {
    font-size: 0.85rem;
    color: var(--ink-faint);
  }

  .invite-head {
    display: flex;
    align-items: center;
    justify-content: space-between;
  }

  .back,
  .menu {
    background: transparent;
    border: 1px solid var(--line-2);
    border-radius: 9px;
    padding: 0.45rem 0.9rem;
    color: var(--ink-dim);
    font-size: 0.9rem;
  }

  .menu {
    margin-top: 1rem;
    padding: 0.7rem 1.4rem;
    font-size: 1rem;
  }

  .roster li {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
  }

  .roster li.offline {
    opacity: 0.5;
  }

  .kick {
    display: grid;
    place-items: center;
    width: 1.35rem;
    height: 1.35rem;
    margin-right: -0.35rem;
    padding: 0;
    background: transparent;
    border: 1px solid var(--line-2);
    border-radius: 50%;
    color: var(--ink-faint);
    font-size: 0.95rem;
    line-height: 1;
  }

  .kick:hover {
    border-color: var(--danger);
    color: var(--danger);
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
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 1.75rem;
    min-width: 0;
  }

  .upnext {
    display: flex;
    flex-direction: column;
    align-items: flex-end;
    min-width: 0;
  }

  .upnext .what {
    max-width: 100%;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-size: 1.45rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: var(--ink-dim);
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

  /* container-type: size lets the map fit itself to this box with container units, and
     stops the map's own size from feeding back into the grid row it sits in. */
  .mapwrap {
    min-height: 0;
    min-width: 0;
    display: grid;
    place-items: center;
    container-type: size;
  }

  aside {
    display: grid;
    grid-template-rows: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: 1rem;
    min-height: 0;
  }
</style>
