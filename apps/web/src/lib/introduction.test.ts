import { afterEach, describe, expect, it, vi } from 'vitest';
import { hasSeenIntroduction, rememberIntroduction } from './introduction';

afterEach(() => { sessionStorage.clear(); vi.restoreAllMocks(); });

describe('introduction session preference', () => {
  it('remembers completion in this browser tab session', () => {
    expect(hasSeenIntroduction()).toBe(false);
    rememberIntroduction();
    expect(hasSeenIntroduction()).toBe(true);
  });

  it('allows the menu to open even when storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    expect(hasSeenIntroduction()).toBe(false);
    expect(() => rememberIntroduction()).not.toThrow();
  });
});
