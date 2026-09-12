import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import * as engine from '../packages/engine/dist/index.js';
import * as bots from './balance-bots.mjs';

export function simulate(seed, crewProfile = 'typical', mimicProfile = crewProfile, trace = false) {
  // Separate streams: extra bot deliberation cannot change the engine's next random draw.
  const gameRng = engine.createRng(seed);
  const botRng = engine.createRng(seed ^ 0xa511e9b3);
  let s = engine.createGame('SIM', seed);
  s.players = Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, name: `Player ${i + 1}`, token: `sim${i}`, role: 'CREW', alive: true, verified: false, room: null, connected: true, isBot: true }));
  s = engine.startGame(s, gameRng);
  const team = s.players.filter(p => p.role === 'MIMIC').map(p => p.id);
  const minds = s.players.map(p => bots.mind(p.id, p.role, p.role === 'MIMIC' ? team : [], bots.PROFILES[p.role === 'MIMIC' ? mimicProfile : crewProfile], botRng));
  const stats = { seed, crewProfile, mimicProfile, scans: 0, crewScans: 0, mimicScans: 0, ties: 0, skips: 0, firstXray: null, offlineRounds: 0, cellShortRounds: 0, smashes: 0, rounds: [] };
  while (!s.winner) {
    assert(s.round < s.config.rounds, 'Game exceeded round limit');
    s = engine.beginRound(s);
    if (s.winner) break;
    const active = minds.filter(m => s.players.find(p => p.id === m.id).alive);
    s.phase = 'TALK';
    const before = engine.toPublicState(s);
    const plan = bots.allocation(before, bots.PROFILES[crewProfile], botRng);
    const mimics = active.filter(m => m.role === 'MIMIC');
    const sabotage = bots.mimicActions(mimics, before, plan, botRng);
    s.phase = 'ACT';
    for (const m of active) {
      const action = m.role === 'CREW' ? bots.crewAction(m, before, plan, botRng) : sabotage[m.id];
      assert(engine.isWellFormedSubmission(action.room, action.focus, action.action));
      s.submissions[m.id] = { playerId: m.id, ...action };
    }
    s = engine.resolveRound(s, gameRng).state;
    const after = engine.toPublicState(s);
    for (const m of active) bots.observe(m, before, after, botRng);
    const record = { round: s.round, xray: s.xrayOnline, progress: s.repairProgress, cells: s.powerCells, scrap: s.scrap, outcome: null };
    if (s.xrayOnline && stats.firstXray === null) stats.firstXray = s.round;
    stats.smashes += Number(s.lastReport.rooms.some(r => r.summary.includes('smashed')));
    if (!s.xrayOnline) stats.offlineRounds++;
    else if (s.powerCells < s.config.scanCostCells) stats.cellShortRounds++;
    if (engine.shouldVote(s)) {
      s = engine.startVote(s);
      let voteView = engine.toPublicState(s);
      const proposals = bots.discuss(active, voteView, botRng);
      for (let stage = 0; stage < 2; stage++) {
        // Freeze the public view for simultaneous ballots (no reading earlier submissions).
        voteView = engine.toPublicState(s);
        for (const id of s.vote.voters) {
          const m = minds.find(m => m.id === id);
          const choice = bots.ballot(m, voteView, proposals, botRng);
          const result = engine.castBallot(s, id, choice);
          assert(result.ok, result.error);
          s = result.state;
        }
        const result = engine.resolveVote(s);
        s = result.state;
        for (const m of active) m.skipped = s.skipsUsed.includes(m.id);
        if (result.outcome.kind === 'RUNOFF') {
          assert.equal(stage, 0);
          s = engine.startVote(s, 'RUNOFF', result.outcome.candidates);
          continue;
        }
        record.outcome = result.outcome;
        if (result.outcome.kind === 'SCAN') {
          stats.scans++;
          stats[result.outcome.role === 'CREW' ? 'crewScans' : 'mimicScans']++;
        } else if (result.outcome.kind === 'TIE') stats.ties++;
        else if (result.outcome.kind === 'SKIP') stats.skips++;
        for (const m of active) bots.observeVote(m, engine.toPublicState(s));
        break;
      }
    }
    if (trace) stats.rounds.push(record);
    s = engine.checkEndOfGame(s);
  }
  return { ...stats, winner: s.winner, reason: s.winReason, endRound: s.round };
}

export function wilson(wins, n) {
  const z = 1.959963984540054, p = wins / n, d = 1 + z * z / n;
  const center = (p + z * z / (2 * n)) / d;
  const half = z * Math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / d;
  return [(center - half) * 100, (center + half) * 100];
}
export function summarize(games) {
  const wins = games.filter(g => g.winner === 'CREW').length;
  const mean = key => games.reduce((sum, g) => sum + g[key], 0) / games.length;
  const online = games.filter(g => g.firstXray !== null);
  return { games: games.length, crewWins: wins, mimicWins: games.length - wins, crewPercent: wins / games.length * 100, ci95: wilson(wins, games.length),
    reasons: Object.fromEntries([...new Set(games.map(g => g.reason))].map(r => [r, games.filter(g => g.reason === r).length])),
    meanScans: mean('scans'), meanCrewScans: mean('crewScans'), meanMimicScans: mean('mimicScans'), meanTies: mean('ties'), meanSkips: mean('skips'),
    meanOfflineRounds: mean('offlineRounds'), meanCellShortRounds: mean('cellShortRounds'), meanSmashes: mean('smashes'),
    xrayEverPercent: online.length / games.length * 100, meanFirstXray: online.length ? online.reduce((sum, g) => sum + g.firstXray, 0) / online.length : null };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const seed = Number(process.argv[2] ?? 20260912);
  assert(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff, 'Seed must be uint32');
  const sizes = [10, 20, 50, 100, 1000];
  const scenarios = [['typical', 'typical'], ['casual', 'casual'], ['coordinated', 'coordinated'], ['casual', 'coordinated'], ['coordinated', 'casual']];
  const results = { seed, sampling: 'Independent batches; unique game seeds across all batches and scenarios', config: engine.resolveSettings(engine.defaultSettings(), 10), batches: [], sensitivity: [] };
  const records = [];
  let index = 0;
  const run = (n, crew, mimic) => {
    const games = Array.from({ length: n }, () => simulate((seed + Math.imul(++index, 0x9e3779b9)) >>> 0, crew, mimic));
    records.push(...games);
    return { crewProfile: crew, mimicProfile: mimic, ...summarize(games) };
  };
  for (const n of sizes) {
    const result = run(n, 'typical', 'typical');
    results.batches.push(result);
    console.log(JSON.stringify(result));
  }
  // Primary 1000-game batch doubles as the typical sensitivity scenario.
  results.sensitivity.push(results.batches.at(-1));
  for (const [crew, mimic] of scenarios.slice(1)) {
    const result = run(1000, crew, mimic);
    results.sensitivity.push(result);
    console.log(JSON.stringify(result));
  }
  results.totalGames = records.length;
  mkdirSync(new URL('./results/', import.meta.url), { recursive: true });
  writeFileSync(new URL('./results/balanced-10-results.json', import.meta.url), JSON.stringify(results, null, 2) + '\n');
  writeFileSync(new URL('./results/balanced-10-games.jsonl', import.meta.url), records.map(g => JSON.stringify(g)).join('\n') + '\n');
}
