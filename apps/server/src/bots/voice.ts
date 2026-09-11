import { ROOM_NAMES, type Rng, type RoomId } from '@mimic/engine';
import type { BallotReason, Evidence, Personality, Why } from './brain';

/**
 * What a bot can say. Every utterance is built from public facts plus the bot's stated
 * plan; there is no field for a role, an intent or a real target anywhere in here, so the
 * voice cannot leak what it never sees. Crew and Mimic bots draw from the same pool.
 */
export type Mood = 'break' | 'stolen' | 'short' | 'xray' | 'good' | 'bad' | 'quiet' | 'repaired';

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
}

type T = (u: any, c: VoiceContext) => string;
type Pool = Partial<Record<Personality | 'any', T[]>>;

const room = (r: RoomId | undefined) => (r ? ROOM_NAMES[r] : 'somewhere');
const lower = (r: RoomId | undefined) => room(r).toLowerCase();

/** The evidence, in words a human at the table would use. */
export function describeEvidence(e: Evidence | null, target: string, c: VoiceContext): string {
  const T = c.name(target);
  if (!e) return `${T} just feels off to me`;
  const n = e.suspects.length;
  const when = e.round === c.round - 1 ? 'last round' : `in round ${e.round}`;
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
        ? `${T} was alone in the ${lower(e.room)} ${when} and it produced nothing`
        : `the ${lower(e.room)} came up a worker short ${when}, and ${T} was one of the ${n} in it`;
    case 'MEDBAY':
      return `the Med bay did almost nothing ${when} and ${T} was one of the ${n} at the table`;
    case 'IDLE':
      return `${T} went to the ${lower(e.room)} ${when} with the X-ray already up. That does nothing`;
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
  medbay: ['work on the X-ray', 'roll for repairs', 'push the repair track'],
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
          ? `X-ray is up. No more scrap runs, the Med bay is done. ${planLine(u, c)}.`
          : `Plan: ${planLine(u, c)}. Anyone object?`,
      (u, c) =>
        u.xrayJustUp
          ? `Scrap is worthless now that the X-ray works. ${planLine(u, c)} — and someone guards the pipes.`
          : `Same as always unless someone has a better idea: ${planLine(u, c)}.`,
    ],
    terse: [(u, c) => (u.xrayJustUp ? `X-ray up. ${planLine(u, c)}.` : `${planLine(u, c)}.`)],
    analytical: [
      (u, c) =>
        u.xrayJustUp
          ? `The X-ray is online, so cargo and Med bay work is wasted from here. ${planLine(u, c)}.`
          : `By the numbers: ${planLine(u, c)}. That keeps scrap and attempts in step.`,
    ],
    joker: [
      (u, c) =>
        u.xrayJustUp
          ? `X-ray's alive! Drop the scrap, nobody needs it. ${planLine(u, c)}.`
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
            ? `${c.name(u.accuser)}, I wasn't the only one there. ${u.evidence ? u.evidence.suspects.length : 'Several'} of us could have done it.`
            : `I was working, ${c.name(u.accuser)}. Check where I've been every round.`,
      (u, c) =>
        u.claim === 'verified'
          ? `Scanned crew, remember? Move on.`
          : u.claim === 'notAlone'
            ? `That's thin. Anyone next to that room could have done it, not just me.`
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
      (u, c) => `Why did ${c.name(u.target)} go to ${room(u.room)}? The X-ray is up, that does nothing.`,
      (u, c) => `${c.name(u.target)} in the ${lower(u.room)} after the X-ray came online. Odd choice.`,
    ],
    analytical: [
      (u, c) => `${c.name(u.target)} spent a round in the ${lower(u.room)} with the X-ray already online. Zero value.`,
    ],
    joker: [(u, c) => `${c.name(u.target)} is collecting scrap for the memories, apparently.`],
  },
  REACT: {
    any: [
      (u) => {
        switch (u.mood) {
          case 'break':
            return `${room(u.room)} is broken. Someone gets on that next round.`;
          case 'stolen':
            return `We are short on ${u.room === 'reactor' ? 'cells' : 'scrap'}. Somebody in the ${lower(u.room)} took them.`;
          case 'short':
            return `Count the ${lower(u.room)}: one fewer ${u.room === 'reactor' ? 'cell' : 'scrap haul'} than people. Someone in there was not working.`;
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
        if (u.reason === 'VERIFY') return `I voted ${c.name(u.choice)} — we had cells to spare and a clear crew is useful too.`;
        if (u.reason === 'RUNOFF') return `${c.name(u.choice)} was the better of the two for me.`;
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
          default:
            return `No scan. I hope that was the right call.`;
        }
      },
    ],
  },
};

/** Turn an utterance into a line. Personality picks the flavour; the facts stay the same. */
export function render(u: Utterance, c: VoiceContext): string {
  const pool = POOLS[u.kind];
  const specific = pool[c.personality];
  const list = specific && (c.personality === 'terse' || c.rng.chance(0.75)) ? specific : (pool.any ?? specific)!;
  let text = c.rng.pick(list)(u, c);
  if (c.personality === 'nervous' && u.kind === 'INTENT' && c.rng.chance(0.2)) text += ' I don\'t like this.';
  return text;
}
