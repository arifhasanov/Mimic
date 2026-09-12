import { ROOM_NAMES, type Rng, type RoomId } from '@mimic/engine';
import type { BallotReason, Evidence, Personality, Why } from './brain';

/**
 * What a bot can say. Every utterance is built from public facts plus the bot's stated
 * plan; there is no field for a role, an intent or a real target anywhere in here, so the
 * voice cannot leak what it never sees. Crew and Mimic bots draw from the same pool.
 */
export type Mood = 'break' | 'smash' | 'stolen' | 'short' | 'xray' | 'good' | 'bad' | 'quiet' | 'repaired';

export type Utterance =
  | { kind: 'PLAN'; counts: Record<RoomId, number>; xrayJustUp: boolean }
  | { kind: 'INTENT'; room: RoomId; why: Why }
  | { kind: 'ACCUSE'; target: string; evidence: Evidence | null }
  | { kind: 'DEFEND'; accuser: string; claim: 'notAlone' | 'wasWorking' | 'verified'; evidence: Evidence | null }
  | { kind: 'AGREE'; speaker: string; target: string }
  | { kind: 'DISAGREE'; speaker: string; target: string }
  | { kind: 'NO_LEAD' }
  | { kind: 'WASTE'; target: string; room: RoomId }
  | { kind: 'REACT'; mood: Mood; room?: RoomId }
  | { kind: 'VOTE_REASON'; choice: string; reason: BallotReason; evidence: Evidence | null }
  | { kind: 'VOTE_REACT'; outcome: 'CAUGHT' | 'CLEARED' | 'SKIPPED' | 'TIED' | 'RUNOFF'; target?: string; me: boolean };

export interface VoiceContext {
  personality: Personality;
  rng: Rng;
  name: (id: string) => string;
  round: number;
  /** Shared table history, so two different bots do not echo the same line. */
  recent?: readonly string[];
}

type T = (u: any, c: VoiceContext) => string;
type Pool = Partial<Record<Personality | 'any', T[]>>;

const room = (r: RoomId | undefined) => (r ? ROOM_NAMES[r] : 'somewhere');
const lower = (r: RoomId | undefined) => room(r).toLowerCase();

/** The evidence, in words a human at the table would use. */
export function describeEvidence(e: Evidence | null, target: string, c: VoiceContext): string {
  const T = c.name(target);
  if (!e) return `${T} just feels off to me`;
  const n = (e.witnesses ?? e.suspects).length;
  const when = e.round === c.round ? 'this round' : e.round === c.round - 1 ? 'last round' : `in round ${e.round}`;
  switch (e.kind) {
    case 'BREAK':
      return n <= 1
        ? `${T} was the only one who could reach ${room(e.room)} when it broke ${when}`
        : `${T} was one of ${n} people next to ${room(e.room)} when it broke ${when}`;
    case 'STEAL':
      return n <= 1
        ? `${e.room === 'reactor' ? 'cells' : 'scrap'} went missing ${when} and ${T} was alone in the ${lower(e.room)}`
        : `${e.room === 'reactor' ? 'cells' : 'scrap'} went missing from the ${lower(e.room)} ${when} and ${T} was in there`;
    case 'SLACK':
      return n <= 1
        ? `${T} was alone in the ${lower(e.room)} ${when} and its production came up short`
        : `the ${lower(e.room)} produced less than its staffing suggested ${when}, and ${T} was one of the ${n} in it`;
    case 'MEDBAY':
      return `Med bay repairs fell below expectation ${when} and ${T} was one of ${n} there; bad luck is still possible`;
    case 'IDLE':
      return `${T} went to the ${lower(e.room)} ${when}; I want to understand the allocation`;
    case 'SHIELD':
      return `${T} did not vote for the Mimic we caught`;
    case 'PUSHED':
      return `${T} pushed for a scan on someone who turned out to be crew`;
  }
}

const whyWords: Record<Why, string[]> = {
  repair: ['fix it before the fuse goes', 'get it repaired', 'patch it up'],
  guard: ['sit on the pipe so a break gets fixed the same round', 'keep an eye on it', 'guard it'],
  scrap: ['bring in scrap for the Med bay', 'haul scrap', 'keep the Med bay fed'],
  cells: ['bank cells for a scan', 'make cells', 'keep the Reactor at cap'],
  medbay: ['keep the X-ray in working order', 'cover the repair track', 'keep repairs moving'],
};

const planLine = (u: any, c: VoiceContext) => {
  const parts = (['reactor', 'cargo', 'medbay', 'steering', 'oxygen'] as RoomId[])
    .filter((r) => u.counts[r] > 0)
    .map((r) => `${u.counts[r]} to ${room(r)}`);
  return parts.join(', ');
};

const POOLS: Record<Utterance['kind'], Pool> = {
  PLAN: {
    any: [
      (u, c) =>
        u.xrayJustUp
          ? `X-ray is up. Keep repair cover in case it gets hit. ${planLine(u, c)}.`
          : `Plan: ${planLine(u, c)}. Anyone object?`,
      (u, c) =>
        u.xrayJustUp
          ? `We need cells and backup repairs now. ${planLine(u, c)}.`
          : `Let's divide the work: ${planLine(u, c)}.`,
    ],
    terse: [(u, c) => (u.xrayJustUp ? `X-ray up. ${planLine(u, c)}.` : `${planLine(u, c)}.`)],
    analytical: [
      (u, c) =>
        u.xrayJustUp
          ? `An online scanner can still be smashed. Budget for repairs: ${planLine(u, c)}.`
          : `By the numbers: ${planLine(u, c)}. That keeps scrap and attempts in step.`,
    ],
    joker: [
      (u, c) =>
        u.xrayJustUp
          ? `X-ray's alive! Let's keep it that way. ${planLine(u, c)}.`
          : `Proposal from the department of obvious: ${planLine(u, c)}.`,
    ],
  },
  INTENT: {
    any: [
      (u, c) => `I'll take ${room(u.room)} and ${c.rng.pick(whyWords[u.why as Why])}.`,
      (u, c) => `${room(u.room)} for me — ${c.rng.pick(whyWords[u.why as Why])}.`,
      (u) => `Heading to ${room(u.room)}.`,
    ],
    terse: [(u) => `${room(u.room)}.`, (u) => `Me: ${room(u.room)}.`],
    nervous: [
      (u, c) => `I'll go to ${room(u.room)}, if that's ok? ${c.rng.pick(whyWords[u.why as Why])}.`,
      (u) => `${room(u.room)}, I suppose. Unless someone needs me elsewhere.`,
    ],
    joker: [
      (u) => `Dibs on ${room(u.room)}. Bring snacks.`,
      (u, c) => `${room(u.room)} — someone has to ${c.rng.pick(whyWords[u.why as Why])}.`,
    ],
  },
  ACCUSE: {
    any: [
      (u, c) => `I'm looking at ${c.name(u.target)}: ${describeEvidence(u.evidence, u.target, c)}.`,
      (u, c) => `${describeEvidence(u.evidence, u.target, c)}. Explain that, ${c.name(u.target)}.`,
    ],
    terse: [(u, c) => `${c.name(u.target)}. ${describeEvidence(u.evidence, u.target, c)}.`],
    analytical: [
      (u, c) => `${describeEvidence(u.evidence, u.target, c)}. That is the strongest lead we have.`,
      (u, c) => `Put ${c.name(u.target)} at the top of the list: ${describeEvidence(u.evidence, u.target, c)}.`,
    ],
    nervous: [
      (u, c) => `I don't want to be wrong, but ${describeEvidence(u.evidence, u.target, c)}.`,
      (u, c) => `Sorry ${c.name(u.target)}, but ${describeEvidence(u.evidence, u.target, c)}.`,
    ],
    joker: [
      (u, c) => `Not to point fingers, but I'm pointing: ${describeEvidence(u.evidence, u.target, c)}.`,
      (u, c) => `${c.name(u.target)}, funny story — ${describeEvidence(u.evidence, u.target, c)}.`,
    ],
  },
  DEFEND: {
    any: [
      (u, c) =>
        u.claim === 'verified'
          ? `I've been scanned, ${c.name(u.accuser)}. Look somewhere else.`
          : u.claim === 'notAlone'
            ? `${c.name(u.accuser)}, I wasn't the only one in reach. ${u.evidence ? (u.evidence.witnesses ?? u.evidence.suspects).length : 'Several'} of us could have done it.`
            : `I was working, ${c.name(u.accuser)}. Check where I've been every round.`,
      (u, c) =>
        u.claim === 'verified'
          ? `Scanned crew, remember? Move on.`
          : u.claim === 'notAlone'
            ? `That evidence includes other people too. What makes me your first choice?`
            : `Wrong, ${c.name(u.accuser)}. I've done nothing but work.`,
    ],
    nervous: [
      (u, c) =>
        u.claim === 'verified'
          ? `I'm verified! Please, ${c.name(u.accuser)}, it isn't me.`
          : `It wasn't me, ${c.name(u.accuser)}, honestly. I was just doing my job.`,
    ],
    joker: [
      (u, c) =>
        u.claim === 'verified'
          ? `The X-ray says crew, ${c.name(u.accuser)}. Argue with the machine.`
          : `Me? I can barely find the ${u.evidence ? lower(u.evidence.room) : 'airlock'}.`,
    ],
  },
  AGREE: {
    any: [
      (u, c) => `${c.name(u.speaker)} has a point about ${c.name(u.target)}.`,
      (u, c) => `I'd had the same thought about ${c.name(u.target)}.`,
    ],
    terse: [(u, c) => `Agreed. ${c.name(u.target)}.`],
    analytical: [(u, c) => `${c.name(u.target)} is on my list too, for the same reason.`],
    nervous: [(u, c) => `I hate to say it, but ${c.name(u.speaker)} might be right about ${c.name(u.target)}.`],
    joker: [(u, c) => `Seconded. ${c.name(u.target)} has been suspiciously helpful.`],
  },
  DISAGREE: {
    any: [
      (u, c) => `That's weak, ${c.name(u.speaker)}. Half the ship could have done that.`,
      (u, c) => `I'm not sold on ${c.name(u.target)}. Too many people were in reach.`,
    ],
    terse: [(u, c) => `Not ${c.name(u.target)}. Too many candidates.`],
    analytical: [(u, c) => `${c.name(u.speaker)}, that evidence spreads over too many people to act on.`],
    nervous: [(u, c) => `Are we sure about ${c.name(u.target)}? A wasted scan really hurts.`],
    joker: [(u, c) => `${c.name(u.speaker)}, by that logic I'm also guilty. And I'm lovely.`],
  },
  NO_LEAD: {
    any: [() => `Nothing points anywhere yet. Let's watch the pipes.`, () => `No lead from me. Keep working.`],
    terse: [() => `No lead.`],
    nervous: [() => `I have no idea who it is and that worries me.`],
    joker: [() => `My suspect list is currently: everyone. Narrowing it down.`],
  },
  WASTE: {
    any: [
      (u, c) => `${c.name(u.target)}, was that ${room(u.room)} assignment repair cover?`,
      (u, c) => `${c.name(u.target)} in the ${lower(u.room)} after the X-ray came online. Odd choice.`,
    ],
    analytical: [
      (u, c) => `How much backup work do we need in the ${lower(u.room)}, ${c.name(u.target)}?`,
    ],
    joker: [(u, c) => `${c.name(u.target)} is collecting scrap for the memories, apparently.`],
  },
  REACT: {
    any: [
      (u) => {
        switch (u.mood) {
          case 'smash':
            return `The Med bay was hit. Check the repair track before we plan a scan.`;
          case 'break':
            return `${room(u.room)} is broken. Someone gets on that next round.`;
          case 'stolen':
            return `We are short on ${u.room === 'reactor' ? 'cells' : 'scrap'}. Somebody in the ${lower(u.room)} took them.`;
          case 'short':
            return `The ${lower(u.room)} produced less than its staffing suggested. Someone in there was not working.`;
          case 'xray':
            return `X-ray online. Now we can actually check people.`;
          case 'good':
            return `Good round in the Med bay.`;
          case 'bad':
            return `That many attempts and nothing? Unlucky, or not.`;
          case 'repaired':
            return `${room(u.room)} is fixed. Thanks, whoever that was.`;
          default:
            return `Quiet round.`;
        }
      },
    ],
    nervous: [
      (u) => {
        switch (u.mood) {
          case 'smash':
            return `They hit the scanner. Did our repair cover keep it running?`;
          case 'repaired':
            return `${room(u.room)} is repaired. That's one less fuse to worry about.`;
          case 'good':
            return `Those repairs help. Let's keep the scanner covered.`;
          case 'quiet':
            return `No clear incident to explain this round.`;
          case 'break':
            return `${room(u.room)} just broke. The fuse is ticking. Someone fix it, please.`;
          case 'stolen':
            return `Did someone just steal ${u.room === 'reactor' ? 'cells' : 'scrap'}? We're behind now.`;
          case 'short':
            return `The ${lower(u.room)} made less than it should have. I don't like that.`;
          case 'bad':
            return `Zero repairs. That feels wrong.`;
          default:
            return u.mood === 'xray' ? `Ok, X-ray works. We need to use it carefully.` : `Nothing exploded. Good.`;
        }
      },
    ],
    joker: [
      (u) => {
        switch (u.mood) {
          case 'smash':
            return `Someone has a grudge against the X-ray. Check the repair track.`;
          case 'repaired':
            return `${room(u.room)} is fixed. I'll take functioning machinery.`;
          case 'good':
            return `The Med bay delivered. More of that, please.`;
          case 'quiet':
            return `Quiet report. Nobody gets a medal for that yet.`;
          case 'break':
            return `${room(u.room)}, broken. Great teamwork, whoever did that.`;
          case 'stolen':
            return `${u.room === 'reactor' ? 'Cells' : 'Scrap'} walked off by themselves, apparently.`;
          case 'short':
            return `Someone in the ${lower(u.room)} was on a break. Not that kind of break. Or maybe that kind.`;
          case 'xray':
            return `X-ray's up. Time to find out who's made of goo.`;
          case 'bad':
            return `The Med bay dice hate us. Or someone in there does.`;
          default:
            return `Uneventful. I'm suspicious of how uneventful.`;
        }
      },
    ],
  },
  VOTE_REASON: {
    any: [
      (u, c) => {
        if (u.choice === 'SKIP')
          return u.reason === 'SAVE_CELLS'
            ? `I skipped. A scan on a guess would burn cells we can't spare.`
            : `I skipped — nothing solid enough to spend a scan on.`;
        if (u.reason === 'VERIFY') return `I voted ${c.name(u.choice)} — learning a role is useful while we still have time to act on it.`;
        if (u.reason === 'RUNOFF') return `${c.name(u.choice)} was my strongest lead among the runoff candidates.`;
        if (u.reason === 'FORCED') return `Had to pick someone. ${c.name(u.choice)} it was.`;
        return `I voted ${c.name(u.choice)} because ${describeEvidence(u.evidence, u.choice, c)}.`;
      },
    ],
    terse: [
      (u, c) => (u.choice === 'SKIP' ? `Skipped. No lead.` : `${c.name(u.choice)}. ${describeEvidence(u.evidence, u.choice, c)}.`),
    ],
  },
  VOTE_REACT: {
    any: [
      (u, c) => {
        switch (u.outcome) {
          case 'CAUGHT':
            return `${c.name(u.target)} was a Mimic. One down.`;
          case 'CLEARED':
            return u.me ? `Told you. Crew. Now scan someone who deserves it.` : `${c.name(u.target)} is crew. That's a scan gone.`;
          case 'SKIPPED':
            return `No scan. The cells stay in the bank.`;
          case 'TIED':
            return `Tied again. Nobody gets scanned.`;
          default:
            return `Runoff. Make it count.`;
        }
      },
    ],
    joker: [
      (u, c) => {
        switch (u.outcome) {
          case 'CAUGHT':
            return `${c.name(u.target)}, a Mimic! I liked you better as a person.`;
          case 'CLEARED':
            return u.me ? `See? Clean. Suspicion is very rude.` : `${c.name(u.target)} is crew. Whoops.`;
          case 'SKIPPED':
            return `We skipped. Bold strategy.`;
          case 'TIED':
            return `Dead heat. The scanner sits this one out.`;
          default:
            return `Runoff! The drama.`;
        }
      },
    ],
    nervous: [
      (u, c) => {
        switch (u.outcome) {
          case 'CAUGHT':
            return `Oh thank goodness, ${c.name(u.target)} was a Mimic.`;
          case 'CLEARED':
            return u.me ? `I told you it wasn't me.` : `${c.name(u.target)} was crew. Sorry, ${c.name(u.target)}.`;
          case 'RUNOFF':
            return `Another ballot. Let's settle on a target.`;
          default:
            return `No scan. I hope that was the right call.`;
        }
      },
    ],
  },
};

const EXTRA: Partial<Record<Utterance['kind'], T[]>> = {
  PLAN: [
    (u, c) => `Suggested assignments: ${planLine(u, c)}.`,
    (u, c) => `Here's how I'd split the jobs: ${planLine(u, c)}.`,
    (u, c) => `Can we cover this roster? ${planLine(u, c)}.`,
    (u, c) => `For the next shift: ${planLine(u, c)}.`,
  ],
  INTENT: [
    (u, c) => `Put me down for ${room(u.room)}; I'll ${c.rng.pick(whyWords[u.why as Why])}.`,
    (u) => `I've got the ${lower(u.room)} assignment.`,
    (u) => `You can count me in at ${room(u.room)}.`,
    (u, c) => `Taking ${room(u.room)} to ${c.rng.pick(whyWords[u.why as Why])}.`,
    (u) => `My next stop is ${room(u.room)}.`,
    (u) => `I'll cover ${room(u.room)} this round.`,
  ],
  ACCUSE: [
    (u, c) => `Can we check this detail? ${describeEvidence(u.evidence, u.target, c)}.`,
    (u, c) => `My case for checking ${c.name(u.target)} is this: ${describeEvidence(u.evidence, u.target, c)}.`,
    (u, c) => `Before we choose a scan, remember: ${describeEvidence(u.evidence, u.target, c)}.`,
    (u, c) => `I haven't ruled out ${c.name(u.target)}. ${describeEvidence(u.evidence, u.target, c)}.`,
  ],
  AGREE: [
    (u, c) => `I'd support checking ${c.name(u.target)} next.`,
    (u, c) => `That makes ${c.name(u.target)} worth discussing.`,
    (u, c) => `Keep ${c.name(u.target)} on the shortlist.`,
    (u, c) => `${c.name(u.speaker)}, I'm following your reasoning about ${c.name(u.target)}.`,
  ],
  DISAGREE: [
    (u, c) => `What separates ${c.name(u.target)} from the other possible suspects?`,
    (u, c) => `I'd want another clue before settling on ${c.name(u.target)}.`,
    (u, c) => `${c.name(u.speaker)}, let's check who else could have done it.`,
  ],
  NO_LEAD: [
    () => `I need another report before naming someone.`,
    () => `No useful accusation from me right now.`,
    () => `I'll focus on my assignment until we have a better clue.`,
    () => `Let's compare the next report with the work we planned.`,
  ],
  VOTE_REASON: [
    (u, c) => u.choice === 'SKIP' ? `I kept my vote on skip; I wasn't convinced by the case.` : `My ballot was ${c.name(u.choice)}. ${u.evidence ? describeEvidence(u.evidence, u.choice, c) + '.' : 'I wanted more information from the scan.'}`,
    (u, c) => u.choice === 'SKIP' ? `I wasn't ready to commit those cells.` : `${c.name(u.choice)} was my pick on that ballot${u.evidence ? ': ' + describeEvidence(u.evidence, u.choice, c) : '; I had no certain answer'}.`,
  ],
  REACT: [
    (u) => ({
      break: `${room(u.room)} needs a repair assignment before its fuse expires.`,
      smash: `A hit on the Med bay cost a repair. Check whether the scanner recovered.`,
      stolen: `The ${lower(u.room)} resource accounting shows a theft.`,
      short: `Production in the ${lower(u.room)} doesn't match its headcount.`,
      xray: `Scanner ready. Let's look at our cells and shortlist.`,
      good: `The repair track moved in our favor.`, bad: `Poor repair results, but chance alone can do that.`,
      quiet: `Nothing decisive in that report.`, repaired: `${room(u.room)} has been patched up.`,
    }[u.mood as Mood]),
    (u) => ({
      break: `Put ${room(u.room)} on the repair list. We can't leave that fuse running.`,
      smash: `Med bay sabotage showed up in the report. Repair cover matters.`,
      stolen: `We lost resources from the ${lower(u.room)}. Who was assigned there?`,
      short: `Someone in the ${lower(u.room)} didn't contribute the expected production.`,
      xray: `We can start verifying people now, provided the cells are there.`,
      good: `Useful progress from the Med bay.`, bad: `No repair progress. Let's avoid treating bad luck as proof.`,
      quiet: `I'll wait for a stronger signal.`, repaired: `The ${lower(u.room)} repair landed.`,
    }[u.mood as Mood]),
  ],
  VOTE_REACT: [
    (u, c) => ({
      CAUGHT: `${c.name(u.target)} is out. Let's revisit the evidence with that result in mind.`,
      CLEARED: u.me ? `You have my scan result now. Let's use it.` : `We can trust ${c.name(u.target)} with a critical assignment now.`,
      SKIPPED: `We kept the cells, but used a round without learning a role.`,
      TIED: `The tie means no new information this round.`, RUNOFF: `Let's compare the remaining candidates before voting again.`,
    }[u.outcome as 'CAUGHT' | 'CLEARED' | 'SKIPPED' | 'TIED' | 'RUNOFF']),
  ],
};

const normalized = (text: string) => text.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();
const similarity = (a: string, b: string) => {
  const left = new Set(normalized(a).split(' '));
  const right = new Set(normalized(b).split(' '));
  const common = [...left].filter(word => right.has(word)).length;
  return common / Math.max(1, left.size + right.size - common);
};

/** Prefer fresh phrasing across the whole table. Silence beats recycling an exhausted pool. */
export function render(u: Utterance, c: VoiceContext): string {
  const pool = POOLS[u.kind];
  const specific = pool[c.personality];
  const list = specific && (c.personality === 'terse' || c.rng.chance(0.75)) ? specific : (pool.any ?? specific)!;
  if (!c.recent) return c.rng.pick(list)(u, c);
  const history = new Set(c.recent.map(normalized));
  const templates = [...list, ...(pool.any ?? []), ...(specific ?? []), ...(EXTRA[u.kind] ?? [])];
  const candidates = [...new Set(c.rng.shuffle(templates).map(t => t(u, c)))].filter(text => !history.has(normalized(text)));
  if (!candidates.length) return '';
  const recent = c.recent.slice(-16);
  const novelty = (text: string) => Math.max(0, ...recent.map(old => similarity(text, old)));
  return candidates.map(text => ({ text, similarity: novelty(text) }))
    .sort((a, b) => a.similarity - b.similarity)[0].text;
}
