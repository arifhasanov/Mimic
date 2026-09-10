import { describe, expect, it, vi } from 'vitest';
import { mount, unmount, flushSync } from 'svelte';
import ActFlow from './ActFlow.svelte';
import { game } from '$lib/game.svelte';
import type { ActOptions, PublicState } from '$lib/types';

/**
 * Build spec test 15 and phone spec section 6: the action flow must render the same DOM for
 * every living player. The strongest form of that guarantee is that the component cannot
 * see a role at all — so the test drives it with two opposite private states and compares
 * the rendered markup byte for byte.
 */

const OPTIONS: ActOptions = {
  rooms: ['reactor', 'cargo', 'steering', 'oxygen', 'medbay'],
  focus: {
    reactor: ['reactor', 'cargo', 'oxygen', 'medbay'],
    cargo: ['cargo', 'reactor', 'steering'],
    steering: ['steering', 'cargo', 'medbay'],
    oxygen: ['oxygen', 'reactor', 'medbay'],
    medbay: ['medbay', 'reactor', 'steering', 'oxygen'],
  },
  actions: ['WORK', 'SABO'],
};

function renderWith(roleCard: { role: 'CREW' | 'MIMIC'; mimicTeammates?: string[] }): string {
  game.roleCard = roleCard;
  const target = document.createElement('div');
  document.body.appendChild(target);
  const component = mount(ActFlow, {
    target,
    props: { options: OPTIONS, seed: 4242, onsubmit: () => {} },
  });
  flushSync();
  const html = target.innerHTML;
  unmount(component);
  target.remove();
  return html;
}

describe('15. the Act flow is role-blind', () => {
  it('renders byte-identical DOM for a crew member and a Mimic', () => {
    const asCrew = renderWith({ role: 'CREW' });
    const asMimic = renderWith({ role: 'MIMIC', mimicTeammates: ['Bo', 'Cal'] });
    expect(asMimic).toBe(asCrew);
    expect(asCrew).toContain('Reactor');
  });

  it('offers the same five rooms in fixed map order whatever the seed', () => {
    const target = document.createElement('div');
    document.body.appendChild(target);
    const c = mount(ActFlow, {
      target,
      props: { options: OPTIONS, seed: 1, onsubmit: () => {} },
    });
    flushSync();
    const labels = [...target.querySelectorAll('.tile span')].map((n) => n.textContent);
    expect(labels).toEqual(['Reactor', 'Cargo bay', 'Steering', 'Oxygen', 'Med bay']);
    unmount(c);
    target.remove();
  });

  it('ignores taps for the tap-guard window after a screen appears', async () => {
    vi.useFakeTimers();
    const target = document.createElement('div');
    document.body.appendChild(target);
    const onsubmit = vi.fn();
    const c = mount(ActFlow, {
      target,
      props: { options: OPTIONS, seed: 9, onsubmit, tapGuardMs: 700, fadeMin: 300, fadeMax: 300 },
    });
    flushSync();

    // Room -> focus. The fade must finish before the next screen exists at all.
    (target.querySelector('.tile') as HTMLButtonElement).click();
    flushSync();
    expect(target.querySelector('.prompt')!.textContent).toBe('Where do you stand?');
    vi.advanceTimersByTime(300);
    flushSync();
    expect(target.querySelector('.prompt')!.textContent).toBe('Focus');

    // A tap inside the guard window does nothing at all.
    (target.querySelector('.tile') as HTMLButtonElement).click();
    flushSync();
    expect(target.querySelector('.prompt')!.textContent).toBe('Focus');

    vi.advanceTimersByTime(700);
    (target.querySelector('.tile') as HTMLButtonElement).click();
    vi.advanceTimersByTime(300);
    flushSync();
    expect(target.querySelector('.prompt')!.textContent).toBe('Action');

    unmount(c);
    target.remove();
    vi.useRealTimers();
  });
});

describe('16. the client drops the role after ROLES', () => {
  const stateAt = (phase: PublicState['phase']) =>
    ({
      phase,
      round: 1,
      players: [],
      rooms: [],
      log: [],
      config: {},
      vote: null,
      lastReport: null,
    }) as unknown as PublicState;

  it('holds no role or mimicTeammates key once the phase moves on', () => {
    game.reset();
    game.applyState(stateAt('ROLES'));
    game.roleCard = { role: 'MIMIC', mimicTeammates: ['Bo'] };
    expect(game.roleCard).not.toBeNull();

    game.applyState(stateAt('REPORT'));

    expect(game.roleCard).toBeNull();

    // No key named `role` or `mimicTeammates` survives at any depth, and no role string is
    // left anywhere in the store for a curious neighbour with devtools to find.
    const keysAtEveryDepth = (v: unknown): string[] => {
      if (Array.isArray(v)) return v.flatMap(keysAtEveryDepth);
      if (v && typeof v === 'object')
        return Object.entries(v).flatMap(([k, x]) => [k, ...keysAtEveryDepth(x)]);
      return [];
    };
    const snapshot = {
      state: game.state,
      actOptions: game.actOptions,
      spectator: game.spectator,
      roleCard: game.roleCard,
    };
    expect(keysAtEveryDepth(snapshot)).not.toContain('role');
    expect(keysAtEveryDepth(snapshot)).not.toContain('mimicTeammates');
    expect(JSON.stringify(snapshot)).not.toContain('MIMIC');
  });
});
