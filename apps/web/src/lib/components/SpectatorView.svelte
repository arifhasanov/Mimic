<script lang="ts">
  import { ROOM_NAMES } from '$lib/shipMap.config';
  import type { RoomId } from '$lib/types';

  /**
   * What an eliminated player sees: every true role, and what everyone actually did last
   * round. This is the only screen in the app that shows an intent, and it is only ever
   * sent to a player who is already out (build spec section 11).
   */
  export interface SpectatorPayload {
    players: { id: string; name: string; trueRole: 'CREW' | 'MIMIC'; alive: boolean; room: string | null }[];
    intents: { playerId: string; room: string; intent: string; target?: string; resource?: string }[];
  }

  let { spectator }: { spectator: SpectatorPayload | null } = $props();

  const roomName = (r: string | null | undefined) =>
    r && r in ROOM_NAMES ? ROOM_NAMES[r as RoomId] : '—';

  const nameOf = (id: string) => spectator?.players.find((p) => p.id === id)?.name ?? '?';

  const describe = (i: SpectatorPayload['intents'][number]) =>
    [i.intent, i.target ? roomName(i.target) : '', i.resource ?? ''].filter(Boolean).join(' ');
</script>

<div class="spectator">
  <p class="eyebrow">Eliminated · spectator</p>

  {#if !spectator}
    <p class="quiet">Waiting for the next round.</p>
  {:else}
    <ul class="roles">
      {#each spectator.players as p (p.id)}
        <li class:mimic={p.trueRole === 'MIMIC'} class:dead={!p.alive}>
          <span class="who">{p.name}</span>
          <b class="mono">{p.trueRole}</b>
          <i>{roomName(p.room)}</i>
        </li>
      {/each}
    </ul>

    <p class="eyebrow">Last round</p>
    {#if spectator.intents.length}
      <ul class="intents">
        {#each spectator.intents as i (i.playerId)}
          <li class:sabotage={i.intent !== 'WORK'}>
            <span class="who">{nameOf(i.playerId)}</span>
            <b class="mono">{describe(i)}</b>
            <i>{roomName(i.room)}</i>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="quiet">Nothing has resolved yet.</p>
    {/if}
  {/if}

  <p class="quiet foot">Stay silent. Let them work it out.</p>
</div>

<style>
  .spectator {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    overflow-y: auto;
    min-height: 0;
  }

  .roles,
  .intents {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 0.28rem;
  }

  li {
    display: grid;
    grid-template-columns: 1fr auto auto;
    gap: 0.55rem;
    align-items: baseline;
    padding: 0.38rem 0.6rem;
    background: var(--hull);
    border: 1px solid var(--line);
    border-radius: 9px;
    font-size: 0.85rem;
  }

  .who {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  li b {
    font-size: 0.68rem;
    letter-spacing: 0.12em;
    color: var(--ink-dim);
  }

  li.mimic b,
  li.sabotage b {
    color: var(--danger);
  }

  li.dead {
    opacity: 0.5;
  }

  li i {
    font-style: normal;
    font-size: 0.72rem;
    color: var(--ink-faint);
  }

  .quiet {
    margin: 0;
    font-size: 0.85rem;
    color: var(--ink-faint);
  }

  .foot {
    margin-top: auto;
    padding-top: 0.75rem;
    text-align: center;
  }
</style>
