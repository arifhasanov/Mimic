/**
 * Seated bots. They read the same state a human sees, plus their own role, and they talk on
 * the monitor. The brain reasons, the talk planner decides who speaks, the voice puts it in
 * words — and the voice never sees a role.
 */
export * from './brain';
export * from './talk';
export * from './voice';

/** Ordinary names; the monitor badges them as bots via PublicPlayer.isBot. */
export const BOT_NAMES = [
  'Ann', 'Bo', 'Cal', 'Dee', 'Eva', 'Fin', 'Gus', 'Hal', 'Ivy', 'Jun', 'Kit', 'Lux',
];
