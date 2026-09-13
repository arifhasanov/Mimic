import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import InfectionMeter from './InfectionMeter.svelte';
import type { PublicState } from '$lib/types';

const state = (infection: number, infectionDelta: number | null = null) => ({
  infection, infectionRules: { max: 12, gain: 2, decay: 1, threshold: 10 },
  lastReport: infectionDelta === null ? null : { infection, infectionDelta },
}) as PublicState;

describe('Infection meter', () => {
  it('updates the level, breach warning and actual change across round broadcasts', async () => {
    const view = render(InfectionMeter, { gameState: state(0) });
    const bar = view.getByRole('progressbar', { name: 'Infection level' });
    expect(bar.getAttribute('aria-valuenow')).toBe('0');
    expect(view.getByText('Awaiting first round')).toBeTruthy();
    await view.rerender({ gameState: state(8, 2) });
    expect(bar.getAttribute('aria-valuenow')).toBe('8');
    expect(view.getByText('Below relay breach threshold')).toBeTruthy();
    await view.rerender({ gameState: state(10, 2) });
    expect(bar.getAttribute('aria-valuenow')).toBe('10');
    expect(view.getByText('Relay defences compromised')).toBeTruthy();
    expect(view.getByText('+2 last round')).toBeTruthy();
    await view.rerender({ gameState: state(9, -1) });
    expect(bar.getAttribute('aria-valuenow')).toBe('9');
    expect(view.getByText('Below relay breach threshold')).toBeTruthy();
    expect(view.getByText('-1 last round')).toBeTruthy();
    expect(view.container.querySelectorAll('.tick')).toHaveLength(13);
    expect(view.container.querySelector('.tick.threshold')?.textContent).toBe('10');
    expect(bar.getAttribute('aria-valuetext')).toContain('Mimics need 10');
    expect(bar.getAttribute('aria-valuemax')).toBe('12');
  });
});
