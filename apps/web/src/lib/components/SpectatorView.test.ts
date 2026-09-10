import { describe, expect, it } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import SpectatorView from './SpectatorView.svelte';

/**
 * Build spec section 11: an eliminated player's phone shows every true role and the full
 * state. It is the one screen allowed to name an intent, and the only one a living player
 * must never reach — so it is worth proving it renders the real payload shape.
 */

function render(props: any): HTMLElement {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(SpectatorView, { target, props });
  flushSync();
  return target;
}

const PAYLOAD = {
  players: [
    { id: 'p1', name: 'Ann', trueRole: 'CREW' as const, alive: true, room: 'cargo' },
    { id: 'p2', name: 'Bo', trueRole: 'MIMIC' as const, alive: true, room: 'medbay' },
    { id: 'p3', name: 'Cal', trueRole: 'MIMIC' as const, alive: false, room: 'reactor' },
    { id: 'p4', name: 'Dee', trueRole: 'CREW' as const, alive: true, room: null },
  ],
  intents: [
    { playerId: 'p1', room: 'cargo', intent: 'WORK' },
    { playerId: 'p2', room: 'medbay', intent: 'CORRUPT' },
    { playerId: 'p4', room: 'reactor', intent: 'STEAL', resource: 'cells' },
    { playerId: 'p3', room: 'cargo', intent: 'BREAK', target: 'steering' },
  ],
};

describe('the spectator view', () => {
  it('names every true role and where each player stood', () => {
    const el = render({ spectator: PAYLOAD });
    const rows = [...el.querySelectorAll('.roles li')].map((li) => li.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows).toEqual([
      'Ann CREW Cargo bay',
      'Bo MIMIC Med bay',
      'Cal MIMIC Reactor',
      'Dee CREW —', // did not act this round
    ]);
    expect(el.querySelectorAll('.roles li.dead')).toHaveLength(1);
    expect(el.querySelectorAll('.roles li.mimic')).toHaveLength(2);
  });

  it('spells out each intent, including its target and resource', () => {
    const el = render({ spectator: PAYLOAD });
    const rows = [...el.querySelectorAll('.intents li')].map((li) => li.textContent!.replace(/\s+/g, ' ').trim());
    expect(rows).toEqual([
      'Ann WORK Cargo bay',
      'Bo CORRUPT Med bay',
      'Dee STEAL cells Reactor',
      'Cal BREAK Steering Cargo bay',
    ]);
    // Only the three sabotages are marked; plain work is not.
    expect(el.querySelectorAll('.intents li.sabotage')).toHaveLength(3);
  });

  it('survives the first round, before anything has resolved', () => {
    const el = render({ spectator: { players: PAYLOAD.players, intents: [] } });
    expect(el.textContent).toContain('Nothing has resolved yet.');
    expect(el.querySelectorAll('.roles li')).toHaveLength(4);
  });

  it('survives having no payload at all', () => {
    const el = render({ spectator: null });
    expect(el.textContent).toContain('Waiting for the next round.');
  });
});
