import { describe, expect, it } from 'vitest';
import {
  ADJACENCY,
  PIPES,
  ROOMS,
  beginRound,
  buildActOptions,
  castBallot,
  checkEndOfGame,
  createGame,
  createRng,
  deriveIntent,
  isLegalBreak,
  livingMimics,
  resolveRound,
  resolveSettings,
  shouldVote,
  startGame,
  startVote,
  toPublicState,
  upcomingStep,
  type GameState,
  type RoomId,
} from '../src/index.js';
import { byName, makeGame, scriptedRng, sub, NAMES } from './helpers.js';

const rng = () => createRng(12345);

describe('map', () => {
  it('has exactly 6 undirected pipes and a derived adjacency', () => {
    expect(PIPES).toHaveLength(6);
    const sorted = (r: RoomId) => [...ADJACENCY[r]].sort();
    expect(sorted('reactor')).toEqual(['cargo', 'medbay', 'oxygen']);
    expect(sorted('cargo')).toEqual(['reactor', 'steering']);
    expect(sorted('steering')).toEqual(['cargo', 'medbay']);
    expect(sorted('oxygen')).toEqual(['medbay', 'reactor']);
    expect(sorted('medbay')).toEqual(['oxygen', 'reactor', 'steering']);
  });

  it('exposes the adjacency as frozen, so no caller can reorder the ship', () => {
    expect(Object.isFrozen(ADJACENCY.medbay)).toBe(true);
  });
});

// 1 -------------------------------------------------------------------------
describe('1. alien counts', () => {
  const count = (n: number) => {
    let s = createGame('AAAA', 7);
    for (let i = 0; i < n; i++)
      s.players.push({
        id: 'p' + i, name: NAMES[i] ?? 'P' + i, token: 't' + i, role: 'CREW',
        alive: true, verified: false, room: null, connected: true, isBot: false,
      });
    s = startGame(s, rng());
    return s.players.filter((p) => p.role === 'MIMIC').length;
  };
  it('assigns 1 / 2 / 2 / 3 aliens at 5 / 6 / 8 / 10 players', () => {
    expect(count(5)).toBe(1);
    expect(count(6)).toBe(2);
    expect(count(8)).toBe(2);
    expect(count(10)).toBe(3);
  });
});

// 2 -------------------------------------------------------------------------
describe('2. one sabotage per round for the whole team', () => {
  it('lands exactly one break; the other Mimic works in their chosen room', () => {
    const s = makeGame(8, { mimics: ['Ann', 'Bo'] });
    sub(s, 'Ann', 'cargo', 'steering', 'SABO');
    sub(s, 'Bo', 'medbay', 'oxygen', 'SABO');
    const { state, report } = resolveRound(s, rng());
    const broken = ROOMS.filter((r) => state.rooms[r].broken);
    expect(broken).toHaveLength(1);
    const works = report.intents.filter((i) => i.intent === 'WORK');
    const sabs = report.intents.filter((i) => i.intent !== 'WORK');
    expect(sabs).toHaveLength(1);
    // the suppressed Mimic still stands where they chose
    const bo = report.intents.find((i) => i.playerId === byName(state, 'Bo').id)!;
    const ann = report.intents.find((i) => i.playerId === byName(state, 'Ann').id)!;
    expect([bo.room, ann.room].sort()).toEqual(['cargo', 'medbay']);
    expect(works.length + sabs.length).toBe(8);
  });
});

// 3 -------------------------------------------------------------------------
describe('3. repair costs exactly one action', () => {
  it('a broken reactor with 2 workers ends repaired and yields 1 cell', () => {
    const s = makeGame(8, { mimics: ['Lena'] });
    s.rooms.reactor.broken = true;
    s.rooms.reactor.fuse = 3;
    sub(s, 'Ann', 'reactor');
    sub(s, 'Bo', 'reactor');
    for (const n of ['Cal', 'Dee', 'Eva', 'Fin', 'Gareth', 'Hugo']) sub(s, n, 'steering');
    const { state } = resolveRound(s, rng());
    expect(state.rooms.reactor.broken).toBe(false);
    expect(state.rooms.reactor.fuse).toBe(null);
    expect(state.powerCells).toBe(1);
  });
});

// 3a ------------------------------------------------------------------------
describe('3a. reactor cap', () => {
  it('caps at 3 in an 8-player game and 6 in a 10-player game', () => {
    const s = makeGame(8, { mimics: ['Hugo'] });
    for (const n of ['Ann', 'Bo', 'Cal', 'Dee', 'Eva']) sub(s, n, 'reactor');
    for (const n of ['Fin', 'Gareth', 'Hugo']) sub(s, n, 'steering');
    expect(resolveRound(s, rng()).state.powerCells).toBe(3);

    const big = makeGame(10, { mimics: ['Jo'] });
    expect(big.config.reactorCapCells).toBe(6);
    for (const n of ['Ann', 'Bo', 'Cal', 'Dee', 'Eva', 'Fin', 'Gareth']) sub(big, n, 'reactor');
    for (const n of ['Hugo', 'Iris', 'Jo']) sub(big, n, 'steering');
    expect(resolveRound(big, rng()).state.powerCells).toBe(6);
  });
});

// 3b ------------------------------------------------------------------------
describe('3b. the focus rule and sabotage range', () => {
  const intentOf = (s: GameState, name: string, room: RoomId, focus: RoomId) =>
    deriveIntent(s, { playerId: byName(s, name).id, room, focus, action: 'SABO' }, byName(s, name).role);

  it('respects pipe range and the reactor rules', () => {
    const s = makeGame(8, { mimics: ['Ann'] });
    expect(intentOf(s, 'Ann', 'steering', 'reactor').intent).toBe('WORK'); // not adjacent
    expect(intentOf(s, 'Ann', 'cargo', 'reactor')).toMatchObject({ intent: 'BREAK', target: 'reactor' });
    expect(intentOf(s, 'Ann', 'medbay', 'steering')).toMatchObject({ intent: 'BREAK', target: 'steering' });
    expect(intentOf(s, 'Ann', 'medbay', 'oxygen')).toMatchObject({ intent: 'BREAK', target: 'oxygen' });
    expect(intentOf(s, 'Ann', 'medbay', 'reactor')).toMatchObject({ intent: 'BREAK', target: 'reactor' });
    expect(intentOf(s, 'Ann', 'reactor', 'reactor')).toMatchObject({ intent: 'STEAL', resource: 'cells' });
  });

  it('isLegalBreak is the single source of truth', () => {
    const s = makeGame(6);
    expect(isLegalBreak(s, 'reactor', 'reactor')).toBe(false); // never from inside
    expect(isLegalBreak(s, 'steering', 'steering')).toBe(true);
    expect(isLegalBreak(s, 'oxygen', 'oxygen')).toBe(true);
    expect(isLegalBreak(s, 'cargo', 'cargo')).toBe(false); // unbreakable
    expect(isLegalBreak(s, 'medbay', 'medbay')).toBe(false);
    s.rooms.steering.broken = true;
    expect(isLegalBreak(s, 'cargo', 'steering')).toBe(false); // already broken
  });
});

// 3c ------------------------------------------------------------------------
describe('3c. scan affordability', () => {
  it('needs the full scan cost and leaves 0 behind', async () => {
    const { resolveVote } = await import('../src/index.js');
    const s = makeGame(8, { mimics: ['Ann'] });
    s.xrayOnline = true;
    s.powerCells = 3;
    expect(shouldVote(s)).toBe(false);
    s.powerCells = 4;
    expect(shouldVote(s)).toBe(true);

    let v = startVote(s);
    for (const p of v.players) v = castBallot(v, p.id, byName(v, 'Bo').id).state;
    expect(resolveVote(v).state.powerCells).toBe(0);
  });
});

// 4 -------------------------------------------------------------------------
describe('4. fuses and the crash', () => {
  it('a room broken in round 3 breaches the hull at the start of round 6', () => {
    let s = makeGame(8, { mimics: ['Ann'] });
    s.round = 3;
    s.rooms.steering.broken = true;
    s.rooms.steering.fuse = 3;
    s = beginRound(s); // round 4 -> fuse 2
    expect(s.rooms.steering.fuse).toBe(2);
    expect(s.winner).toBe(null);
    s = beginRound(s); // round 5 -> fuse 1
    expect(s.rooms.steering.fuse).toBe(1);
    expect(s.winner).toBe(null);
    s = beginRound(s); // round 6 -> fuse 0
    expect(s.round).toBe(6);
    expect(s.winner).toBe('MIMIC');
    expect(s.winReason).toBe('HULL_BREACH');
  });
});

// 5, 6, 20 ------------------------------------------------------------------
describe('5/6/20. the med bay', () => {
  it('4 workers + 1 corrupt spends 4 scrap and can gain at most 3', () => {
    const s = makeGame(8, { mimics: ['Hugo'] });
    s.scrap = 10;
    for (const n of ['Ann', 'Bo', 'Cal', 'Dee']) sub(s, n, 'medbay');
    sub(s, 'Hugo', 'medbay', 'medbay', 'SABO');
    for (const n of ['Eva', 'Fin', 'Gareth']) sub(s, n, 'steering');
    // every roll succeeds
    const { state } = resolveRound(s, scriptedRng([0, 0, 0, 0, 0, 0, 0, 0]) as any);
    expect(state.scrap).toBe(6); // exactly 4 spent
    expect(state.repairProgress).toBeLessThanOrEqual(3);
    expect(state.repairProgress).toBe(3);
  });

  it('spends and gains nothing with an empty scrap pool', () => {
    const s = makeGame(8, { mimics: ['Hugo'] });
    s.scrap = 0;
    for (const n of ['Ann', 'Bo']) sub(s, n, 'medbay');
    for (const n of ['Cal', 'Dee', 'Eva', 'Fin', 'Gareth', 'Hugo']) sub(s, n, 'steering');
    const { state } = resolveRound(s, scriptedRng([0, 0, 0, 0]) as any);
    expect(state.scrap).toBe(0);
    expect(state.repairProgress).toBe(0);
  });

  it('medbaySeats: 3 with 5 workers spends exactly 3 scrap', () => {
    const s = makeGame(8, { mimics: ['Hugo'] });
    s.config.medbaySeats = 3;
    s.scrap = 10;
    for (const n of ['Ann', 'Bo', 'Cal', 'Dee', 'Eva']) sub(s, n, 'medbay');
    for (const n of ['Fin', 'Gareth', 'Hugo']) sub(s, n, 'steering');
    const { state } = resolveRound(s, scriptedRng([0, 0, 0, 0, 0]) as any);
    expect(state.scrap).toBe(7);
  });
});

// 7, 8 ----------------------------------------------------------------------
describe('7/8. the vote', () => {
  it('a tie triggers a runoff where candidates cannot vote for themselves', async () => {
    const { resolveVote } = await import('../src/index.js');
    let s = makeGame(6, { mimics: ['Ann'] });
    s.xrayOnline = true;
    s.powerCells = 4;
    s = startVote(s);
    const [a, b, c, d, e, f] = s.players;
    s = castBallot(s, a.id, b.id).state;
    s = castBallot(s, c.id, b.id).state;
    s = castBallot(s, d.id, e.id).state;
    s = castBallot(s, f.id, e.id).state;
    const first = resolveVote(s);
    expect(first.outcome.kind).toBe('RUNOFF');
    const cands = (first.outcome as any).candidates.sort();
    expect(cands).toEqual([b.id, e.id].sort());
    expect(first.state.powerCells).toBe(4); // nothing spent yet

    let r = startVote(first.state, 'RUNOFF', cands);
    expect(castBallot(r, b.id, b.id).ok).toBe(false); // no self-vote in a runoff
    expect(castBallot(r, b.id, 'SKIP').ok).toBe(false); // no SKIP in a runoff
    r = castBallot(r, a.id, b.id).state;
    r = castBallot(r, c.id, e.id).state;
    const second = resolveVote(r);
    expect(second.outcome.kind).toBe('TIE');
    expect(second.state.powerCells).toBe(4); // a second tie spends nothing
  });

  it('SKIP winning the first ballot spends nothing and scans nobody', async () => {
    const { resolveVote } = await import('../src/index.js');
    let s = makeGame(6, { mimics: ['Ann'] });
    s.xrayOnline = true;
    s.powerCells = 5;
    s = startVote(s);
    for (const p of s.players.slice(0, 4)) s = castBallot(s, p.id, 'SKIP').state;
    s = castBallot(s, s.players[4].id, s.players[1].id).state;
    const { state, outcome } = resolveVote(s);
    expect(outcome.kind).toBe('SKIP');
    expect(state.powerCells).toBe(5);
    expect(state.players.every((p) => p.alive)).toBe(true);
  });
});

// 9, 10 ---------------------------------------------------------------------
describe('9/10. game over', () => {
  it('scanning the last living alien ends the game immediately', async () => {
    const { resolveVote } = await import('../src/index.js');
    let s = makeGame(5, { mimics: ['Ann'] });
    s.xrayOnline = true;
    s.powerCells = 4;
    s = startVote(s);
    const ann = byName(s, 'Ann');
    for (const p of s.players.filter((x) => x.id !== ann.id)) s = castBallot(s, p.id, ann.id).state;
    const { state, outcome } = resolveVote(s);
    expect(outcome.kind).toBe('SCAN');
    expect(byName(state, 'Ann').alive).toBe(false);
    expect(livingMimics(state)).toHaveLength(0);
    expect(state.winner).toBe('CREW');
    expect(state.winReason).toBe('ALL_MIMICS_FOUND');
  });

  it('finishing the last round with an alien alive is a Mimic win', () => {
    const s = makeGame(8, { mimics: ['Ann', 'Bo'] });
    s.round = 10;
    const out = checkEndOfGame(s);
    expect(out.winner).toBe('MIMIC');
    expect(out.winReason).toBe('REACHED_THE_RELAY');
  });
});

// 11 ------------------------------------------------------------------------
describe('11. PublicState leaks nothing', () => {
  const forbidden = ['role', 'token', 'intent', 'intents', 'focus', 'action', 'submissions', 'trueRole'];
  const walk = (v: unknown, path = '$'): string[] => {
    if (Array.isArray(v)) return v.flatMap((x, i) => walk(x, path + '[' + i + ']'));
    if (v && typeof v === 'object')
      return Object.entries(v as object).flatMap(([k, x]) =>
        forbidden.includes(k) ? [path + '.' + k] : walk(x, path + '.' + k),
      );
    return [];
  };

  it('contains no role, token, intent, focus or action key at any depth', () => {
    let s = makeGame(8, { mimics: ['Ann', 'Bo'] });
    sub(s, 'Ann', 'cargo', 'steering', 'SABO');
    for (const n of ['Bo', 'Cal', 'Dee']) sub(s, n, 'medbay');
    for (const n of ['Eva', 'Fin', 'Gareth', 'Hugo']) sub(s, n, 'reactor');
    s = resolveRound(s, rng()).state;
    s = startVote(s);
    const pub = toPublicState(s, 3);
    expect(walk(pub)).toEqual([]);
    expect(JSON.stringify(pub)).not.toContain('MIMIC');
  });
});

// 12 ------------------------------------------------------------------------
describe('12. actOptions is identical for everyone', () => {
  it('is deep-equal for a crew member and a Mimic', () => {
    const s = makeGame(8, { mimics: ['Ann', 'Bo'] });
    s.rooms.steering.broken = true;
    expect(buildActOptions(s)).toEqual(buildActOptions(s));
    expect(buildActOptions(s).focus.medbay).toEqual(['medbay', 'reactor', 'steering', 'oxygen']);
    expect(buildActOptions(s).actions).toEqual(['WORK', 'SABO']);
  });
});

// 13 ------------------------------------------------------------------------
describe('13. a crew SABO is indistinguishable from WORK', () => {
  it('produces a deep-equal state and leaves no trace', () => {
    const build = (action: 'WORK' | 'SABO') => {
      const s = makeGame(8, { mimics: ['Hugo'] });
      sub(s, 'Ann', 'cargo', 'steering', action);
      for (const n of ['Bo', 'Cal']) sub(s, n, 'cargo');
      for (const n of ['Dee', 'Eva']) sub(s, n, 'medbay');
      for (const n of ['Fin', 'Gareth', 'Hugo']) sub(s, n, 'reactor');
      const out = resolveRound(s, createRng(99));
      // the submission itself differs by construction; compare everything downstream
      const { submissions, ...rest } = out.state;
      return rest;
    };
    expect(build('SABO')).toEqual(build('WORK'));
  });
});

// 14 ------------------------------------------------------------------------
describe('14. the full focus matrix for a Mimic', () => {
  it('maps every focus to the right intent', () => {
    const s = makeGame(8, { mimics: ['Ann'] });
    const ann = byName(s, 'Ann');
    const d = (room: RoomId, focus: RoomId) =>
      deriveIntent(s, { playerId: ann.id, room, focus, action: 'SABO' }, 'MIMIC');

    expect(d('medbay', 'medbay').intent).toBe('CORRUPT');
    expect(d('cargo', 'cargo')).toMatchObject({ intent: 'STEAL', resource: 'scrap' });
    expect(d('reactor', 'reactor')).toMatchObject({ intent: 'STEAL', resource: 'cells' });
    expect(d('steering', 'steering')).toMatchObject({ intent: 'BREAK', target: 'steering' });
    expect(d('oxygen', 'oxygen')).toMatchObject({ intent: 'BREAK', target: 'oxygen' });
    expect(d('oxygen', 'reactor')).toMatchObject({ intent: 'BREAK', target: 'reactor' });
    expect(d('cargo', 'steering')).toMatchObject({ intent: 'BREAK', target: 'steering' });
    expect(d('steering', 'cargo').intent).toBe('WORK'); // unbreakable neighbour
    expect(d('oxygen', 'medbay').intent).toBe('WORK'); // unbreakable neighbour

    s.rooms.oxygen.broken = true;
    expect(d('reactor', 'oxygen').intent).toBe('WORK'); // already broken
  });
});

// 21 ------------------------------------------------------------------------
describe('21. sabotagesPerRound: each', () => {
  it('breaks both rooms', () => {
    const s = makeGame(8, { mimics: ['Ann', 'Bo'] });
    s.config.sabotagesPerRound = 'each';
    sub(s, 'Ann', 'cargo', 'steering', 'SABO');
    sub(s, 'Bo', 'medbay', 'oxygen', 'SABO');
    for (const n of ['Cal', 'Dee', 'Eva', 'Fin', 'Gareth', 'Hugo']) sub(s, n, 'cargo');
    const { state } = resolveRound(s, rng());
    expect(state.rooms.steering.broken).toBe(true);
    expect(state.rooms.oxygen.broken).toBe(true);
  });
});

// 17, 18 --------------------------------------------------------------------
describe('17/18. the settings resolver', () => {
  it('resolves the slider by player count', () => {
    const a = resolveSettings({ balance: 0, custom: null }, 8);
    expect([a.reactorCapCells, a.scanCostCells, a.rounds]).toEqual([3, 4, 10]);
    const b = resolveSettings({ balance: 0, custom: null }, 11);
    expect([b.reactorCapCells, b.scanCostCells, b.rounds]).toEqual([6, 5, 10]);
    const c = resolveSettings({ balance: 2, custom: null }, 12);
    expect([c.reactorCapCells, c.scanCostCells, c.rounds]).toEqual([5, 7, 10]);
  });

  it('clamps custom values to their range but allows unbalanced ones', () => {
    expect(resolveSettings({ balance: 0, custom: { rounds: 99 } }, 8).rounds).toBe(14);
    expect(resolveSettings({ balance: 0, custom: { rounds: 1 } }, 8).rounds).toBe(6);
    expect(resolveSettings({ balance: 0, custom: { aliens: 4 } }, 6).aliens).toBe(4);
    expect(resolveSettings({ balance: 0, custom: { aliens: 'auto' } }, 6).aliens).toBe(2);
    expect(resolveSettings({ balance: 0, custom: { repairSuccessChance: 0.95 } }, 8).repairSuccessChance).toBe(0.8);
    expect(resolveSettings({ balance: 0, custom: { phaseSeconds: { TALK: 5 } } }, 8).phaseSeconds.TALK).toBe(30);
  });

  it('assigns the custom alien count at game start', () => {
    let s = createGame('CUST', 3);
    for (let i = 0; i < 6; i++)
      s.players.push({
        id: 'p' + i, name: NAMES[i], token: 't' + i, role: 'CREW',
        alive: true, verified: false, room: null, connected: true, isBot: false,
      });
    s.settings = { balance: 0, custom: { aliens: 4 } };
    s = startGame(s, rng());
    expect(s.players.filter((p) => p.role === 'MIMIC')).toHaveLength(4);
  });
});

// Hidden votes ---------------------------------------------------------------
describe('hidden votes', () => {
  it('never lets a ballot leave the server — not live, not after, not in the log', async () => {
    const { resolveVote } = await import('../src/index.js');
    let s = makeGame(6, { mimics: ['Ann'] });
    s.hiddenVotes = true;
    s.xrayOnline = true;
    s.powerCells = 4;
    s = startVote(s);
    const ann = byName(s, 'Ann');
    for (const p of s.players.filter((x) => x.id !== ann.id)) s = castBallot(s, p.id, ann.id).state;
    s = resolveVote(s).state;

    const pub = toPublicState(s);
    expect(pub.vote!.ballots).toEqual([]);
    expect(pub.log.some((e) => 'ballots' in e)).toBe(false);
    expect(JSON.stringify(pub)).not.toContain('voterId');
    // The outcome is still public: that is the whole point of a scan.
    expect(pub.vote!.result).toMatchObject({ kind: 'SCAN', playerId: ann.id, revealed: 'MIMIC' });
    // ...and who has voted is participation, not a result, so it stays.
    expect(pub.vote!.voted).toHaveLength(5);
  });

  it('shows ballots as normal when the mode is off', async () => {
    const { resolveVote } = await import('../src/index.js');
    let s = makeGame(6, { mimics: ['Ann'] });
    s.xrayOnline = true;
    s.powerCells = 4;
    s = startVote(s);
    for (const p of s.players) s = castBallot(s, p.id, 'SKIP').state;
    s = resolveVote(s).state;
    expect(toPublicState(s).vote!.ballots).toHaveLength(6);
  });

  it('names both modes in the settings line', () => {
    const s = makeGame(6);
    s.manualSteps = true;
    s.hiddenVotes = true;
    expect(toPublicState(s).settingsLine).toMatch(/manual steps · votes hidden$/);
  });
});

// The next step --------------------------------------------------------------
describe('the next step', () => {
  it('walks the fixed part of a round', () => {
    const s = makeGame(6);
    s.phase = 'REPORT';
    expect(upcomingStep(s)).toEqual({ next: { kind: 'TALK', round: 1 }, voteThisRound: 'UNKNOWN' });
    s.phase = 'TALK';
    expect(upcomingStep(s).next).toEqual({ kind: 'ACT', round: 1 });
    s.phase = 'ACT';
    expect(upcomingStep(s).next).toEqual({ kind: 'RESOLVE', round: 1 });
    s.phase = 'ROLES';
    s.round = 0;
    expect(upcomingStep(s).next).toEqual({ kind: 'REPORT', round: 1 });
  });

  it('knows once the round has resolved whether it ends in a vote', () => {
    const s = makeGame(6);
    s.round = 3;
    s.phase = 'RESOLVE';
    expect(upcomingStep(s)).toEqual({ next: { kind: 'REPORT', round: 4 }, voteThisRound: 'NO' });
    s.xrayOnline = true;
    s.powerCells = 4;
    expect(upcomingStep(s)).toEqual({ next: { kind: 'VOTE', round: 3 }, voteThisRound: 'YES' });
  });

  it('ends the game after the last round', () => {
    const s = makeGame(6);
    s.round = 10;
    s.phase = 'RESOLVE';
    expect(upcomingStep(s).next).toEqual({ kind: 'GAME_OVER', round: 10 });
  });

  it('follows a vote through its result and a runoff', async () => {
    const { resolveVote } = await import('../src/index.js');
    let s = makeGame(6, { mimics: ['Ann'] });
    s.round = 2;
    s.xrayOnline = true;
    s.powerCells = 4;
    s = startVote(s);
    expect(upcomingStep(s).next).toEqual({ kind: 'VOTE_RESULT', round: 2 });

    const [a, b, c, d] = s.players;
    s = castBallot(s, a.id, b.id).state;
    s = castBallot(s, c.id, d.id).state;
    s = resolveVote(s).state; // tie -> runoff
    expect(upcomingStep(s).next).toEqual({ kind: 'RUNOFF', round: 2 });

    s = startVote(s, 'RUNOFF', [b.id, d.id]);
    s = castBallot(s, a.id, b.id).state;
    s = castBallot(s, c.id, d.id).state;
    s = resolveVote(s).state; // tied again -> no scan, next round
    expect(upcomingStep(s).next).toEqual({ kind: 'REPORT', round: 3 });
  });

  it('is part of the public state', () => {
    const s = makeGame(6);
    s.phase = 'TALK';
    expect(toPublicState(s)).toMatchObject({
      upcoming: { kind: 'ACT', round: 1 },
      voteThisRound: 'UNKNOWN',
    });
  });
});
