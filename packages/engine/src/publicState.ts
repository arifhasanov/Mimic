import { upcomingStep, voteSkipReason, type Upcoming } from './engine.js';
import { ROOMS } from './map.js';
import { settingsLine } from './settings.js';
import type {
  Ballot,
  BotSkill,
  GameState,
  LogEntry,
  Phase,
  ResolvedConfig,
  RoomId,
  RoomReport,
  Role,
  VoteSkipReason,
} from './types.js';

/**
 * Everything the monitor and every phone may see.
 *
 * Deliberately built by an explicit whitelist rather than by deleting keys: a new field
 * on GameState must be opted in here, so it can never leak by accident. Note that no key
 * is named `role`, `token`, `intent`, `focus` or `action` at any depth (see the test).
 */
export interface PublicPlayer {
  id: string;
  name: string;
  alive: boolean;
  verified: boolean;
  room: RoomId | null;
  connected: boolean;
  /** A seated bot. Public so the monitor can badge it and show the crew chat tab. */
  isBot: boolean;
  /** Only ever set once a scan has made it public, or at game over. */
  revealed: Role | null;
}

export interface PublicVote {
  stage: 'FIRST' | 'RUNOFF';
  candidates: string[];
  /** Who may cast a ballot. In a runoff the candidates are not on this list. */
  voters: string[];
  allowSkip: boolean;
  /** Empty while the vote is running — choices are revealed only once it resolves. */
  ballots: Ballot[];
  voted: string[];
  result:
    | { kind: 'SKIP' }
    | { kind: 'TIE' }
    | { kind: 'RUNOFF'; candidates: string[] }
    | { kind: 'SCAN'; playerId: string; revealed: Role }
    | null;
}

export interface PublicReport {
  round: number;
  rooms: RoomReport[];
  scrap: number;
  powerCells: number;
  repairProgress: number;
  xrayOnline: boolean;
}

export interface PublicState {
  code: string;
  phase: Phase;
  round: number;
  phaseEndsAt: number;
  serverNow: number;
  players: PublicPlayer[];
  rooms: { id: RoomId; broken: boolean; fuse: number | null }[];
  scrap: number;
  powerCells: number;
  repairProgress: number;
  xrayOnline: boolean;
  log: LogEntry[];
  winner: 'CREW' | 'MIMIC' | null;
  winReason: string | null;
  config: ResolvedConfig;
  balance: number;
  isCustom: boolean;
  settingsLine: string;
  lastReport: PublicReport | null;
  vote: PublicVote | null;
  /** During ACT only, and only as a count. Updated on a 5-second tick by the server. */
  lockedIn: number;
  livingCount: number;
  fastPhases: boolean;
  manualSteps: boolean;
  hiddenVotes: boolean;
  botSkill: BotSkill;
  step: number;
  /** What the game does next — shown on the monitor so the table knows what is coming. */
  upcoming: Upcoming | null;
  /** Whether this round ends in a vote. Only knowable once the round has resolved. */
  voteThisRound: 'YES' | 'NO' | 'UNKNOWN';
  /** Which of the three scan conditions is missing right now, so the monitor can say so. */
  voteSkipReason: VoteSkipReason | null;
  /**
   * Manual steps only: the server time from which the host's Next press is accepted. A fresh
   * step settles for a moment first, and Act and the ballot wait for the players still in
   * them, so a held Space bar can never blow through a phase before anyone has answered.
   * 0 means "any time".
   */
  stepReadyAt: number;
}

export function toPublicState(state: GameState, lockedIn = 0, stepReadyAt = 0): PublicState {
  const over = state.phase === 'GAME_OVER';
  // With hidden votes the ballots themselves never leave the server — not in the live vote,
  // not in the log, not at game over. Only the outcome does.
  const hide = state.hiddenVotes;
  const { next, voteThisRound } = upcomingStep(state);
  return {
    code: state.code,
    phase: state.phase,
    round: state.round,
    phaseEndsAt: state.phaseEndsAt,
    serverNow: Date.now(),
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      alive: p.alive,
      verified: p.verified,
      room: p.room,
      connected: p.connected,
      isBot: p.isBot,
      revealed: over || !p.alive ? p.role : null,
    })),
    rooms: ROOMS.map((id) => ({
      id,
      broken: state.rooms[id].broken,
      fuse: state.rooms[id].fuse,
    })),
    scrap: state.scrap,
    powerCells: state.powerCells,
    repairProgress: state.repairProgress,
    xrayOnline: state.xrayOnline,
    log: state.log.map((e) => {
      const entry = { ...e };
      if (hide) delete entry.ballots;
      return entry;
    }),
    winner: state.winner,
    winReason: state.winReason,
    config: { ...state.config, phaseSeconds: { ...state.config.phaseSeconds } },
    balance: state.settings.balance,
    isCustom: !!state.settings.custom,
    settingsLine: settingsLine(state.config, state.settings, state.players.length, state),
    lastReport: state.lastReport
      ? {
          round: state.lastReport.round,
          rooms: state.lastReport.rooms.map((r) => ({ ...r })),
          scrap: state.lastReport.scrap,
          powerCells: state.lastReport.powerCells,
          repairProgress: state.lastReport.repairProgress,
          xrayOnline: state.lastReport.xrayOnline,
        }
      : null,
    vote: state.vote
      ? {
          stage: state.vote.stage,
          candidates: state.vote.candidates.slice(),
          voters: state.vote.voters.slice(),
          allowSkip: state.vote.allowSkip,
          ballots: state.vote.result && !hide ? state.vote.ballots.map((b) => ({ ...b })) : [],
          voted: state.vote.ballots.map((b) => b.voterId),
          result:
            state.vote.result === null
              ? null
              : state.vote.result.kind === 'SCAN'
                ? {
                    kind: 'SCAN',
                    playerId: state.vote.result.playerId,
                    revealed: state.vote.result.role,
                  }
                : state.vote.result,
        }
      : null,
    lockedIn,
    livingCount: state.players.filter((p) => p.alive).length,
    fastPhases: state.fastPhases,
    manualSteps: state.manualSteps,
    hiddenVotes: state.hiddenVotes,
    botSkill: state.botSkill,
    step: state.step,
    upcoming: next,
    voteThisRound,
    voteSkipReason: voteSkipReason(state),
    stepReadyAt,
  };
}

/** The eliminated-player view: everything, including who did what this round. */
export function toSpectatorState(state: GameState) {
  return {
    players: state.players.map((p) => ({
      id: p.id,
      name: p.name,
      trueRole: p.role,
      alive: p.alive,
      room: p.room,
    })),
    intents: state.lastReport ? state.lastReport.intents.map((i) => ({ ...i })) : [],
  };
}
