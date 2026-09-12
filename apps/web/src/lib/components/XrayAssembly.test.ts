import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render } from '@testing-library/svelte';
import XrayAssembly from './XrayAssembly.svelte';

afterEach(cleanup);

describe('the scanner on the ship map', () => {
  it('updates the displayed tile with repairs and steps back after sabotage', async () => {
    const view = render(XrayAssembly, { props: { progress: 0, target: 10 } });
    const scanner = view.getByRole('img');
    expect(scanner.getAttribute('data-frame')).toBe('0');
    await view.rerender({ progress: 6, target: 10 });
    expect(scanner.getAttribute('data-frame')).toBe('3');
    expect(scanner.style.backgroundPosition).toBe('0% 100%');
    await view.rerender({ progress: 10, target: 10 });
    expect(scanner.getAttribute('data-frame')).toBe('5');
    expect(scanner.getAttribute('aria-label')).toContain('10 of 10');
    await view.rerender({ progress: 9, target: 10 });
    expect(scanner.getAttribute('data-frame')).toBe('4');
  });

  it('recomputes the artwork for a different custom target', async () => {
    const view = render(XrayAssembly, { props: { progress: 4, target: 10 } });
    expect(view.getByRole('img').getAttribute('data-frame')).toBe('2');
    await view.rerender({ progress: 4, target: 4 });
    expect(view.getByRole('img').getAttribute('data-frame')).toBe('5');
  });

  it('pulses at exactly the scan cost and stops as soon as cells are spent', async () => {
    const view = render(XrayAssembly, { props: {
      progress: 10, target: 10, online: true, powerCells: 3, scanCost: 4,
    } });
    expect(view.container.querySelector('.pulse')).toBeNull();
    expect(view.getByRole('img').getAttribute('data-frame')).toBe('5');
    await view.rerender({ powerCells: 4 });
    expect(view.container.querySelector('.pulse')).not.toBeNull();
    expect(view.getByRole('img').getAttribute('aria-label')).toContain('ready to scan');
    await view.rerender({ powerCells: 0 });
    expect(view.container.querySelector('.pulse')).toBeNull();
    expect(view.getByRole('img').getAttribute('data-frame')).toBe('5');
  });

  it('uses the custom scan cost and stays still when the scanner is offline or unfinished', async () => {
    const view = render(XrayAssembly, { props: {
      progress: 6, target: 6, online: true, powerCells: 5, scanCost: 6,
    } });
    expect(view.container.querySelector('.pulse')).toBeNull();
    await view.rerender({ scanCost: 5 });
    expect(view.container.querySelector('.pulse')).not.toBeNull();
    await view.rerender({ online: false });
    expect(view.container.querySelector('.pulse')).toBeNull();
    await view.rerender({ online: true, progress: 5 });
    expect(view.container.querySelector('.pulse')).toBeNull();
    expect(view.getByRole('img').getAttribute('data-frame')).not.toBe('5');
  });
});
