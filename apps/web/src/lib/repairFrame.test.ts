import { describe, expect, it } from 'vitest';
import { repairFrame, REPAIR_FRAME_COUNT } from './repairFrame';

describe('X-ray assembly frames', () => {
  it('holds each unfinished frame for two progress values with a ten-point target', () => {
    expect(Array.from({ length: 11 }, (_, progress) => repairFrame(progress, 10)))
      .toEqual([0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5]);
  });

  it('skips intermediate artwork for a shorter repair track', () => {
    expect(Array.from({ length: 5 }, (_, progress) => repairFrame(progress, 4)))
      .toEqual([0, 1, 2, 3, 5]);
  });

  it('starts disassembled and only shows completion at the target for every supported setting', () => {
    for (let target = 4; target <= 12; target++) {
      expect(repairFrame(0, target)).toBe(0);
      expect(repairFrame(target, target)).toBe(REPAIR_FRAME_COUNT - 1);
      for (let progress = 1; progress < target; progress++) {
        expect(repairFrame(progress, target)).toBeGreaterThanOrEqual(repairFrame(progress - 1, target));
        expect(repairFrame(progress, target)).toBeLessThan(REPAIR_FRAME_COUNT - 1);
      }
      // Sabotage must take the fully assembled artwork back to an unfinished frame.
      expect(repairFrame(target - 1, target)).toBeLessThan(repairFrame(target, target));
    }
  });

  it('clamps progress to the available artwork', () => {
    expect(repairFrame(-1, 6)).toBe(0);
    expect(repairFrame(7, 6)).toBe(5);
  });
});
