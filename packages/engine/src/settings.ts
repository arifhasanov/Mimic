import type { Balance, CustomSettings, ResolvedConfig, SettingsInput } from './types.js';

/** Stand-in for Infinity so the config survives JSON. Any value >= this reads as "unlimited". */
export const UNLIMITED = 99;

export const DEFAULT_PHASE_SECONDS: ResolvedConfig['phaseSeconds'] = {
  ROLES: 30,
  REPORT: 20,
  TALK: 150,
  ACT: 60,
  RESOLVE: 30,
  VOTE: 60,
};

export function aliensFor(playerCount: number): number {
  return playerCount <= 5 ? 1 : playerCount <= 9 ? 2 : 3;
}

/** cap / scan / rounds, by slider position and table size. Section 20. */
const SLIDER: Record<Balance, { small: [number, number, number]; large: [number, number, number] }> = {
  [-2]: { small: [4, 3, 10], large: [6, 4, 12] },
  [-1]: { small: [4, 4, 10], large: [6, 4, 11] },
  [0]: { small: [3, 4, 10], large: [6, 5, 10] },
  [1]: { small: [3, 5, 10], large: [6, 6, 10] },
  [2]: { small: [3, 6, 10], large: [5, 7, 10] },
};

/** Simulated crew win %, average table. Data, not code — playtests will refine it. */
const WIN_ESTIMATE: Record<number, [number, number, number, number, number]> = {
  5: [99, 97, 87, 74, 62],
  6: [94, 80, 53, 32, 17],
  7: [97, 89, 59, 41, 23],
  8: [95, 88, 60, 40, 26],
  9: [93, 84, 55, 41, 31],
  10: [94, 81, 58, 43, 15],
  11: [94, 79, 60, 50, 21],
  12: [84, 69, 53, 46, 17],
};

export function crewWinEstimate(balance: Balance, playerCount: number): number | null {
  const row = WIN_ESTIMATE[playerCount];
  if (!row) return null;
  return row[balance + 2];
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const clampInt = (v: number, lo: number, hi: number) => clamp(Math.round(v), lo, hi);

export function defaultSettings(): SettingsInput {
  return { balance: 0, custom: null };
}

/**
 * Turn the host's slider / custom form into the flat Config the engine reads.
 * The engine never sees the slider.
 */
export function resolveSettings(input: SettingsInput, playerCount: number): ResolvedConfig {
  const balance = (clampInt(input.balance ?? 0, -2, 2) as Balance);
  const large = playerCount >= 10;
  const [cap, scan, rounds] = large ? SLIDER[balance].large : SLIDER[balance].small;

  const base: ResolvedConfig = {
    rounds,
    repairTarget: 6,
    repairSuccessChance: 0.6,
    scanCostCells: scan,
    fuseLength: 3,
    scrapPerCargoWorker: 2,
    cellsPerReactorWorker: 1,
    reactorCapCells: cap,
    medbaySeats: UNLIMITED,
    stealAmount: 2,
    sabotagesPerRound: 'team',
    aliens: aliensFor(playerCount),
    repairCostScrap: 1,
    startingScrap: 2,
    startingCells: 0,
    allowSelfVote: true,
    phaseSeconds: { ...DEFAULT_PHASE_SECONDS },
  };

  const c = input.custom;
  if (!c) return base;

  // Custom starts from the slider values and overrides key by key. Out-of-range values
  // are clamped, never rejected — custom is allowed to be unbalanced.
  const out: ResolvedConfig = { ...base, phaseSeconds: { ...base.phaseSeconds } };
  const has = <K extends keyof CustomSettings>(k: K) => c[k] !== undefined && c[k] !== null;

  if (has('aliens')) out.aliens = c.aliens === 'auto' ? aliensFor(playerCount) : clampInt(c.aliens as number, 1, 4);
  if (has('rounds')) out.rounds = clampInt(c.rounds!, 6, 14);
  if (has('repairTarget')) out.repairTarget = clampInt(c.repairTarget!, 4, 12);
  if (has('repairSuccessChance')) out.repairSuccessChance = clamp(c.repairSuccessChance!, 0.3, 0.8);
  if (has('medbaySeats')) {
    const v = c.medbaySeats!;
    out.medbaySeats = v >= UNLIMITED ? UNLIMITED : clampInt(v, 2, 12);
  }
  if (has('repairCostScrap')) out.repairCostScrap = clampInt(c.repairCostScrap!, 1, 2);
  if (has('scrapPerCargoWorker')) out.scrapPerCargoWorker = clampInt(c.scrapPerCargoWorker!, 1, 3);
  if (has('reactorCapCells')) out.reactorCapCells = clampInt(c.reactorCapCells!, 1, 8);
  if (has('scanCostCells')) out.scanCostCells = clampInt(c.scanCostCells!, 2, 8);
  if (has('startingScrap')) out.startingScrap = clampInt(c.startingScrap!, 0, 6);
  if (has('startingCells')) out.startingCells = clampInt(c.startingCells!, 0, 6);
  if (has('fuseLength')) out.fuseLength = clampInt(c.fuseLength!, 2, 5);
  if (has('stealAmount')) out.stealAmount = clampInt(c.stealAmount!, 1, 4);
  if (has('sabotagesPerRound')) out.sabotagesPerRound = c.sabotagesPerRound === 'each' ? 'each' : 'team';
  if (has('allowSelfVote')) out.allowSelfVote = !!c.allowSelfVote;

  const ps = c.phaseSeconds;
  if (ps) {
    if (ps.TALK !== undefined) out.phaseSeconds.TALK = clampInt(ps.TALK, 30, 600);
    if (ps.ACT !== undefined) out.phaseSeconds.ACT = clampInt(ps.ACT, 20, 180);
    if (ps.VOTE !== undefined) out.phaseSeconds.VOTE = clampInt(ps.VOTE, 20, 180);
    if (ps.REPORT !== undefined) out.phaseSeconds.REPORT = clampInt(ps.REPORT, 5, 60);
    if (ps.RESOLVE !== undefined) out.phaseSeconds.RESOLVE = clampInt(ps.RESOLVE, 10, 90);
  }

  return out;
}

const BALANCE_LABELS: Record<Balance, string> = {
  [-2]: 'Crew++',
  [-1]: 'Crew+',
  [0]: 'Balanced',
  [1]: 'Mimic+',
  [2]: 'Mimic++',
};

/** The plain-words settings line shown on the monitor's lobby and repeated on game over. */
export function settingsLine(
  config: ResolvedConfig,
  settings: SettingsInput,
  playerCount: number,
  modes: { manualSteps?: boolean; hiddenVotes?: boolean } = {},
): string {
  const mode = settings.custom ? 'Custom' : BALANCE_LABELS[settings.balance];
  return [
    `${playerCount} players`,
    `${config.aliens} ${config.aliens === 1 ? 'Mimic' : 'Mimics'}`,
    mode,
    `${config.rounds} rounds`,
    `scans cost ${config.scanCostCells} cells`,
    `Reactor makes up to ${config.reactorCapCells} cells a round`,
    ...(modes.manualSteps ? ['manual steps'] : []),
    ...(modes.hiddenVotes ? ['votes hidden'] : []),
  ].join(' · ');
}

export { BALANCE_LABELS };
