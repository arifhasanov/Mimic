import {
  castBallot,
  createGame,
  createRng,
  isLegalBreak,
  deriveIntent,
  beginRound,
  checkEndOfGame,
  shouldVote,
  resolveRound,
  resolveVote,
  startGame,
  startVote,
  type ActionButton,
  type GameState,
  type RoomId,
} from '@mimic/engine';
import {
  PERSONALITIES,
  absorbRound,
  chooseBallot,
  createMind,
  decideRound,
  planReactions,
  planTalk,
  planVoteReactions,
  render,
  readReport,
  hear,
  ownSlot,
  snapshot,
  suspects,
  tablePlan,
  type BotMind,
  type Utterance,
} from '../src/bots';

/**
 * The bot brain, in isolation. These are pure functions over a GameState, so the whole
 * suite runs in milliseconds — no sockets, no timers.
 */

const NAMES = ['Ann', 'Bo', 'Cal', 'Dee', 'Eva', 'Fin', 'Gus', 'Hal'];

function game(opts: { mimics?: string[]; seed?: number; skill?: 'EASY' | 'NORMAL' | 'HARD' } = {}): GameState {
  let s = createGame('TEST', opts.seed ?? 7);
  for (let i = 0; i < NAMES.length; i++) {
    s.players.push({
      id: 'p' + i,
      name: NAMES[i],
      token: 't' + i,
      role: 'CREW',
      alive: true,
      verified: false,
      room: null,
      connected: true,
      isBot: true,
    });
  }
  s.botSkill = opts.skill ?? 'HARD';
  s = startGame(s, createRng(opts.seed ?? 7));
  const mimics = opts.mimics ?? ['Gus', 'Hal'];
  for (const p of s.players) p.role = mimics.includes(p.name) ? 'MIMIC' : 'CREW';
  s.round = 1;
  s.phase = 'ACT';
  return s;
}

const byName = (s: GameState, name: string) => s.players.find((p) => p.name === name)!;
const sub = (s: GameState, name: string, room: RoomId, focus: RoomId = room, action: ActionButton = 'WORK') => {
  const p = byName(s, name);
  s.submissions[p.id] = { playerId: p.id, room, focus, action };
};
const minds = (s: GameState): BotMind[] =>
  s.players.map((p, i) => createMind(p.id, PERSONALITIES[i % PERSONALITIES.length], s.botSkill));

const FORBIDDEN = ['role', 'token', 'intent', 'intents', 'focus', 'action', 'submissions', 'trueRole'];
const leaks = (v: unknown, path = '$'): string[] => {
  if (Array.isArray(v)) return v.flatMap((x, i) => leaks(x, path + '[' + i + ']'));
  if (v && typeof v === 'object')
    return Object.entries(v as object).flatMap(([k, x]) =>
      FORBIDDEN.includes(k) ? [path + '.' + k] : leaks(x, path + '.' + k),
    );
  return [];
};

describe('reading the report', () => {
  it('pins a break on the only player who could reach the room', () => {
    // Oxygen can be broken from Oxygen itself, the Reactor or the Med bay. Bo is the only
    // one in any of those; everyone else is in Cargo or Steering.
    const s = game({ mimics: ['Bo'] });
    const before = snapshot(s);
    sub(s, 'Bo', 'oxygen', 'oxygen', 'SABO');
    for (const n of ['Ann', 'Cal', 'Dee']) sub(s, n, 'cargo');
    for (const n of ['Eva', 'Fin', 'Gus', 'Hal']) sub(s, n, 'steering');
    const after = resolveRound(s, createRng(1)).state;
    expect(after.rooms.oxygen.broken).toBe(true);

    const ann = createMind(byName(s, 'Ann').id, 'analytical', 'HARD');
    absorbRound(ann, after, before, createRng(2));
    const top = suspects(ann, after)[0];
    expect(top.id).toBe(byName(s, 'Bo').id);
    expect(top.score).toBeCloseTo(4);
    expect(ann.evidence[0]).toMatchObject({ kind: 'BREAK', room: 'oxygen', suspects: [byName(s, 'Bo').id] });
  });

  it('spreads a break over everyone in reach, never blames itself, and counts the missing cell', () => {
    // Bo breaks Oxygen from the Reactor. Two people stood in the Reactor and it made one
    // cell, so the Reactor's occupants are also implicated: a saboteur does not produce.
    const s = game({ mimics: ['Bo'] });
    const before = snapshot(s);
    sub(s, 'Bo', 'reactor', 'oxygen', 'SABO');
    sub(s, 'Ann', 'reactor');
    sub(s, 'Cal', 'medbay');
    for (const n of ['Dee', 'Eva', 'Fin', 'Gus', 'Hal']) sub(s, n, 'cargo');
    const after = resolveRound(s, createRng(1)).state;
    expect(after.powerCells).toBe(1);

    const ann = createMind(byName(s, 'Ann').id, 'terse', 'HARD');
    absorbRound(ann, after, before, createRng(2));
    const ranked = suspects(ann, after);
    expect(ranked[0].id).toBe(byName(s, 'Bo').id);
    expect(ranked[0].score).toBeCloseTo(2 + 3); // half the break, and all of the missing cell
    expect(ranked[1].id).toBe(byName(s, 'Cal').id);
    expect(ranked[1].score).toBeCloseTo(2); // half the break — Ann knows it was not her
    expect(ranked[2].score).toBe(0);
    expect(ann.evidence.map((e) => e.kind).sort()).toEqual(['BREAK', 'SLACK']);
    // ...but she knows how it looks from the outside.
    expect(ann.suspicion[ann.id]).toBeCloseTo(4 / 3 + 3 / 2);
  });

  it('tells a theft from a worker who simply did not work', () => {
    const s = game({ mimics: ['Bo'] });
    s.powerCells = 3;
    const before = snapshot(s);
    sub(s, 'Bo', 'reactor', 'reactor', 'SABO'); // steal: 2 cells gone, and Bo makes none
    sub(s, 'Ann', 'reactor');
    for (const n of ['Cal', 'Dee', 'Eva', 'Fin', 'Gus', 'Hal']) sub(s, n, 'cargo');
    const after = resolveRound(s, createRng(1)).state;
    expect(after.powerCells).toBe(2);
    const cal = createMind(byName(s, 'Cal').id, 'joker', 'HARD');
    absorbRound(cal, after, before, createRng(2));
    expect(cal.evidence.map((e) => e.kind)).toEqual(['STEAL']);
  });

  it('reads a cell shortfall as a theft by someone in the Reactor', () => {
    const s = game({ mimics: ['Bo'] });
    s.powerCells = 3;
    const before = snapshot(s);
    sub(s, 'Bo', 'reactor', 'reactor', 'SABO');
    sub(s, 'Ann', 'reactor');
    for (const n of ['Cal', 'Dee', 'Eva', 'Fin', 'Gus', 'Hal']) sub(s, n, 'cargo');
    const after = resolveRound(s, createRng(1)).state;
    expect(after.powerCells).toBeLessThan(3 + 2);

    const cal = createMind(byName(s, 'Cal').id, 'joker', 'HARD');
    absorbRound(cal, after, before, createRng(2));
    expect(cal.evidence.map((e) => e.kind)).toEqual(['STEAL']);
    expect(cal.evidence[0].suspects.sort()).toEqual([byName(s, 'Ann').id, byName(s, 'Bo').id].sort());
  });

  it('does not accuse repair reserves just because the X-ray is online', () => {
    const s = game({ mimics: ['Bo'] });
    s.xrayOnline = true;
    s.repairProgress = s.config.repairTarget;
    const before = snapshot(s);
    sub(s, 'Ann', 'cargo');
    for (const n of NAMES.slice(1)) sub(s, n, 'reactor');
    const after = resolveRound(s, createRng(1)).state;
    const cal = createMind(byName(s, 'Cal').id, 'analytical', 'HARD');
    absorbRound(cal, after, before, createRng(2));
    expect(cal.evidence.some((e) => e.kind === 'IDLE')).toBe(false);
  });
});

describe('the table plan', () => {
  it('feeds the Med bay and the Reactor before the X-ray', () => {
    const { counts } = tablePlan(game());
    expect(counts.medbay).toBeGreaterThanOrEqual(3);
    expect(counts.cargo).toBeGreaterThanOrEqual(1);
    expect(counts.reactor).toBeLessThanOrEqual(3);
    expect(counts.steering + counts.oxygen).toBe(0);
  });

  it('funds two backup repairs once the X-ray is up, and guards the pipes', () => {
    const s = game();
    s.xrayOnline = true;
    s.repairProgress = s.config.repairTarget;
    const { counts } = tablePlan(s);
    expect(counts.cargo).toBe(0);
    expect(counts.medbay).toBe(2);
    expect(counts.steering).toBeGreaterThanOrEqual(1);
    expect(counts.oxygen).toBeGreaterThanOrEqual(1);
    expect(counts.reactor).toBeGreaterThanOrEqual(1);
  });

  it('puts a repair first, and a fuse about to blow before everything', () => {
    const s = game();
    s.rooms.steering.broken = true;
    s.rooms.steering.fuse = 1;
    s.rooms.oxygen.broken = true;
    s.rooms.oxygen.fuse = 3;
    const { slots } = tablePlan(s);
    expect(slots[0]).toEqual({ room: 'steering', why: 'repair' });
    expect(slots[1]).toEqual({ room: 'oxygen', why: 'repair' });
  });

  it('hard crew bots follow the funded roster after the X-ray', () => {
    const s = game({ mimics: ['Gus'] });
    s.xrayOnline = true;
    s.repairProgress = s.config.repairTarget;
    for (let seed = 1; seed <= 20; seed++) {
      const ms = minds(s);
      decideRound(ms, s, createRng(seed));
      for (const m of ms) {
        if (byName(s, 'Gus').id === m.id) continue;
        expect(m.plan!.room).toBe(ownSlot(m, s, tablePlan(s)).room);
      }
    }
  });
});

describe('the Mimic', () => {
  it.each(['EASY', 'NORMAL', 'HARD'] as const)('spreads instead of hiding when the deadline demands it (%s)', skill => {
    const s = game({ mimics: ['Gus'], skill });
    s.round = s.config.rounds - 4;
    s.infection = 0;
    const ms = minds(s);
    const gus = ms.find(m => m.id === byName(s, 'Gus').id)!;
    gus.suspicion[gus.id] = 100;
    gus.layLow = 5;
    decideRound(ms, s, createRng(7));
    expect(gus.plan!.action).toBe('SABO');
    for (const m of ms) {
      const p = m.plan!;
      s.submissions[m.id] = { playerId: m.id, room: p.room, focus: p.focus, action: p.action };
    }
    expect(resolveRound(s, createRng(7)).state.infection).toBe(2);
  });

  it('allows a threatened Mimic to hide at arrival with infection to spare', () => {
    const s = game({ mimics: ['Gus'] });
    s.round = s.config.rounds; s.infection = 12;
    const ms = minds(s);
    const gus = ms.find(m => m.id === byName(s, 'Gus').id)!;
    gus.suspicion[gus.id] = 100; gus.layLow = 5;
    decideRound(ms, s, createRng(7));
    expect(gus.plan!.action).toBe('WORK');
  });

  it('sabotages on the final round at ten, because quiet decay would lose', () => {
    const s = game({ mimics: ['Gus'] });
    s.round = s.config.rounds; s.infection = 10;
    const ms = minds(s);
    const gus = ms.find(m => m.id === byName(s, 'Gus').id)!;
    gus.suspicion[gus.id] = 100; gus.layLow = 5;
    decideRound(ms, s, createRng(7));
    expect(gus.plan!.action).toBe('SABO');
  });

  it('only ever submits a legal sabotage, and does sabotage', () => {
    let sabotaged = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const s = game({ mimics: ['Gus', 'Hal'], seed, skill: seed % 2 ? 'NORMAL' : 'HARD' });
      const ms = minds(s);
      decideRound(ms, s, createRng(seed));
      for (const name of ['Gus', 'Hal']) {
        const m = ms.find((x) => x.id === byName(s, name).id)!;
        const plan = m.plan!;
        expect(plan.announce).toBe(plan.room);
        // A crew-style plan presses either button; only a real sabotage is checked here.
        if (plan.action !== 'SABO' || plan.focus === plan.room) continue;
        expect(isLegalBreak(s, plan.room, plan.focus)).toBe(true);
        sabotaged += 1;
      }
    }
    expect(sabotaged).toBeGreaterThan(0);
  });

  it('never votes for a teammate, however suspicious they look', () => {
    const s = game({ mimics: ['Gus', 'Hal'] });
    s.xrayOnline = true;
    s.powerCells = 6;
    const voting = startVote(s);
    const gus = createMind(byName(s, 'Gus').id, 'terse', 'HARD');
    gus.suspicion[byName(s, 'Hal').id] = 10;
    for (let seed = 1; seed <= 20; seed++) {
      const { choice } = chooseBallot(gus, voting, createRng(seed));
      expect(choice).not.toBe(byName(s, 'Hal').id);
      expect(choice).not.toBe(gus.id);
    }
  });

  it('steals the cells that would have paid for a scan', () => {
    const s = game({ mimics: ['Gus'] });
    s.xrayOnline = true;
    s.repairProgress = s.config.repairTarget;
    // The Reactor tops the pool up to exactly the scan price, so one steal cancels the vote.
    s.powerCells = 1;
    const ms = minds(s);
    decideRound(ms, s, createRng(3));
    const gus = ms.find((m) => m.id === byName(s, 'Gus').id)!;
    expect(gus.plan).toMatchObject({ room: 'reactor', focus: 'reactor', action: 'SABO' });
  });

  it('prefers other sabotage when backup workers can undo a Med bay smash', () => {
    const s = game({ mimics: ['Gus'] });
    s.xrayOnline = true;
    s.repairProgress = s.config.repairTarget;
    s.powerCells = s.config.scanCostCells + s.config.stealAmount; // a steal cannot stop the scan
    const ms = minds(s);
    decideRound(ms, s, createRng(3));
    const gus = ms.find((m) => m.id === byName(s, 'Gus').id)!;
    expect(gus.plan!.action).toBe('SABO');
    expect(gus.plan!.focus).not.toBe('medbay');
  });
});

describe('the crew ballot', () => {
  it('skips without a lead, votes with one, and never votes for itself', () => {
    const s = game({ mimics: ['Gus'] });
    s.xrayOnline = true;
    s.powerCells = s.config.scanCostCells;
    const voting = startVote(s);
    const ann = createMind(byName(s, 'Ann').id, 'analytical', 'HARD');
    expect(chooseBallot(ann, voting, createRng(1))).toMatchObject({ choice: 'SKIP', reason: 'SAVE_CELLS' });

    ann.suspicion[byName(s, 'Gus').id] = 3;
    ann.suspicion[ann.id] = 9;
    expect(chooseBallot(ann, voting, createRng(1))).toMatchObject({ choice: byName(s, 'Gus').id, reason: 'EVIDENCE' });
  });

  it('spends a spare scan on the best guess rather than nothing', () => {
    const s = game({ mimics: ['Gus'] });
    s.xrayOnline = true;
    s.powerCells = s.config.scanCostCells * 2;
    const voting = startVote(s);
    const ann = createMind(byName(s, 'Ann').id, 'analytical', 'HARD');
    ann.suspicion[byName(s, 'Dee').id] = 0.4;
    expect(chooseBallot(ann, voting, createRng(1))).toMatchObject({ choice: byName(s, 'Dee').id, reason: 'VERIFY' });
  });
});

describe('talking', () => {
  const pace = { windowMs: 60_000, fast: false };

  it('keeps to the budget, stays inside the window, and carries no role-shaped key', () => {
    for (let seed = 1; seed <= 15; seed++) {
      const s = game({ seed, skill: 'NORMAL' });
      s.round = 3;
      const ms = minds(s);
      // Give them something to argue about.
      for (const m of ms) m.suspicion[byName(s, 'Dee').id] = 1.5;
      const lines = planTalk(ms, s, createRng(seed), pace, { xrayJustUp: false });
      expect(lines.length).toBeLessThanOrEqual(NAMES.length + 2);
      const perBot: Record<string, number> = {};
      for (const l of lines) perBot[l.playerId] = (perBot[l.playerId] ?? 0) + 1;
      for (const n of Object.values(perBot)) expect(n).toBeLessThanOrEqual(2);
      for (let i = 1; i < lines.length; i++) expect(lines[i].delayMs).toBeGreaterThanOrEqual(lines[i - 1].delayMs);
      if (lines.length) expect(lines[lines.length - 1].delayMs).toBeLessThanOrEqual(pace.windowMs);
      expect(leaks(lines)).toEqual([]);
      expect(JSON.stringify(lines)).not.toContain('MIMIC');
    }
  });

  it('opens round one with a plan, and says one line each in fast mode', () => {
    const s = game();
    const ms = minds(s);
    const lines = planTalk(ms, s, createRng(1), { windowMs: 2800, fast: true }, { xrayJustUp: false });
    expect(lines[0].utterance.kind).toBe('PLAN');
    expect(new Set(lines.map((l) => l.playerId)).size).toBe(lines.length);
    expect(lines[lines.length - 1].delayMs).toBeLessThanOrEqual(2800);
  });

  it('announces the room it will actually go to', () => {
    for (let seed = 1; seed <= 10; seed++) {
      const s = game({ seed });
      s.round = 2;
      const ms = minds(s);
      const lines = planTalk(ms, s, createRng(seed), pace, { xrayJustUp: false });
      for (const l of lines) {
        if (l.utterance.kind !== 'INTENT') continue;
        const m = ms.find((x) => x.id === l.playerId)!;
        expect(l.utterance.room).toBe(m.plan!.room);
      }
    }
  });

  it('never explains a ballot when votes are hidden', () => {
    const s = game({ mimics: ['Gus'] });
    s.xrayOnline = true;
    s.powerCells = 6;
    let v = startVote(s);
    for (const p of v.players) v = castBallot(v, p.id, byName(s, 'Gus').id).state;
    v = resolveVote(v).state;
    const ms = minds(v);
    for (const m of ms) m.lastBallot = { round: v.round, choice: byName(s, 'Gus').id, reason: 'EVIDENCE', evidence: null };

    v.hiddenVotes = true;
    const hidden = planVoteReactions(ms, v, createRng(1), { windowMs: 7000, fast: false });
    expect(hidden.some((l) => l.utterance.kind === 'VOTE_REASON')).toBe(false);
    expect(hidden.length).toBeGreaterThan(0);

    v.hiddenVotes = false;
    const open = planVoteReactions(ms, v, createRng(1), { windowMs: 7000, fast: false });
    expect(open.some((l) => l.utterance.kind === 'VOTE_REASON')).toBe(true);
    expect(open.length).toBeLessThanOrEqual(3);
  });

  it('reacts to a break, and keeps quiet about nothing', () => {
    const s = game({ mimics: ['Bo'] });
    const before = snapshot(s);
    sub(s, 'Bo', 'oxygen', 'oxygen', 'SABO');
    for (const n of NAMES.filter((x) => x !== 'Bo')) sub(s, n, 'cargo');
    const after = resolveRound(s, createRng(1)).state;
    const lines = planReactions(minds(after), after, before, createRng(1), { windowMs: 3000, fast: false });
    expect(lines.length).toBeGreaterThanOrEqual(1);
    expect(lines.length).toBeLessThanOrEqual(2);
    expect(lines[0].utterance).toMatchObject({ kind: 'REACT', mood: 'break', room: 'oxygen' });
  });
});

describe('the voice', () => {
  const names: Record<string, string> = { a: 'Ann', b: 'Bo' };
  const ev = { round: 2, kind: 'BREAK' as const, room: 'oxygen' as const, suspects: ['a', 'b'], weight: 4 };
  const samples: Utterance[] = [
    { kind: 'PLAN', counts: { reactor: 2, cargo: 1, medbay: 4, steering: 0, oxygen: 0 }, xrayJustUp: false },
    { kind: 'PLAN', counts: { reactor: 3, cargo: 0, medbay: 0, steering: 1, oxygen: 1 }, xrayJustUp: true },
    { kind: 'INTENT', room: 'reactor', why: 'cells' },
    { kind: 'INTENT', room: 'oxygen', why: 'guard' },
    { kind: 'ACCUSE', target: 'a', evidence: ev },
    { kind: 'ACCUSE', target: 'a', evidence: null },
    { kind: 'DEFEND', accuser: 'b', claim: 'notAlone', evidence: ev },
    { kind: 'DEFEND', accuser: 'b', claim: 'verified', evidence: null },
    { kind: 'DEFEND', accuser: 'b', claim: 'wasWorking', evidence: null },
    { kind: 'AGREE', speaker: 'b', target: 'a' },
    { kind: 'DISAGREE', speaker: 'b', target: 'a' },
    { kind: 'NO_LEAD' },
    { kind: 'WASTE', target: 'a', room: 'cargo' },
    { kind: 'REACT', mood: 'break', room: 'steering' },
    { kind: 'REACT', mood: 'stolen', room: 'reactor' },
    { kind: 'REACT', mood: 'short', room: 'cargo' },
    { kind: 'ACCUSE', target: 'a', evidence: { ...ev, kind: 'SLACK', room: 'reactor', suspects: ['a'] } },
    { kind: 'REACT', mood: 'xray' },
    { kind: 'REACT', mood: 'bad' },
    { kind: 'REACT', mood: 'quiet' },
    { kind: 'VOTE_REASON', choice: 'SKIP', reason: 'SAVE_CELLS', evidence: null },
    { kind: 'VOTE_REASON', choice: 'a', reason: 'EVIDENCE', evidence: ev },
    { kind: 'VOTE_REASON', choice: 'a', reason: 'VERIFY', evidence: null },
    { kind: 'VOTE_REACT', outcome: 'CAUGHT', target: 'a', me: false },
    { kind: 'VOTE_REACT', outcome: 'CLEARED', target: 'b', me: true },
    { kind: 'VOTE_REACT', outcome: 'SKIPPED', me: false },
    { kind: 'VOTE_REACT', outcome: 'RUNOFF', me: false },
  ];

  it('renders every utterance for every personality without a hole', () => {
    for (const personality of PERSONALITIES) {
      for (let seed = 1; seed <= 4; seed++) {
        const rng = createRng(seed);
        for (const u of samples) {
          const text = render(u, { personality, rng, name: (id) => names[id] ?? '?', round: 3 });
          expect(text.length).toBeGreaterThan(3);
          expect(text).not.toMatch(/undefined|null|\[object|NaN/);
        }
      }
    }
  });

  it('puts the evidence in plain words', () => {
    const text = render({ kind: 'ACCUSE', target: 'a', evidence: ev }, { personality: 'terse', rng: createRng(1), name: (id) => names[id], round: 3 });
    expect(text).toContain('Ann');
    expect(text).toContain('Oxygen');
    expect(text).toContain('one of 2');
  });

  it('uses shared history to avoid exact echoes across personalities and all utterances', () => {
    const recent: string[] = [];
    const rng = createRng(45);
    for (let pass = 0; pass < 8; pass++) for (const personality of PERSONALITIES) for (const u of samples) {
      const text = render(u, { personality, rng, name: id => names[id] ?? 'someone', round: 3, recent });
      if (!text) continue; // Exhausted pools should go quiet, not repeat themselves.
      expect(recent).not.toContain(text);
      expect(text).not.toMatch(/undefined|null|\[object|NaN/);
      recent.push(text);
    }
    expect(recent.length).toBeGreaterThan(100);
  });

  it('does not describe private exclusions as public proof someone was alone', () => {
    const text = render({ kind: 'ACCUSE', target: 'a', evidence: { ...ev, suspects: ['a'], witnesses: ['a', 'b'] } },
      { personality: 'terse', rng: createRng(1), name: id => names[id], round: 3 });
    expect(text).toContain('one of 2');
    expect(text).not.toContain('only one');
  });
});

describe('strategy regressions', () => {
  it('detects missing cargo production even when resource scarcity hides it in repair spending', () => {
    const s = game({ mimics: ['Bo'] });
    s.scrap = 0;
    const before = snapshot(s);
    sub(s, 'Bo', 'cargo', 'steering', 'SABO');
    sub(s, 'Ann', 'cargo');
    for (const name of NAMES.slice(2)) sub(s, name, 'medbay');
    const after = resolveRound(s, createRng(4)).state;
    expect(readReport(after, before).slack).toContain('cargo');
    expect(readReport(after, before).stolen).not.toContain('cargo');
  });

  it('does not blame reactor workers for output above its cap', () => {
    const s = game();
    const before = snapshot(s);
    NAMES.forEach(name => sub(s, name, 'reactor'));
    const after = resolveRound(s, createRng(4)).state;
    expect(readReport(after, before).slack).toEqual([]);
    expect(readReport(after, before).stolen).toEqual([]);
  });

  it('keeps team sabotage to one and makes non-designated Mimics actually work', () => {
    for (let seed = 0; seed < 60; seed++) {
      const s = game({ seed, skill: 'NORMAL' });
      s.config.sabotagesPerRound = 'team';
      const ms = minds(s);
      decideRound(ms, s, createRng(seed));
      const sabotage = ms.filter(m => byName(s, 'Gus').id === m.id || byName(s, 'Hal').id === m.id)
        .map(m => deriveIntent(s, { playerId: m.id, ...m.plan! }, 'MIMIC'));
      expect(sabotage.filter(a => a.intent !== 'WORK').length).toBeLessThanOrEqual(1);
    }
  });

  it('coordinates separate sabotages without duplicating break targets in each mode', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const s = game({ seed }); s.config.sabotagesPerRound = 'each';
      const ms = minds(s); decideRound(ms, s, createRng(seed));
      const targets = ms.filter(m => s.players.find(p => p.id === m.id)!.role === 'MIMIC')
        .map(m => deriveIntent(s, { playerId: m.id, ...m.plan! }, 'MIMIC'))
        .filter(i => i.intent === 'BREAK').map(i => i.target);
      expect(new Set(targets).size).toBe(targets.length);
    }
  });

  it('does not skip a final-round scan or scan a cleared scapegoat', () => {
    const s = game(); s.round = s.config.rounds; s.xrayOnline = true; s.powerCells = 20;
    const v = startVote(s);
    expect(chooseBallot(minds(s)[0], v, createRng(2)).choice).not.toBe('SKIP');
    const gus = minds(s).find(m => m.id === byName(s, 'Gus').id)!;
    gus.scapegoat = byName(s, 'Ann').id;
    byName(v, 'Ann').verified = true;
    expect(chooseBallot(gus, v, createRng(2)).choice).not.toBe(gus.scapegoat);
  });

  it('does not amplify the same accusation twice in a round', () => {
    const s = game(), m = minds(s)[0];
    hear(m, 'p1', 'p2', s);
    const first = m.suspicion.p2;
    hear(m, 'p1', 'p2', s);
    expect(m.suspicion.p2).toBe(first);
    expect(m.heard.length).toBe(1);
  });

  it('reports a repaired break as repaired rather than claiming its fuse is still ticking', () => {
    const s = game({ mimics: ['Bo'] }), before = snapshot(s);
    sub(s, 'Bo', 'cargo', 'steering', 'SABO');
    sub(s, 'Ann', 'steering');
    for (const name of NAMES.slice(2)) sub(s, name, 'cargo');
    const after = resolveRound(s, createRng(1)).state;
    const lines = planReactions(minds(s), after, before, createRng(1), { windowMs: 3000, fast: false });
    expect(lines.some(l => l.utterance.kind === 'REACT' && l.utterance.mood === 'break')).toBe(false);
    expect(lines.some(l => l.utterance.kind === 'REACT' && l.utterance.mood === 'repaired')).toBe(true);
  });

  it('finishes whole games with legal actions and ballots across difficulty and visibility modes', () => {
    for (const skill of ['EASY', 'NORMAL', 'HARD'] as const) for (let seed = 1; seed <= 12; seed++) {
      const rng = createRng(seed);
      let s = game({ skill, seed }); s.round = 0; s.hiddenVotes = seed % 2 === 0;
      s.config.sabotagesPerRound = seed % 3 === 0 ? 'each' : 'team';
      const ms = minds(s);
      while (!s.winner) {
        s = beginRound(s);
        if (s.winner) break;
        planTalk(ms, s, rng, { windowMs: 60000, fast: false }, { xrayJustUp: false });
        const before = snapshot(s);
        for (const m of ms.filter(m => s.players.find(p => p.id === m.id)?.alive)) s.submissions[m.id] = { playerId: m.id, ...m.plan! };
        s = resolveRound(s, rng).state;
        ms.forEach(m => absorbRound(m, s, before, rng));
        if (shouldVote(s)) {
          s = startVote(s);
          for (let stage = 0; stage < 2; stage++) {
            for (const id of s.vote!.voters) {
              const cast = castBallot(s, id, chooseBallot(ms.find(m => m.id === id)!, s, rng).choice);
              expect(cast.ok).toBe(true); s = cast.state;
            }
            const result = resolveVote(s); s = result.state;
            if (result.outcome.kind !== 'RUNOFF') break;
            s = startVote(s, 'RUNOFF', result.outcome.candidates);
          }
        }
        s = checkEndOfGame(s);
        expect(s.round).toBeLessThanOrEqual(s.config.rounds);
      }
      expect(['CREW', 'MIMIC']).toContain(s.winner);
    }
  });
});
