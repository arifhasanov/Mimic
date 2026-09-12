<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import ActFlow from '$lib/components/ActFlow.svelte';
  import VoteFlow from '$lib/components/VoteFlow.svelte';
  import SpectatorView from '$lib/components/SpectatorView.svelte';
  import { game } from '$lib/game.svelte';
  import { emitAck, getSocket, loadSession, clearSession } from '$lib/socket';
  import type { ActionButton, RoomId } from '$lib/types';

  const session = loadSession();

  let selfId = $state(session?.playerId ?? '');
  let held = $state(false);
  let locked = $state(false);
  let voted = $state(false);
  /** Per player, per round. Shuffles the button pair and the focus tiles. */
  let seed = $state(Math.floor(Math.random() * 2 ** 31));

  const gameState = $derived(game.state);
  const me = $derived(gameState?.players.find((p) => p.id === selfId) ?? null);
  const brokenRooms = $derived((gameState?.rooms ?? []).filter((r) => r.broken).map((r) => r.id));
  /** A runoff candidate does not vote on themselves — the rest of the table decides. */
  const onTheBallot = $derived(
    !!gameState?.vote && !gameState.vote.result && !gameState.vote.voters.includes(selfId),
  );
  /** One skip per player for the whole game; the server tells this phone whether it has it. */
  const canSkip = $derived((gameState?.vote?.allowSkip ?? false) && (game.voteInfo?.skipAvailable ?? true));

  /** Crew mottos are filler: the card must have the same line count and roughly the same
      length for both roles, so a neighbour learns nothing from the shape of the text. */
  const MOTTOS = [
    'Trust the log, not the loudest voice.',
    'Count the scrap before you count the lies.',
    'Every empty room is somebody’s alibi.',
    'The ship does not break itself.',
    'Watch the hands, not the face.',
  ];
  const motto = MOTTOS[Math.floor(Math.random() * MOTTOS.length)];

  /** Back to the join screen, forgetting this game. */
  function toMenu(notice?: string) {
    clearSession();
    game.reset();
    goto(notice ? '/?notice=' + notice : '/');
  }

  // The host ended the game or removed this player.
  $effect(() => {
    if (game.closed) toMenu(game.closed);
  });

  onMount(() => {
    if (!session) {
      goto('/');
      return;
    }
    const socket = getSocket();
    const rejoin = () =>
      socket.emit('rejoin', { code: session.code, token: session.token }, (ack: any) => {
        if (ack && ack.ok === false) {
          clearSession();
          goto('/');
        } else if (ack?.playerId) {
          selfId = ack.playerId;
        }
      });
    game.wire(rejoin);
    if (socket.connected) rejoin();
  });

  // A fresh round means a fresh shuffle and a fresh lock.
  let lastRound = $state(-1);
  let lastPhase = $state('');
  /**
   * One ballot per key. A runoff opens a *second* ballot inside the same VOTE phase, so
   * watching the phase alone left this phone on "Locked in" with the runoff names never
   * shown — the stage has to be part of the key.
   */
  let lastBallot = $state('');
  $effect(() => {
    if (!gameState) return;
    if (gameState.round !== lastRound) {
      lastRound = gameState.round;
      seed = Math.floor(Math.random() * 2 ** 31);
    }
    if (gameState.phase !== lastPhase) {
      lastPhase = gameState.phase;
      if (gameState.phase === 'ACT') locked = false;
    }
    const ballot = gameState.vote ? gameState.round + ':' + gameState.vote.stage : '';
    if (ballot !== lastBallot) {
      lastBallot = ballot;
      voted = false;
    }
  });

  // Keep the screen awake during ACT and VOTE so nobody's phone wakes at a different
  // moment than everyone else's. Released otherwise, so phones dim normally during TALK.
  let wakeLock: any = null;
  $effect(() => {
    const wants = gameState?.phase === 'ACT' || gameState?.phase === 'VOTE';
    const nav = navigator as any;
    if (wants && !wakeLock && nav.wakeLock?.request) {
      nav.wakeLock
        .request('screen')
        .then((l: any) => (wakeLock = l))
        .catch(() => {});
    } else if (!wants && wakeLock) {
      wakeLock.release?.().catch?.(() => {});
      wakeLock = null;
    }
  });

  async function submitAction(choice: { room: RoomId; focus: RoomId; action: ActionButton }) {
    // The acknowledgement is the same for a crew member and a Mimic, so nothing is shown
    // from it beyond moving to the Locked screen.
    await emitAck('submitAction', { token: session!.token, ...choice });
    locked = true;
  }

  async function submitBallot(choice: string) {
    const res = await emitAck<{ ok: boolean }>('submitBallot', { token: session!.token, choice });
    // A refused ballot — a spent skip, a name that is no longer on it — leaves the phone on
    // the flow so the player can choose again, rather than on a Locked-in screen that lies.
    voted = res.ok !== false;
  }
</script>

<main>
  {#if !game.connected}
    <div class="pad"><p class="say">Reconnecting…</p></div>
  {:else if !gameState || !me}
    <div class="pad"><p class="say">Loading…</p></div>
  {:else if gameState.phase === 'LOBBY'}
    <div class="pad">
      <p class="say">You're in.</p>
      <p class="sub">Look at the monitor.</p>
      <p class="tag mono">{me.name} · {gameState.code}</p>
    </div>
  {:else if gameState.phase === 'ROLES'}
    <div class="pad">
      <p class="sub top">Hold the card. Cover it with your other hand.</p>
      <button
        class="card"
        onpointerdown={() => (held = true)}
        onpointerup={() => (held = false)}
        onpointerleave={() => (held = false)}
        oncontextmenu={(e) => e.preventDefault()}
      >
        {#if held && game.roleCard}
          <span class="line one">You are {game.roleCard.role === 'MIMIC' ? 'a MIMIC' : 'CREW'}.</span>
          <span class="line two">
            {#if game.roleCard.role === 'MIMIC'}
              {game.roleCard.mimicTeammates?.length
                ? 'With you: ' + game.roleCard.mimicTeammates.join(', ') + '.'
                : 'You are the only one. Good luck.'}
            {:else}
              {motto}
            {/if}
          </span>
        {:else}
          <span class="hold">HOLD TO REVEAL</span>
        {/if}
      </button>
    </div>
  {:else if !me.alive}
    <SpectatorView spectator={game.spectator} />
  {:else if gameState.phase === 'ACT' && !locked && game.actOptions}
    <div class="flowpad">
      <ActFlow options={game.actOptions} {seed} {brokenRooms} onsubmit={submitAction} />
    </div>
  {:else if gameState.phase === 'ACT'}
    <div class="pad">
      <p class="say">Locked in.</p>
      <p class="sub">Look at the monitor.</p>
      <button class="change" onclick={() => (locked = false)}>CHANGE</button>
    </div>
  {:else if gameState.phase === 'VOTE' && onTheBallot}
    <div class="pad">
      <p class="say">You are on the ballot.</p>
      <p class="sub">The rest of the crew decides. Talk, do not vote.</p>
    </div>
  {:else if gameState.phase === 'VOTE' && !voted && !gameState.vote?.result}
    <div class="flowpad">
      <VoteFlow {gameState} {selfId} skipAvailable={canSkip} onsubmit={submitBallot} />
    </div>
  {:else if gameState.phase === 'VOTE'}
    <div class="pad">
      <p class="say">{voted ? 'Locked in.' : 'Votes are in.'}</p>
      <p class="sub">Look at the monitor.</p>
    </div>
  {:else if gameState.phase === 'GAME_OVER'}
    <div class="pad">
      <p class="say">Game over.</p>
      <p class="sub">Look at the monitor.</p>
      <button class="change" onclick={() => toMenu()}>MAIN MENU</button>
    </div>
  {:else}
    <div class="pad">
      <p class="say">Look at the monitor.</p>
    </div>
  {/if}
</main>

<style>
  /* Portrait only. Everything the thumb touches lives in the lower half of the screen so
     the phone can be held low, in the lap, tilted toward the body. */
  /* Grey on black, deliberately: easy to read at thirty centimetres, hard to read from the
     next seat (phone spec section 7). The palette is redefined for this page only, so every
     component on the phone — tiles, role card, spectator list — picks it up. */
  main {
    --ink: #a7b1bb;
    --ink-dim: #8a95a0;
    --ink-faint: #69737e;
    color: var(--ink);
    height: 100dvh;
    max-width: 30rem;
    margin: 0 auto;
    padding: 1.25rem 1.1rem 1.5rem;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    filter: brightness(0.92);
  }

  .pad {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    text-align: center;
  }

  .flowpad {
    flex: 1;
    min-height: 0;
  }

  .say {
    margin: 0;
    font-size: 1.5rem;
    font-weight: 500;
    color: var(--ink-dim);
  }

  .sub {
    margin: 0;
    font-size: 0.95rem;
    color: var(--ink-faint);
  }

  .sub.top {
    position: absolute;
    top: 3rem;
    left: 0;
    right: 0;
    padding: 0 1.5rem;
  }

  .sub.quiet {
    margin-top: auto;
    text-align: center;
  }

  .tag {
    margin-top: 1.5rem;
    font-size: 0.8rem;
    color: var(--ink-faint);
    letter-spacing: 0.1em;
  }

  /* The role card: same size, same layout, same font, same line count for both roles. */
  .card {
    margin-top: auto;
    width: 100%;
    max-width: 20rem;
    height: 11rem;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.6rem;
    padding: 1.25rem;
    background: var(--hull);
    border: 1px solid var(--line-2);
    border-radius: 16px;
    color: var(--ink-dim);
    -webkit-tap-highlight-color: transparent;
    -webkit-user-select: none;
    user-select: none;
    touch-action: none;
  }

  .hold {
    font-size: 0.78rem;
    letter-spacing: 0.28em;
    color: var(--ink-faint);
  }

  .line {
    display: block;
    text-align: center;
    line-height: 1.4;
  }

  .line.one {
    font-size: 1rem;
    font-weight: 600;
    color: var(--ink);
  }

  .line.two {
    font-size: 0.85rem;
    color: var(--ink-dim);
  }

  .change {
    margin-top: 2.5rem;
    background: var(--hull);
    border: 1px solid var(--line-2);
    border-radius: 12px;
    padding: 0.85rem 2.5rem;
    color: var(--ink);
    font-size: 0.95rem;
    letter-spacing: 0.2em;
  }


  /* Portrait only — ignore landscape rather than reflowing for it. */
  @media (orientation: landscape) and (max-height: 30rem) {
    main::before {
      content: 'Turn your phone upright.';
      display: grid;
      place-items: center;
      position: fixed;
      inset: 0;
      background: var(--void);
      color: var(--ink-dim);
      z-index: 10;
    }
  }
</style>
