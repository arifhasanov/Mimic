import { describe, expect, it } from 'vitest';
import { mount, flushSync } from 'svelte';
import VotePanel from './VotePanel.svelte';

/**
 * "Votes hidden" on the monitor: only the outcome is shown. The server already strips the
 * ballots from the payload in that mode (engine test "hidden votes"), so these fixtures
 * mirror what actually arrives — an empty ballot list — and check the panel says so rather
 * than showing an empty tally.
 */

const players = [
  { id: 'a', name: 'Ann', alive: true, verified: false, room: null, connected: true, revealed: null },
  { id: 'b', name: 'Bo', alive: false, verified: false, room: null, connected: true, revealed: 'MIMIC' },
  { id: 'c', name: 'Cal', alive: true, verified: false, room: null, connected: true, revealed: null },
];

function render(opts: {
  hiddenVotes: boolean;
  ballots: any[];
  result: any;
  stage?: string;
  vote?: boolean;
  voteSkipReason?: string | null;
}) {
  const gameState = {
    players,
    livingCount: 2,
    config: { scanCostCells: 4, repairTarget: 6 },
    scrap: 0,
    powerCells: 3,
    repairProgress: 6,
    xrayOnline: true,
    voteSkipReason: opts.voteSkipReason ?? null,
    hiddenVotes: opts.hiddenVotes,
    vote:
      opts.vote === false
        ? null
        : {
            stage: opts.stage ?? 'FIRST',
            candidates: ['a', 'b', 'c'],
            voters: opts.stage === 'RUNOFF' ? ['c'] : ['a', 'b', 'c'],
            allowSkip: true,
            ballots: opts.ballots,
            voted: ['a', 'b', 'c'],
            result: opts.result,
          },
  };
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(VotePanel, { target, props: { gameState: gameState as any } });
  flushSync();
  return target;
}

const SCAN_BO = { kind: 'SCAN', playerId: 'b', revealed: 'MIMIC' };

describe('the vote panel', () => {
  it('shows who voted for whom when votes are public', () => {
    const el = render({
      hiddenVotes: false,
      ballots: [
        { voterId: 'a', choice: 'b' },
        { voterId: 'c', choice: 'b' },
        { voterId: 'b', choice: 'a' },
      ],
      result: SCAN_BO,
    });
    const rows = [...el.querySelectorAll('.row')].map((r) => r.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows).toEqual(['Bo 2 Ann, Cal', 'Ann 1 Bo']);
    expect(el.textContent).toContain('is a MIMIC');
  });

  it('with votes hidden, shows the outcome and nothing about the ballots', () => {
    const el = render({ hiddenVotes: true, ballots: [], result: SCAN_BO });
    expect(el.querySelectorAll('.row')).toHaveLength(0);
    expect(el.textContent).toContain('Votes are hidden in this game.');
    expect(el.querySelector('.outcome')!.textContent!.replace(/\s+/g, ' ').trim()).toBe(
      'Bo is a MIMIC. Eliminated.',
    );
  });

  it('with votes hidden, still names the runoff candidates, because players must vote for them', () => {
    const el = render({
      hiddenVotes: true,
      ballots: [],
      result: { kind: 'RUNOFF', candidates: ['a', 'c'] },
    });
    expect(el.querySelectorAll('.row')).toHaveLength(0);
    expect(el.querySelector('.outcome')!.textContent).toContain('runoff between Ann and Cal');
  });

  it('tells the table ballots stay secret while a hidden vote is open', () => {
    const el = render({ hiddenVotes: true, ballots: [], result: null });
    expect(el.textContent).toContain('Ballots are secret and stay secret.');
  });

  it('leaves the two names on a runoff ballot out of the count', () => {
    const el = render({ hiddenVotes: false, ballots: [], result: null, stage: 'RUNOFF' });
    expect(el.querySelector('.progress')!.textContent!.trim()).toBe('3 / 1');
    const idle = el.querySelector('.idle')!.textContent!.replace(/\s+/g, ' ').trim();
    expect(idle).toBe('Ann or Bo or Cal — the rest of the crew decides. Neither of them votes.');
    expect([...el.querySelectorAll('.dot')].map((d) => d.textContent)).toEqual(['Cal']);
  });

  it('says why there is no vote rather than going quiet', () => {
    const el = render({
      hiddenVotes: false,
      ballots: [],
      result: null,
      vote: false,
      voteSkipReason: 'NOT_ENOUGH_CELLS',
    });
    const idle = el.querySelector('.idle')!.textContent!.replace(/\s+/g, ' ').trim();
    expect(idle).toBe('A scan costs 4 power cells and the pool holds 3.');
  });
});
