import {
  ADJACENCY,
  BREAKABLE,
  INFECTION_RULES,
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
 * the Infection meter, the resource counters, the visible ballots — so a bot reasons exactly
 * like a careful human at the table. The only role-aware code is the Mimic planner and the
 * Mimic ballot, which *choose* differently but never say anything a crew member could not
 * have said.
 *
 * Deduction works in two layers. Hard evidence (a break, a theft, a room that came up short,
 * a corrupted repair) is a certainty about a round: one of the people on its list did it.
 * Soft evidence (ballots, accusations, a shielded Mimic) merely leans. The bot then weighs
 * every possible Mimic team against all of it at once, so two thin lists that share one
 * name become a strong lead, and catching a Mimic lifts the cloud from everyone who was
 * only ever on lists that Mimic could explain.
 */

export type Personality = 'terse' | 'analytical' | 'nervous' | 'joker';
export const PERSONALITIES: Personality[] = ['analytical', 'joker', 'terse', 'nervous'];

/** Why a bot is going where it is going. Public, plausible, and the same words for both roles. */
export type Why = 'repair' | 'guard' | 'scrap' | 'cells' | 'medbay';

/**
 * BREAK: stood where the broken room could be reached from, and cannot be cleared by their
 * own room's output. STEAL: in a room whose counter came up short by more than one worker's
 * output. SLACK: in a producing room that came up one worker short — a saboteur does not
 * produce, whatever the sabotage was. CORRUPT: Infection rose with nothing visible to
 * account for it, so a Med bay repair was corrupted. VOTED: drew ballots and was not scanned.
 */
export type EvidenceKind = 'BREAK' | 'STEAL' | 'SLACK' | 'CORRUPT' | 'MEDBAY' | 'IDLE' | 'SHIELD' | 'PUSHED' | 'VOTED';

/** Hard evidence is a certainty: one of the suspects did it. Soft evidence only leans. */
export const HARD: Record<EvidenceKind, boolean> = {
  BREAK: true, STEAL: true, SLACK: true, CORRUPT: true,
  MEDBAY: false, IDLE: false, SHIELD: false, PUSHED: false, VOTED: false,
};

export interface Evidence {
  round: number;
  kind: EvidenceKind;
  /** The room that broke, was stolen from, or was pointlessly occupied. */
  room?: RoomId;
  /** Everyone this piece of evidence points at, after the bot's private exclusions. */
  suspects: string[];
  /** Original public occupants; private exclusions must not become claims of being alone. */
  witnesses?: string[];
  /** Publicly cleared: their room's output proves every one of them worked that round. */
  cleared?: string[];
  /** VOTED: how many ballots. */
  count?: number;
  weight: number;
}

export interface BotChoice {
  room: RoomId;
  focus: RoomId;
  action: ActionButton;
}

export type BallotReason = 'EVIDENCE' | 'VERIFY' | 'NO_LEAD' | 'SAVE_CELLS' | 'RUNOFF' | 'FORCED';

export interface Heard {
  speaker: string;
  target: string;
  round: number;
  kind: 'accuse' | 'defend';
}

export interface BotMind {
  id: string;
  personality: Personality;
  skill: BotSkill;
  /** Soft leanings per player id: heard accusations, ballots, exonerations, noise. Decays. */
  suspicion: Record<string, number>;
  /** How much weight another player's accusations carry with this bot. */
  trust: Record<string, number>;
  evidence: Evidence[];
  /** Target id → the round it was last accused out loud, so a bot does not repeat itself. */
  accused: Record<string, number>;
  /** Accusations and defences heard this game: who said what about whom, and when. */
  heard: Heard[];
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
// Tunables by skill. EASY is noisy and forgetful, HARD is cold. Thresholds are probabilities
// that a player is a Mimic, as the solver below computes them.
// ---------------------------------------------------------------------------

interface Tune {
  /** Random lean added to every player each round. */
  noise: number;
  /** How much of last round's soft leanings survive. */
  decay: number;
  voteAt: number;
  accuseAt: number;
  /** Chance of ignoring the plan and wandering off. */
  wander: number;
  /** How plausible an unexplained event is: a careless reader shrugs, a cold one does not. */
  eps: number;
  /** Rounds of hard evidence remembered. */
  memory: number;
  /** Mimic only: how heavily the evidence a sabotage would leave weighs against it. */
  care: number;
}

const TUNE: Record<BotSkill, Tune> = {
  EASY: { noise: 0.8, decay: 0.7, voteAt: 0.45, accuseAt: 0.4, wander: 0.35, eps: 0.35, memory: 4, care: 0.6 },
  NORMAL: { noise: 0.3, decay: 0.85, voteAt: 0.55, accuseAt: 0.5, wander: 0.1, eps: 0.15, memory: 99, care: 1.0 },
  HARD: { noise: 0.0, decay: 0.9, voteAt: 0.65, accuseAt: 0.55, wander: 0.0, eps: 0.05, memory: 99, care: 1.4 },
};

export const tune = (skill: BotSkill) => TUNE[skill];

const W = { BREAK: 4, STEAL: 4, SLACK: 3, CORRUPT: 4, MEDBAY: 1.2, IDLE: 0.6, SHIELD: 0.5, PUSHED: 0.4, VOTED: 0.4, LISTEN: 0.35 };

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

function addEvidence(mind: BotMind, ev: Evidence) {
  // A piece that only ever pointed at the bot itself still matters: it is how the table sees it.
  if (!ev.suspects.length && !(ev.witnesses ?? []).length) return;
  mind.evidence.push(ev);
}

export interface ReadReport {
  occupants: Record<RoomId, string[]>;
  /** Rooms that broke this round, whether or not they were repaired straight away. */
  breaks: RoomId[];
  repaired: RoomId[];
  /** Where something went missing: 'reactor' for cells, 'cargo' for scrap. */
  stolen: RoomId[];
  /** Rooms that came up one worker short: someone in there was not working. */
  slack: RoomId[];
  /** Med bay attempts the scrap could pay for, and repairs gained. */
  paid: number;
  repairs: number;
  xrayUp: boolean;
  smashed: boolean;
  /** Infection rose, or held at the top: an effective sabotage happened this round. */
  effective: boolean;
  /** Effective sabotage with nothing visible to account for it: a corrupted repair. */
  corrupt: boolean;
  /** Occupants whose room's output proves every one of them worked. */
  cleared: string[];
}

/**
 * Read the round report against the Act-time snapshot. The counters are deterministic once
 * the occupants are known, so any shortfall is a theft or a non-worker; a room "repaired"
 * that was not broken when Act opened was broken and fixed in the same round; and a room
 * whose output is exactly what its headcount predicts clears everyone in it, because a
 * saboteur never produces.
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
  const smashed = !!report.rooms.find((r) => r.room === 'medbay')?.summary.includes('smashed');
  for (const r of report.rooms) {
    const wasBroken = before.broken.includes(r.room);
    if (r.summary.includes('repaired')) repaired.push(r.room);
    if ((r.broken && !wasBroken) || (!wasBroken && r.summary.includes('repaired'))) breaks.push(r.room);
  }
  // The Med bay never reads as "broken" — a smash shows up as a lost repair instead.
  if (smashed) breaks.push('medbay');

  const stolen: RoomId[] = [];
  const slack: RoomId[] = [];
  const cleared: string[] = [];
  const production = (room: RoomId) => Number(/\+(\d+)/.exec(report.rooms.find(r => r.room === room)?.summary ?? '')?.[1] ?? 0);

  // Cells: the Reactor's output is exact up to its cap, so a shortfall is a non-worker and a
  // missing cell is a theft. Above the cap a slacker is invisible, so nobody is cleared.
  const reactorWorkers = Math.max(0, occupants.reactor.length - (repaired.includes('reactor') ? 1 : 0));
  const cellsMade = production('reactor');
  const cellsStolen = before.powerCells + cellsMade - report.powerCells;
  const cellsExpected = Math.min(reactorWorkers * cfg.cellsPerReactorWorker, cfg.reactorCapCells);
  if (cellsStolen > 0) stolen.push('reactor');
  else if (cellsMade < cellsExpected) slack.push('reactor');
  else if (occupants.reactor.length && reactorWorkers * cfg.cellsPerReactorWorker <= cfg.reactorCapCells)
    cleared.push(...occupants.reactor);

  // Scrap: one ledger for cargo production, Med bay spending and theft. Attempts are only
  // paid for while the scanner is down (or was smashed this round, which reopens them).
  const scrapMade = production('cargo');
  const scrapBefore = before.scrap + scrapMade;
  const attemptsOpen = !before.xrayOnline || smashed;
  const attempts = attemptsOpen ? Math.min(occupants.medbay.length, cfg.medbaySeats) : 0;
  const paid = Math.min(attempts, Math.floor(scrapBefore / cfg.repairCostScrap));
  const missing = scrapBefore - report.scrap;
  let medbaySlack = false;
  // Only call theft when even maximal spending cannot explain the missing stock; spending
  // short of the funded headcount means someone in the Med bay made no attempt.
  if (missing > paid * cfg.repairCostScrap) stolen.push('cargo');
  else if (missing < paid * cfg.repairCostScrap) medbaySlack = true;
  if (!stolen.includes('cargo')) {
    if (scrapMade < occupants.cargo.length * cfg.scrapPerCargoWorker) slack.push('cargo');
    else if (occupants.cargo.length) cleared.push(...occupants.cargo);
  }
  if (medbaySlack) slack.push('medbay');
  else if (attemptsOpen && occupants.medbay.length && paid === occupants.medbay.length && missing === paid * cfg.repairCostScrap)
    cleared.push(...occupants.medbay);

  const med = report.rooms.find((r) => r.room === 'medbay');
  const repairs = Number(/\+(\d+) repair/.exec(med?.summary ?? '')?.[1] ?? 0);

  // The Infection meter says whether an effective sabotage happened, even an invisible one.
  // The only invisible effective sabotage is a corrupted repair.
  const effective = report.infectionDelta > 0 || (report.infectionDelta === 0 && report.infection > 0);
  const corrupt = effective && !breaks.length && !stolen.length;

  return {
    occupants, breaks, repaired, stolen, slack, paid, repairs, smashed,
    xrayUp: !before.xrayOnline && report.xrayOnline, effective, corrupt, cleared,
  };
}

/**
 * Absorb the report that closed the round. `before` is the Act-time snapshot. The bot excludes
 * itself from every suspect list — it knows what it did — but keeps the public list, so a
 * Mimic can tell how it looks from the outside.
 */
export function absorbRound(mind: BotMind, state: GameState, before: ActSnapshot, rng: Rng) {
  const report = state.lastReport;
  if (!report || report.round !== before.round) return;
  const t = tune(mind.skill);
  for (const id of Object.keys(mind.suspicion)) mind.suspicion[id] *= t.decay;
  if (t.noise)
    for (const p of livingPlayers(state))
      if (p.id !== mind.id) mind.suspicion[p.id] = (mind.suspicion[p.id] ?? 0) + (rng.next() - 0.5) * 2 * t.noise * 0.3;

  const players = byId(state);
  const r = readReport(state, before);
  const usable = (list: string[]) =>
    list.filter((id) => id !== mind.id && players[id] && players[id].alive && !players[id].verified);
  const push = (kind: EvidenceKind, witnesses: string[], weight: number, room?: RoomId) => {
    const clearedHere = witnesses.filter((id) => r.cleared.includes(id));
    // A list that clears itself entirely is a misread somewhere; fall back to the whole reach.
    const publicList = clearedHere.length < witnesses.length ? witnesses.filter((id) => !clearedHere.includes(id)) : witnesses;
    addEvidence(mind, {
      round: report.round, kind, room, weight,
      suspects: usable(publicList),
      witnesses: witnesses.slice(),
      cleared: clearedHere.length < witnesses.length ? clearedHere : [],
    });
  };

  for (const room of r.breaks) push('BREAK', breakers(room).flatMap((from) => r.occupants[from]), W.BREAK, room);
  for (const room of r.stolen) push('STEAL', r.occupants[room], W.STEAL, room);
  if (r.corrupt) push('CORRUPT', r.occupants.medbay, W.CORRUPT, 'medbay');
  for (const room of r.slack) {
    if (room === 'medbay' && r.corrupt) continue; // the same people, already on the stronger list
    push('SLACK', r.occupants[room], W.SLACK, room);
  }
  // A poor Med bay round on its own is not evidence: the meter says whether anything was
  // corrupted, and bad dice are just bad dice.
}

/**
 * Visible ballots after any vote. Every ballot is an accusation made with a phone, and a
 * caught Mimic's whole voting and speaking record becomes evidence: a Mimic never pushes a
 * scan onto a teammate, so everyone they targeted is probably crew, and anyone who spoke
 * up for them is worth a second look.
 */
export function absorbVote(mind: BotMind, state: GameState, rng: Rng) {
  const vote = state.vote;
  if (!vote || !vote.result || state.hiddenVotes) return;
  const players = byId(state);
  const living = livingPlayers(state).map((p) => p.id);
  const round = state.round;
  const trustOf = (id: string) => Math.min(2, mind.trust[id] ?? 1);
  const scanned = vote.result.kind === 'SCAN' ? vote.result.playerId : null;

  // 1. Ballots as accusations, weighted by how much the bot trusts each voter.
  const tally: Record<string, string[]> = {};
  for (const b of vote.ballots) {
    if (b.choice === 'SKIP' || b.voterId === mind.id || b.choice === b.voterId) continue;
    if (!players[b.voterId]?.alive) continue; // a revealed Mimic's ballot was a lie, not a lead
    (tally[b.choice] ??= []).push(b.voterId);
  }
  for (const [target, voters] of Object.entries(tally)) {
    if (target === scanned || !players[target]?.alive || players[target].verified) continue;
    const weight = voters.reduce((n, v) => n + W.VOTED * trustOf(v), 0);
    addEvidence(mind, {
      round, kind: 'VOTED', weight, count: voters.length,
      suspects: target === mind.id ? [] : [target],
      witnesses: [target],
    });
  }

  if (vote.result.kind !== 'SCAN') return;
  const target = vote.result.playerId;
  const caught = vote.result.role === 'MIMIC';
  const voterOf = (id: string) => vote.ballots.find((b) => b.voterId === id)?.choice;

  if (caught) {
    for (const id of living) {
      if (id === target || id === mind.id) continue;
      if (voterOf(id) === target) {
        mind.suspicion[id] = (mind.suspicion[id] ?? 0) - 0.5;
        mind.trust[id] = trustOf(id) + 0.4;
      } else if (voterOf(id) !== undefined && !players[id].verified) {
        addEvidence(mind, { round, kind: 'SHIELD', suspects: [id], witnesses: [id], weight: W.SHIELD });
      }
    }
    // Whoever named the Mimic out loud before the scan earns trust.
    for (const h of mind.heard) {
      if (h.kind === 'accuse' && h.target === target) mind.trust[h.speaker] = trustOf(h.speaker) + 0.5;
    }
    // The Mimic's own record: their ballots and accusations went to crew, their defenders
    // may have known better.
    const exonerate = new Set<string>();
    for (const entry of state.log) {
      for (const b of entry.ballots ?? []) {
        if (b.voterId === target && b.choice !== 'SKIP' && b.choice !== target) exonerate.add(b.choice);
      }
    }
    for (const h of mind.heard) {
      if (h.speaker === target && h.kind === 'accuse') exonerate.add(h.target);
      if (h.target === target && h.kind === 'defend' && h.speaker !== mind.id && players[h.speaker]?.alive)
        mind.suspicion[h.speaker] = (mind.suspicion[h.speaker] ?? 0) + 0.8;
    }
    for (const id of exonerate) {
      if (id === mind.id || !players[id]?.alive || players[id].verified) continue;
      mind.suspicion[id] = (mind.suspicion[id] ?? 0) - 1.2;
    }
  } else {
    for (const id of living) {
      if (id === target || id === mind.id || players[id].verified) continue;
      if (voterOf(id) === target)
        addEvidence(mind, { round, kind: 'PUSHED', suspects: [id], witnesses: [id], weight: W.PUSHED });
    }
    for (const h of mind.heard)
      if (h.kind === 'accuse' && h.target === target) mind.trust[h.speaker] = Math.max(0.2, trustOf(h.speaker) - 0.3);
  }
  void rng;
}

/**
 * Another player accused — or stood up for — someone out loud. Nudge, weighted by trust,
 * never swallow whole. An accusation against the bot itself is heat it can feel.
 */
export function hear(mind: BotMind, speaker: string, target: string, state: GameState, kind: Heard['kind'] = 'accuse') {
  if (speaker === mind.id) return;
  if (state.players.find(p => p.id === target)?.verified) return;
  if (mind.heard.some(h => h.speaker === speaker && h.target === target && h.round === state.round && h.kind === kind)) return;
  mind.heard.push({ speaker, target, round: state.round, kind });
  const trust = Math.min(2, mind.trust[speaker] ?? 1);
  mind.suspicion[target] = (mind.suspicion[target] ?? 0) + W.LISTEN * trust * (kind === 'accuse' ? 1 : -0.5);
}

// ---------------------------------------------------------------------------
// The solver: every possible Mimic team, weighed against everything seen so far.
// ---------------------------------------------------------------------------

function combinations<T>(items: T[], k: number): T[][] {
  const out: T[][] = [];
  const pick: T[] = [];
  const walk = (start: number) => {
    if (pick.length === k) {
      out.push(pick.slice());
      return;
    }
    for (let i = start; i <= items.length - (k - pick.length); i++) {
      pick.push(items[i]);
      walk(i + 1);
      pick.pop();
    }
  };
  walk(0);
  return out;
}

/**
 * Probability that each living, unverified player is a Mimic. The bot knows how many Mimics
 * are left, so it enumerates every possible team: a team that leaves a hard event with
 * nobody on its list is nearly impossible, soft evidence and heard accusations lean on the
 * teams that contain their targets. Eliminated players are known Mimics and explain any
 * list they were on.
 *
 * `publicView` is how the table sees things: the bot itself is a candidate and private
 * exclusions are ignored. A Mimic reads the table that way; a crew bot knows it is crew.
 */
export function assess(mind: BotMind, state: GameState, publicView = false): Record<string, number> {
  const t = tune(mind.skill);
  const players = byId(state);
  const known = state.players.filter((p) => !p.alive).map((p) => p.id); // only Mimics are ever eliminated
  const candidates = livingPlayers(state)
    .filter((p) => !p.verified && (publicView || p.id !== mind.id))
    .map((p) => p.id);
  const out: Record<string, number> = {};
  for (const id of candidates) out[id] = 0;
  const k = Math.min(candidates.length, state.config.aliens - known.length);
  if (k <= 0 || !candidates.length) return out;

  const events = mind.evidence
    .filter((e) => state.round - e.round < t.memory)
    .map((e) => {
      const list = publicView
        ? (e.witnesses ?? e.suspects).filter((id) => !(e.cleared ?? []).includes(id) && !players[id]?.verified && players[id])
        : e.suspects;
      return { hard: HARD[e.kind], list, share: e.weight / Math.max(1, list.length) };
    })
    .filter((e) => e.list.length);
  const logEps = Math.log(t.eps);
  const prior = (id: string) => mind.suspicion[id] ?? 0;

  const teams = combinations(candidates, k);
  const logs = teams.map((team) => {
    const members = new Set([...team, ...known]);
    let lw = 0;
    for (const id of team) lw += prior(id);
    for (const e of events) {
      if (e.hard) {
        if (!e.list.some((id) => members.has(id))) lw += logEps;
      } else {
        for (const id of e.list) if (members.has(id)) lw += e.share;
      }
    }
    return lw;
  });
  const max = Math.max(...logs);
  let total = 0;
  teams.forEach((team, i) => {
    const w = Math.exp(logs[i] - max);
    total += w;
    for (const id of team) out[id] += w;
  });
  for (const id of candidates) out[id] /= total;
  return out;
}

/** What an uninformed guess looks like: Mimics left over unverified living players. */
export function baseRate(state: GameState): number {
  const known = state.players.filter((p) => !p.alive).length;
  const pool = livingPlayers(state).filter((p) => !p.verified).length;
  return pool ? Math.max(0, state.config.aliens - known) / pool : 0;
}

/**
 * Living, unverified, not me — ranked by probability. A crew bot reasons from its own
 * knowledge; a Mimic bot reads the table's view, and passes its teammates to leave them out.
 */
export function suspects(mind: BotMind, state: GameState, exclude: string[] = []) {
  const isMimic = byId(state)[mind.id]?.role === 'MIMIC';
  const p = assess(mind, state, isMimic);
  return livingPlayers(state)
    .filter((x) => x.id !== mind.id && !x.verified && !exclude.includes(x.id))
    .map((x) => ({ id: x.id, score: p[x.id] ?? 0 }))
    .sort((a, b) => b.score - a.score);
}

/** How the table sees this bot: its own probability from the public view. */
export function heat(mind: BotMind, state: GameState): number {
  return assess(mind, state, true)[mind.id] ?? 0;
}

const rankEvidence = (e: Evidence) => (HARD[e.kind] ? 10 : 0) + e.weight / Math.max(1, e.suspects.length) + e.round * 0.01;

/** The strongest things this bot can say against `target`, strongest first, one per round. */
export function evidenceListAgainst(mind: BotMind, target: string, max = 2): Evidence[] {
  const list = mind.evidence.filter((e) => e.suspects.includes(target)).sort((a, b) => rankEvidence(b) - rankEvidence(a));
  const out: Evidence[] = [];
  for (const e of list) {
    if (out.some((o) => o.round === e.round)) continue;
    out.push(e);
    if (out.length >= max) break;
  }
  return out;
}

export function evidenceAgainst(mind: BotMind, target: string): Evidence | null {
  return evidenceListAgainst(mind, target, 1)[0] ?? null;
}

/** Whom the table has been naming this round, most-named first. */
export function consensus(mind: BotMind, state: GameState, exclude: string[] = []): string | null {
  const counts: Record<string, number> = {};
  for (const h of mind.heard) {
    if (h.round !== state.round || h.kind !== 'accuse' || h.target === mind.id || exclude.includes(h.target)) continue;
    const p = byId(state)[h.target];
    if (!p?.alive || p.verified) continue;
    counts[h.target] = (counts[h.target] ?? 0) + Math.min(2, mind.trust[h.speaker] ?? 1);
  }
  const best = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  return best && best[1] >= 1 ? best[0] : null;
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

/**
 * Rotate duties so the same seats do not monopolize one room throughout the game. Verified
 * crew take the posts nobody can audit — guarding a pipe — so that everyone still under
 * suspicion stands where their output can clear them.
 */
export function ownSlot(mind: BotMind, state: GameState, plan: { slots: Slot[] }): Slot {
  const bots = livingPlayers(state).filter((p) => p.isBot).sort((a, b) => a.id.localeCompare(b.id));
  if (!bots.length || !plan.slots.length) return { room: 'reactor', why: 'cells' };
  const taken = bots.map((_, i) => plan.slots[i % plan.slots.length]);
  const guardIdx = taken.map((s, i) => (s.why === 'guard' ? i : -1)).filter((i) => i >= 0);
  const verified = bots.filter((p) => p.verified).map((p) => p.id);
  const assigned: Record<string, Slot> = {};
  const usedSlots = new Set<number>();
  verified.forEach((id, i) => {
    if (i < guardIdx.length) {
      assigned[id] = taken[guardIdx[i]];
      usedSlots.add(guardIdx[i]);
    }
  });
  const rest = bots.map((p) => p.id).filter((id) => !assigned[id]);
  const restSlots = taken.map((s, i) => i).filter((i) => !usedSlots.has(i));
  const offset = Math.max(0, state.round - 1) % Math.max(1, rest.length);
  rest.forEach((id, i) => {
    assigned[id] = taken[restSlots[(i + offset) % restSlots.length]];
  });
  return assigned[mind.id] ?? { room: 'reactor', why: 'cells' };
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
  /** Cancels a scan the crew would otherwise get: worth acting on even when someone else spreads. */
  denies: boolean;
}

/**
 * How close the crew is to scanning someone: the only time evidence really costs a Mimic.
 * 1 when a vote is likely this round or next, lower while the scanner is dark or unfunded.
 */
function scanPressure(state: GameState, counts: Record<RoomId, number>): number {
  const cfg = state.config;
  const cellsSoon = state.powerCells + Math.min(counts.reactor * cfg.cellsPerReactorWorker, cfg.reactorCapCells) >= cfg.scanCostCells;
  const budget = state.scrap + counts.cargo * cfg.scrapPerCargoWorker;
  const xraySoon =
    state.xrayOnline ||
    (budget >= cfg.repairCostScrap && state.repairProgress + Math.min(counts.medbay, cfg.medbaySeats) * cfg.repairSuccessChance >= cfg.repairTarget - 0.5);
  return xraySoon && cellsSoon ? 1 : xraySoon ? 0.6 : 0.3;
}

/**
 * Every legal sabotage, scored for impact against the evidence it would leave. The Mimic
 * reads its own action the way the crew brain above would read the report: which list it
 * would land on, how short that list is, and whether its own room's output would betray it.
 */
function sabotages(mind: BotMind, state: GameState, plan: ReturnType<typeof tablePlan>): Sabotage[] {
  const cfg = state.config;
  const t = tune(mind.skill);
  const counts = { ...plan.counts };
  // The saboteur gives up its assigned work. Do not count that work as cover or repair.
  const own = ownSlot(mind, state, plan).room;
  counts[own] = Math.max(0, counts[own] - 1);
  const roundsLeft = cfg.rounds - state.round;
  const brokenNow = ROOMS.filter((r) => state.rooms[r].broken).length;
  const budget = state.scrap + counts.cargo * cfg.scrapPerCargoWorker;
  const attemptsOpen = !state.xrayOnline;
  const funded = (people: number) => Math.min(people, cfg.medbaySeats, Math.floor(budget / cfg.repairCostScrap));
  const pressure = scanPressure(state, counts);

  // Would my room's output betray that someone in it was not working?
  const slackVisible = (room: RoomId): boolean => {
    if (room === 'cargo') return true;
    if (room === 'reactor') return counts.reactor * cfg.cellsPerReactorWorker < cfg.reactorCapCells;
    if (room === 'medbay') return attemptsOpen && funded(counts.medbay) < funded(counts.medbay + 1);
    return false;
  };
  // Would a room full of honest workers clear itself in a careful reader's eyes?
  const clearsItself = (room: RoomId, people: number): boolean => {
    if (!people) return false;
    if (room === 'cargo') return true;
    if (room === 'reactor') return people * cfg.cellsPerReactorWorker <= cfg.reactorCapCells;
    if (room === 'medbay') return attemptsOpen && funded(people) === people;
    return false;
  };
  /** The shortest public list a break of `target` launched from `room` would put me on. */
  const breakPin = (room: RoomId, target: RoomId): number => {
    let list = 0;
    let meIn = false;
    let reach = 0;
    for (const from of breakers(target)) {
      const people = counts[from] + (from === room ? 1 : 0);
      if (!people) continue;
      reach += people;
      const cleared = from === room ? !slackVisible(room) && clearsItself(room, people) : clearsItself(from, people);
      if (cleared) continue;
      list += people;
      if (from === room) meIn = true;
    }
    if (!meIn) return list ? 0 : 1 / Math.max(1, reach);
    if (slackVisible(room)) return 1 / (counts[room] + 1);
    return 1 / Math.max(1, list);
  };
  const penalty = (pin: number) => t.care * 10 * pin * pressure;
  // Standing where the plan puts nobody looks odd to the humans, before the X-ray especially.
  const oddness = (room: RoomId) => (counts[room] === 0 && !state.rooms[room].broken ? 0.8 : 1);
  const out: Sabotage[] = [];

  for (const target of ROOMS) {
    if (!BREAKABLE[target] || state.rooms[target].broken) continue;
    let base = 10;
    if (target === 'reactor' && state.xrayOnline) base += 6;
    if (roundsLeft >= cfg.fuseLength && counts[target] === 0) base += 4;
    if (brokenNow >= 1) base += 4;
    base += counts[target] === 0 ? 5 : -6; // an occupied room is repaired the same round
    for (const room of breakers(target)) {
      if (!isLegalBreak(state, room, target)) continue;
      out.push({ room, focus: target, action: 'SABO', value: base * oddness(room) - penalty(breakPin(room, target)), denies: false });
    }
  }

  // Once the X-ray works, smashing the Med bay from next door knocks a repair off the track
  // and takes the scanner offline — worth most when the cell pool is too deep to drain.
  if (state.xrayOnline) {
    const cells =
      state.powerCells + Math.min(counts.reactor * cfg.cellsPerReactorWorker, cfg.reactorCapCells);
    const staysOffline = Math.pow(1 - cfg.repairSuccessChance, funded(counts.medbay));
    const denies = cells >= cfg.scanCostCells;
    const base = 4 + (denies ? 24 : 10) * staysOffline;
    for (const room of breakers('medbay'))
      out.push({ room, focus: 'medbay', action: 'SABO', value: base * oddness(room) - penalty(breakPin(room, 'medbay')), denies: denies && staysOffline >= 0.4 });
  }

  const remaining = cfg.repairTarget - state.repairProgress;
  if (attemptsOpen && budget >= cfg.repairCostScrap && counts.medbay > 0) {
    const v = 7 + (remaining <= 2 ? 6 : 0) + (counts.medbay >= 3 ? 2 : 0);
    out.push({ room: 'medbay', focus: 'medbay', action: 'SABO', value: v - penalty(1 / (counts.medbay + 1)), denies: false });
  }

  const cellsAfter =
    state.powerCells + Math.min(counts.reactor * cfg.cellsPerReactorWorker, cfg.reactorCapCells);
  if (state.powerCells > 0) {
    let v = state.xrayOnline ? 8 : 3;
    const denies = state.xrayOnline && cellsAfter >= cfg.scanCostCells && cellsAfter - Math.min(state.powerCells, cfg.stealAmount) < cfg.scanCostCells;
    if (denies) v = 32; // Denying a scan now outweighs an unattended fuse that can be fixed later.
    out.push({ room: 'reactor', focus: 'reactor', action: 'SABO', value: v - penalty(1 / (counts.reactor + 1)), denies });
  }

  if (attemptsOpen && state.scrap >= 1) {
    const v = state.scrap < counts.medbay * cfg.repairCostScrap ? 6 : 3;
    out.push({ room: 'cargo', focus: 'cargo', action: 'SABO', value: v * oddness('cargo') - penalty(1 / (counts.cargo + 1)), denies: false });
  }

  return out;
}

/**
 * Decide this round for every bot at once, so a Mimic team can coordinate: Infection spreads
 * once per team per round, so the teammate with the least heat acts and the others play it
 * straight unless they can cancel a scan outright.
 */
export function decideRound(minds: BotMind[], state: GameState, rng: Rng) {
  const plan = tablePlan(state);
  const players = byId(state);
  const mimics = minds.filter((m) => players[m.id]?.role === 'MIMIC' && players[m.id]?.alive);
  const heats = new Map(mimics.map((m) => [m.id, heat(m, state)]));
  const designated =
    mimics.length > 1
      ? mimics.slice().sort((a, b) => heats.get(a.id)! - heats.get(b.id)! || a.id.localeCompare(b.id))[0]
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
    decideMimic(mind, state, rng, plan, designated ? designated.id === mind.id : true, heats.get(mind.id)!, reservedBreaks);
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
  const futureRounds = Math.max(0, state.config.rounds - state.round);
  const quietThenMaximum = Math.max(0, state.infection - INFECTION_RULES.decay) + futureRounds * INFECTION_RULES.gain;
  const mustSpread = quietThenMaximum < INFECTION_RULES.threshold;
  // A break or a nonempty theft has an immediate effect; corruption depends on crew work.
  const reliable = options.filter(o => !(o.room === 'medbay' && o.focus === 'medbay'));
  const pool = designated ? (mustSpread && reliable.length ? reliable : options) : options.filter((o) => o.denies);
  const sorted = pool.slice().sort((a, b) => b.value - a.value);
  const best = sorted[0];
  const counts = { ...plan.counts };
  const pressure = scanPressure(state, counts);
  // Hiding is only worth anything when a scan is coming; evidence fades while the scanner is dark.
  const layLowValue = 2 + heat * 16 * pressure;
  const infectionValue = state.infection < INFECTION_RULES.threshold ? 5 : 0;

  if (mind.layLow > 0) mind.layLow -= 1;
  const act =
    best &&
    ((designated && mustSpread) ||
      (mind.layLow === 0 &&
        (mind.skill === 'EASY' ? rng.chance(designated ? 0.55 : 0.3) : best.value + (designated ? infectionValue : 0) > layLowValue)));

  if (!act) {
    blend(mind, state, rng, plan);
    mind.plan!.action = 'WORK'; // A Mimic pressing SABO while blending can really sabotage.
    if (heat > t.voteAt && pressure >= 0.6 && mind.skill !== 'EASY') mind.layLow = 1;
    return;
  }

  let choice = best;
  if (mind.skill === 'EASY') choice = rng.pick(pool);
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
  const scoreOf = (id: string) => ranked.find((r) => r.id === id)?.score ?? 0;
  const done = (choice: string, reason: BallotReason) => {
    const evidence = choice === 'SKIP' ? null : evidenceAgainst(mind, choice);
    mind.lastBallot = { round: state.round, choice, reason, evidence };
    return { choice, reason, evidence };
  };
  const anyone = () => {
    const pool = vote.candidates.filter((id) => id !== mind.id && !teammates.includes(id) && !players[id]?.verified);
    return pool.length ? rng.pick(pool) : vote.candidates[0];
  };
  const stage = vote.stage === 'RUNOFF' ? 'RUNOFF' : 'EVIDENCE';
  const crowd = consensus(mind, state, [...teammates, mind.id]);
  const crowdIn = crowd && vote.candidates.includes(crowd) ? crowd : null;
  const base = baseRate(state);

  if (self?.role === 'MIMIC') {
    // Push the table's own suspicion, never a teammate. Voting with the crowd looks like
    // conviction; with no grounds at all, a skip reads as caution rather than as protecting someone.
    const goat = mind.scapegoat && ranked.some(p => p.id === mind.scapegoat) ? mind.scapegoat : null;
    if (goat && goat !== mind.id) return done(goat, stage);
    if (crowdIn) return done(crowdIn, stage);
    const top = ranked[0];
    if (top && top.score >= base) return done(top.id, stage);
    if (canSkip) return done('SKIP', 'NO_LEAD');
    return done(anyone(), 'FORCED');
  }

  if (vote.stage === 'RUNOFF') {
    const top = ranked[0];
    return done(top ? top.id : anyone(), top ? 'RUNOFF' : 'FORCED');
  }
  const top = ranked[0];
  const second = ranked[1]?.score ?? 0;
  // A split crew vote wastes the scan on a runoff: join the table's lead when it is nearly
  // as good as my own.
  let pick = top;
  if (crowdIn && top && crowdIn !== top.id && scoreOf(crowdIn) >= Math.max(t.voteAt * 0.8, top.score - 0.12))
    pick = { id: crowdIn, score: scoreOf(crowdIn) };
  // Two strong suspects are a reason to scan, not to skip: the best guess is still a good one.
  if (pick && pick.score >= t.voteAt) return done(pick.id, 'EVIDENCE');
  void second;
  const cellsToSpare = state.powerCells >= state.config.scanCostCells * 2;
  const mimicsLeft = state.config.aliens - state.players.filter(p => !p.alive).length;
  const urgent = state.config.rounds - state.round + 1 <= mimicsLeft + 1;
  if (pick && (cellsToSpare || urgent)) return done(pick.id, 'VERIFY');
  if (canSkip) return done('SKIP', cellsToSpare ? 'NO_LEAD' : 'SAVE_CELLS');
  return done(pick ? pick.id : anyone(), pick ? 'EVIDENCE' : 'FORCED');
}

/** Mimic only: pick the crew member the table already half-suspects and lean on them. */
export function chooseScapegoat(mind: BotMind, state: GameState) {
  const players = byId(state);
  const teammates = state.players.filter((p) => p.role === 'MIMIC').map((p) => p.id);
  const ranked = suspects(mind, state, teammates);
  const top = ranked[0];
  const base = baseRate(state);
  // Lean on someone the table already half-suspects, and only with something to point at:
  // an accusation out of thin air is what a Mimic would do.
  if (top && top.score >= base + 0.12 && players[top.id]?.alive && evidenceAgainst(mind, top.id)) mind.scapegoat = top.id;
  else if (mind.scapegoat && (!players[mind.scapegoat]?.alive || players[mind.scapegoat]?.verified)) mind.scapegoat = null;
  else if (!top || top.score < base * 0.6) mind.scapegoat = null;
}
