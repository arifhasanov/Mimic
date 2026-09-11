import { ADJACENCY, BREAKABLE, PIPES, ROOMS, ROOM_NAMES, focusTiles } from './map.js';
import type { Rng } from './rng.js';
import { defaultSettings, resolveSettings, settingsLine, UNLIMITED } from './settings.js';
import type {
  ActionButton,
  Ballot,
  DerivedIntent,
  GameState,
  Player,
  Role,
  RoomId,
  RoomReport,
  RoomState,
  RoundReport,
  SettingsInput,
  Submission,
  VoteOutcome,
} from './types.js';

export function emptyRooms(): Record<RoomId, RoomState> {
  const rooms = {} as Record<RoomId, RoomState>;
  for (const id of ROOMS) rooms[id] = { id, broken: false, fuse: null };
  return rooms;
}

export function createGame(code: string, seed: number): GameState {
  const settings = defaultSettings();
  return {
    code,
    phase: 'LOBBY',
    round: 0,
    phaseEndsAt: 0,
    players: [],
    rooms: emptyRooms(),
    scrap: 0,
    powerCells: 0,
    repairProgress: 0,
    xrayOnline: false,
    log: [],
    winner: null,
    winReason: null,
    config: resolveSettings(settings, 8),
    settings,
    submissions: {},
    vote: null,
    lastReport: null,
    seed,
    fastPhases: false,
    manualSteps: false,
    hiddenVotes: false,
    botSkill: 'NORMAL',
    step: 0,
  };
}

export const livingPlayers = (s: GameState) => s.players.filter((p) => p.alive);
export const livingMimics = (s: GameState) => s.players.filter((p) => p.alive && p.role === 'MIMIC');
export const playerById = (s: GameState, id: string) => s.players.find((p) => p.id === id);

/** Assign roles and freeze the config. Section 5. */
export function startGame(state: GameState, rng: Rng): GameState {
  const s = structuredClone(state);
  s.config = resolveSettings(s.settings, s.players.length);
  const order = rng.shuffle(s.players.map((p) => p.id));
  const mimicIds = new Set(order.slice(0, Math.min(s.config.aliens, s.players.length)));
  for (const p of s.players) {
    p.role = mimicIds.has(p.id) ? 'MIMIC' : 'CREW';
    p.alive = true;
    p.verified = false;
    p.room = null;
  }
  s.rooms = emptyRooms();
  s.scrap = s.config.startingScrap;
  s.powerCells = s.config.startingCells;
  s.repairProgress = 0;
  s.xrayOnline = false;
  s.round = 0;
  s.winner = null;
  s.winReason = null;
  s.submissions = {};
  s.vote = null;
  s.lastReport = null;
  s.phase = 'ROLES';
  s.log = [
    {
      round: 0,
      kind: 'SETTINGS',
      text: settingsLine(s.config, s.settings, s.players.length, s),
    },
  ];
  return s;
}

/**
 * Start of a REPORT phase: tick every broken room's fuse, then check for the hull breach.
 * A room broken in round N is first ticked in round N+1.
 */
export function beginRound(state: GameState): GameState {
  const s = structuredClone(state);
  s.round += 1;
  s.phase = 'REPORT';
  s.submissions = {};
  s.vote = null;
  if (s.round > 1) {
    for (const id of ROOMS) {
      const room = s.rooms[id];
      if (room.broken && room.fuse !== null) room.fuse -= 1;
    }
  }
  for (const id of ROOMS) {
    const room = s.rooms[id];
    if (room.broken && room.fuse !== null && room.fuse <= 0) {
      s.winner = 'MIMIC';
      s.winReason = 'HULL_BREACH';
      s.phase = 'GAME_OVER';
      s.log.push({
        round: s.round,
        kind: 'GAME_OVER',
        text: 'The ' + ROOM_NAMES[id] + ' fuse burned out. Hull breach.',
      });
      return s;
    }
  }
  return s;
}

// ---------------------------------------------------------------------------
// The focus rule (section 7) — the only place a role is read during resolution.
// ---------------------------------------------------------------------------

/** Single source of truth for break legality. Pure, reads public state only. */
export function isLegalBreak(state: GameState, room: RoomId, target: RoomId): boolean {
  if (!BREAKABLE[target]) return false;
  if (state.rooms[target].broken) return false;
  if (target === room) return room === 'steering' || room === 'oxygen';
  return ADJACENCY[room].includes(target);
}

export function deriveIntent(state: GameState, sub: Submission, role: Role): DerivedIntent {
  const work: DerivedIntent = { playerId: sub.playerId, room: sub.room, intent: 'WORK' };
  if (role !== 'MIMIC' || sub.action !== 'SABO') return work;

  if (sub.focus === sub.room) {
    if (sub.room === 'medbay') return { playerId: sub.playerId, room: sub.room, intent: 'CORRUPT' };
    if (sub.room === 'cargo')
      return { playerId: sub.playerId, room: sub.room, intent: 'STEAL', resource: 'scrap' };
    if (sub.room === 'reactor')
      return { playerId: sub.playerId, room: sub.room, intent: 'STEAL', resource: 'cells' };
  }
  if (isLegalBreak(state, sub.room, sub.focus))
    return { playerId: sub.playerId, room: sub.room, intent: 'BREAK', target: sub.focus };
  return work;
}

/** Built from public state only and emitted identically to every living player. */
export function buildActOptions(_state: GameState) {
  const focus = {} as Record<RoomId, RoomId[]>;
  for (const r of ROOMS) focus[r] = focusTiles(r);
  return { rooms: ROOMS.slice(), focus, actions: ['WORK', 'SABO'] as ActionButton[] };
}

export function isWellFormedSubmission(room: unknown, focus: unknown, action: unknown): boolean {
  if (typeof room !== 'string' || typeof focus !== 'string' || typeof action !== 'string') return false;
  if (!ROOMS.includes(room as RoomId)) return false;
  if (!focusTiles(room as RoomId).includes(focus as RoomId)) return false;
  return action === 'WORK' || action === 'SABO';
}

// ---------------------------------------------------------------------------
// Resolution — section 8, implemented in exactly that order.
// ---------------------------------------------------------------------------

export function resolveRound(state: GameState, rng: Rng): { state: GameState; report: RoundReport } {
  const s = structuredClone(state);
  const cfg = s.config;
  const living = livingPlayers(s);

  // 1. Fill defaults for anyone who did not submit.
  const subs: Submission[] = living.map((p) => {
    const sub = s.submissions[p.id];
    if (sub) return sub;
    const room: RoomId = p.room ?? 'cargo';
    return { playerId: p.id, room, focus: room, action: 'WORK' as ActionButton };
  });

  // 1b. Derive intents using the role held server-side.
  let intents: DerivedIntent[] = subs.map((sub) => {
    const p = playerById(s, sub.playerId)!;
    return deriveIntent(s, sub, p.role);
  });

  // Positions become public.
  for (const sub of subs) {
    playerById(s, sub.playerId)!.room = sub.room;
  }

  // 2. Pick the team sabotage. At most one per round for the whole Mimic team.
  const sabotages = intents.filter((i) => i.intent !== 'WORK');
  let chosen: DerivedIntent[] = [];
  if (cfg.sabotagesPerRound === 'each') {
    chosen = sabotages;
  } else if (sabotages.length > 0) {
    chosen = [sabotages[rng.int(sabotages.length)]];
  }
  const chosenSet = new Set(chosen);
  intents = intents.map((i) =>
    i.intent === 'WORK' || chosenSet.has(i)
      ? i
      : { playerId: i.playerId, room: i.room, intent: 'WORK' as const },
  );

  // 3. Apply the chosen sabotage.
  let corruptedAttempts = 0;
  for (const sab of chosen) {
    if (sab.intent === 'BREAK' && sab.target) {
      // Re-check: with 'each', two Mimics could aim at the same room.
      if (BREAKABLE[sab.target] && !s.rooms[sab.target].broken) {
        s.rooms[sab.target].broken = true;
        s.rooms[sab.target].fuse = cfg.fuseLength;
      }
    } else if (sab.intent === 'CORRUPT') {
      corruptedAttempts += 1;
    } else if (sab.intent === 'STEAL') {
      if (sab.resource === 'scrap') s.scrap = Math.max(0, s.scrap - cfg.stealAmount);
      else s.powerCells = Math.max(0, s.powerCells - cfg.stealAmount);
    }
  }

  // Workers = players whose intent resolved to WORK, grouped by room.
  const workersByRoom = {} as Record<RoomId, string[]>;
  for (const r of ROOMS) workersByRoom[r] = [];
  for (const i of intents) if (i.intent === 'WORK') workersByRoom[i.room].push(i.playerId);

  // 4. Repair broken rooms. A break always costs the crew exactly one action, never more.
  const repaired: RoomId[] = [];
  for (const r of ROOMS) {
    const room = s.rooms[r];
    if (!room.broken) continue;
    const here = workersByRoom[r];
    if (here.length === 0) continue;
    room.broken = false;
    room.fuse = null;
    repaired.push(r);
    here.splice(rng.int(here.length), 1); // that worker spent the round repairing
  }

  // 5. Produce resources, then clamp the reactor for the round.
  const cellsGained = Math.min(
    workersByRoom.reactor.length * cfg.cellsPerReactorWorker,
    cfg.reactorCapCells,
  );
  const scrapGained = workersByRoom.cargo.length * cfg.scrapPerCargoWorker;
  s.powerCells += cellsGained;
  s.scrap += scrapGained;

  // 6. Resolve the Med bay.
  const attempts = Math.min(workersByRoom.medbay.length, cfg.medbaySeats);
  let repairsGained = 0;
  let corruptLeft = corruptedAttempts;
  for (let a = 0; a < attempts; a++) {
    if (s.scrap < cfg.repairCostScrap) continue;
    s.scrap -= cfg.repairCostScrap;
    if (corruptLeft > 0) {
      corruptLeft -= 1;
      continue;
    }
    if (rng.chance(cfg.repairSuccessChance)) repairsGained += 1;
  }
  if (repairsGained > 0) {
    s.repairProgress = Math.min(cfg.repairTarget, s.repairProgress + repairsGained);
    if (s.repairProgress >= cfg.repairTarget) s.xrayOnline = true;
  }

  // 7. Build the public report. Occupants are public; intents never are.
  const occupants = {} as Record<RoomId, string[]>;
  for (const r of ROOMS) occupants[r] = [];
  for (const sub of subs) occupants[sub.room].push(playerById(s, sub.playerId)!.name);

  const rooms: RoomReport[] = ROOMS.map((r) => {
    const room = s.rooms[r];
    const bits: string[] = [];
    if (repaired.includes(r)) bits.push('repaired');
    if (r === 'reactor' && cellsGained > 0)
      bits.push('+' + cellsGained + ' power cell' + (cellsGained === 1 ? '' : 's'));
    if (r === 'cargo' && scrapGained > 0) bits.push('+' + scrapGained + ' scrap');
    if (r === 'medbay' && attempts > 0)
      bits.push(repairsGained > 0 ? '+' + repairsGained + ' repair' : 'no repair');
    if (room.broken) bits.push('broken, fuse ' + room.fuse);
    return {
      room: r,
      workers: occupants[r],
      summary: bits.length ? bits.join(' · ') : occupants[r].length ? 'nothing to do' : 'empty',
      broken: room.broken,
      fuse: room.fuse,
    };
  });

  const report: RoundReport = {
    round: s.round,
    rooms,
    scrap: s.scrap,
    powerCells: s.powerCells,
    repairProgress: s.repairProgress,
    xrayOnline: s.xrayOnline,
    intents,
  };
  s.lastReport = report;
  s.phase = 'RESOLVE';
  s.log.push({ round: s.round, kind: 'ROUND', text: 'Round ' + s.round, rooms });
  return { state: s, report };
}

// ---------------------------------------------------------------------------
// The vote — section 10.
// ---------------------------------------------------------------------------

export function shouldVote(state: GameState): boolean {
  return (
    state.xrayOnline &&
    state.powerCells >= state.config.scanCostCells &&
    livingPlayers(state).length >= 2
  );
}

export function startVote(
  state: GameState,
  stage: 'FIRST' | 'RUNOFF' = 'FIRST',
  candidates?: string[],
): GameState {
  const s = structuredClone(state);
  s.phase = 'VOTE';
  s.vote = {
    stage,
    candidates: candidates ?? livingPlayers(s).map((p) => p.id),
    allowSkip: stage === 'FIRST',
    ballots: [],
    result: null,
  };
  return s;
}

export function castBallot(
  state: GameState,
  voterId: string,
  choice: string,
): { ok: boolean; error?: string; state: GameState } {
  const s = structuredClone(state);
  const v = s.vote;
  if (!v || s.phase !== 'VOTE') return { ok: false, error: 'no vote running', state };
  const voter = playerById(s, voterId);
  if (!voter || !voter.alive) return { ok: false, error: 'not a living player', state };
  if (choice === 'SKIP') {
    if (!v.allowSkip) return { ok: false, error: 'skip not available', state };
  } else {
    if (!v.candidates.includes(choice)) return { ok: false, error: 'not a candidate', state };
    if (choice === voterId) {
      const selfAllowed = v.stage === 'FIRST' && s.config.allowSelfVote;
      if (!selfAllowed) return { ok: false, error: 'cannot vote for yourself', state };
    }
  }
  v.ballots = v.ballots.filter((b) => b.voterId !== voterId);
  v.ballots.push({ voterId, choice });
  return { ok: true, state: s };
}

export function tallyBallots(ballots: Ballot[]): { top: string[]; counts: Record<string, number> } {
  const counts: Record<string, number> = {};
  for (const b of ballots) counts[b.choice] = (counts[b.choice] ?? 0) + 1;
  const values = Object.values(counts);
  const max = values.length ? Math.max(...values) : 0;
  if (max === 0) return { top: [], counts };
  return { top: Object.keys(counts).filter((k) => counts[k] === max), counts };
}

/** Resolve the current ballot. Returns the outcome and the state after any scan is applied. */
export function resolveVote(state: GameState): { state: GameState; outcome: VoteOutcome } {
  const s = structuredClone(state);
  const v = s.vote!;
  const { top } = tallyBallots(v.ballots);

  let outcome: VoteOutcome;
  if (top.length === 0 || top.includes('SKIP')) {
    outcome = { kind: 'SKIP' };
  } else if (top.length === 1) {
    outcome = { kind: 'SCAN', playerId: top[0], role: playerById(s, top[0])!.role };
  } else if (v.stage === 'FIRST') {
    outcome = { kind: 'RUNOFF', candidates: top };
  } else {
    outcome = { kind: 'TIE' };
  }

  if (outcome.kind === 'SCAN') {
    s.powerCells = Math.max(0, s.powerCells - s.config.scanCostCells);
    const target = playerById(s, outcome.playerId)!;
    if (target.role === 'MIMIC') {
      target.alive = false;
      s.log.push({
        round: s.round,
        kind: 'SCAN',
        text: target.name + ' was scanned — MIMIC. Eliminated.',
        ballots: v.ballots.slice(),
      });
      if (livingMimics(s).length === 0) {
        s.winner = 'CREW';
        s.winReason = 'ALL_MIMICS_FOUND';
        s.phase = 'GAME_OVER';
      }
    } else {
      target.verified = true;
      s.log.push({
        round: s.round,
        kind: 'SCAN',
        text: target.name + ' was scanned — CREW. Verified.',
        ballots: v.ballots.slice(),
      });
    }
  } else if (outcome.kind === 'SKIP') {
    s.log.push({
      round: s.round,
      kind: 'VOTE',
      text: 'The crew skipped the scan.',
      ballots: v.ballots.slice(),
    });
  } else if (outcome.kind === 'TIE') {
    s.log.push({
      round: s.round,
      kind: 'VOTE',
      text: 'Runoff tied. No scan.',
      ballots: v.ballots.slice(),
    });
  } else {
    s.log.push({ round: s.round, kind: 'VOTE', text: 'Tied. Runoff.', ballots: v.ballots.slice() });
  }

  s.vote = { ...v, result: outcome };
  return { state: s, outcome };
}

// ---------------------------------------------------------------------------
// The next step — for the monitor's header.
// ---------------------------------------------------------------------------

export type UpcomingKind =
  | 'REPORT'
  | 'TALK'
  | 'ACT'
  | 'RESOLVE'
  | 'VOTE'
  | 'VOTE_RESULT'
  | 'RUNOFF'
  | 'GAME_OVER';

export interface Upcoming {
  kind: UpcomingKind;
  round: number;
}

/**
 * What the game does next, and whether this round ends in a vote.
 *
 * Computed here rather than on the monitor because it is game logic: after Resolve it
 * depends on the vote condition, and after a vote on its result. It reads public state only
 * (the X-ray, the cell pool, the head count, the vote outcome), so it is safe to broadcast.
 * Before Resolve nobody can know whether the round will end in a vote — a Steal could still
 * drain the cells — so it is honestly reported as UNKNOWN.
 */
export function upcomingStep(state: GameState): {
  next: Upcoming | null;
  voteThisRound: 'YES' | 'NO' | 'UNKNOWN';
} {
  const r = state.round;
  const afterRound = (): Upcoming =>
    r >= state.config.rounds ? { kind: 'GAME_OVER', round: r } : { kind: 'REPORT', round: r + 1 };

  switch (state.phase) {
    case 'ROLES':
      return { next: { kind: 'REPORT', round: 1 }, voteThisRound: 'UNKNOWN' };
    case 'REPORT':
      return { next: { kind: 'TALK', round: r }, voteThisRound: 'UNKNOWN' };
    case 'TALK':
      return { next: { kind: 'ACT', round: r }, voteThisRound: 'UNKNOWN' };
    case 'ACT':
      return { next: { kind: 'RESOLVE', round: r }, voteThisRound: 'UNKNOWN' };
    case 'RESOLVE':
      return shouldVote(state)
        ? { next: { kind: 'VOTE', round: r }, voteThisRound: 'YES' }
        : { next: afterRound(), voteThisRound: 'NO' };
    case 'VOTE': {
      const result = state.vote?.result;
      if (!result) return { next: { kind: 'VOTE_RESULT', round: r }, voteThisRound: 'YES' };
      if (result.kind === 'RUNOFF') return { next: { kind: 'RUNOFF', round: r }, voteThisRound: 'YES' };
      return { next: afterRound(), voteThisRound: 'YES' };
    }
    default:
      return { next: null, voteThisRound: 'UNKNOWN' };
  }
}

/** After the last round completes with an alien alive, the ship reaches the relay. */
export function checkEndOfGame(state: GameState): GameState {
  const s = structuredClone(state);
  if (s.winner) return s;
  if (livingMimics(s).length === 0) {
    s.winner = 'CREW';
    s.winReason = 'ALL_MIMICS_FOUND';
    s.phase = 'GAME_OVER';
    return s;
  }
  if (s.round >= s.config.rounds) {
    s.winner = 'MIMIC';
    s.winReason = 'REACHED_THE_RELAY';
    s.phase = 'GAME_OVER';
  }
  return s;
}

export { ROOMS, ROOM_NAMES, ADJACENCY, BREAKABLE, PIPES, focusTiles, UNLIMITED };
export type { Player, SettingsInput };
