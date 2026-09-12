import {
  ADJACENCY,
  BREAKABLE,
  ROOMS,
  focusTiles,
  isLegalBreak,
  livingPlayers,
  type ActionButton,
  type BotSkill,
  type GameState,
  type Player,
  type Rng,
  type RoomId,
} from '@mimic/engine';

/**
 * The bot's mind. Everything here is built from what the monitor shows — the round report,
 * the resource counters, the visible ballots — so a bot reasons exactly like a careful human
 * at the table. The only role-aware code is the Mimic planner and the Mimic ballot, which
 * *choose* differently but never say anything a crew member could not have said.
 */

export type Personality = 'terse' | 'analytical' | 'nervous' | 'joker';
export const PERSONALITIES: Personality[] = ['analytical', 'joker', 'terse', 'nervous'];

/** Why a bot is going where it is going. Public, plausible, and the same words for both roles. */
export type Why = 'repair' | 'guard' | 'scrap' | 'cells' | 'medbay';

/**
 * BREAK: stood where the broken room could be reached from. STEAL: in a room whose counter
 * came up short by more than one worker's output. SLACK: in a producing room that came up
 * exactly one worker short — a saboteur does not produce, whatever the sabotage was.
 */
export type EvidenceKind = 'BREAK' | 'STEAL' | 'SLACK' | 'MEDBAY' | 'IDLE' | 'SHIELD' | 'PUSHED';

export interface Evidence {
  round: number;
  kind: EvidenceKind;
  /** The room that broke, was stolen from, or was pointlessly occupied. */
  room?: RoomId;
  /** Everyone this piece of evidence points at. */
  suspects: string[];
  /** Original public occupants; private exclusions must not become claims of being alone. */
  witnesses?: string[];
  weight: number;
}

export interface BotChoice {
  room: RoomId;
  focus: RoomId;
  action: ActionButton;
}

export type BallotReason = 'EVIDENCE' | 'VERIFY' | 'NO_LEAD' | 'SAVE_CELLS' | 'RUNOFF' | 'FORCED';

export interface BotMind {
  id: string;
  personality: Personality;
  skill: BotSkill;
  /** Accumulated evidence per player id, including the bot's own entry (how it looks to others). */
  suspicion: Record<string, number>;
  /** How much weight another player's accusations carry with this bot. */
  trust: Record<string, number>;
  evidence: Evidence[];
  /** Target id → the round it was last accused out loud, so a bot does not repeat itself. */
  accused: Record<string, number>;
  /** Accusations heard this game: who blamed whom, and when. */
  heard: { speaker: string; target: string; round: number }[];
  /** Decided during Talk, submitted during Act, so what a bot announces is what it does. */
  plan: (BotChoice & { why: Why; announce: RoomId }) | null;
  lastBallot: { round: number; choice: string; reason: BallotReason; evidence: Evidence | null } | null;
  /** Mimic only: the crew member this bot is steering the table towards. */
  scapegoat: string | null;
  /** Mimic only: rounds left of playing it straight because the heat is on. */
  layLow: number;
  /** Semantic claims already made, independent of their wording. */
  spoken: Record<string, number>;
}

/** What the state looked like when Act opened, so the report can be read against it. */
export interface ActSnapshot {
  round: number;
  scrap: number;
  powerCells: number;
  broken: RoomId[];
  xrayOnline: boolean;
  repairProgress: number;
}

export function snapshot(state: GameState): ActSnapshot {
  return {
    round: state.round,
    scrap: state.scrap,
    powerCells: state.powerCells,
    broken: ROOMS.filter((r) => state.rooms[r].broken),
    xrayOnline: state.xrayOnline,
    repairProgress: state.repairProgress,
  };
}

export function createMind(id: string, personality: Personality, skill: BotSkill): BotMind {
  return {
    id,
    personality,
    skill,
    suspicion: {},
    trust: {},
    evidence: [],
    accused: {},
    heard: [],
    plan: null,
    lastBallot: null,
    scapegoat: null,
    layLow: 0,
    spoken: {},
  };
}

// ---------------------------------------------------------------------------
// Tunables by skill. EASY is noisy and forgetful, HARD is cold.
// ---------------------------------------------------------------------------

const TUNE: Record<BotSkill, { noise: number; decay: number; voteAt: number; accuseAt: number; wander: number }> = {
  EASY: { noise: 0.9, decay: 0.7, voteAt: 0.8, accuseAt: 0.7, wander: 0.35 },
  NORMAL: { noise: 0.3, decay: 0.85, voteAt: 1.2, accuseAt: 1.0, wander: 0.1 },
  HARD: { noise: 0.0, decay: 0.9, voteAt: 1.4, accuseAt: 1.2, wander: 0.0 },
};

export const tune = (skill: BotSkill) => TUNE[skill];

const W = { BREAK: 4, STEAL: 4, SLACK: 3, MEDBAY: 1.2, IDLE: 0.6, SHIELD: 0.5, PUSHED: 0.4, LISTEN: 0.35 };

const byId = (state: GameState) => {
  const map: Record<string, Player> = {};
  for (const p of state.players) map[p.id] = p;
  return map;
};
const idByName = (state: GameState) => {
  const map: Record<string, string> = {};
  for (const p of state.players) map[p.name] = p.id;
  return map;
};

/** Rooms a break of `target` can be launched from. Mirrors isLegalBreak, ignoring "already broken". */
export function breakers(target: RoomId): RoomId[] {
  // The Med bay can only be smashed from a neighbour, never from inside it.
  if (target === 'medbay') return ADJACENCY.medbay.slice();
  if (!BREAKABLE[target]) return [];
  const out = ADJACENCY[target].slice();
  if (target === 'steering' || target === 'oxygen') out.push(target);
  return out;
}

// ---------------------------------------------------------------------------
// Reading the round report — the public part of thinking.
// ---------------------------------------------------------------------------

function addEvidence(mind: BotMind, ev: Evidence, rng: Rng) {
  if (!ev.suspects.length) return;
  mind.evidence.push(ev);
  const t = tune(mind.skill);
  const share = ev.weight / ev.suspects.length;
  for (const id of ev.suspects) {
    const noise = t.noise ? (rng.next() - 0.5) * 2 * t.noise * share : 0;
    mind.suspicion[id] = (mind.suspicion[id] ?? 0) + share + noise;
  }
}

export interface ReadReport {
  occupants: Record<RoomId, string[]>;
  /** Rooms that broke this round, whether or not they were repaired straight away. */
  breaks: RoomId[];
  repaired: RoomId[];
  /** Where something went missing: 'reactor' for cells, 'cargo' for scrap. */
  stolen: RoomId[];
  /** Producing rooms that came up exactly one worker short: someone in there was not working. */
  slack: RoomId[];
  /** Med bay attempts actually paid for, and repairs gained. */
  paid: number;
  repairs: number;
  xrayUp: boolean;
}

/**
 * Read the round report against the Act-time snapshot. The counters are deterministic once the
 * occupants are known, so any shortfall is a theft; a room "repaired" that was not broken when
 * Act opened was broken and fixed in the same round.
 */
export function readReport(state: GameState, before: ActSnapshot): ReadReport {
  const report = state.lastReport!;
  const cfg = state.config;
  const ids = idByName(state);
  const occupants = {} as Record<RoomId, string[]>;
  for (const r of ROOMS) occupants[r] = [];
  for (const r of report.rooms) occupants[r.room] = r.workers.map((n) => ids[n]).filter(Boolean);

  const breaks: RoomId[] = [];
  const repaired: RoomId[] = [];
  for (const r of report.rooms) {
    const wasBroken = before.broken.includes(r.room);
    if (r.summary.includes('repaired')) repaired.push(r.room);
    if ((r.broken && !wasBroken) || (!wasBroken && r.summary.includes('repaired'))) breaks.push(r.room);
    // The Med bay never reads as "broken" — a smash shows up as a lost repair instead.
    if (r.room === 'medbay' && r.summary.includes('smashed')) breaks.push('medbay');
  }

  const stolen: RoomId[] = [];
  const slack: RoomId[] = [];
  const reactorWorkers = Math.max(0, occupants.reactor.length - (repaired.includes('reactor') ? 1 : 0));
  const production = (room: RoomId) => Number(/\+(\d+)/.exec(report.rooms.find(r => r.room === room)?.summary ?? '')?.[1] ?? 0);
  const cellsMade = production('reactor');
  const cellsStolen = before.powerCells + cellsMade - report.powerCells;
  if (cellsStolen > 0) stolen.push('reactor');
  else if (cellsMade < Math.min(reactorWorkers * cfg.cellsPerReactorWorker, cfg.reactorCapCells)) slack.push('reactor');

  const scrapMade = production('cargo');
  const scrapBefore = before.scrap + scrapMade;
  const attempts = Math.min(occupants.medbay.length, cfg.medbaySeats);
  const paid = Math.min(attempts, Math.floor(scrapBefore / cfg.repairCostScrap));
  // Spending and corruption can be ambiguous; only call theft when even maximal spending
  // cannot explain the missing stock. Lost cargo production is independently observable.
  const scrapShort = scrapBefore - paid * cfg.repairCostScrap - report.scrap;
  if (scrapShort > 0) stolen.push('cargo');
  else if (scrapMade < occupants.cargo.length * cfg.scrapPerCargoWorker) slack.push('cargo');

  const med = report.rooms.find((r) => r.room === 'medbay');
  const repairs = Number(/\+(\d+) repair/.exec(med?.summary ?? '')?.[1] ?? 0);
  return { occupants, breaks, repaired, stolen, slack, paid, repairs, xrayUp: !before.xrayOnline && report.xrayOnline };
}

/**
 * Absorb the report that closed the round. `before` is the Act-time snapshot. The bot excludes
 * itself from every suspect list — it knows what it did — and keeps a separate "heat" entry
 * for itself so a Mimic can tell how it looks from the outside.
 */
export function absorbRound(mind: BotMind, state: GameState, before: ActSnapshot, rng: Rng) {
  const report = state.lastReport;
  if (!report || report.round !== before.round) return;
  const cfg = state.config;
  const t = tune(mind.skill);
  for (const id of Object.keys(mind.suspicion)) mind.suspicion[id] *= t.decay;

  const players = byId(state);
  const r = readReport(state, before);
  const usable = (list: string[]) =>
    list.filter((id) => id !== mind.id && players[id] && players[id].alive && !players[id].verified);
  const push = (kind: EvidenceKind, suspects: string[], weight: number, room?: RoomId) => {
    addEvidence(mind, { round: report.round, kind, room, suspects: usable(suspects), witnesses: suspects.slice(), weight }, rng);
    // How the table sees me: the same share, on my own entry.
    if (suspects.includes(mind.id))
      mind.suspicion[mind.id] = (mind.suspicion[mind.id] ?? 0) + weight / Math.max(1, suspects.length);
  };

  for (const room of r.breaks) push('BREAK', breakers(room).flatMap((from) => r.occupants[from]), W.BREAK, room);
  for (const room of r.stolen) push('STEAL', r.occupants[room], W.STEAL, room);
  for (const room of r.slack) push('SLACK', r.occupants[room], W.SLACK, room);

  // A poor Med bay round is weak evidence — and none at all if the team's one sabotage was a break.
  const teamMode = cfg.sabotagesPerRound === 'team';
  if (r.paid >= 2 && !(teamMode && (r.breaks.length || r.stolen.length || r.slack.length)) && r.repairs <= r.paid * cfg.repairSuccessChance - 1)
    push('MEDBAY', r.occupants.medbay, W.MEDBAY, 'medbay');

  // Cargo and Med bay reserves can repair a same-round scanner smash. Location alone
  // is not evidence of disloyalty, even when another allocation would have been better.
}

/** Visible ballots after a scan: who shielded a Mimic, who pushed a scan onto crew. */
export function absorbVote(mind: BotMind, state: GameState, rng: Rng) {
  const vote = state.vote;
  if (!vote || !vote.result || state.hiddenVotes) return;
  const players = byId(state);
  const living = livingPlayers(state).map((p) => p.id);
  const voterOf = (id: string) => vote.ballots.find((b) => b.voterId === id)?.choice;

  if (vote.result.kind !== 'SCAN') return;
  const target = vote.result.playerId;
  const caught = vote.result.role === 'MIMIC';
  const round = state.round;

  if (caught) {
    for (const id of living) {
      if (id === target || id === mind.id) continue;
      if (voterOf(id) === target) {
        mind.suspicion[id] = (mind.suspicion[id] ?? 0) - 0.5;
        mind.trust[id] = (mind.trust[id] ?? 1) + 0.4;
      } else if (voterOf(id) !== undefined && !players[id].verified) {
        addEvidence(mind, { round, kind: 'SHIELD', suspects: [id], weight: W.SHIELD }, rng);
      }
    }
    // Whoever named the Mimic out loud before the scan earns trust.
    for (const h of mind.heard) {
      if (h.target === target) mind.trust[h.speaker] = (mind.trust[h.speaker] ?? 1) + 0.5;
    }
  } else {
    for (const id of living) {
      if (id === target || id === mind.id || players[id].verified) continue;
      if (voterOf(id) === target)
        addEvidence(mind, { round, kind: 'PUSHED', suspects: [id], weight: W.PUSHED }, rng);
    }
    for (const h of mind.heard)
      if (h.target === target) mind.trust[h.speaker] = Math.max(0.2, (mind.trust[h.speaker] ?? 1) - 0.3);
  }
}

/** Another player accused someone out loud. Nudge, weighted by trust — never swallow whole. */
export function hear(mind: BotMind, speaker: string, target: string, state: GameState) {
  if (speaker === mind.id) return;
  if (state.players.find(p => p.id === target)?.verified) return;
  if (mind.heard.some(h => h.speaker === speaker && h.target === target && h.round === state.round)) return;
  mind.heard.push({ speaker, target, round: state.round });
  if (target === mind.id) return;
  const trust = Math.min(2, mind.trust[speaker] ?? 1);
  mind.suspicion[target] = (mind.suspicion[target] ?? 0) + W.LISTEN * trust;
}

/** Living, unverified, not me — ranked. Mimic minds pass their teammates to leave them out. */
export function suspects(mind: BotMind, state: GameState, exclude: string[] = []) {
  return livingPlayers(state)
    .filter((p) => p.id !== mind.id && !p.verified && !exclude.includes(p.id))
    .map((p) => ({ id: p.id, score: mind.suspicion[p.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);
}

/** The strongest thing this bot can say against `target`. */
export function evidenceAgainst(mind: BotMind, target: string): Evidence | null {
  const list = mind.evidence.filter((e) => e.suspects.includes(target));
  if (!list.length) return null;
  const rank = (e: Evidence) => e.weight / e.suspects.length + e.round * 0.01;
  return list.sort((a, b) => rank(b) - rank(a))[0];
}

// ---------------------------------------------------------------------------
// The table plan — what a sensible crew does this round, from public state only.
// ---------------------------------------------------------------------------

export interface Slot {
  room: RoomId;
  why: Why;
}

/**
 * Greedy marginal-value allocation for every living player. Repairs first, then the rooms
 * that still matter: before the X-ray, scrap feeds the Med bay and the Reactor banks cells;
 * after it, reserve funded attempts against a same-round scanner smash and bank scan cells.
 */
export function tablePlan(state: GameState): { slots: Slot[]; counts: Record<RoomId, number> } {
  const cfg = state.config;
  const n = livingPlayers(state).length;
  const counts = {} as Record<RoomId, number>;
  for (const r of ROOMS) counts[r] = 0;
  const remaining = cfg.repairTarget - state.repairProgress;

  const value = (room: RoomId, k: number): [number, Why] => {
    if (state.rooms[room].broken) {
      if (k === 0) return [100 + ((state.rooms[room].fuse ?? 9) <= 1 ? 50 : 0), 'repair'];
      k -= 1; // the repairer is spent; the rest work as normal
    }
    switch (room) {
      case 'reactor': {
        if ((k + 1) * cfg.cellsPerReactorWorker > cfg.reactorCapCells) return [0, 'cells'];
        const bank = state.powerCells + k * cfg.cellsPerReactorWorker;
        if (state.xrayOnline) return [bank < cfg.scanCostCells ? 9 : bank < cfg.scanCostCells * 2 ? 5 : 3, 'cells'];
        return [bank < cfg.scanCostCells ? 5.5 : 3, 'cells'];
      }
      case 'cargo': {
        const desired =
          cfg.repairCostScrap * (state.xrayOnline ? Math.min(2, cfg.medbaySeats) : Math.min(cfg.medbaySeats, 4, Math.ceil(remaining / cfg.repairSuccessChance)));
        const have = state.scrap + k * cfg.scrapPerCargoWorker;
        return [have < desired ? 7 - k : state.xrayOnline ? 0 : 1, 'scrap'];
      }
      case 'medbay': {
        if (k >= cfg.medbaySeats) return [0, 'medbay'];
        if (state.xrayOnline && k >= 2) return [0, 'medbay'];
        const budget = state.scrap + counts.cargo * cfg.scrapPerCargoWorker;
        if ((k + 1) * cfg.repairCostScrap > budget) return [0.5, 'medbay'];
        if (state.xrayOnline) return [k < 2 ? 6.5 - k * .5 : 0, 'medbay'];
        if (k >= Math.ceil(remaining / cfg.repairSuccessChance) + 1) return [1, 'medbay'];
        return [6, 'medbay'];
      }
      default: {
        // steering / oxygen: worth a guard once the X-ray is up and the Mimics have only breaks left.
        if (state.xrayOnline && k === 0) return [4, 'guard'];
        return [0, 'guard'];
      }
    }
  };

  const slots: Slot[] = [];
  for (let i = 0; i < n; i++) {
    let best: RoomId = 'reactor';
    let bestValue = -1;
    let bestWhy: Why = 'cells';
    for (const room of ROOMS) {
      const [v, why] = value(room, counts[room]);
      if (v > bestValue) {
        best = room;
        bestValue = v;
        bestWhy = why;
      }
    }
    counts[best] += 1;
    slots.push({ room: best, why: bestWhy });
  }
  return { slots, counts };
}

/** Rotate duties so the same seats do not monopolize one room throughout the game. */
export function ownSlot(mind: BotMind, state: GameState, plan: { slots: Slot[] }): Slot {
  const bots = livingPlayers(state)
    .filter((p) => p.isBot)
    .map((p) => p.id)
    .sort();
  const offset = Math.max(0, state.round - 1) % Math.max(1, bots.length);
  const i = (Math.max(0, bots.indexOf(mind.id)) + offset) % Math.max(1, bots.length);
  return plan.slots[i % plan.slots.length] ?? { room: 'reactor', why: 'cells' };
}

// ---------------------------------------------------------------------------
// Deciding the round. Called once when Talk opens; Act submits the result.
// ---------------------------------------------------------------------------

function blend(mind: BotMind, state: GameState, rng: Rng, plan: ReturnType<typeof tablePlan>) {
  const t = tune(mind.skill);
  let slot = ownSlot(mind, state, plan);
  if (t.wander && rng.chance(t.wander)) {
    const room = rng.pick(ROOMS);
    slot = { room, why: whyFor(state, room) };
  }
  mind.plan = {
    room: slot.room,
    focus: rng.pick(focusTiles(slot.room)),
    action: rng.chance(0.5) ? 'WORK' : 'SABO', // crew press both, as the rulebook says
    why: slot.why,
    announce: slot.room,
  };
}

/** The plausible public reason for standing in a room. */
export function whyFor(state: GameState, room: RoomId): Why {
  if (state.rooms[room].broken) return 'repair';
  if (room === 'reactor') return 'cells';
  if (room === 'cargo') return 'scrap';
  if (room === 'medbay') return 'medbay';
  return 'guard';
}

interface Sabotage extends BotChoice {
  value: number;
}

/**
 * Every legal sabotage, scored for impact and cover. Cover is how many other people the plan
 * puts in rooms that could have done it: alone means caught.
 */
function sabotages(mind: BotMind, state: GameState, plan: ReturnType<typeof tablePlan>): Sabotage[] {
  const cfg = state.config;
  const counts = { ...plan.counts };
  // The saboteur gives up its assigned work. Do not count that work as cover or repair.
  counts[ownSlot(mind, state, plan).room] = Math.max(0, counts[ownSlot(mind, state, plan).room] - 1);
  const roundsLeft = cfg.rounds - state.round;
  const brokenNow = ROOMS.filter((r) => state.rooms[r].broken).length;
  const cover = (others: number) => {
    const c = (others + 0.5) / (others + 1.5);
    return mind.skill === 'HARD' ? Math.pow(c, 1.5) : c;
  };
  // Standing where the plan puts nobody looks odd, before the X-ray especially.
  const oddness = (room: RoomId) => (counts[room] === 0 && !state.rooms[room].broken ? 0.6 : 1);
  const out: Sabotage[] = [];

  for (const target of ROOMS) {
    if (!BREAKABLE[target] || state.rooms[target].broken) continue;
    const others = breakers(target).reduce((n, r) => n + counts[r], 0);
    let base = 10;
    if (target === 'reactor' && state.xrayOnline) base += 6;
    if (roundsLeft >= cfg.fuseLength && counts[target] === 0) base += 4;
    if (brokenNow >= 1) base += 4;
    base += counts[target] === 0 ? 5 : -6; // an occupied room is repaired the same round
    for (const room of breakers(target)) {
      if (!isLegalBreak(state, room, target)) continue;
      out.push({ room, focus: target, action: 'SABO', value: base * cover(others) * oddness(room) });
    }
  }

  // Once the X-ray works, smashing the Med bay from next door knocks a repair off the track
  // and takes the scanner offline — worth most when the cell pool is too deep to drain.
  if (state.xrayOnline) {
    const cells =
      state.powerCells + Math.min(counts.reactor * cfg.cellsPerReactorWorker, cfg.reactorCapCells);
    const funded = Math.min(counts.medbay, cfg.medbaySeats, Math.floor((state.scrap + counts.cargo * cfg.scrapPerCargoWorker) / cfg.repairCostScrap));
    const staysOffline = Math.pow(1 - cfg.repairSuccessChance, funded);
    const base = 4 + (cells >= cfg.scanCostCells ? 24 : 10) * staysOffline;
    const from = breakers('medbay');
    const others = from.reduce((n, r) => n + counts[r], 0);
    for (const room of from)
      out.push({ room, focus: 'medbay', action: 'SABO', value: base * cover(others) * oddness(room) });
  }

  const remaining = cfg.repairTarget - state.repairProgress;
  const budget = state.scrap + counts.cargo * cfg.scrapPerCargoWorker;
  if (!state.xrayOnline && budget >= cfg.repairCostScrap && counts.medbay > 0) {
    const v = 7 + (remaining <= 2 ? 6 : 0) + (counts.medbay >= 3 ? 2 : 0);
    out.push({ room: 'medbay', focus: 'medbay', action: 'SABO', value: v * cover(counts.medbay) });
  }

  const cellsAfter =
    state.powerCells + Math.min(counts.reactor * cfg.cellsPerReactorWorker, cfg.reactorCapCells);
  if (state.powerCells > 0) {
    let v = state.xrayOnline ? 8 : 3;
    if (state.xrayOnline && cellsAfter >= cfg.scanCostCells && cellsAfter - Math.min(state.powerCells, cfg.stealAmount) < cfg.scanCostCells)
      v = 32; // Denying a scan now outweighs an unattended fuse that can be fixed later.
    out.push({ room: 'reactor', focus: 'reactor', action: 'SABO', value: v * cover(counts.reactor) });
  }

  if (!state.xrayOnline && state.scrap >= 1) {
    const v = state.scrap < counts.medbay * cfg.repairCostScrap ? 6 : 3;
    out.push({ room: 'cargo', focus: 'cargo', action: 'SABO', value: v * cover(counts.cargo) * oddness('cargo') });
  }

  return out;
}

/**
 * Decide this round for every bot at once, so a Mimic team can coordinate: with one team
 * sabotage per round, the teammate with the least heat acts and the other plays it straight.
 */
export function decideRound(minds: BotMind[], state: GameState, rng: Rng) {
  const plan = tablePlan(state);
  const players = byId(state);
  const mimics = minds.filter((m) => players[m.id]?.role === 'MIMIC' && players[m.id]?.alive);
  const heat = (m: BotMind) => m.suspicion[m.id] ?? 0;
  const designated =
    state.config.sabotagesPerRound === 'team' && mimics.length > 1
      ? mimics.slice().sort((a, b) => heat(a) - heat(b) || a.id.localeCompare(b.id))[0]
      : null;
  const reservedBreaks = new Set<RoomId>();

  for (const mind of minds) {
    const self = players[mind.id];
    if (!self || !self.alive) continue;
    if (self.role !== 'MIMIC') {
      blend(mind, state, rng, plan);
      continue;
    }
    chooseScapegoat(mind, state);
    decideMimic(mind, state, rng, plan, designated ? designated.id === mind.id : true, heat(mind), reservedBreaks);
    if (mind.plan?.action === 'SABO' && isLegalBreak(state, mind.plan.room, mind.plan.focus)) reservedBreaks.add(mind.plan.focus);
  }
}

function decideMimic(
  mind: BotMind,
  state: GameState,
  rng: Rng,
  plan: ReturnType<typeof tablePlan>,
  designated: boolean,
  heat: number,
  reservedBreaks: Set<RoomId>,
) {
  const t = tune(mind.skill);
  const options = sabotages(mind, state, plan).filter(o => !isLegalBreak(state, o.room, o.focus) || !reservedBreaks.has(o.focus));
  const sorted = options.slice().sort((a, b) => b.value - a.value);
  const best = sorted[0];
  const layLowValue = 4 + heat * 3;

  if (mind.layLow > 0) mind.layLow -= 1;
  const act =
    best &&
    designated &&
    mind.layLow === 0 &&
    (mind.skill === 'EASY' ? rng.chance(0.55) : best.value > layLowValue || state.round === state.config.rounds);

  if (!act) {
    blend(mind, state, rng, plan);
    mind.plan!.action = 'WORK'; // A Mimic pressing SABO while blending can really sabotage.
    if (heat > t.voteAt && mind.skill !== 'EASY') mind.layLow = 1;
    return;
  }

  let choice = best;
  if (mind.skill === 'EASY') choice = rng.pick(options);
  else if (mind.skill === 'NORMAL' && rng.chance(0.3)) choice = rng.pick(sorted.slice(0, 3));
  mind.plan = {
    room: choice.room,
    focus: choice.focus,
    action: 'SABO',
    why: whyFor(state, choice.room),
    announce: choice.room,
  };
}

/** What the bot submits in Act. The plan is made in Talk; a bot with no plan improvises. */
export function chooseAction(mind: BotMind, state: GameState, rng: Rng): BotChoice {
  if (!mind.plan) blend(mind, state, rng, tablePlan(state));
  const { room, focus, action } = mind.plan!;
  return { room, focus, action };
}

// ---------------------------------------------------------------------------
// The ballot.
// ---------------------------------------------------------------------------

export function chooseBallot(
  mind: BotMind,
  state: GameState,
  rng: Rng,
): { choice: string; reason: BallotReason; evidence: Evidence | null } {
  const vote = state.vote;
  if (!vote) return { choice: 'SKIP', reason: 'NO_LEAD', evidence: null };
  const players = byId(state);
  const self = players[mind.id];
  const t = tune(mind.skill);
  // One skip per player for the whole game, so a bot that has spent it must name someone.
  const canSkip = vote.allowSkip && !(state.skipsUsed ?? []).includes(mind.id);
  const teammates =
    self?.role === 'MIMIC'
      ? state.players.filter((p) => p.role === 'MIMIC' && p.id !== mind.id).map((p) => p.id)
      : [];
  const ranked = rng.shuffle(suspects(mind, state, teammates).filter((s) => vote.candidates.includes(s.id)))
    .sort((a, b) => b.score - a.score);
  const done = (choice: string, reason: BallotReason) => {
    const evidence = choice === 'SKIP' ? null : evidenceAgainst(mind, choice);
    mind.lastBallot = { round: state.round, choice, reason, evidence };
    return { choice, reason, evidence };
  };
  const anyone = () => {
    const pool = vote.candidates.filter((id) => id !== mind.id && !teammates.includes(id) && !players[id]?.verified);
    return pool.length ? rng.pick(pool) : vote.candidates[0];
  };

  if (self?.role === 'MIMIC') {
    // Push the table's own suspicion, never a teammate. With no grounds at all, a skip reads
    // as caution rather than as protecting someone.
    const goat = mind.scapegoat && ranked.some(p => p.id === mind.scapegoat) ? mind.scapegoat : null;
    if (goat && goat !== mind.id) return done(goat, vote.stage === 'RUNOFF' ? 'RUNOFF' : 'EVIDENCE');
    const top = ranked[0];
    if (top && top.score >= 0.3) return done(top.id, vote.stage === 'RUNOFF' ? 'RUNOFF' : 'EVIDENCE');
    if (canSkip) return done('SKIP', 'NO_LEAD');
    return done(anyone(), 'FORCED');
  }

  if (vote.stage === 'RUNOFF') {
    const top = ranked[0];
    return done(top ? top.id : anyone(), top ? 'RUNOFF' : 'FORCED');
  }
  const top = ranked[0];
  const second = ranked[1]?.score ?? 0;
  const clear = top && top.score >= t.voteAt && (second < 0.5 || top.score >= second * 1.3);
  if (clear) return done(top.id, 'EVIDENCE');
  const cellsToSpare = state.powerCells >= state.config.scanCostCells * 2;
  const mimicsLeft = state.config.aliens - state.players.filter(p => !p.alive).length;
  const urgent = state.config.rounds - state.round + 1 <= mimicsLeft + 1;
  if (top && (cellsToSpare || urgent)) return done(top.id, 'VERIFY');
  if (canSkip) return done('SKIP', cellsToSpare ? 'NO_LEAD' : 'SAVE_CELLS');
  return done(top ? top.id : anyone(), top ? 'EVIDENCE' : 'FORCED');
}

/** Mimic only: pick the crew member the table already half-suspects and lean on them. */
export function chooseScapegoat(mind: BotMind, state: GameState) {
  const players = byId(state);
  const teammates = state.players.filter((p) => p.role === 'MIMIC').map((p) => p.id);
  const ranked = suspects(mind, state, teammates);
  const top = ranked[0];
  if (top && top.score >= tune(mind.skill).accuseAt * 0.5 && players[top.id]?.alive) mind.scapegoat = top.id;
  else if (mind.scapegoat && (!players[mind.scapegoat]?.alive || players[mind.scapegoat]?.verified)) mind.scapegoat = null;
  else if (!top || top.score < 0.2) mind.scapegoat = null;
}
