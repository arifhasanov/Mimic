export const REPAIR_FRAME_COUNT = 6;

/** Spread unfinished repairs across the assembly, reserving the last frame for completion. */
export function repairFrame(progress: number, target: number): number {
  const fraction = Math.max(0, Math.min(1, progress / Math.max(1, target)));
  return Math.floor(fraction * (REPAIR_FRAME_COUNT - 1));
}
