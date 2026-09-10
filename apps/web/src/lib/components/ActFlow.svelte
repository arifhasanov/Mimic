<script lang="ts">
  import type { ActOptions, ActionButton, RoomId } from '$lib/types';
  import { ROOM_NAMES, ROOM_ORDER } from '$lib/shipMap.config';

  /**
   * The four-tap action flow. This component holds no role and receives none: it renders
   * `actOptions` from the server and nothing else (phone spec section 6). Two players with
   * different roles and the same seed produce byte-identical DOM — see ActFlow.test.ts.
   */
  let {
    options,
    seed,
    brokenRooms = [],
    onsubmit,
    tapGuardMs = 700,
    fadeMin = 300,
    fadeMax = 900,
  }: {
    options: ActOptions;
    /** Per player, per round. Shuffles the button pair and the focus tiles. */
    seed: number;
    brokenRooms?: RoomId[];
    onsubmit: (choice: { room: RoomId; focus: RoomId; action: ActionButton }) => void;
    tapGuardMs?: number;
    fadeMin?: number;
    fadeMax?: number;
  } = $props();

  type Step = 'room' | 'focus' | 'action' | 'lock';

  let step = $state<Step>('room');
  let room = $state<RoomId | null>(null);
  let focus = $state<RoomId | null>(null);
  let action = $state<ActionButton | null>(null);
  let fading = $state(false);
  let guardUntil = $state(0);

  /** mulberry32, so a given seed always produces the same shuffle. */
  function rand(s: number) {
    let a = s >>> 0;
    return () => {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function shuffled<T>(items: T[], s: number): T[] {
    const r = rand(s);
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1));
      [out[i], out[j]] = [out[j], out[i]];
    }
    return out;
  }

  // The room tiles keep the fixed map order — your room is public after resolution anyway,
  // and a stable layout reduces mistakes. Everything else is shuffled per player per round.
  const rooms = $derived(ROOM_ORDER.filter((r) => options.rooms.includes(r)));
  const focusTiles = $derived(room ? shuffled(options.focus[room] ?? [], seed + 17) : []);
  const actions = $derived(shuffled(options.actions, seed + 101));

  function begin(next: Step) {
    fading = true;
    const ms = fadeMin + Math.random() * (fadeMax - fadeMin);
    setTimeout(() => {
      step = next;
      fading = false;
      guardUntil = Date.now() + tapGuardMs;
    }, ms);
  }

  const armed = () => !fading && Date.now() >= guardUntil;

  function pickRoom(r: RoomId) {
    if (!armed()) return;
    room = r;
    focus = null;
    action = null;
    begin('focus');
  }

  function pickFocus(f: RoomId) {
    if (!armed()) return;
    focus = f;
    begin('action');
  }

  function pickAction(a: ActionButton) {
    if (!armed()) return;
    action = a;
    begin('lock');
  }

  function back() {
    if (!armed()) return;
    if (step === 'lock') return begin('action');
    if (step === 'action') return begin('focus');
    if (step === 'focus') return begin('room');
  }

  function lockIn() {
    if (!armed()) return;
    if (!room || !focus || !action) return;
    onsubmit({ room, focus, action });
  }
</script>

<div class="flow" class:fading>
  {#if step === 'room'}
    <p class="prompt">Where do you stand?</p>
    <div class="tiles rooms">
      {#each rooms as r (r)}
        <button class="tile" onclick={() => pickRoom(r)}>
          <span>{ROOM_NAMES[r]}</span>
          {#if brokenRooms.includes(r)}<i class="mark">broken</i>{/if}
        </button>
      {/each}
    </div>
  {:else if step === 'focus'}
    <p class="prompt">Focus</p>
    <div class="tiles focus">
      {#each focusTiles as f (f)}
        <button class="tile" onclick={() => pickFocus(f)}>
          <span>{ROOM_NAMES[f]}</span>
          {#if brokenRooms.includes(f)}<i class="mark">broken</i>{/if}
        </button>
      {/each}
    </div>
    <button class="back" onclick={back}>BACK</button>
  {:else if step === 'action'}
    <p class="prompt">Action</p>
    <div class="tiles pair">
      {#each actions as a (a)}
        <button class="tile" onclick={() => pickAction(a)}><span>{a}</span></button>
      {/each}
    </div>
    <button class="back" onclick={back}>BACK</button>
  {:else}
    <p class="prompt">Ready</p>
    <div class="tiles pair">
      <button class="tile" onclick={lockIn}><span>LOCK IN</span></button>
    </div>
    <button class="back" onclick={back}>BACK</button>
  {/if}
</div>

<style>
  /* Every button in the flow is the same size, shape, colour and font. No colour, icon or
     label ever differs by role — WORK and SABO occupy exactly the same pixels. */
  .flow {
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    gap: 1rem;
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

  .tiles {
    display: grid;
    gap: 0.6rem;
  }

  .tiles.rooms,
  .tiles.focus {
    grid-template-columns: 1fr;
  }

  .tiles.pair {
    grid-template-columns: 1fr 1fr;
  }

  .tile {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.4rem;
    height: 3.4rem;
    background: var(--hull);
    border: 1px solid var(--line-2);
    border-radius: 12px;
    color: var(--ink);
    font-size: 1.05rem;
    font-weight: 500;
    letter-spacing: 0.06em;
    -webkit-tap-highlight-color: transparent;
  }

  .tile:active {
    outline: 1px solid var(--ink-dim);
  }

  .mark {
    font-style: normal;
    font-size: 0.65rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    color: var(--hazard);
    border: 1px solid var(--hazard);
    border-radius: 999px;
    padding: 0.05rem 0.4rem;
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
