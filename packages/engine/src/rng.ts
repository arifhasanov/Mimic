export interface Rng {
  /** float in [0, 1) */
  next(): number;
  int(maxExclusive: number): number;
  pick<T>(items: T[]): T;
  shuffle<T>(items: T[]): T[];
  chance(p: number): boolean;
}

/** mulberry32 — small, fast, seedable, reproducible across runs. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const int = (maxExclusive: number) => Math.floor(next() * maxExclusive);
  return {
    next,
    int,
    pick: <T>(items: T[]) => items[int(items.length)],
    shuffle: <T>(items: T[]) => {
      const out = items.slice();
      for (let i = out.length - 1; i > 0; i--) {
        const j = int(i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
    chance: (p: number) => next() < p,
  };
}
