<script lang="ts">
  import type { Balance, CustomSettings, PublicState } from '$lib/types';
  import { emitAck } from '$lib/socket';

  let { gameState, hostToken }: { gameState: PublicState; hostToken: string } = $props();

  const LABELS = ['Crew++', 'Crew+', 'Balanced', 'Mimic+', 'Mimic++'];

  /** Simulated crew win %, average table (tools/balance_sim.py). Data, not logic. */
  const WIN: Record<number, number[]> = {
    5: [99, 97, 87, 74, 62],
    6: [94, 80, 53, 32, 17],
    7: [97, 89, 59, 41, 23],
    8: [95, 88, 60, 40, 26],
    9: [93, 84, 55, 41, 31],
    10: [94, 81, 58, 43, 15],
    11: [94, 79, 60, 50, 21],
    12: [84, 69, 53, 46, 17],
  };

  let balance = $state<Balance>(0);
  let custom = $state(false);
  let form = $state<Record<string, number | string | boolean>>({});
  let busy = $state(false);

  // Track the server's view so the panel is right after a refresh or a second host tab.
  $effect(() => {
    balance = gameState.balance as Balance;
    custom = gameState.isCustom;
  });

  const estimate = $derived.by(() => {
    if (custom) return 'Estimate not available for custom settings';
    const row = WIN[gameState.players.length];
    if (!row) return `Add ${Math.max(0, 5 - gameState.players.length)} more to see an estimate`;
    return `Estimated crew win chance: ~${row[balance + 2]}%`;
  });

  async function push(patch: { balance?: Balance; custom?: Partial<CustomSettings> | null; fastPhases?: boolean }) {
    busy = true;
    await emitAck('hostSetSettings', { code: gameState.code, hostToken, ...patch });
    busy = false;
  }

  function setBalance(v: number) {
    balance = v as Balance;
    push({ balance: balance, custom: null });
  }

  function seedForm() {
    const c = gameState.config;
    form = {
      aliens: c.aliens,
      rounds: c.rounds,
      repairTarget: c.repairTarget,
      repairSuccessChance: Math.round(c.repairSuccessChance * 100),
      medbaySeats: c.medbaySeats,
      repairCostScrap: c.repairCostScrap,
      scrapPerCargoWorker: c.scrapPerCargoWorker,
      reactorCapCells: c.reactorCapCells,
      scanCostCells: c.scanCostCells,
      startingScrap: c.startingScrap,
      startingCells: c.startingCells,
      fuseLength: c.fuseLength,
      stealAmount: c.stealAmount,
      sabotagesPerRound: c.sabotagesPerRound,
      allowSelfVote: c.allowSelfVote,
      TALK: c.phaseSeconds.TALK,
      ACT: c.phaseSeconds.ACT,
      VOTE: c.phaseSeconds.VOTE,
      REPORT: c.phaseSeconds.REPORT,
      RESOLVE: c.phaseSeconds.RESOLVE,
    };
  }

  function toggleCustom() {
    if (custom) {
      custom = false;
      push({ balance, custom: null });
    } else {
      seedForm();
      custom = true;
      pushForm();
    }
  }

  function pushForm() {
    push({
      custom: {
        aliens: Number(form.aliens),
        rounds: Number(form.rounds),
        repairTarget: Number(form.repairTarget),
        repairSuccessChance: Number(form.repairSuccessChance) / 100,
        medbaySeats: Number(form.medbaySeats),
        repairCostScrap: Number(form.repairCostScrap),
        scrapPerCargoWorker: Number(form.scrapPerCargoWorker),
        reactorCapCells: Number(form.reactorCapCells),
        scanCostCells: Number(form.scanCostCells),
        startingScrap: Number(form.startingScrap),
        startingCells: Number(form.startingCells),
        fuseLength: Number(form.fuseLength),
        stealAmount: Number(form.stealAmount),
        sabotagesPerRound: form.sabotagesPerRound as 'team' | 'each',
        allowSelfVote: !!form.allowSelfVote,
        phaseSeconds: {
          TALK: Number(form.TALK),
          ACT: Number(form.ACT),
          VOTE: Number(form.VOTE),
          REPORT: Number(form.REPORT),
          RESOLVE: Number(form.RESOLVE),
        },
      } as Partial<CustomSettings>,
    });
  }

  interface Field {
    key: string;
    label: string;
    help: string;
    min?: number;
    max?: number;
    step?: number;
    choices?: [string, string][];
    bool?: boolean;
  }

  const GROUPS: { title: string; note: string; fields: Field[] }[] = [
    {
      title: 'Balance',
      note: 'who wins',
      fields: [
        { key: 'aliens', label: 'Mimics', help: 'How many Mimics. 1 at 5 players, 2 at 6–9, 3 at 10–12.', min: 1, max: 4 },
        { key: 'reactorCapCells', label: 'Reactor cap', help: 'Most power cells the Reactor can make in one round. The strongest balance dial.', min: 1, max: 8 },
        { key: 'scanCostCells', label: 'Scan cost', help: 'Power cells spent per scan.', min: 2, max: 8 },
        { key: 'rounds', label: 'Rounds', help: 'Rounds until the station. Fewer rounds favour the Mimics.', min: 6, max: 14 },
        { key: 'stealAmount', label: 'Steal amount', help: 'Scrap or cells destroyed by one Steal.', min: 1, max: 4 },
        {
          key: 'sabotagesPerRound',
          label: 'Sabotages',
          help: 'Team: one sabotage a round for all Mimics together. Each: every Mimic lands theirs.',
          choices: [
            ['team', 'Team'],
            ['each', 'Each'],
          ],
        },
      ],
    },
    {
      title: 'Pace',
      note: 'when the X-ray comes online',
      fields: [
        { key: 'repairSuccessChance', label: 'Repair chance', help: 'Chance one Med bay attempt gives a repair point. Lower means a longer build phase.', min: 30, max: 80, step: 5 },
        { key: 'repairTarget', label: 'Repair target', help: 'Repair points needed to bring the X-ray online.', min: 4, max: 12 },
        { key: 'medbaySeats', label: 'Med bay seats', help: 'How many can work the X-ray in one round. 3 gets every table there around round 4. 99 = unlimited.', min: 2, max: 99 },
        { key: 'repairCostScrap', label: 'Repair cost', help: 'Scrap spent per Med bay attempt.', min: 1, max: 2 },
        { key: 'scrapPerCargoWorker', label: 'Scrap per worker', help: 'Scrap made by each Cargo bay worker.', min: 1, max: 3 },
        { key: 'startingScrap', label: 'Starting scrap', help: 'Scrap in the pool at the start.', min: 0, max: 6 },
        { key: 'startingCells', label: 'Starting cells', help: 'Power cells in the pool at the start.', min: 0, max: 6 },
      ],
    },
    {
      title: 'Table',
      note: 'how the evening runs',
      fields: [
        { key: 'fuseLength', label: 'Fuse length', help: 'Rounds a broken room survives before the ship is lost.', min: 2, max: 5 },
        { key: 'allowSelfVote', label: 'Allow self-vote', help: 'Whether a player may vote for themselves on the first ballot.', bool: true },
        { key: 'TALK', label: 'Talk (s)', help: 'Talking time per round.', min: 30, max: 600, step: 10 },
        { key: 'ACT', label: 'Act (s)', help: 'Time to lock in an action.', min: 20, max: 180, step: 5 },
        { key: 'VOTE', label: 'Vote (s)', help: 'Time to vote.', min: 20, max: 180, step: 5 },
        { key: 'REPORT', label: 'Report (s)', help: 'Time the ship report stays on screen.', min: 5, max: 60, step: 5 },
        { key: 'RESOLVE', label: 'Resolve (s)', help: 'Time the round result stays on screen.', min: 10, max: 90, step: 5 },
      ],
    },
  ];
</script>

<div class="settings">
  <div class="slider-block" class:off={custom}>
    <div class="head">
      <span class="eyebrow">Balance</span>
      <span class="estimate" class:muted={custom}>{estimate}</span>
    </div>

    <div class="detents">
      {#each LABELS as label, i (label)}
        <button
          class="detent"
          class:active={!custom && balance === i - 2}
          disabled={custom || busy}
          onclick={() => setBalance(i - 2)}
        >
          <span class="pip"></span>
          <span class="label">{label}</span>
        </button>
      {/each}
    </div>
  </div>

  <div class="toggles">
    <label class="switch">
      <input type="checkbox" checked={custom} onchange={toggleCustom} />
      <span>Custom settings</span>
    </label>
    <label class="switch">
      <input
        type="checkbox"
        checked={gameState.fastPhases}
        onchange={(e) => push({ fastPhases: e.currentTarget.checked })}
      />
      <span>Fast phases <i>(dev)</i></span>
    </label>
  </div>

  {#if custom}
    <div class="custom">
      {#each GROUPS as group (group.title)}
        <div class="group">
          <h4>{group.title} <span>{group.note}</span></h4>
          {#each group.fields as f (f.key)}
            <div class="field">
              <label for={'f-' + f.key}>{f.label}</label>
              {#if f.bool}
                <input
                  id={'f-' + f.key}
                  type="checkbox"
                  checked={!!form[f.key]}
                  onchange={(e) => {
                    form[f.key] = e.currentTarget.checked;
                    pushForm();
                  }}
                />
              {:else if f.choices}
                <select
                  id={'f-' + f.key}
                  value={form[f.key]}
                  onchange={(e) => {
                    form[f.key] = e.currentTarget.value;
                    pushForm();
                  }}
                >
                  {#each f.choices as [v, l] (v)}
                    <option value={v}>{l}</option>
                  {/each}
                </select>
              {:else}
                <input
                  id={'f-' + f.key}
                  class="mono"
                  type="number"
                  min={f.min}
                  max={f.max}
                  step={f.step ?? 1}
                  value={form[f.key]}
                  onchange={(e) => {
                    form[f.key] = Number(e.currentTarget.value);
                    pushForm();
                  }}
                />
              {/if}
              <p class="help">{f.help}</p>
            </div>
          {/each}
        </div>
      {/each}

      <button class="reset" onclick={toggleCustom}>Reset to slider</button>
    </div>
  {/if}
</div>

<style>
  .settings {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    min-height: 0;
  }

  .head {
    display: flex;
    align-items: baseline;
    justify-content: space-between;
    gap: 1rem;
  }

  .estimate {
    font-size: 0.9rem;
    color: var(--teal);
    font-weight: 600;
  }

  .estimate.muted {
    color: var(--ink-faint);
    font-weight: 400;
  }

  .detents {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.4rem;
    margin-top: 0.6rem;
    position: relative;
  }

  .detents::before {
    content: '';
    position: absolute;
    left: 10%;
    right: 10%;
    top: 0.55rem;
    height: 2px;
    background: var(--line-2);
  }

  .detent {
    position: relative;
    background: none;
    border: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.45rem;
    color: var(--ink-faint);
  }

  .pip {
    width: 1.15rem;
    height: 1.15rem;
    border-radius: 50%;
    background: var(--hull);
    border: 2px solid var(--line-2);
    z-index: 1;
  }

  .detent .label {
    font-size: 0.75rem;
    letter-spacing: 0.04em;
  }

  .detent.active .pip {
    background: var(--teal);
    border-color: var(--teal);
    box-shadow: 0 0 14px rgba(95, 208, 196, 0.5);
  }

  .detent.active .label {
    color: var(--ink);
    font-weight: 600;
  }

  .slider-block.off {
    opacity: 0.4;
  }

  .toggles {
    display: flex;
    gap: 1.25rem;
    flex-wrap: wrap;
  }

  .switch {
    display: flex;
    align-items: center;
    gap: 0.45rem;
    font-size: 0.85rem;
    color: var(--ink-dim);
    cursor: pointer;
  }

  .switch i {
    font-style: normal;
    color: var(--ink-faint);
    font-size: 0.75rem;
  }

  .custom {
    display: flex;
    flex-direction: column;
    gap: 0.9rem;
    overflow-y: auto;
    padding-right: 0.4rem;
    min-height: 0;
  }

  .group h4 {
    margin: 0 0 0.5rem;
    font-size: 0.85rem;
    letter-spacing: 0.16em;
    text-transform: uppercase;
    color: var(--ink-dim);
  }

  .group h4 span {
    letter-spacing: 0;
    text-transform: none;
    color: var(--ink-faint);
    font-weight: 400;
  }

  .field {
    display: grid;
    grid-template-columns: 9rem 5.5rem;
    gap: 0.35rem 0.7rem;
    align-items: center;
    padding: 0.35rem 0;
    border-top: 1px solid var(--line);
  }

  .field label {
    font-size: 0.85rem;
  }

  .field input[type='number'],
  .field select {
    font: inherit;
    font-size: 0.9rem;
    padding: 0.3rem 0.45rem;
    background: var(--hull-2);
    border: 1px solid var(--line-2);
    border-radius: 7px;
    color: var(--ink);
    width: 100%;
  }

  .field input[type='checkbox'] {
    justify-self: start;
    width: 1.1rem;
    height: 1.1rem;
  }

  .help {
    grid-column: 1 / -1;
    margin: 0;
    font-size: 0.72rem;
    color: var(--ink-faint);
    line-height: 1.35;
  }

  .reset {
    align-self: flex-start;
    background: transparent;
    border: 1px solid var(--line-2);
    border-radius: 8px;
    padding: 0.45rem 0.9rem;
    color: var(--ink-dim);
    font-size: 0.85rem;
  }
</style>
