import { describe, expect, it } from 'vitest';
import { mount, flushSync } from 'svelte';
import LogPanel from './LogPanel.svelte';

/**
 * The right-rail panel: the ship log alone when the table is all human, a second "Crew
 * chat" tab as soon as a bot is seated, and — on the game-over screen — the revealed
 * Mimics' lines marked so the table can enjoy the lies.
 */

const player = (id: string, name: string, isBot: boolean, revealed: 'CREW' | 'MIMIC' | null = null) => ({
  id,
  name,
  alive: true,
  verified: false,
  room: null,
  connected: true,
  isBot,
  revealed,
});

const chat = [
  { id: 1, round: 1, phase: 'TALK', playerId: 'b', name: 'Bo', text: 'Plan: 3 to Reactor, 4 to Med bay.', at: 1 },
  { id: 2, round: 2, phase: 'TALK', playerId: 'c', name: 'Cal', text: 'I am looking at Bo.', at: 2 },
];

function render(props: any): HTMLElement {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(LogPanel, { target, props });
  flushSync();
  return target;
}

const base = (players: any[], phase = 'REPORT') => ({ players, phase, log: [] });

describe('the log panel', () => {
  it('has no chat tab when no bot is aboard', () => {
    const el = render({ gameState: base([player('a', 'Ann', false)]), chat });
    expect(el.querySelectorAll('[role=tab]')).toHaveLength(0);
    expect(el.textContent).toContain('Ship log');
    expect(el.textContent).not.toContain('Crew chat');
  });

  it('shows both tabs once a bot is seated, and follows the phase', () => {
    const talking = render({ gameState: base([player('a', 'Ann', false), player('b', 'Bo', true)], 'TALK'), chat });
    expect(talking.querySelectorAll('[role=tab]')).toHaveLength(2);
    expect(talking.querySelector('[role=tab][aria-selected=true]')!.textContent).toContain('Crew chat');
    expect(talking.textContent).toContain('I am looking at Bo.');
    expect(talking.querySelectorAll('.divider')).toHaveLength(2); // one per round

    const reporting = render({ gameState: base([player('a', 'Ann', false), player('b', 'Bo', true)], 'REPORT'), chat });
    expect(reporting.querySelector('[role=tab][aria-selected=true]')!.textContent).toContain('Ship log');
    expect(reporting.textContent).not.toContain('I am looking at Bo.');
  });

  it('marks what the revealed Mimics said on the game-over screen', () => {
    const el = render({
      gameState: base([player('b', 'Bo', true, 'MIMIC'), player('c', 'Cal', true, 'CREW')], 'GAME_OVER'),
      chat,
      mode: 'chat',
      reveal: true,
    });
    const lines = [...el.querySelectorAll('.line')];
    expect(lines).toHaveLength(2);
    expect(lines[0].classList.contains('mimic')).toBe(true);
    expect(lines[0].textContent).toContain('Mimic');
    expect(lines[1].classList.contains('mimic')).toBe(false);
  });
});
