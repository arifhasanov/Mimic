import { livingPlayers, type GameState, type Rng, type RoomId } from '@mimic/engine';
import {
  decideRound,
  evidenceAgainst,
  hear,
  readReport,
  suspects,
  tablePlan,
  tune,
  type ActSnapshot,
  type BotMind,
} from './brain';
import type { Mood, Utterance } from './voice';

/**
 * Who says what, and when. Each planner returns a script the service plays back on timers.
 * Budgets are deliberate: bots that never shut up are worse than bots that say nothing.
 */

export interface Line {
  playerId: string;
  utterance: Utterance;
  /** Milliseconds after the phase opens. */
  delayMs: number;
}

export interface Pace {
  /** How long the bots have to talk, from the start of the phase. */
  windowMs: number;
  /** Fast phases: one line each, quick-fire. */
  fast: boolean;
}

function livingBots(minds: BotMind[], state: GameState) {
  const alive = new Set(livingPlayers(state).map((p) => p.id));
  return minds.filter((m) => alive.has(m.id));
}

/** Spread lines across the window with human-looking gaps; compress if there are too many. */
function pace(lines: Omit<Line, 'delayMs'>[], p: Pace, rng: Rng, first?: number): Line[] {
  if (!lines.length) return [];
  const gap = () => (p.fast ? 350 + rng.next() * 400 : 2500 + rng.next() * 3500);
  const start = first ?? (p.fast ? 300 : 1200);
  let t = start;
  const raw = lines.map((l) => {
    const at = t;
    t += gap();
    return { ...l, delayMs: at };
  });
  const last = raw[raw.length - 1].delayMs;
  const scale = last > p.windowMs ? (p.windowMs - start) / Math.max(1, last - start) : 1;
  return raw.map((l) => ({ ...l, delayMs: Math.round(start + (l.delayMs - start) * scale) }));
}

/**
 * The Talk phase. Decides every bot's round first, so what a bot announces is what it will
 * do; then one main line each — an accusation if it has one, a reaction to someone else's,
 * or its plan — and a short reaction pass for anyone who was accused.
 */
export function planTalk(
  minds: BotMind[],
  state: GameState,
  rng: Rng,
  p: Pace,
  opts: { xrayJustUp: boolean },
): Line[] {
  const bots = livingBots(minds, state);
  if (!bots.length) return [];
  decideRound(minds, state, rng);

  const players = Object.fromEntries(state.players.map((pl) => [pl.id, pl]));
  const perBot = p.fast ? 1 : 2;
  const total = p.fast ? bots.length : bots.length + 2;
  const said: Record<string, number> = {};
  const lines: Omit<Line, 'delayMs'>[] = [];
  const accusations: { speaker: string; target: string }[] = [];
  const topics = new Set<string>();
  const say = (mind: BotMind, utterance: Utterance) => {
    if ((said[mind.id] ?? 0) >= perBot || lines.length >= total) return false;
    const key = utterance.kind === 'ACCUSE'
      ? `case:${utterance.target}:${utterance.evidence?.kind}:${utterance.evidence?.round}`
      : utterance.kind === 'INTENT' ? `job:${utterance.room}:${utterance.why}`
      : utterance.kind === 'AGREE' || utterance.kind === 'DISAGREE' ? `${utterance.kind}:${utterance.target}`
      : JSON.stringify(utterance);
    const cooldown = utterance.kind === 'ACCUSE' || utterance.kind === 'NO_LEAD' ? 4 : 2;
    if (state.round - (mind.spoken[key] ?? -99) < cooldown || topics.has(key)) return false;
    mind.spoken[key] = state.round;
    topics.add(key);
    said[mind.id] = (said[mind.id] ?? 0) + 1;
    lines.push({ playerId: mind.id, utterance });
    return true;
  };
  const accuse = (mind: BotMind, target: string) => {
    if (!say(mind, { kind: 'ACCUSE', target, evidence: evidenceAgainst(mind, target) })) return;
    mind.accused[target] = state.round;
    accusations.push({ speaker: mind.id, target });
    for (const other of bots) hear(other, mind.id, target, state);
  };

  const plan = tablePlan(state);
  const order = rng.shuffle(bots);

  order.forEach((mind, i) => {
    const self = players[mind.id];
    const isMimic = self.role === 'MIMIC';
    const teammates = isMimic ? state.players.filter((x) => x.role === 'MIMIC' && x.id !== mind.id).map((x) => x.id) : [];
    const t = tune(mind.skill);

    // The first speaker sets the plan when there is nothing to argue about yet.
    if (i === 0 && (state.round === 1 || opts.xrayJustUp)) {
      say(mind, { kind: 'PLAN', counts: plan.counts, xrayJustUp: opts.xrayJustUp });
      if (state.round === 1) return;
    }

    let target: string | null = null;
    if (isMimic) target = mind.scapegoat;
    else {
      const top = suspects(mind, state)[0];
      if (top && top.score >= t.accuseAt) target = top.id;
    }
    const repeat = target !== null && state.round - (mind.accused[target] ?? -9) < 2;
    const pileOn = target !== null && accusations.filter((a) => a.target === target).length >= 2;
    if (target && !repeat && !pileOn && players[target]?.alive) {
      accuse(mind, target);
      return;
    }

    const latest = accusations.filter((a) => a.speaker !== mind.id).pop();
    if (latest) {
      const onTeammate = teammates.includes(latest.target);
      const mine = mind.suspicion[latest.target] ?? 0;
      const ev = evidenceAgainst(mind, latest.target);
      const thin = !ev || ev.suspects.length >= 3;
      if (isMimic) {
        // Backing a case against crew is free; defending a teammate is only safe when the
        // evidence really is thin, and even then not every time.
        if (!onTeammate && latest.target !== mind.id && rng.chance(0.7)) {
          say(mind, { kind: 'AGREE', speaker: latest.speaker, target: latest.target });
          return;
        }
        if (onTeammate && thin && rng.chance(0.5)) {
          say(mind, { kind: 'DISAGREE', speaker: latest.speaker, target: latest.target });
          return;
        }
      } else if (latest.target !== mind.id) {
        if (mine >= t.accuseAt * 0.5) {
          say(mind, { kind: 'AGREE', speaker: latest.speaker, target: latest.target });
          return;
        }
        if (mine <= 0.1 && thin && rng.chance(0.6)) {
          say(mind, { kind: 'DISAGREE', speaker: latest.speaker, target: latest.target });
          return;
        }
      }
    }

    if (i === 0 && state.round > 1 && rng.chance(0.5)) {
      say(mind, { kind: 'PLAN', counts: plan.counts, xrayJustUp: false });
      return;
    }
    if (mind.plan && rng.chance(0.75)) {
      say(mind, { kind: 'INTENT', room: mind.plan.announce, why: mind.plan.why });
      return;
    }
    if (state.round > 1 && rng.chance(0.3)) say(mind, { kind: 'NO_LEAD' });
  });

  // Reaction pass: anyone accused gets a word in.
  for (const a of accusations) {
    const mind = bots.find((m) => m.id === a.target);
    if (!mind) continue;
    const ev = evidenceAgainst(minds.find((m) => m.id === a.speaker)!, a.target);
    const claim = players[a.target].verified ? 'verified' : ev && (ev.witnesses ?? ev.suspects).length >= 2 ? 'notAlone' : 'wasWorking';
    say(mind, { kind: 'DEFEND', accuser: a.speaker, claim, evidence: ev });
  }

  return pace(lines, p, rng);
}

/** Right after the report lands: a line or two, only when something happened. */
export function planReactions(minds: BotMind[], state: GameState, before: ActSnapshot, rng: Rng, p: Pace): Line[] {
  const bots = livingBots(minds, state);
  if (!bots.length || !state.lastReport) return [];
  const r = readReport(state, before);
  const moods: { mood: Mood; room?: RoomId }[] = [];
  if (r.xrayUp) moods.push({ mood: 'xray' });
  for (const room of r.breaks) moods.push({ mood: room === 'medbay' ? 'smash' : r.repaired.includes(room) ? 'repaired' : 'break', room });
  for (const room of r.stolen) moods.push({ mood: 'stolen', room });
  for (const room of r.slack) moods.push({ mood: 'short', room });
  if (!moods.length && r.paid >= 2 && r.repairs === 0) moods.push({ mood: 'bad' });
  if (!moods.length && r.repaired.length) moods.push({ mood: 'repaired', room: r.repaired[0] });
  if (!moods.length && r.repairs >= 2 && rng.chance(0.4)) moods.push({ mood: 'good' });
  if (!moods.length && rng.chance(0.2)) moods.push({ mood: 'quiet' });

  const speakers = rng.shuffle(bots).slice(0, Math.min(2, moods.length));
  const lines = speakers.map((m, i) => ({
    playerId: m.id,
    utterance: { kind: 'REACT', ...moods[i] } as Utterance,
  }));
  return pace(lines, p, rng, p.fast ? 400 : 1000);
}

/** The vote reveal: one reaction to the outcome, and — with public ballots only — a reason or two. */
export function planVoteReactions(minds: BotMind[], state: GameState, rng: Rng, p: Pace): Line[] {
  const bots = livingBots(minds, state);
  const vote = state.vote;
  if (!bots.length || !vote?.result) return [];
  const res = vote.result;
  const outcome =
    res.kind === 'SCAN' ? (res.role === 'MIMIC' ? 'CAUGHT' : 'CLEARED') : res.kind === 'SKIP' ? 'SKIPPED' : res.kind === 'TIE' ? 'TIED' : 'RUNOFF';
  const target = res.kind === 'SCAN' ? res.playerId : undefined;
  const lines: Omit<Line, 'delayMs'>[] = [];

  // The cleared player, if a bot, gets to say "told you"; otherwise anyone.
  const cleared = outcome === 'CLEARED' ? bots.find((m) => m.id === target) : undefined;
  const reactor = cleared ?? rng.pick(bots);
  lines.push({ playerId: reactor.id, utterance: { kind: 'VOTE_REACT', outcome, target, me: reactor.id === target } });

  // With hidden votes a bot must not say whom it voted for — that is the whole point of the mode.
  if (!state.hiddenVotes && !p.fast) {
    const explainers = rng
      .shuffle(bots.filter((m) => m.id !== reactor.id && m.lastBallot && m.lastBallot.round === state.round))
      .slice(0, 2);
    for (const m of explainers) {
      const b = m.lastBallot!;
      lines.push({ playerId: m.id, utterance: { kind: 'VOTE_REASON', choice: b.choice, reason: b.reason, evidence: b.evidence } });
    }
  }
  return pace(lines, p, rng, p.fast ? 400 : 900);
}
