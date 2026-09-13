import comicSlides from '../../../../Introduction comic/slides.json';

/** Shared with the voice-over handoff; timings are editable without changing the player. */
export const introductionSlides = comicSlides;
export const introductionSessionKey = 'mimic.introduction.seen.v1';
export const introductionImage = (id: string) => `/introduction-comic/${id}.webp`;
export const introductionNarration = (id: string) => `/introduction-comic/audio/${id}.mp3`;
export const introductionMusic = '/introduction-comic/audio/music.mp3';

export function hasSeenIntroduction(): boolean {
  try {
    return sessionStorage.getItem(introductionSessionKey) === '1';
  } catch {
    return false;
  }
}

export function rememberIntroduction(): void {
  try {
    sessionStorage.setItem(introductionSessionKey, '1');
  } catch {
    // The menu still works when browser storage is unavailable.
  }
}
