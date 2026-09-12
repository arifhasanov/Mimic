import test from 'node:test';
import assert from 'node:assert/strict';
import * as engine from '../packages/engine/dist/index.js';
import * as bots from './balance-bots.mjs';
import { simulate, summarize, wilson } from './balance-sim.mjs';

test('full games replay exactly with independent engine and decision RNG streams', () => {
  assert.deepEqual(simulate(713, 'typical', 'typical', true), simulate(713, 'typical', 'typical', true));
});

test('all behavioral profiles terminate with valid outcomes and scan accounting', () => {
  for (const crew of Object.keys(bots.PROFILES)) for (const mimic of Object.keys(bots.PROFILES)) {
    for (let seed = 1; seed <= 12; seed++) {
      const g = simulate(seed, crew, mimic, true);
      assert(g.endRound <= 10);
      assert.equal(g.scans, g.crewScans + g.mimicScans);
      assert(g.mimicScans <= 3);
      assert.equal(g.winner === 'CREW', g.mimicScans === 3);
      assert(g.rounds.filter(r => r.outcome?.kind === 'SCAN').every(r => r.xray && r.cells >= 5));
    }
  }
});

function initial() {
  const s = engine.createGame('TEST', 1);
  s.players = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `P${i}`, token: `secret${i}`, role: i < 3 ? 'MIMIC' : 'CREW', alive: true, verified: false, room: null, connected: true, isBot: true }));
  s.config = engine.resolveSettings(engine.defaultSettings(), 10);
  s.scrap = 2;
  s.round = 1;
  s.phase = 'TALK';
  return s;
}
test('hidden roles, tokens, RNG seed and submitted actions cannot reach crew decisions', () => {
  const a = initial(), b = structuredClone(a);
  for (const p of b.players) { p.role = p.role === 'MIMIC' ? 'CREW' : 'MIMIC'; p.token = 'changed'; }
  b.seed = 777;
  b.submissions.p0 = { playerId: 'p0', room: 'reactor', focus: 'reactor', action: 'SABO' };
  const publicA = engine.toPublicState(a), publicB = engine.toPublicState(b);
  publicA.serverNow = publicB.serverNow = 0;
  assert.deepEqual(publicA, publicB);
  const planA = bots.allocation(publicA, bots.PROFILES.typical, engine.createRng(42));
  const planB = bots.allocation(publicB, bots.PROFILES.typical, engine.createRng(42));
  assert.deepEqual(planA, planB);
});

test('team planner uses one legal sabotage and scanner roster includes backup repair workers', () => {
  const s = initial();
  s.xrayOnline = true; s.repairProgress = 6; s.scrap = 6; s.powerCells = 10;
  const view = engine.toPublicState(s), rng = engine.createRng(32);
  const plan = bots.allocation(view, bots.PROFILES.typical, rng);
  assert(Object.values(plan).filter(r => r === 'medbay').length >= 2);
  const team = ['p0', 'p1', 'p2'];
  const ms = team.map(id => bots.mind(id, 'MIMIC', team, bots.PROFILES.typical, rng));
  const actions = bots.mimicActions(ms, view, plan, rng);
  assert.equal(Object.values(actions).filter(a => a.action === 'SABO').length, 1);
  for (const [id, action] of Object.entries(actions)) {
    assert(engine.isWellFormedSubmission(action.room, action.focus, action.action));
    if (action.action === 'SABO') assert.notEqual(engine.deriveIntent(s, { playerId: id, ...action }, 'MIMIC').intent, 'WORK');
  }
});

test('production at reactor cap is not treated as evidence against innocent workers', () => {
  const s = initial();
  s.players.forEach(p => { p.role = 'CREW'; s.submissions[p.id] = { playerId: p.id, room: 'reactor', focus: 'reactor', action: 'WORK' }; });
  const before = engine.toPublicState(s);
  const after = engine.toPublicState(engine.resolveRound(s, engine.createRng(1)).state);
  const m = bots.mind('p0', 'CREW', [], bots.PROFILES.typical, engine.createRng(1));
  bots.observe(m, before, after, engine.createRng(1));
  assert.deepEqual(m.suspicion, {});
});

test('Wilson intervals and aggregate win counts', () => {
  assert(Math.abs(wilson(50, 100)[0] - 40.383) < .01);
  assert(wilson(0, 10)[1] > 27);
  assert(wilson(10, 10)[0] < 73);
  const summary = summarize([simulate(10), simulate(11)]);
  assert.equal(summary.crewWins + summary.mimicWins, 2);
});
