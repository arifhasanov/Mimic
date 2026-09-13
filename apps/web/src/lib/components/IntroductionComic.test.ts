import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/svelte';
import { flushSync } from 'svelte';
import IntroductionComic from './IntroductionComic.svelte';
import { introductionSlides } from '$lib/introduction';

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval', 'performance'] });
  vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: false }));
  vi.spyOn(HTMLMediaElement.prototype, 'play').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: false });
    return Promise.resolve();
  });
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(function (this: HTMLMediaElement) {
    Object.defineProperty(this, 'paused', { configurable: true, value: true });
  });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function advance(ms: number) {
  vi.advanceTimersByTime(ms);
  flushSync();
}

describe('the opening comic', () => {
  it('waits for artwork and preserves the remaining time across pause and resume', async () => {
    const view = render(IntroductionComic, { oncomplete: vi.fn() });
    await fireEvent.click(view.getByRole('button', { name: 'Play silently' }));
    advance(20000);
    expect(view.getByRole('heading', { name: 'The haul' })).toBeTruthy();
    await fireEvent.load(view.getByRole('img'));
    advance(8000);
    await fireEvent.click(view.getByRole('button', { name: 'Pause introduction' }));
    advance(20000);
    expect(view.getByRole('heading', { name: 'The haul' })).toBeTruthy();
    await fireEvent.click(view.getByRole('button', { name: 'Play introduction' }));
    advance(6000);
    expect(view.getByRole('heading', { name: 'Behind the stones' })).toBeTruthy();
  });

  it('lets users skip immediately even if the first image never loads', async () => {
    const oncomplete = vi.fn();
    const view = render(IntroductionComic, { oncomplete });
    await fireEvent.click(view.getByRole('button', { name: /Skip intro/ }));
    await fireEvent.keyDown(window, { key: 'Escape' });
    expect(oncomplete).toHaveBeenCalledTimes(1);
  });

  it('supports keyboard navigation, then shows the title before completing', async () => {
    const oncomplete = vi.fn();
    const view = render(IntroductionComic, { oncomplete });
    await fireEvent.keyDown(window, { key: 'ArrowRight' });
    expect(view.getByRole('heading', { name: 'Behind the stones' })).toBeTruthy();
    await fireEvent.keyDown(window, { key: 'ArrowLeft' });
    expect(view.getByRole('heading', { name: 'The haul' })).toBeTruthy();
    await fireEvent.click(view.getByRole('button', { name: 'Page 7: Sabotage' }));
    await fireEvent.click(view.getByRole('button', { name: 'Play silently' }));
    await fireEvent.error(view.getByRole('img'));
    advance(introductionSlides[6].durationMs);
    expect(view.getByRole('heading', { name: 'MIMIC' })).toBeTruthy();
    expect(oncomplete).not.toHaveBeenCalled();
    advance(introductionSlides[7].durationMs);
    expect(oncomplete).toHaveBeenCalledTimes(1);
  });

  it('waits for an explicit start, including when reduced motion is preferred', async () => {
    vi.stubGlobal('matchMedia', vi.fn().mockReturnValue({ matches: true }));
    const view = render(IntroductionComic, { oncomplete: vi.fn() });
    await fireEvent.load(view.getByRole('img'));
    advance(20000);
    expect(view.getByRole('heading', { name: 'The haul' })).toBeTruthy();
    expect(view.getByRole('button', { name: 'Play introduction' })).toBeTruthy();
    expect(HTMLMediaElement.prototype.play).not.toHaveBeenCalled();
  });

  it('does not consume reading time while the tab is hidden', async () => {
    const view = render(IntroductionComic, { oncomplete: vi.fn() });
    await fireEvent.click(view.getByRole('button', { name: 'Play silently' }));
    await fireEvent.load(view.getByRole('img'));
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await fireEvent(document, new Event('visibilitychange'));
    advance(20000);
    expect(view.getByRole('heading', { name: 'The haul' })).toBeTruthy();
    hidden.mockReturnValue(false);
    await fireEvent(document, new Event('visibilitychange'));
    advance(14000);
    expect(view.getByRole('heading', { name: 'Behind the stones' })).toBeTruthy();
    hidden.mockRestore();
  });

  it('finishes narration before using the remaining time in the 14-second page', async () => {
    const view = render(IntroductionComic, { oncomplete: vi.fn() });
    await fireEvent.load(view.getByRole('img'));
    await fireEvent.click(view.getByRole('button', { name: 'Play with sound' }));
    const voice = view.getByLabelText('Narration audio') as HTMLAudioElement;
    const music = view.getByLabelText('Background music audio') as HTMLAudioElement;
    expect(voice.paused).toBe(false);
    expect(music.paused).toBe(false);
    expect(voice.src).toContain('01-the-haul.mp3');
    // During a buffering stall, wall time alone must not discard the current spoken line.
    advance(20000);
    expect(view.getByRole('heading', { name: 'The haul' })).toBeTruthy();
    voice.currentTime = 11;
    await fireEvent.ended(voice);
    advance(2900);
    expect(view.getByRole('heading', { name: 'The haul' })).toBeTruthy();
    advance(100);
    expect(view.getByRole('heading', { name: 'Behind the stones' })).toBeTruthy();
    expect(voice.currentTime).toBe(0);
    expect(voice.src).toContain('02-behind-the-stones.mp3');
  });

  it('pauses both tracks, preserves the voice position, and stops both on skip', async () => {
    const oncomplete = vi.fn();
    const view = render(IntroductionComic, { oncomplete });
    await fireEvent.load(view.getByRole('img'));
    await fireEvent.click(view.getByRole('button', { name: 'Play with sound' }));
    const voice = view.getByLabelText('Narration audio') as HTMLAudioElement;
    const music = view.getByLabelText('Background music audio') as HTMLAudioElement;
    voice.currentTime = 5;
    await fireEvent.click(view.getByRole('button', { name: 'Pause introduction' }));
    expect(voice.paused).toBe(true);
    expect(music.paused).toBe(true);
    await fireEvent.click(view.getByRole('button', { name: 'Play introduction' }));
    expect(voice.currentTime).toBe(5);
    expect(voice.paused).toBe(false);
    await fireEvent.click(view.getByRole('button', { name: /Skip intro/ }));
    expect(voice.paused).toBe(true);
    expect(music.paused).toBe(true);
    expect(oncomplete).toHaveBeenCalledTimes(1);
  });

  it('keeps audio stopped if an outstanding play promise resolves after skip', async () => {
    const resolvePlay: Array<() => void> = [];
    vi.mocked(HTMLMediaElement.prototype.play).mockImplementation(function (this: HTMLMediaElement) {
      return new Promise<void>((resolve) => { resolvePlay.push(() => {
        Object.defineProperty(this, 'paused', { configurable: true, value: false });
        resolve();
      }); });
    });
    const view = render(IntroductionComic, { oncomplete: vi.fn() });
    await fireEvent.load(view.getByRole('img'));
    await fireEvent.click(view.getByRole('button', { name: 'Play with sound' }));
    await fireEvent.click(view.getByRole('button', { name: /Skip intro/ }));
    resolvePlay.forEach((resolve) => resolve());
    await Promise.resolve();
    expect((view.getByLabelText('Narration audio') as HTMLAudioElement).paused).toBe(true);
    expect((view.getByLabelText('Background music audio') as HTMLAudioElement).paused).toBe(true);
  });

  it('offers recovery when the browser rejects audible playback', async () => {
    vi.mocked(HTMLMediaElement.prototype.play).mockRejectedValue(new DOMException('blocked', 'NotAllowedError'));
    const view = render(IntroductionComic, { oncomplete: vi.fn() });
    await fireEvent.load(view.getByRole('img'));
    await fireEvent.click(view.getByRole('button', { name: 'Play with sound' }));
    expect(view.getByRole('status').textContent).toContain('Press Play');
    expect(view.getByRole('button', { name: 'Play introduction' })).toBeTruthy();
    await fireEvent.click(view.getByRole('button', { name: 'Sound on' }));
    await fireEvent.click(view.getByRole('button', { name: 'Play introduction' }));
    advance(14000);
    expect(view.getByRole('heading', { name: 'Behind the stones' })).toBeTruthy();
  });

  it('falls back to captions if narration fails and leaves volume arrow keys alone', async () => {
    const view = render(IntroductionComic, { oncomplete: vi.fn() });
    await fireEvent.load(view.getByRole('img'));
    await fireEvent.click(view.getByRole('button', { name: 'Play with sound' }));
    await fireEvent.keyDown(view.getByRole('slider', { name: 'Narration' }), { key: 'ArrowRight' });
    expect(view.getByRole('heading', { name: 'The haul' })).toBeTruthy();
    await fireEvent.error(view.getByLabelText('Narration audio'));
    advance(14000);
    expect(view.getByRole('heading', { name: 'Behind the stones' })).toBeTruthy();
  });

  it('restarts the current page without waiting for an image load that will not fire again', async () => {
    const view = render(IntroductionComic, { oncomplete: vi.fn() });
    await fireEvent.load(view.getByRole('img'));
    await fireEvent.click(view.getByRole('button', { name: 'Play with sound' }));
    const voice = view.getByLabelText('Narration audio') as HTMLAudioElement;
    voice.currentTime = 5;
    advance(100);
    await fireEvent.click(view.getByRole('button', { name: 'Page 1: The haul' }));
    expect(voice.currentTime).toBe(0);
    expect(voice.paused).toBe(false);
    voice.currentTime = 11;
    await fireEvent.ended(voice);
    advance(3000);
    expect(view.getByRole('heading', { name: 'Behind the stones' })).toBeTruthy();
  });

  it('stops both tracks while hidden and resumes the same speech position', async () => {
    const view = render(IntroductionComic, { oncomplete: vi.fn() });
    await fireEvent.load(view.getByRole('img'));
    await fireEvent.click(view.getByRole('button', { name: 'Play with sound' }));
    const voice = view.getByLabelText('Narration audio') as HTMLAudioElement;
    const music = view.getByLabelText('Background music audio') as HTMLAudioElement;
    voice.currentTime = 4;
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    await fireEvent(document, new Event('visibilitychange'));
    expect(voice.paused).toBe(true);
    expect(music.paused).toBe(true);
    advance(20000);
    hidden.mockReturnValue(false);
    await fireEvent(document, new Event('visibilitychange'));
    expect(voice.paused).toBe(false);
    expect(voice.currentTime).toBe(4);
  });
});
