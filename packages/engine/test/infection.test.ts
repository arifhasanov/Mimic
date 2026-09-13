import { describe, expect, it } from 'vitest';
import { beginRound, castBallot, checkEndOfGame, createGame, createRng, INFECTION_RULES,
  resolveRound, resolveVote, startGame, startVote, toPublicState } from '../src/index.js';
import { byName, makeGame, sub } from './helpers.js';

const game = () => makeGame(8, { mimics: ['Ann', 'Bo'] });
const resolve = (s: ReturnType<typeof game>) => resolveRound(s, createRng(7)).state;

describe('infection objective', () => {
  it('starts at zero and resets for a new game', () => {
    expect(createGame('TEST', 1).infection).toBe(0);
    const s = game(); s.infection = 12;
    expect(startGame(s, createRng(1)).infection).toBe(0);
  });

  it.each(['team', 'each'] as const)('adds only two per round in %s mode, including immediate repairs', mode => {
    const s = game(); s.config.sabotagesPerRound = mode;
    sub(s, 'Ann', 'cargo', 'steering', 'SABO');
    sub(s, 'Bo', 'medbay', 'oxygen', 'SABO');
    sub(s, 'Cal', 'steering'); sub(s, 'Dee', 'oxygen');
    const out = resolve(s);
    expect(out.infection).toBe(2);
    expect(out.rooms.steering.broken).toBe(false);
    expect(out.rooms.oxygen.broken).toBe(false);
  });

  it.each([0, 1, 9, 10, 11, 12])('decays from %i without going negative, even with an old broken room', level => {
    const s = game(); s.infection = level;
    s.rooms.oxygen = { id: 'oxygen', broken: true, fuse: 2 };
    expect(resolve(s).infection).toBe(Math.max(0, level - 1));
  });

  it('caps at twelve and publishes actual changes without exposing submissions', () => {
    const s = game(); s.infection = 11; s.powerCells = 1;
    sub(s, 'Ann', 'reactor', 'reactor', 'SABO');
    const out = resolve(s); const pub = toPublicState(out);
    expect(pub.infection).toBe(12);
    expect(pub.infectionRules).toEqual(INFECTION_RULES);
    expect(pub.lastReport).toMatchObject({ infection: 12, infectionDelta: 1 });
    expect(pub.lastReport).not.toHaveProperty('intents');
    expect(pub).not.toHaveProperty('submissions');
    expect(out.log.at(-1)?.text).toContain('Infection 12/12');
  });

  it.each(['reactor', 'cargo'] as const)('empty %s theft does not spread, even if production follows', room => {
    const s = game(); s.infection = 3; s.scrap = 0; s.powerCells = 0;
    sub(s, 'Ann', room, room, 'SABO'); sub(s, 'Cal', room);
    expect(resolve(s).infection).toBe(2);
  });

  it.each(['reactor', 'cargo'] as const)('nonempty %s theft spreads', room => {
    const s = game(); s.scrap = 1; s.powerCells = 1;
    sub(s, 'Ann', room, room, 'SABO');
    expect(resolve(s).infection).toBe(2);
  });

  it.each(['no workers', 'no scrap', 'no seats'])('corruption with %s does not spread', reason => {
    const s = game(); s.infection = 3;
    for (const p of s.players) sub(s, p.name, 'steering');
    sub(s, 'Ann', 'medbay', 'medbay', 'SABO');
    if (reason !== 'no workers') sub(s, 'Cal', 'medbay');
    s.scrap = reason === 'no scrap' ? 0 : 10;
    if (reason === 'no seats') s.config.medbaySeats = 0;
    expect(resolve(s).infection).toBe(2);
  });

  it('corruption spreads when it consumes a funded repair attempt', () => {
    const s = game(); s.scrap = 10;
    sub(s, 'Ann', 'medbay', 'medbay', 'SABO'); sub(s, 'Cal', 'medbay');
    expect(resolve(s).infection).toBe(2);
  });

  it('a scanner smash spreads even when the scanner is rebuilt immediately', () => {
    const s = game(); s.scrap = 10; s.xrayOnline = true;
    s.repairProgress = s.config.repairTarget; s.config.repairSuccessChance = 1;
    sub(s, 'Ann', 'reactor', 'medbay', 'SABO'); sub(s, 'Cal', 'medbay');
    const out = resolve(s);
    expect(out.xrayOnline).toBe(true); expect(out.infection).toBe(2);
  });

  it('crew SABO and illegal Mimic SABO decay exactly like work', () => {
    const s = game(); s.infection = 3;
    sub(s, 'Cal', 'cargo', 'steering', 'SABO');
    sub(s, 'Ann', 'reactor', 'cargo', 'SABO');
    expect(resolve(s).infection).toBe(2);
  });

  it.each([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12])('checks arrival at infection %i', level => {
    const s = game(); s.round = s.config.rounds; s.infection = level;
    const out = checkEndOfGame(s);
    expect(out.winner).toBe(level >= 10 ? 'MIMIC' : 'CREW');
    expect(out.winReason).toBe(level >= 10 ? 'REACHED_THE_RELAY' : 'INFECTION_CONTAINED');
    expect(out.phase).toBe('GAME_OVER');
  });

  it('uses the final resolution, including decay, for arrival', () => {
    const s = game(); s.round = s.config.rounds; s.infection = 10;
    expect(checkEndOfGame(resolve(s)).winner).toBe('CREW');
    sub(s, 'Ann', 'cargo', 'steering', 'SABO');
    expect(checkEndOfGame(resolve(s)).winner).toBe('MIMIC');
  });

  it('cannot win early from infection alone and honours a custom deadline', () => {
    const s = game(); s.config.rounds = 6; s.round = 5; s.infection = 12;
    expect(checkEndOfGame(s).winner).toBeNull();
    s.round = 6; expect(checkEndOfGame(s).winner).toBe('MIMIC');
  });

  it.each(['team', 'each'] as const)('three Mimics cannot win by working eight rounds then attacking twice (%s)', mode => {
    let s = makeGame(10, { mimics: ['Ann', 'Bo', 'Cal'] });
    s.config.sabotagesPerRound = mode;
    s.xrayOnline = true; s.repairProgress = s.config.repairTarget; s.powerCells = 50;
    for (let round = 1; round <= 10; round++) {
      if (round > 1) s = beginRound(s);
      for (const p of s.players.filter(p => p.alive))
        sub(s, p.name, 'cargo', 'cargo', round >= 9 && p.role === 'MIMIC' ? 'SABO' : 'WORK');
      s = resolve(s);
      if (round >= 9) {
        const target = s.players.find(p => p.alive && p.role === 'MIMIC')!;
        s = startVote(s);
        for (const p of s.players.filter(p => p.alive && p.id !== target.id))
          s = castBallot(s, p.id, target.id).state;
        s = resolveVote(s).state;
      }
      s = checkEndOfGame(s);
    }
    expect(s.players.filter(p => p.role === 'MIMIC' && p.alive)).toHaveLength(1);
    expect(s.infection).toBe(4);
    expect(s.winReason).toBe('INFECTION_CONTAINED');
    expect(s.winner).toBe('CREW');
  });

  it.each([3, 4, 5])('checks a late push of %i effective sabotage rounds', attackRounds => {
    let s = makeGame(10, { mimics: ['Ann', 'Bo', 'Cal'] });
    for (let round = 1; round <= 10; round++) {
      if (round > 1) s = beginRound(s);
      for (const p of s.players)
        sub(s, p.name, 'cargo', 'cargo', round > 10 - attackRounds && p.role === 'MIMIC' ? 'SABO' : 'WORK');
      s = checkEndOfGame(resolve(s));
    }
    expect(s.infection).toBe(attackRounds * 2);
    expect(s.winner).toBe(attackRounds >= 5 ? 'MIMIC' : 'CREW');
  });

  it('can bank twelve and stay quiet for the last two rounds, but not three', () => {
    let s = game(); s.infection = 12;
    s = resolve(s); expect(s.infection).toBe(11);
    s = resolve(beginRound(s)); expect(s.infection).toBe(10);
    const atArrival = { ...s, round: s.config.rounds };
    expect(checkEndOfGame(atArrival).winner).toBe('MIMIC');
    s = resolve(beginRound(s)); expect(s.infection).toBe(9);
    expect(checkEndOfGame({ ...s, round: s.config.rounds }).winner).toBe('CREW');
  });

  it('finding the last Mimic on the final vote wins even at maximum infection', () => {
    let s = makeGame(8, { mimics: ['Ann'] }); s.infection = 12;
    s.round = s.config.rounds; s.xrayOnline = true; s.powerCells = 20;
    s = startVote(s);
    for (const p of s.players.filter(p => p.name !== 'Ann')) s = castBallot(s, p.id, byName(s, 'Ann').id).state;
    const out = checkEndOfGame(resolveVote(s).state);
    expect(out.winner).toBe('CREW'); expect(out.winReason).toBe('ALL_MIMICS_FOUND');
  });

  it('a hull breach still wins with zero infection', () => {
    const s = game(); s.rooms.oxygen = { id: 'oxygen', broken: true, fuse: 1 };
    const out = checkEndOfGame(beginRound(s));
    expect(out.winner).toBe('MIMIC'); expect(out.winReason).toBe('HULL_BREACH');
  });
});
