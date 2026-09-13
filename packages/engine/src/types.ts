export type RoomId = 'steering' | 'reactor' | 'cargo' | 'medbay' | 'oxygen';
export type Intent = 'WORK' | 'BREAK' | 'CORRUPT' | 'STEAL';
export type Role = 'CREW' | 'MIMIC';
export type Phase =
  | 'LOBBY'
  | 'ROLES'
  | 'REPORT'
  | 'TALK'
  | 'ACT'
  | 'RESOLVE'
  | 'VOTE'
  | 'GAME_OVER';

export type ActionButton = 'WORK' | 'SABO';
export type Balance = -2 | -1 | 0 | 1 | 2;
/** How hard the seated bots play and how carefully they talk. */
export type BotSkill = 'EASY' | 'NORMAL' | 'HARD';

/**
 * One line of bot table talk, shown on the monitor. Built on the server from a role-blind
 * utterance, so the payload carries nothing a phone could not already see.
 */
export interface ChatMessage {
  id: number;
  round: number;
  phase: Phase;
  playerId: string;
  name: string;
  text: string;
  at: number;
}

export interface Player {
  id: string;
  name: string;
  token: string;          // never sent to other clients
  role: Role;             // never sent to other clients while alive
  alive: boolean;
  verified: boolean;
  room: RoomId | null;    // public after RESOLVE
  connected: boolean;
  isBot: boolean;
}

export interface Submission {
  playerId: string;
  room: RoomId;
  focus: RoomId;
  action: ActionButton;
}

export interface DerivedIntent {
  playerId: string;
  room: RoomId;
  intent: Intent;
  target?: RoomId;
  resource?: 'scrap' | 'cells';
}

export interface RoomState {
  id: RoomId;
  broken: boolean;
  fuse: number | null;
}

export interface Ballot {
  voterId: string;
  choice: string | 'SKIP';
}

export interface LogEntry {
  round: number;
  kind: 'SETTINGS' | 'ROUND' | 'VOTE' | 'SCAN' | 'GAME_OVER';
  text: string;
  rooms?: RoomReport[];
  ballots?: Ballot[];
}

export interface RoomReport {
  room: RoomId;
  workers: string[];      // player names, public
  summary: string;
  broken: boolean;
  fuse: number | null;
}

export interface RoundReport {
  round: number;
  infection: number;
  infectionDelta: number;
  rooms: RoomReport[];
  scrap: number;
  powerCells: number;
  repairProgress: number;
  xrayOnline: boolean;
  /** engine-internal, for the eliminated-player spectator view only */
  intents: DerivedIntent[];
}

export interface ResolvedConfig {
  rounds: number;
  repairTarget: number;
  repairSuccessChance: number;
  scanCostCells: number;
  fuseLength: number;
  scrapPerCargoWorker: number;
  cellsPerReactorWorker: number;
  reactorCapCells: number;
  medbaySeats: number;          // Infinity is serialised as a big number
  stealAmount: number;
  sabotagesPerRound: 'team' | 'each';
  aliens: number;
  repairCostScrap: number;
  startingScrap: number;
  startingCells: number;
  allowSelfVote: boolean;
  phaseSeconds: Record<'REPORT' | 'TALK' | 'ACT' | 'RESOLVE' | 'VOTE' | 'ROLES', number>;
}

export interface SettingsInput {
  balance: Balance;
  custom: Partial<CustomSettings> | null;   // null = slider mode
}

export interface CustomSettings {
  aliens: number | 'auto';
  rounds: number;
  repairTarget: number;
  repairSuccessChance: number;
  medbaySeats: number;
  repairCostScrap: number;
  scrapPerCargoWorker: number;
  reactorCapCells: number;
  scanCostCells: number;
  startingScrap: number;
  startingCells: number;
  fuseLength: number;
  stealAmount: number;
  sabotagesPerRound: 'team' | 'each';
  allowSelfVote: boolean;
  phaseSeconds: Partial<ResolvedConfig['phaseSeconds']>;
}

export type VoteStage = 'FIRST' | 'RUNOFF';

export interface VoteState {
  stage: VoteStage;
  candidates: string[];        // player ids eligible to be voted for
  /** Player ids allowed to cast a ballot. In a runoff the candidates sit it out. */
  voters: string[];
  allowSkip: boolean;
  ballots: Ballot[];
  /** revealed after the phase resolves */
  result: VoteOutcome | null;
}

/** Why the round ends without a vote. Public — every part of it is already on the monitor. */
export type VoteSkipReason = 'XRAY_OFFLINE' | 'NOT_ENOUGH_CELLS' | 'TOO_FEW_PLAYERS';

export type VoteOutcome =
  | { kind: 'SKIP' }
  | { kind: 'TIE' }
  | { kind: 'RUNOFF'; candidates: string[] }
  | { kind: 'SCAN'; playerId: string; role: Role };

export interface GameState {
  code: string;
  phase: Phase;
  round: number;
  phaseEndsAt: number;
  players: Player[];
  rooms: Record<RoomId, RoomState>;
  scrap: number;
  powerCells: number;
  repairProgress: number;
  xrayOnline: boolean;
  infection: number;
  log: LogEntry[];
  winner: 'CREW' | 'MIMIC' | null;
  winReason: string | null;
  config: ResolvedConfig;
  settings: SettingsInput;
  submissions: Record<string, Submission>;
  vote: VoteState | null;
  /** Ids of players who have spent their one skip. A skip is worth one ballot per game. */
  skipsUsed: string[];
  lastReport: RoundReport | null;
  seed: number;
  fastPhases: boolean;
  /** No timers: the host moves the game on by hand. */
  manualSteps: boolean;
  /** Ballots are never revealed — only who was scanned, or that nobody was. */
  hiddenVotes: boolean;
  /** How the seated bots play. Lobby-only, like the other modes. */
  botSkill: BotSkill;
  /**
   * Bumped every time the game moves to a new step. The host's Next press carries the step
   * it saw, so a double press (or a held Space bar) can never skip a phase.
   */
  step: number;
}
