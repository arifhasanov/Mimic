import { describe, expect, it } from 'vitest';
import { mount, flushSync } from 'svelte';
import RoundSteps from './RoundSteps.svelte';

/** The step track in the monitor's header. */

function render(gameState: Record<string, unknown>) {
  const target = document.createElement('div');
  document.body.appendChild(target);
  mount(RoundSteps, { target, props: { gameState: { vote: null, ...gameState } as any } });
  flushSync();
  return {
    states: [...target.querySelectorAll('li')].map((li) => li.className.replace(/svelte-\S+/g, '').trim()),
    labels: [...target.querySelectorAll('.label')].map((l) => l.textContent),
    counter: target.querySelector('.eyebrow')?.textContent?.replace(/\s+/g, ' ').trim(),
  };
}

describe('the round step track', () => {
  it('fills the steps already done and marks the vote as undecided before Resolve', () => {
    const r = render({ phase: 'TALK', voteThisRound: 'UNKNOWN' });
    expect(r.states).toEqual(['done', 'current', 'todo', 'todo', 'maybe']);
    expect(r.labels).toEqual(['Report', 'Talk', 'Act', 'Resolve', 'Vote']);
    expect(r.counter).toBe('Step 2 of 5');
  });

  it('drops the vote from the count once the round resolves without one', () => {
    const r = render({ phase: 'RESOLVE', voteThisRound: 'NO' });
    expect(r.states).toEqual(['done', 'done', 'done', 'current', 'skipped']);
    expect(r.labels[4]).toBe('No vote');
    expect(r.counter).toBe('Step 4 of 4');
  });

  it('keeps the vote in play when the round will end in one', () => {
    const r = render({ phase: 'RESOLVE', voteThisRound: 'YES' });
    expect(r.states).toEqual(['done', 'done', 'done', 'current', 'todo']);
    expect(r.counter).toBe('Step 4 of 5');
  });

  it('calls the last step a runoff while one is running', () => {
    const r = render({ phase: 'VOTE', voteThisRound: 'YES', vote: { stage: 'RUNOFF' } });
    expect(r.states[4]).toBe('current');
    expect(r.labels[4]).toBe('Runoff');
    expect(r.counter).toBe('Step 5 of 5');
  });

  it('draws nothing outside the steps of a round', () => {
    const r = render({ phase: 'ROLES', voteThisRound: 'UNKNOWN' });
    expect(r.states).toEqual([]);
  });
});
