<script lang="ts">
  import { ROOM_NAMES } from '$lib/shipMap.config';
  import type { ChatMessage, PublicState } from '$lib/types';

  type Tab = 'log' | 'chat';

  let {
    gameState,
    rounds = 3,
    chat = [],
    mode = 'tabs',
    reveal = false,
  }: {
    gameState: PublicState;
    rounds?: number;
    chat?: ChatMessage[];
    /** `tabs` switches between the ship log and the crew chat; `log` and `chat` pin one. */
    mode?: 'tabs' | Tab;
    /** Game over: mark every line a revealed Mimic said, so the table can enjoy the lies. */
    reveal?: boolean;
  } = $props();

  /** The last few rounds, newest first, in short form. */
  const entries = $derived(
    gameState.log
      .filter((e) => e.kind !== 'SETTINGS')
      .slice(-rounds * 3)
      .reverse()
      .slice(0, rounds * 2),
  );

  const hasBots = $derived(gameState.players.some((p) => p.isBot));
  const tabbed = $derived(mode === 'tabs' && hasBots);

  /**
   * The monitor is a TV nobody clicks mid-game, so the tab follows the phase: the chat
   * while the table is talking, acting and voting, the ship log while a report is up. A
   * click pins a tab until the next phase.
   */
  let pinned = $state<Tab | null>(null);
  let seenPhase = $state('');
  $effect(() => {
    if (gameState.phase !== seenPhase) {
      seenPhase = gameState.phase;
      pinned = null;
    }
  });
  const talking = $derived(gameState.phase === 'TALK' || gameState.phase === 'ACT' || gameState.phase === 'VOTE');
  const active = $derived<Tab>(
    mode !== 'tabs' ? mode : !hasBots ? 'log' : (pinned ?? (talking && chat.length ? 'chat' : 'log')),
  );

  /** Newest at the bottom, like any chat; scrolled into view whenever a line lands. */
  let feed = $state<HTMLElement | null>(null);
  $effect(() => {
    chat.length;
    active;
    if (feed) feed.scrollTop = feed.scrollHeight;
  });

  const revealed = (id: string) => gameState.players.find((p) => p.id === id)?.revealed ?? null;
  const isMimic = (m: ChatMessage) => reveal && revealed(m.playerId) === 'MIMIC';
  /** A stable hue per speaker, so a voice is recognisable at a glance from three metres. */
  const hue = (name: string) => {
    let h = 0;
    for (const ch of name) h = (h * 31 + ch.charCodeAt(0)) % 360;
    return h;
  };
</script>

<section class="panel" class:chat={active === 'chat'}>
  {#if tabbed}
    <div class="tabs" role="tablist">
      <button role="tab" class="eyebrow" class:on={active === 'log'} aria-selected={active === 'log'} onclick={() => (pinned = 'log')}>
        Ship log
      </button>
      <button role="tab" class="eyebrow" class:on={active === 'chat'} aria-selected={active === 'chat'} onclick={() => (pinned = 'chat')}>
        Crew chat
        {#if chat.length}<span class="count mono">{chat.length}</span>{/if}
      </button>
    </div>
  {:else}
    <span class="eyebrow">{active === 'chat' ? 'Crew chat' : 'Ship log'}</span>
  {/if}

  {#if active === 'log'}
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
  {:else}
    <div class="feed" bind:this={feed}>
      {#each chat as m, i (m.id)}
        {#if i === 0 || chat[i - 1].round !== m.round}
          <div class="divider"><span class="mono">Round {m.round}</span></div>
        {/if}
        <div class="line" class:mimic={isMimic(m)}>
          <span class="who" style:--hue={hue(m.name)}>{m.name}{#if isMimic(m)}<i>Mimic</i>{/if}</span>
          <span class="said">{m.text}</span>
        </div>
      {:else}
        <p class="empty">The bots have nothing to say yet.</p>
      {/each}
    </div>
  {/if}
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

  .tabs {
    display: flex;
    gap: 1.1rem;
    border-bottom: 1px solid var(--line);
    padding-bottom: 0.45rem;
  }

  .tabs button {
    background: none;
    border: 0;
    padding: 0;
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    color: var(--ink-faint);
    position: relative;
  }

  .tabs button.on {
    color: var(--teal);
  }

  .tabs button.on::after {
    content: '';
    position: absolute;
    left: 0;
    right: 0;
    bottom: -0.5rem;
    height: 2px;
    background: var(--teal);
  }

  .count {
    font-size: 0.7rem;
    letter-spacing: 0;
    text-transform: none;
    color: var(--ink-faint);
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
    margin: 0;
    color: var(--ink-faint);
    font-size: 0.85rem;
  }

  /* -- the chat ----------------------------------------------------------- */

  .feed {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    text-align: left; /* the game-over screen centres everything else */
    scrollbar-width: thin;
    scrollbar-color: var(--line-2) transparent;
  }

  .divider {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    color: var(--ink-faint);
    font-size: 0.7rem;
    letter-spacing: 0.18em;
    text-transform: uppercase;
    margin: 0.2rem 0;
  }

  .divider::before,
  .divider::after {
    content: '';
    flex: 1;
    height: 1px;
    background: var(--line);
  }

  .line {
    display: flex;
    flex-direction: column;
    gap: 0.1rem;
    padding: 0.35rem 0.55rem;
    border-radius: 10px;
    background: var(--hull-2);
    border: 1px solid transparent;
  }

  .line.mimic {
    border-color: rgba(255, 107, 61, 0.45);
    background: rgba(255, 107, 61, 0.08);
  }

  .who {
    font-size: 0.74rem;
    font-weight: 600;
    letter-spacing: 0.04em;
    color: hsl(var(--hue) 55% 70%);
    display: inline-flex;
    gap: 0.4rem;
    align-items: baseline;
  }

  .who i {
    font-style: normal;
    font-size: 0.62rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--danger);
  }

  .said {
    font-size: 0.88rem;
    line-height: 1.35;
  }
</style>
