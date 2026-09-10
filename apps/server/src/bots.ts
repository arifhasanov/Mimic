import {
  ROOMS,
  focusTiles,
  isLegalBreak,
  livingPlayers,
  type ActionButton,
  type GameState,
  type Player,
  type RoomId,
} from '@mimic/engine';

/**
 * Dev/test bots. They are not part of the game design — they exist so one person can
 * drive a whole table in a browser. They read the same state a human sees, plus their own
 * role, and they play crudely but not randomly.
 */

export const BOT_NAMES = [
  'Bot Ann', 'Bot Bo', 'Bot Cal', 'Bot Dee', 'Bot Eva',
  'Bot Fin', 'Bot Gus', 'Bot Hal', 'Bot Ivy', 'Bot Jun', 'Bot Kit', 'Bot Lux',
];

const pick = <T>(xs: T[]): T => xs[Math.floor(Math.random() * xs.length)];

export interface BotChoice {
  room: RoomId;
  focus: RoomId;
  action: ActionButton;
}

function crewRoom(state: GameState): RoomId {
  const broken = ROOMS.filter((r) => state.rooms[r].broken);
  if (broken.length && Math.random() < 0.6) return pick(broken);

  const cfg = state.config;
  if (!state.xrayOnline) {
    // Build phase: keep the med bay fed with scrap.
    if (state.scrap >= cfg.repairCostScrap && Math.random() < 0.6) return 'medbay';
    return 'cargo';
  }
  if (state.powerCells < cfg.scanCostCells) return Math.random() < 0.75 ? 'reactor' : 'cargo';
  return pick(['cargo', 'reactor', 'medbay'] as RoomId[]);
}

export function chooseBotAction(state: GameState, self: Player): BotChoice {
  if (self.role === 'MIMIC' && Math.random() < 0.55) {
    const plans: BotChoice[] = [];
    for (const room of ROOMS) {
      for (const focus of focusTiles(room)) {
        if (isLegalBreak(state, room, focus)) plans.push({ room, focus, action: 'SABO' });
      }
    }
    // Corrupting matters only while the X-ray is still being built.
    if (!state.xrayOnline && state.scrap > 0)
      plans.push({ room: 'medbay', focus: 'medbay', action: 'SABO' });
    if (state.xrayOnline && state.powerCells > 0)
      plans.push({ room: 'reactor', focus: 'reactor', action: 'SABO' });
    if (state.scrap >= 2) plans.push({ room: 'cargo', focus: 'cargo', action: 'SABO' });
    if (plans.length) return pick(plans);
  }

  // Blend in: stand somewhere useful and press a button. Which button makes no difference
  // for crew, so bots press both, exactly as the rulebook tells humans to.
  const room = crewRoom(state);
  return { room, focus: pick(focusTiles(room)), action: Math.random() < 0.5 ? 'WORK' : 'SABO' };
}

export function chooseBotBallot(state: GameState, self: Player): string {
  const vote = state.vote;
  if (!vote) return 'SKIP';
  const candidates = vote.candidates
    .map((id) => state.players.find((p) => p.id === id)!)
    .filter((p) => p && p.alive);

  const usable = candidates.filter((p) => {
    if (p.id === self.id) return false;
    if (p.verified) return false;
    if (self.role === 'MIMIC' && p.role === 'MIMIC') return false; // never sell out a teammate
    return true;
  });

  if (!usable.length) {
    if (vote.allowSkip) return 'SKIP';
    const fallback = candidates.filter((p) => p.id !== self.id);
    return fallback.length ? pick(fallback).id : 'SKIP';
  }
  if (vote.allowSkip && self.role === 'CREW' && Math.random() < 0.12) return 'SKIP';
  void livingPlayers;
  return pick(usable).id;
}
